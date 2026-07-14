"""统一 API 响应模型

遵循 AGENTS.md 规范：成功响应直接返回 Pydantic 模型，不使用 code/msg/data 包装器；
错误响应统一 {"code":≠0, "message":"..."} 格式（code 取 HTTP 状态码）.
"""  # noqa: D400, D415

from typing import Generic, TypeVar

from fastapi.responses import JSONResponse
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

    items: list[T] = Field(description="数据列表")
    total: int = Field(description="总记录数")
    page: int = Field(description="当前页码")
    page_size: int = Field(description="每页数量")

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


class ErrorResponse(BaseModel):
    """统一错误响应模型.

    遵循 AGENTS.md §2：错误响应统一 {"code":≠0, "message":"..."} 格式.
    code 取 HTTP 状态码.
    """

    code: int = Field(description="错误码，等同 HTTP 状态码，非零")
    message: str = Field(description="错误信息")

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"code": 404, "message": "资源不存在"},
                {"code": 422, "message": "请求参数验证失败: ..."},
            ],
        },
    )


def create_error_response(
    status_code: int,
    message: str,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    """构造统一错误 JSONResponse.

    Args:
        status_code: HTTP 状态码，同时作为响应体中的 code 字段值.
        message: 错误信息.
        headers: 额外的 HTTP 响应头.

    """
    return JSONResponse(
        status_code=status_code,
        content={"code": status_code, "message": message},
        headers=headers,
    )
