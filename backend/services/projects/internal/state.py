"""
项目状态管理模块
负责项目状态流转的验证和处理
"""

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from models import Project
from models.common import ProjectStatus
from schemas.project import StatusUpdate


class ProjectStateManager:
    """
    项目状态管理器

    负责项目状态的流转验证和状态更新处理。
    包含状态流转规则验证和销售记录管理。

    Attributes:
        db: SQLAlchemy数据库会话
    """

    def __init__(self, db: Session):
        """
        初始化状态管理器

        Args:
            db: SQLAlchemy数据库会话
        """
        self.db = db

    def validate_transition(self, current_status: str, new_status: str) -> None:
        """
        验证状态流转合法性

        状态流转规则：
        - 已售状态只能从"在售"状态进入（或已在已售状态）
        - 其他状态流转无特殊限制

        Args:
            current_status: 当前项目状态
            new_status: 目标项目状态

        Raises:
            HTTPException: 状态流转不合法时抛出400错误
        """
        # 特殊规则：只限制除了在售状态外，其他状态不能切换到已售状态
        if (new_status == ProjectStatus.SOLD.value and
            current_status != ProjectStatus.SELLING.value and
            current_status != ProjectStatus.SOLD.value):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="只有在售或已售状态才能切换到已售状态"
            )

    def update_status(
        self,
        project: Project,
        status_update: StatusUpdate
    ) -> Project:
        """
        更新项目状态

        执行状态更新并处理相关副作用：
        - 验证状态流转合法性
        - 更新销售记录状态
        - 初始化装修阶段（如进入装修状态）

        Args:
            project: 项目模型实例
            status_update: 状态更新数据

        Returns:
            更新后的项目模型实例
        """
        new_status = status_update.status.value
        current_status = project.status

        # 验证状态流转
        self.validate_transition(current_status, new_status)

        # 更新状态
        project.status = new_status
        project.updated_at = datetime.utcnow()

        # 处理销售状态变更
        self._handle_sale_status_change(project.id, new_status, status_update)

        # 如果进入装修阶段且当前没有子阶段，初始化为第一个阶段
        if new_status == ProjectStatus.RENOVATING.value and not project.renovation_stage:
            project.renovation_stage = "拆除"

        self.db.commit()
        self.db.refresh(project)

        return project

    def _handle_sale_status_change(
        self,
        project_id: str,
        new_status: str,
        status_update: StatusUpdate
    ) -> None:
        """
        处理销售状态变更

        根据新的项目状态更新销售记录：
        - 进入"在售"状态：创建或更新销售记录，设置在售状态
        - 进入"已售"状态：更新销售记录为已售状态

        Args:
            project_id: 项目ID
            new_status: 新的项目状态
            status_update: 状态更新数据
        """
        from models import ProjectSale
        from services.utils import parse_date_string

        if new_status == ProjectStatus.SELLING.value:
            sale = self.db.query(ProjectSale).filter(
                ProjectSale.project_id == project_id
            ).first()

            listing_date = parse_date_string(status_update.listing_date)

            if sale:
                sale.transaction_status = "在售"
                if listing_date:
                    sale.listing_date = listing_date
                if status_update.list_price is not None:
                    sale.list_price = status_update.list_price
                sale.updated_at = datetime.utcnow()
            else:
                sale = ProjectSale(
                    id=str(__import__('uuid').uuid4()),
                    project_id=project_id,
                    listing_date=listing_date,
                    list_price=status_update.list_price,
                    transaction_status="在售",
                    is_deleted=False,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                )
                self.db.add(sale)

        elif new_status == ProjectStatus.SOLD.value:
            sale = self.db.query(ProjectSale).filter(
                ProjectSale.project_id == project_id
            ).first()

            if sale:
                sale.transaction_status = "已售"
                sale.sold_date = datetime.utcnow()
                sale.updated_at = datetime.utcnow()
