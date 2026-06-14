## 审查记录 - 09 - utils/ + routers/common/

### 审查范围
- 文件1: utils/common.py (87行)
- 文件2: utils/query_params.py (128行)
- 文件3: utils/error_formatters.py (170行)
- 文件4: routers/common/upload.py (195行)
- 文件5: routers/common/push.py (71行)

### 发现问题

#### 问题 S09-001: PropertyExportParams 与 PropertyQueryParams 大量重复
- **文件**: utils/query_params.py#L66-L128
- **检查项**: C1
- **严重程度**: 🟡中等
- **问题描述**: `PropertyExportParams` 与 `PropertyQueryParams` 有 12 个相同字段（status, community_name, districts, business_circles, orientations, floor_levels, rooms, rooms_gte, min_price, max_price, min_area, max_area, sort_by, sort_order），仅差分页参数和辅助方法。违反 DRY 原则，新增筛选条件需同时修改两处。
- **最佳实践参考**: DRY 原则 + AGENTS.md "Pydantic 模型按 *Create/*Update/*Response/*Filter 分离"
- **修改建议**:
  ```python
  @dataclass
  class PropertyFilterMixin:
      """房源筛选条件基类."""
      status: str | None = None
      community_name: str | None = None
      # ... 其他筛选字段

  @dataclass
  class PropertyQueryParams(PropertyFilterMixin):
      sort_by: str = "updated_at"
      sort_order: str = "desc"
      page: int = 1
      page_size: int = 50

  @dataclass
  class PropertyExportParams(PropertyFilterMixin):
      sort_by: str = "updated_at"
      sort_order: str = "desc"
  ```
  或更好：改用 Pydantic BaseModel 替代 dataclass，获得验证能力。
- **影响范围**: 房源查询和导出功能

#### 问题 S09-002: query_params 使用 dataclass 而非 Pydantic BaseModel
- **文件**: utils/query_params.py#L9-L64
- **检查项**: C1
- **严重程度**: 🟡中等
- **问题描述**: `PropertyQueryParams` 和 `PropertyExportParams` 使用 `@dataclass` 而非 Pydantic `BaseModel`。这导致：
  1. 无法利用 Pydantic 的自动验证（如字段类型约束、范围检查）
  2. 与项目中其他 Schema（均使用 BaseModel）风格不一致
  3. 无法在 OpenAPI 文档中正确展示查询参数结构
  4. 缺少 `from_attributes` 等序列化配置
- **最佳实践参考**: FastAPI 最佳实践 — 查询参数应使用 Pydantic 模型以获得验证和文档支持
- **修改建议**: 将 dataclass 改为 Pydantic BaseModel，利用 Field 添加验证规则
- **影响范围**: 房源查询参数的类型安全和文档

#### 问题 S09-003: upload.py 中手动抛 HTTPException
- **文件**: routers/common/upload.py#L74-L77, #L104-L107, #L146-L149, #L171-L174, #L183-L186
- **检查项**: E1
- **严重程度**: 🟡中等
- **问题描述**: `upload.py` 中有 5 处手动抛出 HTTPException：
  1. L74: `HTTPException(500, "导入任务启动失败")` — 应使用 ServiceException 体系
  2. L104: `HTTPException(403, "无权查看此任务")` — 应使用 PermissionDeniedError
  3. L146: `HTTPException(400, "任务不存在或无法取消")` — 应使用 BusinessLogicError
  4. L171: `HTTPException(400, "无效的文件名")` — 应使用 ValidationError
  5. L183: `HTTPException(403, "访问被拒绝")` — 应使用 PermissionDeniedError
- **最佳实践参考**: 分层职责原则 — Service 层抛业务异常，由全局处理器转换
- **修改建议**: 替换为项目异常体系中的对应异常类
- **影响范围**: 异常处理一致性

#### 问题 S09-004: push.py 接收 list[dict] 而非 Pydantic 模型
- **文件**: routers/common/push.py#L27
- **检查项**: C1
- **严重程度**: 🟡中等
- **问题描述**: `push_properties` 接收 `list[dict]` 类型的请求体，而非 Pydantic 模型。这导致：
  1. 请求体无自动验证，任何 JSON 结构都会被接受
  2. OpenAPI 文档无法展示请求体结构
  3. 缺少字段级别的类型约束和验证
