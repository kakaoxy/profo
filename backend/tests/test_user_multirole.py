"""多角色功能测试.

覆盖：
1. UserService 附加角色管理（create/update with additional_role_ids）
2. AuthService.has_backend_identity 多角色判断
3. has_customer_identity 多角色判断
4. _user_has_any_role / require_roles 多角色检查（HTTP 层）
5. 登录入口（后台/C端）对多角色用户的行为
6. UserResponse 序列化 additional_roles 字段
"""

from collections.abc import Generator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from main import app
from models import Role, User, UserRole
from routers.public.auth import has_customer_identity
from routers.system.auth import _create_miniapp_tokens
from schemas.user import UserCreate, UserUpdate
from services.system.auth import AuthService
from services.system.exceptions import ValidationError
from services.system.user import UserService
from utils.auth import AUDIENCE_ADMIN, AUDIENCE_C, create_access_token, decode_token, get_password_hash

# 测试用密码（满足强度要求：8+ 字符 + 大小写 + 数字 + 特殊字符）
_TEST_PASSWORD = "Test1234!"


def _make_db_override(session: Session) -> type[Generator[Session, None, None]]:
    """创建 get_db 覆盖函数（FastAPI 需要生成器函数）."""

    def _override() -> Generator[Session, None, None]:
        yield session

    return _override


def _create_multi_role_user(
    session: Session,
    *,
    user_id: str,
    username: str,
    password: str = _TEST_PASSWORD,
    nickname: str = "多角色用户",
    main_role_code: str,
    additional_role_codes: list[str] | None = None,
) -> User:
    """直接通过 ORM 创建带附加角色的用户（绕过 service 校验，用于测试登录/权限）.

    Args:
        session: 数据库会话
        user_id: 用户ID
        username: 用户名
        password: 明文密码（内部加密存储）
        nickname: 昵称
        main_role_code: 主角色代码
        additional_role_codes: 附加角色代码列表

    Returns:
        创建的 User 对象（已 refresh，roles 关系已加载）

    """
    main_role = session.query(Role).filter(Role.code == main_role_code).first()
    user = User(
        id=user_id,
        username=username,
        password=get_password_hash(password),
        nickname=nickname,
        role_id=main_role.id,
        status="active",
    )
    session.add(user)
    session.flush()  # 确保 user.id 可用

    if additional_role_codes:
        for code in additional_role_codes:
            role = session.query(Role).filter(Role.code == code).first()
            session.add(UserRole(user_id=user.id, role_id=role.id))

    session.commit()
    session.refresh(user)
    return user


# ==================== 1. UserService 附加角色管理 ====================


