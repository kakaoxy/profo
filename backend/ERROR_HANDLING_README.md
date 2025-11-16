# 统一错误处理系统文档

## 概述

Profo 房产数据中心实现了统一的错误处理中间件，提供友好的中文错误信息和完善的失败记录保存机制。

## 核心组件

### 1. 自定义异常类 (`exceptions.py`)

所有业务异常都继承自 `ProfoException` 基类，包含以下属性：
- `message`: 错误消息（中文）
- `code`: 错误代码
- `details`: 错误详情（可选）

#### 可用异常类型

| 异常类 | 错误代码 | HTTP状态码 | 使用场景 |
|--------|---------|-----------|---------|
| `ValidationException` | VALIDATION_ERROR | 400 | 数据验证失败 |
| `DatabaseException` | DATABASE_ERROR | 500 | 数据库操作失败 |
| `DuplicateRecordException` | DUPLICATE_RECORD | 409 | 记录重复 |
| `ResourceNotFoundException` | RESOURCE_NOT_FOUND | 404 | 资源不存在 |
| `FileProcessingException` | FILE_PROCESSING_ERROR | 400 | 文件处理失败 |
| `BusinessLogicException` | BUSINESS_LOGIC_ERROR | 422 | 业务逻辑错误 |

#### 使用示例

```python
from exceptions import ValidationException, ResourceNotFoundException

# 抛出验证异常
if not data:
    raise ValidationException(
        message="数据不能为空",
        details={"field": "properties"}
    )

# 抛出资源不存在异常
if not community:
    raise ResourceNotFoundException(
        message="小区不存在",
        details={"community_id": community_id}
    )
```

### 2. 错误处理器 (`error_handlers.py`)

#### ErrorHandler 工具类

提供统一的错误格式化和失败记录保存功能：

**方法列表：**

- `format_validation_error(error: ValidationError) -> str`
  - 格式化 Pydantic 验证错误为中文友好信息
  
- `format_request_validation_error(error: RequestValidationError) -> str`
  - 格式化 FastAPI 请求验证错误为中文友好信息
  
- `format_database_error(error: SQLAlchemyError) -> str`
  - 格式化数据库错误为中文友好信息
  
- `save_failed_record(data, error_message, failure_type, data_source) -> bool`
  - 保存失败记录到 `failed_records` 表

#### 异常处理器函数

系统注册了以下全局异常处理器：

1. **profo_exception_handler** - 处理自定义 Profo 异常
2. **validation_exception_handler** - 处理请求验证错误
3. **sqlalchemy_exception_handler** - 处理数据库错误
4. **http_exception_handler** - 处理 HTTP 异常
5. **general_exception_handler** - 处理通用异常（兜底）

### 3. 错误响应格式

所有错误响应都遵循统一的 JSON 格式：

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "用户友好的中文错误信息",
    "details": {
      // 可选的详细信息
    }
  }
}
```

## 错误处理流程

### 1. 数据验证错误

```
用户请求 → Pydantic 验证失败 → ValidationError
  ↓
ErrorHandler.format_validation_error() → 中文错误信息
  ↓
保存到 failed_records 表
  ↓
返回 422 响应
```

### 2. 数据库错误

```
数据库操作 → SQLAlchemyError
  ↓
ErrorHandler.format_database_error() → 识别错误类型
  ↓
返回友好的中文错误信息
  ↓
根据错误类型返回相应的 HTTP 状态码
```

### 3. 业务逻辑错误

```
业务逻辑检查 → 抛出自定义异常
  ↓
profo_exception_handler 捕获
  ↓
返回对应的 HTTP 状态码和错误信息
```

## 数据库错误映射

系统能够识别并友好化以下数据库错误：

| 数据库错误 | 中文提示 |
|-----------|---------|
| UNIQUE constraint failed: uq_source_property | 房源已存在（数据源和房源ID重复） |
| UNIQUE constraint failed: communities.name | 小区名称已存在 |
| FOREIGN KEY constraint failed | 关联数据不存在，请检查小区ID等外键字段 |
| NOT NULL constraint failed | 必填字段不能为空 |
| database is locked | 数据库被锁定，请稍后重试 |
| no such table | 数据库表不存在，请先初始化数据库 |

## 失败记录管理

### failed_records 表结构

所有验证失败或处理失败的数据都会保存到 `failed_records` 表：

```sql
CREATE TABLE failed_records (
    id INTEGER PRIMARY KEY,
    data_source VARCHAR(50),      -- 数据来源
    payload TEXT,                  -- 原始数据（JSON）
    failure_type VARCHAR(50),      -- 失败类型
    failure_reason TEXT,           -- 失败原因
    occurred_at DATETIME,          -- 发生时间
    is_handled BOOLEAN,            -- 是否已处理
    handled_at DATETIME,           -- 处理时间
    handler_notes TEXT             -- 处理备注
);
```

### 失败类型分类

- `validation_error` - 数据验证失败
- `csv_validation_error` - CSV 文件验证失败
- `json_validation_error` - JSON 数据验证失败
- `database_integrity_error` - 数据库完整性错误
- `database_error` - 数据库操作错误
- `import_error` - 导入过程错误
- `system_error` - 系统错误

### 查询失败记录

```python
from db import SessionLocal
from models import FailedRecord