- **最佳实践参考**: FastAPI 最佳实践 — 请求体应使用 Pydantic 模型进行验证
- **修改建议**:
  ```python
  class PropertyPushItem(BaseModel):
      """推送房源数据项."""
      source: str
      property_id: str
      # ... 其他必要字段

  @router.post("")
  async def push_properties(
      properties: Annotated[list[PropertyPushItem], Body(max_length=10000)],
      ...
  ) -> PushResult:
  ```
- **影响范围**: JSON 推送接口的数据验证和文档

#### 问题 S09-005: create_import_task 是 async def 但调用同步方法
- **文件**: routers/common/upload.py#L38-L83
- **检查项**: G1
- **严重程度**: 🟡中等
- **问题描述**: `create_import_task` 声明为 `async def`，但调用了同步方法 `task_service.create_task(file, current_user.id, db)` 和 `task_service.update_task_status(...)`。同步数据库操作在 async def 中会阻塞事件循环。对比 push.py 中正确使用了 `run_in_threadpool`。
- **最佳实践参考**: FastAPI 官方推荐 — 同步 I/O 操作使用 `def` 或 `run_in_threadpool`
- **修改建议**:
  ```python
  @router.post("/csv")
  @limiter.limit(RateLimits.CSV_IMPORT)
  def create_import_task(...):  # 改为 def
      ...
  ```
  或使用 `run_in_threadpool` 包装同步调用。
- **影响范围**: CSV 上传接口的并发性能

#### 问题 S09-006: format_database_error 通过字符串匹配判断错误类型
- **文件**: utils/error_formatters.py#L104-L170
- **检查项**: E5
- **严重程度**: 🟢轻微
- **问题描述**: `format_database_error` 通过检查错误消息字符串（如 `"UNIQUE constraint failed"`, `"uq_source_property"` 等）来判断具体错误类型。这种方式脆弱且依赖 SQLite 的错误消息格式，如果切换数据库或 SQLite 版本变更，可能失效。
- **最佳实践参考**: 健壮性原则 — 错误类型判断应基于异常类型而非消息内容
- **修改建议**: 长期方案是在 Service 层捕获 IntegrityError 并抛出具体的业务异常（如 DuplicateRecordError），而非在全局处理器中解析错误消息。当前实现作为兜底方案可接受。
- **影响范围**: 数据库错误信息的准确性

#### 问题 S09-007: CancelTaskResponse 定义在路由文件中
- **文件**: routers/common/upload.py#L24-L28
- **检查项**: C1
- **严重程度**: 🟢轻微
- **问题描述**: `CancelTaskResponse` Pydantic 模型定义在路由文件中，而非 schemas 目录。与项目中其他 Schema 集中在 schemas/ 目录的模式不一致。
- **最佳实践参考**: AGENTS.md — Pydantic 模型按 *Create/*Update/*Response/*Filter 分离
- **修改建议**: 将 `CancelTaskResponse` 移至 `schemas/upload.py` 或 `schemas/common.py`
- **影响范围**: 代码组织一致性

### 审查统计
- 审查文件数: 5
- 发现问题数: 7 (🔴严重: 0, 🟡中等: 5, 🟢轻微: 2)
- 已覆盖检查项: G1, A4, E1, E5, C1
- 未覆盖检查项: 无

### 审查人备注
1. **push.py 是最佳实践范例**：正确使用 `run_in_threadpool` 执行同步导入、使用项目异常体系（ValidationError, BusinessLogicError）、路由级别定义 prefix/tags ✅
2. **utils/common.py 的 RateLimits 类**是优秀的实践 — 速率限制值集中管理，避免魔法字符串散布 ✅
3. **upload.py 的安全实践**值得肯定 — 使用 `get_safe_file_path` 和 `is_safe_path` 防止目录遍历攻击 ✅
4. **query_params.py 的 dataclass 问题**与 S05-003（routers/market/properties.py 缺少 Filter Schema）相关联，应统一改为 Pydantic Filter Schema
5. **format_database_error 的字符串匹配**虽然脆弱，但作为 SQLite 特定的兜底方案在当前阶段可接受。长期应通过 Service 层的预检查避免依赖数据库约束错误
