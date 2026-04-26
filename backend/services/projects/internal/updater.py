"""
项目更新服务模块

负责项目信息的更新，包括基础字段、合同信息、业主信息和销售信息。
"""

import uuid
from datetime import datetime
from typing import Dict, Any, TYPE_CHECKING

from models import Project, ProjectContract, ProjectOwner, ProjectSale
from models.common import ProjectStatus
from services.utils import parse_date_string
from services.system.exceptions import ResourceNotFoundError

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


class ProjectUpdater:
    """
    项目更新服务

    支持更新项目基础字段、合同信息、业主信息和销售信息。
    已售状态下只允许修改特定字段。

    Attributes:
        db: SQLAlchemy数据库会话
    """

    def __init__(self, db: "Session"):
        """
        初始化项目更新服务

        Args:
            db: SQLAlchemy数据库会话
        """
        self.db = db

    def update(self, project: Project, update_dict: Dict[str, Any]) -> Project:
        """
        更新项目信息

        支持更新项目基础字段、合同信息、业主信息和销售信息。
        已售状态下只允许修改特定字段。

        Args:
            project: 项目模型实例
            update_dict: 更新数据字典

        Returns:
            更新后的项目模型实例
        """
        # 已售状态限制可修改字段
        if project.status == ProjectStatus.SOLD.value:
            update_dict = self._filter_allowed_fields(update_dict)

        # 更新各模块数据
        self._update_project_fields(project, update_dict)
        self._update_contract_fields(project.id, update_dict)
        self._update_owner_fields(project.id, update_dict)
        self._update_sale_fields(project.id, update_dict)
        self._update_remaining_fields(project, update_dict)

        project.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(project)

        return project

    def _filter_allowed_fields(self, update_dict: Dict[str, Any]) -> Dict[str, Any]:
        """过滤已售状态下允许修改的字段"""
        allowed_fields = {
            'community_name', 'address', 'area', 'orientation', 'layout',
            'renovation_stage', 'notes', 'tags',
            'owner_name', 'owner_phone', 'owner_id_card', 'owner_info'
        }
        return {k: v for k, v in update_dict.items() if k in allowed_fields}

    def _update_project_fields(
        self,
        project: Project,
        update_dict: Dict[str, Any]
    ) -> None:
        """更新项目基础字段"""
        project_fields = [
            'community_name', 'address', 'area', 'orientation', 'layout',
            'renovation_stage', 'status', 'tags', 'project_manager_id'
        ]

        for field in project_fields:
            if field in update_dict:
                setattr(project, field, update_dict.pop(field))

        # 如果小区名称或地址发生变化，重新生成项目名称
        if 'community_name' in project_fields or 'address' in project_fields:
            project.name = project.generate_name()

    def _update_contract_fields(
        self,
        project_id: str,
        update_dict: Dict[str, Any]
    ) -> None:
        """更新合同相关字段"""
        contract_fields = [
            'contract_no', 'signing_price', 'signing_date', 'signing_period',
            'extension_period', 'extension_rent', 'cost_assumption_type',
            'cost_assumption_other', 'planned_handover_date', 'other_agreements', 'signing_materials'
        ]

        contract_updates = {
            k: update_dict.pop(k)
            for k in list(contract_fields)
            if k in update_dict
        }

        # 解析日期字段
        if 'signing_date' in contract_updates:
            contract_updates['signing_date'] = parse_date_string(contract_updates['signing_date'])
        if 'planned_handover_date' in contract_updates:
            contract_updates['planned_handover_date'] = parse_date_string(contract_updates['planned_handover_date'])

        # Convert signing_materials Pydantic models to dicts for JSON serialization
        if 'signing_materials' in contract_updates and contract_updates['signing_materials']:
            materials = contract_updates['signing_materials']
            if isinstance(materials, list):
                contract_updates['signing_materials'] = [
                    m.model_dump() if hasattr(m, 'model_dump') else m
                    for m in materials
                ]

        if not contract_updates:
            return

        contract = self.db.query(ProjectContract).filter(
            ProjectContract.project_id == project_id
        ).first()

        if contract:
            for field, value in contract_updates.items():
                setattr(contract, field, value)
        else:
            contract = ProjectContract(
                id=str(uuid.uuid4()),
                project_id=project_id,
                is_deleted=False,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
                **contract_updates
            )
            self.db.add(contract)

    def _update_owner_fields(
        self,
        project_id: str,
        update_dict: Dict[str, Any]
    ) -> None:
        """更新业主相关字段"""
        owner_fields = ['owner_name', 'owner_phone', 'owner_id_card']
        owner_updates = {
            k: update_dict.pop(k)
            for k in list(owner_fields)
            if k in update_dict
        }

        if 'notes' in update_dict:
            owner_updates['owner_info'] = update_dict.pop('notes')

        if not owner_updates:
            return

        owner = self.db.query(ProjectOwner).filter(
            ProjectOwner.project_id == project_id
        ).first()

        if owner:
            for field, value in owner_updates.items():
                setattr(owner, field, value)
        else:
            owner = ProjectOwner(
                id=str(uuid.uuid4()),
                project_id=project_id,
                relation_type="业主",
                is_deleted=False,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
                **owner_updates
            )
            self.db.add(owner)

    def _update_sale_fields(
        self,
        project_id: str,
        update_dict: Dict[str, Any]
    ) -> None:
        """更新销售相关字段"""
        sale_fields = ['listing_date', 'list_price', 'sold_date', 'sold_price']
        sale_updates = {
            k: update_dict.pop(k)
            for k in list(sale_fields)
            if k in update_dict
        }

        # 解析日期字段
        if 'listing_date' in sale_updates:
            sale_updates['listing_date'] = parse_date_string(sale_updates['listing_date'])
        if 'sold_date' in sale_updates:
            sale_updates['sold_date'] = parse_date_string(sale_updates['sold_date'])

        if not sale_updates:
            return

        sale = self.db.query(ProjectSale).filter(
            ProjectSale.project_id == project_id
        ).first()

        if sale:
            for field, value in sale_updates.items():
                setattr(sale, field, value)
        else:
            sale = ProjectSale(
                id=str(uuid.uuid4()),
                project_id=project_id,
                transaction_status="在售",
                is_deleted=False,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
                **sale_updates
            )
            self.db.add(sale)

    def _update_remaining_fields(
        self,
        project: Project,
        update_dict: Dict[str, Any]
    ) -> None:
        """更新项目主表的剩余字段"""
        for field, value in update_dict.items():
            if hasattr(project, field):
                setattr(project, field, value)
