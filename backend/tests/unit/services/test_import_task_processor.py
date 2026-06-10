"""ImportTaskProcessor 单元测试."""

from unittest.mock import MagicMock, patch

import pytest
from pydantic import ValidationError

from models import ImportTaskStatus
from schemas import PropertyIngestionModel
from services.market.import_task_processor import (
    BATCH_SIZE,
    ImportTaskProcessor,
    get_task_processor,
    start_import_task,
)


# ---------------------------------------------------------------------------
# 辅助函数
# ---------------------------------------------------------------------------


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


def _make_processor() -> ImportTaskProcessor:
    """构造一个 mock 了外部依赖的处理器实例."""
    processor = ImportTaskProcessor.__new__(ImportTaskProcessor)
    processor.importer = MagicMock()
    processor.csv_parser = MagicMock()
    processor.failed_handler = MagicMock()
    processor.engine = MagicMock()
    processor.SessionLocal = MagicMock()
    return processor


def _make_task(
    task_id: str = "test-task-id",
    status: str = "pending",
    file_path: str = "/tmp/test.csv",
) -> MagicMock:
    """构造一个 mock 任务对象."""
    task = MagicMock()
    task.id = task_id
    task.status = status
    task.file_path = file_path
    task.total_records = 0
    return task


# ---------------------------------------------------------------------------
# _prepare_task
# ---------------------------------------------------------------------------


class TestPrepareTask:
    """任务准备阶段测试."""

    def test_task_not_found_returns_false(self) -> None:
        """任务不存在时返回 False."""
        processor = _make_processor()
        db = MagicMock()
        task_service = MagicMock()
        task_service.get_task.return_value = None

        result = processor._prepare_task("nonexistent", db, task_service)

        assert result is False
        task_service.get_task.assert_called_once_with("nonexistent", db)

    def test_cancelled_task_returns_false(self) -> None:
        """已取消任务返回 False."""
        processor = _make_processor()
        db = MagicMock()
        task_service = MagicMock()
        task = _make_task(status=ImportTaskStatus.CANCELLED.value)
        task_service.get_task.return_value = task

        result = processor._prepare_task("task-id", db, task_service)

        assert result is False

    def test_pending_task_updates_to_processing(self) -> None:
        """待处理任务更新状态为 PROCESSING 并返回 True."""
        processor = _make_processor()
        db = MagicMock()
        task_service = MagicMock()
        task = _make_task(status=ImportTaskStatus.PENDING.value)
        task_service.get_task.return_value = task

        result = processor._prepare_task("task-id", db, task_service)

        assert result is True
        task_service.update_task_status.assert_called_once_with(
            "task-id", ImportTaskStatus.PROCESSING, db,
        )


# ---------------------------------------------------------------------------
# _validate_row
# ---------------------------------------------------------------------------


class TestValidateRow:
    """行数据验证测试."""

    def test_valid_row_returns_data(self) -> None:
        """合法行返回验证后的数据和 None 错误."""
        processor = _make_processor()
        row = _make_valid_row()

        result = processor._validate_row(row)

        assert result["error"] is None
        assert isinstance(result["data"], PropertyIngestionModel)

    def test_invalid_row_returns_error(self) -> None:
        """缺少必填字段时返回验证错误信息."""
        processor = _make_processor()
        row = {"数据源": "链家"}  # 缺少多个必填字段

        result = processor._validate_row(row)

        assert result["data"] is None
        assert result["error"] is not None
        assert isinstance(result["error"], str)

    def test_general_exception_returns_error(self) -> None:
        """非 ValidationError 异常也返回错误信息."""
        processor = _make_processor()

        with patch(
            "services.market.import_task_processor.PropertyIngestionModel",
            side_effect=TypeError("unexpected type"),
        ):
            result = processor._validate_row({"any": "data"})

        assert result["data"] is None
        assert "数据验证异常" in result["error"]


# ---------------------------------------------------------------------------
# _import_row
# ---------------------------------------------------------------------------


