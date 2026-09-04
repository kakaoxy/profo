"""微信小程序用户完善资料测试.

覆盖 spec `微信登录同步用户信息迭代方案` Task 5：
- UserService.update_wechat_profile：基本更新、username 冲突自动加后缀、
  保留 wechat 字段、与当前自身 username 相同时不触发冲突、
  独立更新头像、独立更新昵称
- PUT /api/public/users/wechat-profile：未登录 401、admin 角色访问 403、
  两者皆空 422
"""

from typing import Any

from sqlalchemy.orm import Session

from models import Role, User
from services.system.user import UserWechatService
from utils.auth import get_password_hash

_TEST_PASSWORD = "Test1234!"


def _make_wechat_temp_user(
    session: Session,
    *,
    user_id: str,
    username: str,
    nickname: str = "微信用户",
    avatar: str | None = None,
    wechat_openid: str | None = None,
    wechat_unionid: str | None = None,
    wechat_session_key: str | None = None,
    is_temporary: bool = True,
    role_code: str = "customer",
) -> User:
    """创建并持久化一个微信小程序登录产生的临时用户."""
    role = session.query(Role).filter(Role.code == role_code).first()
    user = User(
        id=user_id,
        username=username,
        password=get_password_hash(_TEST_PASSWORD),
        nickname=nickname,
        avatar=avatar,
        role_id=role.id,
        status="active",
        is_temporary=is_temporary,
        wechat_openid=wechat_openid,
        wechat_unionid=wechat_unionid,
        wechat_session_key=wechat_session_key,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


# ==================== Service 层 ====================


class TestUpdateWechatProfileService:
    """UserService.update_wechat_profile 业务逻辑."""

    def test_basic_update(self, seeded_db: dict[str, Any]) -> None:
        """新临时用户首次完善资料：username=nickname，nickname/avatar 更新成功."""
        session = seeded_db["session"]
        user = _make_wechat_temp_user(
            session,
            user_id="wx-temp-1",
            username="temp_wx_abc12345_def",
            wechat_openid="wx_openid_1",
            wechat_session_key="session_key_1",
        )

        svc = UserWechatService()
        updated = svc.update_wechat_profile(
            session,
            user,
            nickname="张三",
            avatar_url="/static/uploads/avatar1.jpg",
        )

        assert updated.nickname == "张三"
        assert updated.avatar == "/static/uploads/avatar1.jpg"
        assert updated.username == "张三"
        assert updated.wechat_openid == "wx_openid_1"
        assert updated.wechat_session_key == "session_key_1"
        assert updated.is_temporary is True

    def test_username_conflict_auto_suffix(self, seeded_db: dict[str, Any]) -> None:
        """已有同名 username 的另一用户时，自动追加 6 位 hex 后缀."""
        session = seeded_db["session"]
        # 占位用户先用 nickname="张三" 作为 username
        _make_wechat_temp_user(
            session,
            user_id="wx-other-1",
            username="张三",
            nickname="张三",
            is_temporary=False,
            wechat_openid="wx_openid_other_1",
        )
        # 待完善资料的临时用户
        target = _make_wechat_temp_user(
            session,
            user_id="wx-temp-2",
            username="temp_wx_def67890_abc",
            wechat_openid="wx_openid_2",
        )

        svc = UserWechatService()
        updated = svc.update_wechat_profile(
            session,
            target,
            nickname="张三",
            avatar_url="/static/uploads/avatar2.jpg",
        )

        assert updated.nickname == "张三"
        assert updated.username.startswith("张三_")
        # 后缀为 6 位 hex
        suffix = updated.username.split("张三_", 1)[1]
        assert len(suffix) == 6
        int(suffix, 16)  # 校验为合法 hex

    def test_keeps_wechat_fields(self, seeded_db: dict[str, Any]) -> None:
        """完善资料后 wechat_openid/wechat_unionid/is_temporary 保持不变."""
        session = seeded_db["session"]
        user = _make_wechat_temp_user(
            session,
            user_id="wx-temp-3",
            username="temp_wx_ghi11111_aaa",
            wechat_openid="wx_openid_3",
            wechat_unionid="wx_unionid_3",
            wechat_session_key="session_key_3",
            is_temporary=True,
        )

        svc = UserWechatService()
        updated = svc.update_wechat_profile(
            session,
            user,
            nickname="李四",
            avatar_url="/static/uploads/avatar3.jpg",
        )

        assert updated.wechat_openid == "wx_openid_3"
        assert updated.wechat_unionid == "wx_unionid_3"
        assert updated.wechat_session_key == "session_key_3"
        assert updated.is_temporary is True
        assert updated.status == "active"

    def test_same_username_no_conflict(self, seeded_db: dict[str, Any]) -> None:
        """传入与当前自身 username 相同的 nickname，不触发冲突逻辑，正常更新."""
        session = seeded_db["session"]
        # 用户的 username 已等于 nickname（如已完善过一次资料）
        user = _make_wechat_temp_user(
            session,
            user_id="wx-temp-4",
            username="王五",
            nickname="王五",
            avatar="/static/uploads/old.jpg",
            wechat_openid="wx_openid_4",
            is_temporary=False,
        )

        svc = UserWechatService()
        updated = svc.update_wechat_profile(
            session,
            user,
            nickname="王五",
            avatar_url="/static/uploads/new.jpg",
        )

        # username 不变（与自身相同）
        assert updated.username == "王五"
        assert updated.nickname == "王五"
        assert updated.avatar == "/static/uploads/new.jpg"

    def test_update_avatar_only(self, seeded_db: dict[str, Any]) -> None:
        """仅传 avatar_url：只更新 avatar，nickname/username 保持不变（独立头像授权）."""
        session = seeded_db["session"]
        user = _make_wechat_temp_user(
            session,
            user_id="wx-temp-5",
            username="temp_wx_jkl22222_bbb",
            nickname="微信用户",
            wechat_openid="wx_openid_5",
        )

        svc = UserWechatService()
        updated = svc.update_wechat_profile(
            session,
            user,
            avatar_url="/static/uploads/avatar5.jpg",
        )

        assert updated.avatar == "/static/uploads/avatar5.jpg"
        # nickname 和 username 不变
        assert updated.nickname == "微信用户"
        assert updated.username == "temp_wx_jkl22222_bbb"

    def test_update_nickname_only(self, seeded_db: dict[str, Any]) -> None:
        """仅传 nickname：派生 username 并更新 nickname，avatar 保持不变（独立昵称授权）."""
        session = seeded_db["session"]
        user = _make_wechat_temp_user(
            session,
            user_id="wx-temp-6",
            username="temp_wx_mno33333_ccc",
            nickname="微信用户",
            avatar="/static/uploads/existing_avatar.jpg",
            wechat_openid="wx_openid_6",
        )

        svc = UserWechatService()
        updated = svc.update_wechat_profile(
            session,
            user,
            nickname="赵六",
        )

        assert updated.nickname == "赵六"
        assert updated.username == "赵六"
        # avatar 不变
        assert updated.avatar == "/static/uploads/existing_avatar.jpg"

    def test_long_nickname_truncated_no_conflict(self, seeded_db: dict[str, Any]) -> None:
        """Nickname 为 100 字符上限且无 93 字符冲突时，截断到 93 字符，避免溢出.

        验证 String(100) 列不会因加后缀溢出导致 DataError 500。
        """
        session = seeded_db["session"]
        long_nickname = "张" * 100
        # 占位用户用完整 100 字符作为 username（与截断后的 93 字符不冲突）
        _make_wechat_temp_user(
            session,
            user_id="wx-other-long",
            username=long_nickname,
            nickname=long_nickname,
            is_temporary=False,
            wechat_openid="wx_openid_other_long",
        )
        target = _make_wechat_temp_user(
            session,
            user_id="wx-temp-long",
            username="temp_wx_long_pending",
            wechat_openid="wx_openid_temp_long",
        )

        svc = UserWechatService()
        updated = svc.update_wechat_profile(
            session,
            target,
            nickname=long_nickname,
        )

        # username 截断到 93 字符（base），未触发后缀
        assert len(updated.username) == 93
        assert updated.username == "张" * 93
        # nickname 保留完整 100 字符
        assert updated.nickname == long_nickname
        assert len(updated.nickname) == 100

    def test_long_nickname_truncated_with_suffix(self, seeded_db: dict[str, Any]) -> None:
        """Nickname 100 字符且 93 字符 base 冲突时，加 7 字符后缀，总长恰好 100."""
        session = seeded_db["session"]
        long_nickname = "张" * 100
        base_nickname = "张" * 93
        # 占位用户用 93 字符 base 作为 username，触发后缀路径
        _make_wechat_temp_user(
            session,
            user_id="wx-other-base",
            username=base_nickname,
            nickname=base_nickname,
            is_temporary=False,
            wechat_openid="wx_openid_other_base",
        )
        target = _make_wechat_temp_user(
            session,
            user_id="wx-temp-base",
            username="temp_wx_base_pending",
            wechat_openid="wx_openid_temp_base",
        )

        svc = UserWechatService()
        updated = svc.update_wechat_profile(
            session,
            target,
            nickname=long_nickname,
        )

        # username = 93 base + "_" + 6 hex = 100 字符
        assert len(updated.username) == 100
        assert updated.username.startswith("张" * 93 + "_")
        suffix = updated.username.split("张" * 93 + "_", 1)[1]
        assert len(suffix) == 6
        int(suffix, 16)
        assert updated.nickname == long_nickname


# ==================== 端点鉴权 ====================


class TestWechatProfileEndpoint:
    """PUT /api/public/users/wechat-profile 端点鉴权与参数校验."""

    def test_unauthorized_without_token(self, seeded_db: dict[str, Any]) -> None:
        """未登录访问返回 401."""
        from fastapi.testclient import TestClient

        from main import app

        client = TestClient(app)
        resp = client.put(
            "/api/v1/public/users/wechat-profile",
            json={"nickname": "张三", "avatar_url": "/static/uploads/a.jpg"},
        )
        assert resp.status_code == 401

    def test_admin_audience_forbidden(self, backend_client) -> None:
        """Admin 角色（aud=admin）访问 C 端端点应被拦截（401/403）."""
        resp = backend_client.put(
            "/api/v1/public/users/wechat-profile",
            json={"nickname": "张三", "avatar_url": "/static/uploads/a.jpg"},
        )
        # CurrentCustomerUserDep 期望 c_access_token（aud=c），admin token 不匹配 → 401
        assert resp.status_code in (401, 403)

    def test_both_fields_empty_rejected(self, c_end_client) -> None:
        """Nickname 与 avatar_url 均为空时，Schema 层 model_validator 拒绝（422）.

        用 c_end_client（C 端 customer 已登录）确保请求通过鉴权后到 Schema 校验阶段，
        否则 admin 令牌会被 CurrentCustomerUserDep 先 401 拦截，到不了 Schema 校验。
        """
        resp = c_end_client.put(
            "/api/v1/public/users/wechat-profile",
            json={"nickname": None, "avatar_url": None},
        )
        assert resp.status_code == 422
