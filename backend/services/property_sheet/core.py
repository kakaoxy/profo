"""房源单（多房源分享）服务层.

职责：房源单创建/列表/软删归档、详情（实时过滤未发布/在途）、短码解析归因、
小程序码生成、分享人联系卡、visit/share 埋点与「我的分享统计」.
"""

import base64
import secrets

from sqlalchemy import desc, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import Lead, User
from models.marketing.l4_marketing import L4MarketingProject, MarketingProjectStatus, PublishStatus
from models.marketing.property_sheet import (
    PropertyShareSheet,
    PropertyShareSheetItem,
    PropertySheetShareEvent,
    PropertySheetVisit,
)
from schemas.public import PublicConsultantContact
from schemas.public.property_sheet import (
    PropertySheetCreateRequest,
    PropertySheetItemResponse,
    PropertySheetMineItemResponse,
    PropertySheetQRCodeResponse,
    PropertySheetQRSceneResponse,
    PropertySheetResponse,
    PropertySheetShareEventRequest,
    PropertySheetVisitEventRequest,
)
from services.marketing.public import PublicProjectService
from services.system.exceptions import ResourceNotFoundError, ValidationError
from services.system.wechat import WeChatAuthService
from settings import settings
from utils.time_windows import yesterday_window

_MAX_RETRY = 5
_CODE_LENGTH = 8
_QR_PAGE = "pages/property-sheet/landing/index"
_SHEET_STATUS_ACTIVE = "active"
_SHEET_STATUS_ARCHIVED = "archived"