class TestImportRow:
    """行数据导入测试."""

    def test_import_success(self) -> None:
        """导入成功返回 success=True."""
        processor = _make_processor()
        db = MagicMock()
        validated_data = MagicMock(spec=PropertyIngestionModel)
        processor.importer.import_property.return_value = MagicMock(
            success=True, property_id=1, error=None,
        )

        result = processor._import_row(validated_data, db)

        assert result["success"] is True
        assert result["error"] is None

    def test_import_failure(self) -> None:
        """导入失败返回 success=False 和错误信息."""
        processor = _make_processor()
        db = MagicMock()
        validated_data = MagicMock(spec=PropertyIngestionModel)
        processor.importer.import_property.return_value = MagicMock(
            success=False, property_id=None, error="数据库错误",
        )

        result = processor._import_row(validated_data, db)

        assert result["success"] is False
        assert result["error"] == "数据库错误"

    def test_import_exception(self) -> None:
        """导入抛异常时返回 success=False 和异常信息."""
        processor = _make_processor()
        db = MagicMock()
        validated_data = MagicMock(spec=PropertyIngestionModel)
        processor.importer.import_property.side_effect = RuntimeError("unexpected")

        result = processor._import_row(validated_data, db)

        assert result["success"] is False
        assert "导入异常" in result["error"]


# ---------------------------------------------------------------------------
# _process_single_batch
# ---------------------------------------------------------------------------


class TestProcessSingleBatch:
    """单批次处理测试."""

    def test_all_rows_success(self) -> None:
        """所有行导入成功."""
        processor = _make_processor()
        db = MagicMock()
        rows = [_make_valid_row(), _make_valid_row()]

        # _validate_row 返回合法数据
        validated = MagicMock(spec=PropertyIngestionModel)
        processor._validate_row = MagicMock(return_value={"data": validated, "error": None})
        processor._import_row = MagicMock(return_value={"success": True, "error": None})

        result = processor._process_single_batch("task-id", rows, 0, 2, db)

        assert result["processed"] == 2
        assert result["success"] == 2
        assert result["failed"] == 0
        assert result["failed_records"] == []

    def test_validation_failure_in_batch(self) -> None:
        """验证失败的行计入 failed 并记录失败信息."""
        processor = _make_processor()
        db = MagicMock()
        rows = [{"数据源": "链家"}]  # 缺少必填字段

        processor._validate_row = MagicMock(
            return_value={"data": None, "error": "验证失败"},
        )
        processor._import_row = MagicMock()

        result = processor._process_single_batch("task-id", rows, 0, 1, db)

        assert result["processed"] == 1
        assert result["failed"] == 1
        assert result["success"] == 0
        assert len(result["failed_records"]) == 1
        assert result["failed_records"][0]["row_number"] == 1
        assert result["failed_records"][0]["error"] == "验证失败"
        # 验证失败时不应调用 _import_row
        processor._import_row.assert_not_called()

    def test_import_failure_in_batch(self) -> None:
        """导入失败的行计入 failed 并记录失败信息."""
        processor = _make_processor()
        db = MagicMock()
        rows = [_make_valid_row()]

        validated = MagicMock(spec=PropertyIngestionModel)
        processor._validate_row = MagicMock(return_value={"data": validated, "error": None})
        processor._import_row = MagicMock(
            return_value={"success": False, "error": "数据库错误"},
        )

        result = processor._process_single_batch("task-id", rows, 0, 1, db)

        assert result["failed"] == 1
        assert result["success"] == 0
        assert len(result["failed_records"]) == 1
        assert result["failed_records"][0]["error"] == "数据库错误"

    def test_import_failure_with_none_error(self) -> None:
        """导入失败且 error 为 None 时使用默认错误信息."""
        processor = _make_processor()
        db = MagicMock()
        rows = [_make_valid_row()]

        validated = MagicMock(spec=PropertyIngestionModel)
        processor._validate_row = MagicMock(return_value={"data": validated, "error": None})
        processor._import_row = MagicMock(
            return_value={"success": False, "error": None},
        )

        result = processor._process_single_batch("task-id", rows, 0, 1, db)

        assert result["failed"] == 1
        # error 为 None 时 save_failed_record_sync 应使用 "导入失败"
        processor.failed_handler.save_failed_record_sync.assert_called_once()
        call_args = processor.failed_handler.save_failed_record_sync.call_args
        assert call_args[0][1] == "导入失败"

    def test_row_number_offset(self) -> None:
        """行号应基于 batch_start 偏移计算."""
        processor = _make_processor()
        db = MagicMock()
        # 需要 51 个元素才能让 rows[50:51] 有数据
        rows = [_make_valid_row()] * 51

        validated = MagicMock(spec=PropertyIngestionModel)
        processor._validate_row = MagicMock(return_value={"data": validated, "error": None})
        processor._import_row = MagicMock(return_value={"success": False, "error": "错误"})

        result = processor._process_single_batch("task-id", rows, 50, 51, db)

        # batch_start=50, idx_in_batch=0, global_index = 50 + 0 + 1 = 51
        assert result["failed"] == 1
        assert len(result["failed_records"]) == 1
        assert result["failed_records"][0]["row_number"] == 51


