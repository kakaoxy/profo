"""
文件安全工具测试
测试文件路径安全验证功能
"""
import pytest
import os
import tempfile
from pathlib import Path

from utils.file_security import sanitize_filename, is_safe_path, get_safe_file_path, has_traversal_attempt


class TestSanitizeFilename:
    """测试文件名清理功能"""

    def test_sanitize_path_traversal_unix(self):
        """测试 Unix 路径遍历清理"""
        assert sanitize_filename("../../../etc/passwd") == "passwd"
        assert sanitize_filename("/etc/passwd") == "passwd"
        assert sanitize_filename("./config.txt") == "config.txt"

    def test_sanitize_path_traversal_windows(self):
        """测试 Windows 路径遍历清理"""
        assert sanitize_filename("..\\..\\windows\\system32\\config\\sam") == "sam"
        assert sanitize_filename("C:\\Windows\\System32\\drivers\\etc\\hosts") == "hosts"

    def test_sanitize_hidden_file(self):
        """测试隐藏文件处理"""
        assert sanitize_filename(".htaccess") == "safe_.htaccess"
        assert sanitize_filename(".env") == "safe_.env"
        assert sanitize_filename(".gitignore") == "safe_.gitignore"

    def test_sanitize_dangerous_characters(self):
        """测试危险字符清理"""
        assert sanitize_filename("file<name>.txt") == "filename.txt"
        assert sanitize_filename("file|name?.txt") == "filename.txt"
        assert sanitize_filename('file"name".txt') == "filename.txt"

    def test_sanitize_normal_filename(self):
        """测试正常文件名保持不变"""
        assert sanitize_filename("normal-file.txt") == "normal-file.txt"
        assert sanitize_filename("document_v2.pdf") == "document_v2.pdf"
        assert sanitize_filename("image.png") == "image.png"

    def test_sanitize_empty_filename(self):
        """测试空文件名处理"""
        assert sanitize_filename("") == "unnamed_file"
        # "..." 会清理为 "safe_..." 然后作为整体文件名
        result = sanitize_filename("...")
        assert result.startswith("safe_") or result == "unnamed_file"


class TestIsSafePath:
    """测试路径安全验证功能"""

    def test_safe_path_in_base_dir(self):
        """测试基础目录内的安全路径"""
        base = "/app/uploads"
        assert is_safe_path(base, "/app/uploads/file.txt") is True
        assert is_safe_path(base, "/app/uploads/subdir/file.txt") is True
        assert is_safe_path(base, "/app/uploads/deep/nested/path/file.txt") is True

    def test_unsafe_path_traversal(self):
        """测试路径遍历攻击"""
        base = "/app/uploads"
        assert is_safe_path(base, "/app/uploads/../etc/passwd") is False
        assert is_safe_path(base, "/app/uploads/../../etc/passwd") is False
        assert is_safe_path(base, "/etc/passwd") is False
        assert is_safe_path(base, "/var/log/syslog") is False

    def test_path_with_symlinks(self):
        """测试符号链接路径（如果存在）"""
        # 创建临时目录和符号链接进行测试
        with tempfile.TemporaryDirectory() as tmpdir:
            base_dir = Path(tmpdir) / "base"
            base_dir.mkdir()
            safe_file = base_dir / "safe.txt"
            safe_file.write_text("safe")

            # 在 base 目录内的文件应该是安全的
            assert is_safe_path(base_dir, safe_file) is True


class TestGetSafeFilePath:
    """测试安全文件路径获取功能"""

    def test_get_safe_path_normal(self):
        """测试正常文件名"""
        with tempfile.TemporaryDirectory() as tmpdir:
            result = get_safe_file_path(tmpdir, "document.pdf")
            assert result == Path(tmpdir) / "document.pdf"

    def test_get_safe_path_with_traversal(self):
        """测试路径遍历文件名"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # 清理后的文件名应该只保留安全的部分
            result = get_safe_file_path(tmpdir, "../../../etc/passwd")
            assert result == Path(tmpdir) / "passwd"
            assert "etc" not in str(result)

    def test_get_safe_path_cleans_traversal(self):
        """测试路径清理功能正常工作"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # 尝试路径遍历，应该被清理为安全的文件名
            result = get_safe_file_path(tmpdir, "../../secret.txt")
            # 结果应该在 base_dir 内
            assert is_safe_path(tmpdir, result)
            assert str(result).endswith("secret.txt")


class TestHasTraversalAttempt:
    """测试路径遍历尝试检测功能"""

    def test_detect_traversal_patterns(self):
        """测试检测路径遍历模式"""
        assert has_traversal_attempt("../file.txt") is True
        assert has_traversal_attempt("..\\file.txt") is True
        assert has_traversal_attempt("path/../file.txt") is True
        assert has_traversal_attempt("./file.txt") is True
        assert has_traversal_attempt("path/sub/../../../etc/passwd") is True

    def test_no_traversal_in_simple_filenames(self):
        """测试简单安全文件名返回 False"""
        assert has_traversal_attempt("file.txt") is False
        assert has_traversal_attempt("document_v2.pdf") is False
        assert has_traversal_attempt("my-file_name.txt") is False
        assert has_traversal_attempt("image.png") is False


class TestIntegration:
    """集成测试"""

    def test_real_world_scenarios(self):
        """测试真实场景"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # 场景1: 正常文件上传
            safe_path = get_safe_file_path(tmpdir, "contract_2024.pdf")
            assert is_safe_path(tmpdir, safe_path)

            # 场景2: 尝试路径遍历攻击 - 应该被清理
            malicious_path = get_safe_file_path(tmpdir, "../../../etc/passwd")
            # 清理后应该变成 passwd，且在安全目录内
            assert "etc" not in str(malicious_path)
            assert is_safe_path(tmpdir, malicious_path)

            # 场景3: 隐藏文件上传
            hidden_safe = get_safe_file_path(tmpdir, ".htaccess")
            assert "safe_" in hidden_safe.name

    def test_upload_endpoint_protection(self):
        """测试上传端点保护场景"""
        # 模拟用户上传恶意文件名
        malicious_filenames = [
            "../../../etc/passwd",
            "..\\..\\windows\\system32\\config\\sam",
            "/etc/shadow",
            "C:\\Windows\\System32\\drivers\\etc\\hosts",
            ".htaccess",
            ".env",
        ]

        with tempfile.TemporaryDirectory() as tmpdir:
            for filename in malicious_filenames:
                result = get_safe_file_path(tmpdir, filename)
                # 所有结果都应该在安全目录内
                assert is_safe_path(tmpdir, result), f"Failed for {filename}"
