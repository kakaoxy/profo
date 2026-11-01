"""区域 / 商圈字典服务（REQ-IT2-01 / REQ-IT3-01）.

区域与商圈属于**楼盘字典**的一部分（归 ``routers/property/building_dict.py`` 管理），
商户门店只是复用它的候选值。服务同时承担主数据治理：

- ``sync_from_business_data``：把 ``communities`` / ``merchant_stores`` 上已有的
  区域、商圈值补录进字典（幂等），保证「现有的区域和商圈」在后台可见可维护；
- ``rename``：重命名字典项时**批量同步业务数据上的同值记录**，避免字典与业务
  数据分叉（决策 Q1=B）；
- ``set_status``：停用后不再出现在门店表单候选中。

业务数据同步有节流（``_SYNC_INTERVAL_SECONDS``），避免每次拉候选都全表 DISTINCT；
后台字典页另有显式「同步业务数据」入口。

跨域说明：字典归楼盘字典域，但重命名/补录需同时改写商户域 ``merchant_stores`` 的
区域、商圈文本列（门店复用字典值），因此本服务直接维护两域的文本列，并在审计中记录
影响行数（``affected_rows``）。
"""

import logging
import time

from fastapi import Request
from sqlalchemy.orm import Session

from models.merchant import MerchantStore
from models.property import Community, RegionDict, RegionDictStatus, RegionDictType
from schemas.building_dict import (
    RegionDictCreate,
    RegionDictItem,
    RegionDictListResponse,
    RegionDictStatusRequest,
    RegionDictUpdate,
)
from services.merchant.audit import add_audit_log
from services.system.exceptions import ConflictError, ResourceNotFoundError, ValidationError

logger = logging.getLogger(__name__)

# 业务数据 → 字典的自动同步节流（秒）；显式同步入口不受限
_SYNC_INTERVAL_SECONDS = 300
_last_sync_at: float = 0.0


