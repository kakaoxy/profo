"""LeadQueryService.get_status_stats 回归测试.

覆盖 commit 870f8bb（新增状态统计 API）与 7309f2d（修复 NULL 状态过滤）的风险路径：
- 各状态线索数量正确分组
- 软删除线索不计入统计
- NULL 状态线索不导致查询崩溃且不计入统计（核心回归点）

说明：Lead.status 模型声明 nullable=False，但生产环境可能因历史数据迁移残留 NULL。
修复前，GROUP BY 返回 (None, count) 行，后续 status.value 抛 AttributeError 使接口 500。
"""

import uuid

from sqlalchemy import text
from sqlalchemy.orm import Session

from models.common import LeadStatus
from models.lead import Lead
from services.leads.internal import LeadQueryService


def _make_lead(
    db_session: Session,
    *,
    status: LeadStatus,
    is_deleted: bool = False,
    lead_id: str | None = None,
) -> Lead:
    """创建并持久化一条线索（id 未指定时由模型默认生成 UUID）."""
    lead = Lead(
        id=lead_id or str(uuid.uuid4()),
        community_name="测试小区",
        status=status,
        is_deleted=is_deleted,
    )
    db_session.add(lead)
    return lead


def test_get_status_stats_returns_correct_counts_per_status(db_session: Session) -> None:
    """各状态线索应按状态正确分组计数."""
    _make_lead(db_session, status=LeadStatus.PENDING_ASSESSMENT)
    _make_lead(db_session, status=LeadStatus.PENDING_ASSESSMENT)
    _make_lead(db_session, status=LeadStatus.VISITED)
    _make_lead(db_session, status=LeadStatus.SIGNED)
    db_session.commit()

    stats = LeadQueryService(db_session).get_status_stats()

    assert stats == {
        LeadStatus.PENDING_ASSESSMENT.value: 2,
        LeadStatus.PENDING_VISIT.value: 0,
        LeadStatus.REJECTED.value: 0,
        LeadStatus.VISITED.value: 1,
        LeadStatus.SIGNED.value: 1,
        LeadStatus.LOST_TO_COMPETITOR.value: 0,
    }


def test_get_status_stats_excludes_soft_deleted_leads(db_session: Session) -> None:
    """软删除线索不应计入统计."""
    _make_lead(db_session, status=LeadStatus.PENDING_ASSESSMENT)
    _make_lead(db_session, status=LeadStatus.PENDING_ASSESSMENT, is_deleted=True)
    _make_lead(db_session, status=LeadStatus.VISITED, is_deleted=True)
    db_session.commit()

    stats = LeadQueryService(db_session).get_status_stats()

    assert stats[LeadStatus.PENDING_ASSESSMENT.value] == 1
    assert stats[LeadStatus.VISITED.value] == 0


def test_get_status_stats_returns_all_statuses_zero_when_empty(db_session: Session) -> None:
    """无线索时，所有状态计数应为 0 且键完整."""
    stats = LeadQueryService(db_session).get_status_stats()

    assert set(stats.keys()) == {s.value for s in LeadStatus}
    assert all(count == 0 for count in stats.values())


def test_get_status_stats_excludes_null_status_leads(db_session: Session) -> None:
    """NULL 状态线索不应导致查询崩溃且不应计入统计（回归 7309f2d）.

    缺陷：get_status_stats 曾缺少 Lead.status.is_not(None) 过滤，当存在 NULL 状态
    线索时，GROUP BY 返回 (None, count) 行，后续 status.value 抛 AttributeError，
    导致统计接口 500。本测试重建 leads 表使 status 可空以模拟生产数据残留。
    """
    # 重建 leads 表，允许 status 为 NULL（模拟生产历史数据迁移残留）
    db_session.execute(text("DROP TABLE IF EXISTS leads"))
    db_session.execute(
        text(
            "CREATE TABLE leads ("
            "id VARCHAR(36) PRIMARY KEY, "
            "community_name VARCHAR(200) NOT NULL, "
            "status VARCHAR(20), "
            "is_deleted BOOLEAN DEFAULT FALSE NOT NULL)",
        ),
    )
    # 插入：1 条有效状态、2 条 NULL 状态、1 条软删除
    db_session.execute(
        text(
            "INSERT INTO leads (id, community_name, status, is_deleted) VALUES "
            "('l1','c','PENDING_ASSESSMENT',FALSE),"
            "('l2','c',NULL,FALSE),"
            "('l3','c',NULL,FALSE),"
            "('l4','c','SIGNED',TRUE)",
        ),
    )
    db_session.commit()

    stats = LeadQueryService(db_session).get_status_stats()

    # NULL 状态行被过滤，未引发 AttributeError；软删除行亦被排除
    assert stats[LeadStatus.PENDING_ASSESSMENT.value] == 1
    assert stats[LeadStatus.SIGNED.value] == 0
    assert None not in stats


def test_get_funnel_rejected_includes_lost_to_competitor(db_session: Session) -> None:
    """漏斗「已放弃」桶聚合 rejected + lost_to_competitor（他司成交归入放弃）.

    回归：get_funnel_stats 曾只统计 REJECTED，引入 LOST_TO_COMPETITOR 后各桶
    之和与 total 出现缺口；现 rejected 桶需同时覆盖两终态。
    """
    _make_lead(db_session, status=LeadStatus.REJECTED)
    _make_lead(db_session, status=LeadStatus.LOST_TO_COMPETITOR)
    _make_lead(db_session, status=LeadStatus.SIGNED)
    db_session.commit()

    stats = LeadQueryService(db_session).get_funnel_stats()

    assert stats["rejected"] == 2
    assert stats["total"] == 3
    # 各桶之和 == total（漏斗口径闭合）
    assert stats["evaluating"] + stats["rejected"] + stats["visiting"] + stats["signed"] == stats["total"]


def test_get_acquired_list_rejected_includes_lost_to_competitor(db_session: Session) -> None:
    """获客列表 status=rejected 应聚合 lost_to_competitor（他司成交归入放弃）.

    回归：get_acquired_list 曾只按单一 status 过滤，C 端「已放弃」chip 无法看到
    他司已成交线索；现 rejected 视为 umbrella，隐含 lost_to_competitor。
    """
    user_id = str(uuid.uuid4())
    for status in (LeadStatus.REJECTED, LeadStatus.LOST_TO_COMPETITOR, LeadStatus.SIGNED):
        lead = _make_lead(db_session, status=status)
        lead.creator_id = user_id
    db_session.commit()

    svc = LeadQueryService(db_session)
    result = svc.get_acquired_list(page=1, page_size=20, user_id=user_id, status=LeadStatus.REJECTED)
    statuses = {lead.status for lead in result["items"]}

    assert LeadStatus.REJECTED in statuses
    assert LeadStatus.LOST_TO_COMPETITOR in statuses
    assert LeadStatus.SIGNED not in statuses
    assert result["total"] == 2