class TestUserServiceAdditionalRoles:
    """UserService.create_user / update_user 的附加角色管理."""

    def test_create_user_with_additional_customer_role(self, seeded_db: dict[str, Any]) -> None:
        """创建带附加 customer 身份的后台用户：主角色 user-role + 附加 customer-role."""
        session = seeded_db["session"]
        user_service = UserService()

        user_data = UserCreate(
            username="multirole-create",
            password=_TEST_PASSWORD,
            nickname="多角色创建",
            role_id="user-role",
            additional_role_ids=["customer-role"],
        )
        user = user_service.create_user(session, user_data, additional_role_ids=["customer-role"])

        # 主角色仍为 user-role
        assert user.role_id == "user-role"
        # 附加角色含 customer
        additional_codes = {r.code for r in user.roles}
        assert "customer" in additional_codes

    def test_create_user_rejects_non_customer_additional_role(self, seeded_db: dict[str, Any]) -> None:
        """附加非 customer 角色被拒（如 operator-role）."""
        session = seeded_db["session"]
        user_service = UserService()

        user_data = UserCreate(
            username="multirole-reject-op",
            password=_TEST_PASSWORD,
            nickname="拒绝operator",
            role_id="user-role",
            additional_role_ids=["operator-role"],
        )
        with pytest.raises(ValidationError, match="附加角色仅支持 customer"):
            user_service.create_user(session, user_data, additional_role_ids=["operator-role"])

    def test_create_user_rejects_customer_when_main_is_customer(self, seeded_db: dict[str, Any]) -> None:
        """主角色已是 customer 时附加 customer 被拒."""
        session = seeded_db["session"]
        user_service = UserService()

        user_data = UserCreate(
            username="multirole-cust-main",
            password=_TEST_PASSWORD,
            nickname="customer主角色",
            role_id="customer-role",
            additional_role_ids=["customer-role"],
        )
        with pytest.raises(ValidationError, match="主角色已为 C 端身份，无需附加"):
            user_service.create_user(session, user_data, additional_role_ids=["customer-role"])

    def test_update_user_clears_additional_roles(self, seeded_db: dict[str, Any]) -> None:
        """更新用户清空附加角色（additional_role_ids=[]）."""
        session = seeded_db["session"]
        user_service = UserService()

        # 先创建带附加 customer 角色的用户
        user_data = UserCreate(
            username="multirole-clear",
            password=_TEST_PASSWORD,
            nickname="清空附加",
            role_id="user-role",
            additional_role_ids=["customer-role"],
        )
        user = user_service.create_user(session, user_data, additional_role_ids=["customer-role"])
        assert len(user.roles) > 0

        # 清空附加角色
        update_data = UserUpdate(additional_role_ids=[])
        updated = user_service.update_user(session, user.id, update_data, additional_role_ids=[])
        assert updated.roles == []

    def test_update_user_replaces_additional_roles(self, seeded_db: dict[str, Any]) -> None:
        """更新用户全量替换附加角色（非追加，无重复）."""
        session = seeded_db["session"]
        user_service = UserService()

        # 先创建带附加 customer 角色的用户
        user_data = UserCreate(
            username="multirole-replace",
            password=_TEST_PASSWORD,
            nickname="替换附加",
            role_id="admin-role",
            additional_role_ids=["customer-role"],
        )
        user = user_service.create_user(session, user_data, additional_role_ids=["customer-role"])
        assert len(user.roles) == 1

        # 再次传入相同的 customer-role：应为全量替换（删除后重建），不产生重复记录
        update_data = UserUpdate(additional_role_ids=["customer-role"])
        updated = user_service.update_user(session, user.id, update_data, additional_role_ids=["customer-role"])
        assert len(updated.roles) == 1
        assert updated.roles[0].code == "customer"

    def test_update_customer_to_internal_with_customer_additional(self, seeded_db: dict[str, Any]) -> None:
        """将 C 端用户（主角色 customer）改为内部角色并附加 customer 身份.

        场景：原主角色 customer → 改为 user-role + 附加 customer-role。
        验证 _build_additional_user_roles 在 role_id 被 setattr 更新后能正确识别新主角色，
        不会因 user.role relationship 缓存返回旧 customer 角色而误报"主角色已为 C 端身份"。
        """
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        user_service = UserService()

        # 创建纯 C 端用户（主角色 customer，无附加角色）
        customer_user_obj = _create_multi_role_user(
            session,
            user_id="cust-to-internal",
            username="cust-to-internal",
            main_role_code="customer",
        )

        # 改主角色为 user-role，同时附加 customer-role 保留 C 端身份
        update_data = UserUpdate(role_id="user-role")
        updated = user_service.update_user(
            session,
            customer_user_obj.id,
            update_data,
            additional_role_ids=["customer-role"],
            operator_id=admin.id,
        )

        # 主角色已切换为 user-role
        assert updated.role_id == "user-role"
        # 附加角色含 customer，C 端身份保留
        additional_codes = {r.code for r in updated.roles}
        assert "customer" in additional_codes


# ==================== 2. AuthService.has_backend_identity ====================


