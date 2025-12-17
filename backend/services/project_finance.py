"""
项目财务业务服务
负责：现金流统计、报表生成
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

    def get_project_report(self, project_id: str) -> Dict[str, Any]:
        """获取项目报告"""
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="项目不存在"
            )

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