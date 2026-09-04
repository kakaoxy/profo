"""AuthService 单元测试：DUMMY_HASH 时序攻击防护 + token_version 强制校验."""

import pytest

from services.system.auth import DUMMY_HASH, AuthService
from services.system.exceptions import AuthenticationError
from utils.auth import AUDIENCE_ADMIN, create_access_token

# ---------------- Task 2: DUMMY_HASH 时序攻击防护 ----------------


def test_authenticate_user_not_found_calls_verify_with_dummy_hash(mocker, seeded_db):
    """用户不存在时 verify_password 应以 DUMMY_HASH 被调用一次（时序攻击防护）."""
    session = seeded_db["session"]
    spy = mocker.patch("services.system.auth.verify_password", return_value=(False, None))

    with pytest.raises(AuthenticationError):
        AuthService.authenticate_user(session, "nonexistent-user", "anypass")

    spy.assert_called_once_with("anypass", DUMMY_HASH)


def test_authenticate_user_wrong_password_calls_verify_with_user_hash(mocker, seeded_db):
    """用户存在但密码错误时 verify_password 应以用户哈希被调用一次."""
    session = seeded_db["session"]
    admin = seeded_db["users"]["admin"]
    spy = mocker.patch("services.system.auth.verify_password", return_value=(False, None))

    with pytest.raises(AuthenticationError):
        AuthService.authenticate_user(session, "admin", "wrong-pass")

    spy.assert_called_once_with("wrong-pass", admin.password)


def test_authenticate_user_correct_password_returns_user(mocker, seeded_db):
    """用户存在且密码正确时返回用户对象，且 verify_password 仅调用一次."""
    session = seeded_db["session"]
    admin = seeded_db["users"]["admin"]
    spy = mocker.patch("services.system.auth.verify_password", return_value=(True, None))

    user = AuthService.authenticate_user(session, "admin", "Admin123!")

    assert user.id == admin.id
    spy.assert_called_once_with("Admin123!", admin.password)


# ---------------- Task 3: token_version 强制校验 ----------------


def test_authenticate_by_token_missing_ver_raises(seeded_db):
    """Token 缺失 ver 字段应被拒绝（严格校验，不再放行 None）."""
    session = seeded_db["session"]
    admin = seeded_db["users"]["admin"]
    token = create_access_token(
        data={"sub": admin.id, "role": "admin"},  # 故意不带 ver
        audience=AUDIENCE_ADMIN,
    )

    with pytest.raises(AuthenticationError):
        AuthService.authenticate_by_token(session, token, audience=AUDIENCE_ADMIN)


def test_authenticate_by_token_ver_mismatch_raises(seeded_db):
    """Token ver 与用户 token_version 不匹配应被拒绝."""
    session = seeded_db["session"]
    admin = seeded_db["users"]["admin"]
    token = create_access_token(
        data={"sub": admin.id, "role": "admin", "ver": admin.token_version + 999},
        audience=AUDIENCE_ADMIN,
    )

    with pytest.raises(AuthenticationError):
        AuthService.authenticate_by_token(session, token, audience=AUDIENCE_ADMIN)


def test_authenticate_by_token_ver_match_returns_user(seeded_db):
    """Token ver 与用户 token_version 匹配时返回用户."""
    session = seeded_db["session"]
    admin = seeded_db["users"]["admin"]
    token = create_access_token(
        data={"sub": admin.id, "role": "admin", "ver": admin.token_version},
        audience=AUDIENCE_ADMIN,
    )

    user = AuthService.authenticate_by_token(session, token, audience=AUDIENCE_ADMIN)

    assert user.id == admin.id