class TestHasBackendIdentity:
    """AuthService.has_backend_identity 多角色判断."""

    def test_has_backend_identity_admin_only(self, seeded_db: dict[str, Any]) -> None:
        """纯 admin 用户（主角色 admin，无附加）→ True."""
        admin = seeded_db["users"]["admin"]
        assert AuthService.has_backend_identity(admin) is True

    def test_has_backend_identity_customer_with_backend_additional(self, seeded_db: dict[str, Any]) -> None:
        """主 customer + 附加 admin → True（通过附加角色获得后台身份）."""
        session = seeded_db["session"]
        user = _create_multi_role_user(
            session,
            user_id="cust-with-admin",
            username="cust-admin",
            main_role_code="customer",
            additional_role_codes=["admin"],
        )
        assert AuthService.has_backend_identity(user) is True

    def test_has_backend_identity_pure_customer(self, customer_user: User) -> None:
        """纯 customer 用户（无附加后台角色）→ False."""
        assert AuthService.has_backend_identity(customer_user) is False


# ==================== 3. has_customer_identity ====================


class TestHasCustomerIdentity:
    """has_customer_identity 多角色判断."""

    def test_has_customer_identity_pure_customer(self, customer_user: User) -> None:
        """纯 customer 用户 → True."""
        assert has_customer_identity(customer_user) is True

    def test_has_customer_identity_backend_user_with_customer_additional(self, seeded_db: dict[str, Any]) -> None:
        """主 admin + 附加 customer → True（通过附加角色获得 C 端身份）."""
        session = seeded_db["session"]
        user = _create_multi_role_user(
            session,
            user_id="admin-with-cust",
            username="admin-cust",
            main_role_code="admin",
            additional_role_codes=["customer"],
        )
        assert has_customer_identity(user) is True

    def test_has_customer_identity_pure_admin(self, seeded_db: dict[str, Any]) -> None:
        """纯 admin 用户（无附加 customer 角色）→ False."""
        admin = seeded_db["users"]["admin"]
        assert has_customer_identity(admin) is False


# ==================== 4. require_roles 多角色检查（HTTP 层） ====================


class TestRequireRolesMultiRole:
    """require_roles 多角色检查：主角色或附加角色任一命中即通过."""

    def test_require_roles_main_role_match(self, backend_client: TestClient) -> None:
        """主角色命中 required_roles 时通过：admin 访问 GET /users → 200."""
        resp = backend_client.get("/api/v1/users")
        assert resp.status_code == 200, f"admin 访问用户列表应返回 200，实际 {resp.status_code}: {resp.text}"

    def test_require_roles_additional_role_match(self, seeded_db: dict[str, Any]) -> None:
        """附加角色命中 required_roles 时通过：admin+customer 访问 C 端 /me → 200."""
        session = seeded_db["session"]
        user = _create_multi_role_user(
            session,
            user_id="admin-cust-role-match",
            username="admin-cust-rm",
            main_role_code="admin",
            additional_role_codes=["customer"],
        )

        # 为 admin+customer 用户签发 C 端受众 Token（aud=c）
        token = create_access_token(
            data={"sub": user.id, "role": "customer", "ver": user.token_version},
            audience=AUDIENCE_C,
        )

        app.dependency_overrides[db.get_db] = _make_db_override(session)
        try:
            client = TestClient(app, cookies={"c_access_token": token})
            # GET /api/v1/public/auth/me 要求 require_roles(["customer"])
            resp = client.get("/api/v1/public/auth/me")
            assert resp.status_code == 200, (
                f"admin+customer 访问 C 端 /me 应返回 200，实际 {resp.status_code}: {resp.text}"
            )
        finally:
            app.dependency_overrides.clear()

    def test_require_roles_no_match(self, seeded_db: dict[str, Any]) -> None:
        """无任何角色命中时返回 403：operator 访问需要 admin 的接口."""
        session = seeded_db["session"]
        operator = _create_multi_role_user(
            session,
            user_id="operator-no-match",
            username="operator-nm",
            main_role_code="operator",
        )

        token = create_access_token(
            data={"sub": operator.id, "role": "operator", "ver": operator.token_version},
            audience=AUDIENCE_ADMIN,
        )

        app.dependency_overrides[db.get_db] = _make_db_override(session)
        try:
            client = TestClient(app, cookies={"access_token": token})
            client.headers["X-Requested-With"] = "XMLHttpRequest"
            # GET /api/v1/users 要求 require_roles(["admin"])，operator 无 admin 角色 → 403
            resp = client.get("/api/v1/users")
            assert resp.status_code == 403, f"operator 访问 admin 接口应返回 403，实际 {resp.status_code}: {resp.text}"
        finally:
            app.dependency_overrides.clear()


