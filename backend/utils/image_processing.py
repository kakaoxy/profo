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

    缩略图命名规则: /static/uploads/xxx.jpg → /static/uploads/thumbs/xxx.webp
    若 URL 不指向 uploads 目录或缩略图文件不存在，返回 None.

    Args:
        url: 原图 URL（相对路径或绝对路径）

    Returns:
        缩略图 URL，或 None

    """
    if not url or "/static/uploads/" not in url:
        return None
    filename = url.rsplit("/", 1)[-1]
    if not filename or "." not in filename:
        return None
    stem = Path(filename).stem
    thumb_rel = f"/static/uploads/thumbs/{stem}.webp"
    thumb_path = Path(settings.upload_dir) / "thumbs" / f"{stem}.webp"
    if thumb_path.exists():
        return thumb_rel
    return None
