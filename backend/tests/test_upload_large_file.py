"""500MB 视频上传在同步线程池模型下的内存/超时行为验证.

验证内容：
1. max_upload_size 边界（500MB 恰好通过 / 500MB+1 拒绝 / 0 字节拒绝）
2. MIME 嗅探仅读前 2KB（不全量加载文件到内存）
3. 视频扩展名的 MIME 检测逻辑
4. shutil.copyfileobj 流式写入（不通过 read() 全量加载）
5. 视频跳过缩略图生成
6. upload_file 路由是 sync def（由 FastAPI anyio threadpool 执行）

不实际写 500MB 文件，使用 _VirtualLargeFile 模拟大文件大小。
"""

import inspect
import io
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from routers.common import files as files_module
from routers.common.files import save_upload_file, upload_file
from services.system.exceptions import ValidationError
from utils import storage as storage_module

_MAX_SIZE = 524288000  # 500MB


class _VirtualLargeFile(io.BytesIO):
    """模拟大文件的 BytesIO，seek(0,2)+tell() 返回 declared_size 而非实际内容长度.

    实际内容保持小体积（仅含 MIME 头），但对外报告 declared_size 作为文件大小。
    read/copyfileobj 正常读取实际内容。
    """

    def __init__(self, content: bytes, declared_size: int) -> None:
        super().__init__(content)
        self._declared_size = max(declared_size, len(content))
        self._fake_size_mode = False

    def seek(self, offset: int = 0, whence: int = 0) -> int:
        if whence == 2:  # SEEK_END
            self._fake_size_mode = True
            return self._declared_size + offset
        self._fake_size_mode = False
        return super().seek(offset, whence)

    def tell(self) -> int:
        if self._fake_size_mode:
            return self._declared_size
        return super().tell()

    def read(self, size: int = -1) -> bytes:
        self._fake_size_mode = False
        return super().read(size)


class _FakeUploadFile:
    """模拟 Starlette UploadFile，支持 seek/tell/read/copyfileobj."""

    def __init__(self, filename: str, content: bytes, declared_size: int | None = None) -> None:
        self.filename = filename
        self.file = _VirtualLargeFile(content, declared_size or len(content))


