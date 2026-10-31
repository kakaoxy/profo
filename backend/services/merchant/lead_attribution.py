"""线索五维归属（V06）：门店、经纪人、员工归因快照与完整性计算."""

from dataclasses import dataclass
from typing import Literal

from sqlalchemy import func
from sqlalchemy.orm import Session

from constants.merchant import MerchantBindStatus
from models.merchant import MerchantBroker, MerchantStore
from models.user.user import User
from schemas.lead import LeadListItem, LeadResponse
from services.system.exceptions import ResourceNotFoundError, ValidationError

AttributionStatus = Literal[
    "complete",
    "missing_store",
    "missing_broker",
    "missing_store_broker",
    "missing_referrer",
    "none",
]


@dataclass(frozen=True)
class LeadAttribution:
    """线索归属字段集合."""

    store_id: str | None = None
    broker_id: str | None = None
    store_owner_employee_id: str | None = None
    broker_inviter_employee_id: str | None = None

    def as_dict(self) -> dict[str, str | None]:
        """ORM 构造参数."""
        return {
            "store_id": self.store_id,
            "broker_id": self.broker_id,
            "store_owner_employee_id": self.store_owner_employee_id,
            "broker_inviter_employee_id": self.broker_inviter_employee_id,
        }


class LeadAttributionService:
    """线索归属解析与展示."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def resolve(
        self,
        *,
        creator_id: str | None,
        store_id: str | None,
        broker_id: str | None,
    ) -> LeadAttribution:
        """校验并生成五维归属快照.

        - 门店/经纪人均可空；
        - 同时提供时必须为有效绑定关系；
        - 仅传经纪人且其有绑定门店时自动回填门店；
        - 创建人本身是经纪人时自动识别其身份与当前绑定门店。
        """
        broker = self._get_broker(broker_id) if broker_id else None
        if broker is None and creator_id:
            broker = (
                self.db.query(MerchantBroker)
                .filter(MerchantBroker.user_id == creator_id)
                .first()
            )
        store = self._get_store(store_id) if store_id else None

        if broker is not None and broker.bind_status == MerchantBindStatus.DISABLED.value:
            msg = "经纪人已停用，不能作为归属"
            raise ValidationError(msg)

        if store is not None and broker is not None:
            if broker.store_id != store.id:
                msg = "经纪人与所选门店不存在有效绑定关系"
                raise ValidationError(msg)
        elif store is None and broker is not None and broker.store_id:
            store = self._get_store(str(broker.store_id))

        return LeadAttribution(
            store_id=str(store.id) if store is not None else None,
            broker_id=str(broker.id) if broker is not None else None,
            store_owner_employee_id=str(store.owner_employee_id) if store and store.owner_employee_id else None,
            broker_inviter_employee_id=(
                str(broker.inviter_employee_id) if broker and broker.inviter_employee_id else None
            ),
        )

    def resolve_for_update(
        self,
        *,
        creator_id: str | None,
        current_store_id: str | None,
        current_broker_id: str | None,
        new_store_id: str | None,
        new_broker_id: str | None,
        store_touched: bool,
        broker_touched: bool,
    ) -> LeadAttribution:
        """更新线索时解析归属（仅重算本次显式变更的字段）."""
        if not store_touched and not broker_touched:
            return LeadAttribution(
                store_id=current_store_id,
                broker_id=current_broker_id,
            )
        store_id = new_store_id if store_touched else current_store_id
        broker_id = new_broker_id if broker_touched else current_broker_id
        result = self.resolve(creator_id=creator_id, store_id=store_id, broker_id=broker_id)
        if store_touched and new_store_id is None:
            result = LeadAttribution(
                store_id=None,
                broker_id=result.broker_id,
                store_owner_employee_id=None,
                broker_inviter_employee_id=result.broker_inviter_employee_id,
            )
        if broker_touched and new_broker_id is None:
            result = LeadAttribution(
                store_id=result.store_id,
                broker_id=None,
                store_owner_employee_id=result.store_owner_employee_id,
                broker_inviter_employee_id=None,
            )
        return result

    def fill_names(self, items: list[LeadListItem | LeadResponse]) -> None:
        """批量回填门店/经纪人/归属员工名称与完整性（无 N+1）."""
        if not items:
            return
        store_ids = {item.store_id for item in items if item.store_id}
        broker_ids = {item.broker_id for item in items if item.broker_id}
        user_ids = {
            user_id
            for item in items
            for user_id in (item.store_owner_employee_id, item.broker_inviter_employee_id)
            if user_id
        }

        store_names = (
            dict(
                self.db.query(MerchantStore.id, MerchantStore.store_name)
                .filter(MerchantStore.id.in_(store_ids))
                .all(),
            )
            if store_ids
            else {}
        )
        broker_names = (
            dict(
                self.db.query(MerchantBroker.id, MerchantBroker.name)
                .filter(MerchantBroker.id.in_(broker_ids))
                .all(),
            )
            if broker_ids
            else {}
        )
        user_names = (
            dict(
                self.db.query(User.id, func.coalesce(User.nickname, User.username))
                .filter(User.id.in_(user_ids))
                .all(),
            )
            if user_ids
            else {}
        )

        for item in items:
            item.store_name = store_names.get(item.store_id) if item.store_id else None
            item.broker_name = broker_names.get(item.broker_id) if item.broker_id else None
            item.store_owner_name = (
                user_names.get(item.store_owner_employee_id) if item.store_owner_employee_id else None
            )
            item.broker_inviter_name = (
                user_names.get(item.broker_inviter_employee_id) if item.broker_inviter_employee_id else None
            )
            item.attribution_status = compute_status(
                store_id=item.store_id,
                broker_id=item.broker_id,
                employee_ids=(
                    item.referrer_id,
                    item.store_owner_employee_id,
                    item.broker_inviter_employee_id,
                ),
            )

    def _get_store(self, store_id: str) -> MerchantStore:
        store = self.db.query(MerchantStore).filter(MerchantStore.id == store_id).first()
        if store is None or store.is_deleted:
            msg = "门店不存在"
            raise ResourceNotFoundError(msg)
        if store.status != "normal":
            msg = "门店已停用/已合并/已搬迁，不能作为线索归属"
            raise ValidationError(msg)
        return store

    def _get_broker(self, broker_id: str) -> MerchantBroker:
        broker = self.db.query(MerchantBroker).filter(MerchantBroker.id == broker_id).first()
        if broker is None:
            msg = "经纪人不存在"
            raise ResourceNotFoundError(msg)
        return broker


def compute_status(
    *,
    store_id: str | None,
    broker_id: str | None,
    employee_ids: tuple[str | None, ...],
) -> AttributionStatus:
    """计算归属完整性（R-V06-01：查询时计算，不持久化）."""
    has_employee = any(employee_id for employee_id in employee_ids)
    if store_id and broker_id:
        return "complete" if has_employee else "missing_referrer"
    if broker_id:
        return "missing_store"
    if store_id:
        return "missing_broker"
    if has_employee:
        return "missing_store_broker"
    return "none"


__all__ = [
    "AttributionStatus",
    "LeadAttribution",
    "LeadAttributionService",
    "compute_status",
]
