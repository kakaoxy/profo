"""
错误信息格式化工具
提供将各种异常转换为中文友好信息的功能
"""
from pydantic import ValidationError
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import (
    IntegrityError, 
    SQLAlchemyError, 
    OperationalError,
    DataError
)

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
