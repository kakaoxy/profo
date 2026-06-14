"""API Key 服务层.

处理 API Key 的生成、验证和管理.
"""

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from models import ApiKey, User
from settings import settings

from .exceptions import AuthenticationError, ResourceNotFoundError, ServiceException

_API_KEY_GEN_FAILED = "API Key生成失败，请稍后重试"

logger = logging.getLogger(__name__)

_API_KEY_PART_COUNT = 3


class ApiKeyService:
    """API Key 服务."""

    @staticmethod
    def _hash_key(key: str) -> str:
        """使用 SHA-256 哈希 Key."""
        return hashlib.sha256(key.encode()).hexdigest()

    @staticmethod
    def _generate_key_string() -> tuple[str, str]:
        """生成 API Key 字符串.

        格式: profo_<8位前缀>_<32位随机字符串>
        返回: (完整 Key, 前缀).
        """
        prefix = secrets.token_hex(4)
        random_part = secrets.token_hex(16)
        key = f"profo_{prefix}_{random_part}"
        return key, prefix

    @staticmethod
    def generate_api_key(
        db: Session,
        user_id: str,
        expires_days: int | None = None,
    ) -> tuple[str, ApiKey]:
        """为用户生成新的 API Key.

        每个用户只能有一个有效 Key，生成新 Key 会自动撤销旧 Key.

        Args:
            db: 数据库会话
            user_id: 用户ID
            expires_days: Key 过期天数，None 表示永不过期

        Returns:
            tuple: (明文 Key, ApiKey 模型对象)

        Raises:
            ConflictError: 用户已有有效 Key

        """
        try:
            existing_key = (
                db.query(ApiKey)
                .filter(
                    ApiKey.user_id == user_id,
                    ApiKey.status == "active",
                    ApiKey.deleted_at.is_(None),
                )
                .first()
            )

            if existing_key:
                existing_key.revoke()

            key_string, prefix = ApiKeyService._generate_key_string()
            key_hash = ApiKeyService._hash_key(key_string)

            expires_at = None
            if expires_days:
                expires_at = datetime.now(timezone.utc) + timedelta(days=expires_days)

            api_key = ApiKey(
                user_id=user_id,
                key_prefix=prefix,
                key_hash=key_hash,
                status="active",
                expires_at=expires_at,
            )

            db.add(api_key)
            db.commit()
            db.refresh(api_key)
        except SQLAlchemyError as e:
            db.rollback()
            if settings.debug:
                logger.exception("API Key生成失败")
            raise ServiceException(_API_KEY_GEN_FAILED) from e
        else:
            return key_string, api_key

    @staticmethod
    def get_api_key_info(db: Session, user_id: str) -> ApiKey | None:
        """获取用户的 API Key 信息.

        Args:
            db: 数据库会话
            user_id: 用户ID

        Returns:
            ApiKey 对象或 None

        """
        return (
            db.query(ApiKey)
            .filter(
                ApiKey.user_id == user_id,
                ApiKey.status == "active",
                ApiKey.deleted_at.is_(None),
            )
            .first()
        )

    @staticmethod
    def revoke_api_key(db: Session, user_id: str) -> None:
        """撤销用户的 API Key（软删除）.

        Args:
            db: 数据库会话
            user_id: 用户ID

        Raises:
            ResourceNotFoundError: 用户没有有效的 API Key
            ServiceException: 数据库操作失败

        """
        try:
            api_key = (
                db.query(ApiKey)
                .filter(
                    ApiKey.user_id == user_id,
                    ApiKey.status == "active",
                    ApiKey.deleted_at.is_(None),
                )
                .first()
            )

            if not api_key:
                msg = "没有找到有效的 API Key"
                raise ResourceNotFoundError(msg)

            api_key.revoke()
            db.commit()
            db.refresh(api_key)
        except SQLAlchemyError as e:
            db.rollback()
            if settings.debug:
                logger.exception("API Key撤销失败")
            raise ServiceException(_API_KEY_GEN_FAILED) from e

    @staticmethod
    def authenticate_by_api_key(db: Session, api_key: str) -> User:
        """通过 API Key 认证用户.

        注意：调用方需要自行提交事务以更新最后使用时间.

        Args:
            db: 数据库会话
            api_key: 明文 API Key

        Returns:
            User 对象

        Raises:
            AuthenticationError: Key 无效或已过期

        """
        parts = api_key.split("_")
        if len(parts) != _API_KEY_PART_COUNT or parts[0] != "profo":
            msg = "API Key 格式无效"
            raise AuthenticationError(msg)

        prefix = parts[1]
        key_hash = ApiKeyService._hash_key(api_key)

        key_record = (
            db.query(ApiKey)
            .filter(
                ApiKey.key_prefix == prefix,
                ApiKey.key_hash == key_hash,
                ApiKey.status == "active",
                ApiKey.deleted_at.is_(None),
            )
            .first()
        )

        if not key_record:
            msg = "API Key 无效"
            raise AuthenticationError(msg)

        if key_record.expires_at and key_record.expires_at < datetime.now(timezone.utc):
            msg = "API Key 已过期"
            raise AuthenticationError(msg)

        key_record.mark_used()

        user = (
            db.query(User)
            .options(joinedload(User.role))
            .filter(
                User.id == key_record.user_id,
                User.status == "active",
            )
            .first()
        )

        if not user:
            msg = "用户不存在或已被禁用"
            raise AuthenticationError(msg)

        return user


api_key_service = ApiKeyService()
