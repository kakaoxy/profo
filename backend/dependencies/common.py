"""通用依赖注入函数."""

from typing import Annotated

from fastapi import Depends, Query
from pydantic import BaseModel

from settings import settings


class PaginationParams(BaseModel):
    """分页参数模型."""

    page: int
    page_size: int


def pagination(
    page: Annotated[int, Query(ge=1, description="页码")] = 1,
    page_size: Annotated[
        int, Query(ge=1, le=settings.max_page_size, description="每页数量"),
    ] = settings.default_page_size,
) -> PaginationParams:
    """解析分页参数.

    Returns:
        包含 page 和 page_size 的分页参数模型

    """
    return PaginationParams(page=page, page_size=page_size)


PaginationDep = Annotated[PaginationParams, Depends(pagination)]
