"""
认证相关工具函数
"""
import re
from datetime import datetime, timedelta
from typing import Optional, Any, Dict
from jose import JWTError, jwt
from passlib.context import CryptContext

from settings import settings


# 密码上下文，用于密码哈希和验证
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    验证密码是否匹配
    
    Args:
        plain_password: 明文密码
        hashed_password: 哈希密码
        
    Returns:
        bool: 密码是否匹配
    """
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except ValueError:
        # Fallback for invalid hash formats
        return False


import logging

# 配置日志记录
logger = logging.getLogger(__name__)

def get_password_hash(password: str) -> str:
    """
    生成密码哈希（生产环境优化版）
    
    Args:
        password: 明文密码
        
    Returns:
        str: 安全的bcrypt哈希密码
    
    Raises:
        ValueError: 密码格式无效或长度超出限制
    """
    if not isinstance(password, str):
        raise ValueError("密码必须是字符串类型")
    
    # 密码策略验证
    if len(password) < 8:
        raise ValueError("密码长度必须至少为8个字符")
    
    if not re.search(r"[A-Z]", password):
        raise ValueError("密码必须包含至少一个大写字母")
    
    if not re.search(r"[a-z]", password):
        raise ValueError("密码必须包含至少一个小写字母")
    
    if not re.search(r"\d", password):
        raise ValueError("密码必须包含至少一个数字")
    
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        raise ValueError("密码必须包含至少一个特殊字符 (!@#$%^&*(),.?\":{}|<>)")
    
    # Bcrypt has a 72-byte limit for passwords, truncate if necessary
    # 确保密码在utf-8编码后不超过72字节
    max_length = 72
    password_bytes = password.encode('utf-8')
    
    # 安全截断密码，确保不超过72字节
    if len(password_bytes) > max_length:
        # 截断到72字节，确保不会破坏UTF-8字符
        # 从后往前找到有效的UTF-8字符边界
        truncated_bytes = password_bytes[:max_length]
        try:
            password = truncated_bytes.decode('utf-8')
        except UnicodeDecodeError:
            # 如果截断位置在多字节字符中间，继续向前截断直到找到有效边界
            for i in range(max_length - 1, max_length - 4, -1):
                try:
                    password = password_bytes[:i].decode('utf-8')
                    break
                except UnicodeDecodeError:
                    continue
            else:
                # 如果还是失败，强制使用ignore模式
                password = truncated_bytes.decode('utf-8', 'ignore')
        
        logger.warning(f"密码长度超过72字节限制，已安全截断至{len(password.encode('utf-8'))}字节")
    
    try:
        # 生成bcrypt哈希，使用默认工作因子
        hashed_password = pwd_context.hash(password)
        logger.info("密码哈希生成成功")
        return hashed_password
    except ValueError as e:
        # 捕获bcrypt相关错误，提供友好的错误信息
        error_msg = str(e)
        if "password cannot be longer than 72 bytes" in error_msg:
            logger.error(f"密码哈希生成失败：密码超过72字节限制（长度：{len(password.encode('utf-8'))}字节）")
            raise ValueError(f"密码过长，请使用更短的密码（当前：{len(password.encode('utf-8'))}字节，最大：72字节）")
        logger.error(f"密码哈希生成失败：{error_msg}")
        raise ValueError(f"密码哈希生成失败：{error_msg}")
    except Exception as e:
        # 捕获更广泛的异常，确保系统稳定性
        logger.critical(f"密码哈希生成过程中发生严重错误：{str(e)}")
        raise RuntimeError(f"密码哈希生成失败，请联系系统管理员。错误详情：{str(e)}")


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
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    
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
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=settings.jwt_refresh_token_expire_days)
    
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
    # 首先尝试使用当前密钥解码
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm]
        )
        return payload
    except JWTError:
        pass
    
    # 如果启用了密钥轮换且旧密钥存在，尝试使用旧密钥解码
    if settings.jwt_key_rotation_enabled and settings.jwt_secret_key_old:
        try:
            payload = jwt.decode(
                token,
                settings.jwt_secret_key_old,
                algorithms=[settings.jwt_algorithm]
            )
            # 记录使用旧密钥成功解码的日志（可用于监控密钥轮换进度）
            logger.info("使用旧JWT密钥成功解码令牌")
            return payload
        except JWTError:
            pass
    
    return None


def validate_token(token: str, token_type: str = "access") -> Optional[Dict[str, Any]]:
    """
    验证JWT令牌并检查令牌类型
    
    Args:
        token: JWT令牌
        token_type: 令牌类型（access或refresh）
        
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
