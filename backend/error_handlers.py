"""统一错误处理中间件和处理器.

提供友好的中文错误信息和失败记录保存
遵循 AGENTS.md §2：错误响应统一 {"code":≠0, "message":"..."} 格式（code 取 HTTP 状态码）.
"""

import json
import logging
import traceback

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from sqlalchemy.exc import (
    IntegrityError,
    SQLAlchemyError,
)
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException

from schemas.response import create_error_response
from services.system import save_failed_record
from services.system.exceptions import ServiceException
from utils.error_formatters import (
    _is_unique_violation,
    format_database_error,
    format_request_validation_error,
)
from utils.security_logger import safe_log_request_body

logger = logging.getLogger(__name__)

# 日志文本 CRLF 清理表：将回车/换行/制表符替换为空格，防止日志注入
_LOG_SANITIZE_TABLE = str.maketrans({"\r": " ", "\n": " ", "\t": " "})


def _sanitize_log_text(value: object) -> str:
    """清理日志文本中的 CRLF 字符，防止日志注入.

    将回车、换行、制表符替换为空格，避免攻击者通过构造含 CRLF 的输入伪造日志条目。
    """
    return str(value).translate(_LOG_SANITIZE_TABLE)


# ==================== 公共函数 ====================


async def save_failed_record_safely(
    request: Request,
    error_message: str,
    failure_type: str,
    data_source: str | None = None,
) -> None:
    """安全地保存失败记录.

    统一处理请求体解析和脱敏逻辑，避免代码重复.
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
                        failure_type=failure_type,
                        data_source=data_source,
                    )
    except Exception as e:
        logger.warning("保存失败记录时出错: %s", e)


# ==================== 异常处理器函数 ====================


async def service_exception_handler(_request: Request, exc: ServiceException) -> JSONResponse:
    """处理服务层业务异常.

    遵循 AGENTS.md §2：错误响应统一 {"code": <status>, "message": "..."}.
    """
    logger.warning("服务层业务异常: %s - %s", exc.status_code, _sanitize_log_text(exc.message))

    # 允许透传的响应头白名单：WWW-Authenticate（401）、X-Temp-Token（首次登录改密）等
    # 新增透传头需评估敏感信息泄露风险
    return create_error_response(
        status_code=exc.status_code,
        message=exc.message,
        headers=exc.headers,
    )


async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    """处理请求验证错误.

    遵循 AGENTS.md §2：错误响应统一 {"code": <status>, "message": "..."}.
    已修复：使用安全日志记录，脱敏敏感信息.
    """
    error_message = format_request_validation_error(exc)

    safe_body = None
    try:
        if request.method in ["POST", "PUT", "PATCH"]:
            body = await request.body()
            if body:
                safe_body = safe_log_request_body(body)
    except Exception:
        logger.debug("无法解析请求体", exc_info=True)

    if safe_body:
        logger.warning(
            "请求验证失败: %s, 请求体: %s, 原始错误: %s",
            _sanitize_log_text(error_message),
            json.dumps(safe_body, ensure_ascii=False),
            _sanitize_log_text(json.dumps(exc.errors(), ensure_ascii=False, default=str)),
        )
    else:
        logger.warning(
            "请求验证失败: %s, 原始错误: %s",
            _sanitize_log_text(error_message),
            _sanitize_log_text(json.dumps(exc.errors(), ensure_ascii=False, default=str)),
        )

    # 尝试保存失败记录（使用脱敏后的数据）
    await save_failed_record_safely(
        request=request,
        error_message=error_message,
        failure_type="request_validation_error",
    )

    return create_error_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        message=f"请求参数验证失败: {error_message}",
    )


async def sqlalchemy_exception_handler(
    _request: Request,
    exc: SQLAlchemyError,
) -> JSONResponse:
    """处理数据库错误.

    遵循 AGENTS.md §2：错误响应统一 {"code": <status>, "message": "..."}.
    """
    error_message = format_database_error(exc)

    logger.error("数据库错误: %s - %s", error_message, _sanitize_log_text(exc))

    # 根据错误类型确定状态码
    if isinstance(exc, IntegrityError):
        status_code = status.HTTP_409_CONFLICT if _is_unique_violation(exc) else status.HTTP_400_BAD_REQUEST
    else:
        status_code = status.HTTP_500_INTERNAL_SERVER_ERROR

    return create_error_response(
        status_code=status_code,
        message=error_message,
    )


async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    """处理 HTTP 异常.

    遵循 AGENTS.md §2：错误响应统一 {"code": <status>, "message": "..."}.
    dict 类型 detail 提取 message 字段；其他类型用 str() 转换.
    """
    logger.warning("HTTP 异常: %s - %s", exc.status_code, _sanitize_log_text(exc.detail))

    detail = exc.detail
    message = str(detail.get("message") or detail) if isinstance(detail, dict) else str(detail)

    return create_error_response(
        status_code=exc.status_code,
        message=message,
    )


async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """处理通用异常（兜底处理）.

    遵循 AGENTS.md §2：错误响应统一 {"code": <status>, "message": "..."}.
    已修复：使用安全日志记录请求体，脱敏敏感信息.
    """
    error_traceback = traceback.format_exc()
    logger.error("未处理的异常: %s\n%s", _sanitize_log_text(exc), error_traceback)

    # 尝试保存失败记录（使用脱敏后的数据）
    await save_failed_record_safely(
        request=request,
        error_message=str(exc),
        failure_type="system_error",
    )

    return create_error_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        message="服务器内部错误，请稍后重试",
    )


async def rate_limit_handler(_request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """处理速率限制异常.

    遵循 AGENTS.md §2：错误响应统一 {"code": <status>, "message": "..."}.
    兼容不同 slowapi 版本：retry_after 属性在部分版本不存在，使用 getattr 安全访问。
    """
    headers: dict[str, str] = {}
    retry_after = getattr(exc, "retry_after", None)
    if retry_after is not None:
        headers["Retry-After"] = str(retry_after)
    return create_error_response(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        message="请求过于频繁，请稍后重试",
        headers=headers,
    )