# ---------------------------------------------------------------------------
# _process_batches
# ---------------------------------------------------------------------------


class TestProcessBatches:
    """分批处理测试."""

    def test_single_batch_all_success(self) -> None:
        """单批次全部成功."""
        processor = _make_processor()
        db = MagicMock()
        task_service = MagicMock()
        task = _make_task()
        task_service.get_task.return_value = task

        rows = [_make_valid_row()]
        validated = MagicMock(spec=PropertyIngestionModel)
        processor._validate_row = MagicMock(return_value={"data": validated, "error": None})
        processor._import_row = MagicMock(return_value={"success": True, "error": None})

        result = processor._process_batches("task-id", rows, 1, db, task_service)

        assert result["success"] is True
        assert result["total"] == 1
        assert result["success_count"] == 1
        assert result["failed_count"] == 0
        assert result["failed_records"] == []

    def test_cancelled_task_stops_processing(self) -> None:
        """任务被取消时停止处理并返回 cancelled=True."""
        processor = _make_processor()
        db = MagicMock()
        task_service = MagicMock()

        # 第一次返回正常任务，第二次返回已取消任务
        normal_task = _make_task(status=ImportTaskStatus.PROCESSING.value)
        cancelled_task = _make_task(status=ImportTaskStatus.CANCELLED.value)
        task_service.get_task.side_effect = [normal_task, cancelled_task]

        rows = [_make_valid_row()] * (BATCH_SIZE + 1)  # 超过一个批次
        validated = MagicMock(spec=PropertyIngestionModel)
        processor._validate_row = MagicMock(return_value={"data": validated, "error": None})
        processor._import_row = MagicMock(return_value={"success": True, "error": None})

        result = processor._process_batches("task-id", rows, BATCH_SIZE + 1, db, task_service)

        assert result.get("cancelled") is True

    def test_failed_records_collected(self) -> None:
        """失败记录被正确收集."""
        processor = _make_processor()
        db = MagicMock()
        task_service = MagicMock()
        task = _make_task()
        task_service.get_task.return_value = task

        rows = [_make_valid_row()]
        processor._validate_row = MagicMock(
            return_value={"data": None, "error": "验证失败"},
        )

        result = processor._process_batches("task-id", rows, 1, db, task_service)

        assert result["failed_count"] == 1
        assert len(result["failed_records"]) == 1


# ---------------------------------------------------------------------------
# _execute_import
# ---------------------------------------------------------------------------


class TestExecuteImport:
    """导入执行测试."""

    def test_task_not_found(self) -> None:
        """任务不存在时返回错误."""
        processor = _make_processor()
        db = MagicMock()
        task_service = MagicMock()
        task_service.get_task.return_value = None

        result = processor._execute_import("task-id", db, task_service)

        assert result["success"] is False
        assert result["error"] == "任务不存在"

    def test_successful_import(self) -> None:
        """正常导入流程."""
        processor = _make_processor()
        db = MagicMock()
        task_service = MagicMock()
        task = _make_task()
        task_service.get_task.return_value = task

        rows = [_make_valid_row()]
        headers = list(rows[0].keys())
        processor.csv_parser.parse_file.return_value = (rows, headers)

        validated = MagicMock(spec=PropertyIngestionModel)
        processor._validate_row = MagicMock(return_value={"data": validated, "error": None})
        processor._import_row = MagicMock(return_value={"success": True, "error": None})

        result = processor._execute_import("task-id", db, task_service)

        assert result["success"] is True
        assert result["total"] == 1
        assert result["success_count"] == 1
        # total_records 应被设置
        assert task.total_records == 1
        db.commit.assert_called()

    def test_failed_records_generate_csv(self) -> None:
        """有失败记录时生成失败文件 URL."""
        processor = _make_processor()
        db = MagicMock()
        task_service = MagicMock()
        task = _make_task()
        task_service.get_task.return_value = task

        rows = [_make_valid_row()]
        headers = list(rows[0].keys())
        processor.csv_parser.parse_file.return_value = (rows, headers)

        processor._validate_row = MagicMock(
            return_value={"data": None, "error": "验证失败"},
        )
        processor.failed_handler.generate_failed_csv.return_value = "/api/v1/upload/download/failed.csv"

        result = processor._execute_import("task-id", db, task_service)

        assert result["failed_file_url"] == "/api/v1/upload/download/failed.csv"
        processor.failed_handler.generate_failed_csv.assert_called_once()

    def test_no_failed_records_no_csv(self) -> None:
        """无失败记录时不生成失败文件."""
        processor = _make_processor()
        db = MagicMock()
        task_service = MagicMock()
        task = _make_task()
        task_service.get_task.return_value = task

        rows = [_make_valid_row()]
        headers = list(rows[0].keys())
        processor.csv_parser.parse_file.return_value = (rows, headers)

        validated = MagicMock(spec=PropertyIngestionModel)
        processor._validate_row = MagicMock(return_value={"data": validated, "error": None})
        processor._import_row = MagicMock(return_value={"success": True, "error": None})

        result = processor._execute_import("task-id", db, task_service)

        processor.failed_handler.generate_failed_csv.assert_not_called()
        assert "failed_file_url" not in result


