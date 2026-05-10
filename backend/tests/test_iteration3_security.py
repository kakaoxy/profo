"""
TDD 测试: 迭代 3 — 文件上传模块安全增强

RED phase: 验证当前代码漏洞 → GREEN phase: 验证修复
"""
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from fastapi import UploadFile, HTTPException
from starlette.requests import Request

from main import app
from dependencies.auth import get_current_user
from utils.file_security import sanitize_filename


class MockRole:
    def __init__(self, code: str = "admin"):
        self.code = code


class MockUser:
    def __init__(self, role_code: str = "admin"):
        self.id = "test-user-123"
        self.username = "test_admin"
        self.nickname = "Test Admin"
        self.status = "active"
        self.role = MockRole(role_code)


# ============================================================================
# 任务 3.1: 文件上传路径遍历保护
# ============================================================================

class TestFilenameSanitization:
    """验证 upload_file 使用 sanitize_filename() 清理文件名"""

    def test_sanitize_filename_called_during_upload(self):
        """
        RED→GREEN: 验证 upload_file 调用了 sanitize_filename()。
        当前代码不调用 → 测试失败(RED)。
        修复后调用 → 测试通过(GREEN)。
        """
        from routers.common.files import upload_file

        with patch("routers.common.files.sanitize_filename") as mock_sanitize:
            mock_sanitize.return_value = "safe_name.pdf"

            with patch("routers.common.files.filetype") as mock_filetype:
                mock_kind = MagicMock()
                mock_kind.mime = "application/pdf"
                mock_filetype.guess.return_value = mock_kind

                with patch("routers.common.files.settings") as mock_settings:
                    mock_settings.allowed_extensions = {".pdf", ".jpg", ".png"}
                    mock_settings.allowed_mime_types = {"application/pdf", "image/jpeg", "image/png"}
                    mock_settings.max_upload_size = 100 * 1024 * 1024
                    mock_settings.upload_dir = "static/uploads"

                    with patch("builtins.open", MagicMock()):
                        with patch("routers.common.files.shutil.copyfileobj"):
                            with patch("routers.common.files.limiter"):
                                mock_file = MagicMock(spec=UploadFile)
                                mock_file.filename = "../../../etc/passwd.pdf"
                                mock_file.file = MagicMock()
                                mock_file.file.seek = MagicMock()
                                mock_file.file.tell.return_value = 100
                                mock_file.file.read.return_value = b"%PDF-1.4"

                                upload_file(
                                    request=MagicMock(spec=Request),
                                    current_user=MagicMock(),
                                    file=mock_file,
                                    db=MagicMock(),
                                )

            mock_sanitize.assert_called_once_with("../../../etc/passwd.pdf")


# ============================================================================
# 任务 3.2: 文件上传异常信息泄漏修复
# ============================================================================

class TestExceptionInfoLeak:
    """验证上传异常不向客户端泄漏系统信息"""

    def test_upload_exception_does_not_leak_system_info(self):
        """
        RED→GREEN: 当前 str(e) 泄漏给客户端。
        修复后仅返回通用错误信息。
        """
        from routers.common.files import upload_file

        mock_file = MagicMock(spec=UploadFile)
        mock_file.filename = "test.pdf"
        mock_file.file = MagicMock()
        mock_file.file.seek = MagicMock()
        mock_file.file.tell.return_value = 100
        mock_file.file.read.return_value = b"%PDF-1.4 fake pdf header"

        with patch("routers.common.files.filetype") as mock_filetype:
            mock_kind = MagicMock()
            mock_kind.mime = "application/pdf"
            mock_filetype.guess.return_value = mock_kind

            with patch("routers.common.files.settings") as mock_settings:
                mock_settings.allowed_extensions = {".pdf"}
                mock_settings.allowed_mime_types = {"application/pdf"}
                mock_settings.max_upload_size = 100 * 1024 * 1024
                mock_settings.upload_dir = "static/uploads"

                with patch("builtins.open", side_effect=OSError("磁盘已满: C:\\data\\uploads\\temp.pdf")):
                    with patch("routers.common.files.limiter"):
                        with pytest.raises(HTTPException) as exc_info:
                            upload_file(
                                request=MagicMock(spec=Request),
                                current_user=MagicMock(),
                                file=mock_file,
                                db=MagicMock(),
                            )

            assert exc_info.value.status_code == 500
            detail = exc_info.value.detail
            assert "C:\\\\data\\\\uploads" not in detail
            assert "磁盘已满" not in detail
            assert "temp.pdf" not in detail
            assert detail == "文件上传失败，请稍后重试"

    def test_upload_exception_logs_full_error(self):
        """
        RED→GREEN: 修复后应使用 logger.exception() 记录完整错误。
        """
        from routers.common.files import upload_file

        mock_file = MagicMock(spec=UploadFile)
        mock_file.filename = "test.pdf"
        mock_file.file = MagicMock()
        mock_file.file.seek = MagicMock()
        mock_file.file.tell.return_value = 100
        mock_file.file.read.return_value = b"%PDF-1.4 fake pdf header"

        with patch("routers.common.files.logger") as mock_logger:
            with patch("routers.common.files.filetype") as mock_filetype:
                mock_kind = MagicMock()
                mock_kind.mime = "application/pdf"
                mock_filetype.guess.return_value = mock_kind

                with patch("routers.common.files.settings") as mock_settings:
                    mock_settings.allowed_extensions = {".pdf"}
                    mock_settings.allowed_mime_types = {"application/pdf"}
                    mock_settings.max_upload_size = 100 * 1024 * 1024
                    mock_settings.upload_dir = "static/uploads"

                    with patch("builtins.open", side_effect=OSError("磁盘已满")):
                        with patch("routers.common.files.limiter"):
                            with pytest.raises(HTTPException):
                                upload_file(
                                    request=MagicMock(spec=Request),
                                    current_user=MagicMock(),
                                    file=mock_file,
                                    db=MagicMock(),
                                )

            mock_logger.exception.assert_called_once()
            assert "文件上传失败" in mock_logger.exception.call_args[0][0]


# ============================================================================
# 任务 3.3: 删除废弃 POST /csv-sync 端点
# ============================================================================

class TestDeprecatedCsvSyncEndpoint:
    """验证废弃的 csv-sync 端点已删除"""

    @pytest.fixture
    def client_with_auth(self):
        """创建带认证覆盖的 test client"""
        user = MockUser("admin")

        def override_get_current_user():
            return user

        app.dependency_overrides[get_current_user] = override_get_current_user

        with TestClient(app) as client:
            yield client

        app.dependency_overrides.pop(get_current_user, None)

    def test_csv_sync_endpoint_returns_404(self, client_with_auth):
        """
        RED→GREEN: 当前端点存在 → 返回非404。
        删除后 → 返回 404。
        """
        response = client_with_auth.post(
            "/api/v1/upload/csv-sync",
            files={"file": ("test.csv", b"test", "text/csv")}
        )
        assert response.status_code == 404

    def test_csv_async_endpoint_still_works(self, client_with_auth):
        """
        验证 POST /api/v1/upload/csv 仍然正常工作。
        """
        response = client_with_auth.post(
            "/api/v1/upload/csv",
            files={"file": ("notcsv.txt", b"not a csv", "text/plain")}
        )
        assert response.status_code == 400
        assert "只支持 CSV 文件格式" in response.text