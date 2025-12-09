"""
认证相关工具函数
"""
import re
import logging
from datetime import datetime, timedelta
from typing import Optional, Any, Dict, Tuple, Literal
from jose import JWTError, jwt
from passlib.context import CryptContext

from settings import settings


# 配置日志记录
logger = logging.getLogger(__name__)

# 密码上下文，用于密码哈希和验证
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def validate_password_strength(password: str) -> Tuple[bool, str]:
    """
    验证密码强度
    
    密码策略:
    - 长度至少8个字符
    - 必须包含至少一个大写字母
    - 必须包含至少一个小写字母
    - 必须包含至少一个数字
    - 必须包含至少一个特殊字符
    
    Args:
        password: 待验证的密码
        
    Returns:
        Tuple[bool, str]: (是否通过验证, 错误信息)
        - 通过时返回 (True, "")
        - 失败时返回 (False, "具体错误原因")
    """
    if not isinstance(password, str):
        return False, "密码必须是字符串类型"
    
    if len(password) < 8:
        return False, "密码长度必须至少为8个字符"
    
    if not re.search(r"[A-Z]", password):
        return False, "密码必须包含至少一个大写字母"
    
    if not re.search(r"[a-z]", password):
        return False, "密码必须包含至少一个小写字母"
    
    if not re.search(r"\d", password):
        return False, "密码必须包含至少一个数字"
    
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return False, "密码必须包含至少一个特殊字符 (!@#$%^&*(),.?\":{}|<>)"
    
    return True, ""


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    验证密码是否匹配
    
    Args:
        plain_password: 明文密码
        hashed_password: 哈希密码
        
    Returns:
        bool: 密码是否匹配
    """
    return pwd_context.verify(plain_password, hashed_password)


def _truncate_password_safely(password: str, max_bytes: int = 72) -> str:
    """
    安全截断密码，确保不破坏 UTF-8 编码
    
    Args:
        password: 原始密码
        max_bytes: 最大字节数（bcrypt 限制为 72）
        
    Returns:
        str: 截断后的密码
    """
    password_bytes = password.encode('utf-8')
    
    if len(password_bytes) <= max_bytes:
        return password
    
    # 从 max_bytes 位置向前查找有效的 UTF-8 边界
    truncated_bytes = password_bytes[:max_bytes]
    
    # 尝试直接解码
    try:
        return truncated_bytes.decode('utf-8')
    except UnicodeDecodeError:
        pass
    
    # 向前查找有效的 UTF-8 字符边界（UTF-8 最多 4 字节）
    for i in range(max_bytes - 1, max_bytes - 4, -1):
        try:
            result = password_bytes[:i].decode('utf-8')
            logger.warning(f"密码长度超过{max_bytes}字节限制，已安全截断至{i}字节")
            return result
        except UnicodeDecodeError:
            continue
    
    # 最后的回退：使用 errors='ignore' 模式
    logger.warning(f"密码截断时遇到编码问题，使用忽略模式处理")
    return truncated_bytes.decode('utf-8', 'ignore')


def get_password_hash(password: str) -> str:
    """
    生成密码哈希
    
    注意：此函数不进行密码强度验证，调用方应先使用 validate_password_strength() 验证。
    
    Args:
        password: 明文密码
        
    Returns:
        str: 安全的 bcrypt 哈希密码
        
    Raises:
        ValueError: 密码格式无效
        RuntimeError: 哈希生成过程中发生严重错误
    """
    if not isinstance(password, str):
        raise ValueError("密码必须是字符串类型")
    
    # 安全截断超长密码（bcrypt 72 字节限制）
    password = _truncate_password_safely(password)
    
    try:
        return pwd_context.hash(password)
    except ValueError as e:
        error_msg = str(e)
        logger.error(f"密码哈希生成失败：{error_msg}")
        raise ValueError(f"密码哈希生成失败：{error_msg}")
    except Exception as e:
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

