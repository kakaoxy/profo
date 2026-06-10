"""CSVBatchImporter 单元测试."""

import io
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from pydantic import ValidationError

from schemas import PropertyIngestionModel, UploadResult
from services.market.batch_importer import CSVBatchImporter, _normalize_date
from services.system.exceptions import FileProcessingError


# ---------------------------------------------------------------------------
# 辅助函数
# ---------------------------------------------------------------------------


def _make_csv_content(
    headers: str = "数据源,房源ID,状态,小区名,室,朝向,楼层,面积,挂牌价,上架时间",
    rows: list[str] | None = None,
) -> str:
    """构造 CSV 字符串."""
    if rows is None:
        rows = ["链家,LJ001,在售,测试小区,2,南,5/20,89.5,500,2025-01-01"]
    return headers + "\n" + "\n".join(rows)


def _make_upload_file(content: bytes) -> MagicMock:
    """构造 FastAPI UploadFile mock."""
    file = MagicMock()
    file.file = io.BytesIO(content)
    file.filename = "test.csv"
    file.content_type = "text/csv"
    return file


def _make_valid_row() -> dict:
    """构造一条合法的 PropertyIngestionModel 输入字典."""
    return {
        "数据源": "链家",
        "房源ID": "LJ001",
        "状态": "在售",
        "小区名": "测试小区",
        "室": 2,
        "厅": 1,
        "卫": 1,
        "朝向": "南",
        "楼层": "5/20",
        "面积": 89.5,
        "挂牌价": 500,
        "上架时间": "2025-01-01",
    }


# ---------------------------------------------------------------------------
# _normalize_date
# ---------------------------------------------------------------------------


class TestNormalizeDate:
    """日期规范化函数测试."""

    def test_iso_format(self) -> None:
        assert _normalize_date("2025-01-15") == "2025-01-15"

    def test_chinese_format(self) -> None:
        assert _normalize_date("2025年1月15日") == "2025-01-15"

    def test_dot_format(self) -> None:
        assert _normalize_date("2025.01.15") == "2025-01-15"

    def test_slash_format(self) -> None:
        assert _normalize_date("2025/01/15") == "2025-01-15"

    def test_single_digit_month_day(self) -> None:
        assert _normalize_date("2025年1月5日") == "2025-01-05"

    def test_fallback_dateutil(self) -> None:
        result = _normalize_date("Jan 15, 2025")
        assert result == "2025-01-15"

    def test_unparseable_returns_original(self) -> None:
        result = _normalize_date("not-a-date")
        assert result == "not-a-date"

    def test_empty_string(self) -> None:
        result = _normalize_date("")
        assert result == ""


# ---------------------------------------------------------------------------
# _decode_file_content
# ---------------------------------------------------------------------------


class TestDecodeFileContent:
    """文件解码测试."""

    def test_utf8(self) -> None:
        importer = CSVBatchImporter.__new__(CSVBatchImporter)
        content = "数据源,房源ID".encode("utf-8")
        result = importer._decode_file_content(content)
        assert result == "数据源,房源ID"

    def test_utf8_bom(self) -> None:
        importer = CSVBatchImporter.__new__(CSVBatchImporter)
        content = "数据源,房源ID".encode("utf-8-sig")  # 自动带 BOM
        result = importer._decode_file_content(content)
        assert "数据源" in result

    def test_gbk(self) -> None:
        importer = CSVBatchImporter.__new__(CSVBatchImporter)
        content = "数据源,房源ID".encode("gbk")
        result = importer._decode_file_content(content)
        assert result == "数据源,房源ID"

    def test_utf16_le_bom(self) -> None:
        importer = CSVBatchImporter.__new__(CSVBatchImporter)
        content = "数据源".encode("utf-16")  # 自动带 BOM
        result = importer._decode_file_content(content)
        assert "数据源" in result


# ---------------------------------------------------------------------------
# parse_csv_file
# ---------------------------------------------------------------------------


