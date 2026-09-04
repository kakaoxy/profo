"""PostgreSQL 错误格式化工具测试.

覆盖：
- PG sqlstate 识别（pgcode = 23505/23503/23502）
- format_database_error 各分支返回中文友好信息

说明：通过构造带 pgcode 属性的 Exception 模拟 PG psycopg3 行为，
验证 _get_pgcode / _is_unique_violation / format_database_error 的分支逻辑。
"""

from sqlalchemy.exc import IntegrityError

from utils.error_formatters import (
    _is_unique_violation,
    format_database_error,
)


def _make_pg_integrity_error(pgcode: str, message: str = "duplicate key") -> IntegrityError:
    """构造带 pgcode 的 IntegrityError（模拟 PostgreSQL psycopg3 行为）.

    psycopg 驱动在 orig.pgcode 中暴露 sqlstate，此处用普通 Exception 加属性模拟。
    """
    orig = Exception(message)
    orig.pgcode = pgcode  # type: ignore[attr-defined]
    return IntegrityError("INSERT INTO t VALUES (1)", {}, orig)


def _make_plain_integrity_error(message: str) -> IntegrityError:
    """构造无 pgcode 的 IntegrityError（模拟未知错误）."""
    orig = Exception(message)
    return IntegrityError("INSERT INTO t VALUES (1)", {}, orig)


class TestIsUniqueViolation:
    """_is_unique_violation 通过 PG sqlstate 识别唯一约束冲突."""

    def test_is_unique_violation_pg_sqlstate(self) -> None:
        """PG sqlstate 23505 应识别为唯一约束冲突."""
        exc = _make_pg_integrity_error(pgcode="23505")
        assert _is_unique_violation(exc) is True

    def test_is_unique_violation_other_error(self) -> None:
        """普通非唯一约束异常不应被识别为唯一约束冲突."""
        exc = _make_plain_integrity_error("some other database error")
        assert _is_unique_violation(exc) is False


class TestFormatDatabaseError:
    """format_database_error 各 sqlstate 分支测试."""

    def test_format_database_error_pg_unique(self) -> None:
        """PG code 23505 → 唯一约束相关中文信息."""
        exc = _make_pg_integrity_error(
            pgcode="23505",
            message="duplicate key value violates unique constraint users_username_key",
        )
        result = format_database_error(exc)
        assert isinstance(result, str)
        # _format_unique_violation_message 返回的中文信息含「已存在」或「重复」
        assert "已存在" in result or "重复" in result

    def test_format_database_error_pg_fk(self) -> None:
        """PG code 23503 → 外键相关中文信息."""
        exc = _make_pg_integrity_error(
            pgcode="23503",
            message="insert or update on table violates foreign key constraint",
        )
        result = format_database_error(exc)
        assert "关联数据" in result

    def test_format_database_error_pg_not_null(self) -> None:
        """PG code 23502 → 非空相关中文信息."""
        exc = _make_pg_integrity_error(
            pgcode="23502",
            message="null value in column violates not-null constraint",
        )
        result = format_database_error(exc)
        assert "必填" in result or "不能为空" in result

    def test_format_database_error_unknown_integrity(self) -> None:
        """未知 IntegrityError → 通用数据完整性错误."""
        exc = _make_plain_integrity_error("some integrity error")
        result = format_database_error(exc)
        assert result == "数据完整性错误"
