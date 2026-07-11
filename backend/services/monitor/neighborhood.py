"""周边竞品雷达服务（从 monitor/service.py 拆分）.

提供小区及其竞品的挂牌/成交统计，按数据来源分渠道，并计算与本案的价差。
"""

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import Float, func
from sqlalchemy.orm import Session

from models import Community, CommunityCompetitor, PropertyCurrent, PropertyStatus
from schemas.monitor import NeighborhoodRadarItem, NeighborhoodRadarResponse

# 数据源匹配模式：data_source 为自由文本，使用子串匹配区分渠道
# （贝壳与链家同属贝壳系，故合并为 BEIKE 渠道）
BEIKE_PATTERNS = ("beike", "贝壳", "链家")
I5I5J_PATTERNS = ("5i5j", "我爱")


def _match_data_source(src: str) -> str:
    """根据数据源字符串判断渠道.

    返回 'beike' 或 'i5i5j'；无法识别时返回空串。
    src 应为已 lower 的字符串。
    """
    if any(p in src for p in BEIKE_PATTERNS):
        return "beike"
    if any(p in src for p in I5I5J_PATTERNS):
        return "i5i5j"
    return ""


class NeighborhoodRadarService:
    """周边竞品雷达服务."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_neighborhood_radar(self, community_id: str) -> NeighborhoodRadarResponse:
        """获取周边竞品雷达数据.

        包含本案小区和所有竞品小区的挂牌/成交统计，按数据来源分渠道
        """
        one_year_ago = datetime.now(timezone.utc) - timedelta(days=365)

        communities = self._fetch_neighborhood_communities(community_id)
        if communities is None:
            return NeighborhoodRadarResponse(items=[])
        all_community_ids, community_map = communities

        listing_query, deal_query = self._fetch_neighborhood_bulk_stats(all_community_ids, one_year_ago)
        all_stats = self._aggregate_neighborhood_stats(listing_query, deal_query, all_community_ids)
        items = self._build_neighborhood_items(all_community_ids, community_map, all_stats, community_id)

        return NeighborhoodRadarResponse(items=items)

    def _fetch_neighborhood_communities(
        self,
        community_id: str,
    ) -> tuple[list[str], dict[str, Community]] | None:
        """获取本案小区及其竞品，返回 (all_ids, community_map).

        本案不存在时返回 None.
        """
        db = self.db
        subject = db.query(Community).filter(Community.id == community_id).first()
        if not subject:
            return None

        competitor_ids = [
            c.competitor_community_id
            for c in db.query(CommunityCompetitor)
            .filter(
                CommunityCompetitor.community_id == community_id,
            )
            .all()
        ]

        all_community_ids = [community_id, *competitor_ids]
        communities = db.query(Community).filter(Community.id.in_(all_community_ids)).all()
        community_map = {c.id: c for c in communities}
        return all_community_ids, community_map

    def _fetch_neighborhood_bulk_stats(
        self,
        all_community_ids: list[str],
        one_year_ago: datetime,
    ) -> tuple[list[Any], list[Any]]:
        """批量查询所有小区的挂牌与成交统计（按 community_id + data_source 分组）."""
        db = self.db
        listing_query = (
            db.query(
                PropertyCurrent.community_id,
                PropertyCurrent.data_source,
                func.count().label("count"),
                func.avg(func.cast(PropertyCurrent.listed_price_wan, Float) / PropertyCurrent.build_area * 10000).label(
                    "avg_price",
                ),
            )
            .filter(
                PropertyCurrent.community_id.in_(all_community_ids),
                PropertyCurrent.status == PropertyStatus.FOR_SALE,
                PropertyCurrent.build_area > 0,
            )
            .group_by(PropertyCurrent.community_id, PropertyCurrent.data_source)
            .all()
        )

        deal_query = (
            db.query(
                PropertyCurrent.community_id,
                PropertyCurrent.data_source,
                func.count().label("count"),
                func.avg(func.cast(PropertyCurrent.sold_price_wan, Float) / PropertyCurrent.build_area * 10000).label(
                    "avg_price",
                ),
            )
            .filter(
                PropertyCurrent.community_id.in_(all_community_ids),
                PropertyCurrent.status == PropertyStatus.SOLD,
                PropertyCurrent.sold_date >= one_year_ago,
                PropertyCurrent.build_area > 0,
            )
            .group_by(PropertyCurrent.community_id, PropertyCurrent.data_source)
            .all()
        )

        return listing_query, deal_query

    def _aggregate_neighborhood_stats(
        self,
        listing_query: list[Any],
        deal_query: list[Any],
        all_community_ids: list[str],
    ) -> dict[str, dict[str, Any]]:
        """在内存中聚合挂牌与成交数据，按渠道归类计数."""
        all_stats: dict[str, dict[str, Any]] = {
            cid: {
                "listing_count": 0,
                "listing_beike": 0,
                "listing_i5i5j": 0,
                "listing_total_price": 0.0,
                "deal_count": 0,
                "deal_beike": 0,
                "deal_i5i5j": 0,
                "deal_total_price": 0.0,
            }
            for cid in all_community_ids
        }

        # 处理挂牌数据
        for row in listing_query:
            cid = row.community_id
            if cid not in all_stats:
                continue
            src = (row.data_source or "").lower()
            count = row.count
            avg = float(row.avg_price or 0)

            all_stats[cid]["listing_count"] += count
            all_stats[cid]["listing_total_price"] += avg * count

            channel = _match_data_source(src)
            if channel == "beike":
                all_stats[cid]["listing_beike"] += count
            elif channel == "i5i5j":
                all_stats[cid]["listing_i5i5j"] += count

        # 处理成交数据
        for row in deal_query:
            cid = row.community_id
            if cid not in all_stats:
                continue
            src = (row.data_source or "").lower()
            count = row.count
            avg = float(row.avg_price or 0)

            all_stats[cid]["deal_count"] += count
            all_stats[cid]["deal_total_price"] += avg * count

            channel = _match_data_source(src)
            if channel == "beike":
                all_stats[cid]["deal_beike"] += count
            elif channel == "i5i5j":
                all_stats[cid]["deal_i5i5j"] += count

        return all_stats

    def _build_neighborhood_items(
        self,
        all_community_ids: list[str],
        community_map: dict[str, Community],
        all_stats: dict[str, dict[str, Any]],
        community_id: str,
    ) -> list[NeighborhoodRadarItem]:
        """计算均价、价差并组装响应项，本案排在最后."""
        # 1. 计算均价
        final_stats: dict[str, dict[str, Any]] = {}
        for cid, data in all_stats.items():
            l_count = data["listing_count"]
            d_count = data["deal_count"]
            final_stats[cid] = {
                **data,
                "listing_avg_price": round(data["listing_total_price"] / l_count, 0) if l_count > 0 else 0,
                "deal_avg_price": round(data["deal_total_price"] / d_count, 0) if d_count > 0 else 0,
            }

        subject_deal_avg = final_stats[community_id]["deal_avg_price"]

        # 2. 构建响应
        items: list[NeighborhoodRadarItem] = []
        for cid in all_community_ids:
            c = community_map.get(cid)
            if not c:
                continue
            stats = final_stats[cid]
            is_subject = cid == community_id

            # 计算价差
            if is_subject:
                spread_percent = 0.0
                spread_label = "[ 当前位置 ]"
            elif subject_deal_avg > 0 and stats["deal_avg_price"] > 0:
                spread_percent = ((stats["deal_avg_price"] - subject_deal_avg) / subject_deal_avg) * 100
                if spread_percent > 0:
                    spread_label = f"高于本案 {abs(spread_percent):.1f}%"
                else:
                    spread_label = f"低于本案 {abs(spread_percent):.1f}%"
            else:
                spread_percent = 0.0
                spread_label = "数据不足"

            items.append(
                NeighborhoodRadarItem(
                    community_id=cid,
                    community_name=c.name + (" (本案)" if is_subject else ""),
                    is_subject=is_subject,
                    listing_count=stats["listing_count"],
                    listing_beike=stats["listing_beike"],
                    listing_iaij=stats["listing_i5i5j"],
                    listing_avg_price=stats["listing_avg_price"],
                    deal_count=stats["deal_count"],
                    deal_beike=stats["deal_beike"],
                    deal_iaij=stats["deal_i5i5j"],
                    deal_avg_price=stats["deal_avg_price"],
                    spread_percent=round(spread_percent, 1),
                    spread_label=spread_label,
                ),
            )

        # 本案排在最后
        items.sort(key=lambda x: (x.is_subject, x.community_name))
        return items
