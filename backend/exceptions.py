"""
已弃用 — 请改用 services.system.exceptions

此模块中的所有异常类型已统一迁移至 services.system.exceptions.ServiceException 体系。
为保持向后兼容，此处保留别名重导出，但推荐直接导入新模块。

迁移映射:
    ProfoException           → ServiceException
    ResourceNotFoundException → ResourceNotFoundError
    ValidationException      → ValidationError
    AuthenticationException  → AuthenticationError
    PermissionDeniedException → PermissionDeniedError
    FileProcessingException  → FileProcessingError
    BusinessLogicException   → BusinessLogicError
    DuplicateRecordException → ConflictError
    DatabaseException        → ServiceException
    DateProcessingException  → ServiceException
    DateFormatException      → ValidationError
    DateParsingException     → ValidationError
    PasswordValidationException → ValidationError
"""
import warnings

from services.system.exceptions import (
    ServiceException as ProfoException,
    ServiceException as DatabaseException,
    ServiceException as DateProcessingException,
    ResourceNotFoundError as ResourceNotFoundException,
    ValidationError as ValidationException,
    ValidationError as DateFormatException,
    ValidationError as DateParsingException,
    ValidationError as PasswordValidationException,
    AuthenticationError as AuthenticationException,
    PermissionDeniedError as PermissionDeniedException,
    FileProcessingError as FileProcessingException,
    BusinessLogicError as BusinessLogicException,
    ConflictError as DuplicateRecordException,
)

warnings.warn(
    "exceptions 模块已弃用，请改用 services.system.exceptions",
    DeprecationWarning,
    stacklevel=2,
)
