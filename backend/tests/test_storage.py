"""存储后端抽象层单元测试.

覆盖 LocalStorage / OSSStorage / get_storage_backend 工厂函数。
OSSStorage 通过 mock oss2.Bucket 验证调用，不依赖真实 OSS 服务。
"""

from pathlib import Path
from unittest.mock import patch

import pytest

from utils import storage as storage_module
from utils.storage import LocalStorage, OSSStorage, StorageBackend, get_storage_backend


@pytest.fixture(autouse=True)
def reset_storage_singleton() -> None:
    """每个测试前后重置存储后端单例，避免测试间状态泄漏."""
    storage_module._storage_backend = None


class TestLocalStorage:
    """本地文件系统存储后端测试."""

    def test_upload_returns_correct_url(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """上传后返回 /static/uploads/{key} 格式 URL."""
        monkeypatch.setattr(storage_module.settings, "upload_dir", str(tmp_path))
        storage = LocalStorage()

        src = tmp_path / "source.jpg"
        src.write_bytes(b"fake image content")

        key = "20260722_abc12345.jpg"
        url = storage.upload_file(src, key)

        assert url == f"/static/uploads/{key}"

    def test_file_exists_after_upload(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """上传后 file_exists 返回 True."""
        monkeypatch.setattr(storage_module.settings, "upload_dir", str(tmp_path))
        storage = LocalStorage()

        src = tmp_path / "source.jpg"
        src.write_bytes(b"content")
        key = "test.jpg"
        storage.upload_file(src, key)

        assert storage.file_exists(key) is True

    def test_file_exists_false_for_missing(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """未上传文件 file_exists 返回 False."""
        monkeypatch.setattr(storage_module.settings, "upload_dir", str(tmp_path))
        storage = LocalStorage()

        assert storage.file_exists("nonexistent.jpg") is False

    def test_delete_file_returns_true(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """删除已存在文件返回 True."""
        monkeypatch.setattr(storage_module.settings, "upload_dir", str(tmp_path))
        storage = LocalStorage()

        src = tmp_path / "source.jpg"
        src.write_bytes(b"content")
        key = "test.jpg"
        storage.upload_file(src, key)
        assert storage.file_exists(key)

        assert storage.delete_file(key) is True
        assert storage.file_exists(key) is False

    def test_delete_nonexistent_file_returns_true(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """删除不存在的文件也返回 True（幂等）."""
        monkeypatch.setattr(storage_module.settings, "upload_dir", str(tmp_path))
        storage = LocalStorage()

        assert storage.delete_file("nonexistent.jpg") is True

    def test_upload_creates_nested_dirs(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """上传到子路径时自动创建目录（如 thumbs/xxx.webp）."""
        monkeypatch.setattr(storage_module.settings, "upload_dir", str(tmp_path))
        storage = LocalStorage()

        src = tmp_path / "source.jpg"
        src.write_bytes(b"thumb content")
        key = "thumbs/20260722_abc.webp"
        url = storage.upload_file(src, key)

        assert url == f"/static/uploads/{key}"
        assert storage.file_exists(key) is True

    def test_upload_skips_copy_when_source_in_target(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """源文件已位于 upload_dir/{key} 时跳过复制（save_upload_file 直接写入场景）.

        回归保护：shutil.copy2 对同文件抛 SameFileError，需显式跳过。
        """
        monkeypatch.setattr(storage_module.settings, "upload_dir", str(tmp_path))
        storage = LocalStorage()

        # 模拟 save_upload_file：文件已直接写入 upload_dir/filename
        key = "20260722_abc.jpg"
        file_path = tmp_path / key
        file_path.write_bytes(b"already in place")
        original_bytes = file_path.read_bytes()

        url = storage.upload_file(file_path, key)

        assert url == f"/static/uploads/{key}"
        # 文件内容未被破坏
        assert file_path.read_bytes() == original_bytes

    def test_upload_preserves_file_content(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """上传后目标文件内容与源文件逐字节一致."""
        monkeypatch.setattr(storage_module.settings, "upload_dir", str(tmp_path))
        storage = LocalStorage()

        content = b"\x89PNG\r\n\x1a\n" + bytes(range(256)) * 4
        src = tmp_path / "source.png"
        src.write_bytes(content)
        key = "test.png"

        storage.upload_file(src, key)

        target = tmp_path / key
        assert target.read_bytes() == content

    def test_upload_creates_deep_nested_dirs(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Key 含多级子路径时 mkdir(parents=True) 正确创建全部目录."""
        monkeypatch.setattr(storage_module.settings, "upload_dir", str(tmp_path))
        storage = LocalStorage()

        src = tmp_path / "source.jpg"
        src.write_bytes(b"deep nested content")
        key = "a/b/c/test.jpg"

        url = storage.upload_file(src, key)

        assert url == f"/static/uploads/{key}"
        assert (tmp_path / key).exists()

    def test_upload_to_existing_dir_overwrites(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """同 key 二次上传覆盖旧文件而非报错."""
        monkeypatch.setattr(storage_module.settings, "upload_dir", str(tmp_path))
        storage = LocalStorage()

        key = "overwrite.jpg"
        src1 = tmp_path / "source1.jpg"
        src1.write_bytes(b"old content")
        storage.upload_file(src1, key)

        src2 = tmp_path / "source2.jpg"
        src2.write_bytes(b"new content")
        storage.upload_file(src2, key)

        assert (tmp_path / key).read_bytes() == b"new content"


class TestOSSStorage:
    """OSS 存储后端测试（mock oss2.Bucket，不依赖真实 OSS）."""

    def _setup_oss_settings(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """设置 OSS 相关 settings 字段为测试值."""
        monkeypatch.setattr(storage_module.settings, "oss_access_key_id", "test_ak")
        monkeypatch.setattr(storage_module.settings, "oss_access_key_secret", "test_sk")
        monkeypatch.setattr(storage_module.settings, "oss_endpoint", "oss-cn-shanghai.aliyuncs.com")
        monkeypatch.setattr(storage_module.settings, "oss_bucket_name", "test-bucket")
        monkeypatch.setattr(storage_module.settings, "oss_public_base_url", "https://cdn.example.com")

    def test_upload_file_calls_put_object_from_file(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """upload_file 调用 bucket.put_object_from_file 并返回 CDN URL."""
        self._setup_oss_settings(monkeypatch)

        with patch("oss2.Auth"), patch("oss2.Bucket") as mock_bucket_cls:
            storage = OSSStorage()
            mock_bucket = mock_bucket_cls.return_value

            local_path = tmp_path / "test.jpg"
            local_path.write_bytes(b"fake content")
            key = "20260722_abc.jpg"
            url = storage.upload_file(local_path, key)

            mock_bucket.put_object_from_file.assert_called_once_with(key, str(local_path))
            assert url == f"https://cdn.example.com/{key}"

    def test_file_exists_calls_object_exists(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """file_exists 调用 bucket.object_exists."""
        self._setup_oss_settings(monkeypatch)

        with patch("oss2.Auth"), patch("oss2.Bucket") as mock_bucket_cls:
            storage = OSSStorage()
            mock_bucket = mock_bucket_cls.return_value
            mock_bucket.object_exists.return_value = True

            assert storage.file_exists("test.jpg") is True
            mock_bucket.object_exists.assert_called_once_with("test.jpg")

    def test_file_exists_returns_false(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """object_exists 返回 False 时 file_exists 返回 False."""
        self._setup_oss_settings(monkeypatch)

        with patch("oss2.Auth"), patch("oss2.Bucket") as mock_bucket_cls:
            storage = OSSStorage()
            mock_bucket = mock_bucket_cls.return_value
            mock_bucket.object_exists.return_value = False

            assert storage.file_exists("missing.jpg") is False

    def test_delete_file_calls_delete_object(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """delete_file 调用 bucket.delete_object 并返回 True."""
        self._setup_oss_settings(monkeypatch)

        with patch("oss2.Auth"), patch("oss2.Bucket") as mock_bucket_cls:
            storage = OSSStorage()
            mock_bucket = mock_bucket_cls.return_value

            assert storage.delete_file("test.jpg") is True
            mock_bucket.delete_object.assert_called_once_with("test.jpg")

    def test_init_creates_auth_and_bucket(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """__init__ 使用 oss2.Auth 创建 Bucket."""
        self._setup_oss_settings(monkeypatch)

        with patch("oss2.Auth") as mock_auth_cls, patch("oss2.Bucket") as mock_bucket_cls:
            OSSStorage()

            mock_auth_cls.assert_called_once_with("test_ak", "test_sk")
            mock_bucket_cls.assert_called_once_with(
                mock_auth_cls.return_value,
                "oss-cn-shanghai.aliyuncs.com",
                "test-bucket",
            )

    def test_upload_failure_propagates(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """put_object_from_file 抛异常时异常向上传播（不吞错）."""
        self._setup_oss_settings(monkeypatch)

        with patch("oss2.Auth"), patch("oss2.Bucket") as mock_bucket_cls:
            storage = OSSStorage()
            mock_bucket = mock_bucket_cls.return_value
            mock_bucket.put_object_from_file.side_effect = OSError("OSS upload failed")

            local_path = tmp_path / "test.jpg"
            local_path.write_bytes(b"content")

            with pytest.raises(OSError, match="OSS upload failed"):
                storage.upload_file(local_path, "test.jpg")

    def test_delete_failure_propagates(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """delete_object 抛异常时异常向上传播（当前实现不 catch）."""
        self._setup_oss_settings(monkeypatch)

        with patch("oss2.Auth"), patch("oss2.Bucket") as mock_bucket_cls:
            storage = OSSStorage()
            mock_bucket = mock_bucket_cls.return_value
            mock_bucket.delete_object.side_effect = OSError("OSS delete failed")

            with pytest.raises(OSError, match="OSS delete failed"):
                storage.delete_file("test.jpg")


class TestGetStorageBackend:
    """工厂函数与单例测试."""

    def test_local_mode_returns_local_storage(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """storage_backend=local 时返回 LocalStorage 实例."""
        monkeypatch.setattr(storage_module.settings, "storage_backend", "local")
        backend = get_storage_backend()
        assert isinstance(backend, LocalStorage)

    def test_oss_mode_returns_oss_storage(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """storage_backend=oss 时返回 OSSStorage 实例."""
        monkeypatch.setattr(storage_module.settings, "storage_backend", "oss")
        monkeypatch.setattr(storage_module.settings, "oss_access_key_id", "test_ak")
        monkeypatch.setattr(storage_module.settings, "oss_access_key_secret", "test_sk")
        monkeypatch.setattr(storage_module.settings, "oss_endpoint", "oss-cn-shanghai.aliyuncs.com")
        monkeypatch.setattr(storage_module.settings, "oss_bucket_name", "test-bucket")
        monkeypatch.setattr(storage_module.settings, "oss_public_base_url", "https://cdn.example.com")

        with patch("oss2.Auth"), patch("oss2.Bucket"):
            backend = get_storage_backend()
            assert isinstance(backend, OSSStorage)

    def test_singleton_caching(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """第二次调用返回同一实例（单例缓存）."""
        monkeypatch.setattr(storage_module.settings, "storage_backend", "local")

        first = get_storage_backend()
        second = get_storage_backend()
        assert first is second

    def test_local_storage_satisfies_protocol(self) -> None:
        """LocalStorage 满足 StorageBackend Protocol."""
        assert isinstance(LocalStorage(), StorageBackend)

    def test_oss_storage_satisfies_protocol(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """OSSStorage 满足 StorageBackend Protocol."""
        monkeypatch.setattr(storage_module.settings, "oss_access_key_id", "test_ak")
        monkeypatch.setattr(storage_module.settings, "oss_access_key_secret", "test_sk")
        monkeypatch.setattr(storage_module.settings, "oss_endpoint", "oss-cn-shanghai.aliyuncs.com")
        monkeypatch.setattr(storage_module.settings, "oss_bucket_name", "test-bucket")
        monkeypatch.setattr(storage_module.settings, "oss_public_base_url", "https://cdn.example.com")

        with patch("oss2.Auth"), patch("oss2.Bucket"):
            storage = OSSStorage()
            assert isinstance(storage, StorageBackend)

    def test_unknown_backend_defaults_to_local(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """storage_backend 既非 local 也非 oss 时，else 分支返回 LocalStorage."""
        monkeypatch.setattr(storage_module.settings, "storage_backend", "invalid_value")

        backend = get_storage_backend()

        assert isinstance(backend, LocalStorage)
