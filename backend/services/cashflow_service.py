"""
现金流业务逻辑服务
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from fastapi import HTTPException, status

from models import CashFlowRecord, Project
from models.base import CashFlowType, CashFlowCategory


class CashFlowService:
    """现金流业务逻辑服务"""

    def __init__(self, db: Session):
        self.db = db

    def create_cashflow_record(self, project_id: str, record_data) -> CashFlowRecord:
        """创建现金流记录"""
        # 验证项目存在且状态有效
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="项目不存在"
            )

        # 验证现金流类型和分类匹配
        self._validate_cashflow_category(record_data.type, record_data.category)

        record = CashFlowRecord(
            project_id=project_id,
            type=record_data.type.value,
            category=record_data.category.value,
            amount=record_data.amount,
            date=record_data.date,
            description=record_data.description,
            related_stage=record_data.related_stage
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def get_cashflow_records(self, project_id: str) -> List[CashFlowRecord]:
        """获取项目现金流记录"""
        return self.db.query(CashFlowRecord).filter(
            CashFlowRecord.project_id == project_id
        ).order_by(CashFlowRecord.date.desc(), CashFlowRecord.created_at.desc()).all()

    def delete_cashflow_record(self, record_id: str, project_id: str) -> None:
        """删除现金流记录"""
        record = self.db.query(CashFlowRecord).filter(
            CashFlowRecord.id == record_id,
            CashFlowRecord.project_id == project_id
        ).first()

        if not record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="现金流记录不存在"
            )

        self.db.delete(record)
        self.db.commit()

    def get_cashflow_summary(self, project_id: str) -> Dict[str, Any]:
        """获取现金流汇总"""
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
        net_cash_flow = total_income - total_expense
        roi = float((net_cash_flow / total_expense)) if total_expense > 0 else 0.0

        return {
            "total_income": total_income,
            "total_expense": total_expense,
            "net_cash_flow": net_cash_flow,
            "roi": roi
        }

    def _validate_cashflow_category(self, flow_type: CashFlowType, category: CashFlowCategory) -> None:
        """验证现金流类型和分类是否匹配"""
        expense_categories = {
            CashFlowCategory.PERFORMANCE_BOND,
            CashFlowCategory.AGENCY_COMMISSION,
            CashFlowCategory.RENOVATION_FEE,
            CashFlowCategory.MARKETING_FEE,
            CashFlowCategory.OTHER_EXPENSE,
            CashFlowCategory.TAX_FEE,
            CashFlowCategory.OPERATION_FEE,
        }

        income_categories = {
            CashFlowCategory.BOND_RETURN,
            CashFlowCategory.PREMIUM,
            CashFlowCategory.SERVICE_FEE,
            CashFlowCategory.OTHER_INCOME,
            CashFlowCategory.SALE_PRICE,
        }

        if flow_type == CashFlowType.EXPENSE and category not in expense_categories:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"支出类型不能使用分类: {category.value}"
            )

        if flow_type == CashFlowType.INCOME and category not in income_categories:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"收入类型不能使用分类: {category.value}"
            )