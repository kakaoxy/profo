"""启动时数据迁移.

项目未使用 Alembic，对于新增列与已存数据的格式变更，通过本模块在应用启动时
（init_db 之后）幂等执行。所有迁移必须可重复执行且不破坏已有数据。

迁移清单：
- add_token_version_column: 为 users 表添加 token_version 列（H-002）
- add_phone_hash_column: 为 users 表添加 phone_hash 列与唯一索引（H-006）
- encrypt_existing_phones: 将已存的明文手机号加密为 Fernet 密文（H-006）
- populate_phone_hash: 为已存用户回填 phone_hash（H-006）

"""

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from utils.crypto import decrypt, encrypt, hash_phone

logger = logging.getLogger(__name__)

_FERNET_CIPHER_PREFIX = "gAAAAA"
_MIGRATION_BATCH_SIZE = 500


def _column_exists(engine: Engine, table: str, column: str) -> bool:
    """检查某列是否已存在（SQLite）。"""
    inspector = inspect(engine)
    if table not in inspector.get_table_names():
        return False
    return any(col["name"] == column for col in inspector.get_columns(table))


def _index_exists(engine: Engine, index_name: str) -> bool:
    """检查某索引是否已存在。"""
    inspector = inspect(engine)
    for table in inspector.get_table_names():
        if any(idx["name"] == index_name for idx in inspector.get_indexes(table)):
            return True
    return False


def add_token_version_column(engine: Engine) -> None:
    """为 users 表添加 token_version INTEGER NOT NULL DEFAULT 1。

    SQLite 支持 ALTER TABLE ADD COLUMN，幂等。
    """
    if _column_exists(engine, "users", "token_version"):
        return
    logger.info("迁移：为 users 表添加 token_version 列")
    with engine.begin() as conn:
        conn.execute(
            text("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1")
        )


def add_phone_hash_column(engine: Engine) -> None:
    """为 users 表添加 phone_hash 列及唯一索引（H-006）。

    Fernet 加密随机 IV 导致 phone 列无法维持唯一性，新增 phone_hash 列承载唯一约束。
    """
    if not _column_exists(engine, "users", "phone_hash"):
        logger.info("迁移：为 users 表添加 phone_hash 列")
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TABLE users ADD COLUMN phone_hash VARCHAR(64)")
            )

    if not _index_exists(engine, "idx_users_phone_hash"):
        logger.info("迁移：创建 phone_hash 唯一索引")
        with engine.begin() as conn:
            conn.execute(
                text("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_hash ON users(phone_hash)")
            )


def encrypt_existing_phones(engine: Engine) -> None:
    """将 users 表中明文手机号加密为 Fernet 密文。

    判定规则：Fernet 密文以 'gAAAAA' 开头；不以该前缀开头视为明文并加密。
    幂等：已是密文则跳过。
    使用基于 id 的游标分页，避免大数据量下 fetchall 导致 OOM。
    每批次独立提交，避免单个大事务。

    """
    updated = 0
    last_id = 0
    while True:
        with engine.begin() as conn:
            rows = conn.execute(
                text(
                    "SELECT id, phone FROM users "
                    "WHERE phone IS NOT NULL AND id > :last_id "
                    "ORDER BY id LIMIT :batch_size"
                ),
                {"last_id": last_id, "batch_size": _MIGRATION_BATCH_SIZE},
            ).fetchall()
            if not rows:
                break

            for row in rows:
                user_id, phone = row[0], row[1]
                if not phone:
                    if phone == "":
                        # 空字符串不是有效手机号，统一清洗为 NULL
                        conn.execute(
                            text("UPDATE users SET phone = NULL WHERE id = :id"),
                            {"id": user_id},
                        )
                    continue
                if phone.startswith(_FERNET_CIPHER_PREFIX):
                    continue
                try:
                    ciphertext = encrypt(phone)
                    conn.execute(
                        text("UPDATE users SET phone = :phone WHERE id = :id"),
                        {"phone": ciphertext, "id": user_id},
                    )
                    updated += 1
                except Exception:  # noqa: BLE001
                    logger.exception("加密用户手机号失败 user_id=%s", user_id)
        last_id = rows[-1][0]

    if updated:
        logger.info("迁移：加密了 %d 条明文手机号", updated)


def populate_phone_hash(engine: Engine) -> None:
    """为已存用户回填 phone_hash（基于解密后的明文手机号）。

    必须在 encrypt_existing_phones 之后执行。
    使用基于 id 的游标分页，避免大数据量下 fetchall 导致 OOM。
    每批次独立提交，避免单个大事务。

    """
    updated = 0
    last_id = 0
    while True:
        with engine.begin() as conn:
            rows = conn.execute(
                text(
                    "SELECT id, phone FROM users "
                    "WHERE phone IS NOT NULL AND phone_hash IS NULL AND id > :last_id "
                    "ORDER BY id LIMIT :batch_size"
                ),
                {"last_id": last_id, "batch_size": _MIGRATION_BATCH_SIZE},
            ).fetchall()
            if not rows:
                break

            for row in rows:
                user_id, phone = row[0], row[1]
                if not phone:
                    continue
                try:
                    plaintext = phone if not phone.startswith(_FERNET_CIPHER_PREFIX) else decrypt(phone)
                    phone_hash_value = hash_phone(plaintext)
                    conn.execute(
                        text("UPDATE users SET phone_hash = :h WHERE id = :id"),
                        {"h": phone_hash_value, "id": user_id},
                    )
                    updated += 1
                except Exception:  # noqa: BLE001
                    logger.exception("回填 phone_hash 失败 user_id=%s", user_id)
        last_id = rows[-1][0]

    if updated:
        logger.info("迁移：回填了 %d 条 phone_hash", updated)


def run_startup_migrations(engine: Engine) -> None:
    """执行所有启动时迁移（幂等）。"""
    try:
        add_token_version_column(engine)
        add_phone_hash_column(engine)
        encrypt_existing_phones(engine)
        populate_phone_hash(engine)
    except Exception:  # noqa: BLE001
        logger.exception("启动迁移失败")
        raise
