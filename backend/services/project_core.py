"""
项目核心业务服务
负责：项目创建、列表查询、基础信息更新、状态流转
"""
from typing import Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException, status

from models import Project
from models.base import ProjectStatus
from schemas.project import ProjectCreate, ProjectUpdate, StatusUpdate
from sqlalchemy.orm import Session, selectinload, defer, noload

class ProjectCoreService:
    def __init__(self, db: Session):
        self.db = db

    def _get_project(self, project_id: str, include_all: bool = False) -> Project:
        # 基础加载选项
        options = [
            selectinload(Project.sales_records),
            noload(Project.cashflow_records),
            defer(Project.signing_materials), 
            defer(Project.owner_info),
            defer(Project.viewingRecords),
            defer(Project.offerRecords),
            defer(Project.negotiationRecords),
            defer(Project.otherAgreements),
            defer(Project.notes)
        ]

        # 如果要求完整数据，则预加载装修照片
        if include_all:
            options.append(selectinload(Project.renovation_photos))
        else:
            options.append(noload(Project.renovation_photos))

        project = self.db.query(Project).options(*options).filter(Project.id == project_id).first()

        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="项目不存在"
            )

        # [核心修复] 动态加载逻辑 (对 defer 字段进行按需加载)
        if include_all:
            _ = project.signing_materials
            _ = project.owner_info
            _ = project.otherAgreements
            _ = project.notes
            # 显式触发装修照片加载，确保序列化时数据存在
            _ = project.renovation_photos
        
        # 情况B：项目处于签约状态 (必须显示材料)
        elif project.status == ProjectStatus.SIGNING.value:
            _ = project.signing_materials
            _ = project.owner_info
            _ = project.otherAgreements
            _ = project.notes
        
        # 情况C：项目处于已售状态 (且没有要求完整数据 -> 保持极速模式)
        elif project.status == ProjectStatus.SOLD.value:
            project.signing_materials = None
            project.owner_info = None
            project.otherAgreements = None

        return project

    def create_project(self, project_data: ProjectCreate) -> Project:
        """创建项目"""
        project = Project(
            name=project_data.name,
            community_name=project_data.community_name,
            address=project_data.address,
            manager=project_data.manager,
            signing_price=project_data.signing_price,
            signing_date=project_data.signing_date,
            signing_period=project_data.signing_period,
            planned_handover_date=project_data.planned_handover_date,
            signing_materials=project_data.signing_materials,
            owner_name=project_data.owner_name,
            owner_phone=project_data.owner_phone,
            owner_id_card=project_data.owner_id_card,
            owner_info=project_data.owner_info,
            
            # Extended fields
            area=project_data.area,
            extensionPeriod=project_data.extensionPeriod,
            extensionRent=project_data.extensionRent,
            costAssumption=project_data.costAssumption,
            otherAgreements=project_data.otherAgreements,
            remarks=project_data.remarks,
            
            notes=project_data.notes,
            tags=project_data.tags,
            status=ProjectStatus.SIGNING.value,
            status_changed_at=datetime.utcnow(),
            
            # [新增] 初始化财务缓存字段 (虽然数据库有default 0，显式初始化是个好习惯)
            total_income=0,
            total_expense=0,
            net_cash_flow=0,
            roi=0.0
        )
        self.db.add(project)
        self.db.commit()
        self.db.refresh(project)
        return project

    def get_project(self, project_id: str, include_all: bool = False) -> Optional[Project]:
        """获取项目详情"""
        return self._get_project(project_id, include_all)

    def get_projects(self, status_filter: Optional[str] = None,
                    community_name: Optional[str] = None,
                    page: int = 1, page_size: int = 50) -> Dict[str, Any]:

        # 1. 基础查询构造
        query = self.db.query(Project)

        if status_filter:
            query = query.filter(Project.status == status_filter)
        else:
            query = query.filter(Project.status != ProjectStatus.DELETED.value)

        if community_name:
            query = query.filter(Project.community_name.contains(community_name))

        # 2. 获取总数
        total = query.count()

        # 3. 获取当前页的项目
        # [核心修复] 使用 noload 强制不加载关联关系
        # 列表页不需要展示几百条带看记录或装修照片，切断它们！
        projects = query.options(
            # 文本大字段优化
            defer(Project.signing_materials),
            defer(Project.owner_info),
            defer(Project.otherAgreements),
            defer(Project.notes),
            defer(Project.viewingRecords),
            defer(Project.offerRecords),
            defer(Project.negotiationRecords),

            
            # [关键] 关系字段优化：彻底切断查询
            # 如果前端列表页真的需要展示"几条带看"，请改成 selectinload
            # 但通常列表页不需要，noload 是最快的（0次额外查询）
            noload(Project.sales_records),
            noload(Project.renovation_photos),
            noload(Project.cashflow_records)
        ).order_by(Project.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

        return {
            "items": projects,
            "total": total,
            "page": page,
            "page_size": page_size
        }

    def update_project(self, project_id: str, update_data: ProjectUpdate) -> Project:
        """更新项目信息"""
        project = self.db.query(Project).filter(Project.id == project_id).first()

        # 更新字段
        update_dict = update_data.model_dump(exclude_unset=True)
        
        # 只限制已售状态不能修改某些字段，其他状态允许修改所有字段
        if project.status == ProjectStatus.SOLD.value:
            # 已售状态，只允许修改特定字段
            allowed_fields = {
                'channelManager', 'presenter', 'negotiator',
                'viewingRecords', 'offerRecords', 'negotiationRecords',
                'property_agent', 'client_agent', 'first_viewer',
                'list_price','signing_materials', 'owner_info', 'otherAgreements', 'notes'
            }
            
            # 过滤掉不允许修改的字段
            filtered_update_dict = {}
            for field, value in update_dict.items():
                if field in allowed_fields:
                    filtered_update_dict[field] = value
            
            update_dict = filtered_update_dict
        
        # 更新所有允许的字段
        for field, value in update_dict.items():
            if hasattr(project, field):
                setattr(project, field, value)

        self.db.commit()
        self.db.refresh(project)
        return project

    def delete_project(self, project_id: str) -> None:
        """删除项目 (软删除)"""
        project = self._get_project(project_id)
        project.status = ProjectStatus.DELETED.value
        project.status_changed_at = datetime.utcnow()
        self.db.commit()

    def update_status(self, project_id: str, status_update: StatusUpdate) -> Project:
        """更新项目状态"""
        project = self.db.query(Project).filter(Project.id == project_id).first()

        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="项目不存在"
            )
        new_status = status_update.status.value
        current_status = project.status

        # 验证状态流转
        self._validate_status_transition(current_status, new_status)

        # 更新状态
        project.status = new_status
        project.status_changed_at = datetime.utcnow()

        # 处理上架时间
        if status_update.listing_date:
            project.listing_date = status_update.listing_date

        # 处理挂牌价
        if status_update.list_price is not None:
            project.list_price = status_update.list_price

        # 如果进入装修阶段且当前没有子阶段，初始化为第一个阶段
        if new_status == ProjectStatus.RENOVATING.value and not project.renovation_stage:
            project.renovation_stage = "拆除"

        # 特殊状态处理
        if new_status == ProjectStatus.SOLD.value:
            project.sold_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(project)
        return project

    def get_project_stats(self) -> Dict[str, int]:
        """获取项目统计"""
        stats = self.db.query(
            Project.status,
            func.count(Project.id)
        ).group_by(Project.status).all()

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
    
    # ========== 内部辅助方法 ==========

    def _validate_status_transition(self, current_status: str, new_status: str) -> None:
        """验证状态流转合法性"""
        # 特殊规则：只限制除了在售状态外，其他状态不能切换到已售状态
        if new_status == ProjectStatus.SOLD.value and current_status != ProjectStatus.SELLING.value and current_status != ProjectStatus.SOLD.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="只有在售或已售状态才能切换到已售状态"
            )