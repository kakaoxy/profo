"""
统一 API 响应包装器
提供标准化的成功/错误响应格式
"""
from typing import Generic, TypeVar, Optional, Any
from pydantic import BaseModel, Field
from pydantic.generics import GenericModel


T = TypeVar("T")


class ApiResponse(GenericModel, Generic[T]):
    """统一 API 响应包装器

    标准响应格式:
    {
        "code": 200,
        "msg": "success",
        "data": { ... }
    }

    错误响应格式 (通过全局异常处理器):
    {
        "success": false,
        "error": {
            "code": "VALIDATION_ERROR",
            "message": "请求参数验证失败",
            "details": { ... }
        }
    }
    """
    code: int = Field(default=200, description="业务状态码，200 表示成功")
    msg: str = Field(default="success", description="状态消息")
    data: Optional[T] = Field(default=None, description="响应数据")

    # 兼容字段：同时支持 message 别名（用于某些场景）
    message: Optional[str] = Field(None, alias="message", description="状态消息（兼容字段）")

    @classmethod
    def success(cls, data: T) -> "ApiResponse[T]":
        """创建成功响应"""
        return cls(code=200, msg="success", data=data)

    @classmethod
    def error(cls, code: str, message: str, details: Any = None) -> "ApiResponse":
        """创建错误响应"""
        return cls(code=-1, msg=message, data={"code": code, "details": details})

    model_config = {
        "populate_by_name": True,
        "json_schema_extra": {
            "examples": [
                {
                    "code": 200,
                    "msg": "success",
                    "data": {"id": "123", "name": "test"}
                }
            ]
        }
    }


class PaginatedApiResponse(ApiResponse, Generic[T]):
    """分页响应包装器

    标准分页响应格式:
    {
        "code": 200,
        "message": "success",
        "data": [...],
        "total": 100,
        "page": 1,
        "page_size": 50
    }
    """
    total: int = Field(..., description="总记录数")
    page: int = Field(..., description="当前页码")
    page_size: int = Field(..., description="每页数量")

    @classmethod
    def paginate(
        cls,
        items: list[T],
        total: int,
        page: int,
        page_size: int
    ) -> "PaginatedApiResponse[T]":
        """创建分页响应"""
        return cls(
            code=200,
            message="success",
            data=items,
            total=total,
            page=page,
            page_size=page_size
        )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "code": 200,
                    "message": "success",
                    "data": [{"id": "1"}, {"id": "2"}],
                    "total": 100,
                    "page": 1,
                    "page_size": 50
                }
            ]
        }
    }
