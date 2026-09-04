"""营销房源排序口径测试.

回归覆盖：C 端 /public/projects 与 admin 侧列表排序应为
状态分组优先（在售 → 装修中(在途) → 过往案例(已售)），
组内权重(sort_order)降序、相同权重按创建时间倒序。
"""

from datetime import datetime, timezone
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from main import app
from models import L4MarketingProject, MarketingProjectStatus, PublishStatus
from services.marketing import MarketingProjectService

_BASE = datetime(2026, 1, 1, tzinfo=timezone.utc)
_LIST_URL = "/api/v1/public/projects"


def _create_project(
    session: Session,
    *,
    project_id: int,
    project_status: str,
    sort_order: int,
    created_at: datetime,
) -> L4MarketingProject:
    """创建指定状态/权重/创建时间的已发布房源."""
    project = L4MarketingProject(
        id=project_id,
        community_id="comm-sort",
        community_name="排序测试小区",
        layout="三室两厅",
        orientation="南北通透",
        floor_info="15/28层",
        area=120,
        total_price=500,
        title=f"排序测试房源{project_id}",
        publish_status=PublishStatus.PUBLISHED.value,
        project_status=project_status,
        sort_order=sort_order,
        created_at=created_at,
        updated_at=created_at,
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


def _seed(session: Session) -> None:
    """造排序验证数据集.

    预期顺序（id）：9201, 9204, 9202, 9203, 9205, 9207, 9206
    - 在售组：9201(权重10) > 9204(权重0, 时间新) > 9202(权重0, 时间旧)
    - 装修中组：9203（权重99 最高，但组优先级低于在售）
    - 已售组：9205(权重50) > 9207(权重0, 时间新) > 9206(权重0, 时间旧)
    """
    data = [
        (9201, MarketingProjectStatus.FOR_SALE.value, 10, _BASE),
        (9202, MarketingProjectStatus.FOR_SALE.value, 0, _BASE),
        (9203, MarketingProjectStatus.IN_PROGRESS.value, 99, _BASE),
        (9204, MarketingProjectStatus.FOR_SALE.value, 0, datetime(2026, 6, 1, tzinfo=timezone.utc)),
        (9205, MarketingProjectStatus.SOLD.value, 50, _BASE),
        (9206, MarketingProjectStatus.SOLD.value, 0, _BASE),
        (9207, MarketingProjectStatus.SOLD.value, 0, datetime(2026, 6, 1, tzinfo=timezone.utc)),
    ]
    for pid, status, weight, created in data:
        _create_project(session, project_id=pid, project_status=status, sort_order=weight, created_at=created)


def _get_projects(session: Session, params: dict[str, Any] | None = None) -> Any:
    """免登录请求公开房源列表（裸客户端，不触发 lifespan 的 Redis 依赖）."""

    def _override() -> Any:
        yield session

    app.dependency_overrides[db.get_db] = _override
    try:
        query = {"page": 1, "page_size": 50, **(params or {})}
        return TestClient(app).get(_LIST_URL, params=query)
    finally:
        app.dependency_overrides.clear()


class TestPublicProjectsSorting:
    """C 端公开列表排序口径."""

    def test_status_group_priority_then_weight_then_time(self, seeded_db: dict[str, Any]) -> None:
        """在售 → 装修中 → 已售；组内权重降序、同权重时间倒序."""
        session: Session = seeded_db["session"]
        _seed(session)
        resp = _get_projects(session)
        assert resp.status_code == 200, f"应返回 200，实际 {resp.status_code}: {resp.text}"
        ids = [item["id"] for item in resp.json()["items"] if item["id"] in {9201, 9202, 9203, 9204, 9205, 9206, 9207}]
        assert ids == [9201, 9204, 9202, 9203, 9205, 9207, 9206], f"排序不符合预期: {ids}"

    def test_project_status_filter_unaffected(self, seeded_db: dict[str, Any]) -> None:
        """带 project_status 筛选时仅返回该状态，组内排序仍为权重+时间倒序."""
        session: Session = seeded_db["session"]
        _seed(session)
        resp = _get_projects(session, {"project_status": MarketingProjectStatus.FOR_SALE.value})
        assert resp.status_code == 200, f"应返回 200，实际 {resp.status_code}: {resp.text}"
        body = resp.json()
        ids = [item["id"] for item in body["items"]]
        assert ids == [9201, 9204, 9202], f"在售筛选排序不符合预期: {ids}"
        assert body["total"] == 3


class TestAdminProjectsSorting:
    """Admin 侧列表排序与 C 端同口径."""

    def test_admin_get_projects_same_order(self, seeded_db: dict[str, Any]) -> None:
        """MarketingProjectService.get_projects 同样状态分组优先."""
        session: Session = seeded_db["session"]
        _seed(session)
        items, total = MarketingProjectService(session).get_projects(skip=0, limit=50)
        ids = [item.id for item in items if item.id in {9201, 9202, 9203, 9204, 9205, 9206, 9207}]
        assert ids == [9201, 9204, 9202, 9203, 9205, 9207, 9206], f"admin 排序不符合预期: {ids}"
        assert total >= 7
