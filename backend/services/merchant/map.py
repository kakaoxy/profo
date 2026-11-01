"""门店地图与员工拜访轨迹（V08）."""

import logging
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import Request
from sqlalchemy.orm import Session

from models.merchant import MerchantStore, MerchantVisit
from models.user.user import User
from schemas.merchant import (
    MerchantMapPoint,
    MerchantMapResponse,
    MerchantMapStats,
    MerchantTrackItem,
    MerchantTrackResponse,
    MerchantTrackStats,
)
from services.merchant.audit import add_audit_log
from services.merchant.broker import MerchantBrokerService
from services.merchant.scope import store_scope_condition
from services.merchant.serializers import cooperation_label_map
from services.system.exceptions import ResourceNotFoundError, ValidationError

logger = logging.getLogger(__name__)

_MAX_TRACK_DAYS = 31
_SHANGHAI = ZoneInfo("Asia/Shanghai")


class MerchantMapService:
    """后台地图与轨迹服务."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def map_points(
        self,
        user: User,
        *,
        province: str | None = None,
        city: str | None = None,
        district: str | None = None,
        business_circle: str | None = None,
        cooperation_status: str | None = None,
        review_status: str | None = None,
    ) -> MerchantMapResponse:
        """门店点位与统计条（已合并/已删除不打点）."""
        query = self.db.query(MerchantStore).filter(
            MerchantStore.is_deleted.is_(False),
            MerchantStore.status.in_(["normal", "disabled"]),
        )
        scope = store_scope_condition(self.db, user)
        if scope is not None:
            query = query.filter(scope)
        if province:
            query = query.filter(MerchantStore.province == province)
        if city:
            query = query.filter(MerchantStore.city == city)
        if district:
            query = query.filter(MerchantStore.district == district)
        if business_circle:
            query = query.filter(MerchantStore.business_circle == business_circle)
        if cooperation_status:
            query = query.filter(MerchantStore.cooperation_status == cooperation_status)
        if review_status:
            query = query.filter(MerchantStore.review_status == review_status)
        # REQ-M09-001：仅 GCJ-02 坐标可上图；BD-09/WGS-84 等非 GCJ-02 记录跳过并告警
        non_gcj02_count = query.filter(MerchantStore.coordinate_system != "gcj02").count()
        if non_gcj02_count:
            logger.warning("non-gcj02 stores skipped on map: %d", non_gcj02_count)
        query = query.filter(MerchantStore.coordinate_system == "gcj02")

        # REQ-M09-005：门店列表按最近拜访时间倒序（无拜访的门店排最后）
        stores = query.order_by(
            MerchantStore.last_visit_at.desc().nulls_last(),
            MerchantStore.updated_at.desc(),
        ).all()
        labels = cooperation_label_map(self.db)
        broker_counts = MerchantBrokerService(self.db).effective_count_by_stores([str(s.id) for s in stores])

        points = []
        for store in stores:
            has_coordinate = store.lng is not None and store.lat is not None
            points.append(
                MerchantMapPoint(
                    id=str(store.id),
                    store_name=store.store_name,
                    company_name=store.company_name,
                    province=store.province,
                    city=store.city,
                    district=store.district,
                    business_circle=store.business_circle,
                    address=store.address,
                    lng=float(store.lng) if has_coordinate else None,
                    lat=float(store.lat) if has_coordinate else None,
                    has_coordinate=has_coordinate,
                    cooperation_status=store.cooperation_status,
                    cooperation_status_label=labels.get(store.cooperation_status, store.cooperation_status),
                    review_status=store.review_status,
                    broker_count=broker_counts.get(str(store.id), 0),
                    last_visit_at=store.last_visit_at,
                ),
            )

        return MerchantMapResponse(
            points=points,
            stats=MerchantMapStats(
                store_count=len(stores),
                cooperated_count=sum(1 for s in stores if s.cooperation_status == "cooperated"),
                broker_count=sum(broker_counts.values()),
            ),
        )

    def employee_track(
        self,
        user: User,
        *,
        employee_id: str,
        start_date: date | None = None,
        end_date: date | None = None,
        request: Request | None = None,
    ) -> MerchantTrackResponse:
        """员工到店打卡点（按 visited_at 升序，坐标缺失只进时间线）."""
        if not employee_id:
            msg = "请选择员工"
            raise ValidationError(msg)
        employee = self.db.query(User).filter(User.id == employee_id).first()
        if employee is None:
            msg = "员工不存在"
            raise ResourceNotFoundError(msg)

        # 业务日界按 Asia/Shanghai 计算：否则上海 00:00–08:00 的打卡会落到前一天（UTC 日界）
        today = datetime.now(_SHANGHAI).date()
        start = datetime.combine(start_date or today, time.min, tzinfo=_SHANGHAI)
        end = datetime.combine(end_date or today, time.min, tzinfo=_SHANGHAI) + timedelta(days=1)
        if (end - start).days > _MAX_TRACK_DAYS:
            msg = f"轨迹日期范围不能超过 {_MAX_TRACK_DAYS} 天"
            raise ValidationError(msg)

        visits = (
            self.db.query(MerchantVisit, MerchantStore)
            .join(MerchantStore, MerchantStore.id == MerchantVisit.store_id)
            .filter(
                MerchantVisit.employee_id == employee_id,
                MerchantVisit.visited_at >= start,
                MerchantVisit.visited_at < end,
                MerchantVisit.is_deleted.is_(False),
            )
            .order_by(MerchantVisit.visited_at.asc())
            .all()
        )

        items = []
        for visit, store in visits:
            has_coordinate = visit.lng is not None and visit.lat is not None
            items.append(
                MerchantTrackItem(
                    visit_id=str(visit.id),
                    store_id=str(visit.store_id),
                    store_name=store.store_name,
                    employee_id=str(visit.employee_id),
                    employee_name=employee.nickname or employee.username,
                    visited_at=visit.visited_at,
                    lng=float(visit.lng) if has_coordinate else None,
                    lat=float(visit.lat) if has_coordinate else None,
                    address=visit.address,
                    contact_name=visit.contact_name,
                    result=visit.result,
                    remark=visit.remark,
                    photos=visit.photos or [],
                    has_coordinate=has_coordinate,
                ),
            )

        add_audit_log(
            self.db,
            user_id=str(user.id),
            action="view",
            resource_type="merchant_track",
            resource_id=employee_id,
            before=None,
            after={
                "employee_id": employee_id,
                "start": start.isoformat(),
                "end": end.isoformat(),
                "visit_count": len(items),
            },
            request=request,
        )
        self.db.commit()
        return MerchantTrackResponse(
            items=items,
            stats=MerchantTrackStats(
                visit_count=len(items),
                store_count=len({item.store_id for item in items}),
            ),
        )


__all__ = ["MerchantMapService"]
