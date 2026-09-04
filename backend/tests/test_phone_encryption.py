"""手机号加密测试.

验证：
1. 注册新用户时 phone 加密存储，phone_hash 正确
2. 更新手机号时唯一性约束基于 phone_hash
3. 迁移脚本在已存明文数据上运行，验证加密和哈希回填
"""

from typing import Any

import pytest
from sqlalchemy import text
from sqlalchemy.engine import Engine

from schemas.user import UserUpdate
from services.system.auth import AuthService
from services.system.exceptions import ConflictError, ValidationError
from services.system.user import UserProfileService, UserService
from utils.crypto import decrypt, encrypt, hash_phone


class TestRegisterPhoneEncryption:
    """注册新用户时手机号加密存储测试."""

    def test_phone_encrypted_in_db(self, seeded_db: dict[str, Any]) -> None:
        """注册用户后，数据库中 phone 列存储的是 Fernet 密文，不是明文."""
        session = seeded_db["session"]

        # 注册带手机号的 C 端用户
        AuthService.register_public_user(
            session,
            username="phoneuser1",
            password="Test1234!",
            phone="13900139001",
        )

        # 通过原始 SQL 查询 phone 列（绕过 ORM 自动解密）
        from sqlalchemy import text as sql_text

        row = session.execute(sql_text("SELECT phone, phone_hash FROM users WHERE username = 'phoneuser1'")).fetchone()
        assert row is not None, "用户应已创建"

        raw_phone = row[0]

        # phone 列应为 Fernet 密文（以 gAAAAA 开头），不是明文手机号
        assert raw_phone != "13900139001", "phone 列不应存储明文手机号"
        assert raw_phone.startswith("gAAAAA"), f"phone 列应为 Fernet 密文，实际: {raw_phone[:20]}..."

        # 密文应可解密回明文
        assert decrypt(raw_phone) == "13900139001", "解密后应得到原始手机号"

    def test_phone_hash_correct(self, seeded_db: dict[str, Any]) -> None:
        """注册用户后，phone_hash 等于 hash_phone(明文手机号)."""
        session = seeded_db["session"]

        AuthService.register_public_user(
            session,
            username="phoneuser2",
            password="Test1234!",
            phone="13900139002",
        )

        from sqlalchemy import text as sql_text

        row = session.execute(sql_text("SELECT phone_hash FROM users WHERE username = 'phoneuser2'")).fetchone()
        assert row is not None

        expected_hash = hash_phone("13900139002")
        assert row[0] == expected_hash, (
            f"phone_hash 应为 hash_phone('13900139002')，实际 {row[0]}，期望 {expected_hash}"
        )

    def test_phone_hash_deterministic(self, seeded_db: dict[str, Any]) -> None:
        """同一手机号的 phone_hash 是确定性的（HMAC）."""
        session = seeded_db["session"]

        AuthService.register_public_user(
            session,
            username="phoneuser3a",
            password="Test1234!",
            phone="13900139003",
        )
        AuthService.register_public_user(
            session,
            username="phoneuser3b",
            password="Test1234!",
            phone="13900139004",
        )

        from sqlalchemy import text as sql_text

        rows = session.execute(
            sql_text("SELECT phone_hash FROM users WHERE username IN ('phoneuser3a', 'phoneuser3b')")
        ).fetchall()

        # 不同手机号 → 不同 hash
        assert rows[0][0] != rows[1][0], "不同手机号的 phone_hash 应不同"

        # 相同手机号 → 相同 hash（确定性）
        assert hash_phone("13900139003") == hash_phone("13900139003")

    def test_register_duplicate_phone_rejected(self, seeded_db: dict[str, Any]) -> None:
        """注册时手机号已被占用 → ConflictError."""
        session = seeded_db["session"]

        AuthService.register_public_user(
            session,
            username="dup1",
            password="Test1234!",
            phone="13900139010",
        )

        with pytest.raises(ConflictError, match="手机号已被绑定"):
            AuthService.register_public_user(
                session,
                username="dup2",
                password="Test1234!",
                phone="13900139010",
            )

    def test_register_no_phone_no_hash(self, seeded_db: dict[str, Any]) -> None:
        """注册时不提供手机号 → phone 和 phone_hash 均为 NULL."""
        session = seeded_db["session"]

        AuthService.register_public_user(
            session,
            username="nophone",
            password="Test1234!",
        )

        from sqlalchemy import text as sql_text

        row = session.execute(sql_text("SELECT phone, phone_hash FROM users WHERE username = 'nophone'")).fetchone()
        assert row is not None
        assert row[0] is None, "无手机号时 phone 应为 NULL"
        assert row[1] is None, "无手机号时 phone_hash 应为 NULL"


