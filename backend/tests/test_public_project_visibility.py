"""C 端公开房源可见性口径测试.

回归覆盖：GET /public/projects/{id} 与 /consultant 复用 get_project_detail，
历史上只过滤 is_deleted 不过滤 publish_status，导致未发布房源详情与
顾问真实手机号可被免登录访问。修复后读口径与列表/写入口径一致
（publish_status=PUBLISHED 且 is_deleted=False），否则 404。
"""

from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from main import app
from models import L4MarketingProject, MarketingProjectStatus, PublishStatus


def _create_project(
    session: Session,
    *,
    project_id: int,
    publish_status: str,
    is_deleted: bool = False,
) -> L4MarketingProject:
    """创建指定发布状态/软删状态的房源."""
    project = L4MarketingProject(
        id=project_id,
        community_id="comm-1",
        community_name="测试小区",
        layout="三室两厅",
        orientation="南北通透",
        floor_info="15/28层",
        area=120,
        total_price=500,
        title="测试房源",
        publish_status=publish_status,
        project_status=MarketingProjectStatus.FOR_SALE.value,
        is_deleted=is_deleted,
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


def _override_db(session: Session) -> None:
    """覆盖 get_db 依赖指向测试会话（yield 生成器）."""

    def _override() -> Any:
        yield session

    app.dependency_overrides[db.get_db] = _override


def _client() -> TestClient:
    """公开端点无需登录，直接裸客户端."""
    return TestClient(app)


def _get(session: Session, path: str) -> Any:
    _override_db(session)
    try:
        return _client().get(path)
    finally:
        app.dependency_overrides.clear()


_DETAIL_URL = "/api/v1/public/projects/{project_id}"
_CONSULTANT_URL = "/api/v1/public/projects/{project_id}/consultant"


class TestPublicProjectVisibility:
    """C 端公开端点不得暴露未发布/软删除房源."""

    def test_detail_published_returns_200(self, seeded_db: dict[str, Any]) -> None:
        """已发布房源详情正常返回."""
        session: Session = seeded_db["session"]
        _create_project(session, project_id=9101, publish_status=PublishStatus.PUBLISHED.value)
        resp = _get(session, _DETAIL_URL.format(project_id=9101))
        assert resp.status_code == 200, f"应返回 200，实际 {resp.status_code}: {resp.text}"
        assert resp.json()["id"] == 9101

    def test_detail_unpublished_returns_404(self, seeded_db: dict[str, Any]) -> None:
        """未发布(DRAFT)房源详情必须 404，不暴露价格/图片等信息."""
        session: Session = seeded_db["session"]
        _create_project(session, project_id=9102, publish_status=PublishStatus.DRAFT.value)
        resp = _get(session, _DETAIL_URL.format(project_id=9102))
        assert resp.status_code == 404, f"应返回 404，实际 {resp.status_code}: {resp.text}"

    def test_detail_soft_deleted_returns_404(self, seeded_db: dict[str, Any]) -> None:
        """软删除房源详情保持 404（原有行为不回退）."""
        session: Session = seeded_db["session"]
        _create_project(
            session,
            project_id=9103,
            publish_status=PublishStatus.PUBLISHED.value,
            is_deleted=True,
        )
        resp = _get(session, _DETAIL_URL.format(project_id=9103))
        assert resp.status_code == 404, f"应返回 404，实际 {resp.status_code}: {resp.text}"

    def test_consultant_unpublished_returns_404_not_phone(self, seeded_db: dict[str, Any]) -> None:
        """未发布房源的顾问联系方式必须 404，且响应体不包含真实手机号."""
        session: Session = seeded_db["session"]
        _create_project(session, project_id=9104, publish_status=PublishStatus.DRAFT.value)
        resp = _get(session, _CONSULTANT_URL.format(project_id=9104))
        assert resp.status_code == 404, f"应返回 404，实际 {resp.status_code}: {resp.text}"
        assert "13900139000" not in resp.text
