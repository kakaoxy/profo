"""
backend/services/project_finance.py
项目财务业务服务
"""
from typing import Dict, Any
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException, status

from models import Project, CashFlowRecord
from models.base import ProjectStatus, RenovationStage

class ProjectFinanceService:
    def __init__(self, db: Session):
        self.db = db

    def sync_project_financials(self, project_id: str):
        """
        [核心同步逻辑] 
        同步计算项目的财务数据，并更新到 Project 表的缓存字段中。
        """
        # 1. 确认项目存在
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return

        # 2. 聚合计算总收入 (Income)
  
        income_res = self.db.query(func.sum(CashFlowRecord.amount)).filter(
            CashFlowRecord.project_id == project_id,
            CashFlowRecord.type == "income"  
        ).scalar()
        total_income = income_res if income_res else Decimal(0)

        # 3. 聚合计算总支出 (Expense)
        expense_res = self.db.query(func.sum(CashFlowRecord.amount)).filter(
            CashFlowRecord.project_id == project_id,
            CashFlowRecord.type == "expense" 
        ).scalar()
        total_expense = expense_res if expense_res else Decimal(0)

        # 4. 计算净利润
        net_cash_flow = total_income - total_expense

        # 5. 计算 ROI
        roi = 0.0
        if total_expense > 0:
            roi = float((net_cash_flow / total_expense) * 100)

        # 6. 更新并保存
        project.total_income = total_income
        project.total_expense = total_expense
        project.net_cash_flow = net_cash_flow
        project.roi = roi
            
        self.db.add(project)
        self.db.commit()
        # 不需要 refresh，因为这是后台同步任务

    def get_project_report(self, project_id: str) -> Dict[str, Any]:
        """
        获取项目报告 (读操作 - O(1) 复杂度)
        """
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="项目不存在"
            )

        return {
            "project_id": project.id,
            "project_name": project.name,
            "status": project.status,
            "address": project.address,
            "signing_date": project.created_at if project.status != ProjectStatus.SIGNING.value else None,
            "renovation_start_date": project.status_changed_at if project.status == ProjectStatus.RENOVATING.value else None,
            "renovation_end_date": project.stage_completed_at if project.renovation_stage == RenovationStage.DELIVERY.value else None,
            "listing_date": project.status_changed_at if project.status == ProjectStatus.SELLING.value else None,
            "sold_date": project.sold_at,
            
            # 直接读取缓存字段
            "total_investment": project.total_expense,
            "total_income": project.total_income,
            "net_profit": project.net_cash_flow,
            "roi": project.roi,
            
            "sale_price": project.sale_price,
            "list_price": project.list_price
        }