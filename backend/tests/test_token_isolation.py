"""Token 隔离测试.

验证 C 端 Token (aud=c) 与后台 Token (aud=admin) 不可互换，
以及同时登录两套系统时 Cookie 读取正确。
"""

from collections.abc import Generator
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from utils.auth import create_access_token


def _override_db(session: Session) -> Generator[Session, None, None]:
    """生成 get_db 覆盖函数."""
    yield session


class TestTokenAudienceIsolation:
    """Token 受众隔离测试."""

    def test_c_token_cookie_rejected_by_backend(self, c_end_client: TestClient) -> None:
        """C 端 Token (cookie) 访问后台接口 → 401."""
        resp = c_end_client.get("/api/v1/auth/me")
        assert resp.status_code == 401, f"C 端 Token 访问后台接口应返回 401，实际 {resp.status_code}: {resp.text}"

    def test_backend_token_cookie_rejected_by_c_endpoint(self, backend_client: TestClient) -> None:
        """后台 Token (cookie) 访问 C 端接口 → 401."""
        resp = backend_client.get("/api/v1/public/auth/me")
        assert resp.status_code == 401, f"后台 Token 访问 C 端接口应返回 401，实际 {resp.status_code}: {resp.text}"

    def test_c_token_header_rejected_by_backend(self, c_end_client: TestClient, customer_audience_token: str) -> None:
        """C 端 Token (Authorization Header) 访问后台接口 → 401."""
        resp = c_end_client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {customer_audience_token}"},
        )
        assert resp.status_code == 401, f"C 端 Token (Header) 访问后台接口应返回 401，实际 {resp.status_code}"

    def test_backend_token_header_rejected_by_c_endpoint(
        self, backend_client: TestClient, admin_audience_token: str
    ) -> None:
        """后台 Token (Authorization Header) 访问 C 端接口 → 401."""
        resp = backend_client.get(
            "/api/v1/public/auth/me",
            headers={"Authorization": f"Bearer {admin_audience_token}"},
        )
        assert resp.status_code == 401, f"后台 Token (Header) 访问 C 端接口应返回 401，实际 {resp.status_code}"

    def test_admin_token_works_on_backend(self, backend_client: TestClient) -> None:
        """后台 Token 访问后台接口 → 200（正向验证）."""
        resp = backend_client.get("/api/v1/auth/me")
        assert resp.status_code == 200, f"后台 Token 访问后台接口应返回 200，实际 {resp.status_code}: {resp.text}"

    def test_c_token_works_on_c_endpoint(self, c_end_client: TestClient) -> None:
        """C 端 Token 访问 C 端接口 → 200（正向验证）."""
        resp = c_end_client.get("/api/v1/public/auth/me")
        assert resp.status_code == 200, f"C 端 Token 访问 C 端接口应返回 200，实际 {resp.status_code}: {resp.text}"


class TestDualLoginCookieIsolation:
    """同时登录两套系统时 Cookie 隔离测试."""

    def test_dual_login_backend_reads_access_token(self, dual_login_client: TestClient) -> None:
        """同时登录时，后台接口读取 access_token（aud=admin）→ 200."""
        resp = dual_login_client.get("/api/v1/auth/me")
        assert resp.status_code == 200, f"同时登录时后台接口应返回 200，实际 {resp.status_code}: {resp.text}"

    def test_dual_login_c_end_reads_c_access_token(self, dual_login_client: TestClient) -> None:
        """同时登录时，C 端接口读取 c_access_token（aud=c）→ 200."""
        resp = dual_login_client.get("/api/v1/public/auth/me")
        assert resp.status_code == 200, f"同时登录时 C 端接口应返回 200，实际 {resp.status_code}: {resp.text}"

    def test_dual_login_no_cross_contamination(self, dual_login_client: TestClient) -> None:
        """同时登录时两套系统各自正常工作，返回各自用户."""
        resp_backend = dual_login_client.get("/api/v1/auth/me")
        resp_c = dual_login_client.get("/api/v1/public/auth/me")
        assert resp_backend.status_code == 200
        assert resp_c.status_code == 200

        backend_user = resp_backend.json()
        c_user = resp_c.json()
        assert backend_user["username"] != c_user["username"], "同时登录时两套系统应返回各自用户，不应交叉"


class TestTokenWithoutAudience:
    """无受众 Token 测试：validate_token 传入 audience 时，Token 缺少 aud 即视为不匹配."""

    def test_no_audience_token_rejected_by_backend(self, seeded_db: dict[str, Any]) -> None:
        """无 aud 声明的 Token 访问后台接口（期望 aud=admin）→ 401."""
        from main import app

        admin = seeded_db["users"]["admin"]
        token = create_access_token(data={"sub": admin.id, "role": "admin", "ver": admin.token_version})
        session = seeded_db["session"]
        app.dependency_overrides[db.get_db] = lambda: _override_db(session)
        try:
            client = TestClient(app, cookies={"access_token": token})
            resp = client.get("/api/v1/auth/me")
            assert resp.status_code == 401, f"无 aud Token 访问后台接口应返回 401，实际 {resp.status_code}"
        finally:
            app.dependency_overrides.clear()
