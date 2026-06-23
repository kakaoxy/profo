"""JSONBatchImporter 单元测试.

覆盖:
- batch_import_json 正常流程（全部成功/部分失败/全部失败）
- 批量大小超限
- ValidationError 处理
- 未知异常处理
- db.commit 失败回滚
- _extract_source_id
- _format_validation_error
- _save_failed_record_raw
"""

from unittest.mock import MagicMock, patch

import pytest
from pydantic import ValidationError

from schemas import PushResult
from services.market.json_batch_importer import MAX_BATCH_SIZE, JSONBatchImporter


# ---------------------------------------------------------------------------
# Fixtures & Helpers
# ---------------------------------------------------------------------------


@pytest.fixture
def importer() -> JSONBatchImporter:
    """创建 JSONBatchImporter 实例."""
    return JSONBatchImporter()


def _make_valid_raw_data(source_property_id: str = "sp-001", community_name: str = "测试小区") -> dict:
    """构造合法的原始房源数据字典（含中文字段名）."""
    return {
        "房源ID": source_property_id,
        "数据源": "beike",
        "小区名称": community_name,
        "source_property_id": source_property_id,
        "data_source": "beike",
        "community_name": community_name,
        "status": "for_sale",
        "property_type": "住宅",
        "build_area": 80.0,
        "listed_price_wan": 300.0,
    }


def _make_import_result(success: bool, error: str | None = None) -> MagicMock:
    """构造模拟的 ImportResult."""
    result = MagicMock()
    result.success = success
    result.error = error
    return result


# ---------------------------------------------------------------------------
# batch_import_json - 正常流程
# ---------------------------------------------------------------------------


class TestBatchImportJsonSuccess:
    """batch_import_json 成功场景."""

    @patch("services.market.json_batch_importer.save_failed_record")
    @patch("services.market.json_batch_importer.PropertyIngestionModel")
    def test_all_success(self, mock_schema, mock_save_failed, importer) -> None:
        """所有记录导入成功."""
        db = MagicMock()
        mock_schema.return_value = MagicMock()  # 验证通过

        importer.importer = MagicMock()
        importer.importer.import_property.return_value = _make_import_result(success=True)

        raw_data = [_make_valid_raw_data(f"sp-{i}") for i in range(3)]

        result = importer.batch_import_json(raw_data, db, "user-1")

        assert isinstance(result, PushResult)
        assert result.total == 3
        assert result.success == 3
        assert result.failed == 0
        assert result.errors == []
        db.commit.assert_called_once()
        mock_save_failed.assert_not_called()

    @patch("services.market.json_batch_importer.save_failed_record")
    @patch("services.market.json_batch_importer.PropertyIngestionModel")
    def test_partial_failure(self, mock_schema, mock_save_failed, importer) -> None:
        """部分记录导入失败（importer 返回 success=False）."""
        db = MagicMock()
        mock_schema.return_value = MagicMock()

        importer.importer = MagicMock()
        importer.importer.import_property.side_effect = [
            _make_import_result(success=True),
            _make_import_result(success=False, error="小区不存在"),
            _make_import_result(success=True),
        ]

        raw_data = [_make_valid_raw_data(f"sp-{i}") for i in range(3)]

        result = importer.batch_import_json(raw_data, db, "user-1")

        assert result.total == 3
        assert result.success == 2
        assert result.failed == 1
        assert len(result.errors) == 1
        assert result.errors[0]["index"] == 1
        assert result.errors[0]["reason"] == "小区不存在"
        db.commit.assert_called_once()
        assert mock_save_failed.call_count == 1

    @patch("services.market.json_batch_importer.save_failed_record")
    @patch("services.market.json_batch_importer.PropertyIngestionModel")
    def test_all_import_failure(self, mock_schema, mock_save_failed, importer) -> None:
        """所有记录导入失败."""
        db = MagicMock()
        mock_schema.return_value = MagicMock()

        importer.importer = MagicMock()
        importer.importer.import_property.return_value = _make_import_result(success=False, error="数据库错误")

        raw_data = [_make_valid_raw_data(f"sp-{i}") for i in range(2)]

        result = importer.batch_import_json(raw_data, db, "user-1")

        assert result.total == 2
        assert result.success == 0
        assert result.failed == 2
        assert len(result.errors) == 2
        db.commit.assert_called_once()


# ---------------------------------------------------------------------------
# batch_import_json - 批量大小限制
# ---------------------------------------------------------------------------


