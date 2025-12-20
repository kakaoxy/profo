"""
backend/services/cashflow_service.py
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

# [新增] 引入负责计算财务数据的服务
from services.project_finance import ProjectFinanceService

# 配置日志记录
logger = logging.getLogger(__name__)


class CashFlowService:
    """现金流业务逻辑服务"""

    def __init__(self, db: Session):
        self.db = db
        # [新增] 初始化财务服务实例
        self.finance_service = ProjectFinanceService(db)

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
        
        # [关键修复] 创建成功后，触发财务数据同步计算
        # 这会更新 Project 表的 total_income, net_cash_flow 等字段
        try:
            self.finance_service.sync_project_financials(project_id)
            logger.info(f"Project financials synced for project {project_id}")
        except Exception as e:
            # 同步失败不应影响记录创建，记录日志即可
            logger.error(f"Failed to sync project financials: {str(e)}")

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
        
        # [关键修复] 删除成功后，触发财务数据同步计算
        try:
            self.finance_service.sync_project_financials(project_id)
            logger.info(f"Project financials synced for project {project_id}")
        except Exception as e:
            logger.error(f"Failed to sync project financials: {str(e)}")
        
        logger.info(f"Cashflow record deleted successfully: {record_id}")

    def get_cashflow_summary(self, project_id: str) -> Dict[str, Any]:
        """
        获取现金流汇总
        """
        logger.info(f"Getting cashflow summary for project {project_id}")
        
        try:
            # 1. 获取项目基本信息用于日期计算
            project = self.db.query(Project).filter(Project.id == project_id).first()
            if not project:
                raise HTTPException(status_code=404, detail="项目不存在")

            # 2. 聚合计算收入支出
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
            
            # 3. 计算 ROI (转为百分比数值)
            roi_decimal = (net_cash_flow / total_expense) if total_expense > 0 else Decimal('0.0')
            roi = float(roi_decimal * 100)

            # 4. 计算资金占用天数 (Holding Days)
            # 逻辑：已售取 (成交日期 - 签约日期)，未售取 (今天 - 签约日期)
            holding_days = 0
            start_date = project.signing_date or project.created_at
            
            if start_date:
                # 统一转为 date 对象计算天数，忽略时分秒
                end_date = datetime.now()
                # 只有状态为已售且有成交日期时才取成交日期
                if project.status == "sold" and project.soldDate:
                    end_date = project.soldDate
                
                delta = end_date.date() - start_date.date()
                holding_days = max(delta.days, 0)

            # 5. 计算年化收益率 (Annualized Return)
            # 公式：(ROI / 占用天数) * 365
            annualized_return = 0.0
            if holding_days > 0:
                annualized_return = (roi / holding_days) * 365

            summary = {
                "total_income": total_income,
                "total_expense": total_expense,
                "net_cash_flow": net_cash_flow,
                "roi": round(roi, 2),
                "holding_days": holding_days,
                "annualized_return": round(annualized_return, 2)
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