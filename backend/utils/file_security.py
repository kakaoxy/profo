"""
文件安全工具模块
提供文件名清理、路径安全验证等功能，防止目录遍历攻击
"""
import os
import re
from pathlib import Path


def sanitize_filename(filename: str) -> str:
    """
    清理文件名，移除路径遍历字符和危险字符

    Args:
        filename: 原始文件名

    Returns:
        清理后的安全文件名

    Examples:
        >>> sanitize_filename("../../../etc/passwd")
        'passwd'
        >>> sanitize_filename("..\\\\..\\\\windows\\\\system32\\\\config\\\\sam")
        'sam'
        >>> sanitize_filename(".htaccess")
        'safe_.htaccess'
        >>> sanitize_filename("normal-file.txt")
        'normal-file.txt'
    """
    # 1. 移除路径分隔符（Unix 和 Windows）
    # 将 \ 和 / 统一替换为统一的占位符，然后分割
    filename = filename.replace("\\", "/")

    # 2. 处理路径遍历序列
    # 移除 ../ 和 ./ 序列
    while "../" in filename or "./" in filename:
        filename = filename.replace("../", "")
        filename = filename.replace("./", "")

    # 3. 如果还有 /，只保留最后一部分（文件名）
    if "/" in filename:
        filename = filename.split("/")[-1]

    # 4. 移除危险字符（保留字母、数字、点、连字符、下划线）
    # 但保留点用于文件扩展名
    filename = re.sub(r'[^a-zA-Z0-9._-]', '', filename)

    # 5. 处理以点开头的文件（隐藏文件风险）
    if filename.startswith("."):
        filename = "safe_" + filename

    # 6. 处理空文件名
    if not filename or filename == "safe_":
        filename = "unnamed_file"

    return filename


def is_safe_path(base_dir: str | Path, target_path: str | Path) -> bool:
    """
    验证目标路径是否在基础目录内，防止目录遍历

    Args:
        base_dir: 基础目录（应为绝对路径）
        target_path: 目标路径（应为绝对路径）

    Returns:
        如果目标路径在基础目录内返回 True，否则返回 False

    Examples:
        >>> is_safe_path("/app/uploads", "/app/uploads/file.txt")
        True
        >>> is_safe_path("/app/uploads", "/app/uploads/subdir/file.txt")
        True
        >>> is_safe_path("/app/uploads", "/app/uploads/../etc/passwd")
        False
        >>> is_safe_path("/app/uploads", "/etc/passwd")
        False
    """
    try:
        # 转换为 Path 对象并解析为绝对路径
        base = Path(base_dir).resolve()
        target = Path(target_path).resolve()

        # 检查目标路径是否以基础路径开头
        return str(target).startswith(str(base))
    except (OSError, ValueError):
        # 路径解析错误，视为不安全
        return False


def get_safe_file_path(base_dir: str | Path, filename: str) -> Path:
    """
    获取安全的文件路径，自动清理文件名并验证路径安全

    Args:
        base_dir: 基础目录
        filename: 用户提供的文件名

    Returns:
        安全的文件路径

    Raises:
        ValueError: 如果生成的路径不安全（路径遍历攻击）

    Examples:
        >>> get_safe_file_path("/app/uploads", "document.pdf")
        PosixPath('/app/uploads/document.pdf')
    """
    # 1. 清理文件名
    safe_filename = sanitize_filename(filename)

    # 2. 转换为绝对路径
    base = Path(base_dir).resolve()
    target = base / safe_filename

    # 3. 解析目标路径（处理任何剩余的符号链接或相对路径）
    try:
        target_resolved = target.resolve()
    except (OSError, ValueError) as e:
        raise ValueError(f"无效的文件路径: {filename}") from e

    # 4. 验证路径安全
    if not is_safe_path(base, target_resolved):
        raise ValueError(f"检测到路径遍历攻击，非法文件名: {filename}")

    return target_resolved


def validate_filename_extension(filename: str, allowed_extensions: set[str]) -> bool:
    """
    验证文件扩展名是否在允许列表中

    Args:
        filename: 文件名
        allowed_extensions: 允许的扩展名集合（包含点，如 {'.pdf', '.jpg'}）

    Returns:
        扩展名是否允许
    """
    # 提取扩展名并转为小写
    ext = os.path.splitext(filename)[1].lower()
    return ext in allowed_extensions


def has_traversal_attempt(filename: str) -> bool:
    """
    检测文件名是否包含路径遍历尝试

    Args:
        filename: 文件名

    Returns:
        如果包含路径遍历尝试返回 True
    """
    traversal_patterns = [
        "../",
        "..\\",
        "..",
        "./",
        ".\\",
        "/",
        "\\",
    ]
    return any(pattern in filename for pattern in traversal_patterns)
