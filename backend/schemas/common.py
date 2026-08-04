"""通用Schema

包含历史记录、失败记录、楼层解析等通用模型.
"""

from pydantic import BaseModel


class FloorInfo(BaseModel):
    """楼层解析结果."""

    floor_number: int | None = None
    total_floors: int | None = None
    floor_level: str | None = None
