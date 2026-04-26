"""
项目财务业务服务

负责：项目财务计算、现金流记录管理、财务报告生成
注意：已适配新的规范化表结构，财务流水使用 FinanceRecord 表
"""
from typing import Dict, Any, List
from decimal import Decimal
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from fastapi import HTTPException, status
import logging

from models import FinanceRecord, Project, ProjectContract, ProjectSale
from models.common import CashFlowType, CashFlowCategory

logger = logging.getLogger(__name__)


class FinanceService:
    """项目财务服务"""

    def __init__(self, db: Session) -> None:
        self.db = db

    def create_record(self, project_id: str, record_data) -> FinanceRecord:
        """创建现金流记录"""
        logger.info(f"Creating cashflow record for project {project_id}")

        # 验证项目存在且状态有效
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted == False).first()
        if not project:
            logger.error(f"Project not found: {project_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="项目不存在"
            )

        # 验证现金流类型和分类匹配
        try:
            self._validate_category(record_data.type, record_data.category)
        except HTTPException as e:
            logger.error(f"Cashflow category validation failed: {e.detail}")
            raise

        # 创建新的 FinanceRecord
        record = FinanceRecord(
            project_id=project_id,
            type=record_data.type.value,
            category=record_data.category.value,
            amount=record_data.amount,
            record_date=record_data.date,
            remark=record_data.description,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)

        # 创建成功后，触发财务数据同步计算
        try:
            self.sync_financials(project_id)
            logger.info(f"Project financials synced for project {project_id}")
        except Exception as e:
            logger.error(f"Failed to sync project financials: {str(e)}")

        logger.info(f"Cashflow record created successfully: {record.id}")
        return record

    def get_records(self, project_id: str) -> List[FinanceRecord]:
        """获取项目现金流记录"""
        logger.info(f"Getting cashflow records for project {project_id}")
        try:
            records = self.db.query(FinanceRecord).filter(
                FinanceRecord.project_id == project_id
            ).order_by(FinanceRecord.record_date.desc(), FinanceRecord.created_at.desc()).all()
            logger.info(f"Found {len(records)} cashflow records for project {project_id}")
            return records
        except Exception as e:
            logger.error(f"Error getting cashflow records for project {project_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="获取现金流记录失败"
            )

    def delete_record(self, record_id: str, project_id: str) -> None:
        """删除现金流记录"""
        logger.info(f"Deleting cashflow record {record_id} for project {project_id}")

        record = self.db.query(FinanceRecord).filter(
            FinanceRecord.id == record_id,
            FinanceRecord.project_id == project_id
        ).first()

        if not record:
            logger.error(f"Cashflow record not found: {record_id} for project {project_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="现金流记录不存在"
            )

        self.db.delete(record)
        self.db.commit()

        # 删除成功后，触发财务数据同步计算
        try:
            self.sync_financials(project_id)
            logger.info(f"Project financials synced for project {project_id}")
        except Exception as e:
            logger.error(f"Failed to sync project financials: {str(e)}")

        logger.info(f"Cashflow record deleted successfully: {record_id}")

    def get_summary(self, project_id: str) -> Dict[str, Any]:
        """获取现金流汇总"""
        logger.info(f"Getting cashflow summary for project {project_id}")

        try:
            # 1. 获取项目基本信息用于日期计算
            project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted == False).first()
            if not project:
                raise HTTPException(status_code=404, detail="项目不存在")

            # 从 ProjectContract 获取签约日期
            contract = self.db.query(ProjectContract).filter(
                ProjectContract.project_id == project_id
            ).first()

            # 从 ProjectSale 获取成交日期
            sale = self.db.query(ProjectSale).filter(
                ProjectSale.project_id == project_id
            ).first()

            # 2. 聚合计算收入支出
            result = self.db.query(
                func.sum(
                    case(
                        (FinanceRecord.type == "income", FinanceRecord.amount),
                        else_=0
                    )
                ).label("total_income"),
                func.sum(
                    case(
                        (FinanceRecord.type == "expense", FinanceRecord.amount),
                        else_=0
                    )
                ).label("total_expense")
            ).filter(FinanceRecord.project_id == project_id).first()

            total_income = result.total_income or Decimal('0')
            total_expense = result.total_expense or Decimal('0')
            net_cash_flow = total_income - total_expense

            # 3. 计算 ROI
            roi_decimal = (net_cash_flow / total_expense) if total_expense > 0 else Decimal('0.0')
            roi = float(roi_decimal * 100)

            # 4. 计算资金占用天数
            holding_days = 0
            start_date = contract.signing_date if contract else project.created_at

            if start_date:
                end_date = datetime.now()
                if project.status == "sold" and sale and sale.sold_date:
                    end_date = sale.sold_date

                delta = end_date.date() - start_date.date()
                holding_days = max(delta.days, 0)

            # 5. 计算年化收益率
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

    def sync_financials(self, project_id: str) -> None:
        """
        同步计算项目的财务数据，并更新到 Project 表的缓存字段中
        """
        # 1. 确认项目存在
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted == False).first()
        if not project:
            return

        # 2. 聚合计算总收入
        income_res = self.db.query(func.sum(FinanceRecord.amount)).filter(
            FinanceRecord.project_id == project_id,
            FinanceRecord.type == "income"
        ).scalar()
        total_income = income_res if income_res else Decimal(0)

        # 3. 聚合计算总支出
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

    def get_report(self, project_id: str) -> Dict[str, Any]:
        """获取项目财务报告"""
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted == False).first()
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
            "renovation_start_date": project.updated_at if project.status == "renovating" else None,
            "listing_date": sale.listing_date if sale else None,
            "sold_date": sale.sold_date if sale else None,
            "total_investment": total_expense,
            "total_income": total_income,
            "net_profit": net_profit,
            "roi": roi,
            "sale_price": float(sale.sold_price) if sale and sale.sold_price else None,
            "list_price": float(sale.list_price) if sale and sale.list_price else None,
            "signing_price": float(contract.signing_price) if contract and contract.signing_price else None,
        }

    def _validate_category(self, flow_type: CashFlowType, category: CashFlowCategory) -> None:
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


    # 别名方法 - 与路由兼容
    def get_cashflow_records(self, project_id: str) -> List[FinanceRecord]:
        """获取项目现金流记录（路由兼容别名）"""
        return self.get_records(project_id)

    def get_cashflow_summary(self, project_id: str) -> Dict[str, Any]:
        """获取现金流汇总（路由兼容别名）"""
        return self.get_summary(project_id)

    def create_cashflow_record(self, project_id: str, record_data) -> FinanceRecord:
        """创建现金流记录（路由兼容别名）"""
        return self.create_record(project_id, record_data)

    def delete_cashflow_record(self, record_id: str, project_id: str) -> None:
        """删除现金流记录（路由兼容别名）"""
        return self.delete_record(record_id, project_id)


# 保持向后兼容的别名
ProjectFinanceService = FinanceService
CashFlowService = FinanceService
