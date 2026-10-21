"""项目核心业务服务.

负责：项目创建、列表查询、基础信息更新、状态流转.

注意：此服务已适配新的规范化表结构。
项目基础信息在 projects 表，签约/业主/销售等信息在关联的子表中。

注：含项目本体审计插桩后约 540 行，略超 500 行约束；插桩与快照 helper 强耦合
Facade 内 commit 时机（主操作 commit 后写日志），拆分会割裂调用链，故不拆。
"""

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, ClassVar

from fastapi import Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from models import FinanceRecord, Project, ProjectContract, ProjectRenovation
from models.common import BusinessForm, ProjectStatus
from schemas.project import ProjectCreate, ProjectResponse, ProjectStatusUpdate, ProjectUpdate
from services.projects.archive import ensure_project_writable
from services.property.dict_ownership import validate_dict_ownership
from services.property.dict_submit_service import submit_dict_chain
from services.system.operation_log import operation_log_service
from settings import settings

from .internal import (
    ContractNumberGenerator,
    ProjectCreator,
    ProjectQueryService,
    ProjectResponseBuilder,
    ProjectStateManager,
    ProjectUpdater,
)
from .internal.owners import get_bank_card_number

if TYPE_CHECKING:
    from models import User


def attachment_url_in_use(db: Session, url: str) -> bool:
    """检查附件 URL 是否仍被任意项目引用：附件库（signing_materials）或软装明细附件（soft_detail_attachment）.

    供装修合同附件替换清理、孤儿文件删除端点等共用：URL 仍被引用时禁止物理删除，
    防止共享文件被误删（如运营曾把手填链接字段填成附件库文件 URL）。

    signing_materials 兼容两种历史格式：dict（filename/url/category/fileType/size）与
    纯 URL 字符串；soft_detail_attachment 曾是手填链接，同一 URL 可能被填进多个项目
    （同一套软装明细复用），故两处都必须检查。signing_materials 为 JSON 列，只能取
    单列全表扫描（项目量为百级，内存扫描可接受）；soft_detail_attachment 为普通文本列，
    直接走 WHERE 等值查询。
    """
    rows = db.query(ProjectContract.signing_materials).filter(ProjectContract.is_deleted.is_(False)).all()
    for (materials,) in rows:
        for item in materials or []:
            if item == url or (isinstance(item, dict) and item.get("url") == url):
                return True

    renovation_reference = (
        db.query(ProjectRenovation.id)
        .filter(
            ProjectRenovation.is_deleted.is_(False),
            ProjectRenovation.soft_detail_attachment == url,
        )
        .first()
    )
    return renovation_reference is not None


def _enum_value(value: object) -> str | None:
    """枚举/字符串状态字段统一取值（SQLEnum 读取为枚举、写入为 str，两种均需兼容）."""
    if value is None:
        return None
    return value.value if hasattr(value, "value") else str(value)


def _submit_project_dict_pendings(
    db: Session,
    *,
    new_community: dict | None,
    new_building: dict | None,
    new_room: dict | None,
    biz_id: str,
    community_id: str | None,
    building_id: int | None = None,
    submitted_by: str | None = None,
) -> None:
    """补录项目单据的录入端新增字典 pending 引用（M6：委托 dict_submit_service 单点）.

    单据落库后、同事务 commit 前调用：以真实单据 id 作为 source_id 提交审核池。
    注（M6 注释纠错）：原注释写「submit 内部自行提交 pending；业务单据创建失败时
    pending 引用仍保留」，与代码 ``commit=False`` 的实际语义相反 —— pending 与
    业务单据同事务，单据失败时 pending 一起回滚，不产生半提交。

    Args:
        db: 数据库会话
        new_community: 小区快照载荷（可为空）
        new_building: 楼栋载荷（可为空）
        new_room: 户室载荷（可为空）
        biz_id: 项目单据 ID
        community_id: 单据关联的字典实表小区 ID（可为空）
        building_id: 单据关联的字典实表楼栋 ID（room 挂实表父级用，可为空）
        submitted_by: 提交人用户 ID（L1 修复：审核池「提交人」列与通知依据）

    """
    submit_dict_chain(
        db,
        new_community=new_community,
        new_building=new_building,
        new_room=new_room,
        biz_type="project",
        biz_id=biz_id,
        community_id=community_id,
        building_id=building_id,
        submitted_by=submitted_by,
        commit=False,
    )


