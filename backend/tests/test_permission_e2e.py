"""权限系统端到端集成测试.

验证完整流程：登录 → 权限校验 → 角色权限变更 → 缓存失效 → 重新校验.

测试在 HTTP 层（TestClient）执行，覆盖：
1. 完整权限流转：登录 → 接口校验 → 角色权限变更 → 旧 token 失效 → 重新登录 → 重新校验
2. 角色权限变更后用户权限缓存失效（通过 /auth/me 的 permissions 字段验证）
3. 多角色用户权限并集（主角色 + 附加角色）

注意：
- 权限校验直接查数据库（项目未集成 Redis 缓存）
- 使用 seeded_db fixture 提供隔离的数据库会话与种子数据
- 每个测试用例独立（db_session 事务回滚隔离）
"""

from collections.abc import Generator
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from main import app
from utils.auth import AUDIENCE_ADMIN, create_access_token

# 测试用账号密码（与 conftest.py 的种子数据一致）
_ADMIN_PASSWORD = "Admin123!"
_NORMAL_USER_PASSWORD = "Test123!"


def _make_db_override(session: Session) -> type[Generator[Session, None, None]]:
    """创建 get_db 覆盖函数（FastAPI 需要生成器函数而非返回生成器的普通函数）."""

    def _override() -> Generator[Session, None, None]:
        yield session

    return _override


def _make_client(token: str) -> TestClient:
    """创建带 access_token cookie 与 CSRF 防护头的 TestClient.

    X-Requested-With 头满足 CSRF 中间件对纯 Cookie 认证的非安全方法请求的要求。
    """
    client = TestClient(app, cookies={"access_token": token})
    client.headers["X-Requested-With"] = "XMLHttpRequest"
    return client


def _login(client: TestClient, username: str, password: str) -> str:
    """通过 /api/v1/auth/login 登录并返回 access_token."""
    resp = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password},
    )
    assert resp.status_code == 200, f"登录失败: {resp.status_code} {resp.text}"
    return resp.json()["access_token"]


