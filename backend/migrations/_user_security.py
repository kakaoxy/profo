"""用户安全相关迁移.

包含 users 表的 token_version / phone_hash 列添加、明文手机号加密与 phone_hash 回填，
以及微信登录合并所需的临时账号字段（is_temporary / merged_to_user_id）。
对应迁移清单 H-002 / H-006 / 微信登录合并增强。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations._helpers import _FERNET_CIPHER_PREFIX, _MIGRATION_BATCH_SIZE, _column_exists, _index_exists
from utils.crypto import decrypt, encrypt, hash_phone

logger = logging.getLogger(__name__)


def add_token_version_column(engine: Engine) -> None:
    """为 users 表添加 token_version INTEGER NOT NULL DEFAULT 1（幂等）."""
    if _column_exists(engine, "users", "token_version"):
        return
    logger.info("迁移：为 users 表添加 token_version 列")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1"))


def add_phone_hash_column(engine: Engine) -> None:
    """为 users 表添加 phone_hash 列及唯一索引（H-006）。.

    Fernet 加密随机 IV 导致 phone 列无法维持唯一性，新增 phone_hash 列承载唯一约束。
    """
    if not _column_exists(engine, "users", "phone_hash"):
        logger.info("迁移：为 users 表添加 phone_hash 列")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN phone_hash VARCHAR(64)"))

    if not _index_exists(engine, "idx_users_phone_hash"):
        logger.info("迁移：创建 phone_hash 唯一索引")
        with engine.begin() as conn:
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_hash ON users(phone_hash)"))


def encrypt_existing_phones(engine: Engine) -> None:
    """将 users 表中明文手机号加密为 Fernet 密文。.

    判定规则：Fernet 密文以 'gAAAAA' 开头；不以该前缀开头视为明文并加密。
    幂等：已是密文则跳过。
    使用基于 id 的游标分页，避免大数据量下 fetchall 导致 OOM。
    每批次独立提交，避免单个大事务。

    Fail Loud (B2)：单条记录加密失败不阻断整体迁移（记录异常 + failed 计数），
    但全部批次结束后若有失败，汇总告警（warning 级）便于运维定位。

    """
    updated = 0
    failed = 0  # B2: 追踪失败计数，结束时汇总告警
    last_id = ""  # users.id 为 varchar(uuid)，游标分页用空串起步
    while True:
        with engine.begin() as conn:
            rows = conn.execute(
                text(
                    "SELECT id, phone FROM users "
                    "WHERE phone IS NOT NULL AND id > :last_id "
                    "ORDER BY id LIMIT :batch_size",
                ),
                {"last_id": last_id, "batch_size": _MIGRATION_BATCH_SIZE},
            ).fetchall()
            if not rows:
                break

            for row in rows:
                user_id, phone = row[0], row[1]
                if not phone:
                    # 空值统一清洗为 NULL
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
                except Exception:
                    failed += 1
                    logger.exception("加密用户手机号失败 user_id=%s", user_id)
        last_id = rows[-1][0]

    if updated:
        logger.info("迁移：加密了 %d 条明文手机号", updated)
    if failed:
        logger.warning("迁移：加密手机号时 %d 条记录失败，请检查日志", failed)


def populate_phone_hash(engine: Engine) -> None:
    """为已存用户回填 phone_hash（基于解密后的明文手机号）。.

    必须在 encrypt_existing_phones 之后执行。
    使用基于 id 的游标分页，避免大数据量下 fetchall 导致 OOM。
    每批次独立提交，避免单个大事务。

    Fail Loud (B2)：单条记录回填失败不阻断整体迁移（记录异常 + failed 计数），
    但全部批次结束后若有失败，汇总告警（warning 级）便于运维定位。

    """
    updated = 0
    failed = 0  # B2: 追踪失败计数，结束时汇总告警
    last_id = ""  # users.id 为 varchar(uuid)，游标分页用空串起步
    while True:
        with engine.begin() as conn:
            rows = conn.execute(
                text(
                    "SELECT id, phone FROM users "
                    "WHERE phone IS NOT NULL AND phone_hash IS NULL AND id > :last_id "
                    "ORDER BY id LIMIT :batch_size",
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
                except Exception:
                    failed += 1
                    logger.exception("回填 phone_hash 失败 user_id=%s", user_id)
        last_id = rows[-1][0]

    if updated:
        logger.info("迁移：回填了 %d 条 phone_hash", updated)
    if failed:
        logger.warning("迁移：回填 phone_hash 时 %d 条记录失败，请检查日志", failed)


def add_user_temporary_fields(engine: Engine) -> None:
    """为 users 表添加临时账号字段 is_temporary / merged_to_user_id 及索引（幂等）.

    微信登录合并增强：新用户首次微信登录创建为临时账号（is_temporary=True），
    绑定主账号后通过 merged_to_user_id 记录合并目标，并迁移业务数据。
    """
    if not _column_exists(engine, "users", "is_temporary"):
        logger.info("迁移：为 users 表添加 is_temporary 列")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN is_temporary BOOLEAN NOT NULL DEFAULT FALSE"))

    if not _column_exists(engine, "users", "merged_to_user_id"):
        logger.info("迁移：为 users 表添加 merged_to_user_id 列")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN merged_to_user_id VARCHAR(36)"))

    if not _index_exists(engine, "idx_user_temporary"):
        logger.info("迁移：创建 idx_user_temporary 索引")
        with engine.begin() as conn:
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_user_temporary ON users(is_temporary)"))

    if not _index_exists(engine, "idx_user_merged_to"):
        # merged_to_user_id 用于微信登录合并重定向查询（_resolve_merged_target），
        # 临时账号命中后跟随该字段解析目标主账号，加索引避免全表扫描
        logger.info("迁移：创建 idx_user_merged_to 索引")
        with engine.begin() as conn:
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_user_merged_to ON users(merged_to_user_id)"))
