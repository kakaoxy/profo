"""钥匙指标 hero 区聚合 Service（小程序员工端 /keys/summary）.

从 key_shares.py 拆出以满足 ≤500 行约束（同 KeySharePublicService 先例）：
跨房源三指标聚合（有钥匙房源数 / 分享数 / 查看次数）+「周二周期」新增量。
统计范围 = 当前用户可见房源（list_accessible_projects，与 /keys/properties
同权限口径，不泄露无关房源）；只读不落库。
"""

import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import KeyShare, KeyShareView, KeyStatus, ProjectKey, ProjectNormalKey, User
from schemas.keys import KeysSummaryPeriod, KeysSummaryResponse
from services.projects.key_access import (
    cycle_period,
    format_period_text,
    list_accessible_projects,
    parse_share_items,
)

# 与 key_shares.py 同口径：东八区（周期窗口/文案均按业务时区计算）
_CST = ZoneInfo("Asia/Shanghai")


class KeySummaryService:
    """钥匙指标 hero 区聚合（列表页页首三指标）."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_summary(self, user: User) -> KeysSummaryResponse:
        """钥匙管理指标 hero 区聚合（设计稿 docs/2026-10-10，跨房源聚合，只读）.

        「有钥匙」= 管理密码已设或 ≥1 组有效普通密码。周期窗口为「周二 00:00 →
        下周一 24:00」（key_access.cycle_period，与小程序带看管理角标同口径）。
        分享/查看按可见房源过滤：KeyShareView 有独立 project_id 列走 SQL 过滤；
        KeyShare 条目存 JSONB（无独立 project_id 列，一条分享可含多个房源），
        取回后在 Python 侧按可见房源集合过滤（KeyShare 量级有限，与
        load_active_shares 全量取回同先例）。密码组删除不回退计数
        （与详情页「历史分享总次数」口径一致）。
        """
        projects = list_accessible_projects(self.db, user)
        start, end = cycle_period()
        if not projects:
            return KeysSummaryResponse(period=self._period_schema(start, end))
        project_ids = {p.id for p in projects}

        # 总量：有钥匙房源 ID 集 = 有管理密码 ∪ 有有效普通密码
        has_manager_ids = {
            row[0] for row in self.db.query(ProjectKey.project_id).filter(ProjectKey.project_id.in_(project_ids)).all()
        }
        has_active_ids = {
            row[0]
            for row in self.db.query(ProjectNormalKey.project_id)
            .filter(ProjectNormalKey.project_id.in_(project_ids), ProjectNormalKey.status == KeyStatus.ACTIVE)
            .all()
        }
        with_keys_ids = has_manager_ids | has_active_ids
        properties_with_keys = len(with_keys_ids)

        # 周期新增房源：本周期内「首次取得钥匙」的房源 = 有钥匙房源中，
        # 最早取得时间（有效普通密码 min(created_at, confirmed_at) 与管理密码
        # created_at 的最小值）≥ 周期起点；跨周期重复生成/确认不重复计
        earliest: dict[uuid.UUID, datetime] = {}
        normal_rows = (
            self.db.query(ProjectNormalKey)
            .filter(ProjectNormalKey.project_id.in_(with_keys_ids), ProjectNormalKey.status == KeyStatus.ACTIVE)
            .all()
        )
        for row in normal_rows:
            candidates = [t for t in (row.created_at, row.confirmed_at) if t is not None]
            if not candidates:
                continue
            first = min(candidates)
            if row.project_id not in earliest or first < earliest[row.project_id]:
                earliest[row.project_id] = first
        manager_rows = self.db.query(ProjectKey).filter(ProjectKey.project_id.in_(with_keys_ids)).all()
        for row in manager_rows:
            first = row.created_at
            if row.project_id not in earliest or first < earliest[row.project_id]:
                earliest[row.project_id] = first
        period_new_properties = sum(1 for t in earliest.values() if t >= start)

        # 分享/查看：累计与周期新增（created_at ∈ [start, end)），均按可见房源过滤。
        # KeyShare 无独立 project_id 列，无法 SQL 端过滤：取回后 Python 侧过滤。
        share_rows = self.db.query(KeyShare).filter(KeyShare.created_at < end).all()
        visible_shares = [s for s in share_rows if project_ids & {pid for pid, _ in parse_share_items(s)}]
        shares_total = len(visible_shares)
        period_new_shares = sum(1 for s in visible_shares if s.created_at >= start)
        views_total = (
            self.db.query(func.count(KeyShareView.id))
            .filter(KeyShareView.project_id.in_(project_ids), KeyShareView.created_at < end)
            .scalar()
            or 0
        )
        period_new_views = (
            self.db.query(func.count(KeyShareView.id))
            .filter(
                KeyShareView.project_id.in_(project_ids),
                KeyShareView.created_at >= start,
                KeyShareView.created_at < end,
            )
            .scalar()
            or 0
        )

        return KeysSummaryResponse(
            properties_with_keys=properties_with_keys,
            shares_total=shares_total,
            views_total=views_total,
            period_new_properties=period_new_properties,
            period_new_shares=period_new_shares,
            period_new_views=period_new_views,
            period=self._period_schema(start, end),
        )

    def _period_schema(self, start: datetime, end: datetime) -> KeysSummaryPeriod:
        """周期窗口 → 响应 Schema（start=窗口首日周二，end=窗口末日周一，text 直出展示文案）."""
        return KeysSummaryPeriod(
            start=start.astimezone(_CST).date(),
            end=(end - timedelta(days=1)).astimezone(_CST).date(),
            text=format_period_text(start, end),
        )