class TestPermissionE2E:
    """权限系统端到端测试."""

    def test_permission_flow_login_check_invalidate_recheck(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """完整流程：登录→权限校验→权限变更→缓存失效→重新校验.

        场景：
        1. normal_user (user-role) 带 token 访问 GET /api/v1/properties → 200（拥有 property:read）
        2. admin 调用 PUT /api/v1/roles/user-role 移除 property:read 权限
           （admin 修改非自身角色，避免自提权防护触发）
        3. normal_user 旧 token 访问 GET /api/v1/properties → 401（token_version 递增）
        4. normal_user 重新登录获取新 token（携带新 token_version）
        5. 新 token 访问 GET /api/v1/properties → 403（无 property:read 权限）
        """
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        normal = seeded_db["users"]["normal"]

        # 1. 签发 normal_user token（模拟登录，携带当前 token_version）
        normal_token = create_access_token(
            data={"sub": normal.id, "role": "user", "ver": normal.token_version},
            audience=AUDIENCE_ADMIN,
        )
        admin_token = create_access_token(
            data={"sub": admin.id, "role": "admin", "ver": admin.token_version},
            audience=AUDIENCE_ADMIN,
        )

        app.dependency_overrides[db.get_db] = _make_db_override(session)
        try:
            normal_client = _make_client(normal_token)
            admin_client = _make_client(admin_token)

            # 2. normal_user 访问 GET /api/v1/properties → 200（user-role 有 property:read）
            resp = normal_client.get("/api/v1/properties")
            assert resp.status_code == 200, f"初始访问 GET /properties 应返回 200，实际 {resp.status_code}: {resp.text}"

            # 3. admin 调 PUT /api/v1/roles/user-role 移除 property:read 权限（保留其他权限）
            # user-role 初始权限：property:read, lead:read, ledger:read, investment:read, l4_marketing:read
            new_codes = ["lead:read", "ledger:read", "investment:read", "l4_marketing:read"]
            assert "property:read" not in new_codes, "移除后 new_codes 不应包含 property:read"

            resp = admin_client.put(
                "/api/v1/roles/user-role",
                json={"permission_codes": new_codes},
            )
            assert resp.status_code == 200, f"更新角色权限应返回 200，实际 {resp.status_code}: {resp.text}"

            # 4. normal_user 旧 token 访问 GET /api/v1/properties → 401（token_version 不匹配）
            resp = normal_client.get("/api/v1/properties")
            assert resp.status_code == 401, f"角色权限变更后旧 token 应返回 401，实际 {resp.status_code}: {resp.text}"

            # 5. 重新登录获取新 token（携带新 token_version）
            login_client = TestClient(app)
            login_client.headers["X-Requested-With"] = "XMLHttpRequest"
            new_token = _login(login_client, normal.username, _NORMAL_USER_PASSWORD)

            # 6. 新 token 访问 GET /api/v1/properties → 403（无 property:read 权限）
            new_client = _make_client(new_token)
            resp = new_client.get("/api/v1/properties")
            assert resp.status_code == 403, (
                f"新 token 应返回 403（无 property:read 权限），实际 {resp.status_code}: {resp.text}"
            )
        finally:
            app.dependency_overrides.clear()

    def test_role_permission_change_invalidates_cached_perms(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """角色权限变更后用户权限缓存失效.

        场景：
        1. normal_user (user-role) 初始 GET /api/v1/auth/me → permissions 包含 property:read 等
        2. admin PUT /api/v1/roles/user-role 清空所有权限（admin 修改非自身角色）
        3. normal_user 旧 token GET /api/v1/auth/me → 401（token_version 递增）
        4. normal_user 重新登录获取新 token
        5. 新 token GET /api/v1/auth/me → permissions 为空（缓存失效，从 DB 重新计算）

        验证：token_version 递增不仅使旧 token 失效，还使新 token 反映最新的权限集
        （证明权限缓存按 token_version 隔离，不会读到陈旧数据）。
        """
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        normal = seeded_db["users"]["normal"]

        normal_token = create_access_token(
            data={"sub": normal.id, "role": "user", "ver": normal.token_version},
            audience=AUDIENCE_ADMIN,
        )
        admin_token = create_access_token(
            data={"sub": admin.id, "role": "admin", "ver": admin.token_version},
            audience=AUDIENCE_ADMIN,
        )

        app.dependency_overrides[db.get_db] = _make_db_override(session)
        try:
            normal_client = _make_client(normal_token)
            admin_client = _make_client(admin_token)

            # 1. 初始 GET /auth/me → permissions 包含 property:read
            resp = normal_client.get("/api/v1/auth/me")
            assert resp.status_code == 200, f"初始 /auth/me 应返回 200: {resp.text}"
            initial_perms = set(resp.json().get("permissions", []))
            assert "property:read" in initial_perms, (
                f"user-role 初始应拥有 property:read 权限，实际 permissions={initial_perms}"
            )
            assert len(initial_perms) > 1, f"user-role 初始应拥有多个权限，实际 {len(initial_perms)} 个"

            # 2. admin PUT /api/v1/roles/user-role 清空所有权限
            resp = admin_client.put(
                "/api/v1/roles/user-role",
                json={"permission_codes": []},
            )
            assert resp.status_code == 200, f"清空角色权限应返回 200，实际 {resp.status_code}: {resp.text}"

            # 3. normal_user 旧 token GET /auth/me → 401（token_version 不匹配）
            resp = normal_client.get("/api/v1/auth/me")
            assert resp.status_code == 401, f"清空权限后旧 token 应返回 401，实际 {resp.status_code}: {resp.text}"

            # 4. normal_user 重新登录获取新 token
            login_client = TestClient(app)
            login_client.headers["X-Requested-With"] = "XMLHttpRequest"
            new_token = _login(login_client, normal.username, _NORMAL_USER_PASSWORD)

            # 5. 新 token GET /auth/me → permissions 为空（缓存按 token_version 隔离）
            new_client = _make_client(new_token)
            resp = new_client.get("/api/v1/auth/me")
            assert resp.status_code == 200, f"新 token /auth/me 应返回 200，实际 {resp.status_code}: {resp.text}"
            new_perms = set(resp.json().get("permissions", []))
            assert new_perms == set(), f"清空 user-role 权限后 new_perms 应为空，实际 {new_perms}"
        finally:
            app.dependency_overrides.clear()

    def test_additional_role_permission_union(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """多角色用户权限并集测试.

        场景：
        1. normal_user (user-role) 初始 GET /auth/me → permissions 含 property:read，
           不含 valuation:write（后者仅属于 customer-role）
        2. admin 通过 PUT /api/v1/users/{normal.id} 添加 customer-role 为附加角色
        3. normal_user 旧 token GET /auth/me → 401（additional_role_ids 变更递增 token_version）
        4. normal_user 重新登录获取新 token
        5. 新 token GET /auth/me → permissions 含 property:read（user-role）∪ valuation:write
           （customer-role）的并集

        说明：附加角色限制为 customer（见 UserService._build_additional_user_roles），
        故用 customer-role 作为附加角色验证并集逻辑。
        """
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        normal = seeded_db["users"]["normal"]

        normal_token = create_access_token(
            data={"sub": normal.id, "role": "user", "ver": normal.token_version},
            audience=AUDIENCE_ADMIN,
        )
        admin_token = create_access_token(
            data={"sub": admin.id, "role": "admin", "ver": admin.token_version},
            audience=AUDIENCE_ADMIN,
        )

        app.dependency_overrides[db.get_db] = _make_db_override(session)
        try:
            normal_client = _make_client(normal_token)
            admin_client = _make_client(admin_token)

            # 1. 初始 GET /auth/me → permissions 含 property:read，不含 valuation:write
            resp = normal_client.get("/api/v1/auth/me")
            assert resp.status_code == 200, f"初始 /auth/me 应返回 200: {resp.text}"
            initial_perms = set(resp.json().get("permissions", []))
            assert "property:read" in initial_perms, f"user-role 应拥有 property:read，实际 {initial_perms}"
            assert "valuation:write" not in initial_perms, f"user-role 不应拥有 valuation:write，实际 {initial_perms}"

            # 2. admin 通过 PUT /api/v1/users/{normal.id} 添加 customer-role 为附加角色
            resp = admin_client.put(
                f"/api/v1/users/{normal.id}",
                json={"additional_role_ids": ["customer-role"]},
            )
            assert resp.status_code == 200, f"添加附加角色应返回 200，实际 {resp.status_code}: {resp.text}"

            # 3. normal_user 旧 token GET /auth/me → 401（token_version 递增）
            resp = normal_client.get("/api/v1/auth/me")
            assert resp.status_code == 401, f"附加角色变更后旧 token 应返回 401，实际 {resp.status_code}: {resp.text}"

            # 4. normal_user 重新登录获取新 token
            login_client = TestClient(app)
            login_client.headers["X-Requested-With"] = "XMLHttpRequest"
            new_normal_token = _login(login_client, normal.username, _NORMAL_USER_PASSWORD)

            # 5. 新 token GET /auth/me → permissions 为 user-role ∪ customer-role 的并集
            new_normal_client = _make_client(new_normal_token)
            resp = new_normal_client.get("/api/v1/auth/me")
            assert resp.status_code == 200, f"新 token /auth/me 应返回 200，实际 {resp.status_code}: {resp.text}"
            union_perms = set(resp.json().get("permissions", []))
            assert "property:read" in union_perms, f"并集应包含 property:read（来自 user-role），实际 {union_perms}"
            assert "valuation:write" in union_perms, (
                f"并集应包含 valuation:write（来自 customer-role），实际 {union_perms}"
            )
            assert "lead:submit" in union_perms, f"并集应包含 lead:submit（来自 customer-role），实际 {union_perms}"
        finally:
            app.dependency_overrides.clear()