db = SessionLocal()

# 查询所有未处理的失败记录
unhandled = db.query(FailedRecord).filter(
    FailedRecord.is_handled == False
).all()

# 按数据源统计失败记录
from sqlalchemy import func
stats = db.query(
    FailedRecord.data_source,
    func.count(FailedRecord.id)
).group_by(FailedRecord.data_source).all()
```

## 在路由中使用

### 示例 1: 抛出验证异常

```python
from exceptions import ValidationException

@router.post("/properties")
async def create_property(data: dict):
    if not data.get("community_name"):
        raise ValidationException(
            message="小区名称不能为空",
            details={"field": "community_name"}
        )
```

### 示例 2: 处理数据库错误

```python
from sqlalchemy.exc import IntegrityError
from error_handlers import ErrorHandler

try:
    db.add(property)
    db.commit()
except IntegrityError as e:
    db.rollback()
    error_msg = ErrorHandler.format_database_error(e)
    # 保存失败记录
    ErrorHandler.save_failed_record(
        data=property_data,
        error_message=error_msg,
        failure_type="database_integrity_error",
        data_source=property_data.get("data_source")
    )
    raise DatabaseException(message=error_msg)
```

### 示例 3: 批量导入中的错误处理

```python
from pydantic import ValidationError
from error_handlers import ErrorHandler

for row in csv_rows:
    try:
        validated_data = PropertyIngestionModel(**row)
        # 处理数据...
    except ValidationError as e:
        error_msg = ErrorHandler.format_validation_error(e)
        # 自动保存失败记录
        ErrorHandler.save_failed_record(
            data=row,
            error_message=error_msg,
            failure_type="csv_validation_error",
            data_source=row.get("数据源")
        )
        # 继续处理下一条
        continue
```

## 测试

运行错误处理测试：

```bash
cd backend
python test_error_handling.py
```

测试覆盖：
- ✅ 验证错误格式化
- ✅ 失败记录保存
- ✅ 自定义异常
- ✅ 数据库错误格式化
- ✅ 失败记录查询

## 配置

在 `settings.py` 中配置调试模式：

```python
class Settings(BaseSettings):
    debug: bool = True  # 开发环境设为 True，生产环境设为 False
```

- `debug=True`: 返回详细的错误堆栈信息
- `debug=False`: 只返回用户友好的错误信息，隐藏技术细节

## 最佳实践

1. **使用自定义异常** - 在业务逻辑中抛出明确的自定义异常，而不是通用的 Exception
2. **提供详细信息** - 在 details 字段中提供有助于调试的上下文信息
3. **记录日志** - 所有错误都会自动记录到日志，便于追踪问题
4. **保存失败记录** - 对于数据导入失败，确保调用 ErrorHandler.save_failed_record()
5. **友好的错误信息** - 错误信息应该是用户可理解的中文描述，避免技术术语

## 故障排查

### 问题：失败记录没有保存

**可能原因：**
- 数据库连接失败
- failed_records 表不存在

**解决方案：**
```bash
# 重新初始化数据库
python init_db.py
```

### 问题：错误信息显示英文

**可能原因：**
- 没有使用 ErrorHandler 格式化错误
- 直接抛出了 HTTPException

**解决方案：**
使用自定义异常类或 ErrorHandler 工具类

### 问题：错误响应格式不一致

**可能原因：**
- 某些路由没有被全局异常处理器捕获

**解决方案：**
确保所有路由都通过 FastAPI 的异常处理机制

## 相关文件

- `backend/exceptions.py` - 自定义异常类定义
- `backend/error_handlers.py` - 错误处理器和工具类
- `backend/main.py` - 全局异常处理器注册
- `backend/test_error_handling.py` - 错误处理测试脚本
- `backend/models.py` - FailedRecord 模型定义

## 更新日志

### v0.1.0 (2024-11-16)
- ✅ 实现统一的异常处理中间件
- ✅ 为验证错误创建 failed_records 记录
- ✅ 实现数据库错误处理和回滚
- ✅ 返回用户友好的中文错误信息
- ✅ 完整的测试覆盖
