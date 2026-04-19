"""
backend/services/project_finance.py
项目财务业务服务

注意：已适配新的规范化表结构，财务流水使用 FinanceRecord 表
"""
from typing import Dict, Any
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException, status

from models import Project, ProjectContract, ProjectSale, FinanceRecord
from models.base import ProjectStatus, RenovationStage


class ProjectFinanceService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def sync_project_financials(self, project_id: str) -> None:
        """
        [核心同步逻辑]
        同步计算项目的财务数据，并更新到 Project 表的缓存字段中。
        现在从 FinanceRecord 表读取数据。
        """
        # 1. 确认项目存在
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return

        # 2. 聚合计算总收入 (Income) - 使用新的 FinanceRecord 表
        income_res = self.db.query(func.sum(FinanceRecord.amount)).filter(
            FinanceRecord.project_id == project_id,
            FinanceRecord.type == "income"
        ).scalar()
        total_income = income_res if income_res else Decimal(0)

        # 3. 聚合计算总支出 (Expense)
        expense_res = self.db.query(func.sum(FinanceRecord.amount)).filter(
            FinanceRecord.project_id == project_id,
            FinanceRecord.type == "expense"
        ).scalar()
        total_expense = expense_res if expense_res else Decimal(0)

        # 4. 计算净利润
        net_cash_flow = total_income - total_expense

        # 5. 计算 ROI
        roi = 0.0
        if total_expense > 0:
            roi = float((net_cash_flow / total_expense) * 100)

        # 6. 更新并保存到项目缓存字段
        project.total_income = total_income
        project.total_expense = total_expense
        project.net_cash_flow = net_cash_flow
        project.roi = roi

        self.db.add(project)
        self.db.commit()

    def get_project_report(self, project_id: str) -> Dict[str, Any]:
        """
        获取项目报告 (读操作 - O(1) 复杂度)
        从新的规范化表读取数据
        """
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="项目不存在"
            )

        # 从 ProjectContract 获取签约价格
        contract = self.db.query(ProjectContract).filter(
            ProjectContract.project_id == project_id
        ).first()

        # 从 ProjectSale 获取销售价格
        sale = self.db.query(ProjectSale).filter(
            ProjectSale.project_id == project_id
        ).first()

        # 实时计算财务数据
        income_res = self.db.query(func.sum(FinanceRecord.amount)).filter(
            FinanceRecord.project_id == project_id,
            FinanceRecord.type == "income"
        ).scalar()
        total_income = float(income_res) if income_res else 0

        expense_res = self.db.query(func.sum(FinanceRecord.amount)).filter(
            FinanceRecord.project_id == project_id,
            FinanceRecord.type == "expense"
        ).scalar()
        total_expense = float(expense_res) if expense_res else 0

        net_profit = total_income - total_expense
        roi = (net_profit / total_expense * 100) if total_expense > 0 else 0

        return {
            "project_id": project.id,
            "community_name": project.community_name,
            "status": project.status,
            "address": project.address,
            "signing_date": contract.signing_date if contract else None,
            "renovation_start_date": project.updated_at if project.status == ProjectStatus.RENOVATING.value else None,
            "listing_date": sale.listing_date if sale else None,
            "sold_date": sale.sold_date if sale else None,

            # 实时计算的财务数据
            "total_investment": total_expense,
            "total_income": total_income,
            "net_profit": net_profit,
            "roi": roi,

            "sale_price": float(sale.sold_price) if sale and sale.sold_price else None,
            "list_price": float(sale.list_price) if sale and sale.list_price else None,
            "signing_price": float(contract.signing_price) if contract and contract.signing_price else None,
        }