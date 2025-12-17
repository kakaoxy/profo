"""
项目核心业务服务
负责：项目创建、列表查询、基础信息更新、状态流转
"""
from typing import Optional, Dict, Any
from datetime import datetime
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from fastapi import HTTPException, status

from models import Project, CashFlowRecord
from models.base import ProjectStatus
from schemas.project import ProjectCreate, ProjectUpdate, StatusUpdate
from sqlalchemy.orm import Session, selectinload

class ProjectCoreService:
    def __init__(self, db: Session):
        self.db = db

    def _get_project(self, project_id: str) -> Project:
        project = self.db.query(Project).options(
            selectinload(Project.sales_records)
        ).filter(Project.id == project_id).first()

        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="项目不存在"
            )
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
            status_changed_at=datetime.utcnow()
        )
        self.db.add(project)
        self.db.commit()
        self.db.refresh(project)
        return project

    def get_project(self, project_id: str) -> Optional[Project]:
        """获取项目详情"""
        return self._get_project(project_id)

    def get_projects(self, status_filter: Optional[str] = None,
                    community_name: Optional[str] = None,
                    page: int = 1, page_size: int = 50) -> Dict[str, Any]:
        """获取项目列表 (终极优化版：Defer大字段 + 批量计算现金流)"""
        
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

        # 3. 获取当前页的项目 (应用 defer 排除大字段)
        # 这里的 defer 非常重要，是提速的关键
        from sqlalchemy.orm import defer
        
        projects = query.options(
            defer(Project.signing_materials),
            defer(Project.owner_info),
            defer(Project.otherAgreements),
            defer(Project.notes),
            defer(Project.viewingRecords),
            defer(Project.offerRecords),
            defer(Project.negotiationRecords),
            defer(Project.renovationStageDates)
        ).order_by(Project.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

        # 如果当前页没有数据，直接返回
        if not projects:
            return {
                "items": [],
                "total": total,
                "page": page,
                "page_size": page_size
            }
        
        # A. 提取当前页所有项目的 ID 列表
        project_ids = [p.id for p in projects]

        # B. 发起一次聚合查询，计算这些项目的收支差
        # SQL 逻辑: SELECT project_id, SUM(CASE...) FROM cashflow WHERE project_id IN (...) GROUP BY project_id
        
        cash_flow_data = self.db.query(
            CashFlowRecord.project_id,
            (
                func.sum(case((CashFlowRecord.type == "income", CashFlowRecord.amount), else_=0)) -
                func.sum(case((CashFlowRecord.type == "expense", CashFlowRecord.amount), else_=0))
            ).label("net_cash_flow")
        ).filter(
            CashFlowRecord.project_id.in_(project_ids) # 关键：只查这20个ID
        ).group_by(
            CashFlowRecord.project_id
        ).all()

        # C. 将查询结果转为字典映射: { 'id1': 10000, 'id2': -500 }
        # 如果没有记录，默认为 0
        cash_flow_map = {res.project_id: (res.net_cash_flow or Decimal(0)) for res in cash_flow_data}

        # D. 在内存中将钱填回 Project 对象
        for project in projects:
            # dict.get(key, default) -> 如果没查到（说明没记账），就是 0
            project.net_cash_flow = cash_flow_map.get(project.id, Decimal(0))

        return {
            "items": projects,
            "total": total,
            "page": page,
            "page_size": page_size
        }

    def update_project(self, project_id: str, update_data: ProjectUpdate) -> Project:
        """更新项目信息"""
        project = self._get_project(project_id)

        # 更新字段
        update_dict = update_data.model_dump(exclude_unset=True)
        
        # 只限制已售状态不能修改某些字段，其他状态允许修改所有字段
        if project.status == ProjectStatus.SOLD.value:
            # 已售状态，只允许修改特定字段
            allowed_fields = {
                'channelManager', 'presenter', 'negotiator',
                'viewingRecords', 'offerRecords', 'negotiationRecords',
                'property_agent', 'client_agent', 'first_viewer',
                'list_price'
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
        project = self._get_project(project_id)
        new_status = status_update.status.value
        current_status = project.status

        # 验证状态流转
        self._validate_status_transition(current_status, new_status)

        # 更新状态
        project.status = new_status
        project.status_changed_at = datetime.utcnow()

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

    def _calculate_net_cash_flow(self, project_id: str) -> Decimal:
        """计算项目净现金流 (仅供列表页展示使用)"""
        result = self.db.query(
            func.sum(
                case(
                    (CashFlowRecord.type == "income", CashFlowRecord.amount),
                    else_=0
                )
            ).label("total_income"),
            func.sum(
                case(
                    (CashFlowRecord.type == "expense", CashFlowRecord.amount),
                    else_=0
                )
            ).label("total_expense")
        ).filter(CashFlowRecord.project_id == project_id).first()

        total_income = result.total_income or Decimal('0')
        total_expense = result.total_expense or Decimal('0')

        return total_income - total_expense