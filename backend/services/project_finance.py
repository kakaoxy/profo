"""
项目财务业务服务
负责：现金流统计、报表生成、财务数据同步
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
        [核心优化 - 写时计算] 
        同步计算项目的财务数据，并更新到 Project 表的缓存字段中。
        
        调用时机：
        必须在 CashFlowRecord 的 Create/Update/Delete 操作 commit 之后调用此方法。
        """
        # 1. 计算总收入 (Income)
        # 使用 func.sum 聚合查询，如果结果为 None (无记录) 则默认为 0
        income_res = self.db.query(func.sum(CashFlowRecord.amount)).filter(
            CashFlowRecord.project_id == project_id,
            CashFlowRecord.type == "income"
        ).scalar()
        total_income = income_res if income_res else Decimal(0)

        # 2. 计算总支出 (Expense)
        expense_res = self.db.query(func.sum(CashFlowRecord.amount)).filter(
            CashFlowRecord.project_id == project_id,
            CashFlowRecord.type == "expense"
        ).scalar()
        total_expense = expense_res if expense_res else Decimal(0)

        # 3. 计算净利润 (Net Cash Flow)
        net_cash_flow = total_income - total_expense

        # 4. 计算 ROI (投资回报率)
        # 逻辑：(净利润 / 总投入) * 100
        roi = 0.0
        if total_expense > 0:
            roi = float((net_cash_flow / total_expense) * 100)

        # 5. 更新 Project 表
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if project:
            project.total_income = total_income
            project.total_expense = total_expense
            project.net_cash_flow = net_cash_flow
            project.roi = roi
            
            self.db.add(project)
            self.db.commit() # 提交更新
            self.db.refresh(project) # 刷新对象以获取最新数据

    def get_project_report(self, project_id: str) -> Dict[str, Any]:
        """
        [核心优化 - 读时直接取]
        获取项目报告。
        不再进行实时聚合计算，而是直接读取 Project 表中的缓存字段。
        响应时间复杂度从 O(N) 降低为 O(1)。
        """
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="项目不存在"
            )

        # 构建报告
        # 注意：这里的 total_investment 等字段直接读取自 project 对象
        report = {
            "project_id": project.id,
            "project_name": project.name,
            "status": project.status,
            "address": project.address,
            
            # 时间节点
            "signing_date": project.created_at if project.status != ProjectStatus.SIGNING.value else None,
            "renovation_start_date": project.status_changed_at if project.status == ProjectStatus.RENOVATING.value else None,
            "renovation_end_date": project.stage_completed_at if project.renovation_stage == RenovationStage.DELIVERY.value else None,
            "listing_date": project.status_changed_at if project.status == ProjectStatus.SELLING.value else None,
            "sold_date": project.sold_at,
            
            # [优化] 直接使用缓存字段，无需再调用 _get_cashflow_stats
            "total_investment": project.total_expense, # 累计支出即为总投入
            "total_income": project.total_income,
            "net_profit": project.net_cash_flow,
            "roi": project.roi,
            
            "sale_price": project.sale_price,
            "list_price": project.list_price
        }

        return report