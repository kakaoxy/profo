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
    OperationalError,
    DataError
)
from pydantic import ValidationError
from datetime import datetime
import logging
import json
import traceback
from typing import Optional, Dict, Any

from exceptions import ProfoException
from models import FailedRecord
from db import SessionLocal


logger = logging.getLogger(__name__)


class ErrorHandler:
    """统一错误处理器"""
    
    @staticmethod
    def format_validation_error(error: ValidationError) -> str:
        """
        格式化 Pydantic 验证错误为中文友好信息
        
        Args:
            error: Pydantic 验证错误
        
        Returns:
            str: 格式化的中文错误信息
        """
        error_messages = []
        
        for err in error.errors():
            loc = err.get('loc', ['unknown'])
            field = loc[-1] if loc and len(loc) > 0 else 'unknown'
            error_message = err.get('msg', '')
            error_type = err.get('type', '')
            
            # 转换为中文友好信息
            if 'missing' in error_type:
                error_messages.append(f"缺少必填字段: {field}")
            elif 'type_error' in error_type:
                if 'float' in error_type:
                    error_messages.append(f"字段 {field} 必须是数字")
                elif 'int' in error_type:
                    error_messages.append(f"字段 {field} 必须是整数")
                elif 'bool' in error_type:
                    error_messages.append(f"字段 {field} 必须是布尔值")
                else:
                    error_messages.append(f"字段 {field} 类型错误")
            elif 'value_error' in error_type:
                if 'greater_than' in error_message:
                    error_messages.append(f"字段 {field} 必须大于 0")
                elif 'less_than' in error_message:
                    error_messages.append(f"字段 {field} 超出允许范围")
                else:
                    error_messages.append(f"字段 {field} 值无效: {error_message}")
            else:
                error_messages.append(f"字段 {field}: {error_message}")
        
        return "; ".join(error_messages)
    
    @staticmethod
    def format_request_validation_error(error: RequestValidationError) -> str:
        """
        格式化 FastAPI 请求验证错误为中文友好信息
        
        Args:
            error: FastAPI 请求验证错误
        
        Returns:
            str: 格式化的中文错误信息
        """
        error_messages = []
        
        for err in error.errors():
            location = err.get('loc', [])
            error_message = err.get('msg', '')
            error_type = err.get('type', '')
            
            # 提取字段名
            if len(location) > 1:
                field = location[-1]
            else:
                field = '未知字段'
            
            # 转换为中文友好信息
            if 'missing' in error_type:
                error_messages.append(f"缺少必填参数: {field}")
            elif 'type_error' in error_type:
                error_messages.append(f"参数 {field} 类型错误")
            elif 'value_error' in error_type:
                error_messages.append(f"参数 {field} 值无效")
            else:
                error_messages.append(f"参数 {field}: {error_message}")
        
        return "; ".join(error_messages) if error_messages else "请求参数验证失败"
    
    @staticmethod
    def format_database_error(error: SQLAlchemyError) -> str:
        """
        格式化数据库错误为中文友好信息
        
        Args:
            error: SQLAlchemy 错误
        
        Returns:
            str: 格式化的中文错误信息
        """
        error_str = str(error)
        
        if isinstance(error, IntegrityError):
            if 'UNIQUE constraint failed' in error_str:
                # 提取约束名称
                if 'uq_source_property' in error_str:
                    return "房源已存在（数据源和房源ID重复）"
                elif 'communities.name' in error_str:
                    return "小区名称已存在"
                elif 'uq_alias_source' in error_str:
                    return "小区别名已存在"
                else:
                    return "数据重复，违反唯一性约束"
            elif 'FOREIGN KEY constraint failed' in error_str:
                return "关联数据不存在，请检查小区ID等外键字段"
            elif 'NOT NULL constraint failed' in error_str:
                # 提取字段名
                if '.' in error_str:
                    field = error_str.split('.')[-1].strip()
                    return f"必填字段 {field} 不能为空"
                return "必填字段不能为空"
            else:
                return "数据完整性错误"
        
        elif isinstance(error, OperationalError):
            if 'database is locked' in error_str:
                return "数据库被锁定，请稍后重试"
            elif 'no such table' in error_str:
                return "数据库表不存在，请先初始化数据库"
            elif 'no such column' in error_str:
                return "数据库字段不存在，请检查数据库结构"
            else:
                return "数据库操作失败"
        
        elif isinstance(error, DataError):
            return "数据格式错误或超出字段长度限制"
        
        else:
            return "数据库错误"
    
    @staticmethod
    def save_failed_record(
        data: Dict[str, Any],
        error_message: str,
        failure_type: str = "validation_error",
        data_source: Optional[str] = None
    ) -> bool:
        """
        保存失败记录到数据库
        
        Args:
            data: 原始数据
            error_message: 错误信息
            failure_type: 失败类型
            data_source: 数据来源
        
        Returns:
            bool: 是否保存成功
        """
        db = None
        try:
            db = SessionLocal()
            
            # 如果没有提供 data_source，尝试从数据中提取
            if not data_source:
                data_source = data.get('数据源') or data.get('data_source')
            
            failed_record = FailedRecord(
                data_source=data_source,
                payload=json.dumps(data, ensure_ascii=False, default=str),
                failure_type=failure_type,
                failure_reason=error_message,
                occurred_at=datetime.now(),
                is_handled=False
            )
            
            db.add(failed_record)
            db.commit()
            
            logger.info(f"失败记录已保存: {failure_type} - {error_message[:50]}")
            return True
        
        except Exception as e:
            logger.error(f"保存失败记录时出错: {str(e)}")
            if db:
                db.rollback()
            return False
        
        finally:
            if db:
                db.close()


# ==================== 异常处理器函数 ====================

async def profo_exception_handler(request: Request, exc: ProfoException) -> JSONResponse:
    """
    处理自定义 Profo 异常
    
    Args:
        request: 请求对象
        exc: Profo 异常
    
    Returns:
        JSONResponse: 错误响应
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
    
    Args:
        request: 请求对象
        exc: 请求验证错误
    
    Returns:
        JSONResponse: 错误响应
    """
    error_message = ErrorHandler.format_request_validation_error(exc)
    
    logger.warning(f"请求验证失败: {error_message}")
    
    # 尝试保存失败记录（如果请求体包含数据）
    try:
        if request.method in ["POST", "PUT", "PATCH"]:
            body = await request.body()
            if body:
                try:
                    data = json.loads(body)
                    ErrorHandler.save_failed_record(
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
    
    Args:
        request: 请求对象
        exc: SQLAlchemy 错误
    
    Returns:
        JSONResponse: 错误响应
    """
    error_message = ErrorHandler.format_database_error(exc)
    
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
    
    Args:
        request: 请求对象
        exc: HTTP 异常
    
    Returns:
        JSONResponse: 错误响应
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
    
    Args:
        request: 请求对象
        exc: 异常
    
    Returns:
        JSONResponse: 错误响应
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
                    ErrorHandler.save_failed_record(
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
