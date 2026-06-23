"""错误信息格式化工具单元测试."""

from unittest.mock import patch

import pytest
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.exc import DataError, IntegrityError, OperationalError, SQLAlchemyError

from utils.error_formatters import (
    format_database_error,
    format_request_validation_error,
    format_validation_error,
)


# ---------------------------------------------------------------------------
# format_validation_error
# ---------------------------------------------------------------------------


class _SampleModel(BaseModel):
    name: str
    age: int
    score: float
    active: bool
    count: int = Field(gt=0)
    ratio: float = Field(lt=100)


class TestFormatValidationError:
    """format_validation_error 测试.

    注意：源码用 'type_error'/'value_error' 等旧版 Pydantic V1 错误类型做匹配，
    Pydantic V2 产生的是 'int_parsing'/'greater_than' 等新类型，
    因此大部分场景会走兜底 else 分支。
    通过 mock errors() 返回值来测试 V1 风格的分支逻辑。
    """

    def test_missing_field(self):
        """missing 类型在 V1/V2 中一致，能正确匹配."""
        with pytest.raises(ValidationError) as exc_info:
            _SampleModel(age=1, score=1.0, active=True, count=1, ratio=1.0)  # type: ignore[call-arg]
        result = format_validation_error(exc_info.value)
        assert "缺少必填字段" in result
        assert "name" in result

    def test_int_parsing_falls_to_else(self):
        """V2 的 int_parsing 不匹配 'type_error'，走兜底分支."""
        with pytest.raises(ValidationError) as exc_info:
            _SampleModel(name="x", age="not_int", score=1.0, active=True, count=1, ratio=1.0)  # type: ignore[arg-type]
        result = format_validation_error(exc_info.value)
        assert "age" in result
        assert "字段 age:" in result

    def test_float_parsing_falls_to_else(self):
        """V2 的 float_parsing 不匹配 'type_error'，走兜底分支."""
        with pytest.raises(ValidationError) as exc_info:
            _SampleModel(name="x", age=1, score="not_float", active=True, count=1, ratio=1.0)  # type: ignore[arg-type]
        result = format_validation_error(exc_info.value)
        assert "score" in result
        assert "字段 score:" in result

    def test_bool_parsing_falls_to_else(self):
        """V2 的 bool_parsing 不匹配 'type_error'，走兜底分支."""
        with pytest.raises(ValidationError) as exc_info:
            _SampleModel(name="x", age=1, score=1.0, active="not_bool", count=1, ratio=1.0)  # type: ignore[arg-type]
        result = format_validation_error(exc_info.value)
        assert "active" in result
        assert "字段 active:" in result

    def test_greater_than_falls_to_else(self):
        """V2 的 greater_than 不匹配 'value_error'，走兜底分支."""
        with pytest.raises(ValidationError) as exc_info:
            _SampleModel(name="x", age=1, score=1.0, active=True, count=0, ratio=1.0)
        result = format_validation_error(exc_info.value)
        assert "count" in result
        assert "字段 count:" in result

    def test_less_than_falls_to_else(self):
        """V2 的 less_than 不匹配 'value_error'，走兜底分支."""
        with pytest.raises(ValidationError) as exc_info:
            _SampleModel(name="x", age=1, score=1.0, active=True, count=1, ratio=200.0)
        result = format_validation_error(exc_info.value)
        assert "ratio" in result
        assert "字段 ratio:" in result

    def test_pattern_mismatch_falls_to_else(self):
        """V2 的 string_pattern_mismatch 不匹配任何已知分支，走兜底."""

        class _CustomModel(BaseModel):
            tag: str = Field(pattern=r"^[A-Z]+$")

        with pytest.raises(ValidationError) as exc_info:
            _CustomModel(tag="abc")
        result = format_validation_error(exc_info.value)
        assert "tag" in result
        assert "字段 tag:" in result

    def test_multiple_errors_joined(self):
        """多条错误用 '; ' 连接."""
        with pytest.raises(ValidationError) as exc_info:
            _SampleModel(age="bad", score="bad", active="bad", count=-1, ratio=200.0)  # type: ignore[arg-type]
        result = format_validation_error(exc_info.value)
        assert "; " in result

    def test_empty_loc_uses_unknown(self):
        """loc 为空元组时字段名回退到 'unknown'."""
        error = ValidationError.from_exception_data(
            title="Test",
            line_errors=[
                {
                    "type": "missing",
                    "loc": (),
                    "input": None,
                    "ctx": {},
                },
            ],
        )
        result = format_validation_error(error)
        assert "unknown" in result

    def test_fallback_else_branch(self):
        """不匹配任何已知类型时走兜底 else 分支."""
        error = ValidationError.from_exception_data(
            title="Test",
            line_errors=[
                {
                    "type": "extra_forbidden",
                    "loc": ("field_x",),
                    "input": None,
                    "ctx": {},
                },
            ],
        )
        result = format_validation_error(error)
        assert "field_x" in result

    # --- 通过 mock 测试 V1 风格分支 ---

    def test_type_error_int_branch(self):
        """int_parsing/int_type → 整数分支."""
        error = ValidationError.from_exception_data(
            title="Test",
            line_errors=[{"type": "missing", "loc": ("age",), "input": None, "ctx": {}}],
        )
        with patch.object(error, "errors", return_value=[
            {"loc": ("age",), "msg": "bad", "type": "int_parsing"},
        ]):
            result = format_validation_error(error)
        assert "age" in result
        assert "整数" in result

    def test_type_error_float_branch(self):
        """float_parsing/float_type → 数字分支."""
        error = ValidationError.from_exception_data(
            title="Test",
            line_errors=[{"type": "missing", "loc": ("score",), "input": None, "ctx": {}}],
        )
        with patch.object(error, "errors", return_value=[
            {"loc": ("score",), "msg": "bad", "type": "float_parsing"},
        ]):
            result = format_validation_error(error)
        assert "score" in result
        assert "数字" in result

    def test_type_error_bool_branch(self):
        """bool_parsing/bool_type → 布尔值分支."""
        error = ValidationError.from_exception_data(
            title="Test",
            line_errors=[{"type": "missing", "loc": ("active",), "input": None, "ctx": {}}],
        )
        with patch.object(error, "errors", return_value=[
            {"loc": ("active",), "msg": "bad", "type": "bool_parsing"},
        ]):
            result = format_validation_error(error)
        assert "active" in result
        assert "布尔值" in result

    def test_type_error_other_branch(self):
        """不匹配任何已知类型时走兜底 else 分支."""
        error = ValidationError.from_exception_data(
            title="Test",
            line_errors=[{"type": "missing", "loc": ("meta",), "input": None, "ctx": {}}],
        )
        with patch.object(error, "errors", return_value=[
            {"loc": ("meta",), "msg": "bad", "type": "some_unknown_type"},
        ]):
            result = format_validation_error(error)
        assert "meta" in result
        assert "字段 meta: bad" in result

    def test_value_error_greater_than_branch(self):
        """greater_than 类型 → 大于0分支."""
        error = ValidationError.from_exception_data(
            title="Test",
            line_errors=[{"type": "missing", "loc": ("count",), "input": None, "ctx": {}}],
        )
        with patch.object(error, "errors", return_value=[
            {"loc": ("count",), "msg": "Input should be greater than 0", "type": "greater_than"},
        ]):
            result = format_validation_error(error)
        assert "count" in result
        assert "大于 0" in result

    def test_value_error_less_than_branch(self):
        """less_than 类型 → 超出范围分支."""
        error = ValidationError.from_exception_data(
            title="Test",
            line_errors=[{"type": "missing", "loc": ("ratio",), "input": None, "ctx": {}}],
        )
        with patch.object(error, "errors", return_value=[
            {"loc": ("ratio",), "msg": "Input should be less than 100", "type": "less_than"},
        ]):
            result = format_validation_error(error)
        assert "ratio" in result
        assert "超出允许范围" in result

    def test_value_error_generic_branch(self):
        """value_error + msg 不含 greater_than/less_than → 值无效分支."""
        error = ValidationError.from_exception_data(
            title="Test",
            line_errors=[{"type": "missing", "loc": ("tag",), "input": None, "ctx": {}}],
        )
        with patch.object(error, "errors", return_value=[
            {"loc": ("tag",), "msg": "invalid pattern", "type": "value_error"},
        ]):
            result = format_validation_error(error)
        assert "tag" in result
        assert "值无效" in result


