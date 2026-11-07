"""线索唯一归属（门店负责人/对接人）解析与批量同步."""

from dataclasses import dataclass

from sqlalchemy import func, or_, update
from sqlalchemy.orm import Session

from constants.merchant import MerchantBindStatus
from models.lead import Lead
from models.merchant import MerchantBroker, MerchantStore
from models.user.user import User
from schemas.lead import LeadListItem, LeadResponse
from services.growth_center.identity import resolve_backend_employee_ids
from services.system.exceptions import ResourceNotFoundError, ValidationError


@dataclass(frozen=True)
class LeadOwnership:
    """线索归属字段集合."""

    store_id: str | None = None
    broker_id: str | None = None
    owner_employee_id: str | None = None

    def as_dict(self) -> dict[str, str | None]:
        """ORM 构造参数."""
        return {
            "store_id": self.store_id,
            "broker_id": self.broker_id,
            "owner_employee_id": self.owner_employee_id,
        }


class LeadOwnerService:
    """线索归属解析、门店负责人同步与展示名称回填."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def resolve(
        self,
        *,
        creator_id: str | None,
        store_id: str | None,
        broker_id: str | None,
        referrer_id: str | None = None,
        auto_detect_broker: bool = True,
    ) -> LeadOwnership:
        """解析线索归属.

        规则：
        - 门店负责人优先；
        - 无门店/门店无负责人时，依次回退经纪人邀请员工、分享员工；
        - 门店/经纪人均可空；同时提供时必须为有效绑定关系；
        - 仅传经纪人且其有绑定门店时自动回填门店；
        - 创建人本身是经纪人时自动识别其身份与当前绑定门店（auto_detect_broker=True 时）。
        """
        broker = self._get_broker(broker_id) if broker_id else None
        if broker is None and creator_id and auto_detect_broker:
            broker = self.db.query(MerchantBroker).filter(MerchantBroker.user_id == creator_id).first()
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

        owner_employee_id = self._resolve_owner_employee(
            store=store,
            broker=broker,
            referrer_id=referrer_id,
        )
        return LeadOwnership(
            store_id=str(store.id) if store is not None else None,
            broker_id=str(broker.id) if broker is not None else None,
            owner_employee_id=owner_employee_id,
        )

    def resolve_for_update(
        self,
        *,
        creator_id: str | None,
        current_store_id: str | None,
        current_broker_id: str | None,
        current_owner_employee_id: str | None,
        new_store_id: str | None,
        new_broker_id: str | None,
        store_touched: bool,
        broker_touched: bool,
        referrer_id: str | None = None,
    ) -> LeadOwnership:
        """更新线索时解析归属（仅重算本次显式变更的字段）."""
        if not store_touched and not broker_touched:
            return LeadOwnership(
                store_id=current_store_id,
                broker_id=current_broker_id,
                owner_employee_id=current_owner_employee_id,
            )

        store_id = new_store_id if store_touched else current_store_id
        broker_id = new_broker_id if broker_touched else current_broker_id
        result = self.resolve(
            creator_id=creator_id,
            store_id=store_id,
            broker_id=broker_id,
            referrer_id=referrer_id,
            auto_detect_broker=False,
        )

        # 显式清空门店：保留经纪人字段，但门店不再自动回填，归属按经纪人邀请员工/分享员工兜底。
        if store_touched and new_store_id is None:
            broker = self._get_broker(str(result.broker_id)) if result.broker_id else None
            return LeadOwnership(
                store_id=None,
                broker_id=result.broker_id,
                owner_employee_id=self._resolve_owner_employee(
                    store=None,
                    broker=broker,
                    referrer_id=referrer_id,
                ),
            )
        if broker_touched and new_broker_id is None:
            return LeadOwnership(
                store_id=result.store_id,
                broker_id=None,
                owner_employee_id=result.owner_employee_id,
            )
        return result

    def sync_store_owner(
        self,
        *,
        store_id: str,
        owner_employee_id: str | None,
        previous_owner_employee_id: str | None = None,
    ) -> int:
        """门店负责人变更后，同步该门店由门店派生的线索归属员工.

        仅更新无归属或归属等于原门店负责人的线索；若线索已被单独指派给其他员工，
        保留该显式指派，避免门店负责人变更覆盖人工归属。
        """
        new_owner = owner_employee_id or func.coalesce(
            Lead.broker_inviter_employee_id,
            Lead.referrer_id,
        )
        if previous_owner_employee_id:
            owner_condition = or_(
                Lead.owner_employee_id.is_(None),
                Lead.owner_employee_id == previous_owner_employee_id,
            )
        else:
            # 原门店无负责人时，历史线索按经纪人邀请/分享员工兜底，这些属于自动派生值。
            owner_condition = or_(
                Lead.owner_employee_id.is_(None),
                Lead.owner_employee_id == Lead.broker_inviter_employee_id,
                Lead.owner_employee_id == Lead.referrer_id,
            )
        result = self.db.execute(
            update(Lead)
            .where(
                Lead.store_id == store_id,
                Lead.is_deleted.is_(False),
                owner_condition,
            )
            .values(
                owner_employee_id=new_owner,
                updated_at=func.now(),
            )
            .execution_options(synchronize_session=False)
        )
        return int(result.rowcount or 0)

    def sync_broker_binding(
        self,
        *,
        broker_id: str,
        store_id: str,
        store_owner_employee_id: str | None,
        broker_inviter_employee_id: str | None = None,
    ) -> int:
        """经纪人补绑门店后，同步此前无门店的经纪人线索.

        仅更新无归属或仍为邀请员工兜底的线索；已单独指派给其他员工的线索保留原归属。
        返回自动归属被更新的线索数；门店绑定本身对所有匹配线索生效。
        """
        new_owner = store_owner_employee_id or func.coalesce(
            Lead.broker_inviter_employee_id,
            Lead.referrer_id,
        )
        if broker_inviter_employee_id:
            owner_condition = or_(
                Lead.owner_employee_id.is_(None),
                Lead.owner_employee_id == broker_inviter_employee_id,
            )
        else:
            owner_condition = or_(
                Lead.owner_employee_id.is_(None),
                Lead.owner_employee_id == Lead.referrer_id,
            )
        # 先只更新可自动派生的归属，避免把人工指派覆盖掉；门店绑定本身对所有
        # 无门店的经纪人线索生效。
        owner_update_result = self.db.execute(
            update(Lead)
            .where(
                Lead.broker_id == broker_id,
                Lead.store_id.is_(None),
                Lead.is_deleted.is_(False),
                owner_condition,
            )
            .values(
                owner_employee_id=new_owner,
                updated_at=func.now(),
            )
            .execution_options(synchronize_session=False)
        )
        # 门店绑定本身对所有无门店的经纪人线索生效；该更新不计入返回值。
        self.db.execute(
            update(Lead)
            .where(
                Lead.broker_id == broker_id,
                Lead.store_id.is_(None),
                Lead.is_deleted.is_(False),
            )
            .values(
                store_id=store_id,
                updated_at=func.now(),
            )
            .execution_options(synchronize_session=False)
        )
        return int(owner_update_result.rowcount or 0)

    def fill_names(self, items: list[LeadListItem | LeadResponse]) -> None:
        """批量回填门店/经纪人/归属员工名称（无 N+1）.

        员工自己提交且无门店/经纪人归属时，对接人展示为创建人本人；
        C 端客户提交的线索不参与兜底，避免把客户昵称误显示为员工。
        """
        if not items:
            return
        store_ids = {item.store_id for item in items if item.store_id}
        broker_ids = {item.broker_id for item in items if item.broker_id}
        user_ids = {item.owner_employee_id for item in items if item.owner_employee_id}
        # 仅对无归属的线索判断创建人是否具备后台身份；批量查询避免 N+1
        creator_ids = {item.creator_id for item in items if item.creator_id and not item.owner_employee_id}
        internal_creator_ids = resolve_backend_employee_ids(self.db, list(creator_ids))
        user_ids |= internal_creator_ids

        store_rows = (
            self.db.query(
                MerchantStore.id,
                MerchantStore.store_name,
                MerchantStore.status,
                MerchantStore.is_deleted,
            )
            .filter(MerchantStore.id.in_(store_ids))
            .all()
            if store_ids
            else []
        )
        store_names = {row[0]: row[1] for row in store_rows}
        # 历史归属展示：停用/合并/搬迁/已删除仍展示名称并标记
        store_statuses = {row[0]: ("deleted" if row[3] else row[2]) for row in store_rows}
        broker_rows = (
            self.db.query(MerchantBroker.id, MerchantBroker.name, MerchantBroker.bind_status)
            .filter(MerchantBroker.id.in_(broker_ids))
            .all()
            if broker_ids
            else []
        )
        broker_names = {row[0]: row[1] for row in broker_rows}
        broker_statuses = {row[0]: row[2] for row in broker_rows}
        user_names = (
            dict(
                self.db.query(User.id, func.coalesce(User.nickname, User.username)).filter(User.id.in_(user_ids)).all(),
            )
            if user_ids
            else {}
        )

        for item in items:
            item.store_name = store_names.get(item.store_id) if item.store_id else None
            item.store_status = store_statuses.get(item.store_id) if item.store_id else None
            item.broker_name = broker_names.get(item.broker_id) if item.broker_id else None
            item.broker_status = broker_statuses.get(item.broker_id) if item.broker_id else None
            # 仅回填展示名称，不写 owner_employee_id，避免改变归属筛选/统计口径
            if item.owner_employee_id:
                item.owner_employee_name = user_names.get(item.owner_employee_id)
            elif item.creator_id and item.creator_id in internal_creator_ids:
                item.owner_employee_name = user_names.get(item.creator_id)
            else:
                item.owner_employee_name = None

    def _resolve_owner_employee(
        self,
        *,
        store: MerchantStore | None,
        broker: MerchantBroker | None,
        referrer_id: str | None,
    ) -> str | None:
        if store is not None and store.owner_employee_id:
            return str(store.owner_employee_id)
        if broker is not None and broker.inviter_employee_id:
            return str(broker.inviter_employee_id)
        if referrer_id:
            return str(referrer_id)
        return None

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


__all__ = ["LeadOwnerService", "LeadOwnership"]
