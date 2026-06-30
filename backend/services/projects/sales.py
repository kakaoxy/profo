"""项目销售业务服务.

负责：销售团队管理、带看/出价/面谈记录、成交确认.

注意：已适配新的规范化表结构，销售记录使用 ProjectInteraction 表
"""

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from models import Project, ProjectInteraction, ProjectSale
from models.common import ProjectStatus
from schemas.project import ProjectResponse
from schemas.project.sales import (
    ProjectCompleteRequest,
    SalesRecordCreate,
    SalesRolesUpdate,
)
from services.system.exceptions import BusinessLogicError, ResourceNotFoundError, ValidationError

from .internal import ProjectQueryService, ProjectResponseBuilder

# 允许更新的销售角色字段白名单（防止设置 id/is_deleted 等敏感字段）
_SALES_ROLE_FIELDS = {"channel_manager_id", "property_agent_id", "negotiator_id"}


class SalesService:
    """项目销售服务."""

    def __init__(self, db: Session) -> None:
        """初始化销售服务.

        Args:
            db: SQLAlchemy数据库会话

        """
        self.db = db
        self.query_service = ProjectQueryService(db)
        self.response_builder = ProjectResponseBuilder(db)

    def _get_project(self, project_id: str) -> Project:
        """内部辅助：获取项目实例."""
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
        if not project:
            raise ResourceNotFoundError("项目不存在")
        return project

    def _validate_user_ids(self, sale: ProjectSale) -> None:
        """验证销售记录中的用户ID是否有效."""
        from models import User  # noqa: PLC0415

        user_fields = [
            ("channel_manager_id", sale.channel_manager_id),
            ("property_agent_id", sale.property_agent_id),
            ("negotiator_id", sale.negotiator_id),
        ]

        user_ids = [uid for _, uid in user_fields if uid]
        if user_ids:
            existing_users = self.db.query(User.id).filter(User.id.in_(user_ids)).all()
            existing_ids = {user.id for user in existing_users}
        else:
            existing_ids = set()

        for field_name, user_id in user_fields:
            if user_id and user_id not in existing_ids:
                msg = f"无效的用户ID: {user_id} (字段: {field_name})"
                raise ValidationError(msg)

    def update_roles(self, project_id: str, roles_data: SalesRolesUpdate) -> ProjectResponse:
        """更新销售角色 (渠道、讲房、谈判)."""
        project = self._get_project(project_id)

        # 获取或创建销售记录
        sale = (
            self.db.query(ProjectSale)
            .filter(
                ProjectSale.project_id == project_id,
            )
            .first()
        )

        if not sale:
            sale = ProjectSale(
                id=str(uuid.uuid4()),
                project_id=project_id,
                transaction_status="在售",
                is_deleted=False,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            self.db.add(sale)

        # 更新销售角色
        update_dict = roles_data.model_dump(exclude_unset=True, by_alias=False)

        for field, value in update_dict.items():
            if field in _SALES_ROLE_FIELDS:
                setattr(sale, field, value)

        # 验证用户ID有效性
        self._validate_user_ids(sale)

        sale.updated_at = datetime.now(timezone.utc)
        self.db.commit()

        # commit 后关联已 expire，重新查询以预加载 builder 所需关联
        project = self.query_service.get_by_id(project_id, include_all=False)
        return ProjectResponse.model_validate(self.response_builder.build(project))

    def create_record(self, project_id: str, record_data: SalesRecordCreate) -> ProjectInteraction:
        """创建销售记录（互动记录）."""
        project = self._get_project(project_id)

        # 严格校验
        if project.status != ProjectStatus.SELLING.value:
            raise BusinessLogicError("只有在售阶段才能添加销售记录")

        # 创建互动记录
        record = ProjectInteraction(
            id=str(uuid.uuid4()),
            project_id=project_id,
            record_type=record_data.record_type.value,
            interaction_target=record_data.customer_name,
            content=record_data.notes or "",
            interaction_at=record_data.record_date or datetime.now(timezone.utc),
            operator_id=None,
            price=record_data.price,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def get_records(self, project_id: str, record_type: str | None = None) -> list[dict[str, Any]]:
        """获取销售记录列表（互动记录）."""
        query = self.db.query(ProjectInteraction).filter(
            ProjectInteraction.project_id == project_id,
            ProjectInteraction.is_deleted.is_(False),
        )
        if record_type:
            query = query.filter(ProjectInteraction.record_type == record_type)
        records = query.order_by(ProjectInteraction.interaction_at.desc(), ProjectInteraction.created_at.desc()).all()

        return [
            {
                "id": r.id,
                "project_id": r.project_id,
                "record_type": r.record_type,
                "customer_name": r.interaction_target,
                "record_date": r.interaction_at,
                "price": float(r.price) if r.price else None,
                "notes": r.content,
                "created_at": r.created_at,
            }
            for r in records
        ]

    def delete_record(self, project_id: str, record_id: str) -> None:
        """删除销售记录（互动记录）."""
        self._get_project(project_id)
        record = (
            self.db.query(ProjectInteraction)
            .filter(
                ProjectInteraction.id == record_id,
                ProjectInteraction.project_id == project_id,
                ProjectInteraction.is_deleted.is_(False),
            )
            .first()
        )

        if not record:
            raise ResourceNotFoundError("销售记录不存在")

        record.is_deleted = True
        record.updated_at = datetime.now(timezone.utc)
        self.db.commit()

    def complete_project(self, project_id: str, complete_data: ProjectCompleteRequest) -> ProjectResponse:
        """确认成交 (标记为已售)."""
        project = self._get_project(project_id)

        # 允许从 在售 或 已售(修改信息) 状态操作
        if project.status not in [ProjectStatus.SELLING.value, ProjectStatus.SOLD.value]:
            raise BusinessLogicError("只有在售或已售阶段的项目才能标记为已售")

        # 更新状态
        project.status = ProjectStatus.SOLD.value
        project.updated_at = datetime.now(timezone.utc)

        # 更新销售记录
        sale = (
            self.db.query(ProjectSale)
            .filter(
                ProjectSale.project_id == project_id,
            )
            .first()
        )

        if sale:
            sale.sold_price = complete_data.sold_price
            sale.sold_date = complete_data.sold_date
            sale.transaction_status = "已售"
            sale.updated_at = datetime.now(timezone.utc)
        else:
            # 创建新的销售记录
            sale = ProjectSale(
                id=str(uuid.uuid4()),
                project_id=project_id,
                sold_price=complete_data.sold_price,
                sold_date=complete_data.sold_date,
                transaction_status="已售",
                is_deleted=False,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            self.db.add(sale)

        self.db.commit()

        # commit 后关联已 expire，重新查询以预加载 builder 所需关联
        project = self.query_service.get_by_id(project_id, include_all=False)
        return ProjectResponse.model_validate(self.response_builder.build(project))


# 保持向后兼容的别名
ProjectSalesService = SalesService