@pytest.fixture(autouse=True)
def reset_storage_and_settings(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """每个测试重置存储单例并设置基础 upload_dir."""
    storage_module._storage_backend = None
    monkeypatch.setattr(files_module.settings, "upload_dir", str(tmp_path))
    monkeypatch.setattr(files_module.settings, "storage_backend", "local")
    monkeypatch.setattr(files_module.settings, "max_upload_size", _MAX_SIZE)


def _mock_request() -> MagicMock:
    """save_upload_file 的 request 参数未使用，返回 mock."""
    return MagicMock()


# ---------------------------------------------------------------------------
# max_upload_size 边界测试
# ---------------------------------------------------------------------------


class TestMaxUploadSizeBoundary:
    """max_upload_size 边界验证（500MB）."""

    def test_exact_max_size_passes(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """文件恰好 500MB → 不触发 ValidationError."""
        # mock filetype 返回 video/mp4（合法 MIME）
        mock_kind = MagicMock()
        mock_kind.mime = "video/mp4"
        content = b"\x00" * 4096  # 4KB 实际内容
        upload = _FakeUploadFile("test.mp4", content, declared_size=_MAX_SIZE)

        with (
            patch("routers.common.files.filetype.guess", return_value=mock_kind),
            patch("routers.common.files.get_storage_backend") as mock_get_storage,
        ):
            mock_get_storage.return_value.upload_file.return_value = "/static/uploads/test.mp4"
            result = save_upload_file(upload, _mock_request())

        assert result.filename.endswith(".mp4")

    def test_exceeds_max_size_fails(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """文件 500MB+1 → ValidationError 且消息含 524288000."""
        content = b"\x00" * 4096
        upload = _FakeUploadFile("test.mp4", content, declared_size=_MAX_SIZE + 1)

        with pytest.raises(ValidationError, match="524288000"):
            save_upload_file(upload, _mock_request())

    def test_zero_size_fails(self) -> None:
        """空文件 → ValidationError（filetype 无法识别）."""
        upload = _FakeUploadFile("test.mp4", b"", declared_size=0)

        with pytest.raises(ValidationError, match="无法识别"):
            save_upload_file(upload, _mock_request())


# ---------------------------------------------------------------------------
# SpooledTemporaryFile / MIME 嗅探行为测试
# ---------------------------------------------------------------------------


class TestSpooledTemporaryFileBehavior:
    """验证 MIME 嗅探仅读前 2KB，不全量加载文件."""

    def test_only_2kb_read_for_mime(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """filetype.guess 收到的 header 最多 2048 字节."""
        content = b"\x00" * 4096  # 4KB 内容
        upload = _FakeUploadFile("test.mp4", content, declared_size=_MAX_SIZE)

        mock_kind = MagicMock()
        mock_kind.mime = "video/mp4"
        captured_headers: list[bytes] = []

        def capture_guess(header: bytes) -> MagicMock:
            captured_headers.append(header)
            return mock_kind

        with (
            patch("routers.common.files.filetype.guess", side_effect=capture_guess),
            patch("routers.common.files.get_storage_backend") as mock_get_storage,
        ):
            mock_get_storage.return_value.upload_file.return_value = "/static/uploads/test.mp4"
            save_upload_file(upload, _mock_request())

        assert len(captured_headers) == 1
        assert len(captured_headers[0]) <= 2048

    def test_read_never_called_without_args(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """file.file.read() 无参调用（全量加载）不被触发.

        copyfileobj 使用 read(length) 分块读取，MIME 嗅探使用 read(2048)。
        read(-1) 或 read() 无参表示全量读取，会加载 500MB 到内存。
        """
        content = b"\x00" * 4096
        upload = _FakeUploadFile("test.mp4", content, declared_size=_MAX_SIZE)
        read_calls: list[int | None] = []

        original_read = upload.file.read

        def spy_read(size: int = -1) -> bytes:
            read_calls.append(size)
            return original_read(size)

        upload.file.read = spy_read  # type: ignore[method-assign]

        mock_kind = MagicMock()
        mock_kind.mime = "video/mp4"
        with (
            patch("routers.common.files.filetype.guess", return_value=mock_kind),
            patch("routers.common.files.get_storage_backend") as mock_get_storage,
        ):
            mock_get_storage.return_value.upload_file.return_value = "/static/uploads/test.mp4"
            save_upload_file(upload, _mock_request())

        # 不应有 read() 无参或 read(-1) 调用（会全量加载）
        for size in read_calls:
            assert size > 0, f"read({size}) 可能全量加载文件到内存"


# ---------------------------------------------------------------------------
# 视频上传 MIME 检测测试
# ---------------------------------------------------------------------------


class TestVideoUploadMimeSniff:
    """视频扩展名的 MIME 检测逻辑."""

    def test_mp4_with_video_mime_passes(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """.mp4 扩展名 + video/mp4 MIME → 上传成功."""
        mock_kind = MagicMock()
        mock_kind.mime = "video/mp4"
        content = b"\x00" * 4096
        upload = _FakeUploadFile("test.mp4", content, declared_size=_MAX_SIZE)

        with (
            patch("routers.common.files.filetype.guess", return_value=mock_kind),
            patch("routers.common.files.get_storage_backend") as mock_get_storage,
        ):
            mock_get_storage.return_value.upload_file.return_value = "/static/uploads/test.mp4"
            result = save_upload_file(upload, _mock_request())

        assert result.filename.endswith(".mp4")

    def test_mp4_with_wrong_mime_fails(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """.mp4 扩展名 + 非法 MIME → ValidationError."""
        mock_kind = MagicMock()
        mock_kind.mime = "application/octet-stream"  # 不在 allowed_mime_types 中
        content = b"\x00" * 4096
        upload = _FakeUploadFile("test.mp4", content, declared_size=_MAX_SIZE)

        with (
            patch("routers.common.files.filetype.guess", return_value=mock_kind),
            pytest.raises(ValidationError, match="application/octet-stream"),
        ):
            save_upload_file(upload, _mock_request())

    def test_mov_with_quicktime_mime_passes(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """.mov 扩展名 + video/quicktime MIME → 上传成功."""
        mock_kind = MagicMock()
        mock_kind.mime = "video/quicktime"
        content = b"\x00" * 4096
        upload = _FakeUploadFile("test.mov", content, declared_size=_MAX_SIZE)

        with (
            patch("routers.common.files.filetype.guess", return_value=mock_kind),
            patch("routers.common.files.get_storage_backend") as mock_get_storage,
        ):
            mock_get_storage.return_value.upload_file.return_value = "/static/uploads/test.mov"
            result = save_upload_file(upload, _mock_request())

        assert result.filename.endswith(".mov")

    def test_webm_with_webm_mime_passes(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """.webm 扩展名 + video/webm MIME → 上传成功."""
        mock_kind = MagicMock()
        mock_kind.mime = "video/webm"
        content = b"\x00" * 4096
        upload = _FakeUploadFile("test.webm", content, declared_size=_MAX_SIZE)

        with (
            patch("routers.common.files.filetype.guess", return_value=mock_kind),
            patch("routers.common.files.get_storage_backend") as mock_get_storage,
        ):
            mock_get_storage.return_value.upload_file.return_value = "/static/uploads/test.webm"
            result = save_upload_file(upload, _mock_request())

        assert result.filename.endswith(".webm")


# ---------------------------------------------------------------------------
# 流式行为测试
# ---------------------------------------------------------------------------


class TestStreamingBehavior:
    """验证流式写入与缩略图跳过."""

    def test_copyfileobj_is_used(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """shutil.copyfileobj 被调用（而非 file.read() 全量加载）."""
        content = b"\x00" * 4096
        upload = _FakeUploadFile("test.mp4", content, declared_size=_MAX_SIZE)

        mock_kind = MagicMock()
        mock_kind.mime = "video/mp4"
        with (
            patch("routers.common.files.filetype.guess", return_value=mock_kind),
            patch("routers.common.files.shutil.copyfileobj") as mock_copyfileobj,
            patch("routers.common.files.get_storage_backend") as mock_get_storage,
        ):
            mock_get_storage.return_value.upload_file.return_value = "/static/uploads/test.mp4"
            save_upload_file(upload, _mock_request())

        mock_copyfileobj.assert_called_once()

    def test_video_skips_thumbnail(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """视频扩展名上传后 generate_thumbnail 不被调用."""
        mock_kind = MagicMock()
        mock_kind.mime = "video/mp4"
        content = b"\x00" * 4096
        upload = _FakeUploadFile("test.mp4", content, declared_size=_MAX_SIZE)

        with (
            patch("routers.common.files.filetype.guess", return_value=mock_kind),
            patch("routers.common.files.generate_thumbnail") as mock_thumb,
            patch("routers.common.files.get_storage_backend") as mock_get_storage,
        ):
            mock_get_storage.return_value.upload_file.return_value = "/static/uploads/test.mp4"
            save_upload_file(upload, _mock_request())

        mock_thumb.assert_not_called()

    def test_image_triggers_thumbnail(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """图片扩展名上传后 generate_thumbnail 被调用."""
        mock_kind = MagicMock()
        mock_kind.mime = "image/jpeg"
        content = b"\x00" * 4096
        upload = _FakeUploadFile("test.jpg", content, declared_size=1024)

        with (
            patch("routers.common.files.filetype.guess", return_value=mock_kind),
            patch("routers.common.files.generate_thumbnail", return_value=True) as mock_thumb,
            patch("routers.common.files.get_storage_backend") as mock_get_storage,
        ):
            mock_get_storage.return_value.upload_file.return_value = "/static/uploads/test.jpg"
            save_upload_file(upload, _mock_request())

        mock_thumb.assert_called_once()


# ---------------------------------------------------------------------------
# 同步线程池契约测试
# ---------------------------------------------------------------------------


class TestSyncThreadpoolContract:
    """验证上传路由是 sync def（由 FastAPI anyio threadpool 执行）."""

    def test_upload_route_is_sync_def(self) -> None:
        """upload_file 是同步函数，非 async def.

        sync def 路由由 FastAPI 自动放入 anyio threadpool（默认 40 线程/worker）执行，
        不会阻塞事件循环。误改为 async def 会导致大文件上传阻塞所有请求。
        """
        assert not inspect.iscoroutinefunction(upload_file), (
            "upload_file 应为 sync def，async def 会导致大文件上传阻塞事件循环"
        )

    def test_save_upload_file_does_not_load_full_file(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """500MB 文件上传时 read(2048) 仅调用一次（MIME 嗅探），无全量 read()."""
        content = b"\x00" * 4096  # 4KB 实际内容
        upload = _FakeUploadFile("test.mp4", content, declared_size=_MAX_SIZE)
        read_calls: list[int | None] = []

        original_read = upload.file.read

        def spy_read(size: int = -1) -> bytes:
            read_calls.append(size)
            return original_read(size)

        upload.file.read = spy_read  # type: ignore[method-assign]

        mock_kind = MagicMock()
        mock_kind.mime = "video/mp4"
        with (
            patch("routers.common.files.filetype.guess", return_value=mock_kind),
            patch("routers.common.files.get_storage_backend") as mock_get_storage,
        ):
            mock_get_storage.return_value.upload_file.return_value = "/static/uploads/test.mp4"
            save_upload_file(upload, _mock_request())

        # MIME 嗅探：read(2048) 应出现
        assert 2048 in read_calls, "应调用 read(2048) 进行 MIME 嗅探"

        # 不应有 read() 无参或 read(-1) 调用
        for size in read_calls:
            assert size is not None, f"read({size}) 可能全量加载文件到内存，500MB 文件应流式处理"
            assert size != -1, f"read({size}) 可能全量加载文件到内存，500MB 文件应流式处理"