# ---------------------------------------------------------------------------
# _commit_batch
# ---------------------------------------------------------------------------


class TestCommitBatch:
    """批次提交测试."""

    def test_successful_commit(self) -> None:
        """正常提交并更新进度."""
        processor = _make_processor()
        db = MagicMock()
        task_service = MagicMock()

        processor._commit_batch("task-id", 100, 80, 20, 100, db, task_service)

        db.commit.assert_called_once()
        task_service.update_task_progress.assert_called_once_with(
            "task-id", 100, 80, 20, 100, db,
        )

    def test_commit_failure_rollback_and_reraise(self) -> None:
        """提交失败时回滚并重新抛出异常."""
        processor = _make_processor()
        db = MagicMock()
        db.commit.side_effect = RuntimeError("commit failed")
        task_service = MagicMock()

        with pytest.raises(RuntimeError, match="commit failed"):
            processor._commit_batch("task-id", 100, 80, 20, 100, db, task_service)

        db.rollback.assert_called_once()


# ---------------------------------------------------------------------------
# _finalize_task
# ---------------------------------------------------------------------------


class TestFinalizeTask:
    """任务完成阶段测试."""

    def test_cancelled_result(self) -> None:
        """取消结果更新状态为 CANCELLED."""
        processor = _make_processor()
        db = MagicMock()
        task_service = MagicMock()

        processor._finalize_task("task-id", {"cancelled": True}, db, task_service)

        task_service.update_task_status.assert_called_once_with(
            "task-id", ImportTaskStatus.CANCELLED, db,
        )

    def test_success_result(self) -> None:
        """成功结果更新状态为 COMPLETED."""
        processor = _make_processor()
        db = MagicMock()
        task_service = MagicMock()

        processor._finalize_task(
            "task-id",
            {"success": True, "failed_file_url": "/download/failed.csv"},
            db,
            task_service,
        )

        task_service.update_task_status.assert_called_once_with(
            "task-id",
            ImportTaskStatus.COMPLETED,
            db,
            failed_file_url="/download/failed.csv",
        )

    def test_success_result_without_failed_file(self) -> None:
        """成功结果无失败文件时 failed_file_url 为 None."""
        processor = _make_processor()
        db = MagicMock()
        task_service = MagicMock()

        processor._finalize_task(
            "task-id",
            {"success": True},
            db,
            task_service,
        )

        task_service.update_task_status.assert_called_once_with(
            "task-id",
            ImportTaskStatus.COMPLETED,
            db,
            failed_file_url=None,
        )

    def test_failed_result(self) -> None:
        """失败结果更新状态为 FAILED."""
        processor = _make_processor()
        db = MagicMock()
        task_service = MagicMock()

        processor._finalize_task(
            "task-id",
            {"success": False, "error": "导入出错"},
            db,
            task_service,
        )

        task_service.update_task_status.assert_called_once_with(
            "task-id",
            ImportTaskStatus.FAILED,
            db,
            error_message="导入出错",
        )

    def test_failed_result_default_error(self) -> None:
        """失败结果无 error 字段时使用默认错误信息."""
        processor = _make_processor()
        db = MagicMock()
        task_service = MagicMock()

        processor._finalize_task("task-id", {}, db, task_service)

        task_service.update_task_status.assert_called_once_with(
            "task-id",
            ImportTaskStatus.FAILED,
            db,
            error_message="未知错误",
        )


# ---------------------------------------------------------------------------
# _handle_task_error
# ---------------------------------------------------------------------------


