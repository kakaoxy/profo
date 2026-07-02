"""图片处理工具：生成 WebP 缩略图."""

import logging
from pathlib import Path

from PIL import Image, UnidentifiedImageError

logger = logging.getLogger(__name__)


def generate_thumbnail(
    source_path: Path,
    target_path: Path,
    max_width: int = 400,
) -> bool:
    """生成 WebP 格式缩略图.

    Args:
        source_path: 原图路径
        target_path: 缩略图目标路径
        max_width: 最大宽度（像素），默认 400

    Returns:
        True 表示生成成功，False 表示失败
    """
    try:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(source_path) as img:
            # 按比例缩放，原图小于 max_width 时不放大
            if img.width > max_width:
                ratio = max_width / img.width
                new_height = int(img.height * ratio)
                img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
            # WebP 支持 RGBA，保留透明背景；调色板模式先转 RGBA
            if img.mode == "P":
                img = img.convert("RGBA")
            img.save(target_path, format="WEBP", quality=80)
        return True
    except (UnidentifiedImageError, OSError, ValueError) as e:
        logger.warning("缩略图生成失败: %s -> %s, 错误: %s", source_path, target_path, e)
        return False
