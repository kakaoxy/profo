"""报表通用 Schema.

包含报表筛选参数、KPI 卡片、枚举、分页与错误响应模型.
字段名对齐前端 types.ts.
"""

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class QoqDirection(str, Enum):
    """环比方向."""

    UP = "up"
    DOWN = "down"
    FLAT = "flat"
    UNKNOWN = "unknown"


class SortOrder(str, Enum):
    """排序方向."""

    ASC = "asc"
    DESC = "desc"


class TrendDimension(str, Enum):
    """趋势维度."""

    OVERALL = "overall"
    ROOMS = "rooms"
    FLOOR = "floor"
    PRICE = "price"


class RangeOption(str, Enum):
    """时间范围选项：4w/8w=周；6m/12m/24m=月."""

    W4 = "4w"
    W8 = "8w"
    M6 = "6m"
    M12 = "12m"
    M24 = "24m"


class KpiCard(BaseModel):
    """单张 KPI 卡片数据."""

    value: int | float | None = Field(None, description="当前值（套数或均价）")
    qoq: float | None = Field(None, description="环比百分比；样本不足或上期为 0 时为 null")
    qoq_direction: QoqDirection = Field(description="环比方向")

    model_config = ConfigDict(from_attributes=True)


class ReportsFilter(BaseModel):
    """报表全局筛选参数.

    字段对齐前端 types.ts ReportsFilter.
    range/sources/rooms/floor_levels 等字段在 service 层进一步校验.
    """

    range: str = Field(default="4w", description="时间范围：4w/8w=周；6m/12m/24m=月")
    sources: list[str] = Field(default_factory=list, description="数据来源多选（链家/贝壳/网签）")
    business_circles: list[str] = Field(default_factory=list, description="商圈多关键词模糊匹配（OR LIKE）")
    community_name: str | None = Field(None, description="小区名称模糊搜索")
    district: str | None = Field(None, description="区域（行政区）精确过滤")
    status: str | None = Field(None, description="房源状态：在售/成交")
    rooms: list[str] = Field(default_factory=list, description="户型多选（如 '1','2','4plus'）")
    floor_levels: list[str] = Field(default_factory=list, description="楼层多选（低/中/高楼层）")

    model_config = ConfigDict(from_attributes=True)


class Pagination(BaseModel):
    """分页参数."""

    page: int = Field(default=1, ge=1, description="页码，从 1 开始")
    page_size: int = Field(default=20, ge=1, le=100, description="每页数量，1-100")


class ErrorResponse(BaseModel):
    """报表模块错误响应模型.

    遵循 AGENTS.md §2：错误响应统一 {"code":≠0, "message":"..."} 格式.
    code 取 HTTP 状态码.
    """

    code: int = Field(description="错误码，等同 HTTP 状态码，非零")
    message: str = Field(description="错误信息")


__all__ = [
    "ErrorResponse",
    "KpiCard",
    "Pagination",
    "QoqDirection",
    "RangeOption",
    "ReportsFilter",
    "SortOrder",
    "TrendDimension",
]
