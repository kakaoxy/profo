"""
项目业务逻辑服务
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, case
from fastapi import HTTPException, status

from models import Project, CashFlowRecord, SalesRecord, RenovationPhoto
from models.base import ProjectStatus, RenovationStage, RecordType
from schemas.project import (
    ProjectCreate, ProjectUpdate, RenovationUpdate, SalesRecordCreate,
    SalesRolesUpdate, ProjectCompleteRequest, StatusUpdate
)


class ProjectService:
    """项目业务逻辑服务"""

    def __init__(self, db: Session):
        self.db = db

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
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="项目不存在"
            )
        return project

    def get_projects(self, status_filter: Optional[str] = None,
                    community_name: Optional[str] = None,
                    page: int = 1, page_size: int = 50) -> Dict[str, Any]:
        """获取项目列表"""
        query = self.db.query(Project)

        # 默认不显示已删除的项目
        if status_filter:
            query = query.filter(Project.status == status_filter)
        else:
            query = query.filter(Project.status != ProjectStatus.DELETED.value)

        if community_name:
            query = query.filter(Project.community_name.contains(community_name))

        total = query.count()
        projects = query.order_by(Project.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

        # 计算每个项目的净现金流
        for project in projects:
            project.net_cash_flow = self._calculate_net_cash_flow(project.id)

        return {
            "items": projects,
            "total": total,
            "page": page,
            "page_size": page_size
        }

    def update_project(self, project_id: str, update_data: ProjectUpdate) -> Project:
        """更新项目信息"""
        project = self.get_project(project_id)

        # 更新字段
        update_dict = update_data.dict(exclude_unset=True)
        
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
            setattr(project, field, value)

        self.db.commit()
        self.db.refresh(project)
        return project

    def delete_project(self, project_id: str) -> None:
        """删除项目 (软删除)"""
        project = self.get_project(project_id)
        project.status = ProjectStatus.DELETED.value
        project.status_changed_at = datetime.utcnow()
        self.db.commit()

    # ========== 项目状态流转 ==========

    def update_status(self, project_id: str, status_update: StatusUpdate) -> Project:
        """更新项目状态"""
        project = self.get_project(project_id)
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

    def complete_project(self, project_id: str, complete_data: ProjectCompleteRequest) -> Project:
        """完成项目"""
        project = self.get_project(project_id)

        # 验证当前状态：允许从在售或已售状态标记为已售
        if project.status != ProjectStatus.SELLING.value and project.status != ProjectStatus.SOLD.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="只有在售或已售阶段的项目才能标记为已售"
            )

        # 更新项目信息
        project.status = ProjectStatus.SOLD.value
        project.sale_price = complete_data.sold_price
        project.sold_at = complete_data.sold_date
        project.status_changed_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(project)
        return project

    def update_renovation_stage(self, project_id: str, renovation_data: RenovationUpdate) -> Project:
        """更新改造阶段"""
        project = self.get_project(project_id)

        # 验证当前状态：允许在改造、在售、已售阶段更新改造子阶段
        allowed_statuses = [
            ProjectStatus.RENOVATING.value,
            ProjectStatus.SELLING.value,
            ProjectStatus.SOLD.value
        ]
        if project.status not in allowed_statuses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="只有在改造、在售或已售阶段才能更新改造子阶段"
            )

        # 更新改造阶段
        project.renovation_stage = renovation_data.renovation_stage.value
        project.stage_completed_at = renovation_data.stage_completed_at

        self.db.commit()
        self.db.refresh(project)
        return project

    def update_sales_roles(self, project_id: str, roles_data: SalesRolesUpdate) -> Project:
        """更新销售角色"""
        project = self.get_project(project_id)

        # 验证当前状态
        if project.status != ProjectStatus.SELLING.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="只有在售阶段才能更新销售角色"
            )

        # 更新销售角色
        update_dict = roles_data.dict(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(project, field, value)

        self.db.commit()
        self.db.refresh(project)
        return project

    # ========== 改造阶段管理 ==========

    def add_renovation_photo(self, project_id: str, stage: str, url: str,
                           filename: Optional[str] = None,
                           description: Optional[str] = None) -> RenovationPhoto:
        """添加改造阶段照片"""
        project = self.get_project(project_id)

        # 验证当前状态：允许在改造、在售、已售阶段上传改造照片
        allowed_statuses = [
            ProjectStatus.RENOVATING.value,
            ProjectStatus.SELLING.value,
            ProjectStatus.SOLD.value
        ]
        if project.status not in allowed_statuses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="只有在改造、在售或已售阶段才能上传改造照片"
            )

        photo = RenovationPhoto(
            project_id=project_id,
            stage=stage,
            url=url,
            filename=filename,
            description=description
        )
        self.db.add(photo)
        self.db.commit()
        self.db.refresh(photo)
        return photo

    def get_renovation_photos(self, project_id: str, stage: Optional[str] = None) -> List[RenovationPhoto]:
        """获取改造阶段照片"""
        query = self.db.query(RenovationPhoto).filter(RenovationPhoto.project_id == project_id,RenovationPhoto.deleted_at.is_(None))
        if stage:
            query = query.filter(RenovationPhoto.stage == stage)
        return query.order_by(RenovationPhoto.created_at.desc()).all()
    
    # [新增] 删除方法
    def delete_renovation_photo(self, project_id: str, photo_id: str) -> None:
        """删除改造阶段照片 (软删除)"""
        photo = self.db.query(RenovationPhoto).filter(
            RenovationPhoto.id == photo_id,
            RenovationPhoto.project_id == project_id
        ).first()

        if not photo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="照片不存在"
            )

        # [新增] 核心：不真删，只标记时间
        photo.deleted_at = datetime.utcnow()
        self.db.commit()

    # ========== 销售记录管理 ==========

    def create_sales_record(self, project_id: str, record_data: SalesRecordCreate) -> SalesRecord:
        """创建销售记录"""
        project = self.get_project(project_id)

        # 验证当前状态
        if project.status != ProjectStatus.SELLING.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="只有在售阶段才能添加销售记录"
            )

        record = SalesRecord(
            project_id=project_id,
            record_type=record_data.record_type.value,
            customer_name=record_data.customer_name,
            customer_phone=record_data.customer_phone,
            customer_info=record_data.customer_info,
            record_date=record_data.record_date,
            record_time=record_data.record_time,
            price=record_data.price,
            notes=record_data.notes,
            feedback=record_data.feedback,
            result=record_data.result,
            related_agent=record_data.related_agent
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def get_sales_records(self, project_id: str, record_type: Optional[str] = None) -> List[SalesRecord]:
        """获取销售记录"""
        query = self.db.query(SalesRecord).filter(SalesRecord.project_id == project_id)
        if record_type:
            query = query.filter(SalesRecord.record_type == record_type)
        return query.order_by(SalesRecord.record_date.desc(), SalesRecord.created_at.desc()).all()

    def delete_sales_record(self, project_id: str, record_id: str) -> None:
        """删除销售记录"""
        record = self.db.query(SalesRecord).filter(
            SalesRecord.id == record_id,
            SalesRecord.project_id == project_id
        ).first()

        if not record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="销售记录不存在"
            )

        self.db.delete(record)
        self.db.commit()

    # ========== 统计功能 ==========

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

    # ========== 私有方法 ==========

    def _validate_status_transition(self, current_status: str, new_status: str) -> None:
        """验证状态流转合法性"""
        # 允许更灵活的状态流转，特别是允许从高级阶段切换回低级阶段修改信息
        # 允许在售和已售状态之间直接切换
        # 允许从任何状态切换到相同状态（幂等操作）
        # 允许正常的单向流转
        
        # 特殊规则：只限制除了在售状态外，其他状态不能切换到已售状态
        if new_status == ProjectStatus.SOLD.value and current_status != ProjectStatus.SELLING.value and current_status != ProjectStatus.SOLD.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="只有在售或已售状态才能切换到已售状态"
            )
        
        # 其他状态流转规则：
        # 1. 已售 → 在售：允许直接切换
        # 2. 在售 → 已售：允许直接切换
        # 3. 其他状态间的切换保持灵活性
        # 4. 允许从高级阶段切换回低级阶段修改信息

    def _calculate_net_cash_flow(self, project_id: str) -> Decimal:
        """计算项目净现金流"""
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

    def get_project_report(self, project_id: str) -> Dict[str, Any]:
        """获取项目报告"""
        project = self.get_project(project_id)

        # 计算财务数据
        cashflow_stats = self._get_cashflow_stats(project_id)

        # 构建报告
        report = {
            "project_id": project.id,
            "project_name": project.name,
            "status": project.status,
            "address": project.address,
            "signing_date": project.created_at if project.status != ProjectStatus.SIGNING.value else None,
            "renovation_start_date": project.status_changed_at if project.status == ProjectStatus.RENOVATING.value else None,
            "renovation_end_date": project.stage_completed_at if project.renovation_stage == RenovationStage.DELIVERY.value else None,
            "listing_date": project.status_changed_at if project.status == ProjectStatus.SELLING.value else None,
            "sold_date": project.sold_at,
            "total_investment": cashflow_stats["total_expense"],
            "total_income": cashflow_stats["total_income"],
            "net_profit": cashflow_stats["net_cash_flow"],
            "roi": cashflow_stats["roi"],
            "sale_price": project.sale_price,
            "list_price": project.list_price
        }

        return report

    def _get_cashflow_stats(self, project_id: str) -> Dict[str, Decimal]:
        """获取现金流统计"""
        # 使用更简单的查询方式
        income_result = self.db.query(func.sum(CashFlowRecord.amount)).filter(
            CashFlowRecord.project_id == project_id,
            CashFlowRecord.type == "income"
        ).first()

        expense_result = self.db.query(func.sum(CashFlowRecord.amount)).filter(
            CashFlowRecord.project_id == project_id,
            CashFlowRecord.type == "expense"
        ).first()

        total_income = income_result[0] or Decimal('0')
        total_expense = expense_result[0] or Decimal('0')
        net_cash_flow = total_income - total_expense
        roi = float((net_cash_flow / total_expense)) if total_expense > 0 else 0.0

        return {
            "total_income": total_income,
            "total_expense": total_expense,
            "net_cash_flow": net_cash_flow,
            "roi": roi
        }