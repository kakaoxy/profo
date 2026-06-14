"""统一 API 响应模型

遵循 AGENTS.md 规范：直接返回 Pydantic 模型，不使用 code/msg/data 包装器.
"""  # noqa: D400, D415

from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    """分页响应模型.

    标准分页响应格式:
    {
        "items": [...],
        "total": 100,
        "page": 1,
        "page_size": 50
    }
    """

    items: list[T] = Field(..., description="数据列表")
    total: int = Field(..., description="总记录数")
    page: int = Field(..., description="当前页码")
    page_size: int = Field(..., description="每页数量")

    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "examples": [
                {
                    "items": [{"id": "1"}, {"id": "2"}],
                    "total": 100,
                    "page": 1,
                    "page_size": 50,
                },
            ],
        },
    )