class TestBatchImportJsonBatchSize:
    """batch_import_json 批量大小限制."""

    def test_exceed_max_batch_size(self, importer) -> None:
        """超过最大批量限制时抛出 ValueError."""
        db = MagicMock()
        raw_data = [{"id": i} for i in range(MAX_BATCH_SIZE + 1)]

        with pytest.raises(ValueError, match=str(MAX_BATCH_SIZE)):
            importer.batch_import_json(raw_data, db, "user-1")

    def test_exact_max_batch_size(self, importer) -> None:
        """恰好等于最大批量限制时不抛出 ValueError."""
        db = MagicMock()
        db.commit = MagicMock()
        raw_data = [{"id": i} for i in range(MAX_BATCH_SIZE)]

        # Mock PropertyIngestionModel 和 import_property 避免真正执行导入
        with patch("services.market.json_batch_importer.PropertyIngestionModel") as mock_schema, \
             patch("services.market.json_batch_importer.save_failed_record"):
            mock_schema.return_value = MagicMock()
            importer.importer = MagicMock()
            importer.importer.import_property.return_value = _make_import_result(success=True)

            # 不应抛出 ValueError
            result = importer.batch_import_json(raw_data, db, "user-1")
            assert result.total == MAX_BATCH_SIZE


# ---------------------------------------------------------------------------
# batch_import_json - ValidationError 处理
# ---------------------------------------------------------------------------


