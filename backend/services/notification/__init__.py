"""统一消息中心服务（迭代二）."""

from .events import (
    CATEGORY_META,
    CATEGORY_TEMPLATE_KEY,
    EVENT_SPECS,
    EventSpec,
    EventType,
    get_spec,
    is_closeable_category,
)
from .recipients import Audience, resolve_recipients

__all__ = [
    "CATEGORY_META",
    "CATEGORY_TEMPLATE_KEY",
    "EVENT_SPECS",
    "Audience",
    "EventSpec",
    "EventType",
    "get_spec",
    "is_closeable_category",
    "resolve_recipients",
]