# ==================== 5. 登录入口 ====================


class TestLoginMultiRole:
    """后台/C端登录对多角色用户的行为."""

    def test_backend_login_allows_user_with_customer_identity(self, seeded_db: dict[str, Any]) -> None:
        """后台登录允许带 customer 身份的后台用户（主 user + 附加 customer）."""
        session = seeded_db["session"]
        _create_multi_role_user(
            session,
            user_id="user-cust-login",
            username="user-cust",
            main_role_code="user",
            additional_role_codes=["customer"],
        )

        app.dependency_overrides[db.get_db] = _make_db_override(session)
        try:
            client = TestClient(app)
            resp = client.post(
                "/api/v1/auth/token",
                data={"username": "user-cust", "password": _TEST_PASSWORD},
            )
            assert resp.status_code == 200, (
                f"带 customer 身份的后台用户登录应返回 200，实际 {resp.status_code}: {resp.text}"
            )
            data = resp.json()
            assert "access_token" in data, "响应应包含 access_token"
            assert "refresh_token" in data, "响应应包含 refresh_token"
        finally:
            app.dependency_overrides.clear()

    def test_backend_login_rejects_pure_customer(self, seeded_db: dict[str, Any]) -> None:
        """后台登录拒绝纯 customer 用户 → 403."""
        session = seeded_db["session"]
        # 自建纯 customer 用户（customer_user fixture 密码随机，无法用于登录）
        _create_multi_role_user(
            session,
            user_id="cust-pure-login",
            username="cust-pure",
            main_role_code="customer",
        )

        app.dependency_overrides[db.get_db] = _make_db_override(session)
        try:
            client = TestClient(app)
            resp = client.post(
                "/api/v1/auth/token",
                data={"username": "cust-pure", "password": _TEST_PASSWORD},
            )
            assert resp.status_code == 403, f"纯 customer 登录后台应返回 403，实际 {resp.status_code}: {resp.text}"
            assert "无权登录后台" in resp.json().get("message", "")
        finally:
            app.dependency_overrides.clear()

    def test_c_login_allows_backend_user_with_customer_identity(self, seeded_db: dict[str, Any]) -> None:
        """C 端登录允许带 customer 身份的后台用户（主 admin + 附加 customer）."""
        session = seeded_db["session"]
        _create_multi_role_user(
            session,
            user_id="admin-cust-clogin",
            username="admin-cust-cl",
            main_role_code="admin",
            additional_role_codes=["customer"],
        )

        app.dependency_overrides[db.get_db] = _make_db_override(session)
        try:
            client = TestClient(app)
            resp = client.post(
                "/api/v1/public/auth/token",
                data={"username": "admin-cust-cl", "password": _TEST_PASSWORD},
            )
            assert resp.status_code == 200, (
                f"带 customer 身份的后台用户登录 C 端应返回 200，实际 {resp.status_code}: {resp.text}"
            )
            data = resp.json()
            assert "access_token" in data, "响应应包含 access_token"
            assert "refresh_token" in data, "响应应包含 refresh_token"
        finally:
            app.dependency_overrides.clear()

    def test_c_login_allows_pure_backend_user_with_admin_token(self, seeded_db: dict[str, Any]) -> None:
        """C 端登录允许纯后台用户（admin 无 customer 附加角色），并签发后台令牌."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        app.dependency_overrides[db.get_db] = _make_db_override(session)
        try:
            client = TestClient(app)
            resp = client.post(
                "/api/v1/public/auth/token",
                data={"username": admin.username, "password": "Admin123!"},
            )
            assert resp.status_code == 200, f"纯后台用户登录 C 端应返回 200，实际 {resp.status_code}: {resp.text}"
            data = resp.json()
            assert "access_token" in data, "响应应包含 access_token"
            assert "refresh_token" in data, "响应应包含 refresh_token"
            # 纯内部用户（无 customer 身份）应签发后台令牌，供前端 /me 双通道识别内部身份
            payload = decode_token(data["access_token"])
            assert payload.get("aud") == AUDIENCE_ADMIN, f"纯后台用户应签发 admin 令牌，实际 aud={payload.get('aud')}"
        finally:
            app.dependency_overrides.clear()


# ==================== 6. UserResponse 序列化 ====================


class TestUserResponseSerialization:
    """UserResponse 中 additional_roles 字段序列化."""

    def test_user_response_includes_additional_roles(
        self, seeded_db: dict[str, Any], backend_client: TestClient
    ) -> None:
        """UserResponse 中 additional_roles 字段正确返回（详情 + 列表）."""
        session = seeded_db["session"]
        user = _create_multi_role_user(
            session,
            user_id="admin-cust-ser",
            username="admin-cust-ser",
            main_role_code="admin",
            additional_role_codes=["customer"],
        )

        # GET /api/v1/users/{id} → additional_roles 含 customer
        resp = backend_client.get(f"/api/v1/users/{user.id}")
        assert resp.status_code == 200, f"获取用户详情应返回 200，实际 {resp.status_code}: {resp.text}"
        detail = resp.json()
        assert detail["role_id"] == "admin-role"
        additional_codes = {r["code"] for r in detail.get("additional_roles", [])}
        assert "customer" in additional_codes, f"additional_roles 应含 customer，实际 {detail.get('additional_roles')}"

        # GET /api/v1/users → 列表项中 additional_roles 正确
        resp = backend_client.get("/api/v1/users")
        assert resp.status_code == 200, f"获取用户列表应返回 200，实际 {resp.status_code}: {resp.text}"
        items = resp.json().get("items", [])
        matched = [u for u in items if u["id"] == user.id]
        assert matched, "用户列表中应包含刚创建的多角色用户"
        list_additional_codes = {r["code"] for r in matched[0].get("additional_roles", [])}
        assert "customer" in list_additional_codes, (
            f"列表项 additional_roles 应含 customer，实际 {matched[0].get('additional_roles')}"
        )


# ==================== 7. refresh_token 透传 role_claim ====================


class TestRefreshTokenRoleClaim:
    """refresh_user_token 应继承原 Token 的 role_claim，避免多角色用户刷新后角色漂移."""

    def test_refresh_preserves_customer_role_claim_for_multi_role_user(self, seeded_db: dict[str, Any]) -> None:
        """admin+customer 用户用 customer 身份登录 C 端后，刷新 Token 仍保持 customer 角色.

        场景：
        1. admin 主角色 + customer 附加角色的多角色用户
        2. 通过 create_tokens_for_user 显式指定 role_claim="customer" + audience="c"
           （模拟 C 端登录入口签发的 Token）
        3. 使用 refresh_token 调用 refresh_user_token
        4. 新 access_token 中 role 字段应为 "customer"（而非主角色 "admin"）

        若不透传 role_claim，新 access_token 的 role 会回落到主角色 admin，
        多角色用户在 C 端的身份上下文会丢失。

        """
        session = seeded_db["session"]
        user = _create_multi_role_user(
            session,
            user_id="admin-cust-refresh",
            username="admin-cust-refresh",
            main_role_code="admin",
            additional_role_codes=["customer"],
        )

        # 模拟 C 端登录：显式指定 role_claim="customer"
        result = AuthService.create_tokens_for_user(
            session,
            user,
            audience=AUDIENCE_C,
            role_claim="customer",
        )
        assert result["require_password_change"] is False
        refresh_token = result["refresh_token"]

        # 验证签发的 access_token 确实携带 customer 角色
        original_access_token = result["access_token"]
        original_payload = decode_token(original_access_token)
        assert original_payload is not None, "access_token 应可解码"
        assert original_payload.get("role") == "customer", (
            f"签发的 access_token role 应为 customer，实际 {original_payload.get('role')}"
        )

        # 刷新 Token
        refreshed = AuthService.refresh_user_token(
            session,
            refresh_token,
            expected_audience=AUDIENCE_C,
        )

        # 验证新 access_token 的 role 仍为 customer（透传原 role_claim）
        new_payload = decode_token(refreshed["access_token"])
        assert new_payload is not None, "刷新后的 access_token 应可解码"
        assert new_payload.get("role") == "customer", (
            f"刷新后 access_token role 应保持 customer（透传原 role_claim），实际 {new_payload.get('role')}"
        )
        assert new_payload.get("aud") == AUDIENCE_C, f"刷新后 access_token aud 应为 c，实际 {new_payload.get('aud')}"


class TestMiniappWechatTokenIssuance:
    """小程序微信登录签发令牌的多角色行为.

    小程序 `/auth/wechat/login` 应：
    - 具备后台身份（含多角色 admin+customer、纯 admin）→ 签发后台令牌（aud=admin），
      使内部员工能访问后台内部接口（如带看记录 /projects/*）
    - 纯 customer（无后台身份）→ 签发 C 端令牌（aud=c）
    """

    def test_multirole_user_gets_admin_token(self, seeded_db: dict[str, Any]) -> None:
        """多角色账号（admin 主角色 + customer 附加角色）→ 签发 aud=admin、role=admin 的令牌."""
        session = seeded_db["session"]
        user = _create_multi_role_user(
            session,
            user_id="miniapp-multirole",
            username="miniapp-multirole",
            main_role_code="admin",
            additional_role_codes=["customer"],
        )
        result = _create_miniapp_tokens(session, user)
        payload = decode_token(result["access_token"])
        assert payload is not None, "access_token 应可解码"
        assert payload.get("aud") == AUDIENCE_ADMIN, f"多角色账号小程序登录 aud 应为 admin，实际 {payload.get('aud')}"
        assert payload.get("role") == "admin", f"多角色账号小程序登录 role 应为 admin，实际 {payload.get('role')}"

    def test_pure_customer_gets_c_token(self, seeded_db: dict[str, Any]) -> None:
        """纯 customer 账号 → 签发 aud=c 的令牌."""
        session = seeded_db["session"]
        user = _create_multi_role_user(
            session,
            user_id="miniapp-customer",
            username="miniapp-customer",
            main_role_code="customer",
        )
        result = _create_miniapp_tokens(session, user)
        payload = decode_token(result["access_token"])
        assert payload is not None, "access_token 应可解码"
        assert payload.get("aud") == AUDIENCE_C, f"纯 customer 小程序登录 aud 应为 c，实际 {payload.get('aud')}"
        assert payload.get("role") == "customer"

    def test_pure_admin_gets_admin_token(self, seeded_db: dict[str, Any]) -> None:
        """纯后台账号（无 customer 身份）→ 按主角色签发 aud=admin 的令牌."""
        session = seeded_db["session"]
        user = _create_multi_role_user(
            session,
            user_id="miniapp-admin",
            username="miniapp-admin",
            main_role_code="admin",
        )
        result = _create_miniapp_tokens(session, user)
        payload = decode_token(result["access_token"])
        assert payload is not None, "access_token 应可解码"
        assert payload.get("aud") == AUDIENCE_ADMIN, f"纯后台账号小程序登录 aud 应为 admin，实际 {payload.get('aud')}"
        assert payload.get("role") == "admin"
