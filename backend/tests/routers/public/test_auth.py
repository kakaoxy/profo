"""C端 logout 端点鉴权测试.

验证 POST /public/auth/logout 使用 CurrentCustomerUserDep 依赖注入：
- C端 customer 用户可成功调用（200）
- 非 customer 角色用户持 C端 token 调用被拒绝（403）
"""

from collections.abc import Generator
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from main import app
from models import User
from services.system.auth import AuthService
from utils.auth import AUDIENCE_C, create_access_token


class TestPublicLogoutAuth:
    """POST /public/auth/logout 依赖注入鉴权测试."""

    def test_customer_user_can_logout(
        self,
        seeded_db: dict[str, Any],
        c_end_client: TestClient,
        customer_user: User,
    ) -> None:
        """C端 customer 用户调 logout → 200."""
        session = seeded_db["session"]
        tokens = AuthService.create_tokens_for_user(session, customer_user, audience=AUDIENCE_C)
        resp = c_end_client.post(
            "/api/v1/public/auth/logout",
            json={"refresh_token": tokens["refresh_token"]},
        )
        assert resp.status_code == 200, f"customer 用户调 logout 应返回 200，实际 {resp.status_code}: {resp.text}"

    def test_non_customer_user_rejected(self, seeded_db: dict[str, Any]) -> None:
        """非 customer 角色（admin）持 C端 token 调 logout → 403."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        # admin 无 customer 角色，为其签发 C 端受众 token
        token = create_access_token(
            data={"sub": admin.id, "role": "admin", "ver": admin.token_version},
            audience=AUDIENCE_C,
        )

        def _override_get_db() -> Generator[Session, None, None]:
            yield session

        app.dependency_overrides[db.get_db] = _override_get_db
        client = TestClient(app, cookies={"c_access_token": token})
        client.headers["X-Requested-With"] = "XMLHttpRequest"
        try:
            resp = client.post(
                "/api/v1/public/auth/logout",
                json={"refresh_token": "any"},
            )
            assert resp.status_code == 403, (
                f"非 customer 用户调 logout 应返回 403，实际 {resp.status_code}: {resp.text}"
            )
        finally:
            app.dependency_overrides.clear()
