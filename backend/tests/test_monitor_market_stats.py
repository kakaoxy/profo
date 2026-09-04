"""MonitorService.get_community_market_stats 统计窗口对齐逻辑单元测试.

被测方法在 `backend/services/monitor/service.py` 中,核心逻辑:
- 查询小区最新成交日 `latest_sold_date`
- 若为 null 或距今 ≤ 7 天,右端点 `as_of = now()`;否则 `as_of = latest_sold_date`
- 30 日成交/均价/趋势窗口均基于 `as_of` 计算,且成交查询带上界 `sold_date <= as_of`
- 响应 `data_as_of` 字段返回 `as_of`

覆盖三个场景:
- 数据延迟 > 7 天:右端点对齐 latest_sold_date,窗口外成交不计入
- 数据正常更新(延迟 ≤ 7 天):右端点用 now()
- 小区完全无成交记录:回退 now() 且成交量为 0
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from models import PropertyCurrent, PropertyStatus
from services.monitor.service import MonitorService

# ==================== 辅助函数 ====================


def _make_sold_property(
    db_session: Session,
    *,
    community_id: str,
    source_property_id: str,
    sold_date: datetime,
    sold_price_wan: Decimal,
    build_area: Decimal = Decimal(100),
) -> None:
    """创建并持久化一条 SOLD 房源记录."""
    db_session.add(
        PropertyCurrent(
            data_source="链家",
            source_property_id=source_property_id,
            community_id=community_id,
            status=PropertyStatus.SOLD,
            rooms=3,
            halls=2,
            floor_original="中楼层",
            floor_level="中楼层",
            orientation="南北",
            build_area=build_area,
            sold_price_wan=sold_price_wan,
            sold_date=sold_date,
            is_active=True,
        ),
    )


def _make_for_sale_property(
    db_session: Session,
    *,
    community_id: str,
    source_property_id: str,
    listed_price_wan: Decimal | None = None,
    listed_date: datetime | None = None,
) -> None:
    """创建并持久化一条 FOR_SALE 房源记录."""
    db_session.add(
        PropertyCurrent(
            data_source="链家",
            source_property_id=source_property_id,
            community_id=community_id,
            status=PropertyStatus.FOR_SALE,
            rooms=3,
            halls=2,
            floor_original="中楼层",
            floor_level="中楼层",
            orientation="南北",
            build_area=Decimal(100),
            listed_price_wan=listed_price_wan,
            listed_date=listed_date,
            is_active=True,
        ),
    )


# ==================== 测试用例 ====================


def test_market_stats_aligned_to_latest_sold_when_data_stale(db_session: Session) -> None:
    """场景 1:数据延迟 > 7 天,右端点对齐 latest_sold_date.

    - 最新成交日距今 29 天(> 7 天),as_of 应等于 latest_sold_date
    - 30 日窗口为 [latest_sold - 30d, latest_sold]
    - 窗口内成交 2 套(latest_sold 当日 + latest_sold - 5 天)
    - 窗口外成交 1 套(latest_sold - 40 天)不应计入 volume_30d
    """
    community_id = "test-community-1"
    now = datetime.now(timezone.utc)
    latest_sold_date = now - timedelta(days=29)

    # 窗口内:as_of 本身(latest_sold_date)
    _make_sold_property(
        db_session,
        community_id=community_id,
        source_property_id="src-1",
        sold_date=latest_sold_date,
        sold_price_wan=Decimal(300),
    )
    # 窗口内:as_of - 5 天
    _make_sold_property(
        db_session,
        community_id=community_id,
        source_property_id="src-2",
        sold_date=latest_sold_date - timedelta(days=5),
        sold_price_wan=Decimal(400),
    )
    # 窗口外:as_of - 40 天(早于 thirty_days_ago,不应计入 volume_30d)
    _make_sold_property(
        db_session,
        community_id=community_id,
        source_property_id="src-3",
        sold_date=latest_sold_date - timedelta(days=40),
        sold_price_wan=Decimal(500),
    )
    db_session.commit()

    response = MonitorService(db_session).get_community_market_stats(community_id)

    # data_as_of 日期部分应等于 latest_sold_date(允许时区差异,比较日期部分)
    assert response.data_as_of is not None
    assert response.data_as_of.date() == latest_sold_date.date()

    # volume_30d 应只包含窗口内 2 套(窗口外的不计入)
    assert response.volume_30d == 2

    # avg_price 应为两套房源单价的算数平均: (30000 + 40000) / 2 = 35000 元/㎡
    assert response.avg_price == 35000.0


def test_market_stats_uses_now_when_data_fresh(db_session: Session) -> None:
    """场景 2:数据正常更新(延迟 ≤ 7 天),右端点用 now().

    最新成交日距今 3 天(≤ 7 天),as_of 应等于 now(允许 ±60 秒).
    """
    community_id = "test-community-2"
    now = datetime.now(timezone.utc)
    latest_sold_date = now - timedelta(days=3)

    _make_sold_property(
        db_session,
        community_id=community_id,
        source_property_id="src-1",
        sold_date=latest_sold_date,
        sold_price_wan=Decimal(300),
    )
    db_session.commit()

    before_call = datetime.now(timezone.utc)
    response = MonitorService(db_session).get_community_market_stats(community_id)
    after_call = datetime.now(timezone.utc)

    assert response.data_as_of is not None
    # data_as_of 应接近 now(允许 ±60 秒)
    assert abs((response.data_as_of - before_call).total_seconds()) < 60
    assert abs((response.data_as_of - after_call).total_seconds()) < 60


def test_market_stats_falls_back_to_now_when_no_deals(db_session: Session) -> None:
    """场景 3:小区完全无成交记录,回退 now 且 volume=0.

    - 仅插入 FOR_SALE 房源,无 SOLD 记录
    - data_as_of 应接近 now(允许 ±60 秒)
    - volume_30d == 0,avg_price == 0.0,price_trend_30d == 0.0,is_price_up is None
    """
    community_id = "test-community-3"
    now = datetime.now(timezone.utc)

    _make_for_sale_property(
        db_session,
        community_id=community_id,
        source_property_id="src-onsale-1",
        listed_price_wan=Decimal(400),
        listed_date=now - timedelta(days=1),
    )
    db_session.commit()

    before_call = datetime.now(timezone.utc)
    response = MonitorService(db_session).get_community_market_stats(community_id)
    after_call = datetime.now(timezone.utc)

    assert response.data_as_of is not None
    assert abs((response.data_as_of - before_call).total_seconds()) < 60
    assert abs((response.data_as_of - after_call).total_seconds()) < 60

    assert response.volume_30d == 0
    assert response.avg_price == 0.0
    assert response.price_trend_30d == 0.0
    assert response.is_price_up is None
