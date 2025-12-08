"""
自定义异常类
定义业务逻辑相关的异常类型
"""
from typing import Optional, Any


class ProfoException(Exception):
    """Profo 系统基础异常类"""
    
    def __init__(
        self, 
        message: str, 
        code: str = "PROFO_ERROR",
        details: Optional[Any] = None
    ):
        self.message = message
        self.code = code
        self.details = details
        super().__init__(self.message)


class ValidationException(ProfoException):
    """数据验证异常"""
    
    def __init__(self, message: str, details: Optional[Any] = None):
        super().__init__(
            message=message,
            code="VALIDATION_ERROR",
            details=details
        )


class DatabaseException(ProfoException):
    """数据库操作异常"""
    
    def __init__(self, message: str, details: Optional[Any] = None):
        super().__init__(
            message=message,
            code="DATABASE_ERROR",
            details=details
        )


class DuplicateRecordException(ProfoException):
    """重复记录异常"""
    
    def __init__(self, message: str = "记录已存在", details: Optional[Any] = None):
        super().__init__(
            message=message,
            code="DUPLICATE_RECORD",
            details=details
        )


class ResourceNotFoundException(ProfoException):
    """资源不存在异常"""
    
    def __init__(self, message: str = "资源不存在", details: Optional[Any] = None):
        super().__init__(
            message=message,
            code="RESOURCE_NOT_FOUND",
            details=details
        )


class FileProcessingException(ProfoException):
    """文件处理异常"""
    
    def __init__(self, message: str, details: Optional[Any] = None):
        super().__init__(
            message=message,
            code="FILE_PROCESSING_ERROR",
            details=details
        )


class BusinessLogicException(ProfoException):
    """业务逻辑异常"""

    def __init__(self, message: str, details: Optional[Any] = None):
        super().__init__(
            message=message,
            code="BUSINESS_LOGIC_ERROR",
            details=details
        )


class DateProcessingException(ProfoException):
    """日期处理异常"""

    def __init__(self, message: str, details: Optional[Any] = None):
        super().__init__(
            message=message,
            code="DATE_PROCESSING_ERROR",
            details=details
        )


class DateFormatException(DateProcessingException):
    """日期格式错误异常"""

    def __init__(self, message: str = "日期格式无效", details: Optional[Any] = None):
        super().__init__(message, details)
        self.code = "DATE_FORMAT_ERROR"


class DateParsingException(DateProcessingException):
    """日期解析错误异常"""

    def __init__(self, message: str = "日期解析失败", details: Optional[Any] = None):
        super().__init__(message, details)
        self.code = "DATE_PARSING_ERROR"


class PasswordValidationException(ProfoException):
    """密码验证异常"""
    
    def __init__(self, message: str, details: Optional[Any] = None):
        super().__init__(
            message=message,
            code="PASSWORD_VALIDATION_ERROR",
            details=details
        )
