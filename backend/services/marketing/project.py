"""L4 市场营销层项目服务.

职责: 营销项目管理.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import and_, case, desc, func
from sqlalchemy.orm import Query, Session
from sqlalchemy.orm.attributes import flag_modified

from models import L4MarketingMedia, L4MarketingNotifyLog, L4MarketingPriceChange, L4MarketingProject
from models.marketing.l4_marketing import MarketingProjectStatus, PublishStatus
from schemas.l4_marketing import (
    L4MarketingPriceChangeTimelineItem,
    L4MarketingProjectCreate,
    L4MarketingProjectSummary,
    L4MarketingProjectUpdate,
)
from services.marketing.constants import BADGE_WINDOW_DAYS
from services.marketing.notify import PriceSignal, ProjectChangeSignal


class MarketingProjectService:
    """L4 营销项目服务."""

    def __init__(self, db: Session) -> None:
        """初始化项目服务.

        Args:
            db: SQLAlchemy数据库会话

        """
        self.db: Session = db

    def _build_base_query(
        self,
        publish_status: PublishStatus | None = None,
        project_status: MarketingProjectStatus | None = None,
        consultant_id: str | None = None,
        community_id: str | None = None,
        is_new_listing: bool | None = None,
        has_price_change: bool | None = None,
    ) -> Query:
        """构建基础查询 - 抽离复用的筛选逻辑.

        Args:
            publish_status: 发布状态筛选
            project_status: 项目状态筛选
            consultant_id: 顾问ID筛选
            community_id: 小区ID筛选
            is_new_listing: 仅新上房源（首次发布 ≤ BADGE_WINDOW_DAYS 天；
                published_at NULL 一律排除，存量行不误判）
            has_price_change: 仅近期调价房源（≤ BADGE_WINDOW_DAYS 天内有调价记录，
                EXISTS 走 (marketing_project_id, created_at) 索引）

        Returns:
            基础查询对象

        """
        query = self.db.query(L4MarketingProject).filter(
            L4MarketingProject.is_deleted.is_(False),
        )

        if publish_status is not None:
            query = query.filter(L4MarketingProject.publish_status == publish_status.value)

        if project_status is not None:
            query = query.filter(L4MarketingProject.project_status == project_status.value)

        if consultant_id is not None:
            query = query.filter(L4MarketingProject.consultant_id == consultant_id)

        if community_id is not None:
            query = query.filter(L4MarketingProject.community_id == community_id)

        # 新上/近期调价筛选窗口与 C 端徽标同源（constants.BADGE_WINDOW_DAYS）
        if is_new_listing is True:
            window_start = datetime.now(timezone.utc) - timedelta(days=BADGE_WINDOW_DAYS)
            query = query.filter(
                L4MarketingProject.published_at.isnot(None),
                L4MarketingProject.published_at >= window_start,
            )

        if has_price_change is True:
            window_start = datetime.now(timezone.utc) - timedelta(days=BADGE_WINDOW_DAYS)
            recent_change = (
                self.db.query(L4MarketingPriceChange.id)
                .filter(
                    L4MarketingPriceChange.marketing_project_id == L4MarketingProject.id,
                    L4MarketingPriceChange.created_at >= window_start,
                )
                .exists()
            )
            query = query.filter(recent_change)

        return query

    def get_projects(
        self,
        skip: int = 0,
        limit: int = 20,
        publish_status: PublishStatus | None = None,
        project_status: MarketingProjectStatus | None = None,
        consultant_id: str | None = None,
        community_id: str | None = None,
        is_new_listing: bool | None = None,
        has_price_change: bool | None = None,
    ) -> tuple[list[L4MarketingProject], int]:
        """获取营销项目列表.

        Args:
            skip: 跳过记录数
            limit: 返回记录数
            publish_status: 发布状态筛选
            project_status: 项目状态筛选
            consultant_id: 顾问ID筛选
            community_id: 小区ID筛选
            is_new_listing: 仅新上房源（首次发布 ≤ 7 天）
            has_price_change: 仅近期调价房源（≤ 7 天内有调价记录）

        Returns:
            (项目列表, 总记录数)

        """
        query = self._build_base_query(
            publish_status=publish_status,
            project_status=project_status,
            consultant_id=consultant_id,
            community_id=community_id,
            is_new_listing=is_new_listing,
            has_price_change=has_price_change,
        )

        total: int = query.count()

        # 状态分组优先：在售 → 装修中(在途) → 过往案例(已售)；组内权重降序、同权重创建时间倒序（与 C 端一致）
        status_priority = case(
            (L4MarketingProject.project_status == MarketingProjectStatus.FOR_SALE.value, 0),
            (L4MarketingProject.project_status == MarketingProjectStatus.IN_PROGRESS.value, 1),
            (L4MarketingProject.project_status == MarketingProjectStatus.SOLD.value, 2),
            else_=3,
        )
        items: list[L4MarketingProject] = (
            query.order_by(
                status_priority,
                desc(L4MarketingProject.sort_order),
                desc(L4MarketingProject.created_at),
            )
            .offset(skip)
            .limit(limit)
            .all()
        )

        return items, total

    def get_projects_summary(
        self,
        publish_status: PublishStatus | None = None,
        project_status: MarketingProjectStatus | None = None,
        consultant_id: str | None = None,
        community_id: str | None = None,
        is_new_listing: bool | None = None,
        has_price_change: bool | None = None,
    ) -> L4MarketingProjectSummary:
        """获取营销项目摘要统计 - 基于筛选条件的全量统计，不受分页影响.

        Args:
            publish_status: 发布状态筛选
            project_status: 项目状态筛选
            consultant_id: 顾问ID筛选
            community_id: 小区ID筛选
            is_new_listing: 仅新上房源（首次发布 ≤ 7 天）
            has_price_change: 仅近期调价房源（≤ 7 天内有调价记录）

        Returns:
            摘要统计对象

        """
        query = self._build_base_query(
            publish_status=publish_status,
            project_status=project_status,
            consultant_id=consultant_id,
            community_id=community_id,
            is_new_listing=is_new_listing,
            has_price_change=has_price_change,
        )

        total: int = query.count()

        # 仅在未指定发布状态筛选时，分别统计各发布状态数量
        if publish_status is None:
            published: int = query.filter(
                L4MarketingProject.publish_status == PublishStatus.PUBLISHED.value,
            ).count()
            draft: int = query.filter(
                L4MarketingProject.publish_status == PublishStatus.DRAFT.value,
            ).count()
        else:
            published = total if publish_status == PublishStatus.PUBLISHED else 0
            draft = total if publish_status == PublishStatus.DRAFT else 0

        # 仅在未指定项目状态筛选时，分别统计各项目状态数量
        if project_status is None:
            for_sale: int = query.filter(
                L4MarketingProject.project_status == MarketingProjectStatus.FOR_SALE.value,
            ).count()
            sold: int = query.filter(
                L4MarketingProject.project_status == MarketingProjectStatus.SOLD.value,
            ).count()
            in_progress: int = query.filter(
                L4MarketingProject.project_status == MarketingProjectStatus.IN_PROGRESS.value,
            ).count()
        else:
            for_sale = total if project_status == MarketingProjectStatus.FOR_SALE else 0
            sold = total if project_status == MarketingProjectStatus.SOLD else 0
            in_progress = total if project_status == MarketingProjectStatus.IN_PROGRESS else 0

        return L4MarketingProjectSummary(
            total=total,
            published=published,
            draft=draft,
            for_sale=for_sale,
            sold=sold,
            in_progress=in_progress,
        )

    def get_price_change_timeline(
        self,
        project_id: int,
    ) -> tuple[list[L4MarketingPriceChangeTimelineItem], int]:
        """获取房源调价历史时间线（倒序，含分次送达统计）.

        两次查询无 N+1：price_changes 按时间倒序 + notify_logs 按
        price_change_id in_ 分组 count（send_status 三态分别计数，
        skipped/failed 与 success 独立，旧留痕 price_change_id 为 NULL 天然不参与）。

        Args:
            project_id: 营销项目ID

        Returns:
            (时间线条目列表(倒序), 调价记录总数)

        """
        changes: list[L4MarketingPriceChange] = (
            self.db.query(L4MarketingPriceChange)
            .filter(L4MarketingPriceChange.marketing_project_id == project_id)
            .order_by(desc(L4MarketingPriceChange.created_at))
            .all()
        )
        if not changes:
            return [], 0

        change_ids = [change.id for change in changes]
        rows = (
            self.db.query(
                L4MarketingNotifyLog.price_change_id,
                L4MarketingNotifyLog.send_status,
                func.count(L4MarketingNotifyLog.id),
            )
            .filter(
                L4MarketingNotifyLog.notify_type == "price_change",
                L4MarketingNotifyLog.price_change_id.in_(change_ids),
            )
            .group_by(L4MarketingNotifyLog.price_change_id, L4MarketingNotifyLog.send_status)
            .all()
        )
        # {(price_change_id): {status: count}} —— send_status 三态分别计数
        count_map: dict[int, dict[str, int]] = {}
        for price_change_id, send_status, cnt in rows:
            count_map.setdefault(price_change_id, {})[send_status] = int(cnt)

        items = [
            L4MarketingPriceChangeTimelineItem(
                id=change.id,
                old_price=float(change.old_price),
                new_price=float(change.new_price),
                direction=change.direction,
                changed_at=change.created_at,
                notify_success=count_map.get(change.id, {}).get("success", 0),
                notify_skipped=count_map.get(change.id, {}).get("skipped", 0),
                notify_failed=count_map.get(change.id, {}).get("failed", 0),
            )
            for change in changes
        ]
        return items, len(items)

    def get_project(self, project_id: int) -> L4MarketingProject | None:
        """获取单个营销项目详情.

        Args:
            project_id: 营销项目ID

        Returns:
            营销项目对象或None

        """
        return (
            self.db.query(L4MarketingProject)
            .filter(
                and_(
                    L4MarketingProject.id == project_id,
                    L4MarketingProject.is_deleted.is_(False),
                ),
            )
            .first()
        )

    def create_project(
        self,
        data: L4MarketingProjectCreate,
    ) -> tuple[L4MarketingProject, bool]:
        """创建独立营销项目.

        项目和媒体文件在同一个事务中创建，确保数据一致性。
        创建即发布视为「上新」：首次写入 published_at，并返回 is_new_listing=True
        供路由层触发上新订阅消息通知（通知本身不阻塞本事务）。

        Args:
            data: 创建数据，可包含媒体文件列表

        Returns:
            (创建的营销项目, is_new_listing)：is_new_listing=True 表示本次创建即发布（上新）

        """
        media_files = data.media_files

        project_data = data.model_dump(exclude={"media_files"})
        db_obj = L4MarketingProject(**project_data)
        # 创建即发布 = 上新：published_at 仅首次发布写入（防重复「上新」的事实源）
        is_new_listing = db_obj.publish_status == PublishStatus.PUBLISHED
        if is_new_listing and db_obj.published_at is None:
            db_obj.published_at = datetime.now(timezone.utc)
        self.db.add(db_obj)

        # 先 flush 获取项目ID，再创建媒体记录
        self.db.flush()

        if media_files:
            for idx, media_data in enumerate(media_files):
                media_obj = L4MarketingMedia(
                    marketing_project_id=db_obj.id,
                    file_url=media_data.file_url,
                    thumbnail_url=media_data.thumbnail_url,
                    media_type=media_data.media_type,
                    photo_category=media_data.photo_category,
                    renovation_stage=media_data.renovation_stage,
                    description=media_data.description,
                    sort_order=media_data.sort_order if media_data.sort_order is not None else idx,
                    origin_media_id=media_data.origin_media_id,
                )
                self.db.add(media_obj)

        self.db.commit()
        self.db.refresh(db_obj)
        return db_obj, is_new_listing

    def update_project(
        self,
        project_id: int,
        data: L4MarketingProjectUpdate,
    ) -> tuple[L4MarketingProject, ProjectChangeSignal] | None:
        """更新营销项目.

        同步检出两类变更信号供路由层后台触发订阅消息通知（通知本身不阻塞本事务）：
        - 首次发布（草稿 → 发布且 published_at 为空）：写入 published_at，
          信号 is_new_listing=True（上新）
        - 已发布房源 total_price 变更：写 l4_marketing_price_changes 调价历史，
          信号 price_signal（调价）

        Args:
            project_id: 营销项目ID
            data: 更新数据

        Returns:
            (更新后的营销项目, 变更信号)；项目不存在返回 None

        """
        db_obj = self.get_project(project_id)
        if not db_obj:
            return None

        update_data = data.model_dump(exclude_unset=True)
        allowed_fields = {
            "community_id",
            "community_name",
            "layout",
            "orientation",
            "floor_info",
            "area",
            "total_price",
            "title",
            "images",
            "sort_order",
            "tags",
            "decoration_style",
            "stage_completed_dates",
            "publish_status",
            "project_status",
            "project_id",
            "consultant_id",
        }
        # unit_price 由 area 和 total_price 自动计算，不允许直接修改

        # 变更前快照（用于调价检测与首次发布判定）
        old_total_price: Decimal | None = db_obj.total_price
        old_publish_status = db_obj.publish_status

        for field, value in update_data.items():
            if field in allowed_fields:
                setattr(db_obj, field, value)
                # JSON 字段需 flag_modified 确保 SQLAlchemy 检测到变更（含空 dict/None）
                if field == "stage_completed_dates":
                    flag_modified(db_obj, "stage_completed_dates")

        # 首次发布：published_at 仅首次写入（防重复「上新」），并产出上新信号
        is_new_listing = False
        if (
            old_publish_status == PublishStatus.DRAFT
            and db_obj.publish_status == PublishStatus.PUBLISHED
            and db_obj.published_at is None
        ):
            db_obj.published_at = datetime.now(timezone.utc)
            is_new_listing = True

        # 已发布房源调价：写调价历史并返回信号（同值变更不触发）
        price_signal: PriceSignal | None = None
        if (
            db_obj.publish_status == PublishStatus.PUBLISHED
            and old_total_price is not None
            and db_obj.total_price != old_total_price
        ):
            direction = "down" if db_obj.total_price < old_total_price else "up"
            change = L4MarketingPriceChange(
                marketing_project_id=db_obj.id,
                old_price=old_total_price,
                new_price=db_obj.total_price,
                direction=direction,
            )
            self.db.add(change)
            # flush 拿到调价记录主键（通知留痕透传，时间线按其分组）
            self.db.flush()
            price_signal = PriceSignal(
                old_price=float(old_total_price),
                new_price=float(db_obj.total_price),
                price_change_id=change.id,
            )

        self.db.commit()
        self.db.refresh(db_obj)
        return db_obj, ProjectChangeSignal(is_new_listing=is_new_listing, price_signal=price_signal)

    def delete_project(self, project_id: int) -> bool:
        """逻辑删除营销项目.

        Args:
            project_id: 营销项目ID

        Returns:
            是否删除成功

        """
        db_obj = self.get_project(project_id)
        if not db_obj:
            return False

        db_obj.is_deleted = True
        self.db.commit()
        return True


# 向后兼容的别名
L4MarketingProjectService = MarketingProjectService
