"""
密码相关工具函数
"""
import re
import logging
from typing import Tuple
import bcrypt


logger = logging.getLogger(__name__)


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
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


def _truncate_password_safely(password: str, max_bytes: int = 72) -> str:
    """
    安全截断密码，确保不破坏 UTF-8 编码，并保证截断后的字节长度不超过限制。

    bcrypt 底层限制为 72 字节。某些 bcrypt 后端在初始化时会用固定长度的测试密码
    做功能检测；如果截断逻辑仅按字符截断但字节长度仍超过 72，检测阶段就会抛出
    ValueError。因此本函数必须保证返回值的字节长度严格 <= max_bytes。

    Args:
        password: 原始密码
        max_bytes: 最大字节数（bcrypt 限制为 72）

    Returns:
        str: 截断后的密码，其 UTF-8 字节长度一定不超过 max_bytes
    """
    password_bytes = password.encode('utf-8')

    if len(password_bytes) <= max_bytes:
        return password

    truncated_bytes = password_bytes[:max_bytes]

    try:
        decoded = truncated_bytes.decode('utf-8')
        if len(decoded.encode('utf-8')) <= max_bytes:
            return decoded
    except UnicodeDecodeError:
        pass

    for i in range(max_bytes - 1, max_bytes - 4, -1):
        if i < 0:
            break
        try:
            decoded = password_bytes[:i].decode('utf-8')
            if len(decoded.encode('utf-8')) <= max_bytes:
                logger.warning(f"密码长度超过{max_bytes}字节限制，已安全截断至{i}字节")
                return decoded
        except UnicodeDecodeError:
            continue

    logger.warning(f"密码截断时遇到编码问题，使用忽略模式处理")
    result = truncated_bytes.decode('utf-8', 'ignore')
    while len(result.encode('utf-8')) > max_bytes and result:
        result = result[:-1]
    return result


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
    
    password = _truncate_password_safely(password)
    
    try:
        hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
        return hashed.decode('utf-8')
    except Exception as e:
        error_msg = str(e)
        logger.critical(f"密码哈希生成过程中发生严重错误：{error_msg}")
        raise RuntimeError(f"密码哈希生成失败，请联系系统管理员。错误详情：{error_msg}")
