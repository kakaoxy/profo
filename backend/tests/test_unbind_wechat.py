"""微信解绑服务层与端点测试.

覆盖 spec `add-admin-user-wechat-unbind` Task 4：
- UserService.unbind_wechat：直接绑定解绑、间接绑定解绑、未绑定抛错、
  并发串行化、token_version 递增、RefreshToken 撤销
- POST /api/v1/users/{user_id}/unbind-wechat：成功解绑、无权限 403、
  未绑定 409+40904、用户不存在 404
- UserService._attach_wechat_bound：直接绑定、间接绑定、未绑定、批量计算
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models import RefreshToken, Role, User
from services.system.auth import AuthService
from services.system.exceptions import ResourceNotFoundError, WeChatNotBoundError
from services.system.user import UserService, UserWechatService
from utils.auth import get_password_hash

_TEST_PASSWORD = "Test1234!"


def _make_user(
    session: Session,
    *,
    user_id: str,
    username: str,
    nickname: str = "测试用户",
    role_code: str = "customer",
    is_temporary: bool = False,
    wechat_openid: str | None = None,
    wechat_unionid: str | None = None,
    wechat_session_key: str | None = None,
    merged_to_user_id: str | None = None,
    status: str = "active",
) -> User:
    """创建并持久化一个用户（直接走 ORM，专用于测试）."""
    role = session.query(Role).filter(Role.code == role_code).first()
    user = User(
        id=user_id,
        username=username,
        password=get_password_hash(_TEST_PASSWORD),
        nickname=nickname,
        role_id=role.id,
        status=status,
        is_temporary=is_temporary,
        wechat_openid=wechat_openid,
        wechat_unionid=wechat_unionid,
        wechat_session_key=wechat_session_key,
        merged_to_user_id=merged_to_user_id,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _count_unrevoked_refresh_tokens(session: Session, user_id: str) -> int:
    """统计指定用户未撤销的 refresh_token 数量."""
    return (
        session.query(RefreshToken)
        .filter(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked.is_(False),
        )
        .count()
    )


# ==================== _attach_wechat_bound ====================


class TestAttachWechatBound:
    """UserService._attach_wechat_bound 批量计算 wechat_bound."""

    def test_direct_binding(self, seeded_db: dict[str, Any]) -> None:
        """用户 wechat_openid IS NOT NULL → wechat_bound=True."""
        session = seeded_db["session"]
        user = _make_user(
            session,
            user_id="direct-bound-1",
            username="direct-bound-1",
            wechat_openid="wx_openid_direct_1",
        )
        svc = UserService()
        svc._attach_wechat_bound(session, [user])
        assert user.wechat_bound is True

    def test_indirect_binding(self, seeded_db: dict[str, Any]) -> None:
        """经合并临时账号的间接绑定 → wechat_bound=True."""
        session = seeded_db["session"]
        target = _make_user(
            session,
            user_id="indirect-target-1",
            username="indirect-target-1",
            role_code="user",
            wechat_openid=None,
        )
        _make_user(
            session,
            user_id="indirect-temp-1",
            username="indirect-temp-1",
            is_temporary=False,
            wechat_openid="wx_openid_indirect_1",
            merged_to_user_id=target.id,
            status="merged",
        )
        svc = UserService()
        svc._attach_wechat_bound(session, [target])
        assert target.wechat_bound is True

    def test_not_bound(self, seeded_db: dict[str, Any]) -> None:
        """用户无直接绑定且无间接绑定 → wechat_bound=False."""
        session = seeded_db["session"]
        user = _make_user(
            session,
            user_id="not-bound-1",
            username="not-bound-1",
            wechat_openid=None,
        )
        svc = UserService()
        svc._attach_wechat_bound(session, [user])
        assert user.wechat_bound is False

    def test_batch_no_n_plus_1(self, seeded_db: dict[str, Any]) -> None:
        """批量计算 3 个用户（直接/间接/未绑定）仅产生 1 条附加查询."""
        session = seeded_db["session"]
        user_a = _make_user(
            session,
            user_id="batch-a",
            username="batch-a",
            wechat_openid="wx_batch_a",
        )
        target_b = _make_user(
            session,
            user_id="batch-b",
            username="batch-b",
            role_code="user",
            wechat_openid=None,
        )
        _make_user(
            session,
            user_id="batch-temp-b",
            username="batch-temp-b",
            wechat_openid="wx_batch_b",
            merged_to_user_id=target_b.id,
            status="merged",
        )
        user_c = _make_user(
            session,
            user_id="batch-c",
            username="batch-c",
            wechat_openid=None,
        )

        svc = UserService()
        svc._attach_wechat_bound(session, [user_a, target_b, user_c])

        assert user_a.wechat_bound is True
        assert target_b.wechat_bound is True
        assert user_c.wechat_bound is False


# ==================== unbind_wechat ====================


class TestUnbindWechatDirectBinding:
    """unbind_wechat 解绑直接绑定."""

    def test_clears_wechat_fields_and_revokes_tokens(self, seeded_db: dict[str, Any]) -> None:
        """解绑直接绑定：清空 wechat_*、token_version 递增、RefreshToken 撤销."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        user = _make_user(
            session,
            user_id="unbind-direct-1",
            username="unbind-direct-1",
            wechat_openid="wx_unbind_direct_1",
            wechat_unionid="unionid_direct_1",
            wechat_session_key="session_key_direct_1",
        )
        original_ver = user.token_version

        # 签发 refresh_token
        AuthService.create_tokens_for_user(session, user, audience="admin")
        assert _count_unrevoked_refresh_tokens(session, user.id) == 1

        svc = UserWechatService()
        result = svc.unbind_wechat(session, user.id, operator_id=admin.id)

        assert result == {"message": "微信账号已解绑"}

        # 刷新并验证字段清空
        session.refresh(user)
        assert user.wechat_openid is None
        assert user.wechat_unionid is None
        assert user.wechat_session_key is None
        # token_version 递增
        assert user.token_version == original_ver + 1
        # RefreshToken 撤销
        assert _count_unrevoked_refresh_tokens(session, user.id) == 0


