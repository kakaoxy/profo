"""
项目销售业务服务
负责：销售团队管理、带看/出价/面谈记录、成交确认
"""
from typing import Optional, List
from datetime import datetime
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from models import Project, SalesRecord
from models.base import ProjectStatus
from schemas.project_sales import SalesRecordCreate, SalesRolesUpdate, ProjectCompleteRequest
from schemas.project import ProjectResponse

class ProjectSalesService:
    def __init__(self, db: Session):
        self.db = db

    def _get_project(self, project_id: str) -> Project:
        """内部辅助：获取项目实例"""
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="项目不存在"
            )
        return project

    # ========== 销售团队管理 ==========

    def update_sales_roles(self, project_id: str, roles_data: SalesRolesUpdate) -> ProjectResponse:
        """更新销售角色 (渠道、讲房、谈判)"""
        project = self._get_project(project_id)

        # 验证当前状态：只有在售阶段才建议修改，但业务上允许随时调整，这里可保留或注释
        if project.status != ProjectStatus.SELLING.value:
             # 也可以选择放宽限制，允许管理员随时改
             pass

        update_dict = roles_data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            if hasattr(project, field):
                setattr(project, field, value)

        self.db.commit()
        self.db.refresh(project)
        return ProjectResponse.model_validate(project)

    # ========== 销售记录管理 (带看/出价/面谈) ==========

    def create_sales_record(self, project_id: str, record_data: SalesRecordCreate) -> SalesRecord:
        """创建销售记录"""
        project = self._get_project(project_id)

        # 严格校验：非在售阶段通常不应该添加带看记录
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
        """获取销售记录列表"""
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

    # ========== 成交逻辑 ==========

    def complete_project(self, project_id: str, complete_data: ProjectCompleteRequest) -> ProjectResponse:
        """确认成交 (标记为已售)"""
        project = self._get_project(project_id)

        # 允许从 在售 或 已售(修改信息) 状态操作
        if project.status not in [ProjectStatus.SELLING.value, ProjectStatus.SOLD.value]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="只有在售或已售阶段的项目才能标记为已售"
            )

        # 更新状态和核心成交数据
        project.status = ProjectStatus.SOLD.value
        project.soldPrice = complete_data.sold_price 
        project.soldDate = complete_data.sold_date
        project.sold_at = complete_data.sold_date
        project.status_changed_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(project)
        return ProjectResponse.model_validate(project)