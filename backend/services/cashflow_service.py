"""
现金流业务逻辑服务
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from fastapi import HTTPException, status
import logging

from models import CashFlowRecord, Project
from models.base import CashFlowType, CashFlowCategory

# 配置日志记录
logger = logging.getLogger(__name__)


class CashFlowService:
    """现金流业务逻辑服务"""

    def __init__(self, db: Session):
        self.db = db

    def create_cashflow_record(self, project_id: str, record_data) -> CashFlowRecord:
        """创建现金流记录"""
        logger.info(f"Creating cashflow record for project {project_id}")
        
        # 验证项目存在且状态有效
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            logger.error(f"Project not found: {project_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="项目不存在"
            )

        # 验证现金流类型和分类匹配
        try:
            self._validate_cashflow_category(record_data.type, record_data.category)
        except HTTPException as e:
            logger.error(f"Cashflow category validation failed: {e.detail}")
            raise

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
        
        logger.info(f"Cashflow record created successfully: {record.id}")
        return record

    def get_cashflow_records(self, project_id: str) -> List[CashFlowRecord]:
        """获取项目现金流记录"""
        logger.info(f"Getting cashflow records for project {project_id}")
        try:
            records = self.db.query(CashFlowRecord).filter(
                CashFlowRecord.project_id == project_id
            ).order_by(CashFlowRecord.date.desc(), CashFlowRecord.created_at.desc()).all()
            logger.info(f"Found {len(records)} cashflow records for project {project_id}")
            return records
        except Exception as e:
            logger.error(f"Error getting cashflow records for project {project_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="获取现金流记录失败"
            )

    def delete_cashflow_record(self, record_id: str, project_id: str) -> None:
        """删除现金流记录"""
        logger.info(f"Deleting cashflow record {record_id} for project {project_id}")
        
        record = self.db.query(CashFlowRecord).filter(
            CashFlowRecord.id == record_id,
            CashFlowRecord.project_id == project_id
        ).first()

        if not record:
            logger.error(f"Cashflow record not found: {record_id} for project {project_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="现金流记录不存在"
            )

        self.db.delete(record)
        self.db.commit()
        
        logger.info(f"Cashflow record deleted successfully: {record_id}")

    def get_cashflow_summary(self, project_id: str) -> Dict[str, Any]:
        """获取现金流汇总"""
        logger.info(f"Getting cashflow summary for project {project_id}")
        
        try:
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
            
            # 使用Decimal进行精确计算，避免浮点数精度问题
            roi = (net_cash_flow / total_expense) if total_expense > 0 else Decimal('0.0')
            
            # 保留两位小数
            roi = roi.quantize(Decimal('0.00'))

            summary = {
                "total_income": total_income,
                "total_expense": total_expense,
                "net_cash_flow": net_cash_flow,
                "roi": float(roi)  # 转换为float返回给前端，但内部计算使用Decimal确保精度
            }
            
            logger.info(f"Cashflow summary calculated for project {project_id}: {summary}")
            return summary
        except Exception as e:
            logger.error(f"Error calculating cashflow summary for project {project_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="计算现金流汇总失败"
            )

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