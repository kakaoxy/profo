"""加密字符串类型，基于 Fernet 自动加解密.

写入数据库时自动加密，读取时自动解密，对 Service 层透明。
底层存储为 Text，密文为 base64 编码的 Fernet token（远长于明文）。
"""

from sqlalchemy import Text, TypeDecorator


class EncryptedString(TypeDecorator):
    """加密字符串类型.

    继承 TypeDecorator，impl 用 Text（无长度限制，适配 Fernet 密文），cache_ok = True。
    写入时自动加密，读取时自动解密。

    构造时传入的 length 仅作为明文长度元数据（self.plaintext_length）保存，
    不透传给底层 Text impl——Fernet 密文为 base64 编码，长度远超明文，
    若透传给 String(length) 会在 PostgreSQL 上生成 VARCHAR(length) 并在
    INSERT 时触发 "value too long for type character varying(N)"。
    """

    impl = Text
    cache_ok = True

    def __init__(self, length: int | None = None) -> None:
        """初始化加密字符串类型.

        :param length: 明文长度限制（仅作为元数据存储，不透传给底层 Text impl）。
        """
        super().__init__()
        self.plaintext_length = length

    def process_bind_param(self, value: str | None, dialect: object) -> str | None:  # noqa: ARG002
        """写入数据库时加密.

        若 ``self.plaintext_length`` 不为 None，加密前校验明文长度，
        超长时抛 ``ValueError`` 阻止写入。
        """
        if value is None:
            return None
        if self.plaintext_length is not None and len(value) > self.plaintext_length:
            msg = (
                f"明文长度 {len(value)} 超过限制 {self.plaintext_length}"
            )
            raise ValueError(msg)
        from utils.crypto import encrypt

        return encrypt(value)

    def process_result_value(self, value: str | None, dialect: object) -> str | None:  # noqa: ARG002
        """从数据库读取时解密."""
        if value is None or value == "":
            return None
        from utils.crypto import decrypt

        return decrypt(value)
