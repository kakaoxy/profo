"""
项目响应构建器模块
负责将项目模型及其关联数据构建为API响应格式
"""

from typing import Dict, Any, TYPE_CHECKING
from decimal import Decimal

from sqlalchemy.orm import Session

from models import FinanceRecord
from models.common import CashFlowType

if TYPE_CHECKING:
    from models import Project


class ProjectResponseBuilder:
    """
    项目响应数据构建器

    负责将Project模型及其关联数据转换为API响应格式。
    支持构建完整的项目详情响应，包括合同、业主、销售、财务等信息。

    Attributes:
        db: SQLAlchemy数据库会话
    """

    def __init__(self, db: Session):
        """
        初始化响应构建器

        Args:
            db: SQLAlchemy数据库会话
        """
        self.db = db

    def build(self, project: "Project") -> Dict[str, Any]:
        """
        构建完整的项目响应数据

        将项目模型及其关联数据组合成完整的响应字典，包含：
        - 项目基础信息
        - 合同信息
        - 业主信息
        - 销售信息
        - 财务统计
        - 互动记录
        - 装修照片
        - 阶段日期映射

        Args:
            project: Project模型实例

        Returns:
            包含完整项目信息的字典
        """
        response = self._build_base_info(project)
        response.update(self._build_contract_info(project.id))
        response.update(self._build_owner_info(project.id))
        response.update(self._build_sale_info(project.id))
        response.update(self._build_finance_info(project.id))
        response.update(self._build_interactions(project.id))
        response.update(self._build_renovation_photos(project))
        response.update(self._build_stage_dates(project.id))

        return response

    def _build_base_info(self, project: "Project") -> Dict[str, Any]:
        """构建项目基础信息"""
        result = {
            "id": project.id,
            "name": project.name or project.generate_name(),
            "community_name": project.community_name,
            "address": project.address,
            "area": str(project.area) if project.area else None,
            "layout": project.layout,
            "orientation": project.orientation,
            "status": project.status,
            "renovation_stage": project.renovation_stage,
            "is_deleted": project.is_deleted,
            "created_at": project.created_at.isoformat() if project.created_at else None,
            "updated_at": project.updated_at.isoformat() if project.updated_at else None,
        }

        # 添加项目负责人信息
        if project.project_manager:
            result["project_manager"] = {
                "id": project.project_manager.id,
                "nickname": project.project_manager.nickname,
                "avatar": project.project_manager.avatar,
                "username": project.project_manager.username,
            }
        else:
            result["project_manager"] = None

        return result

    def _build_contract_info(self, project_id: str) -> Dict[str, Any]:
        """构建合同信息"""
        from models import ProjectContract

        contract = self.db.query(ProjectContract).filter(
            ProjectContract.project_id == project_id,
            ProjectContract.is_deleted == False
        ).first()

        if not contract:
            return {}

        return {
            "contract_no": contract.contract_no,
            "signing_price": float(contract.signing_price) if contract.signing_price is not None else None,
            "signing_date": contract.signing_date.strftime('%Y-%m-%d') if contract.signing_date else None,
            "signing_period": contract.signing_period,
            "extension_period": contract.extension_period,
            "extension_rent": float(contract.extension_rent) if contract.extension_rent is not None else None,
            "cost_assumption_type": contract.cost_assumption_type,
            "cost_assumption_other": contract.cost_assumption_other,
            "planned_handover_date": contract.planned_handover_date.strftime('%Y-%m-%d') if contract.planned_handover_date else None,
            "other_agreements": contract.other_agreements,
            "signing_materials": contract.signing_materials,
            "contract_status": contract.contract_status,
        }

    def _build_owner_info(self, project_id: str) -> Dict[str, Any]:
        """构建业主信息"""
        from models import ProjectOwner

        owner = self.db.query(ProjectOwner).filter(
            ProjectOwner.project_id == project_id,
            ProjectOwner.is_deleted == False
        ).first()

        if not owner:
            return {}

        return {
            "owner_name": owner.owner_name,
            "owner_phone": owner.owner_phone,
            "owner_id_card": owner.owner_id_card,
            "owner_info": owner.owner_info,
        }

    def _build_sale_info(self, project_id: str) -> Dict[str, Any]:
        """构建销售信息"""
        from models import ProjectSale

        sale = self.db.query(ProjectSale).filter(
            ProjectSale.project_id == project_id,
            ProjectSale.is_deleted == False
        ).first()

        if not sale:
            return {}

        return {
            "listing_date": sale.listing_date.strftime('%Y-%m-%d') if sale.listing_date else None,
            "list_price": float(sale.list_price) if sale.list_price else None,
            "sold_date": sale.sold_date.strftime('%Y-%m-%d') if sale.sold_date else None,
            "sold_price": float(sale.sold_price) if sale.sold_price else None,
            "transaction_status": sale.transaction_status,
            "channel_manager_id": sale.channel_manager_id,
            "property_agent_id": sale.property_agent_id,
            "negotiator_id": sale.negotiator_id,
        }

    def _build_finance_info(self, project_id: str) -> Dict[str, Any]:
        """构建财务统计信息"""
        finance_records = self.db.query(FinanceRecord).filter(
            FinanceRecord.project_id == project_id
        ).all()

        total_income = Decimal(0)
        total_expense = Decimal(0)

        for record in finance_records:
            if record.type == CashFlowType.INCOME.value:
                total_income += record.amount
            else:
                total_expense += record.amount

        net_cash_flow = total_income - total_expense
        roi = float(net_cash_flow / total_expense * 100) if total_expense > 0 else 0.0

        return {
            "total_income": float(total_income),
            "total_expense": float(total_expense),
            "net_cash_flow": float(net_cash_flow),
            "roi": roi,
        }

    def _build_interactions(self, project_id: str) -> Dict[str, Any]:
        """构建互动记录（销售记录）"""
        from models import ProjectInteraction

        interactions = self.db.query(ProjectInteraction).filter(
            ProjectInteraction.project_id == project_id
        ).order_by(ProjectInteraction.interaction_at.desc()).all()

        if not interactions:
            return {}

        sales_records = []
        for interaction in interactions:
            sales_records.append({
                "id": interaction.id,
                "project_id": interaction.project_id,
                "record_type": interaction.record_type,
                "customer_name": interaction.interaction_target,
                "record_date": interaction.interaction_at.isoformat() if interaction.interaction_at else None,
                "price": float(interaction.price) if interaction.price else None,
                "notes": interaction.content,
                "created_at": interaction.created_at.isoformat() if interaction.created_at else None,
            })

        return {"sales_records": sales_records}

    def _build_renovation_photos(self, project: "Project") -> Dict[str, Any]:
        """构建装修照片（蜕变影像）"""
        if not project.renovation_photos:
            return {}

        renovation_photos = []
        for photo in project.renovation_photos:
            renovation_photos.append({
                "id": photo.id,
                "project_id": photo.project_id,
                "stage": photo.stage,
                "url": photo.url,
                "filename": photo.filename,
                "description": photo.description,
                "created_at": photo.created_at.isoformat() if photo.created_at else None,
            })

        return {"renovation_photos": renovation_photos}

    def _build_stage_dates(self, project_id: str) -> Dict[str, Any]:
        """构建阶段日期映射（用于蜕变影像展示）"""
        from models import ProjectRenovation
        from datetime import datetime

        renovation = self.db.query(ProjectRenovation).filter(
            ProjectRenovation.project_id == project_id
        ).first()

        if not renovation or not renovation.stage_completed_dates:
            return {}

        stage_dates = {}

        # 严格从 stage_completed_dates JSON 字段读取各阶段完成日期
        # 只有真正完成并提交的阶段才会被记录为已完成
        for stage_name, date_value in renovation.stage_completed_dates.items():
            if date_value:
                # 统一日期格式为 YYYY-MM-DD
                if isinstance(date_value, str):
                    stage_dates[stage_name] = date_value
                elif isinstance(date_value, datetime):
                    stage_dates[stage_name] = date_value.strftime('%Y-%m-%d')

        return {"renovation_stage_dates": stage_dates} if stage_dates else {}
