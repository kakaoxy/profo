"""上传路由集成测试.

覆盖 /api/v1/upload/ 下的 CSV 上传、任务查询、取消、下载等端点.
"""

import io
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

API_PREFIX = "/api/v1/upload"


def _make_csv_file(filename: str = "test.csv", content: bytes = b"header\nrow1\n") -> tuple[str, bytes]:
    """辅助：构造上传文件元组."""
    return filename, content


# ─── 未认证访问 ─────────────────────────────────────────────


class TestUnauthenticatedAccess:
    """未认证用户访问上传端点返回 401."""

    @pytest.fixture()
    def unauth_client(self, seeded_db: dict) -> TestClient:
        """无认证信息的 TestClient."""
        from main import app

        return TestClient(app)

    def test_upload_csv_unauthenticated(self, unauth_client: TestClient) -> None:
        """未认证上传 CSV 返回 401."""
        resp = unauth_client.post(f"{API_PREFIX}/csv", files={"file": _make_csv_file()})
        assert resp.status_code == 401

    def test_get_task_status_unauthenticated(self, unauth_client: TestClient) -> None:
        """未认证查询任务状态返回 401."""
        resp = unauth_client.get(f"{API_PREFIX}/tasks/some-task-id")
        assert resp.status_code == 401

    def test_list_tasks_unauthenticated(self, unauth_client: TestClient) -> None:
        """未认证查询任务列表返回 401."""
        resp = unauth_client.get(f"{API_PREFIX}/tasks")
        assert resp.status_code == 401

    def test_cancel_task_unauthenticated(self, unauth_client: TestClient) -> None:
        """未认证取消任务返回 401."""
        resp = unauth_client.post(f"{API_PREFIX}/tasks/some-task-id/cancel")
        assert resp.status_code == 401

    def test_download_unauthenticated(self, unauth_client: TestClient) -> None:
        """未认证下载文件返回 401."""
        resp = unauth_client.get(f"{API_PREFIX}/download/some-file.csv")
        assert resp.status_code == 401


# ─── 普通用户权限不足 ───────────────────────────────────────


class TestForbiddenAccess:
    """普通用户（role=user）访问上传端点返回 403."""

    def test_upload_csv_forbidden(self, user_client: TestClient) -> None:
        """普通用户上传 CSV 返回 403."""
        resp = user_client.post(f"{API_PREFIX}/csv", files={"file": _make_csv_file()})
        assert resp.status_code == 403

    def test_get_task_status_forbidden(self, user_client: TestClient) -> None:
        """普通用户查询任务状态返回 403."""
        resp = user_client.get(f"{API_PREFIX}/tasks/some-task-id")
        assert resp.status_code == 403

    def test_list_tasks_forbidden(self, user_client: TestClient) -> None:
        """普通用户查询任务列表返回 403."""
        resp = user_client.get(f"{API_PREFIX}/tasks")
        assert resp.status_code == 403

    def test_cancel_task_forbidden(self, user_client: TestClient) -> None:
        """普通用户取消任务返回 403."""
        resp = user_client.post(f"{API_PREFIX}/tasks/some-task-id/cancel")
        assert resp.status_code == 403

    def test_download_forbidden(self, user_client: TestClient) -> None:
        """普通用户下载文件返回 403."""
        resp = user_client.get(f"{API_PREFIX}/download/some-file.csv")
        assert resp.status_code == 403


# ─── POST /csv 上传 CSV ────────────────────────────────────


