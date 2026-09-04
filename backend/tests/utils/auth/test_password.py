"""密码工具单元测试（pwdlib Argon2 + Bcrypt 双哈希与平滑升级）."""

from utils.auth.password import (
    get_password_hash,
    validate_password_strength,
    verify_password,
)

# 真实 Bcrypt 哈希（口令 OldPass123!），用于验证 Bcrypt → Argon2 平滑升级。
# 故意硬编码而非运行时生成，确保 pwdlib 确实识别旧 Bcrypt 格式并触发升级。
_BCRYPT_HASH_OLDPASS = "$2b$12$SUhoGVlvkr1/LxUQn/eDk.g7nVg8cK66S9/dXd9s9kTDQA2WfZl.W"


def test_new_password_hash_is_argon2():
    """新签发哈希必须为 Argon2（password_hash 列表首个哈希器）."""
    hashed = get_password_hash("SomeStrong1!pass")
    assert hashed.startswith("$argon2id$")


def test_bcrypt_old_hash_verifies_and_returns_upgrade():
    """旧 Bcrypt 哈希校验通过后应返回 Argon2 升级哈希."""
    verified, updated_hash = verify_password("OldPass123!", _BCRYPT_HASH_OLDPASS)
    assert verified is True
    assert updated_hash is not None
    assert updated_hash.startswith("$argon2id$")


def test_argon2_hash_verifies_without_update():
    """Argon2 哈希校验通过后无需升级，updated_hash 应为 None."""
    hashed = get_password_hash("SomeStrong1!pass")
    verified, updated_hash = verify_password("SomeStrong1!pass", hashed)
    assert verified is True
    assert updated_hash is None


def test_wrong_password_returns_false_none():
    """密码错误时返回 (False, None)."""
    hashed = get_password_hash("SomeStrong1!pass")
    verified, updated_hash = verify_password("WrongPass1!xyz", hashed)
    assert verified is False
    assert updated_hash is None


def test_validate_password_strength_still_works():
    """validate_password_strength 行为保持不变."""
    ok, msg = validate_password_strength("Strong1!pass")
    assert ok is True
    assert msg == ""

    ok2, msg2 = validate_password_strength("weak")
    assert ok2 is False
    assert msg2 != ""