class TestParseCsvFile:
    """CSV 解析测试."""

    def test_basic_csv(self) -> None:
        importer = CSVBatchImporter.__new__(CSVBatchImporter)
        csv_text = "数据源,房源ID,状态\n链家,LJ001,在售"
        rows, headers = importer.parse_csv_file(csv_text)
        assert len(rows) == 1
        assert headers == ["数据源", "房源ID", "状态"]
        assert rows[0]["数据源"] == "链家"
        assert rows[0]["房源ID"] == "LJ001"

    def test_empty_cell_becomes_none(self) -> None:
        importer = CSVBatchImporter.__new__(CSVBatchImporter)
        csv_text = "数据源,房源ID\n链家,"
        rows, _ = importer.parse_csv_file(csv_text)
        assert rows[0]["房源ID"] is None

    def test_short_row_padded(self) -> None:
        importer = CSVBatchImporter.__new__(CSVBatchImporter)
        csv_text = "数据源,房源ID,状态\n链家"
        rows, _ = importer.parse_csv_file(csv_text)
        assert rows[0]["数据源"] == "链家"
        assert rows[0]["房源ID"] is None
        assert rows[0]["状态"] is None

    def test_long_row_trimmed(self) -> None:
        importer = CSVBatchImporter.__new__(CSVBatchImporter)
        csv_text = "数据源,房源ID\n链家,LJ001,extra"
        rows, _ = importer.parse_csv_file(csv_text)
        assert "数据源" in rows[0]
        assert "房源ID" in rows[0]
        assert len(rows[0]) == 2

    def test_bom_stripped_from_header(self) -> None:
        importer = CSVBatchImporter.__new__(CSVBatchImporter)
        csv_text = "\ufeff数据源,房源ID\n链家,LJ001"
        rows, headers = importer.parse_csv_file(csv_text)
        assert headers[0] == "数据源"

    def test_empty_header_key_skipped(self) -> None:
        importer = CSVBatchImporter.__new__(CSVBatchImporter)
        csv_text = "数据源,,房源ID\n链家,,在售"
        rows, headers = importer.parse_csv_file(csv_text)
        assert "" not in rows[0]
        assert "数据源" in rows[0]

    def test_date_normalization(self) -> None:
        importer = CSVBatchImporter.__new__(CSVBatchImporter)
        csv_text = "上架时间,成交时间\n2025年1月15日,2025/02/20"
        rows, _ = importer.parse_csv_file(csv_text)
        assert rows[0]["上架时间"] == "2025-01-15"
        assert rows[0]["成交时间"] == "2025-02-20"

    def test_no_headers_raises(self) -> None:
        importer = CSVBatchImporter.__new__(CSVBatchImporter)
        with pytest.raises(FileProcessingError, match="CSV 文件格式无效"):
            importer.parse_csv_file("")

    def test_invalid_csv_raises(self) -> None:
        importer = CSVBatchImporter.__new__(CSVBatchImporter)
        with pytest.raises(FileProcessingError, match="CSV 文件格式无效"):
            importer.parse_csv_file(None)  # type: ignore[arg-type]

    def test_semicolon_delimiter(self) -> None:
        importer = CSVBatchImporter.__new__(CSVBatchImporter)
        csv_text = "数据源;房源ID\n链家;LJ001"
        rows, headers = importer.parse_csv_file(csv_text)
        assert len(rows) == 1
        assert rows[0]["数据源"] == "链家"


# ---------------------------------------------------------------------------
# batch_import_csv
# ---------------------------------------------------------------------------


