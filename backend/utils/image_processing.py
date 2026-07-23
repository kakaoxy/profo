"""图片处理工具：生成 WebP 缩略图."""

import logging
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from settings import settings

logger = logging.getLogger(__name__)


def generate_thumbnail(
    source_path: Path,
    target_path: Path,
    max_width: int = 800,
) -> bool:
    """生成 WebP 格式缩略图.

    Args:
        source_path: 原图路径
        target_path: 缩略图目标路径
        max_width: 最大宽度（像素），默认 800

    Returns:
        True 表示生成成功，False 表示失败

    Note:
        800px 宽度适用于轮播图展示（1200px 容器，略放大但可接受），
        同时兼顾网格缩略图（64-200px，浏览器缩放）。
        WebP quality=80 时，800px 图片约 100-200KB，远小于 3MB+ 原图。

    """
    try:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(source_path) as src_img:
            # 按比例缩放，原图小于 max_width 时不放大
            img = src_img
            if img.width > max_width:
                ratio = max_width / img.width
                new_height = int(img.height * ratio)
                img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
            # WebP 支持 RGBA，保留透明背景；调色板模式先转 RGBA
            if img.mode == "P":
                img = img.convert("RGBA")
            img.save(target_path, format="WEBP", quality=80)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as e:
        logger.warning("缩略图生成失败: %s -> %s, 错误: %s", source_path, target_path, e)
        return False
    else:
        return True


def derive_thumbnail_url(url: str | None) -> str | None:
    """从原图 URL 推导缩略图 URL.

    缩略图命名规则:
    - local 模式: /static/uploads/xxx.jpg → /static/uploads/thumbs/xxx.webp
    - oss 模式:   {oss_public_base_url}/xxx.jpg → {oss_public_base_url}/thumbs/xxx.webp

    local 模式下检查本地文件是否存在; oss 模式下按命名约定推导（缩略图在
    上传时同步生成, 无需也不应在此发起 OSS HEAD 请求, 避免列表接口延迟）.

    Args:
        url: 原图 URL（相对路径或绝对路径）

    Returns:
        缩略图 URL，或 None（URL 不属于已知存储后端、文件名无扩展名、
        或 local 模式下缩略图文件不存在时）

    """
    if not url:
        return None

    if settings.storage_backend == "oss":
        return _derive_oss_thumbnail_url(url)
    return _derive_local_thumbnail_url(url)


def _derive_local_thumbnail_url(url: str) -> str | None:
    """local 模式: 检查本地缩略图文件是否存在."""
    if "/static/uploads/" not in url:
        return None
    # 去除 query string（如 /static/uploads/xxx.jpg?v=1），避免污染文件名提取
    path = url.split("?", 1)[0]
    filename = path.rsplit("/", 1)[-1]
    if not filename or "." not in filename:
        return None
    stem = Path(filename).stem
    thumb_rel = f"/static/uploads/thumbs/{stem}.webp"
    thumb_path = Path(settings.upload_dir) / "thumbs" / f"{stem}.webp"
    if thumb_path.exists():
        return thumb_rel
    return None


def _derive_oss_thumbnail_url(url: str) -> str | None:
    """oss 模式: 按 OSS 命名约定推导缩略图 URL（不做存在性检查）.

    OSS URL 格式: {oss_public_base_url}/{key}, key 形如 20260722_abc.jpg.
    缩略图 key: thumbs/{stem}.webp, 对应 URL: {base}/thumbs/{stem}.webp.

    注：会先剥离 query string（签名 URL 的 ?Expires=...&Signature=...、
    图片处理参数 ?x-oss-process=...），否则 stem 提取会包含查询串导致
    推导出错误的缩略图 URL。
    """
    base_url = (settings.oss_public_base_url or "").rstrip("/")
    if not base_url or not url.startswith(base_url):
        return None
    # 提取 key: https://cdn.example.com/{key} -> {key}，并剥离 query string
    key = url[len(base_url) :].lstrip("/").split("?", 1)[0]
    filename = key.rsplit("/", 1)[-1]
    if not filename or "." not in filename:
        return None
    stem = Path(filename).stem
    return f"{base_url}/thumbs/{stem}.webp"