class TestUpdatePhoneUniqueness:
    """更新手机号时唯一性约束基于 phone_hash 测试."""

    def test_update_to_duplicate_phone_rejected(self, seeded_db: dict[str, Any]) -> None:
        """更新手机号为其他用户已绑定的号码 → ConflictError."""
        session = seeded_db["session"]

        # 用户 A 绑定手机号
        AuthService.register_public_user(
            session,
            username="updateA",
            password="Test1234!",
            phone="13900139020",
        )

        # 用户 B 绑定不同手机号
        user_b = AuthService.register_public_user(
            session,
            username="updateB",
            password="Test1234!",
            phone="13900139021",
        )

        # 用户 B 尝试更新为用户 A 的手机号 → 应被拒绝
        user_service = UserService()
        with pytest.raises(ConflictError, match="手机号已被使用"):
            user_service.update_user(
                session,
                user_b.id,
                UserUpdate(phone="13900139020"),
            )

    def test_update_phone_hash_recomputed(self, seeded_db: dict[str, Any]) -> None:
        """更新手机号后 phone_hash 同步更新."""
        session = seeded_db["session"]

        user = AuthService.register_public_user(
            session,
            username="rehash",
            password="Test1234!",
            phone="13900139030",
        )

        old_hash = user.phone_hash
        assert old_hash == hash_phone("13900139030")

        # 更新手机号
        from schemas.user import UserUpdate

        user_service = UserService()
        user_service.update_user(session, user.id, UserUpdate(phone="13900139031"))

        session.refresh(user)
        assert user.phone_hash == hash_phone("13900139031"), "更新后 phone_hash 应重新计算"
        assert user.phone_hash != old_hash, "phone_hash 应已变化"

    def test_update_phone_to_same_value_no_conflict(self, seeded_db: dict[str, Any]) -> None:
        """更新手机号为当前已绑定的同一号码 → 不冲突（排除自身）."""
        session = seeded_db["session"]

        user = AuthService.register_public_user(
            session,
            username="sameval",
            password="Test1234!",
            phone="13900139040",
        )

        from schemas.user import UserUpdate

        user_service = UserService()
        updated = user_service.update_user(session, user.id, UserUpdate(phone="13900139040"))
        assert updated.phone_hash == hash_phone("13900139040")

    def test_c_end_update_phone_with_verification(self, seeded_db: dict[str, Any]) -> None:
        """C 端用户密码验证后更新手机号，唯一性基于 phone_hash."""
        session = seeded_db["session"]

        AuthService.register_public_user(
            session,
            username="cverifyA",
            password="Test1234!",
            phone="13900139050",
        )
        user_b = AuthService.register_public_user(
            session,
            username="cverifyB",
            password="Test1234!",
            phone="13900139051",
        )

        user_service = UserProfileService()
        # 用户 B 尝试更新为用户 A 的手机号 → ValidationError（手机号已被其他账号绑定）

        with pytest.raises(ValidationError, match="手机号已被其他账号绑定"):
            user_service.update_phone_with_verification(session, user_b, "13900139050", password="Test1234!")