class PropertySheetService:
    """房源单（多房源分享）服务."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def create_property_sheet(self, employee_id: str, data: PropertySheetCreateRequest) -> PropertyShareSheet:
        """创建房源单（主表 + 明细，短码冲突换码重试）.

        Args:
            employee_id: 创建员工ID
            data: 房源ID列表（1~10 个，服务端去重保序）

        Returns:
            已落库的房源单主表记录（status=active）

        Raises:
            ValidationError: 去重后列表为空 / 任一房源不存在、未发布或非在售 / 短码冲突重试耗尽

        """
        ordered_ids = self._dedup_project_ids(data.project_ids)
        self._validate_projects_for_sheet(ordered_ids)

        # 短码预检查与插入非原子：随机撞码靠 code 唯一索引兜底，
        # 捕获 IntegrityError 后回滚换码重试（房源单无自然键，不存在并发复用场景）。
        # 校验在循环外仅执行一次（只读操作无需回滚）；主表+明细写入整体纳入 try，
        # 确保任一阶段完整性冲突都回滚换码重试，会话不留失败事务状态
        for _attempt in range(_MAX_RETRY):
            code = self._generate_unique_code()
            sheet = PropertyShareSheet(employee_id=employee_id, code=code, status=_SHEET_STATUS_ACTIVE)
            self.db.add(sheet)
            try:
                self.db.flush()
                self.db.add_all(
                    PropertyShareSheetItem(sheet_id=sheet.id, marketing_project_id=pid, sort_order=sort_order)
                    for sort_order, pid in enumerate(ordered_ids)
                )
                self.db.commit()
            except IntegrityError:
                self.db.rollback()
                continue
            self.db.refresh(sheet)
            return sheet
        msg = "短码冲突，请重试"
        raise ValidationError(msg)

    def list_my_sheets(self, employee_id: str) -> list[PropertySheetMineItemResponse]:
        """当前员工的未删除房源单列表（创建时间倒序，item_count 一次聚合查询避免 N+1）."""
        item_count_sq = (
            self.db.query(
                PropertyShareSheetItem.sheet_id.label("sheet_id"),
                func.count(PropertyShareSheetItem.id).label("item_count"),
            )
            .group_by(PropertyShareSheetItem.sheet_id)
            .subquery()
        )
        rows = (
            self.db.query(PropertyShareSheet, func.coalesce(item_count_sq.c.item_count, 0))
            .outerjoin(item_count_sq, item_count_sq.c.sheet_id == PropertyShareSheet.id)
            .filter(
                PropertyShareSheet.employee_id == employee_id,
                PropertyShareSheet.status == _SHEET_STATUS_ACTIVE,
            )
            .order_by(desc(PropertyShareSheet.created_at), desc(PropertyShareSheet.id))
            .all()
        )
        return [
            PropertySheetMineItemResponse(
                id=sheet.id,
                code=sheet.code,
                item_count=int(item_count),
                created_at=sheet.created_at,
            )
            for sheet, item_count in rows
        ]

    def delete_sheet(self, employee_id: str, sheet_id: int) -> None:
        """软删房源单（status 置 archived，不物理删除主表与明细）.

        Raises:
            ResourceNotFoundError: 房源单不存在、已删除或不归属当前员工

        """
        sheet = self._get_active_sheet_owned(employee_id, sheet_id)
        # updated_at 由模型 onupdate 自动维护
        sheet.status = _SHEET_STATUS_ARCHIVED
        self.db.commit()

    def get_sheet_detail(self, sheet_id: int) -> PropertySheetResponse:
        """房源单详情（免登录，仅 active；明细实时过滤未发布/在途房源）.

        房源一次性 in_ 批量查询（禁 N+1），封面复用 PublicProjectService 批量解析.

        Raises:
            ResourceNotFoundError: 房源单不存在或已删除

        """
        sheet = self._get_active_sheet(sheet_id)
        items = (
            self.db.query(PropertyShareSheetItem)
            .filter(PropertyShareSheetItem.sheet_id == sheet.id)
            .order_by(PropertyShareSheetItem.sort_order.asc(), PropertyShareSheetItem.id.asc())
            .all()
        )
        projects = (
            self.db.query(L4MarketingProject)
            .filter(L4MarketingProject.id.in_([item.marketing_project_id for item in items]))
            .all()
        )
        project_map = {project.id: project for project in projects}
        cover_map = PublicProjectService(self.db).resolve_cover_images_batch(list(project_map.values()))

        rows: list[PropertySheetItemResponse] = []
        for item in items:
            project = project_map.get(item.marketing_project_id)
            # C 端读口径：仅展示已发布且非在途（在售/已售）的房源，缺失/未发布/在途/已删除均隐藏
            if project is None or project.is_deleted:
                continue
            if project.publish_status != PublishStatus.PUBLISHED.value:
                continue
            if project.project_status == MarketingProjectStatus.IN_PROGRESS.value:
                continue
            cover_image, cover_thumbnail_url = cover_map.get(project.id, (None, None))
            rows.append(
                PropertySheetItemResponse(
                    marketing_project_id=item.marketing_project_id,
                    sort_order=item.sort_order,
                    display_status=project.project_status.value,
                    title=project.title,
                    community_name=project.community_name,
                    cover_image=cover_image,
                    cover_thumbnail_url=cover_thumbnail_url,
                    layout=project.layout,
                    orientation=project.orientation,
                    floor_info=project.floor_info,
                    area=float(project.area),
                    total_price=float(project.total_price),
                    unit_price=float(project.unit_price),
                    tags=project.tags or [],
                )
            )
        return PropertySheetResponse(id=sheet.id, code=sheet.code, created_at=sheet.created_at, items=rows)

    def resolve_code(self, code: str) -> PropertySheetQRSceneResponse:
        """解析短码获取房源单ID与来源员工ID（免登录扫码入口）.

        员工有效性口径同 ``_resolve_referrer_id``：active 且有后台身份，无效时
        referrer 置 None，房源单内容仍可访问（归因自然落空为游客）.

        Raises:
            ResourceNotFoundError: 短码不存在（不回显存在性细节）
            ValidationError: 房源单已失效（已归档）

        """
        sheet = self.db.query(PropertyShareSheet).filter(PropertyShareSheet.code == code).first()
        if sheet is None:
            msg = "房源单不存在"
            raise ResourceNotFoundError(msg)
        if sheet.status == _SHEET_STATUS_ARCHIVED:
            msg = "房源单已失效"
            raise ValidationError(msg)
        sharer = self._resolve_valid_referrer(sheet.employee_id)
        return PropertySheetQRSceneResponse(
            sheet_id=sheet.id,
            referrer=sharer.id if sharer is not None else None,
        )

    def generate_qrcode(self, employee_id: str, sheet_id: int) -> PropertySheetQRCodeResponse:
        """生成房源单小程序码（复用主表短码，实时调微信不做缓存）.

        Raises:
            ResourceNotFoundError: 房源单不存在、已删除或不归属当前员工
            ValidationError: 微信接口失败

        """
        sheet = self._get_active_sheet_owned(employee_id, sheet_id)
        image_bytes = WeChatAuthService.fetch_miniapp_unlimited_qrcode(f"code={sheet.code}", _QR_PAGE)
        return PropertySheetQRCodeResponse(
            code=sheet.code,
            image_base64=base64.b64encode(image_bytes).decode("utf-8"),
        )

    def get_consultant_contact(self, sheet_id: int, referrer: str | None) -> PublicConsultantContact:
        """分享人联系卡：referrer 为有效内部员工时返回其联系方式，否则回退默认顾问.

        与单房源 consultant 语义同构（referrer 分支与默认顾问分支一致，
        微信号复用手机号）；房源单无房源顾问上下文，故默认分支直接回退
        settings.default_consultant_*.

        Raises:
            ResourceNotFoundError: 房源单不存在或已删除

        """
        self._get_active_sheet(sheet_id)
        sharer = self._resolve_valid_referrer(referrer) if referrer else None
        # 与单房源 contact 口径一致（get_internal_contact_user）：分享人须有手机号，
        # 否则回退默认顾问，避免返回无联系方式（电话/微信按钮全隐藏）的「分享人」卡
        if sharer is not None and sharer.phone:
            # 与单房源分享人分支一致：未单独配置微信号，微信复用其手机号
            phone = sharer.phone
            return PublicConsultantContact(
                phone=phone,
                wechat_number=phone,
                nickname=sharer.nickname or "",
                avatar=sharer.avatar,
                is_referrer=True,
            )
        return PublicConsultantContact(
            phone=settings.default_consultant_phone,
            wechat_number=settings.default_consultant_wechat,
            nickname=settings.default_consultant_nickname,
            avatar=None,
            is_referrer=False,
        )

    def create_visit_event(self, sheet_id: int, data: PropertySheetVisitEventRequest) -> PropertySheetVisit:
        """记录房源单落地页访问埋点（referrer 原样落库，与单房源 visit 口径一致）.

        Raises:
            ResourceNotFoundError: 房源单不存在或已删除

        """
        sheet = self._get_active_sheet(sheet_id)
        visit = PropertySheetVisit(
            sheet_id=sheet.id,
            visitor_id=data.visitor_id,
            referrer_employee_id=data.referrer,
            source=data.source,
        )
        self.db.add(visit)
        self.db.commit()
        self.db.refresh(visit)
        return visit

    def create_share_event(
        self,
        user: User,
        sheet_id: int,
        data: PropertySheetShareEventRequest,
    ) -> PropertySheetShareEvent:
        """记录房源单分享事件（employee_id 服务端取当前登录用户，禁止前端传入）.

        Raises:
            ResourceNotFoundError: 房源单不存在或已删除

        """
        sheet = self._get_active_sheet(sheet_id)
        event = PropertySheetShareEvent(
            sheet_id=sheet.id,
            employee_id=user.id,
            share_type=data.share_type,
        )
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event

    def get_my_share_stats(self, user: User) -> dict[str, int]:
        """C 端「我的房源单分享统计」：分享次数 / PV / UV / 留资（昨日 + 累计）.

        与房源/评估 share-stats 完全同构：share_count 按
        ``PropertySheetShareEvent.employee_id``、pv/uv 按
        ``PropertySheetVisit.referrer_employee_id``（uv 为 distinct visitor_id）、
        lead_count 按 ``Lead.referrer_id``（仅分享归因线索口径）；昨日窗口为
        Asia/Shanghai 自然日（见 ``utils.time_windows.yesterday_window``）.
        """
        y_start, y_end = yesterday_window()
        share_q = self.db.query(PropertySheetShareEvent).filter(PropertySheetShareEvent.employee_id == user.id)
        visit_q = self.db.query(PropertySheetVisit).filter(PropertySheetVisit.referrer_employee_id == user.id)
        # 昨日窗口条件（不可变条件对象，pv/uv 两处复用）
        y_visit_window = [PropertySheetVisit.created_at >= y_start, PropertySheetVisit.created_at < y_end]
        uv_q = self.db.query(func.count(func.distinct(PropertySheetVisit.visitor_id))).filter(
            PropertySheetVisit.referrer_employee_id == user.id
        )
        lead_q = self.db.query(func.count(Lead.id)).filter(Lead.referrer_id == user.id)

        return {
            "share_count": int(share_q.count()),
            "pv": int(visit_q.count()),
            "uv": int(uv_q.scalar() or 0),
            "lead_count": int(lead_q.scalar() or 0),
            "yesterday_share_count": int(
                share_q.filter(
                    PropertySheetShareEvent.created_at >= y_start, PropertySheetShareEvent.created_at < y_end
                ).count()
            ),
            "yesterday_pv": int(visit_q.filter(*y_visit_window).count()),
            "yesterday_uv": int(uv_q.filter(*y_visit_window).scalar() or 0),
            "yesterday_lead_count": int(
                lead_q.filter(Lead.created_at >= y_start, Lead.created_at < y_end).scalar() or 0
            ),
        }

    @staticmethod
    def _dedup_project_ids(project_ids: list[int]) -> list[int]:
        """房源ID去重保序，去重后为空则拒绝（Pydantic 已限 1~10，去重可能清空）.

        Raises:
            ValidationError: 去重后列表为空

        """
        seen: set[int] = set()
        ordered_ids: list[int] = []
        for pid in project_ids:
            if pid not in seen:
                seen.add(pid)
                ordered_ids.append(pid)
        if not ordered_ids:
            msg = "请至少选择 1 套房源"
            raise ValidationError(msg)
        return ordered_ids

    def _validate_projects_for_sheet(self, ordered_ids: list[int]) -> None:
        """逐套校验房源可加入房源单（一次性 in_ 批量查询，任一不满足即整体失败）.

        Raises:
            ValidationError: 房源不存在/已删除、未发布或非在售

        """
        projects = self.db.query(L4MarketingProject).filter(L4MarketingProject.id.in_(ordered_ids)).all()
        project_map = {project.id: project for project in projects}
        for pid in ordered_ids:
            project = project_map.get(pid)
            if project is None or project.is_deleted:
                msg = f"房源不存在或已删除: ID {pid}"
                raise ValidationError(msg)
            if project.publish_status != PublishStatus.PUBLISHED.value:
                msg = f"房源未发布，无法加入房源单: {project.title}"
                raise ValidationError(msg)
            if project.project_status != MarketingProjectStatus.FOR_SALE.value:
                msg = f"房源非在售状态，无法加入房源单: {project.title}"
                raise ValidationError(msg)

    def _generate_unique_code(self) -> str:
        """生成 8 位安全随机短码（冲突重试，同 recruit qrcode）.

        Raises:
            ValidationError: 重试耗尽仍冲突

        """
        for _attempt in range(_MAX_RETRY):
            code = secrets.token_hex(_CODE_LENGTH // 2)[:_CODE_LENGTH]
            exists = self.db.query(PropertyShareSheet.id).filter(PropertyShareSheet.code == code).first() is not None
            if not exists:
                return code
        msg = "短码冲突，请重试"
        raise ValidationError(msg)

    def _get_active_sheet(self, sheet_id: int) -> PropertyShareSheet:
        """获取有效房源单（status=active），否则 404（免登录端点共用）.

        Raises:
            ResourceNotFoundError: 房源单不存在或已删除

        """
        sheet = self.db.query(PropertyShareSheet).filter(PropertyShareSheet.id == sheet_id).first()
        if sheet is None or sheet.status != _SHEET_STATUS_ACTIVE:
            msg = "房源单不存在或已删除"
            raise ResourceNotFoundError(msg)
        return sheet

    def _get_active_sheet_owned(self, employee_id: str, sheet_id: int) -> PropertyShareSheet:
        """获取归属当前员工的有效房源单（员工端写操作共用）.

        Raises:
            ResourceNotFoundError: 房源单不存在、已删除或不归属当前员工

        """
        sheet = (
            self.db.query(PropertyShareSheet)
            .filter(
                PropertyShareSheet.id == sheet_id,
                PropertyShareSheet.employee_id == employee_id,
                PropertyShareSheet.status == _SHEET_STATUS_ACTIVE,
            )
            .first()
        )
        if sheet is None:
            msg = "房源单不存在或已删除"
            raise ResourceNotFoundError(msg)
        return sheet

    def _resolve_valid_referrer(self, employee_id: str) -> User | None:
        """校验员工有效性（口径同 leads/core._resolve_referrer_id）：active 且有后台身份.

        Returns:
            有效的员工 User；不存在/非 active/无后台身份时返回 None

        """
        user = self.db.query(User).filter(User.id == employee_id, User.status == "active").first()
        if user is None:
            return None
        # 方法内 import 避免与 services.system.auth 的潜在循环依赖
        from services.system.auth import AuthService

        if not AuthService.has_backend_identity(user):
            return None
        return user