# ---------------------------------------------------------------------------
# format_request_validation_error
# ---------------------------------------------------------------------------


class TestFormatRequestValidationError:
    """format_request_validation_error 测试."""

    @staticmethod
    def _make_error(error_type: str, loc: tuple, msg: str = "bad") -> RequestValidationError:
        """构造一个 RequestValidationError 用于测试."""
        return RequestValidationError(
            errors=[
                {
                    "type": error_type,
                    "loc": loc,
                    "msg": msg,
                    "input": None,
                },
            ],
        )

    def test_missing_field(self):
        err = self._make_error("missing", ("query", "page"))
        result = format_request_validation_error(err)
        assert "缺少必填参数" in result
        assert "page" in result

    def test_missing_field_single_loc(self):
        """loc 长度 <=1 时字段名回退到 '未知字段'."""
        err = self._make_error("missing", ("body",))
        result = format_request_validation_error(err)
        assert "未知字段" in result

    def test_missing_field_empty_loc(self):
        """loc 为空元组时字段名回退到 '未知字段'."""
        err = self._make_error("missing", ())
        result = format_request_validation_error(err)
        assert "未知字段" in result

    def test_type_error_list(self):
        err = self._make_error("list_type", ("query", "ids"))
        result = format_request_validation_error(err)
        assert "ids" in result
        assert "数组格式" in result

    def test_type_error_is_list(self):
        """error_type 含 'list' 也走数组分支."""
        err = self._make_error("list_type", ("query", "ids"))
        result = format_request_validation_error(err)
        assert "数组格式" in result

    def test_type_error_list_via_message(self):
        """error_type 为 list_type 时走数组分支."""
        err = self._make_error("list_type", ("query", "ids"), msg="Input should be a valid list")
        result = format_request_validation_error(err)
        assert "数组格式" in result

    def test_type_error_float(self):
        err = self._make_error("float_parsing", ("query", "price"))
        result = format_request_validation_error(err)
        assert "price" in result
        assert "数字" in result

    def test_type_error_int(self):
        err = self._make_error("int_parsing", ("query", "page"))
        result = format_request_validation_error(err)
        assert "page" in result
        assert "整数" in result

    def test_type_error_bool(self):
        err = self._make_error("bool_parsing", ("query", "active"))
        result = format_request_validation_error(err)
        assert "active" in result
        assert "布尔值" in result

    def test_type_error_str(self):
        err = self._make_error("string_type", ("query", "name"))
        result = format_request_validation_error(err)
        assert "name" in result
        assert "字符串" in result

    def test_type_error_other(self):
        err = self._make_error("some_unknown_type", ("query", "meta"), msg="expected dict")
        result = format_request_validation_error(err)
        assert "meta" in result
        assert "expected dict" in result

    def test_value_error(self):
        err = self._make_error("value_error", ("query", "status"))
        result = format_request_validation_error(err)
        assert "status" in result
        assert "值无效" in result

    def test_greater_than(self):
        err = self._make_error("greater_than", ("query", "limit"))
        result = format_request_validation_error(err)
        assert "limit" in result
        assert "大于 0" in result

    def test_string_too_long(self):
        err = self._make_error("string_too_long", ("body", "name"))
        result = format_request_validation_error(err)
        assert "name" in result
        assert "最大长度" in result

    def test_string_too_short(self):
        err = self._make_error("string_too_short", ("body", "code"))
        result = format_request_validation_error(err)
        assert "code" in result
        assert "长度太短" in result

    def test_fallback_generic(self):
        err = self._make_error("some_unknown_type", ("query", "field"), msg="custom msg")
        result = format_request_validation_error(err)
        assert "field" in result
        assert "custom msg" in result

    def test_empty_errors_returns_default(self):
        """errors 列表为空时返回默认消息."""
        err = RequestValidationError(errors=[])
        result = format_request_validation_error(err)
        assert result == "请求参数验证失败"

    def test_multiple_errors_joined(self):
        err = RequestValidationError(
            errors=[
                {"type": "missing", "loc": ("query", "a"), "msg": "", "input": None},
                {"type": "type_error.int", "loc": ("query", "b"), "msg": "", "input": None},
            ],
        )
        result = format_request_validation_error(err)
        assert "; " in result


