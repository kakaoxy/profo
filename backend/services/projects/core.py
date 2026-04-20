"""
项目核心业务服务
负责：项目创建、列表查询、基础信息更新、状态流转

注意：此服务已适配新的规范化表结构。
项目基础信息在 projects 表，签约/业主/销售等信息在关联的子表中。
"""

from typing import Optional, Dict, Any
from datetime import datetime

from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException
import uuid

from models import Project, ProjectContract, ProjectOwner, ProjectSale
from models.common import ProjectStatus
from schemas.project import ProjectCreate, ProjectUpdate, StatusUpdate, ProjectResponse
from services.utils import parse_date_string
from .internal import ProjectQueryService, ProjectResponseBuilder, ProjectStateManager


class ProjectCoreService:
    """
    项目核心业务服务

    负责项目的全生命周期管理，包括创建、查询、更新、删除和状态流转。
    采用组件化设计，内部通过组合方式使用各子服务模块。

    Attributes:
        db: SQLAlchemy数据库会话
        query_service: 项目查询服务
        response_builder: 响应数据构建器
        state_manager: 状态管理器
    """

    def __init__(self, db: Session):
        """
        初始化核心业务服务

        Args:
            db: SQLAlchemy数据库会话
        """
        self.db = db
        self.query_service = ProjectQueryService(db)
        self.response_builder = ProjectResponseBuilder(db)
        self.state_manager = ProjectStateManager(db)

    def create_project(self, project_data: ProjectCreate) -> ProjectResponse:
        """
        创建项目

        同时创建项目基础记录、合同记录和业主记录（如提供）。
        项目创建后状态默认为"签约中"。

        Args:
            project_data: 项目创建数据

        Returns:
            创建成功的项目响应数据
        """
        project_id = str(uuid.uuid4())
        now = datetime.utcnow()

        # 1. 创建项目基础记录
        project = self._create_base_project(project_id, project_data, now)

        # 2. 创建合同记录
        self._create_contract_record(project_id, project_data, now)

        # 3. 创建业主记录（如果提供了业主信息）
        self._create_owner_record(project_id, project_data, now)

        self.db.commit()
        self.db.refresh(project)

        return ProjectResponse.model_validate(self.response_builder.build(project))

    def _create_base_project(
        self,
        project_id: str,
        project_data: ProjectCreate,
        now: datetime
    ) -> Project:
        """创建项目基础记录"""
        project = Project(
            id=project_id,
            community_name=project_data.community_name,
            address=project_data.address,
            area=project_data.area,
            layout=project_data.layout,
            orientation=project_data.orientation,
            status=ProjectStatus.SIGNING.value,
            is_deleted=False,
            created_at=now,
            updated_at=now,
        )
        project.name = project.generate_name()
        self.db.add(project)
        return project

    def _create_contract_record(
        self,
        project_id: str,
        project_data: ProjectCreate,
        now: datetime
    ) -> None:
        """创建合同记录"""
        signing_date = parse_date_string(project_data.signing_date)
        planned_handover_date = parse_date_string(project_data.planned_handover_date)

        # Convert signing_materials Pydantic models to dicts for JSON serialization
        signing_materials = None
        if project_data.signing_materials:
            signing_materials = [m.model_dump() for m in project_data.signing_materials]

        contract = ProjectContract(
            id=str(uuid.uuid4()),
            project_id=project_id,
            contract_no=project_data.contract_no,
            signing_price=project_data.signing_price,
            signing_date=signing_date,
            signing_period=project_data.signing_period,
            extension_period=project_data.extension_period,
            extension_rent=project_data.extension_rent,
            cost_assumption=project_data.cost_assumption,
            planned_handover_date=planned_handover_date,
            other_agreements=project_data.other_agreements,
            signing_materials=signing_materials,
            contract_status="生效" if signing_date else "未生效",
            is_deleted=False,
            created_at=now,
            updated_at=now,
        )
        self.db.add(contract)

    def _create_owner_record(
        self,
        project_id: str,
        project_data: ProjectCreate,
        now: datetime
    ) -> None:
        """创建业主记录（如果提供了业主信息）"""
        if any([
            project_data.owner_name,
            project_data.owner_phone,
            project_data.owner_id_card,
        ]):
            owner = ProjectOwner(
                id=str(uuid.uuid4()),
                project_id=project_id,
                owner_name=project_data.owner_name,
                owner_phone=project_data.owner_phone,
                owner_id_card=project_data.owner_id_card,
                relation_type="业主",
                owner_info=project_data.notes,
                is_deleted=False,
                created_at=now,
                updated_at=now,
            )
            self.db.add(owner)

    def get_project(self, project_id: str, include_all: bool = False) -> Optional[ProjectResponse]:
        """
        获取项目详情

        Args:
            project_id: 项目ID
            include_all: 是否加载所有关联数据

        Returns:
            项目响应数据，不存在时返回None
        """
        project = self.query_service.get_by_id(project_id, include_all)
        return ProjectResponse.model_validate(self.response_builder.build(project))

    def get_projects(
        self,
        status_filter: Optional[str] = None,
        community_name: Optional[str] = None,
        page: int = 1,
        page_size: int = 50
    ) -> Dict[str, Any]:
        """
        获取项目列表

        Args:
            status_filter: 状态筛选条件
            community_name: 小区名称筛选条件
            page: 页码
            page_size: 每页数量

        Returns:
            包含项目列表和分页信息的字典
        """
        result = self.query_service.get_by_status(
            status=status_filter,
            community_name=community_name,
            page=page,
            page_size=page_size
        )

        items = [
            ProjectResponse.model_validate(self.response_builder.build(p))
            for p in result["items"]
        ]

        return {
            "items": items,
            "total": result["total"],
            "page": result["page"],
            "page_size": result["page_size"]
        }

    def update_project(self, project_id: str, update_data: ProjectUpdate) -> ProjectResponse:
        """
        更新项目信息

        支持更新项目基础字段、合同信息、业主信息和销售信息。
        已售状态下只允许修改特定字段。

        Args:
            project_id: 项目ID
            update_data: 更新数据

        Returns:
            更新后的项目响应数据
        """
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")

        update_dict = update_data.model_dump(exclude_unset=True)

        # 已售状态限制可修改字段
        if project.status == ProjectStatus.SOLD.value:
            update_dict = self._filter_allowed_fields(update_dict)

        # 更新各模块数据
        self._update_project_fields(project, update_dict)
        self._update_contract_fields(project_id, update_dict)
        self._update_owner_fields(project_id, update_dict)
        self._update_sale_fields(project_id, update_dict)
        self._update_remaining_fields(project, update_dict)

        project.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(project)

        return ProjectResponse.model_validate(self.response_builder.build(project))

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
            'renovation_stage', 'status', 'tags'
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
            'extension_period', 'extension_rent', 'cost_assumption',
            'planned_handover_date', 'other_agreements', 'signing_materials'
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

    def delete_project(self, project_id: str) -> None:
        """
        删除项目 (软删除)

        Args:
            project_id: 项目ID
        """
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")

        project.is_deleted = True
        project.status = ProjectStatus.DELETED.value
        project.updated_at = datetime.utcnow()
        self.db.commit()

    def update_status(self, project_id: str, status_update: StatusUpdate) -> ProjectResponse:
        """
        更新项目状态

        Args:
            project_id: 项目ID
            status_update: 状态更新数据

        Returns:
            更新后的项目响应数据
        """
        project = self.db.query(Project).filter(Project.id == project_id).first()

        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")

        project = self.state_manager.update_status(project, status_update)

        return ProjectResponse.model_validate(self.response_builder.build(project))

    def get_project_stats(self) -> Dict[str, int]:
        """
        获取项目统计

        Returns:
            各状态项目数量的字典
        """
        stats = self.db.query(
            Project.status,
            func.count(Project.id)
        ).filter(Project.is_deleted == False).group_by(Project.status).all()

        result = {
            "signing": 0,
            "renovating": 0,
            "selling": 0,
            "sold": 0
        }

        for status, count in stats:
            if status in result:
                result[status] = count

        return result
