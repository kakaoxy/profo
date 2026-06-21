"""敏感信息加解密工具（基于 Fernet 对称加密）.

密钥从环境变量 ENCRYPTION_KEY 读取（经 settings.encryption_key）。
密钥未配置时抛出明确错误（Fail Loud），禁止静默跳过。
"""

from cryptography.fernet import Fernet

from settings import settings

_KEY_NOT_CONFIGURED_MSG = (
    "ENCRYPTION_KEY 未配置：请在环境变量或 .env 中设置 ENCRYPTION_KEY"
    "（可通过 Fernet.generate_key() 生成）"
)


_fernet_instance: Fernet | None = None


def _get_fernet() -> Fernet:
    """获取 Fernet 实例（单例缓存）.

    Returns:
        Fernet: 已初始化的 Fernet 实例

    Raises:
        RuntimeError: ENCRYPTION_KEY 未配置时抛出（Fail Loud）

    """
    global _fernet_instance
    if _fernet_instance is not None:
        return _fernet_instance
    key = settings.encryption_key
    if not key:
        raise RuntimeError(_KEY_NOT_CONFIGURED_MSG)
    _fernet_instance = Fernet(key)
    return _fernet_instance


def encrypt(plaintext: str) -> str:
    """加密明文字符串.

    Args:
        plaintext: 待加密的明文

    Returns:
        base64 编码的 Fernet 密文字符串

    """
    fernet = _get_fernet()
    return fernet.encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt(ciphertext: str) -> str:
    """解密密文字符串.

    Args:
        ciphertext: base64 编码的 Fernet 密文

    Returns:
        解密后的明文

    """
    fernet = _get_fernet()
    return fernet.decrypt(ciphertext.encode("utf-8")).decode("utf-8")
