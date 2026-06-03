"""通用依赖注入函数."""

from typing import Annotated

from fastapi import Depends, Query


def pagination(
    page: Annotated[int, Query(ge=1, description="页码")] = 1,
    page_size: Annotated[int, Query(ge=1, le=200, description="每页数量")] = 50,
) -> dict[str, int]:
    """解析分页参数.

    Returns:
        包含 page 和 page_size 的字典

    """
    return {"page": page, "page_size": page_size}


PaginationDep = Annotated[dict[str, int], Depends(pagination)]