# ---------------------------------------------------------------------------
# format_database_error
# ---------------------------------------------------------------------------


class TestFormatDatabaseErrorIntegrity:
    """format_database_error — IntegrityError 分支."""

    @staticmethod
    def _make_integrity(msg: str) -> IntegrityError:
        return IntegrityError(statement="", params={}, orig=Exception(msg))

    # --- UNIQUE constraint ---

    def test_unique_source_property(self):
        err = self._make_integrity("UNIQUE constraint failed: uq_source_property")
        assert format_database_error(err) == "房源已存在（数据源和房源ID重复）"

    def test_unique_community_name(self):
        err = self._make_integrity("UNIQUE constraint failed: communities.name")
        assert format_database_error(err) == "小区名称已存在"

    def test_unique_alias_source(self):
        err = self._make_integrity("UNIQUE constraint failed: uq_alias_source")
        assert format_database_error(err) == "小区别名已存在"

    def test_unique_community_competitor(self):
        err = self._make_integrity("UNIQUE constraint failed: uq_community_competitor")
        assert format_database_error(err) == "竞品关联已存在"

    def test_unique_property_media_url(self):
        err = self._make_integrity("UNIQUE constraint failed: uq_property_media_url")
        assert format_database_error(err) == "媒体资源已存在"

    def test_unique_contract_no(self):
        err = self._make_integrity("UNIQUE constraint failed: project_contracts.contract_no")
        assert format_database_error(err) == "合同编号已存在"

    def test_unique_contract_project_id(self):
        err = self._make_integrity("UNIQUE constraint failed: project_contracts.project_id")
        assert format_database_error(err) == "该项目已存在合同记录"

    def test_unique_sales_project_id(self):
        err = self._make_integrity("UNIQUE constraint failed: project_sales.project_id")
        assert format_database_error(err) == "该项目已存在销售记录"

    def test_unique_renovation_project_id(self):
        err = self._make_integrity("UNIQUE constraint failed: project_renovations.project_id")
        assert format_database_error(err) == "该项目已存在装修记录"

    def test_unique_role_name(self):
        err = self._make_integrity("UNIQUE constraint failed: roles.name")
        assert format_database_error(err) == "角色名称已存在"

    def test_unique_role_code(self):
        err = self._make_integrity("UNIQUE constraint failed: roles.code")
        assert format_database_error(err) == "角色代码已存在"

    def test_unique_username(self):
        err = self._make_integrity("UNIQUE constraint failed: users.username")
        assert format_database_error(err) == "用户名已存在"

    def test_unique_phone(self):
        err = self._make_integrity("UNIQUE constraint failed: users.phone")
        assert format_database_error(err) == "手机号已存在"

    def test_unique_wechat_openid(self):
        err = self._make_integrity("UNIQUE constraint failed: users.wechat_openid")
        assert format_database_error(err) == "微信账号已绑定"

    def test_unique_wechat_unionid(self):
        err = self._make_integrity("UNIQUE constraint failed: users.wechat_unionid")
        assert format_database_error(err) == "微信账号已绑定"

    def test_unique_unknown_constraint(self):
        err = self._make_integrity("UNIQUE constraint failed: some_other_table.col")
        assert format_database_error(err) == "数据重复，违反唯一性约束"

    # --- FOREIGN KEY ---

    def test_foreign_key_constraint(self):
        err = self._make_integrity("FOREIGN KEY constraint failed")
        assert format_database_error(err) == "关联数据不存在，请检查小区ID等外键字段"

    # --- NOT NULL ---
    # 注意：IntegrityError 的 str() 包含 SQLAlchemy 后缀如
    # "(Background on this error at: https://sqlalche.me/e/20/gkpj)"，
    # 其中含 '.'，导致 rsplit(".", maxsplit=1) 提取到 URL 片段而非字段名。
    # 这是源码的已知行为，测试反映实际输出。

    def test_not_null_with_field_name(self):
        """NOT NULL 含 '.' 时 rsplit 会受 SQLAlchemy URL 后缀干扰."""
        err = self._make_integrity("NOT NULL constraint failed: users.email")
        result = format_database_error(err)
        assert "必填字段" in result
        assert "不能为空" in result

    def test_not_null_without_dot(self):
        """NOT NULL 不含 '.' 时回退到通用消息，但 URL 后缀仍含 '.'."""
        err = self._make_integrity("NOT NULL constraint failed: some_field")
        result = format_database_error(err)
        assert "必填字段" in result
        assert "不能为空" in result

    # --- 其他 IntegrityError ---

    def test_integrity_other(self):
        err = self._make_integrity("CHECK constraint failed: something")
        assert format_database_error(err) == "数据完整性错误"


