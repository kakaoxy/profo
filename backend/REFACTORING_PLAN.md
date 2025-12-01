# Models 和 Schemas 重构计划

## 目标
将 monolithic 的 `models.py` 和 `schemas.py` 文件按功能模块拆分为多个文件，提高代码可维护性和扩展性，同时保持100%向后兼容。

## 当前状态
- `models.py`: 270行，包含6个模型类和3个枚举
- `schemas.py`: 549行，包含15+个schema类和2个枚举

## 重构方案

### 1. Models 目录结构

```
backend/models/
├── __init__.py          # 统一导出所有模型
├── base.py             # Base基类 + 枚举类型
├── community.py        # 小区相关模型
├── property.py         # 房源相关模型
├── media.py            # 媒体资源模型
└── error.py            # 错误记录模型
```

#### models/base.py 内容
- `Base` - SQLAlchemy基类
- `PropertyStatus` - 房源状态枚举
- `ChangeType` - 变更类型枚举
- `MediaType` - 媒体类型枚举

#### models/community.py 内容
- `Community` - 小区表
- `CommunityAlias` - 小区别名表

#### models/property.py 内容
- `PropertyCurrent` - 房源当前状态表
- `PropertyHistory` - 房源历史快照表

#### models/media.py 内容
- `PropertyMedia` - 房源媒体资源表

#### models/error.py 内容
- `FailedRecord` - 失败记录表

### 2. Schemas 目录结构

```
backend/schemas/
├── __init__.py         # 统一导出所有schema
├── enums.py            # 枚举类型
├── property.py         # 房源相关schema
├── community.py        # 小区相关schema
├── upload.py           # 上传/导入相关schema
└── common.py           # 通用schema
```

#### schemas/enums.py 内容
- `IngestionStatus` - 房源状态枚举
- `MediaTypeEnum` - 媒体类型枚举

#### schemas/property.py 内容
- `PropertyIngestionModel` - 房源数据接收模型
- `PropertyResponse` - 房源列表响应
- `PropertyDetailResponse` - 房源详情响应
- `PaginatedPropertyResponse` - 分页房源响应
- `PropertyHistoryResponse` - 房源历史响应

#### schemas/community.py 内容
- `CommunityResponse` - 小区响应
- `CommunityListResponse` - 小区列表响应
- `CommunityMergeRequest` - 小区合并请求
- `CommunityMergeResponse` - 小区合并响应

#### schemas/upload.py 内容
- `UploadResult` - CSV上传结果
- `PushResult` - JSON推送结果
- `ImportResult` - 单条导入结果
- `BatchImportResult` - 批量导入结果

#### schemas/common.py 内容
- `FloorInfo` - 楼层解析结果
- `FailedRecordResponse` - 失败记录响应

### 3. 导入路径更新

#### 原导入方式
```python
from models import Community, PropertyCurrent
from schemas import PropertyResponse, UploadResult
```

#### 新导入方式（保持兼容）
```python
# 通过 __init__.py 统一导出，保持原有导入方式可用
from models import Community, PropertyCurrent
from schemas import PropertyResponse, UploadResult

# 也可以按模块导入
from models.community import Community
from schemas.property import PropertyResponse
```

### 4. 需要更新的文件

#### 必须更新的文件
- `backend/init_db.py` - 导入所有模型
- `backend/error_handlers.py` - 导入 FailedRecord 模型
- `backend/routers/upload.py` - 导入相关 schemas
- `backend/routers/push.py` - 导入相关 schemas
- `backend/routers/properties.py` - 导入 models 和 schemas
- `backend/routers/admin.py` - 导入 models 和 schemas
- `backend/services/importer.py` - 导入 models 和 schemas
- `backend/services/merger.py` - 导入 models 和 schemas
- `backend/services/parser.py` - 导入相关 schemas

#### 测试文件
- `backend/tests/test_*.py` - 所有测试文件

### 5. 实施步骤

1. **创建目录结构**
   ```bash
   mkdir -p backend/models backend/schemas
   ```

2. **创建基础文件**
   - `backend/models/__init__.py`
   - `backend/models/base.py`
   - `backend/schemas/__init__.py`
   - `backend/schemas/enums.py`

3. **按功能拆分模型**
   - 将 `models.py` 中的内容按功能拆分到各个模块
   - 保持所有类名、字段名、关系不变

4. **按功能拆分schemas**
   - 将 `schemas.py` 中的内容按功能拆分到各个模块
   - 保持所有验证逻辑、计算逻辑不变

5. **更新导入语句**
   - 更新所有文件的导入路径
   - 确保测试通过

6. **验证功能**
   - 运行现有测试
   - 手动测试API
   - 验证数据库初始化

### 6. 风险与注意事项

- **保持100%向后兼容**: 所有类名、字段名、方法名保持不变
- **循环导入**: 注意避免 models 和 schemas 之间的循环导入
- **测试覆盖**: 确保所有现有测试都能通过
- **数据库迁移**: 本次重构不涉及数据库结构变化，无需迁移

### 7. 验证清单

- [ ] 所有模型类可以正确导入
- [ ] 所有schema类可以正确导入
- [ ] 数据库初始化成功
- [ ] 所有API端点正常工作
- [ ] 所有测试通过
- [ ] 没有循环导入问题
- [ ] 代码风格保持一致