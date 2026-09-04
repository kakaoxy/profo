"""PostgreSQL 兼容性测试：EncryptedString 类型.

覆盖 Task 3 修复点：
- impl 为 Text（无长度限制），不透传 length 给底层 String impl
- DDL 编译为 TEXT 而非 VARCHAR(N)
- 长密文写入/读回 roundtrip（Fernet 密文远长于明文，VARCHAR 会触发 'value too long'）
"""

import pytest
from sqlalchemy import Column, MetaData, String, Table, Text
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from models.common.encrypted import EncryptedString


class TestEncryptedStringType:
    """EncryptedString 类型定义与 DDL 测试."""

    def test_encrypted_string_impl_is_text(self) -> None:
        """Impl 应为 Text（无长度限制，适配 Fernet base64 密文）."""
        assert EncryptedString.impl is Text

    def test_encrypted_string_length_not_passed_to_impl(self) -> None:
        """Length 仅作为 plaintext_length 元数据，不透传给底层 Text impl."""
        es = EncryptedString(20)
        assert es.plaintext_length == 20
        # 编译 DDL 不应出现 VARCHAR(20)
        ddl = es.compile(dialect=postgresql.dialect())
        assert "VARCHAR" not in ddl.upper()
        assert "(20)" not in ddl

    def test_encrypted_string_ddl_is_text(self) -> None:
        """PostgreSQL 方言下 DDL 应为 TEXT."""
        col = Column("secret", EncryptedString(20))
        ddl = col.type.compile(dialect=postgresql.dialect())
        assert ddl == "TEXT"


class TestEncryptedStringRoundtrip:
    """EncryptedString 加解密往返测试."""

    def test_encrypted_string_process_bind_encrypts(self) -> None:
        """process_bind_param 应返回 Fernet 密文（非明文）."""
        es = EncryptedString(20)
        plaintext = "short"
        ciphertext = es.process_bind_param(plaintext, dialect=None)
        assert ciphertext is not None
        assert ciphertext != plaintext
        # Fernet 密文以 gAAAAA 开头
        assert ciphertext.startswith("gAAAAA")

    def test_encrypted_string_process_result_decrypts(self) -> None:
        """process_result_value 应解密回明文."""
        es = EncryptedString(20)
        plaintext = "hello world"
        ciphertext = es.process_bind_param(plaintext, dialect=None)
        decrypted = es.process_result_value(ciphertext, dialect=None)
        assert decrypted == plaintext

    def test_encrypted_string_long_ciphertext_roundtrip(self) -> None:
        """长明文加密后解密应正确返回（无长度限制时）."""
        es = EncryptedString()  # 不限制明文长度
        long_plaintext = "x" * 140
        ciphertext = es.process_bind_param(long_plaintext, dialect=None)
        assert len(ciphertext) > 20, "Fernet 密文应远长于明文"
        decrypted = es.process_result_value(ciphertext, dialect=None)
        assert decrypted == long_plaintext

    def test_encrypted_string_db_roundtrip(self, db_session: Session) -> None:
        """长密文写入 TEXT 列并读回，不触发 'value too long' 错误."""
        engine = db_session.bind
        metadata = MetaData()
        test_table = Table(
            "_test_encrypted_rt",
            metadata,
            Column("id", String(36), primary_key=True),
            Column("secret", EncryptedString()),  # 不限制明文长度
        )
        metadata.create_all(bind=engine, tables=[test_table])

        try:
            long_plaintext = "x" * 140
            db_session.execute(test_table.insert().values(id="rt-1", secret=long_plaintext))
            db_session.commit()

            row = db_session.execute(
                test_table.select().where(test_table.c.id == "rt-1"),
            ).fetchone()
            assert row is not None
            # EncryptedString 在读取时自动解密
            assert row.secret == long_plaintext
        finally:
            metadata.drop_all(bind=engine, tables=[test_table])


class TestEncryptedStringLengthValidation:
    """EncryptedString 明文长度校验测试."""

    def test_within_length_limit_passes(self) -> None:
        """明文长度等于限制时应通过."""
        es = EncryptedString(20)
        ciphertext = es.process_bind_param("a" * 20, dialect=None)
        assert ciphertext.startswith("gAAAAA")

    def test_exceeds_length_limit_raises(self) -> None:
        """明文超过 plaintext_length 应抛 ValueError."""
        es = EncryptedString(20)

        with pytest.raises(ValueError, match="明文长度"):
            es.process_bind_param("a" * 21, dialect=None)

    def test_no_length_limit_never_raises(self) -> None:
        """未设置 plaintext_length 时不校验."""
        es = EncryptedString()
        ciphertext = es.process_bind_param("a" * 1000, dialect=None)
        assert ciphertext.startswith("gAAAAA")

    def test_none_value_skips_validation(self) -> None:
        """None 值应跳过校验直接返回."""
        es = EncryptedString(20)
        assert es.process_bind_param(None, dialect=None) is None