def _project_snapshot(project: Project) -> dict[str, Any]:
    """构建项目本体审计快照（关键字段，业主电话/身份证等敏感信息不入快照）.

    需在 contract/owners/sale 关联已预加载时调用（get_by_id 均已加载）；
    Decimal/date 统一转字符串，保证 JSON 列可序列化。
    """
    contract = project.contract if project.contract is not None and not project.contract.is_deleted else None
    sale = project.sale if project.sale is not None and not project.sale.is_deleted else None
    owner = next((o for o in project.owners if not o.is_deleted), None)
    return {
        "name": project.name,
        "community_name": project.community_name,
        "status": _enum_value(project.status),
        "business_form": _enum_value(project.business_form),
        "contract_no": contract.contract_no if contract else None,
        "signing_price": str(contract.signing_price) if contract and contract.signing_price is not None else None,
        "owner_name": owner.owner_name if owner else None,
        "sold_price": str(sale.sold_price) if sale and sale.sold_price is not None else None,
        "sold_date": sale.sold_date.strftime("%Y-%m-%d") if sale and sale.sold_date else None,
        "transaction_status": sale.transaction_status if sale else None,
        "is_deleted": project.is_deleted,
    }


class ProjectCoreService:
    """项目核心业务服务 (Facade 模式).

    负责项目的全生命周期管理，包括创建、查询、更新、删除和状态流转。
    采用组件化设计，内部通过组合方式使用各子服务模块。

    Attributes:
        db: SQLAlchemy数据库会话
        query_service: 项目查询服务
        response_builder: 响应数据构建器
        state_manager: 状态管理器
        creator: 项目创建服务
        updater: 项目更新服务
        contract_generator: 合同编号生成器

    """

    def __init__(self, db: Session) -> None:
        """初始化核心业务服务.

        Args:
            db: SQLAlchemy数据库会话

        """
        self.db = db
        self.query_service = ProjectQueryService(db)
        self.response_builder = ProjectResponseBuilder(db)
        self.state_manager = ProjectStateManager(db)
        self.creator = ProjectCreator(db)
        self.updater = ProjectUpdater(db)
        self.contract_generator = ContractNumberGenerator(db)

    def generate_contract_no(self, business_form: str, max_retries: int = 3) -> str:
        """生成下一个合同编号（线程安全）.

        格式: SH + 4位自增序号 + - + 后缀
        - agent(代理美化) -> DL，如 SH0028-DL
        - wholesale(收购美化) -> SG，如 SH0028-SG

        Args:
            business_form: 业务形式，agent 或 wholesale
            max_retries: 最大重试次数，防止无限循环

        Returns:
            新生成的合同编号

        """
        # 临时更新最大重试次数
        original_retries = self.contract_generator.max_retries
        self.contract_generator.max_retries = max_retries
        try:
            return self.contract_generator.generate(business_form)
        finally:
            self.contract_generator.max_retries = original_retries

    def get_owner_bank_card_number(self, owner_id: str, operator_id: str | None = None) -> str | None:
        """获取业主未脱敏银行卡号.

        Args:
            owner_id: 业主ID
            operator_id: 调用方用户ID，用于审计日志

        Returns:
            未脱敏银行卡号；业主不存在、已删除或所属项目已软删时返回 None

        """
        return get_bank_card_number(self.db, owner_id, operator_id=operator_id)

    def create_project(
        self,
        project_data: ProjectCreate,
        *,
        operator_id: str | None = None,
        request: Request | None = None,
    ) -> ProjectResponse:
        """创建项目.

        Args:
            project_data: 项目创建数据
            operator_id: 操作者用户ID（用于审计日志，可选）
            request: FastAPI Request 对象（用于审计日志提取 IP/UA，可选）

        Returns:
            创建成功的项目响应数据

        """
        project = self.creator.create(project_data)
        # 单据落库 commit 后：补录录入端新增字典 pending 引用（biz_type=project）
        # creator.create 内部已 commit，此处以真实单据 id 补提交（M3/FR-10 引用闭环）
        if project_data.new_community or project_data.new_building or project_data.new_room:
            _submit_project_dict_pendings(
                self.db,
                new_community=project_data.new_community,
                new_building=project_data.new_building,
                new_room=project_data.new_room,
                biz_id=str(project.id),
                community_id=project.community_id,
                building_id=project.building_id,
                submitted_by=operator_id,
            )
        # 重新查询以预加载 builder 所需的所有关联（create 已 commit，关联已 expire）
        project = self.query_service.get_by_id(project.id, include_all=False)
        # 审计日志在主操作成功 commit 后写入；写入失败由 OperationLogService 内部捕获，不阻塞主流程
        operation_log_service.log_action(
            self.db,
            user_id=operator_id,
            action="create",
            resource_type="project",
            resource_id=str(project.id),
            after=_project_snapshot(project),
            request=request,
        )
        return ProjectResponse.model_validate(self.response_builder.build(project))

    def get_project(
        self,
        project_id: uuid.UUID,
        *,
        include_all: bool = False,
        current_user: "User | None" = None,
    ) -> ProjectResponse | None:
        """获取项目详情.

        Args:
            project_id: 项目ID
            include_all: 是否加载所有关联数据
            current_user: 当前请求用户，用于计算 can_edit_renovation / can_edit_sales
                业务身份标志；列表页可传 None

        Returns:
            项目响应数据，不存在时返回None

        """
        project = self.query_service.get_by_id(project_id, include_all=include_all)
        return ProjectResponse.model_validate(self.response_builder.build(project, current_user=current_user))

    def exists(self, project_id: uuid.UUID) -> bool:
        """检查项目是否存在.

        Args:
            project_id: 项目ID

        Returns:
            项目存在返回True，否则返回False

        """
        return self.query_service.exists(project_id)

    def get_projects(
        self,
        status_filter: str | None = None,
        community_name: str | None = None,
        business_form: BusinessForm | None = None,
        page: int = 1,
        page_size: int | None = None,
        *,
        include_interactions: bool = False,
        monitor_sort: bool = False,
        keyword: str | None = None,
        contract_sort: bool = False,
        is_archived: bool | None = None,
    ) -> dict[str, Any]:
        """获取项目列表.

        Args:
            status_filter: 状态筛选条件
            community_name: 小区名称筛选条件
            business_form: 业务形式筛选条件
            page: 页码
            page_size: 每页数量
            include_interactions: 是否在 slim 列表响应中包含互动记录(sales_records)，
                供工作台重点监控卡片展示项目动态(带看/出价)
            monitor_sort: 工作台重点监控排序（状态优先级 + 创建时间升序），
                需在分页前应用
            keyword: 模糊搜索关键词（匹配小区名称 或 合同编号）
            contract_sort: 按合同编号降序（越新越前），供项目记账列表使用
            is_archived: 归档筛选（None=全部，False=仅未归档，True=仅已归档）

        Returns:
            包含项目列表和分页信息的字典

        """
        effective_page_size = page_size if page_size is not None else settings.default_page_size
        result = self.query_service.get_by_status(
            status=status_filter,
            community_name=community_name,
            business_form=business_form,
            page=page,
            page_size=effective_page_size,
            include_interactions=include_interactions,
            monitor_sort=monitor_sort,
            keyword=keyword,
            contract_sort=contract_sort,
            is_archived=is_archived,
        )

        # 批量构建（builder 内部单次批量解析字典名称，无 N+1）
        items = [
            ProjectResponse.model_validate(r)
            for r in self.response_builder.build(result["items"], slim=True, include_interactions=include_interactions)
        ]

        return {
            "items": items,
            "total": result["total"],
            "page": result["page"],
            "page_size": result["page_size"],
        }

    # 项目导出 CSV 表头（顺序与 build_projects_export rows 对齐）
    _EXPORT_HEADERS: ClassVar[list[str]] = [
        "项目ID",
        "项目名称",
        "项目状态",
        "小区名称",
        "物业地址",
        "面积(m²)",
        "户型",
        "朝向",
        "合同编号",
        "签约价格(万)",
        "签约日期",
        "合同周期(天)",
        "顺延期(天)",
        "顺延期租金(元/月)",
        "税费承担类型",
        "税费承担说明",
        "计划交房日期",
        "业主姓名",
        "业主电话",
        "挂牌价(万)",
        "上架日期",
        "成交价(万)",
        "成交日期",
        "总收入(元)",
        "总支出(元)",
        "净现金流(元)",
        "ROI(%)",
        "创建时间",
        "更新时间",
    ]

    def build_projects_export(
        self,
        status_filter: str | None = None,
        community_name: str | None = None,
    ) -> tuple[list[str], list[list[str]]]:
        """构建项目导出 CSV（headers + rows）.

        分页遍历所有匹配项目（page_size=settings.max_page_size，遵守上限），
        避免单次 page_size=10000 配合 joinedload 瞬时占满内存。
        """
        rows: list[list[str]] = []
        page = 1
        page_size = settings.max_page_size
        while True:
            result = self.get_projects(
                status_filter=status_filter,
                community_name=community_name,
                page=page,
                page_size=page_size,
            )
            rows.extend(
                [
                    project.id,
                    project.name or "",
                    project.status,
                    project.community_name or "",
                    project.address or "",
                    str(project.area) if project.area else "",
                    project.layout or "",
                    project.orientation or "",
                    project.contract_no or "",
                    str(project.signing_price) if project.signing_price else "",
                    project.signing_date or "",
                    str(project.signing_period) if project.signing_period else "",
                    str(project.extension_period) if project.extension_period else "",
                    str(project.extension_rent) if project.extension_rent else "",
                    project.cost_assumption_type or "",
                    project.cost_assumption_other or "",
                    project.planned_handover_date or "",
                    project.owner_name or "",
                    project.owner_phone or "",
                    str(project.list_price) if project.list_price else "",
                    project.listing_date or "",
                    str(project.sold_price) if project.sold_price else "",
                    project.sold_date or "",
                    str(project.total_income) if project.total_income else "0",
                    str(project.total_expense) if project.total_expense else "0",
                    str(project.net_cash_flow) if project.net_cash_flow else "0",
                    str(project.roi) if project.roi else "0",
                    project.created_at.strftime("%Y-%m-%d %H:%M:%S") if project.created_at else "",
                    project.updated_at.strftime("%Y-%m-%d %H:%M:%S") if project.updated_at else "",
                ]
                for project in result["items"]
            )
            # 已遍历完所有页
            if page * page_size >= result["total"]:
                break
            page += 1
        return self._EXPORT_HEADERS, rows

    def get_my_responsible_projects(
        self,
        user_id: str,
        *,
        current_user: "User | None" = None,
    ) -> list[ProjectResponse]:
        """获取当前用户作为业务身份（装修对接负责人或销售团队成员）负责的项目列表.

        用于工作台"我负责的项目"卡片：普通用户即使无 project:read 权限，被指派为
        项目业务负责人后也能看到自己负责的项目。业务身份优先级最高，不被角色权限覆盖。

        Args:
            user_id: 当前用户ID
            current_user: 当前请求用户，用于计算 can_edit_* 业务身份标志

        Returns:
            项目响应列表（按 created_at 降序）

        """
        projects = self.query_service.get_by_business_identity(user_id)
        # 批量构建（builder 内部单次批量解析字典名称，无 N+1）
        return [
            ProjectResponse.model_validate(r)
            for r in self.response_builder.build(projects, slim=True, current_user=current_user)
        ]

    def update_project(
        self,
        project_id: uuid.UUID,
        update_data: ProjectUpdate,
        *,
        operator_id: str | None = None,
        request: Request | None = None,
    ) -> ProjectResponse:
        """更新项目信息.

        Args:
            project_id: 项目ID
            update_data: 更新数据
            operator_id: 操作者用户ID（用于审计日志，可选）
            request: FastAPI Request 对象（用于审计日志提取 IP/UA，可选）

        Returns:
            更新后的项目响应数据

        Raises:
            ResourceNotFoundError: 项目不存在时抛出

        """
        project = self.query_service.get_by_id(project_id, include_all=False)

        update_dict = update_data.model_dump(exclude_unset=True)
        # 录入端新增载荷（new_*）非 Project 列：单独取出待补录 pending 引用（M2/BR-22）
        new_community = update_dict.pop("new_community", None) or None
        new_building = update_dict.pop("new_building", None) or None
        new_room = update_dict.pop("new_room", None) or None
        # 字典归属校验（M1 修复：update 携带 building_id/room_id 时必须属于单据小区）
        validate_dict_ownership(
            self.db,
            community_id=update_dict.get("community_id") or project.community_id,
            building_id=update_dict.get("building_id", project.building_id),
            room_id=update_dict.get("room_id", project.room_id),
        )
        # 变更前快照（updater.update 会 commit 并 expire 属性，before 需在更新前构造）
        before_snapshot = _project_snapshot(project)
        project = self.updater.update(project, update_dict)

        # 更新落库 commit 后：补录录入端新增字典 pending 引用（biz_type=project）
        if new_community or new_building or new_room:
            _submit_project_dict_pendings(
                self.db,
                new_community=new_community,
                new_building=new_building,
                new_room=new_room,
                biz_id=str(project_id),
                community_id=project.community_id,
                building_id=project.building_id,
                submitted_by=operator_id,
            )

        # update 已 commit，重新查询以预加载 builder 所需关联
        project = self.query_service.get_by_id(project_id, include_all=False)
        # 审计日志在主操作成功 commit 后写入；写入失败由 OperationLogService 内部捕获，不阻塞主流程
        operation_log_service.log_action(
            self.db,
            user_id=operator_id,
            action="update",
            resource_type="project",
            resource_id=str(project_id),
            before=before_snapshot,
            after=_project_snapshot(project),
            request=request,
        )
        return ProjectResponse.model_validate(self.response_builder.build(project))

    def delete_project(
        self,
        project_id: uuid.UUID,
        *,
        operator_id: str | None = None,
        request: Request | None = None,
    ) -> None:
        """删除项目 (软删除).

        同时软删除关联的合同记录，释放合同编号供复用。

        Args:
            project_id: 项目ID
            operator_id: 操作者用户ID（用于审计日志，可选）
            request: FastAPI Request 对象（用于审计日志提取 IP/UA，可选）

        Raises:
            ResourceNotFoundError: 项目不存在时抛出

        """
        project = self.query_service.get_by_id(project_id, include_all=False)
        # 归档写锁：已归档项目不可删除（需先反归档，避免归档台账凭空消失）。
        # ensure_project_writable 会 refresh 重读 is_archived，关闭并发归档窗口。
        ensure_project_writable(self.db, project, action="删除")
        # 删除前快照（软删除会改写 status/is_deleted）
        before_snapshot = _project_snapshot(project)

        project.is_deleted = True
        project.status = ProjectStatus.DELETED.value
        project.updated_at = datetime.now(timezone.utc)

        # 同步软删除合同记录，释放合同编号（idx_contract_no 为部分唯一索引，仅约束 is_deleted=false 的记录）
        now = datetime.now(timezone.utc)
        self.db.query(ProjectContract).filter(
            ProjectContract.project_id == project_id,
            ProjectContract.is_deleted.is_(False),
        ).update(
            {
                "is_deleted": True,
                "updated_at": now,
            },
            synchronize_session=False,
        )

        # 同步软删除该项目的账本流水（2026-10-21 缺陷修复）：
        # 项目删除后流水若仍存活，会出现两个实际问题——
        #   1. 账户流水页仍列出「已删项目」的账，点「补上账户」直接 404「项目不存在」；
        #   2. 这些流水仍参与项目账本全局汇总（/admin/ledger/stats）的收支与笔数。
        # 删除项目即意味着这笔账不再成立，故与项目同一事务软删，保留原始记录可追溯。
        self.db.query(FinanceRecord).filter(
            FinanceRecord.project_id == project_id,
            FinanceRecord.is_deleted.is_(False),
        ).update(
            {
                "is_deleted": True,
                "updated_at": now,
            },
            synchronize_session=False,
        )

        self.db.commit()

        # 审计日志在主操作成功 commit 后写入；写入失败由 OperationLogService 内部捕获，不阻塞主流程
        operation_log_service.log_action(
            self.db,
            user_id=operator_id,
            action="delete",
            resource_type="project",
            resource_id=str(project_id),
            before=before_snapshot,
            request=request,
        )

    def update_status(
        self,
        project_id: uuid.UUID,
        status_update: ProjectStatusUpdate,
        *,
        operator_id: str | None = None,
        request: Request | None = None,
    ) -> ProjectResponse:
        """更新项目状态.

        Args:
            project_id: 项目ID
            status_update: 状态更新数据
            operator_id: 操作者用户ID（用于审计日志，可选）
            request: FastAPI Request 对象（用于审计日志提取 IP/UA，可选）

        Returns:
            更新后的项目响应数据

        Raises:
            ResourceNotFoundError: 项目不存在时抛出

        """
        project = self.query_service.get_by_id(project_id, include_all=False)
        old_status = _enum_value(project.status)

        project = self.state_manager.update_status(project, status_update)

        # update_status 已 commit，重新查询以预加载 builder 所需关联
        project = self.query_service.get_by_id(project_id, include_all=False)
        # 审计日志在主操作成功 commit 后写入；写入失败由 OperationLogService 内部捕获，不阻塞主流程
        operation_log_service.log_action(
            self.db,
            user_id=operator_id,
            action="update",
            resource_type="project",
            resource_id=str(project_id),
            before={"status": old_status},
            after={"status": _enum_value(project.status)},
            request=request,
        )
        return ProjectResponse.model_validate(self.response_builder.build(project))

    def get_project_stats(self) -> dict[str, int]:
        """获取项目统计.

        Returns:
            各状态项目数量的字典

        """
        stats = (
            self.db.query(
                Project.status,
                func.count(Project.id),
            )
            .filter(Project.is_deleted.is_(False))
            .group_by(Project.status)
            .all()
        )

        result = {
            "signing": 0,
            "renovating": 0,
            "selling": 0,
            "sold": 0,
            "ended": 0,
        }

        for status, count in stats:
            status_key = status.value if hasattr(status, "value") else str(status)
            if status_key in result:
                result[status_key] = count

        return result