class TestUnbindWechatIndirectBinding:
    """unbind_wechat 解绑经合并临时账号的间接绑定."""

    def test_clears_temp_carrier_wechat_and_invalidates_target_tokens(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """解绑间接绑定：清空 temp_carrier 的 wechat_*，target 的 token_version 递增."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]

        target = _make_user(
            session,
            user_id="unbind-target-1",
            username="unbind-target-1",
            role_code="user",
            wechat_openid=None,
        )
        temp = _make_user(
            session,
            user_id="unbind-temp-1",
            username="unbind-temp-1",
            is_temporary=False,
            wechat_openid="wx_unbind_indirect_1",
            wechat_unionid="unionid_indirect_1",
            wechat_session_key="session_key_indirect_1",
            merged_to_user_id=target.id,
            status="merged",
        )
        original_target_ver = target.token_version

        # 为 target 签发 refresh_token
        AuthService.create_tokens_for_user(session, target, audience="admin")
        assert _count_unrevoked_refresh_tokens(session, target.id) == 1

        svc = UserWechatService()
        result = svc.unbind_wechat(session, target.id, operator_id=admin.id)

        assert result == {"message": "微信账号已解绑"}

        # temp_carrier 的 wechat 字段清空
        session.refresh(temp)
        assert temp.wechat_openid is None
        assert temp.wechat_unionid is None
        assert temp.wechat_session_key is None
        # temp_carrier 的 merged_to_user_id 与 status 不变
        assert temp.merged_to_user_id == target.id
        assert temp.status == "merged"

        # target 的 wechat_openid 保持 None（不改动）
        session.refresh(target)
        assert target.wechat_openid is None
        # target 的 token_version 递增
        assert target.token_version == original_target_ver + 1
        # target 的 RefreshToken 撤销
        assert _count_unrevoked_refresh_tokens(session, target.id) == 0


class TestUnbindWechatNotBound:
    """unbind_wechat 对未绑定账号抛 WeChatNotBoundError."""

    def test_raises_when_not_bound(self, seeded_db: dict[str, Any]) -> None:
        """未绑定微信的账号 → WeChatNotBoundError，不发生写操作."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        user = _make_user(
            session,
            user_id="not-bound-unbind-1",
            username="not-bound-unbind-1",
            wechat_openid=None,
        )
        original_ver = user.token_version

        svc = UserWechatService()
        with pytest.raises(WeChatNotBoundError):
            svc.unbind_wechat(session, user.id, operator_id=admin.id)

        # token_version 不变
        session.refresh(user)
        assert user.token_version == original_ver


