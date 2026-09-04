"""账号合并与手机号绑定服务层测试.

覆盖 spec `enhance-miniapp-wechat-login-merge` Task 2：
- UserService.merge_accounts：业务数据迁移、wechat 字段保留、临时账号置 merged
- UserService.set_initial_phone：主账号占用（40901）、临时账号占用、绑定转正
- TargetHasWechatError：目标账号已绑其他微信（40902）
- 回归：合并后目标账号仍可走密码登录（authenticate_user 不被 wechat_openid 拦截）
- 回归：微信登录命中已合并临时账号时重定向到目标主账号
"""

from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from models import Lead, PropertyCurrent, Role, User
from models.common import LeadStatus, PropertyStatus
from services.system.auth import AuthService
from services.system.exceptions import (
    BusinessLogicError,
    PhoneTakenByMainAccountError,
    TargetHasWechatError,
)
from services.system.user import UserProfileService, UserWechatService
from services.system.wechat import WeChatAuthService
from utils.auth import get_password_hash
from utils.crypto import hash_phone

_TEST_PASSWORD = "Test1234!"
_TEST_SCHEMA_PASSWORD = "pass123"


def _make_user(
    session: Session,
    *,
    user_id: str,
    username: str,
    nickname: str = "测试用户",
    role_code: str = "customer",
    is_temporary: bool = False,
    wechat_openid: str | None = None,
    phone: str | None = None,
) -> User:
    """创建并持久化一个用户（直接走 ORM，专用于测试）."""
    role = session.query(Role).filter(Role.code == role_code).first()
    user = User(
        id=user_id,
        username=username,
        password=get_password_hash(_TEST_PASSWORD),
        nickname=nickname,
        role_id=role.id,
        status="active",
        is_temporary=is_temporary,
        wechat_openid=wechat_openid,
        phone=phone,
        phone_hash=hash_phone(phone) if phone else None,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _make_lead(session: Session, *, creator_id: str | None = None, suffix: str = "") -> Lead:
    """创建并持久化一条线索."""
    lead = Lead(
        id=str(uuid4()),
        community_name=f"测试小区{suffix}",
        status=LeadStatus.PENDING_ASSESSMENT,
        creator_id=creator_id,
    )
    session.add(lead)
    return lead


def _make_property(session: Session, *, owner_id: str | None = None, suffix: str = "") -> PropertyCurrent:
    """创建并持久化一条房源（owner_id 为推送用户ID）."""
    prop = PropertyCurrent(
        data_source="test",
        source_property_id=f"src-{uuid4()}-{suffix}",
        community_id=str(uuid4()),
        status=PropertyStatus.FOR_SALE,
        rooms=2,
        orientation="南",
        floor_original="中楼层",
        build_area=80.0,
        owner_id=owner_id,
    )
    session.add(prop)
    return prop


# ==================== merge_accounts ====================


class TestMergeAccountsSuccess:
    """merge_accounts 合并成功."""

    def test_migrates_leads_and_property_to_target(self, seeded_db: dict[str, Any]) -> None:
        """临时账号的 leads 与 property_current 应迁移到目标账号."""
        session = seeded_db["session"]

        temp_user = _make_user(
            session,
            user_id="temp-merge-1",
            username="temp-merge-1",
            nickname="临时用户1",
            is_temporary=True,
            wechat_openid="wx_openid_temp_1",
        )
        target_user = _make_user(
            session,
            user_id="target-merge-1",
            username="target-merge-1",
            nickname="目标用户1",
            is_temporary=False,
        )

        # 临时账号创建业务数据
        _make_lead(session, creator_id=temp_user.id, suffix="-a")
        _make_lead(session, creator_id=temp_user.id, suffix="-b")
        _make_property(session, owner_id=temp_user.id, suffix="-a")
        session.commit()

        UserWechatService.merge_accounts(session, temp_user, target_user)

        # 验证 leads 已迁移到目标账号
        temp_leads = session.query(Lead).filter(Lead.creator_id == temp_user.id).count()
        target_leads = session.query(Lead).filter(Lead.creator_id == target_user.id).count()
        assert temp_leads == 0, f"临时账号应无 leads，实际 {temp_leads}"
        assert target_leads == 2, f"目标账号应有 2 条 leads，实际 {target_leads}"

        # 验证 property_current 已迁移
        temp_props = session.query(PropertyCurrent).filter(PropertyCurrent.owner_id == temp_user.id).count()
        target_props = session.query(PropertyCurrent).filter(PropertyCurrent.owner_id == target_user.id).count()
        assert temp_props == 0, f"临时账号应无 property_current，实际 {temp_props}"
        assert target_props == 1, f"目标账号应有 1 条 property_current，实际 {target_props}"

    def test_keeps_wechat_fields_on_temp_and_marks_merged(self, seeded_db: dict[str, Any]) -> None:
        """Wechat 字段保留在临时账号上（不转移至目标），临时账号置 merged.

        wechat_openid 不转移至目标账号——authenticate_user 对 wechat_openid is not None
        的用户拒绝密码登录，转移会导致内部员工合并后无法走密码登录后台。
        微信登录通过 login_or_register_wechat_user 的 merged 重定向解析到目标账号。
        """
        session = seeded_db["session"]

        temp_user = _make_user(
            session,
            user_id="temp-merge-2",
            username="temp-merge-2",
            nickname="临时用户2",
            is_temporary=True,
            wechat_openid="wx_openid_temp_2",
        )
        target_user = _make_user(
            session,
            user_id="target-merge-2",
            username="target-merge-2",
            nickname="目标用户2",
            is_temporary=False,
        )
        session.commit()

        UserWechatService.merge_accounts(session, temp_user, target_user)

        # 刷新两个用户对象
        session.refresh(temp_user)
        session.refresh(target_user)

        # 目标账号 wechat_openid 保持 None（不转移，避免密码登录被拦截）
        assert target_user.wechat_openid is None
        # 临时账号 wechat 字段保留（供微信登录重定向）
        assert temp_user.wechat_openid == "wx_openid_temp_2"
        # 临时账号标记为已合并
        assert temp_user.is_temporary is False
        assert temp_user.status == "merged"
        assert temp_user.merged_to_user_id == target_user.id


class TestMergeAccountsTargetHasWechat:
    """merge_accounts 目标账号已绑其他微信 → TargetHasWechatError (40902)."""

    def test_raises_target_has_wechat_error(self, seeded_db: dict[str, Any]) -> None:
        """目标账号已绑定不同 openid 时应抛 TargetHasWechatError."""
        session = seeded_db["session"]

        temp_user = _make_user(
            session,
            user_id="temp-wechat-conflict",
            username="temp-wechat-conflict",
            is_temporary=True,
            wechat_openid="wx_openid_temp_conflict",
        )
        target_user = _make_user(
            session,
            user_id="target-wechat-conflict",
            username="target-wechat-conflict",
            is_temporary=False,
            wechat_openid="wx_openid_target_other",
        )
        session.commit()

        with pytest.raises(TargetHasWechatError) as exc_info:
            UserWechatService.merge_accounts(session, temp_user, target_user)

        assert exc_info.value.code == 40902
        assert exc_info.value.status_code == 409

    def test_allows_merge_when_target_has_no_openid(self, seeded_db: dict[str, Any]) -> None:
        """目标账号未绑定微信（openid=None）时不应抛异常（正常合并场景）."""
        session = seeded_db["session"]

        temp_user = _make_user(
            session,
            user_id="temp-no-openid",
            username="temp-no-openid",
            is_temporary=True,
            wechat_openid="wx_openid_temp_no_conflict",
        )
        target_user = _make_user(
            session,
            user_id="target-no-openid",
            username="target-no-openid",
            is_temporary=False,
            # wechat_openid=None，目标账号未绑定微信
        )
        session.commit()

        # 不应抛异常
        UserWechatService.merge_accounts(session, temp_user, target_user)

        session.refresh(target_user)
        # wechat_openid 不转移至目标账号（保留在临时账号上供登录重定向）
        assert target_user.wechat_openid is None


# ==================== set_initial_phone ====================


class TestSetInitialPhoneConflict:
    """set_initial_phone 手机号占用检测."""

    def test_phone_taken_by_main_account_raises_40901(self, seeded_db: dict[str, Any]) -> None:
        """手机号被 is_temporary=False 的主账号占用 → PhoneTakenByMainAccountError."""
        session = seeded_db["session"]

        main_phone = "13800138002"
        _make_user(
            session,
            user_id="main-phone-owner",
            username="main-phone-owner",
            nickname="主账号持有人",
            is_temporary=False,
            phone=main_phone,
        )
        temp_user = _make_user(
            session,
            user_id="temp-phone-bind",
            username="temp-phone-bind",
            is_temporary=True,
        )
        session.commit()

        with pytest.raises(PhoneTakenByMainAccountError) as exc_info:
            UserProfileService().set_initial_phone(session, temp_user, main_phone)

        assert exc_info.value.code == 40901
        assert exc_info.value.status_code == 409
        hint = exc_info.value.target_user_hint
        assert "nickname" in hint
        assert "phone_masked" in hint
        assert hint["nickname"] == "主账号持有人"
        assert "****" in hint["phone_masked"]

    def test_phone_taken_by_temp_account_raises_business_error(self, seeded_db: dict[str, Any]) -> None:
        """手机号被 is_temporary=True 的临时账号占用 → BusinessLogicError."""
        session = seeded_db["session"]

        temp_phone = "13800138003"
        _make_user(
            session,
            user_id="temp-phone-owner",
            username="temp-phone-owner",
            is_temporary=True,
            phone=temp_phone,
        )
        temp_user_2 = _make_user(
            session,
            user_id="temp-phone-bind-2",
            username="temp-phone-bind-2",
            is_temporary=True,
        )
        session.commit()

        with pytest.raises(BusinessLogicError) as exc_info:
            UserProfileService().set_initial_phone(session, temp_user_2, temp_phone)

        # BusinessLogicError 默认 status_code=422
        assert exc_info.value.status_code == 422

    def test_phone_already_bound_raises_validation_error(self, seeded_db: dict[str, Any]) -> None:
        """用户已绑定手机号时调用 set_initial_phone → ValidationError."""
        from services.system.exceptions import ValidationError

        session = seeded_db["session"]

        user = _make_user(
            session,
            user_id="already-has-phone",
            username="already-has-phone",
            phone="13800138004",
        )
        session.commit()

        with pytest.raises(ValidationError):
            UserProfileService().set_initial_phone(session, user, "13900139004")


class TestSetInitialPhoneSuccess:
    """set_initial_phone 绑定成功."""

    def test_binds_phone_and_clears_temporary_flag(self, seeded_db: dict[str, Any]) -> None:
        """临时账号绑定手机号后 is_temporary 应置 False."""
        session = seeded_db["session"]

        temp_user = _make_user(
            session,
            user_id="temp-bind-success",
            username="temp-bind-success",
            is_temporary=True,
        )
        session.commit()

        new_phone = "13800138005"
        updated = UserProfileService().set_initial_phone(session, temp_user, new_phone)

        assert updated.phone == new_phone
        assert updated.phone_hash == hash_phone(new_phone)
        assert updated.is_temporary is False

    def test_non_temporary_user_binds_phone_keeps_flag_false(self, seeded_db: dict[str, Any]) -> None:
        """非临时账号绑定手机号后 is_temporary 保持 False."""
        session = seeded_db["session"]

        user = _make_user(
            session,
            user_id="normal-bind-success",
            username="normal-bind-success",
            is_temporary=False,
        )
        session.commit()

        updated = UserProfileService().set_initial_phone(session, user, "13800138006")

        assert updated.phone == "13800138006"
        assert updated.is_temporary is False


# ==================== 回归：合并后密码登录与微信登录重定向 ====================


class TestMergeRegressionPasswordLogin:
    """回归：合并后目标账号仍可走密码登录.

    Bug 场景：merge_accounts 曾将 wechat_openid 转移到目标账号，导致
    authenticate_user 的 is_wechat_only_user 检查拦截目标账号密码登录，
    内部员工合并微信临时账号后被锁死后台。修复后 wechat_openid 保留在
    临时账号上，目标账号密码登录不受影响。
    """

    def test_target_can_password_login_after_merge(self, seeded_db: dict[str, Any]) -> None:
        """合并后目标账号仍可通过 authenticate_user 密码登录."""
        session = seeded_db["session"]

        temp_user = _make_user(
            session,
            user_id="temp-regress-1",
            username="temp-regress-1",
            is_temporary=True,
            wechat_openid="wx_openid_regress_1",
        )
        # 目标主账号：内部员工（admin 角色），有真实密码
        target_user = _make_user(
            session,
            user_id="target-regress-1",
            username="target-regress-1",
            nickname="员工1",
            role_code="admin",
            is_temporary=False,
        )
        session.commit()

        UserWechatService.merge_accounts(session, temp_user, target_user)

        # 刷新目标账号，确认 wechat_openid 仍为 None
        session.refresh(target_user)
        assert target_user.wechat_openid is None

        # 目标账号应能通过密码登录（不被 wechat_openid 检查拦截）
        authenticated = AuthService.authenticate_user(
            session,
            "target-regress-1",
            _TEST_PASSWORD,
        )
        assert authenticated.id == target_user.id


class TestConcurrentWechatCreateConflict:
    """并发首次微信登录唯一约束冲突时回滚并复用，而非 500.

    Bug 场景：两个并发登录请求对同一 openid（或同一 unionid）同时走「注册新用户」
    分支，第二个 db.commit() 命中 users.wechat_openid / wechat_unionid 唯一约束
    抛出 IntegrityError。此前 create 路径未捕获（对比 register_public_user /
    create_user 均有 try/except IntegrityError），导致登录接口直接 500。
    修复后回滚并按 openid 重新查询，复用并发请求已创建的用户。
    """

    def test_concurrent_first_login_recovers_on_integrity_error(self) -> None:
        """IntegrityError 时应回滚并返回已存在的用户（并发请求已创建）."""
        from unittest.mock import MagicMock

        from sqlalchemy.exc import IntegrityError

        from models import Role, User

        db = MagicMock()
        existing = MagicMock(spec=User)

        role = MagicMock(spec=Role)
        role.id = "customer-role-id"

        # 调用顺序：openid 查询(None, 模拟竞态窗口内该行不可见) → role 查询 →
        # (IntegrityError 后) openid 重新查询(命中并发请求创建的用户)
        openid_lookup_none = MagicMock()
        openid_lookup_none.filter.return_value.first.return_value = None
        role_lookup = MagicMock()
        role_lookup.filter.return_value.first.return_value = role
        openid_lookup_existing = MagicMock()
        openid_lookup_existing.filter.return_value.first.return_value = existing

        db.query.side_effect = [openid_lookup_none, role_lookup, openid_lookup_existing]
        db.commit.side_effect = IntegrityError("statement", {}, Exception("duplicate key"))

        resolved = WeChatAuthService.login_or_register_wechat_user(
            db=db,
            openid="race_openid_1",
            unionid=None,
            session_key="race_sk",
        )

        # 不抛异常，回滚后复用已存在用户
        assert resolved is existing
        db.rollback.assert_called_once()


class TestMergeRegressionWechatLoginRedirect:
    """回归：微信登录命中已合并临时账号时重定向到目标主账号."""

    def test_wechat_login_redirects_to_target_after_merge(self, seeded_db: dict[str, Any]) -> None:
        """合并后用同一 openid 微信登录，应返回目标主账号而非已合并的临时账号."""
        session = seeded_db["session"]

        temp_user = _make_user(
            session,
            user_id="temp-regress-2",
            username="temp-regress-2",
            is_temporary=True,
            wechat_openid="wx_openid_regress_2",
        )
        target_user = _make_user(
            session,
            user_id="target-regress-2",
            username="target-regress-2",
            nickname="目标用户",
            is_temporary=False,
        )
        session.commit()

        UserWechatService.merge_accounts(session, temp_user, target_user)

        # 用临时账号的 openid 再次微信登录
        resolved = WeChatAuthService.login_or_register_wechat_user(
            db=session,
            openid="wx_openid_regress_2",
            unionid=None,
            session_key="new_session_key",
        )

        # 应重定向到目标主账号
        assert resolved.id == target_user.id
        assert resolved.status == "active"
        # session_key 应写入目标账号
        session.refresh(resolved)
        assert resolved.wechat_session_key == "new_session_key"

    def test_wechat_login_degrades_gracefully_when_target_missing(self, seeded_db: dict[str, Any]) -> None:
        """目标账号缺失（数据异常）时，微信登录降级返回已合并账号而非崩溃.

        _resolve_merged_target 返回 None 后不创建新用户（openid 已被合并账号占用，
        创建会触发唯一约束冲突），fall through 到「更新现有用户」分支返回已合并账号.
        """
        session = seeded_db["session"]

        temp_user = _make_user(
            session,
            user_id="temp-regress-3",
            username="temp-regress-3",
            is_temporary=True,
            wechat_openid="wx_openid_regress_3",
        )
        session.commit()

        # 手动标记为合并但指向不存在的目标（模拟数据异常）
        temp_user.status = "merged"
        temp_user.merged_to_user_id = "nonexistent-target-id"
        session.commit()

        # 用该 openid 微信登录 → 目标缺失 → 降级返回已合并账号（不崩溃）
        resolved = WeChatAuthService.login_or_register_wechat_user(
            db=session,
            openid="wx_openid_regress_3",
            unionid=None,
            session_key="fresh_key",
        )

        # 不应崩溃，返回已合并的临时账号（降级处理）
        assert resolved.id == temp_user.id
        assert resolved.wechat_session_key == "fresh_key"


# ==================== schema 校验 ====================


class TestMergeAccountRequestSchema:
    """MergeAccountRequest 按 type 校验字段必填."""

    def test_internal_type_requires_username_and_password(self) -> None:
        """type=internal 时 username 与 password 必填."""
        from pydantic import ValidationError

        from schemas.user import MergeAccountRequest

        # 缺 username → 校验失败
        with pytest.raises(ValidationError):
            MergeAccountRequest(type="internal", password=_TEST_SCHEMA_PASSWORD)
        # 缺 password → 校验失败
        with pytest.raises(ValidationError):
            MergeAccountRequest(type="internal", username="emp001")
        # 都提供 → 通过
        req = MergeAccountRequest(type="internal", username="emp001", password=_TEST_SCHEMA_PASSWORD)
        assert req.username == "emp001"

    def test_phone_type_requires_phone_and_sms_code(self) -> None:
        """type=phone 时 phone 与 sms_code 必填."""
        from pydantic import ValidationError

        from schemas.user import MergeAccountRequest

        # 缺 phone → 校验失败
        with pytest.raises(ValidationError):
            MergeAccountRequest(type="phone", sms_code="1234")
        # 缺 sms_code → 校验失败
        with pytest.raises(ValidationError):
            MergeAccountRequest(type="phone", phone="13800138000")
        # 都提供 → 通过
        req = MergeAccountRequest(type="phone", phone="13800138000", sms_code="1234")
        assert req.phone == "13800138000"

    def test_internal_type_ignores_phone_fields(self) -> None:
        """type=internal 时 phone/sms_code 可为 None."""
        from schemas.user import MergeAccountRequest

        req = MergeAccountRequest(type="internal", username="emp001", password=_TEST_SCHEMA_PASSWORD)
        assert req.phone is None
        assert req.sms_code is None
