"""商户域模型公共工具."""

import uuid
from datetime import datetime, timezone


def new_id() -> str:
    """生成字符串 UUID 主键（T-03：商户域统一 String(36)）."""
    return str(uuid.uuid4())


def utc_now() -> datetime:
    """生成带时区的当前时间."""
    return datetime.now(timezone.utc)
