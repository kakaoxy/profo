"""拜访记录服务（V03 M03）：首访、复访、补录、定位校验与门店时间线."""

from datetime import datetime, timedelta, timezone

from fastapi import Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from constants.merchant import (
    MerchantLocationFailureType,
    MerchantLocationStatus,
    MerchantStoreStatus,
    MerchantVisitSource,
)
from models.merchant import MerchantStore, MerchantVisit
from models.system import BizDictItem
from models.user.user import User
from schemas.merchant import MerchantVisitCreate, MerchantVisitListResponse, MerchantVisitResponse
from services.merchant.audit import add_audit_log
from services.merchant.scope import ensure_store_visible
from services.merchant.serializers import visit_response
from services.merchant.store import haversine_m
from services.system.exceptions import ResourceNotFoundError, ValidationError

VISIT_RESULT_DICT = "merchant_visit_result"
_DISTANCE_LIMIT_M = 500
_BACKFILL_DAYS = 7


def _normalize_dt(value: datetime | None) -> datetime:
    """统一为带时区 UTC 时间（前端可能传 naive 本地时间）."""
    if value is None:
        return datetime.now(timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class MerchantVisitService:
    """拜访记录服务."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def create_for_store(
        self,
        store: MerchantStore,
        *,
        employee_id: str,
        req: MerchantVisitCreate,
        source: str,
        request: Request | None = None,
        commit: bool = True,
    ) -> MerchantVisit:
        """为指定门店创建拜访记录（首访/复访/补录共用）."""
        if store.status != MerchantStoreStatus.NORMAL.value:
            msg = "门店已停用/已合并/已搬迁，不能登记拜访"
            raise ValidationError(msg)

        visited_at = _normalize_dt(req.visited_at)
        now = datetime.now(timezone.utc)
        visit_source = source
        is_backfill = req.is_backfill or source == MerchantVisitSource.BACKFILL.value

        if visited_at > now:
            msg = "拜访时间不能晚于当前时间"
            raise ValidationError(msg)
        if is_backfill:
            visit_source = MerchantVisitSource.BACKFILL.value
            if visited_at < now - timedelta(days=_BACKFILL_DAYS):
                msg = "仅允许补录 7 天内的拜访"
                raise ValidationError(msg)

        self._validate_location(req)
        if req.result:
            self._validate_result(req.result)

        remark = req.remark
        if req.backfill_reason:
            remark = f"{remark}；补录原因：{req.backfill_reason}" if remark else f"补录原因：{req.backfill_reason}"

        distance = None
        # 门店坐标缺失时无法计算距离（曾 float(None) 触发 500）
        if req.lng is not None and req.lat is not None and store.lng is not None and store.lat is not None:
            distance = haversine_m(float(req.lng), float(req.lat), float(store.lng), float(store.lat))
            if distance > _DISTANCE_LIMIT_M and not (req.distance_abnormal_reason or "").strip():
                msg = "拜访定位与门店距离超过 500 米，请填写异常原因"
                raise ValidationError(msg)

        visit = MerchantVisit(
            store_id=store.id,
            employee_id=employee_id,
            visited_at=visited_at,
            contact_name=req.contact_name.strip(),
            contact_phone=(req.contact_phone or "").strip() or None,
            photos=[item.model_dump(mode="json") for item in req.photos],
            lng=req.lng,
            lat=req.lat,
            distance_m=distance,
            distance_abnormal_reason=req.distance_abnormal_reason,
            location_failure_reason=req.location_failure_reason,
            location_failure_type=req.location_failure_type,
            location_status=req.location_status,
            visit_source=visit_source,
            address=req.address,
            result=req.result,
            remark=remark,
            is_backfill=is_backfill,
        )
        self.db.add(visit)
        self.db.flush()

        if store.last_visit_at is None or visited_at > _normalize_dt(store.last_visit_at):
            store.last_visit_at = visited_at

        add_audit_log(
            self.db,
            user_id=employee_id,
            action="create",
            resource_type="merchant_visit",
            resource_id=str(visit.id),
            before=None,
            after=self._snapshot(visit),
            request=request,
        )
        if commit:
            self.db.commit()
            self.db.refresh(visit)
        return visit

    def create(self, user: User, req: MerchantVisitCreate, *, request: Request | None = None) -> MerchantVisit:
        """员工登记已有门店拜访."""
        if not req.store_id:
            msg = "缺少门店ID"
            raise ValidationError(msg)
        store = self.db.query(MerchantStore).filter(MerchantStore.id == req.store_id).first()
        if store is None or store.is_deleted:
            msg = "门店不存在"
            raise ResourceNotFoundError(msg)
        ensure_store_visible(self.db, user, store)
        return self.create_for_store(
            store,
            employee_id=str(user.id),
            req=req,
            source=MerchantVisitSource.REGULAR.value,
            request=request,
        )

    def list_store_visits(
        self,
        user: User,
        store_id: str,
        *,
        page: int,
        page_size: int,
    ) -> MerchantVisitListResponse:
        """门店拜访时间线（按拜访时间倒序）."""
        store = self.db.query(MerchantStore).filter(MerchantStore.id == store_id).first()
        if store is None or store.is_deleted:
            msg = "门店不存在"
            raise ResourceNotFoundError(msg)
        ensure_store_visible(self.db, user, store)

        employee_name = func.coalesce(User.nickname, User.username)
        query = (
            self.db.query(MerchantVisit, employee_name)
            .outerjoin(User, User.id == MerchantVisit.employee_id)
            .filter(MerchantVisit.store_id == store.id, MerchantVisit.is_deleted.is_(False))
        )
        total = query.count()
        rows = query.order_by(MerchantVisit.visited_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
        return MerchantVisitListResponse(
            items=[visit_response(visit, store_name=store.store_name, employee_name=name) for visit, name in rows],
            total=total,
            page=page,
            page_size=page_size,
        )

    def build_response(self, visit: MerchantVisit) -> MerchantVisitResponse:
        """构造拜访响应（补门店名/员工名）."""
        store = self.db.query(MerchantStore).filter(MerchantStore.id == visit.store_id).first()
        employee = self.db.query(User).filter(User.id == visit.employee_id).first()
        employee_name = None
        if employee is not None:
            employee_name = employee.nickname or employee.username
        return visit_response(
            visit,
            store_name=store.store_name if store is not None else None,
            employee_name=employee_name,
        )

    def get_visit(self, user: User, visit_id: str) -> MerchantVisit:
        """按 ID 取拜访记录（校验门店数据范围）."""
        visit = self.db.query(MerchantVisit).filter(MerchantVisit.id == visit_id).first()
        if visit is None or visit.is_deleted:
            msg = "拜访记录不存在"
            raise ResourceNotFoundError(msg)
        store = self.db.query(MerchantStore).filter(MerchantStore.id == visit.store_id).first()
        if store is None:
            msg = "门店不存在"
            raise ResourceNotFoundError(msg)
        ensure_store_visible(self.db, user, store)
        return visit

    def _validate_location(self, req: MerchantVisitCreate) -> None:
        """定位校验：正常必须带坐标；降级/未定位必须写原因（Q05 / AC-V03-007）."""
        if req.location_failure_type == MerchantLocationFailureType.AUTH_DENIED.value:
            # AC-V03-007：定位授权被拒绝不得提交，只有弱网/超时允许降级
            msg = "定位授权被拒绝，请授权定位后重试（不允许以定位失败降级提交）"
            raise ValidationError(msg)
        if req.location_status == MerchantLocationStatus.NORMAL.value:
            if req.lng is None or req.lat is None:
                msg = "未获取到定位，请授权定位后重试"
                raise ValidationError(msg)
            return
        if req.lng is not None and req.lat is not None:
            return
        if not (req.location_failure_reason or "").strip():
            msg = "定位降级/未定位时必须填写无法定位的原因"
            raise ValidationError(msg)

    def _validate_result(self, code: str) -> None:
        """拜访结果必须为启用中的字典项."""
        exists = (
            self.db.query(BizDictItem.id)
            .filter(
                BizDictItem.dict_code == VISIT_RESULT_DICT,
                BizDictItem.code == code,
                BizDictItem.enabled.is_(True),
            )
            .first()
        )
        if exists is None:
            msg = f"无效的拜访结果: {code}"
            raise ValidationError(msg)

    @staticmethod
    def _snapshot(visit: MerchantVisit) -> dict:
        return {
            "store_id": str(visit.store_id),
            "employee_id": str(visit.employee_id),
            "visited_at": visit.visited_at.isoformat() if visit.visited_at else None,
            "contact_name": visit.contact_name,
            "contact_phone": visit.contact_phone,
            "photos": visit.photos or [],
            "lng": float(visit.lng) if visit.lng is not None else None,
            "lat": float(visit.lat) if visit.lat is not None else None,
            "distance_m": visit.distance_m,
            "distance_abnormal_reason": visit.distance_abnormal_reason,
            "location_failure_reason": visit.location_failure_reason,
            "location_failure_type": visit.location_failure_type,
            "location_status": visit.location_status,
            "visit_source": visit.visit_source,
            "address": visit.address,
            "result": visit.result,
            "remark": visit.remark,
            "is_backfill": visit.is_backfill,
        }


__all__ = ["MerchantVisitService"]