class TestUnbindWechatUserNotFound:
    """unbind_wechat 对不存在用户抛 ResourceNotFoundError."""

    def test_raises_when_user_not_found(self, seeded_db: dict[str, Any]) -> None:
        """不存在的 user_id → ResourceNotFoundError."""
        session = seeded_db["session"]
        svc = UserWechatService()
        with pytest.raises(ResourceNotFoundError):
            svc.unbind_wechat(session, "nonexistent-user-id")


class TestUnbindWechatConcurrent:
    """unbind_wechat 并发串行化：第二次调用抛 WeChatNotBoundError."""

    def test_second_unbind_raises_not_bound(self, seeded_db: dict[str, Any]) -> None:
        """同一用户连续解绑：第一次成功，第二次抛 WeChatNotBoundError."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        user = _make_user(
            session,
            user_id="concurrent-unbind-1",
            username="concurrent-unbind-1",
            wechat_openid="wx_concurrent_1",
        )

        svc = UserWechatService()
        # 第一次解绑成功
        result1 = svc.unbind_wechat(session, user.id, operator_id=admin.id)
        assert result1 == {"message": "微信账号已解绑"}

        # 第二次解绑抛 WeChatNotBoundError（wechat_openid 已清空，无 temp_carrier）
        with pytest.raises(WeChatNotBoundError):
            svc.unbind_wechat(session, user.id, operator_id=admin.id)


# ==================== 端点测试 ====================


class TestUnbindWechatEndpoint:
    """POST /api/v1/users/{user_id}/unbind-wechat 端点测试."""

    def test_unbind_success(self, seeded_db: dict[str, Any], backend_client: TestClient) -> None:
        """管理员成功解绑已绑定微信用户 → 200 + {"message": "微信账号已解绑"}."""
        session = seeded_db["session"]
        user = _make_user(
            session,
            user_id="endpoint-direct-1",
            username="endpoint-direct-1",
            wechat_openid="wx_endpoint_direct_1",
        )

        resp = backend_client.post(f"/api/v1/users/{user.id}/unbind-wechat")

        assert resp.status_code == 200
        assert resp.json() == {"message": "微信账号已解绑"}

        # 验证字段清空
        session.refresh(user)
        assert user.wechat_openid is None

    def test_unbind_not_bound_returns_409(self, seeded_db: dict[str, Any], backend_client: TestClient) -> None:
        """解绑未绑定微信用户 → 409 + {"code": 40904, "message": "WECHAT_NOT_BOUND"}."""
        session = seeded_db["session"]
        user = _make_user(
            session,
            user_id="endpoint-not-bound-1",
            username="endpoint-not-bound-1",
            wechat_openid=None,
        )

        resp = backend_client.post(f"/api/v1/users/{user.id}/unbind-wechat")

        assert resp.status_code == 409
        body = resp.json()
        assert body["code"] == 40904
        assert body["message"] == "WECHAT_NOT_BOUND"

    def test_unbind_user_not_found_returns_404(self, seeded_db: dict[str, Any], backend_client: TestClient) -> None:
        """解绑不存在的用户 → 404."""
        resp = backend_client.post("/api/v1/users/nonexistent-user-id/unbind-wechat")

        assert resp.status_code == 404

    def test_unbind_no_permission_returns_403(
        self,
        seeded_db: dict[str, Any],
        normal_user_client: TestClient,
    ) -> None:
        """无 user:unbind_wechat 权限的普通用户 → 403."""
        session = seeded_db["session"]
        user = _make_user(
            session,
            user_id="endpoint-no-perm-1",
            username="endpoint-no-perm-1",
            wechat_openid="wx_endpoint_no_perm_1",
        )

        resp = normal_user_client.post(f"/api/v1/users/{user.id}/unbind-wechat")

        assert resp.status_code == 403
