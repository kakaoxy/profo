"""存储后端抽象层.

提供本地文件系统与阿里云 OSS 两种存储后端的统一接口。
通过 settings.storage_backend 切换，业务代码无感知。

设计要点：
- StorageBackend 为 Protocol，LocalStorage/OSSStorage 为具体实现
- get_storage_backend() 工厂函数返回单例，避免重复初始化 OSS 客户端
- OSSStorage 延迟导入 oss2，local 模式下无需安装 oss2
"""

import logging
import re
import shutil
from pathlib import Path
from typing import Protocol, runtime_checkable

from settings import settings

logger = logging.getLogger(__name__)


@runtime_checkable
class StorageBackend(Protocol):
    """存储后端协议，定义文件上传/删除/查询的统一接口."""

    def upload_file(self, local_path: Path, key: str) -> str:
        """上传本地文件到存储，返回访问 URL.

        Args:
            local_path: 本地文件路径
            key: 存储键（相对路径，如 20260722_abc.jpg 或 thumbs/20260722_abc.webp）

        Returns:
            文件访问 URL

        """
        ...

    def delete_file(self, key: str) -> bool:
        """删除文件，返回是否删除成功（幂等）.

        Args:
            key: 存储键

        Returns:
            是否删除成功

        """
        ...

    def file_exists(self, key: str) -> bool:
        """检查文件是否存在.

        Args:
            key: 存储键

        Returns:
            文件是否存在

        """
        ...


class LocalStorage:
    """本地文件系统存储后端."""

    def upload_file(self, local_path: Path, key: str) -> str:
        """复制本地文件到 upload_dir，返回 /static/uploads/{key}.

        当 local_path 已位于 upload_dir/{key} 时（save_upload_file 直接写入
        upload_dir 的场景）跳过复制：shutil.copy2 对同文件会抛 SameFileError。
        """
        target_path = Path(settings.upload_dir) / key
        if local_path.resolve() == target_path.resolve():
            return f"/static/uploads/{key}"
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(local_path, target_path)
        return f"/static/uploads/{key}"

    def file_exists(self, key: str) -> bool:
        """检查文件是否存在于 upload_dir."""
        return (Path(settings.upload_dir) / key).exists()

    def delete_file(self, key: str) -> bool:
        """删除文件（幂等，文件不存在也返回 True）."""
        target = Path(settings.upload_dir) / key
        target.unlink(missing_ok=True)
        return True


class OSSStorage:
    """阿里云 OSS 存储后端."""

    def __init__(self) -> None:
        """初始化 OSS Bucket 客户端."""
        import oss2

        auth = oss2.Auth(settings.oss_access_key_id, settings.oss_access_key_secret)
        self._bucket = oss2.Bucket(auth, settings.oss_endpoint, settings.oss_bucket_name)

    def upload_file(self, local_path: Path, key: str) -> str:
        """上传文件到 OSS，返回公网/CDN URL.

        注意：阿里云对 2022 年后新建的 public-read Bucket 强制返回
        Content-Disposition: attachment，导致浏览器下载而非内联显示。
        后续绑定 CDN/自定义域名后可解决此问题。
        """
        self._bucket.put_object_from_file(key, str(local_path))
        return f"{settings.oss_public_base_url}/{key}"

    def file_exists(self, key: str) -> bool:
        """检查 OSS 对象是否存在."""
        return self._bucket.object_exists(key)

    def delete_file(self, key: str) -> bool:
        """删除 OSS 对象（幂等，不存在返回 204）."""
        self._bucket.delete_object(key)
        return True


# 本地静态文件 URL 前缀（与 LocalStorage.upload_file 的返回值约定一致）
_STATIC_UPLOADS_PREFIX = "/static/uploads/"

# 存储键白名单：首字符为字母/数字，其余允许字母/数字/点/下划线/连字符/斜杠。
# 借此排除 .. 与反斜杠等路径穿越写法，避免 delete_file 被用于删除任意路径。
_STORAGE_KEY_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]*$")


def extract_storage_key(url: str | None) -> str | None:
    """从文件访问 URL 反解出存储键（即 ``upload_file`` 的 ``key``）.

    支持两种形态（与 ``upload_file`` 的返回值互为逆运算）：
    - local: ``/static/uploads/{key}``
    - oss:   ``{settings.oss_public_base_url}/{key}``

    无法识别、或 key 不安全（含 ``..`` / 反斜杠 / 非法字符）时返回 None，
    调用方据此跳过删除，避免误删任意路径。

    Examples:
        >>> extract_storage_key("/static/uploads/20260722_abc.pdf")
        '20260722_abc.pdf'

    """
    if not url:
        return None

    # 剥离 query string / fragment（图片处理参数、签名 URL 参数）
    candidate = url.strip().split("?", 1)[0].split("#", 1)[0]

    if candidate.startswith(_STATIC_UPLOADS_PREFIX):
        key = candidate[len(_STATIC_UPLOADS_PREFIX) :]
    else:
        base = (settings.oss_public_base_url or "").rstrip("/")
        # 必须匹配 `{base}/` 前缀：可挡住 https://cdn.example.com.evil.com 这类前缀绕过
        if not base or not candidate.startswith(f"{base}/"):
            return None
        key = candidate[len(base) + 1 :]

    if not key or ".." in key or "\\" in key or not _STORAGE_KEY_PATTERN.match(key):
        return None
    return key


_storage_backend: StorageBackend | None = None


def get_storage_backend() -> StorageBackend:
    """获取存储后端单例.

    根据 settings.storage_backend 返回对应实现，模块级缓存。
    多 worker 下每个 worker 进程独立持有实例。
    """
    global _storage_backend
    if _storage_backend is not None:
        return _storage_backend

    _storage_backend = OSSStorage() if settings.storage_backend == "oss" else LocalStorage()
    logger.info("存储后端初始化: %s", settings.storage_backend)
    return _storage_backend