class TestPhoneMigration:
    """迁移脚本测试：加密已存明文手机号 + 回填 phone_hash.

    使用独立 PG 引擎直连（绕过 SAVEPOINT 隔离），因为迁移函数内部
    使用自己的 connection/transaction，需要看到真实数据。
    每个测试前后 TRUNCATE users 表确保隔离。
    """

    @pytest.fixture
    def migration_engine(self, test_engine: Engine) -> Engine:
        """复用会话级 PG 引擎，每个测试前后清理 users 和 roles 表.

        迁移函数使用独立 connection，无法依赖 SAVEPOINT 隔离，
        因此通过 TRUNCATE 保证测试间数据隔离。
        _insert_raw_user 会插入占位 role 到 roles 表，需一并清理。
        """
        with test_engine.begin() as conn:
            conn.execute(text("TRUNCATE TABLE users RESTART IDENTITY CASCADE"))
            conn.execute(text("TRUNCATE TABLE roles RESTART IDENTITY CASCADE"))
        yield test_engine
        with test_engine.begin() as conn:
            conn.execute(text("TRUNCATE TABLE users RESTART IDENTITY CASCADE"))
            conn.execute(text("TRUNCATE TABLE roles RESTART IDENTITY CASCADE"))

    def _insert_raw_user(
        self,
        engine: Engine,
        *,
        user_id: str,
        username: str,
        phone_raw: str | None,
        phone_hash_value: str | None = None,
        role_id: str = "customer-role",
    ) -> None:
        """绕过 ORM 加密，直接插入原始数据（模拟旧数据）."""
        # role_id 引用的 roles 表可能为空，先插入占位角色（若不存在）
        with engine.begin() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM roles WHERE id = :rid"),
                {"rid": role_id},
            ).first()
            if not exists:
                conn.execute(
                    text(
                        "INSERT INTO roles (id, name, code, is_active, created_at, updated_at) "
                        "VALUES (:id, :name, :code, true, NOW(), NOW())"
                    ),
                    {"id": role_id, "name": f"role-{role_id}", "code": role_id},
                )
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO users (id, username, password, nickname, role_id, status, "
                    "phone, phone_hash, token_version, must_change_password, created_at, updated_at) "
                    "VALUES (:id, :username, :pwd, :nick, :rid, 'active', "
                    ":phone, :phash, 1, false, NOW(), NOW())"
                ),
                {
                    "id": user_id,
                    "username": username,
                    "pwd": "fakehash",
                    "nick": username,
                    "rid": role_id,
                    "phone": phone_raw,
                    "phash": phone_hash_value,
                },
            )

    def test_encrypt_existing_plaintext_phones(self, migration_engine: Engine) -> None:
        """迁移脚本将明文手机号加密为 Fernet 密文."""
        from migrations import encrypt_existing_phones

        # 插入明文手机号（模拟旧数据）
        self._insert_raw_user(migration_engine, user_id="mig-1", username="miguser1", phone_raw="13800138000")

        # 执行迁移
        encrypt_existing_phones(migration_engine)

        # 验证：phone 列已变为 Fernet 密文
        with migration_engine.begin() as conn:
            row = conn.execute(text("SELECT phone FROM users WHERE id = 'mig-1'")).fetchone()
            assert row is not None
            raw_phone = row[0]
            assert raw_phone != "13800138000", "迁移后 phone 不应是明文"
            assert raw_phone.startswith("gAAAAA"), f"迁移后 phone 应为 Fernet 密文，实际: {raw_phone[:20]}"
            assert decrypt(raw_phone) == "13800138000", "密文应解密回原始手机号"

    def test_encrypt_skip_already_encrypted(self, migration_engine: Engine) -> None:
        """迁移脚本跳过已加密的手机号（幂等）."""
        from migrations import encrypt_existing_phones

        # 插入已加密的手机号
        encrypted_phone = encrypt("13800138001")
        self._insert_raw_user(migration_engine, user_id="mig-2", username="miguser2", phone_raw=encrypted_phone)

        # 执行迁移
        encrypt_existing_phones(migration_engine)

        # 验证：phone 列不变
        with migration_engine.begin() as conn:
            row = conn.execute(text("SELECT phone FROM users WHERE id = 'mig-2'")).fetchone()
            assert row[0] == encrypted_phone, "已加密的手机号不应被重复加密"

    def test_populate_phone_hash(self, migration_engine: Engine) -> None:
        """迁移脚本回填 phone_hash（基于解密后的明文）."""
        from migrations import populate_phone_hash

        # 插入已加密手机号但无 phone_hash
        encrypted_phone = encrypt("13800138002")
        self._insert_raw_user(
            migration_engine,
            user_id="mig-3",
            username="miguser3",
            phone_raw=encrypted_phone,
            phone_hash_value=None,
        )

        # 执行回填
        populate_phone_hash(migration_engine)

        # 验证
        with migration_engine.begin() as conn:
            row = conn.execute(text("SELECT phone_hash FROM users WHERE id = 'mig-3'")).fetchone()
            assert row[0] == hash_phone("13800138002"), "phone_hash 应基于解密后的明文手机号计算"

    def test_populate_phone_hash_from_plaintext(self, migration_engine: Engine) -> None:
        """迁移脚本回填 phone_hash（当 phone 仍为明文时也能处理）."""
        from migrations import populate_phone_hash

        # 插入明文手机号且无 phone_hash
        self._insert_raw_user(
            migration_engine,
            user_id="mig-4",
            username="miguser4",
            phone_raw="13800138003",
            phone_hash_value=None,
        )

        # 执行回填（populate_phone_hash 内部会判断明文/密文）
        populate_phone_hash(migration_engine)

        with migration_engine.begin() as conn:
            row = conn.execute(text("SELECT phone_hash FROM users WHERE id = 'mig-4'")).fetchone()
            assert row[0] == hash_phone("13800138003")

    def test_full_migration_pipeline(self, migration_engine: Engine) -> None:
        """完整迁移流程：先加密明文，再回填 phone_hash."""
        from migrations import run_startup_migrations

        # 插入明文手机号且无 phone_hash（模拟最旧的存量数据）
        self._insert_raw_user(
            migration_engine,
            user_id="mig-5",
            username="miguser5",
            phone_raw="13800138004",
            phone_hash_value=None,
        )

        # 执行完整迁移
        run_startup_migrations(migration_engine)

        with migration_engine.begin() as conn:
            row = conn.execute(text("SELECT phone, phone_hash FROM users WHERE id = 'mig-5'")).fetchone()
            raw_phone, phone_hash_value = row[0], row[1]

            # phone 已加密
            assert raw_phone.startswith("gAAAAA"), "完整迁移后 phone 应为密文"
            assert decrypt(raw_phone) == "13800138004"

            # phone_hash 已回填
            assert phone_hash_value == hash_phone("13800138004")

    def test_migration_idempotent(self, migration_engine: Engine) -> None:
        """迁移脚本可重复执行（幂等）."""
        from migrations import run_startup_migrations

        encrypted_phone = encrypt("13800138005")
        self._insert_raw_user(
            migration_engine,
            user_id="mig-6",
            username="miguser6",
            phone_raw=encrypted_phone,
            phone_hash_value=hash_phone("13800138005"),
        )

        # 多次执行迁移
        for _ in range(3):
            run_startup_migrations(migration_engine)

        with migration_engine.begin() as conn:
            row = conn.execute(text("SELECT phone, phone_hash FROM users WHERE id = 'mig-6'")).fetchone()
            assert row[0] == encrypted_phone, "幂等执行不应改变已加密数据"
            assert row[1] == hash_phone("13800138005"), "幂等执行不应改变已有 phone_hash"

    def test_migration_skips_null_phone(self, migration_engine: Engine) -> None:
        """迁移脚本跳过 phone 为 NULL 的用户."""
        from migrations import run_startup_migrations

        self._insert_raw_user(
            migration_engine,
            user_id="mig-7",
            username="miguser7",
            phone_raw=None,
            phone_hash_value=None,
        )

        run_startup_migrations(migration_engine)

        with migration_engine.begin() as conn:
            row = conn.execute(text("SELECT phone, phone_hash FROM users WHERE id = 'mig-7'")).fetchone()
            assert row[0] is None, "NULL phone 应保持 NULL"
            assert row[1] is None, "NULL phone 的 phone_hash 应保持 NULL"
