"""项目响应构建器模块.

负责将项目模型及其关联数据构建为API响应格式.

依赖调用方通过 selectinload/joinedload 预加载关联关系以避免 N+1 查询。
"""

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy.orm import Session

from models.common import CashFlowType, ProjectStatus
from utils.mask import mask_bank_card

from . import owners

if TYPE_CHECKING:
    from models import Project


class ProjectResponseBuilder:
    """项目响应数据构建器.

    负责将Project模型及其关联数据转换为API响应格式。
    支持构建完整的项目详情响应，包括合同、业主、销售、财务等信息。

    所有关联数据通过 project 的 relationship 属性访问，由调用方负责
    通过 selectinload/joinedload 预加载以避免 N+1 查询。

    Attributes:
        db: SQLAlchemy数据库会话

    """

    def __init__(self, db: Session) -> None:
        """初始化响应构建器.

        Args:
            db: SQLAlchemy数据库会话

        """
        self.db = db

    def build(self, project: "Project", *, slim: bool = False, include_interactions: bool = False) -> dict[str, Any]:
        """构建项目响应数据.

        将项目模型及其关联数据组合成完整的响应字典.

        Args:
            project: Project模型实例（调用方应预加载所需关联）
            slim: 是否使用精简模式（列表页使用，跳过互动/阶段日期等重量级查询；
                财务统计始终构建，列表页需展示现金流）
            include_interactions: slim模式下是否仍构建互动记录(sales_records)，
                供工作台重点监控卡片展示项目动态(带看/出价)；slim=False 时始终构建

        Returns:
            包含项目信息的字典

        """
        response = self._build_base_info(project)
        response.update(self._build_contract_info(project))
        response.update(self._build_owner_info(project))
        response.update(self._build_owners_list(project))
        response.update(self._build_sale_info(project))
        response.update(self._build_finance_info(project))

        if not slim:
            response.update(self._build_interactions(project))
            response.update(self._build_stage_dates(project))
        elif include_interactions:
            response.update(self._build_interactions(project))

        response.update(self._build_renovation_photos(project))

        return response

    def _build_base_info(self, project: "Project") -> dict[str, Any]:
        """构建项目基础信息."""
        result = {
            "id": project.id,
            "name": project.name or project.generate_name(),
            "community_id": project.community_id,
            "community_name": project.community_name,
            "address": project.address,
            "area": project.area if project.area else None,
            "layout": project.layout,
            "orientation": project.orientation,
            "floor_info": project.floor_info,
            "electricity_account": project.electricity_account,
            "water_account": project.water_account,
            "gas_account": project.gas_account,
            "status": project.status,
            "business_form": project.business_form,
            "commission_start_date": project.commission_start_date,
            "commission_end_date": project.commission_end_date,
            "finance_settlement_status": (
                project.finance_settlement_status.value
                if project.finance_settlement_status
                else "unsettled"
            ),
            "finance_settled_date": project.finance_settled_date,
            "finance_settled_note": project.finance_settled_note,
            "renovation_stage": project.renovation_stage,
            "is_deleted": project.is_deleted,
            "created_at": project.created_at.isoformat() if project.created_at else None,
            "updated_at": project.updated_at.isoformat() if project.updated_at else None,
            "days_on_market": self._compute_days_on_market(project),
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

    def _build_contract_info(self, project: "Project") -> dict[str, Any]:
        """构建合同信息.

        通过预加载的 project.contract 关系访问，过滤软删除记录。
        """
        contract = project.contract

        if not contract or contract.is_deleted:
            return {}

        return {
            "contract_no": contract.contract_no,
            "signing_price": contract.signing_price,
            "signing_date": contract.signing_date.strftime("%Y-%m-%d") if contract.signing_date else None,
            "signing_period": contract.signing_period,
            "extension_period": contract.extension_period,
            "extension_rent": contract.extension_rent,
            "cost_assumption_type": contract.cost_assumption_type,
            "cost_assumption_other": contract.cost_assumption_other,
            "planned_handover_date": (
                contract.planned_handover_date.strftime("%Y-%m-%d") if contract.planned_handover_date else None
            ),
            "other_agreements": contract.other_agreements,
            "signing_materials": contract.signing_materials,
            "contract_status": contract.contract_status,
        }

    def _build_owner_info(self, project: "Project") -> dict[str, Any]:
        """构建业主信息.

        通过预加载的 project.owners 关系访问，过滤软删除记录。
        """
        owner = next((o for o in project.owners if not o.is_deleted), None)

        if not owner:
            return {}

        return {
            "owner_name": owner.owner_name,
            "owner_phone": owner.owner_phone,
            "owner_id_card": owner.owner_id_card,
            "owner_info": owner.owner_info,
        }

    def _build_owners_list(self, project: "Project") -> dict[str, Any]:
        """构建业主列表（含银行卡号脱敏）.

        通过 owners.list_owners 查询项目下未删除业主，
        对 bank_card_number 调用 mask_bank_card 脱敏后返回。
        """
        owner_list = owners.list_owners(self.db, project.id)
        return {
            "owners": [
                {
                    "id": o.id,
                    "project_id": o.project_id,
                    "owner_name": o.owner_name,
                    "owner_phone": o.owner_phone,
                    "owner_id_card": o.owner_id_card,
                    "bank_name": o.bank_name,
                    "bank_card_number": mask_bank_card(o.bank_card_number),
                    "relation_type": o.relation_type,
                    "owner_info": o.owner_info,
                    "is_deleted": o.is_deleted,
                    "created_at": o.created_at.isoformat() if o.created_at else None,
                    "updated_at": o.updated_at.isoformat() if o.updated_at else None,
                }
                for o in owner_list
            ],
        }

    def _build_sale_info(self, project: "Project") -> dict[str, Any]:
        """构建销售信息.

        通过预加载的 project.sale 关系访问，过滤软删除记录。
        """
        sale = project.sale

        if not sale or sale.is_deleted:
            return {}

        return {
            "listing_date": sale.listing_date.strftime("%Y-%m-%d") if sale.listing_date else None,
            "list_price": sale.list_price if sale.list_price else None,
            "sold_date": sale.sold_date.strftime("%Y-%m-%d") if sale.sold_date else None,
            "sold_price": sale.sold_price if sale.sold_price else None,
            "transaction_status": sale.transaction_status,
            "channel_manager_id": sale.channel_manager_id,
            "property_agent_id": sale.property_agent_id,
            "negotiator_id": sale.negotiator_id,
        }

    def _build_finance_info(self, project: "Project") -> dict[str, Any]:
        """构建财务统计信息.

        通过预加载的 project.finance_records 关系访问。
        """
        finance_records = project.finance_records

        total_income = Decimal(0)
        total_expense = Decimal(0)

        for record in finance_records:
            if record.is_deleted:
                continue
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

    def _build_interactions(self, project: "Project") -> dict[str, Any]:
        """构建互动记录（销售记录）.

        通过预加载的 project.interactions 关系访问，按互动时间倒序排列。
        """
        interactions = project.interactions

        if not interactions:
            return {}

        active_interactions = [i for i in interactions if not i.is_deleted]
        if not active_interactions:
            return {}

        sorted_interactions = sorted(active_interactions, key=lambda i: i.interaction_at, reverse=True)

        sales_records = [
            {
                "id": interaction.id,
                "project_id": interaction.project_id,
                "record_type": interaction.record_type,
                "customer_name": interaction.interaction_target,
                "record_date": interaction.interaction_at.isoformat() if interaction.interaction_at else None,
                "price": float(interaction.price) if interaction.price else None,
                "notes": interaction.content,
                "created_at": interaction.created_at.isoformat() if interaction.created_at else None,
            }
            for interaction in sorted_interactions
        ]

        return {"sales_records": sales_records}

    def _build_renovation_photos(self, project: "Project") -> dict[str, Any]:
        """构建装修照片（蜕变影像）.

        过滤软删除记录后再序列化, 与 _build_interactions 保持一致.
        """
        if not project.renovation_photos:
            return {}

        active_photos = [p for p in project.renovation_photos if not p.is_deleted]
        if not active_photos:
            return {}

        renovation_photos = [
            {
                "id": photo.id,
                "project_id": photo.project_id,
                "stage": photo.stage,
                "url": photo.url,
                "filename": photo.filename,
                "description": photo.description,
                "created_at": photo.created_at.isoformat() if photo.created_at else None,
            }
            for photo in active_photos
        ]

        return {"renovation_photos": renovation_photos}

    def _build_stage_dates(self, project: "Project") -> dict[str, Any]:
        """构建阶段日期映射（用于蜕变影像展示）.

        通过预加载的 project.renovation 关系访问。
        """
        renovation = project.renovation

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
                    stage_dates[stage_name] = date_value.strftime("%Y-%m-%d")

        return {"renovation_stage_dates": stage_dates} if stage_dates else {}

    def _compute_days_on_market(self, project: "Project") -> int | None:
        """计算用时天数.

        仅当项目状态为已售(SOLD)且 listing_date 与 sold_date 均非空时计算：
        days_on_market = (sold_date - listing_date).days。否则返回 None（未售/日期缺失）。
        """
        if project.status != ProjectStatus.SOLD.value:
            return None

        sale = project.sale
        if not sale or getattr(sale, "is_deleted", False):
            return None

        listing_date = sale.listing_date
        sold_date = sale.sold_date
        if not listing_date or not sold_date:
            return None

        return (sold_date.date() - listing_date.date()).days