class TestFormatDatabaseErrorOperational:
    """format_database_error — OperationalError 分支."""

    @staticmethod
    def _make_operational(msg: str) -> OperationalError:
        return OperationalError(statement="", params={}, orig=Exception(msg))

    def test_database_locked(self):
        err = self._make_operational("database is locked")
        assert format_database_error(err) == "数据库被锁定，请稍后重试"

    def test_no_such_table(self):
        err = self._make_operational("no such table: xyz")
        assert format_database_error(err) == "数据库表不存在，请先初始化数据库"

    def test_no_such_column(self):
        err = self._make_operational("no such column: xyz")
        assert format_database_error(err) == "数据库字段不存在，请检查数据库结构"

    def test_operational_other(self):
        err = self._make_operational("disk I/O error")
        assert format_database_error(err) == "数据库操作失败"


class TestFormatDatabaseErrorData:
    """format_database_error — DataError 分支."""

    def test_data_error(self):
        err = DataError(statement="", params={}, orig=Exception("data too long"))
        assert format_database_error(err) == "数据格式错误或超出字段长度限制"


class TestFormatDatabaseErrorGeneric:
    """format_database_error — 通用 SQLAlchemyError 分支."""

    def test_generic_sqlalchemy_error(self):
        err = SQLAlchemyError("something unexpected")
        assert format_database_error(err) == "数据库错误"
