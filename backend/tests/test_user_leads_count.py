"""user_service.get_users / get_user_by_id 的 leads_count 聚合测试.

覆盖 spec `redesign-admin-users-page` 的 Tasks 1-4：
- UserResponse.leads_count 字段默认 0（用户无提交线索）
- get_users / get_user_by_id 返回的 User 实例上正确填充 leads_count
- 列表查询在用户名筛选下仍能正确聚合
- HTTP 层 GET /api/v1/users/{id} / GET /api/v1/users/me 响应包含 leads_count
"""

from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models import Role, User
from models.common import LeadStatus
from models.lead import Lead
from services.system.user import UserService

# 测试用密码（满足强度要求）
_TEST_PASSWORD = "Test1234!"


def _make_user(
    session: Session,
    *,
    user_id: str,
    username: str,
    nickname: str = "测试用户",
    role_code: str = "admin",
) -> User:
    """创建并持久化一个用户（直接走 ORM，绕过 service 校验，专用于测试聚合查询）."""
    role = session.query(Role).filter(Role.code == role_code).first()
    user = User(
        id=user_id,
        username=username,
        password=_TEST_PASSWORD,
        nickname=nickname,
        role_id=role.id,
        status="active",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _make_lead(session: Session, *, creator_id: str | None = None) -> Lead:
    """创建并持久化一条线索（默认状态 PENDING_ASSESSMENT）."""
    lead = Lead(
        id=str(uuid4()),
        community_name="测试小区",
        status=LeadStatus.PENDING_ASSESSMENT,
        creator_id=creator_id,
    )
    session.add(lead)
    return lead


# ==================== Service 层 ====================


class TestGetUsersLeadsCount:
    """user_service.get_users 的 leads_count 聚合."""

    def test_get_users_returns_zero_leads_count_for_user_with_no_leads(self, seeded_db: dict[str, Any]) -> None:
        """无提交线索的用户 leads_count 应为 0."""
        session = seeded_db["session"]
        user = _make_user(
            session,
            user_id="no-leads-user",
            username="no-leads-user",
        )

        total, users = UserService().get_users(session)

        assert total >= 1, "应至少返回刚创建的用户"
        matched = [u for u in users if u.id == user.id]
        assert matched, "用户列表中应包含刚创建的用户"
        assert getattr(matched[0], "leads_count", None) == 0, (
            f"无提交线索的用户 leads_count 应为 0，实际 {getattr(matched[0], 'leads_count', None)}"
        )

    def test_get_users_returns_correct_leads_count(self, seeded_db: dict[str, Any]) -> None:
        """提交 3 条线索的用户 leads_count 应为 3."""
        session = seeded_db["session"]
        user = _make_user(
            session,
            user_id="with-leads-user",
            username="with-leads-user",
        )
        for _ in range(3):
            _make_lead(session, creator_id=user.id)
        session.commit()

        total, users = UserService().get_users(session)

        assert total >= 1, "应至少返回刚创建的用户"
        matched = [u for u in users if u.id == user.id]
        assert matched, "用户列表中应包含刚创建的用户"
        assert getattr(matched[0], "leads_count", None) == 3, (
            f"提交 3 条线索的用户 leads_count 应为 3，实际 {getattr(matched[0], 'leads_count', None)}"
        )

    def test_get_users_with_username_filter_preserves_leads_count(self, seeded_db: dict[str, Any]) -> None:
        """按用户名筛选时，聚合的 leads_count 仍应反映真实提交数."""
        session = seeded_db["session"]
        user = _make_user(
            session,
            user_id="filter-user",
            username="filter-user-unique",
        )
        for _ in range(2):
            _make_lead(session, creator_id=user.id)
        session.commit()

        total, users = UserService().get_users(session, username="filter-user-unique")

        assert total == 1, "按用户名筛选应仅返回 1 个用户"
        assert len(users) == 1
        assert users[0].id == user.id
        assert getattr(users[0], "leads_count", None) == 2, (
            f"筛选场景下 leads_count 应为 2，实际 {getattr(users[0], 'leads_count', None)}"
        )

    def test_get_users_total_counts_users_not_leads(self, seeded_db: dict[str, Any]) -> None:
        """Total 应为匹配筛选条件的用户数，不应被 lead join 放大."""
        session = seeded_db["session"]
        user = _make_user(
            session,
            user_id="total-count-user",
            username="total-count-user",
        )
        for _ in range(5):
            _make_lead(session, creator_id=user.id)
        session.commit()

        total, users = UserService().get_users(session, username="total-count-user")

        assert total == 1, f"total 应为用户数 1，实际 {total}（不应被 lead 数量放大）"
        assert len(users) == 1
        assert getattr(users[0], "leads_count", None) == 5


class TestGetUsersSorting:
    """user_service.get_users 的排序（回归守护 sort=role 的 joinedload 别名冲突）."""

    def test_sort_by_role_does_not_crash_and_orders_correctly(self, seeded_db: dict[str, Any]) -> None:
        """sort=role 不应触发 500.

        曾因 joinedload 别名化 roles 表为 roles_1，ORDER BY roles.code 引用未别名表
        导致 PostgreSQL UndefinedTable。修复后应正常返回且 role 已加载。
        """
        session = seeded_db["session"]
        admin = _make_user(session, user_id="sort-role-admin", username="sort-role-admin", role_code="admin")
        _make_user(session, user_id="sort-role-user", username="sort-role-user", role_code="user")

        total, users = UserService().get_users(session, sort="role", sort_dir="asc")

        assert total >= 2
        # joinedload(User.role) 不应被 with_entities 破坏
        for u in users:
            assert u.role is not None, f"user {u.id} role 未加载"
        # 字母序 asc：admin 应排在 user 之前
        ids = [u.id for u in users]
        assert ids.index(admin.id) < ids.index("sort-role-user"), f"asc 排序错误: {ids}"

    def test_sort_by_leads_count_orders_correctly(self, seeded_db: dict[str, Any]) -> None:
        """sort=leads_count desc 应按线索数降序排列."""
        session = seeded_db["session"]
        low = _make_user(session, user_id="sort-lc-low", username="sort-lc-low")
        high = _make_user(session, user_id="sort-lc-high", username="sort-lc-high")
        _make_lead(session, creator_id=low.id)
        for _ in range(3):
            _make_lead(session, creator_id=high.id)
        session.commit()

        _, users = UserService().get_users(session, sort="leads_count", sort_dir="desc")
        ids = [u.id for u in users]
        assert ids.index(high.id) < ids.index(low.id), f"desc 排序错误: {ids}"

    def test_invalid_sort_falls_back_to_created_at(self, seeded_db: dict[str, Any]) -> None:
        """非法 sort 值应回退到 created_at，不抛异常."""
        session = seeded_db["session"]
        _make_user(session, user_id="sort-invalid", username="sort-invalid")

        total, users = UserService().get_users(session, sort="malicious_field", sort_dir="asc")

        assert total >= 1
        assert users, "非法 sort 应回退而非崩溃"


class TestGetUserByIdLeadsCount:
    """user_service.get_user_by_id 的 leads_count 聚合."""

    def test_get_user_by_id_returns_leads_count(self, seeded_db: dict[str, Any]) -> None:
        """get_user_by_id 应在 User 实例上填充 leads_count."""
        session = seeded_db["session"]
        user = _make_user(
            session,
            user_id="by-id-user",
            username="by-id-user",
        )
        for _ in range(3):
            _make_lead(session, creator_id=user.id)
        session.commit()

        fetched = UserService().get_user_by_id(session, user.id)

        assert fetched is not None
        assert getattr(fetched, "leads_count", None) == 3, (
            f"get_user_by_id 的 leads_count 应为 3，实际 {getattr(fetched, 'leads_count', None)}"
        )

    def test_get_user_by_id_returns_zero_when_no_leads(self, seeded_db: dict[str, Any]) -> None:
        """无提交线索的用户通过 get_user_by_id 查询时 leads_count 应为 0."""
        session = seeded_db["session"]
        user = _make_user(
            session,
            user_id="by-id-no-leads",
            username="by-id-no-leads",
        )

        fetched = UserService().get_user_by_id(session, user.id)

        assert fetched is not None
        assert getattr(fetched, "leads_count", None) == 0

    def test_get_user_by_id_returns_none_when_not_found(self, seeded_db: dict[str, Any]) -> None:
        """查询不存在的用户应返回 None（不应抛异常）."""
        session = seeded_db["session"]

        fetched = UserService().get_user_by_id(session, "nonexistent-user-id")

        assert fetched is None


# ==================== HTTP 层 ====================


class TestUserResponseLeadsCount:
    """UserResponse 响应中 leads_count 字段序列化."""

    def test_get_user_endpoint_returns_leads_count(self, seeded_db: dict[str, Any], backend_client: TestClient) -> None:
        """GET /api/v1/users/{id} 响应应包含 leads_count 字段."""
        session = seeded_db["session"]
        user = _make_user(
            session,
            user_id="http-detail-user",
            username="http-detail-user",
        )
        for _ in range(4):
            _make_lead(session, creator_id=user.id)
        session.commit()

        resp = backend_client.get(f"/api/v1/users/{user.id}")
        assert resp.status_code == 200, f"获取用户详情应返回 200，实际 {resp.status_code}: {resp.text}"
        body = resp.json()
        assert body["id"] == user.id
        assert body["leads_count"] == 4, f"响应 leads_count 应为 4，实际 {body.get('leads_count')}"

    def test_get_users_list_endpoint_returns_leads_count(
        self, seeded_db: dict[str, Any], backend_client: TestClient
    ) -> None:
        """GET /api/v1/users 列表项应包含 leads_count 字段."""
        session = seeded_db["session"]
        user = _make_user(
            session,
            user_id="http-list-user",
            username="http-list-user-unique",
        )
        for _ in range(2):
            _make_lead(session, creator_id=user.id)
        session.commit()

        resp = backend_client.get("/api/v1/users?username=http-list-user-unique")
        assert resp.status_code == 200, f"获取用户列表应返回 200，实际 {resp.status_code}: {resp.text}"
        body = resp.json()
        items = body.get("items", [])
        assert len(items) == 1
        assert items[0]["id"] == user.id
        assert items[0]["leads_count"] == 2, f"列表项 leads_count 应为 2，实际 {items[0].get('leads_count')}"

    def test_get_current_user_endpoint_returns_leads_count(
        self, seeded_db: dict[str, Any], backend_client: TestClient
    ) -> None:
        """GET /api/v1/users/me 响应应包含 leads_count 字段."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        for _ in range(3):
            _make_lead(session, creator_id=admin.id)
        session.commit()

        resp = backend_client.get("/api/v1/users/me")
        assert resp.status_code == 200, f"获取当前用户应返回 200，实际 {resp.status_code}: {resp.text}"
        body = resp.json()
        assert body["id"] == admin.id
        assert body["leads_count"] == 3, f"/users/me leads_count 应为 3，实际 {body.get('leads_count')}"

    def test_get_current_user_endpoint_returns_zero_when_no_leads(
        self, seeded_db: dict[str, Any], normal_user_client: TestClient
    ) -> None:
        """无提交线索的当前用户 /users/me 响应 leads_count 应为 0."""
        resp = normal_user_client.get("/api/v1/users/me")
        assert resp.status_code == 200, f"获取当前用户应返回 200，实际 {resp.status_code}: {resp.text}"
        body = resp.json()
        assert body["leads_count"] == 0, f"无提交线索的当前用户 leads_count 应为 0，实际 {body.get('leads_count')}"