class TestHandleTaskError:
    """任务错误处理测试."""

    def test_updates_status_to_failed(self) -> None:
        """更新任务状态为 FAILED 并记录错误信息."""
        processor = _make_processor()
        db = MagicMock()
        task_service = MagicMock()

        processor._handle_task_error("task-id", RuntimeError("崩溃"), db, task_service)

        task_service.update_task_status.assert_called_once_with(
            "task-id",
            ImportTaskStatus.FAILED,
            db,
            error_message="崩溃",
        )

    def test_update_status_failure_does_not_raise(self) -> None:
        """更新状态本身失败时不抛出异常（静默处理）."""
        processor = _make_processor()
        db = MagicMock()
        task_service = MagicMock()
        task_service.update_task_status.side_effect = RuntimeError("db down")

        # 不应抛出异常
        processor._handle_task_error("task-id", RuntimeError("原始错误"), db, task_service)


# ---------------------------------------------------------------------------
# process_task (主入口)
# ---------------------------------------------------------------------------


class TestProcessTask:
    """主流程集成测试."""

    @patch("services.market.import_task_processor.get_import_task_service")
    def test_full_success_flow(self, mock_get_service: MagicMock) -> None:
        """完整成功流程：准备→执行→完成."""
        processor = _make_processor()
        db = MagicMock()
        processor.SessionLocal.return_value = db

        task_service = MagicMock()
        mock_get_service.return_value = task_service

        task = _make_task(status=ImportTaskStatus.PENDING.value)
        task_service.get_task.return_value = task

        rows = [_make_valid_row()]
        headers = list(rows[0].keys())
        processor.csv_parser.parse_file.return_value = (rows, headers)

        validated = MagicMock(spec=PropertyIngestionModel)
        processor._validate_row = MagicMock(return_value={"data": validated, "error": None})
        processor._import_row = MagicMock(return_value={"success": True, "error": None})

        processor.process_task("task-id")

        # 验证最终状态更新为 COMPLETED
        status_calls = task_service.update_task_status.call_args_list
        final_call = status_calls[-1]
        assert final_call[0][1] == ImportTaskStatus.COMPLETED

        # 验证 db 被关闭
        db.close.assert_called_once()

    @patch("services.market.import_task_processor.get_import_task_service")
    def test_prepare_returns_false_skips_execution(self, mock_get_service: MagicMock) -> None:
        """任务不存在时跳过执行."""
        processor = _make_processor()
        db = MagicMock()
        processor.SessionLocal.return_value = db

        task_service = MagicMock()
        mock_get_service.return_value = task_service
        task_service.get_task.return_value = None

        processor.process_task("nonexistent")

        # csv_parser 不应被调用
        processor.csv_parser.parse_file.assert_not_called()
        db.close.assert_called_once()

    @patch("services.market.import_task_processor.get_import_task_service")
    def test_exception_triggers_error_handler(self, mock_get_service: MagicMock) -> None:
        """异常触发错误处理."""
        processor = _make_processor()
        db = MagicMock()
        processor.SessionLocal.return_value = db

        task_service = MagicMock()
        mock_get_service.return_value = task_service

        task = _make_task(status=ImportTaskStatus.PENDING.value)
        task_service.get_task.return_value = task

        # 让 _execute_import 抛出异常
        processor.csv_parser.parse_file.side_effect = RuntimeError("文件读取失败")

        processor.process_task("task-id")

        # 验证错误处理被调用
        task_service.update_task_status.assert_called()
        last_call = task_service.update_task_status.call_args_list[-1]
        assert last_call[0][1] == ImportTaskStatus.FAILED
        db.close.assert_called_once()


# ---------------------------------------------------------------------------
# get_task_processor / start_import_task
# ---------------------------------------------------------------------------


class TestModuleFunctions:
    """模块级函数测试."""

    def test_get_task_processor_singleton(self) -> None:
        """get_task_processor 返回单例."""
        import services.market.import_task_processor as mod

        original = mod._processor
        try:
            mod._processor = None
            with patch.object(ImportTaskProcessor, "__init__", return_value=None):
                p1 = get_task_processor()
                p2 = get_task_processor()
                assert p1 is p2
        finally:
            mod._processor = original

    @patch("services.market.import_task_processor.get_task_processor")
    def test_start_import_task_starts_thread(self, mock_get_processor: MagicMock) -> None:
        """start_import_task 启动后台线程."""
        mock_processor = MagicMock()
        mock_get_processor.return_value = mock_processor

        import threading
        original_thread = threading.Thread

        started_threads = []

        def capture_thread(**kwargs):
            t = original_thread(**kwargs)
            started_threads.append(t)
            return t

        with patch("services.market.import_task_processor.threading.Thread", side_effect=capture_thread):
            start_import_task("test-task-id")

        assert len(started_threads) == 1
        assert started_threads[0].daemon is True
