"""
统一错误处理中间件和处理器
提供友好的中文错误信息和失败记录保存
"""
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError, HTTPException
from sqlalchemy.exc import (
    IntegrityError, 
    SQLAlchemyError, 
)
import logging
import json
import traceback
from starlette.concurrency import run_in_threadpool

from exceptions import ProfoException
from utils.error_formatters import format_request_validation_error, format_database_error
from services.error_service import save_failed_record

logger = logging.getLogger(__name__)

# ==================== 异常处理器函数 ====================

async def profo_exception_handler(request: Request, exc: ProfoException) -> JSONResponse:
    """
    处理自定义 Profo 异常
    """
    logger.warning(f"业务异常: {exc.code} - {exc.message}")
    
    # 根据异常类型确定 HTTP 状态码
    status_code_map = {
        "VALIDATION_ERROR": status.HTTP_400_BAD_REQUEST,
        "DUPLICATE_RECORD": status.HTTP_409_CONFLICT,
        "RESOURCE_NOT_FOUND": status.HTTP_404_NOT_FOUND,
        "FILE_PROCESSING_ERROR": status.HTTP_400_BAD_REQUEST,
        "BUSINESS_LOGIC_ERROR": status.HTTP_422_UNPROCESSABLE_ENTITY,
        "DATABASE_ERROR": status.HTTP_500_INTERNAL_SERVER_ERROR,
    }
    
    status_code = status_code_map.get(exc.code, status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    response_content = {
        "success": False,
        "error": {
            "code": exc.code,
            "message": exc.message
        }
    }
    
    if exc.details:
        response_content["error"]["details"] = exc.details
    
    return JSONResponse(
        status_code=status_code,
        content=response_content
    )


async def validation_exception_handler(
    request: Request, 
    exc: RequestValidationError
) -> JSONResponse:
    """
    处理请求验证错误
    """
    error_message = format_request_validation_error(exc)
    
    logger.warning(f"请求验证失败: {error_message}")
    
    # 尝试保存失败记录（如果请求体包含数据）
    try:
        if request.method in ["POST", "PUT", "PATCH"]:
            body = await request.body()
            if body:
                try:
                    data = json.loads(body)
                    # 使用 run_in_threadpool 异步执行同步的数据库操作
                    await run_in_threadpool(
                        save_failed_record,
                        data=data if isinstance(data, dict) else {"data": data},
                        error_message=error_message,
                        failure_type="request_validation_error"
                    )
                except:
                    pass  # 忽略保存失败
    except:
        pass  # 忽略保存失败
    
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "success": False,
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "请求参数验证失败",
                "details": error_message
            }
        }
    )


async def sqlalchemy_exception_handler(
    request: Request, 
    exc: SQLAlchemyError
) -> JSONResponse:
    """
    处理数据库错误
    """
    error_message = format_database_error(exc)
    
    logger.error(f"数据库错误: {error_message} - {str(exc)}")
    
    # 根据错误类型确定状态码
    if isinstance(exc, IntegrityError):
        if 'UNIQUE constraint failed' in str(exc):
            status_code = status.HTTP_409_CONFLICT
        else:
            status_code = status.HTTP_400_BAD_REQUEST
    else:
        status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    
    return JSONResponse(
        status_code=status_code,
        content={
            "success": False,
            "error": {
                "code": "DATABASE_ERROR",
                "message": error_message
            }
        }
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """
    处理 HTTP 异常
    """
    logger.warning(f"HTTP 异常: {exc.status_code} - {exc.detail}")
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {
                "code": f"HTTP_{exc.status_code}",
                "message": exc.detail
            }
        }
    )


async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    处理通用异常（兜底处理）
    """
    # 记录完整的错误堆栈
    error_traceback = traceback.format_exc()
    logger.error(f"未处理的异常: {str(exc)}\n{error_traceback}")
    
    # 尝试保存失败记录
    try:
        if request.method in ["POST", "PUT", "PATCH"]:
            body = await request.body()
            if body:
                try:
                    data = json.loads(body)
                    # 使用 run_in_threadpool 异步执行同步的数据库操作
                    await run_in_threadpool(
                        save_failed_record,
                        data=data if isinstance(data, dict) else {"data": data},
                        error_message=str(exc),
                        failure_type="system_error"
                    )
                except:
                    pass
    except:
        pass
    
    # 根据 debug 模式决定是否返回详细错误信息
    from settings import settings
    
    error_message = "服务器内部错误，请稍后重试"
    error_details = None
    
    if settings.debug:
        error_message = str(exc)
        error_details = error_traceback
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": error_message,
                "details": error_details
            }
        }
    )