class TestBatchImportCsv:
    """批量导入主流程测试."""

    @patch.object(CSVBatchImporter, "_generate_failed_csv", return_value=None)
    @patch.object(CSVBatchImporter, "_save_failed_record")
    @patch.object(CSVBatchImporter, "parse_csv_file")
    @patch.object(CSVBatchImporter, "_decode_file_content")
    def test_all_rows_success(
        self,
        mock_decode: MagicMock,
        mock_parse: MagicMock,
        mock_save_failed: MagicMock,
        mock_gen_csv: MagicMock,
    ) -> None:
        """所有行导入成功."""
        mock_decode.return_value = "csv_text"
        row = _make_valid_row()
        mock_parse.return_value = ([row], ["数据源", "房源ID", "状态", "小区名", "室", "朝向", "楼层", "面积", "挂牌价", "上架时间"])

        importer = CSVBatchImporter()
        importer.importer = MagicMock()
        importer.importer.import_property.return_value = MagicMock(success=True, property_id=1, error=None)

        db = MagicMock()
        file = _make_upload_file(b"dummy")

        result = importer.batch_import_csv(file, db, user_id="user1")

        assert result.total == 1
        assert result.success == 1
        assert result.failed == 0
        db.commit.assert_called()

    @patch.object(CSVBatchImporter, "_generate_failed_csv", return_value=None)
    @patch.object(CSVBatchImporter, "_save_failed_record")
    @patch.object(CSVBatchImporter, "parse_csv_file")
    @patch.object(CSVBatchImporter, "_decode_file_content")
    def test_validation_error_counts_failed(
        self,
        mock_decode: MagicMock,
        mock_parse: MagicMock,
        mock_save_failed: MagicMock,
        mock_gen_csv: MagicMock,
    ) -> None:
        """Pydantic 验证失败的行计入 failed."""
        mock_decode.return_value = "csv_text"
        # 缺少必填字段 "小区名"
        bad_row = {"数据源": "链家", "房源ID": "LJ001", "状态": "在售"}
        mock_parse.return_value = ([bad_row], ["数据源", "房源ID", "状态"])

        importer = CSVBatchImporter()
        db = MagicMock()
        file = _make_upload_file(b"dummy")

        result = importer.batch_import_csv(file, db)

        assert result.total == 1
        assert result.failed == 1
        assert result.success == 0
        mock_save_failed.assert_called()

    @patch.object(CSVBatchImporter, "_generate_failed_csv", return_value=None)
    @patch.object(CSVBatchImporter, "_save_failed_record")
    @patch.object(CSVBatchImporter, "parse_csv_file")
    @patch.object(CSVBatchImporter, "_decode_file_content")
    def test_import_property_failure(
        self,
        mock_decode: MagicMock,
        mock_parse: MagicMock,
        mock_save_failed: MagicMock,
        mock_gen_csv: MagicMock,
    ) -> None:
        """import_property 返回 success=False 时计入 failed."""
        mock_decode.return_value = "csv_text"
        row = _make_valid_row()
        mock_parse.return_value = ([row], list(row.keys()))

        importer = CSVBatchImporter()
        importer.importer = MagicMock()
        importer.importer.import_property.return_value = MagicMock(success=False, property_id=None, error="数据库错误")

        db = MagicMock()
        file = _make_upload_file(b"dummy")

        result = importer.batch_import_csv(file, db)

        assert result.failed == 1
        assert result.success == 0

    @patch.object(CSVBatchImporter, "_generate_failed_csv", return_value=None)
    @patch.object(CSVBatchImporter, "_save_failed_record")
    @patch.object(CSVBatchImporter, "parse_csv_file")
    @patch.object(CSVBatchImporter, "_decode_file_content")
    def test_import_property_exception(
        self,
        mock_decode: MagicMock,
        mock_parse: MagicMock,
        mock_save_failed: MagicMock,
        mock_gen_csv: MagicMock,
    ) -> None:
        """import_property 抛异常时计入 failed."""
        mock_decode.return_value = "csv_text"
        row = _make_valid_row()
        mock_parse.return_value = ([row], list(row.keys()))

        importer = CSVBatchImporter()
        importer.importer = MagicMock()
        importer.importer.import_property.side_effect = RuntimeError("unexpected")

        db = MagicMock()
        file = _make_upload_file(b"dummy")

        result = importer.batch_import_csv(file, db)

        assert result.failed == 1

    @patch.object(CSVBatchImporter, "_generate_failed_csv", return_value=None)
    @patch.object(CSVBatchImporter, "_save_failed_record")
    @patch.object(CSVBatchImporter, "parse_csv_file")
    @patch.object(CSVBatchImporter, "_decode_file_content")
    def test_batch_commit_failure_rollback(
        self,
        mock_decode: MagicMock,
        mock_parse: MagicMock,
        mock_save_failed: MagicMock,
        mock_gen_csv: MagicMock,
    ) -> None:
        """批次提交失败时回滚，成功计数归零."""
        mock_decode.return_value = "csv_text"
        row = _make_valid_row()
        mock_parse.return_value = ([row], list(row.keys()))

        importer = CSVBatchImporter()
        importer.importer = MagicMock()
        importer.importer.import_property.return_value = MagicMock(success=True, property_id=1, error=None)

        db = MagicMock()
        db.commit.side_effect = RuntimeError("commit failed")

        file = _make_upload_file(b"dummy")

        result = importer.batch_import_csv(file, db)

        db.rollback.assert_called()
        assert result.failed == 1
        assert result.success == 0

    @patch.object(CSVBatchImporter, "_generate_failed_csv", return_value="/api/v1/upload/download/failed.csv")
    @patch.object(CSVBatchImporter, "_save_failed_record")
    @patch.object(CSVBatchImporter, "parse_csv_file")
    @patch.object(CSVBatchImporter, "_decode_file_content")
    def test_failed_file_url_generated(
        self,
        mock_decode: MagicMock,
        mock_parse: MagicMock,
        mock_save_failed: MagicMock,
        mock_gen_csv: MagicMock,
    ) -> None:
        """有失败记录时生成失败文件 URL."""
        mock_decode.return_value = "csv_text"
        bad_row = {"数据源": "链家", "房源ID": "LJ001", "状态": "在售"}
        mock_parse.return_value = ([bad_row], ["数据源", "房源ID", "状态"])

        importer = CSVBatchImporter()
        db = MagicMock()
        file = _make_upload_file(b"dummy")

        result = importer.batch_import_csv(file, db)

        assert result.failed_file_url == "/api/v1/upload/download/failed.csv"
        mock_gen_csv.assert_called_once()

    def test_empty_file_raises(self) -> None:
        """空文件抛出 FileProcessingError."""
        importer = CSVBatchImporter()
        db = MagicMock()
        file = _make_upload_file(b"")

        with pytest.raises(FileProcessingError, match="上传的 CSV 文件为空"):
            importer.batch_import_csv(file, db)

    @patch.object(CSVBatchImporter, "_generate_failed_csv", return_value=None)
    @patch.object(CSVBatchImporter, "_save_failed_record")
    @patch.object(CSVBatchImporter, "parse_csv_file")
    @patch.object(CSVBatchImporter, "_decode_file_content")
    def test_user_id_defaults_to_system(
        self,
        mock_decode: MagicMock,
        mock_parse: MagicMock,
        mock_save_failed: MagicMock,
        mock_gen_csv: MagicMock,
    ) -> None:
        """未传 user_id 时默认使用 'system'."""
        mock_decode.return_value = "csv_text"
        row = _make_valid_row()
        mock_parse.return_value = ([row], list(row.keys()))

        importer = CSVBatchImporter()
        importer.importer = MagicMock()
        importer.importer.import_property.return_value = MagicMock(success=True, property_id=1, error=None)

        db = MagicMock()
        file = _make_upload_file(b"dummy")

        importer.batch_import_csv(file, db, user_id="")

        importer.importer.import_property.assert_called_once()
        call_args = importer.importer.import_property.call_args
        assert call_args[0][2] == "system"

    @patch.object(CSVBatchImporter, "_generate_failed_csv", return_value=None)
    @patch.object(CSVBatchImporter, "_save_failed_record")
    @patch.object(CSVBatchImporter, "parse_csv_file")
    @patch.object(CSVBatchImporter, "_decode_file_content")
    def test_mixed_success_and_failure(
        self,
        mock_decode: MagicMock,
        mock_parse: MagicMock,
        mock_save_failed: MagicMock,
        mock_gen_csv: MagicMock,
    ) -> None:
        """混合成功和失败行."""
        mock_decode.return_value = "csv_text"
        good_row = _make_valid_row()
        bad_row = {"数据源": "链家", "房源ID": "LJ002", "状态": "在售"}  # 缺少必填字段
        mock_parse.return_value = ([good_row, bad_row], list(good_row.keys()))

        importer = CSVBatchImporter()
        importer.importer = MagicMock()
        importer.importer.import_property.return_value = MagicMock(success=True, property_id=1, error=None)

        db = MagicMock()
        file = _make_upload_file(b"dummy")

        result = importer.batch_import_csv(file, db)

        assert result.total == 2
        assert result.success == 1
        assert result.failed == 1

    @patch.object(CSVBatchImporter, "_generate_failed_csv", return_value=None)
    @patch.object(CSVBatchImporter, "_save_failed_record")
    @patch.object(CSVBatchImporter, "parse_csv_file")
    @patch.object(CSVBatchImporter, "_decode_file_content")
    def test_general_exception_returns_upload_result(
        self,
        mock_decode: MagicMock,
        mock_parse: MagicMock,
        mock_save_failed: MagicMock,
        mock_gen_csv: MagicMock,
    ) -> None:
        """非 FileProcessingError 异常返回 UploadResult 而非抛出."""
        mock_decode.side_effect = RuntimeError("unexpected decode error")

        importer = CSVBatchImporter()
        db = MagicMock()
        file = _make_upload_file(b"dummy")

        result = importer.batch_import_csv(file, db)

        assert isinstance(result, UploadResult)
        assert result.total == 0
        assert result.success == 0
        assert result.failed == 0


