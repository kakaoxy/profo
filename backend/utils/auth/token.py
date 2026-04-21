"""
JWT 令牌相关工具函数
"""
from datetime import datetime, timedelta, timezone
from typing import Optional, Any, Dict, Literal
from jose import JWTError, jwt
from settings import settings


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    创建访问令牌
    
    Args:
        data: 要存储在令牌中的数据
        expires_delta: 过期时间增量
        
    Returns:
        str: JWT访问令牌
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    
    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(
        to_encode, 
        settings.jwt_secret_key, 
        algorithm=settings.jwt_algorithm
    )
    return encoded_jwt


def create_refresh_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    创建刷新令牌
    
    Args:
        data: 要存储在令牌中的数据
        expires_delta: 过期时间增量
        
    Returns:
        str: JWT刷新令牌
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_token_expire_days)
    
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(
        to_encode, 
        settings.jwt_secret_key, 
        algorithm=settings.jwt_algorithm
    )
    return encoded_jwt


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    """
    解码JWT令牌（支持密钥轮换）
    
    Args:
        token: JWT令牌
        
    Returns:
        Optional[Dict[str, Any]]: 令牌负载数据，如果解码失败则返回None
    """
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm]
        )
        return payload
    except JWTError:
        pass
    
    if settings.jwt_key_rotation_enabled and settings.jwt_secret_key_old:
        try:
            payload = jwt.decode(
                token,
                settings.jwt_secret_key_old,
                algorithms=[settings.jwt_algorithm]
            )
            return payload
        except JWTError:
            pass
    
    return None


def validate_token(token: str, token_type: Literal["access", "refresh"] = "access") -> Optional[Dict[str, Any]]:
    """
    验证JWT令牌并检查令牌类型
    
    Args:
        token: JWT令牌
        token_type: 令牌类型，仅接受 "access" 或 "refresh"
        
    Returns:
        Optional[Dict[str, Any]]: 令牌负载数据，如果验证失败则返回None
    """
    payload = decode_token(token)
    if payload and payload.get("type") == token_type:
        return payload
    return None


def get_user_id_from_token(token: str) -> Optional[str]:
    """
    从令牌中获取用户ID
    
    Args:
        token: JWT令牌
        
    Returns:
        Optional[str]: 用户ID，如果令牌无效则返回None
    """
    payload = validate_token(token)
    if payload:
        return payload.get("sub")
    return None