class RegionDictService:
    """区域 / 商圈字典服务."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # -------------------- 查询 --------------------
    def list_(
        self,
        dict_type: str,
        *,
        keyword: str | None = None,
        status: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> RegionDictListResponse:
        """管理端分页列表（按排序值、名称升序）."""
        self.ensure_synced()
        query = self.db.query(RegionDict).filter(RegionDict.dict_type == dict_type)
        keyword = (keyword or "").strip()
        if keyword:
            query = query.filter(RegionDict.name.ilike(f"%{keyword}%"))
        if status:
            query = query.filter(RegionDict.status == status)
        total = query.count()
        page = max(page, 1)
        rows = (
            query.order_by(
                RegionDict.sort_order.asc(),
                RegionDict.name.asc(),
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return RegionDictListResponse(
            items=[self._item(row) for row in rows],
            total=total,
            page=page,
            page_size=page_size,
        )

    def active_names(self, dict_type: str) -> list[str]:
        """启用中的字典值（门店表单候选，区域用）."""
        self.ensure_synced()
        rows = (
            self.db.query(RegionDict.name)
            .filter(
                RegionDict.dict_type == dict_type,
                RegionDict.status == RegionDictStatus.ACTIVE.value,
            )
            .order_by(RegionDict.sort_order.asc(), RegionDict.name.asc())
            .limit(200)
            .all()
        )
        return [row[0] for row in rows]

    def active_business_circles(self, district: str | None = None) -> list[str]:
        """启用中的商圈（可按区域过滤）."""
        self.ensure_synced()
        query = self.db.query(RegionDict.name).filter(
            RegionDict.dict_type == RegionDictType.BUSINESS_CIRCLE.value,
            RegionDict.status == RegionDictStatus.ACTIVE.value,
        )
        if district:
            query = query.filter(RegionDict.district == district)
        rows = query.order_by(RegionDict.sort_order.asc(), RegionDict.name.asc()).limit(200).all()
        return [row[0] for row in rows]

    # -------------------- 维护 --------------------
    def create(
        self,
        req: RegionDictCreate,
        *,
        operator_id: str | None,
        request: Request | None = None,
    ) -> RegionDict:
        """新增字典项；同名项已存在时：停用的直接启用，否则报冲突."""
        name = req.name.strip()
        if not name:
            msg = "名称不能为空"
            raise ValidationError(msg)
        district = (req.district or "").strip() or None
        if req.dict_type == RegionDictType.BUSINESS_CIRCLE.value and not district:
            msg = "新增商圈必须指定所属区域"
            raise ValidationError(msg)

        existing = (
            self.db.query(RegionDict).filter(RegionDict.dict_type == req.dict_type, RegionDict.name == name).first()
        )
        if existing is not None:
            if existing.status == RegionDictStatus.ACTIVE.value:
                msg = "该名称已存在"
                raise ConflictError(msg)
            before = self._snapshot(existing)
            existing.status = RegionDictStatus.ACTIVE.value
            existing.district = district or existing.district
            existing.sort_order = req.sort_order
            existing.remark = req.remark
            add_audit_log(
                self.db,
                user_id=operator_id,
                action="enable",
                resource_type="region_dict",
                resource_id=str(existing.id),
                before=before,
                after=self._snapshot(existing),
                request=request,
            )
            self.db.commit()
            self.db.refresh(existing)
            return existing

        row = RegionDict(
            dict_type=req.dict_type,
            district=district,
            name=name,
            status=RegionDictStatus.ACTIVE.value,
            sort_order=req.sort_order,
            remark=req.remark,
            created_by=operator_id,
        )
        self.db.add(row)
        self.db.flush()
        add_audit_log(
            self.db,
            user_id=operator_id,
            action="create",
            resource_type="region_dict",
            resource_id=str(row.id),
            before=None,
            after=self._snapshot(row),
            request=request,
        )
        self.db.commit()
        self.db.refresh(row)
        return row

    def rename(
        self,
        dict_id: str,
        req: RegionDictUpdate,
        *,
        operator_id: str | None,
        request: Request | None = None,
    ) -> RegionDict:
        """重命名字典项，并批量同步业务数据上的同值记录（决策 Q1=B）."""
        row = self._get(dict_id)
        new_name = req.name.strip()
        if not new_name:
            msg = "名称不能为空"
            raise ValidationError(msg)
        old_name = row.name
        if new_name == old_name and (req.district or "").strip() == (row.district or ""):
            msg = "没有需要更新的字段"
            raise ConflictError(msg)

        duplicated = (
            self.db.query(RegionDict)
            .filter(
                RegionDict.dict_type == row.dict_type,
                RegionDict.name == new_name,
                RegionDict.id != row.id,
            )
            .first()
        )
        if duplicated is not None:
            msg = "该名称已存在"
            raise ConflictError(msg)

        before = self._snapshot(row)
        affected = self._sync_business_data_name(row.dict_type, old_name, new_name)
        row.name = new_name
        if req.district is not None:
            row.district = (req.district or "").strip() or None
        self.db.flush()
        add_audit_log(
            self.db,
            user_id=operator_id,
            action="rename",
            resource_type="region_dict",
            resource_id=str(row.id),
            before={**before, "affected_rows": affected},
            after=self._snapshot(row),
            request=request,
        )
        self.db.commit()
        self.db.refresh(row)
        logger.info("区域/商圈字典重命名 %s → %s，同步业务数据 %s 行", old_name, new_name, affected)
        return row

    def set_status(
        self,
        dict_id: str,
        req: RegionDictStatusRequest,
        *,
        operator_id: str | None,
        request: Request | None = None,
    ) -> RegionDict:
        """启用 / 停用字典项（停用后不再进入门店表单候选）."""
        row = self._get(dict_id)
        if row.status == req.status:
            msg = "状态未变化"
            raise ConflictError(msg)
        before = self._snapshot(row)
        row.status = req.status
        if req.reason:
            row.remark = req.reason
        self.db.flush()
        add_audit_log(
            self.db,
            user_id=operator_id,
            action="set_status",
            resource_type="region_dict",
            resource_id=str(row.id),
            before=before,
            after=self._snapshot(row),
            request=request,
        )
        self.db.commit()
        self.db.refresh(row)
        return row

    # -------------------- 业务数据同步 --------------------
    def ensure_synced(self) -> None:
        """节流版同步：进程内至多每 ``_SYNC_INTERVAL_SECONDS`` 执行一次."""
        global _last_sync_at
        now = time.monotonic()
        if now - _last_sync_at < _SYNC_INTERVAL_SECONDS:
            return
        try:
            self.sync_from_business_data()
        except Exception:  # 同步失败不得阻断候选读取
            self.db.rollback()
            logger.exception("区域/商圈字典同步失败（已跳过）")
            return
        _last_sync_at = now

    def sync_from_business_data(self) -> dict[str, int]:
        """把小区主数据与已建门店上的区域/商圈值补录进字典（幂等）."""
        inserted = {"district": 0, "business_circle": 0}
        existing = {(row.dict_type, row.name): row for row in self.db.query(RegionDict).all()}

        for name in self._district_values():
            key = (RegionDictType.DISTRICT.value, name)
            if key in existing:
                continue
            self.db.add(
                RegionDict(
                    dict_type=RegionDictType.DISTRICT.value,
                    name=name,
                    status=RegionDictStatus.ACTIVE.value,
                )
            )
            inserted["district"] += 1

        for name, district in self._circle_values().items():
            key = (RegionDictType.BUSINESS_CIRCLE.value, name)
            row = existing.get(key)
            if row is not None:
                # 补全商圈所属区域（历史行可能缺）
                if row.district is None and district:
                    row.district = district
                continue
            self.db.add(
                RegionDict(
                    dict_type=RegionDictType.BUSINESS_CIRCLE.value,
                    district=district,
                    name=name,
                    status=RegionDictStatus.ACTIVE.value,
                )
            )
            inserted["business_circle"] += 1

        if inserted["district"] or inserted["business_circle"]:
            self.db.commit()
            logger.info("区域/商圈字典补录：%s", inserted)
        return inserted

    def _district_values(self) -> set[str]:
        values: set[str] = set()
        for (value,) in self.db.query(Community.district).filter(Community.district.isnot(None)).distinct():
            cleaned = (value or "").strip()
            if cleaned:
                values.add(cleaned)
        for (value,) in (
            self.db.query(MerchantStore.district)
            .filter(MerchantStore.is_deleted.is_(False), MerchantStore.district.isnot(None))
            .distinct()
        ):
            cleaned = (value or "").strip()
            if cleaned:
                values.add(cleaned)
        return values

    def _circle_values(self) -> dict[str, str | None]:
        """商圈名 → 所属区域（同名商圈取首个非空区域）."""
        values: dict[str, str | None] = {}
        for name, district in (
            self.db.query(Community.business_circle, Community.district)
            .filter(Community.business_circle.isnot(None))
            .distinct()
        ):
            cleaned = (name or "").strip()
            if not cleaned:
                continue
            if cleaned not in values or (values[cleaned] is None and district):
                values[cleaned] = (district or "").strip() or None
        for name, district in (
            self.db.query(MerchantStore.business_circle, MerchantStore.district)
            .filter(MerchantStore.is_deleted.is_(False), MerchantStore.business_circle.isnot(None))
            .distinct()
        ):
            cleaned = (name or "").strip()
            if not cleaned:
                continue
            if cleaned not in values or (values[cleaned] is None and district):
                values[cleaned] = (district or "").strip() or None
        return values

    def _sync_business_data_name(self, dict_type: str, old_name: str, new_name: str) -> int:
        """重命名时批量同步业务数据（楼盘字典 + 商户门店，返回影响行数合计）."""
        is_district = dict_type == RegionDictType.DISTRICT.value
        community_column = Community.district if is_district else Community.business_circle
        store_column = MerchantStore.district if is_district else MerchantStore.business_circle
        community_rows = (
            self.db.query(Community)
            .filter(community_column == old_name)
            .update(
                {community_column: new_name},
                synchronize_session=False,
            )
        )
        store_rows = (
            self.db.query(MerchantStore)
            .filter(MerchantStore.is_deleted.is_(False), store_column == old_name)
            .update({store_column: new_name}, synchronize_session=False)
        )
        return int(community_rows or 0) + int(store_rows or 0)

    # -------------------- 内部辅助 --------------------
    def _get(self, dict_id: str) -> RegionDict:
        row = self.db.query(RegionDict).filter(RegionDict.id == dict_id).first()
        if row is None:
            msg = "字典项不存在"
            raise ResourceNotFoundError(msg)
        return row

    @staticmethod
    def _item(row: RegionDict) -> RegionDictItem:
        return RegionDictItem(
            id=str(row.id),
            dict_type=row.dict_type,
            district=row.district,
            name=row.name,
            status=row.status,
            sort_order=row.sort_order,
            remark=row.remark,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    @staticmethod
    def _snapshot(row: RegionDict) -> dict:
        return {
            "dict_type": row.dict_type,
            "district": row.district,
            "name": row.name,
            "status": row.status,
            "sort_order": row.sort_order,
            "remark": row.remark,
        }


def region_dict_item(row: RegionDict) -> RegionDictItem:
    """区域/商圈字典项响应."""
    return RegionDictItem(
        id=str(row.id),
        dict_type=row.dict_type,
        district=row.district,
        name=row.name,
        status=row.status,
        sort_order=row.sort_order,
        remark=row.remark,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


__all__ = ["RegionDictService", "region_dict_item"]
