"""
任务 2: 文件上传 sanitize_filename() 返回值未使用修复（报告 4.3）

TDD 测试：先写失败测试，再写修复代码。
"""

import os
from pathlib import Path


class TestSafeFilePath:
    """C2.1: 验证恶意路径文件名上传时路径不超出上传目录"""

    def test_normal_filename_returns_safe_path(self, tmp_path):
        from utils.file_security import get_safe_file_path
        base = str(tmp_path)
        path = get_safe_file_path(base, "document.pdf")
        assert path == tmp_path / "document.pdf"

    def test_sanitize_prevents_traversal_then_is_safe(self, tmp_path):
        from utils.file_security import get_safe_file_path
        base = str(tmp_path)
        path = get_safe_file_path(base, "../../../etc/passwd")
        assert path == tmp_path / "passwd"
        assert ".." not in str(path)
        assert path.is_relative_to(tmp_path)

    def test_traversal_with_extension_uses_sanitized_name(self, tmp_path):
        from utils.file_security import get_safe_file_path
        base = str(tmp_path)
        path = get_safe_file_path(base, "../../../etc/passwd.jpg")
        assert path == tmp_path / "passwd.jpg"
        assert ".." not in str(path)
        assert path.is_relative_to(tmp_path)

    def test_windows_traversal_sanitized(self, tmp_path):
        from utils.file_security import get_safe_file_path
        base = str(tmp_path)
        path = get_safe_file_path(base, "..\\..\\windows\\system32\\config\\sam")
        assert path == tmp_path / "sam"
        assert path.is_relative_to(tmp_path)

    def test_is_safe_path_rejects_absolute_outside_path(self, tmp_path):
        from utils.file_security import is_safe_path
        assert not is_safe_path(str(tmp_path), "/etc/passwd")


class TestSanitizeFilenameReturnUsed:
    """C2.2 + C2.3: 验证 sanitize_filename() 返回值被接收和使用，双重扩展名正确处理"""

    def test_sanitize_filename_return_value_assigned(self):
        import inspect
        from routers.common.files import upload_file

        source = inspect.getsource(upload_file)
        lines = source.strip().split("\n")

        has_assignment = False
        for line in lines:
            stripped = line.strip()
            if "sanitize_filename(" in stripped and "=" in stripped:
                has_assignment = True
                break
            if "sanitize_filename(" in stripped and "splitext" in stripped:
                has_assignment = True
                break

        assert has_assignment, (
            "upload_file() 中 sanitize_filename() 返回值未被接收。"
            "必须将返回值赋给变量或直接用于 os.path.splitext()"
        )

    def test_extension_from_sanitized_not_raw_filename(self):
        import inspect
        from routers.common.files import upload_file

        source = inspect.getsource(upload_file)

        assert "get_safe_file_path(" in source, (
            "upload_file() 必须调用 get_safe_file_path() 验证最终保存路径"
        )

    def test_double_extension_handled_correctly(self):
        from utils.file_security import sanitize_filename

        result = sanitize_filename("shell.php.jpg")
        assert result == "shell.php.jpg"

        ext = os.path.splitext(result)[1].lower()
        assert ext == ".jpg"

    def test_path_traversal_sanitized_before_extension_extraction(self):
        from utils.file_security import sanitize_filename

        result = sanitize_filename("../../../etc/passwd.jpg")
        assert result == "passwd.jpg"

        ext = os.path.splitext(result)[1].lower()
        assert ext == ".jpg"


class TestUploadFileIntegration:
    """C2.4: 验证上传流程中 get_safe_file_path 被正确调用"""

    def test_get_safe_file_path_called_during_upload(self):
        from routers.common.files import upload_file
        import routers.common.files as files_module
        from fastapi import Request
        from unittest.mock import patch, MagicMock

        fake_safe_path = Path("static/uploads/20260513_abc12345.jpg")

        with patch.object(files_module, "get_safe_file_path", return_value=fake_safe_path) as mock_get_safe, \
             patch.object(files_module, "filetype") as mock_filetype, \
             patch.object(files_module, "shutil") as mock_shutil, \
             patch.object(files_module, "settings") as mock_settings, \
             patch.object(files_module, "uuid") as mock_uuid:
            mock_settings.allowed_extensions = {".jpg", ".png"}
            mock_settings.allowed_mime_types = {"image/jpeg", "image/png"}
            mock_settings.upload_dir = "static/uploads"
            mock_settings.max_upload_size = 100 * 1024 * 1024

            mock_uuid.uuid4.return_value.hex = "abc12345"

            mock_kind = MagicMock()
            mock_kind.mime = "image/jpeg"
            mock_filetype.guess.return_value = mock_kind

            mock_file = MagicMock()
            mock_file.filename = "../../../etc/malicious.jpg"
            mock_file.file.tell.return_value = 1024
            mock_file.file.read.return_value = b"\xff\xd8\xff"
            mock_file.file.seek = MagicMock()

            mock_request = MagicMock(spec=Request)
            mock_request.url_for.return_value = "/static/uploads/20240101_abc12345.jpg"

            mock_shutil.copyfileobj = MagicMock()

            result = upload_file(
                request=mock_request,
                current_user=MagicMock(),
                file=mock_file,
                db=MagicMock(),
            )

        mock_get_safe.assert_called_once()
        assert result.filename is not None
        assert result.url is not None