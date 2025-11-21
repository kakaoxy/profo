"""
参数解析工具函数
提供常用的参数解析功能，避免代码重复
"""
from typing import List, Optional


def parse_comma_separated_list(param_string: Optional[str]) -> Optional[List[str]]:
    """
    解析逗号分隔的字符串参数为字符串列表

    Args:
        param_string: 逗号分隔的字符串，如 "a,b,c"

    Returns:
        List[str]: 去空值和前后空格后的字符串列表
        None: 如果输入为空字符串或None

    Examples:
        >>> parse_comma_separated_list("a,b,c")
        ["a", "b", "c"]
        >>> parse_comma_separated_list(" a , b , c ")
        ["a", "b", "c"]
        >>> parse_comma_separated_list("")
        None
        >>> parse_comma_separated_list(None)
        None
    """
    if not param_string:
        return None

    # 分割字符串，去除空值和前后空格
    return [item.strip() for item in param_string.split(',') if item.strip()]