class TestUploadCsv:
    """POST /upload/csv 上传 CSV 文件."""

    def test_upload_non_csv_file(self, admin_client: TestClient) -> None:
        """非 CSV 文件上传返回 400."""
        resp = admin_client.post(
            f"{API_PREFIX}/csv",
            files={"file": ("test.txt", b"some content", "text/plain")},
        )
        assert resp.status_code == 400
        assert "CSV" in resp.json()["detail"]

    @patch("routers.common.upload.start_import_task")
    @patch("routers.common.upload.get_import_task_service")
    def test_upload_csv_success(self, mock_get_service: MagicMock, mock_start_task: MagicMock, admin_client: TestClient) -> None:
        """上传有效 CSV 文件成功返回任务信息."""
        mock_task = MagicMock()
        mock_task.id = "test-task-uuid"
        mock_task.status = "pending"

        mock_service = MagicMock()
        mock_service.create_task = AsyncMock(return_value=mock_task)
        mock_get_service.return_value = mock_service

        resp = admin_client.post(
            f"{API_PREFIX}/csv",
            files={"file": _make_csv_file("data.csv", b"col1,col2\nval1,val2\n")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["task_id"] == "test-task-uuid"
        assert data["status"] == "pending"
        assert "message" in data

        mock_service.create_task.assert_awaited_once()
        mock_start_task.assert_called_once_with("test-task-uuid")

    @patch("routers.common.upload.start_import_task", side_effect=Exception("后台启动失败"))
    @patch("routers.common.upload.get_import_task_service")
    def test_upload_csv_start_task_fails(self, mock_get_service: MagicMock, mock_start_task: MagicMock, admin_client: TestClient) -> None:
        """后台任务启动失败返回 500."""
        mock_task = MagicMock()
        mock_task.id = "fail-task-uuid"

        mock_service = MagicMock()
        mock_service.create_task = AsyncMock(return_value=mock_task)
        mock_service.update_task_status = MagicMock()
        mock_get_service.return_value = mock_service

        resp = admin_client.post(
            f"{API_PREFIX}/csv",
            files={"file": _make_csv_file("data.csv", b"col1\nval1\n")},
        )
        assert resp.status_code == 500

        mock_service.update_task_status.assert_called_once()


# ─── GET /tasks/{task_id} 查询任务状态 ──────────────────────


class TestGetTaskStatus:
    """GET /upload/tasks/{task_id} 查询任务状态."""

    @patch("routers.common.upload.get_import_task_service")
    def test_task_not_found(self, mock_get_service: MagicMock, admin_client: TestClient) -> None:
        """查询不存在的任务返回 404."""
        mock_service = MagicMock()
        mock_service.get_task.return_value = None
        mock_get_service.return_value = mock_service

        resp = admin_client.get(f"{API_PREFIX}/tasks/nonexistent-id")
        assert resp.status_code == 404

    @patch("routers.common.upload.get_import_task_service")
    def test_task_wrong_user(self, mock_get_service: MagicMock, admin_client: TestClient) -> None:
        """查询其他用户的任务返回 403."""
        mock_task = MagicMock()
        mock_task.user_id = 999  # 不是当前 admin 用户

        mock_service = MagicMock()
        mock_service.get_task.return_value = mock_task
        mock_get_service.return_value = mock_service

        resp = admin_client.get(f"{API_PREFIX}/tasks/other-user-task")
        assert resp.status_code == 403

    @patch("routers.common.upload.get_import_task_service")
    def test_task_success(self, mock_get_service: MagicMock, admin_client: TestClient) -> None:
        """查询自己的任务成功返回状态."""
        admin_user_id = "admin-user"
        mock_task = MagicMock()
        mock_task.user_id = admin_user_id
        mock_task.id = "task-123"
        mock_task.status = "processing"
        mock_task.filename = "data.csv"
        mock_task.total_records = 100
        mock_task.processed_records = 50
        mock_task.success_count = 45
        mock_task.failed_count = 5
        mock_task.progress_percent = 50.0
        mock_task.failed_file_url = None
        mock_task.error_message = None
        mock_task.created_at = datetime.now(timezone.utc)
        mock_task.started_at = datetime.now(timezone.utc)
        mock_task.completed_at = None
        mock_task.processing_duration = None

        mock_service = MagicMock()
        mock_service.get_task.return_value = mock_task
        mock_get_service.return_value = mock_service

        resp = admin_client.get(f"{API_PREFIX}/tasks/task-123")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "processing"
        assert data["filename"] == "data.csv"


# ─── GET /tasks 任务列表 ───────────────────────────────────


class TestListTasks:
    """GET /upload/tasks 获取任务列表."""

    @patch("routers.common.upload.get_import_task_service")
    def test_list_tasks_empty(self, mock_get_service: MagicMock, admin_client: TestClient) -> None:
        """无任务时返回空列表."""
        mock_service = MagicMock()
        mock_service.get_user_tasks.return_value = []
        mock_get_service.return_value = mock_service

        resp = admin_client.get(f"{API_PREFIX}/tasks")
        assert resp.status_code == 200
        assert resp.json() == []

    @patch("routers.common.upload.get_import_task_service")
    def test_list_tasks_with_data(self, mock_get_service: MagicMock, admin_client: TestClient) -> None:
        """有任务时返回列表."""
        mock_task = MagicMock()
        mock_task.id = "task-1"
        mock_task.status = "completed"
        mock_task.filename = "data.csv"
        mock_task.total_records = 10
        mock_task.processed_records = 10
        mock_task.success_count = 10
        mock_task.failed_count = 0
        mock_task.progress_percent = 100.0
        mock_task.failed_file_url = None
        mock_task.error_message = None
        mock_task.created_at = datetime.now(timezone.utc)
        mock_task.started_at = datetime.now(timezone.utc)
        mock_task.completed_at = datetime.now(timezone.utc)
        mock_task.processing_duration = 1.5

        mock_service = MagicMock()
        mock_service.get_user_tasks.return_value = [mock_task]
        mock_get_service.return_value = mock_service

        resp = admin_client.get(f"{API_PREFIX}/tasks")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["status"] == "completed"

    @patch("routers.common.upload.get_import_task_service")
    def test_list_tasks_with_status_filter(self, mock_get_service: MagicMock, admin_client: TestClient) -> None:
        """按状态筛选任务."""
        mock_service = MagicMock()
        mock_service.get_user_tasks.return_value = []
        mock_get_service.return_value = mock_service

        resp = admin_client.get(f"{API_PREFIX}/tasks", params={"status": "completed"})
        assert resp.status_code == 200
        mock_service.get_user_tasks.assert_called_once()
        call_kwargs = mock_service.get_user_tasks.call_args
        assert call_kwargs.kwargs.get("status") == "completed" or call_kwargs[1].get("status") == "completed"


# ─── POST /tasks/{task_id}/cancel 取消任务 ─────────────────


class TestCancelTask:
    """POST /upload/tasks/{task_id}/cancel 取消任务."""

    @patch("routers.common.upload.get_import_task_service")
    def test_cancel_success(self, mock_get_service: MagicMock, admin_client: TestClient) -> None:
        """取消待处理任务成功."""
        mock_service = MagicMock()
        mock_service.cancel_task.return_value = True
        mock_get_service.return_value = mock_service

        resp = admin_client.post(f"{API_PREFIX}/tasks/task-123/cancel")
        assert resp.status_code == 200
        data = resp.json()
        assert data["message"] == "任务已取消"
        assert data["task_id"] == "task-123"

    @patch("routers.common.upload.get_import_task_service")
    def test_cancel_non_cancellable_task(self, mock_get_service: MagicMock, admin_client: TestClient) -> None:
        """无法取消的任务返回 400."""
        mock_service = MagicMock()
        mock_service.cancel_task.return_value = False
        mock_get_service.return_value = mock_service

        resp = admin_client.post(f"{API_PREFIX}/tasks/task-456/cancel")
        assert resp.status_code == 400


# ─── GET /download/{filename} 下载失败记录 ──────────────────


class TestDownloadFile:
    """GET /upload/download/{filename} 下载失败记录文件."""

    def test_download_nonexistent_file(self, admin_client: TestClient) -> None:
        """下载不存在的文件返回 404."""
        resp = admin_client.get(f"{API_PREFIX}/download/nonexistent-file.csv")
        assert resp.status_code == 404

    def test_download_traversal_filename(self, admin_client: TestClient) -> None:
        """目录遍历文件名返回 400 或 403."""
        resp = admin_client.get(f"{API_PREFIX}/download/..%5C..%5Cetc%5Cpasswd")
        assert resp.status_code in (400, 403, 404)
