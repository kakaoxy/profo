"""
统一错误处理中间件和处理器
提供友好的中文错误信息和失败记录保存
符合 AGENTS.md 规范：错误统一 {"detail":"..."} via HTTPException
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
from services.system import save_failed_record
from services.system.exceptions import ServiceException
from utils.security_logger import safe_log_request_body, safe_log_dict

logger = logging.getLogger(__name__)

# ==================== 公共函数 ====================

async def save_failed_record_safely(
    request: Request,
    error_message: str,
    failure_type: str
) -> None:
    """
    安全地保存失败记录
    统一处理请求体解析和脱敏逻辑，避免代码重复
    """
    try:
        if request.method in ["POST", "PUT", "PATCH"]:
            body = await request.body()
            if body:
                safe_body = safe_log_request_body(body)
                if safe_body:
                    # 使用 run_in_threadpool 异步执行同步的数据库操作
                    await run_in_threadpool(
                        save_failed_record,
                        data=safe_body,
                        error_message=error_message,
                        failure_type=failure_type
                    )
    except Exception:
        pass  # 忽略保存失败


# ==================== 异常处理器函数 ====================

async def service_exception_handler(request: Request, exc: ServiceException) -> JSONResponse:
    """
    处理服务层业务异常
    符合 AGENTS.md 规范：错误统一 {"detail":"..."}
    """
    logger.warning(f"服务层业务异常: {exc.status_code} - {exc.message}")

    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message}
    )


async def profo_exception_handler(request: Request, exc: ProfoException) -> JSONResponse:
    """
    处理自定义 Profo 异常
    符合 AGENTS.md 规范：错误统一 {"detail":"..."}
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
        "AUTHENTICATION_ERROR": status.HTTP_401_UNAUTHORIZED,
        "PERMISSION_DENIED": status.HTTP_403_FORBIDDEN,
    }

    status_code = status_code_map.get(exc.code, status.HTTP_500_INTERNAL_SERVER_ERROR)

    # 符合 AGENTS.md 规范：错误统一 {"detail":"..."}
    response_content = {"detail": exc.message}

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
    符合 AGENTS.md 规范：错误统一 {"detail":"..."}
    已修复：使用安全日志记录，脱敏敏感信息
    """
    error_message = format_request_validation_error(exc)

    # 使用安全日志记录请求体（脱敏敏感字段）
    safe_body = None
    try:
        if request.method in ["POST", "PUT", "PATCH"]:
            body = await request.body()
            if body:
                safe_body = safe_log_request_body(body)
    except Exception:
        pass

    if safe_body:
        logger.warning(f"请求验证失败: {error_message}, 请求体: {json.dumps(safe_body, ensure_ascii=False)}")
    else:
        logger.warning(f"请求验证失败: {error_message}")

    # 尝试保存失败记录（使用脱敏后的数据）
    await save_failed_record_safely(
        request=request,
        error_message=error_message,
        failure_type="request_validation_error"
    )

    # 符合 AGENTS.md 规范：错误统一 {"detail":"..."}
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": f"请求参数验证失败: {error_message}"}
    )


async def sqlalchemy_exception_handler(
    request: Request,
    exc: SQLAlchemyError
) -> JSONResponse:
    """
    处理数据库错误
    符合 AGENTS.md 规范：错误统一 {"detail":"..."}
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

    # 符合 AGENTS.md 规范：错误统一 {"detail":"..."}
    return JSONResponse(
        status_code=status_code,
        content={"detail": error_message}
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """
    处理 HTTP 异常
    FastAPI 的 HTTPException 默认格式已经是 {"detail": "..."}
    直接透传，保持格式一致
    """
    logger.warning(f"HTTP 异常: {exc.status_code} - {exc.detail}")

    # HTTPException 默认就是 {"detail": "..."} 格式，直接透传
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )


async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    处理通用异常（兜底处理）
    符合 AGENTS.md 规范：错误统一 {"detail":"..."}
    已修复：使用安全日志记录请求体，脱敏敏感信息
    """
    # 记录完整的错误堆栈
    error_traceback = traceback.format_exc()
    logger.error(f"未处理的异常: {str(exc)}\n{error_traceback}")

    # 尝试保存失败记录（使用脱敏后的数据）
    await save_failed_record_safely(
        request=request,
        error_message=str(exc),
        failure_type="system_error"
    )

    # 根据 debug 模式决定是否返回详细错误信息
    from settings import settings

    # 符合 AGENTS.md 规范：错误统一 {"detail":"..."}
    if settings.debug:
        error_message = f"{str(exc)}\n\n{error_traceback}"
    else:
        error_message = "服务器内部错误，请稍后重试"

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": error_message}
    )
