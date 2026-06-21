"""加密字符串类型，基于 Fernet 自动加解密.

写入数据库时自动加密，读取时自动解密，对 Service 层透明。
底层存储为 String，密文为 base64 编码的 Fernet token。
"""

from sqlalchemy import String, TypeDecorator


class EncryptedString(TypeDecorator):
    """加密字符串类型.

    继承 TypeDecorator，impl 用 String，cache_ok = True。
    写入时自动加密，读取时自动解密。
    """

    impl = String
    cache_ok = True

    def process_bind_param(self, value: str | None, dialect: object) -> str | None:  # noqa: ARG002
        """写入数据库时加密."""
        if value is None:
            return None
        from utils.crypto import encrypt

        return encrypt(value)

    def process_result_value(self, value: str | None, dialect: object) -> str | None:  # noqa: ARG002
        """从数据库读取时解密."""
        if value is None:
            return None
        from utils.crypto import decrypt

        return decrypt(value)
