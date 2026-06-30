"""JWT 令牌相关工具函数."""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from jose import JWTError, jwt

from settings import settings

# Token 受众标识：用于隔离 C 端与后台两套系统的 Token
# C 端 Token (aud=c) 不可用于后台接口，反之亦然
AUDIENCE_C = "c"
AUDIENCE_ADMIN = "admin"


def create_access_token(
    data: dict[str, Any],
    expires_delta: timedelta | None = None,
    audience: str | None = None,
) -> str:
    """创建访问令牌.

    Args:
        data: 要存储在令牌中的数据
        expires_delta: 过期时间增量
        audience: 受众标识（"c" 或 "admin"），用于隔离两套系统 Token

    Returns:
        str: JWT访问令牌

    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_access_token_expire_minutes)

    to_encode.update({"exp": expire, "type": "access"})
    if audience is not None:
        to_encode["aud"] = audience
    return jwt.encode(
        to_encode,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def create_refresh_token(
    data: dict[str, Any],
    expires_delta: timedelta | None = None,
    audience: str | None = None,
    jti: str | None = None,
) -> tuple[str, str]:
    """创建刷新令牌.

    Args:
        data: 要存储在令牌中的数据
        expires_delta: 过期时间增量
        audience: 受众标识（"c" 或 "admin"），用于隔离两套系统 Token
        jti: JWT 唯一标识；不传则内部生成。用于 refresh_token 轮换：
            服务端跟踪 jti，刷新时撤销旧 jti 并签发新 jti。

    Returns:
        tuple[str, str]: (JWT刷新令牌, jti)

    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_token_expire_days)

    token_jti = jti or uuid.uuid4().hex
    to_encode.update({"exp": expire, "type": "refresh", "jti": token_jti})
    if audience is not None:
        to_encode["aud"] = audience
    token = jwt.encode(
        to_encode,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )
    return token, token_jti


def decode_token(token: str) -> dict[str, Any] | None:
    """解码JWT令牌（支持密钥轮换）.

    Args:
        token: JWT令牌

    Returns:
        Optional[Dict[str, Any]]: 令牌负载数据，如果解码失败则返回None

    Note:
        禁用 jose 内置 aud 校验（options.verify_aud=False），受众隔离由
        ``validate_token(audience=...)`` 显式比较，避免带 aud 的 Token 在未
        传 audience 时被 jose 直接拒绝。

    """
    # verify_aud=False：由 validate_token 负责 audience 比较
    decode_options = {"verify_aud": False}
    try:
        return jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            options=decode_options,
        )
    except JWTError:
        pass

    if settings.jwt_key_rotation_enabled and settings.jwt_secret_key_old:
        try:
            return jwt.decode(
                token,
                settings.jwt_secret_key_old,
                algorithms=[settings.jwt_algorithm],
                options=decode_options,
            )
        except JWTError:
            pass

    return None


def validate_token(
    token: str,
    token_type: Literal["access", "refresh"] = "access",  # noqa: S107
    audience: str | None = None,
) -> dict[str, Any] | None:
    """验证JWT令牌并检查令牌类型与受众.

    Args:
        token: JWT令牌
        token_type: 令牌类型，仅接受 "access" 或 "refresh"
        audience: 期望的受众标识；传入时 Token 中的 aud 必须匹配，否则视为无效。
            不传则不校验受众（向后兼容旧 Token）。

    Returns:
        Optional[Dict[str, Any]]: 令牌负载数据，如果验证失败则返回None

    """
    payload = decode_token(token)
    if not payload or payload.get("type") != token_type:
        return None

    if audience is not None:
        token_aud = payload.get("aud")
        # 受众不匹配（含一方缺失）即拒绝，避免两套系统 Token 互换
        if token_aud != audience:
            return None

    return payload