class TestBatchImportJsonValidationError:
    """batch_import_json 验证错误处理."""

    @patch("services.market.json_batch_importer.save_failed_record")
    @patch("services.market.json_batch_importer.format_validation_error")
    @patch("services.market.json_batch_importer.PropertyIngestionModel")
    def test_validation_error_recorded(self, mock_schema, mock_fmt, mock_save_failed, importer) -> None:
        """ValidationError 应被捕获并记录."""
        db = MagicMock()
        mock_schema.side_effect = ValidationError.from_exception_data("PropertyIngestionModel", [])
        mock_fmt.return_value = "字段验证失败: build_area"

        raw_data = [_make_valid_raw_data()]

        result = importer.batch_import_json(raw_data, db, "user-1")

        assert result.total == 1
        assert result.success == 0
        assert result.failed == 1
        assert len(result.errors) == 1
        assert result.errors[0]["reason"] == "字段验证失败: build_area"
        mock_save_failed.assert_called_once()
        db.commit.assert_called_once()

    @patch("services.market.json_batch_importer.save_failed_record")
    @patch("services.market.json_batch_importer.format_validation_error")
    @patch("services.market.json_batch_importer.PropertyIngestionModel")
    def test_validation_error_mixed_with_success(self, mock_schema, mock_fmt, mock_save_failed, importer) -> None:
        """部分记录验证失败、部分成功."""
        db = MagicMock()

        valid_data = MagicMock()
        call_count = 0

        def schema_side_effect(**kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                raise ValidationError.from_exception_data("PropertyIngestionModel", [])
            return valid_data

        mock_schema.side_effect = schema_side_effect
        mock_fmt.return_value = "验证失败"

        importer.importer = MagicMock()
        importer.importer.import_property.return_value = _make_import_result(success=True)

        raw_data = [_make_valid_raw_data(f"sp-{i}") for i in range(3)]

        result = importer.batch_import_json(raw_data, db, "user-1")

        assert result.success == 2
        assert result.failed == 1
        assert result.errors[0]["index"] == 1


# ---------------------------------------------------------------------------
# batch_import_json - 未知异常处理
# ---------------------------------------------------------------------------


class TestBatchImportJsonUnknownException:
    """batch_import_json 未知异常处理."""

    @patch("services.market.json_batch_importer.save_failed_record")
    @patch("services.market.json_batch_importer.PropertyIngestionModel")
    def test_unknown_exception_recorded(self, mock_schema, mock_save_failed, importer) -> None:
        """未知异常应被捕获并记录为'处理失败: {错误信息}'."""
        db = MagicMock()
        mock_schema.return_value = MagicMock()

        importer.importer = MagicMock()
        importer.importer.import_property.side_effect = RuntimeError("意外错误")

        raw_data = [_make_valid_raw_data()]

        result = importer.batch_import_json(raw_data, db, "user-1")

        assert result.total == 1
        assert result.failed == 1
        assert result.errors[0]["reason"] == "处理失败: 意外错误"
        mock_save_failed.assert_called_once()
        db.commit.assert_called_once()


# ---------------------------------------------------------------------------
# batch_import_json - db.commit 失败回滚
# ---------------------------------------------------------------------------


class TestBatchImportJsonRollback:
    """batch_import_json 提交失败回滚."""

    @patch("services.market.json_batch_importer.save_failed_record")
    @patch("services.market.json_batch_importer.PropertyIngestionModel")
    def test_commit_failure_triggers_rollback(self, mock_schema, mock_save_failed, importer) -> None:
        """db.commit 抛异常时应回滚并标记全部失败."""
        db = MagicMock()
        db.commit.side_effect = Exception("DB connection lost")

        mock_schema.return_value = MagicMock()
        importer.importer = MagicMock()
        importer.importer.import_property.return_value = _make_import_result(success=True)

        raw_data = [_make_valid_raw_data(f"sp-{i}") for i in range(3)]

        result = importer.batch_import_json(raw_data, db, "user-1")

        assert result.total == 3
        assert result.success == 0
        assert result.failed == 3
        db.rollback.assert_called_once()

        # 所有记录的错误信息应包含回滚说明
        for err in result.errors:
            assert "批次提交失败" in err["reason"]

    @patch("services.market.json_batch_importer.save_failed_record")
    @patch("services.market.json_batch_importer.PropertyIngestionModel")
    def test_rollback_preserves_original_errors(self, mock_schema, mock_save_failed, importer) -> None:
        """回滚时错误信息应被保留或标记为批次提交失败."""
        db = MagicMock()
        db.commit.side_effect = Exception("DB error")

        mock_schema.return_value = MagicMock()
        importer.importer = MagicMock()
        importer.importer.import_property.side_effect = [
            _make_import_result(success=True),
            _make_import_result(success=False, error="原始错误"),
        ]

        raw_data = [_make_valid_raw_data("sp-0"), _make_valid_raw_data("sp-1")]

        result = importer.batch_import_json(raw_data, db, "user-1")

        # 回滚后所有记录都应有错误信息
        assert result.total == 2
        assert len(result.errors) == 2
        for err in result.errors:
            assert err["reason"]  # 每条记录都有原因


# ---------------------------------------------------------------------------
# _extract_source_id
# ---------------------------------------------------------------------------


class TestExtractSourceId:
    """_extract_source_id 测试."""

    def test_chinese_key_priority(self, importer) -> None:
        """房源ID 优先于 source_property_id."""
        raw = {"房源ID": "cn-001", "source_property_id": "en-001"}
        assert importer._extract_source_id(raw) == "cn-001"

    def test_fallback_to_english_key(self, importer) -> None:
        """无房源ID 时回退到 source_property_id."""
        raw = {"source_property_id": "en-001"}
        assert importer._extract_source_id(raw) == "en-001"

    def test_unknown_when_missing(self, importer) -> None:
        """两者都不存在时返回 'unknown'."""
        raw = {"other_key": "value"}
        assert importer._extract_source_id(raw) == "unknown"


# ---------------------------------------------------------------------------
# _format_validation_error
# ---------------------------------------------------------------------------


class TestFormatValidationError:
    """_format_validation_error 测试."""

    @patch("services.market.json_batch_importer.format_validation_error")
    def test_delegates_to_util(self, mock_fmt, importer) -> None:
        """应委托给 utils.error_formatters.format_validation_error."""
        mock_err = MagicMock(spec=ValidationError)
        mock_fmt.return_value = "formatted error"

        result = importer._format_validation_error(mock_err)

        mock_fmt.assert_called_once_with(mock_err)
        assert result == "formatted error"


# ---------------------------------------------------------------------------
# _save_failed_record_raw
# ---------------------------------------------------------------------------


class TestSaveFailedRecordRaw:
    """_save_failed_record_raw 测试."""

    @patch("services.market.json_batch_importer.save_failed_record")
    def test_saves_with_correct_params(self, mock_save, importer) -> None:
        """应使用正确参数调用 save_failed_record."""
        raw = {"房源ID": "sp-001", "数据源": "beike", "data_source": "beike"}
        error_msg = "验证失败"

        importer._save_failed_record_raw(raw, error_msg)

        mock_save.assert_called_once_with(
            data=raw,
            error_message=error_msg,
            failure_type="json_validation_error",
            data_source="beike",
        )

    @patch("services.market.json_batch_importer.save_failed_record")
    def test_data_source_from_chinese_key(self, mock_save, importer) -> None:
        """数据源应优先从中文键'数据源'获取."""
        raw = {"数据源": "贝壳", "data_source": "beike"}
        error_msg = "错误"

        importer._save_failed_record_raw(raw, error_msg)

        # raw_data.get("数据源") 优先
        call_kwargs = mock_save.call_args[1]
        assert call_kwargs["data_source"] == "贝壳"

    @patch("services.market.json_batch_importer.save_failed_record")
    def test_data_source_fallback_to_english_key(self, mock_save, importer) -> None:
        """无中文键时回退到 data_source."""
        raw = {"data_source": "5i5j"}
        error_msg = "错误"

        importer._save_failed_record_raw(raw, error_msg)

        call_kwargs = mock_save.call_args[1]
        assert call_kwargs["data_source"] == "5i5j"

    @patch("services.market.json_batch_importer.save_failed_record")
    def test_data_source_none_when_missing(self, mock_save, importer) -> None:
        """两个键都不存在时 data_source 为 None."""
        raw = {"other": "value"}
        error_msg = "错误"

        importer._save_failed_record_raw(raw, error_msg)

        call_kwargs = mock_save.call_args[1]
        assert call_kwargs["data_source"] is None