# ---------------------------------------------------------------------------
# _format_validation_error
# ---------------------------------------------------------------------------


class TestFormatValidationError:
    """验证错误格式化测试."""

    def test_delegates_to_format_validation_error(self) -> None:
        importer = CSVBatchImporter.__new__(CSVBatchImporter)
        # 构造一个简单的 ValidationError
        try:
            PropertyIngestionModel(数据源="链家", 房源ID="LJ001")  # 缺少必填字段
        except ValidationError as e:
            result = importer._format_validation_error(e)
            assert isinstance(result, str)
            assert len(result) > 0


# ---------------------------------------------------------------------------
# _save_failed_record
# ---------------------------------------------------------------------------


class TestSaveFailedRecord:
    """失败记录保存测试."""

    @patch("services.market.batch_importer.save_failed_record")
    def test_calls_save_failed_record(self, mock_save: MagicMock) -> None:
        importer = CSVBatchImporter.__new__(CSVBatchImporter)
        row = {"数据源": "链家", "房源ID": "LJ001"}
        db = MagicMock()

        importer._save_failed_record(row, "test error", db)

        mock_save.assert_called_once_with(
            data=row,
            error_message="test error",
            failure_type="csv_validation_error",
            data_source="链家",
        )

    @patch("services.market.batch_importer.save_failed_record")
    def test_data_source_fallback_none(self, mock_save: MagicMock) -> None:
        importer = CSVBatchImporter.__new__(CSVBatchImporter)
        row = {"房源ID": "LJ001"}
        db = MagicMock()

        importer._save_failed_record(row, "error", db)

        mock_save.assert_called_once_with(
            data=row,
            error_message="error",
            failure_type="csv_validation_error",
            data_source=None,
        )


