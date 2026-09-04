"""房源分享联系方式按 referrer 切换测试.

覆盖 `GET /public/projects/{id}/consultant` 的可选 referrer 参数：
1. 无 referrer → 返回房源顾问手机号（现状）
2. referrer=有效内部用户（admin，active，有手机号）→ 返回该用户手机号/nickname
3. referrer=C 端客户 → 回退房源顾问
4. referrer=不存在 / 非 active / 无手机号 → 回退房源顾问
"""

from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from main import app
from models import L4MarketingProject, MarketingProjectStatus, PublishStatus, Role, User
from utils.auth import get_password_hash
from utils.crypto import hash_phone

_PUBLIC_CONSULTANT = "/api/v1/public/projects/{project_id}/consultant"


def _create_user(
    session: Session,
    *,
    user_id: str,
    username: str,
    nickname: str,
    role_code: str,
    phone: str | None,
    status: str = "active",
    avatar: str | None = None,
) -> User:
    """按角色码创建用户（含 phone_hash）."""
    role = session.query(Role).filter(Role.code == role_code).first()
    user = User(
        id=user_id,
        username=username,
        password=get_password_hash("Test1234!"),
        nickname=nickname,
        phone=phone,
        phone_hash=hash_phone(phone) if phone else None,
        role_id=role.id,
        status=status,
        avatar=avatar,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _create_published_project(
    session: Session,
    *,
    project_id: int,
    consultant_id: str | None,
) -> L4MarketingProject:
    """创建已发布房源，可指定房源顾问（创建时填写）."""
    project = L4MarketingProject(
        id=project_id,
        community_id="comm-1",
        community_name="测试小区",
        layout="三室两厅",
        orientation="南北通透",
        floor_info="15/28层",
        area=120,
        total_price=500,
        consultant_id=consultant_id,
        title="测试房源",
        publish_status=PublishStatus.PUBLISHED.value,
        project_status=MarketingProjectStatus.FOR_SALE.value,
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


def _override_db(session: Session) -> None:
    """覆盖 get_db 依赖指向测试会话（yield 生成器）."""
    from collections.abc import Generator

    import db

    def _override() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override


def _client() -> TestClient:
    """公开端点无需登录，直接裸客户端（GET 不受 CSRF 限制）."""
    return TestClient(app)


class TestConsultantContactReferrer:
    """顾问联系方式端点按 referrer 动态返回."""

    def test_no_referrer_returns_consultant_phone(self, seeded_db: dict[str, Any]) -> None:
        """无 referrer → 返回房源顾问手机号（现状）."""
        session: Session = seeded_db["session"]
        consultant = _create_user(
            session,
            user_id="consultant-1",
            username="consultant1",
            nickname="顾问一号",
            role_code="user",
            phone="13900139001",
            avatar="https://cdn.example.com/consultant-1.png",
        )
        _create_published_project(session, project_id=9001, consultant_id=consultant.id)
        _override_db(session)
        try:
            resp = _client().get(_PUBLIC_CONSULTANT.format(project_id=9001))
        finally:
            app.dependency_overrides.clear()
        assert resp.status_code == 200, f"应返回 200，实际 {resp.status_code}: {resp.text}"
        body = resp.json()
        assert body["phone"] == "13900139001"
        assert body["nickname"] == "顾问一号"
        assert body["avatar"] == "https://cdn.example.com/consultant-1.png"
        assert body["is_referrer"] is False

    def test_internal_referrer_returns_sharer_phone(self, seeded_db: dict[str, Any]) -> None:
        """referrer=有效内部用户(admin) → 返回该用户手机号/nickname."""
        session: Session = seeded_db["session"]
        consultant = _create_user(
            session,
            user_id="consultant-2",
            username="consultant2",
            nickname="顾问二号",
            role_code="user",
            phone="13900139002",
        )
        sharer = _create_user(
            session,
            user_id="sharer-admin",
            username="shareradmin",
            nickname="分享人管理员",
            role_code="admin",
            phone="13800138088",
            avatar="https://cdn.example.com/sharer-admin.png",
        )
        _create_published_project(session, project_id=9002, consultant_id=consultant.id)
        _override_db(session)
        try:
            resp = _client().get(
                _PUBLIC_CONSULTANT.format(project_id=9002),
                params={"referrer": sharer.id},
            )
        finally:
            app.dependency_overrides.clear()
        assert resp.status_code == 200, f"应返回 200，实际 {resp.status_code}: {resp.text}"
        body = resp.json()
        assert body["phone"] == "13800138088"
        assert body["wechat_number"] == "13800138088"
        assert body["nickname"] == "分享人管理员"
        assert body["avatar"] == "https://cdn.example.com/sharer-admin.png"
        assert body["is_referrer"] is True

    def test_customer_referrer_falls_back_to_consultant(self, seeded_db: dict[str, Any]) -> None:
        """referrer=C 端客户 → 回退房源顾问."""
        session: Session = seeded_db["session"]
        consultant = _create_user(
            session,
            user_id="consultant-3",
            username="consultant3",
            nickname="顾问三号",
            role_code="user",
            phone="13900139003",
        )
        customer = _create_user(
            session,
            user_id="sharer-customer",
            username="sharercustomer",
            nickname="客户分享",
            role_code="customer",
            phone="13700137000",
        )
        _create_published_project(session, project_id=9003, consultant_id=consultant.id)
        _override_db(session)
        try:
            resp = _client().get(
                _PUBLIC_CONSULTANT.format(project_id=9003),
                params={"referrer": customer.id},
            )
        finally:
            app.dependency_overrides.clear()
        assert resp.status_code == 200
        body = resp.json()
        assert body["phone"] == "13900139003"
        assert body["nickname"] == "顾问三号"
        assert body["is_referrer"] is False

    def test_invalid_referrer_falls_back_to_consultant(self, seeded_db: dict[str, Any]) -> None:
        """referrer=不存在/非 active/无手机号 → 回退房源顾问."""
        session: Session = seeded_db["session"]
        consultant = _create_user(
            session,
            user_id="consultant-4",
            username="consultant4",
            nickname="顾问四号",
            role_code="user",
            phone="13900139004",
        )
        _create_published_project(session, project_id=9004, consultant_id=consultant.id)
        # 非 active 内部用户
        inactive_admin = _create_user(
            session,
            user_id="sharer-inactive",
            username="sharerinactive",
            nickname="停用分享人",
            role_code="admin",
            phone="13800138111",
            status="inactive",
        )
        # 无手机号内部用户
        no_phone_user = _create_user(
            session,
            user_id="sharer-nophone",
            username="sharernophone",
            nickname="无号分享人",
            role_code="user",
            phone=None,
        )
        _override_db(session)
        try:
            client = _client()
            for bad_referrer in ["no-such-user", inactive_admin.id, no_phone_user.id]:
                resp = client.get(
                    _PUBLIC_CONSULTANT.format(project_id=9004),
                    params={"referrer": bad_referrer},
                )
                assert resp.status_code == 200, f"应返回 200，实际 {resp.status_code}: {resp.text}"
                body = resp.json()
                assert body["phone"] == "13900139004", f"referrer={bad_referrer} 应回退顾问"
                assert body["nickname"] == "顾问四号"
                assert body["is_referrer"] is False
        finally:
            app.dependency_overrides.clear()

    def test_no_consultant_returns_default_with_null_avatar(self, seeded_db: dict[str, Any]) -> None:
        """房源无顾问 → 返回默认联系方式，avatar=None."""
        session: Session = seeded_db["session"]
        _create_published_project(session, project_id=9005, consultant_id=None)
        _override_db(session)
        try:
            resp = _client().get(_PUBLIC_CONSULTANT.format(project_id=9005))
        finally:
            app.dependency_overrides.clear()
        assert resp.status_code == 200, f"应返回 200，实际 {resp.status_code}: {resp.text}"
        body = resp.json()
        assert body["phone"]
        assert body["nickname"]
        assert body["avatar"] is None
        assert body["is_referrer"] is False