# ---------------------------------------------------------------------------
# _generate_failed_csv
# ---------------------------------------------------------------------------


class TestGenerateFailedCsv:
    """失败 CSV 生成测试."""

    def test_empty_records_returns_none(self) -> None:
        importer = CSVBatchImporter.__new__(CSVBatchImporter)
        result = importer._generate_failed_csv([])
        assert result is None

    def test_generates_file_with_headers(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.chdir(tmp_path)
        importer = CSVBatchImporter.__new__(CSVBatchImporter)

        records = [
            {
                "row_number": 1,
                "data": {"数据源": "链家", "房源ID": "LJ001"},
                "error": "验证失败",
            },
        ]
        original_headers = ["数据源", "房源ID"]

        result = importer._generate_failed_csv(records, original_headers)

        assert result is not None
        assert result.startswith("/api/v1/upload/download/failed_records_")
        assert result.endswith(".csv")

        # 验证文件已创建
        temp_dir = tmp_path / "temp"
        csv_files = list(temp_dir.glob("failed_records_*.csv"))
        assert len(csv_files) == 1

    def test_generates_file_without_headers(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.chdir(tmp_path)
        importer = CSVBatchImporter.__new__(CSVBatchImporter)

        records = [
            {
                "row_number": 1,
                "data": {"数据源": "链家", "房源ID": "LJ001"},
                "error": "验证失败",
            },
        ]

        result = importer._generate_failed_csv(records, original_headers=None)

        assert result is not None

    def test_exception_returns_none(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        importer = CSVBatchImporter.__new__(CSVBatchImporter)

        # 传入不可序列化的数据触发异常
        records = [
            {
                "row_number": 1,
                "data": object(),  # 不可写入 CSV
                "error": "error",
            },
        ]

        result = importer._generate_failed_csv(records)
        assert result is None
