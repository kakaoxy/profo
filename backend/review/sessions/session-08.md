## 审查记录 - 08 - P4 公共模块

### 审查范围
- 文件1: models/common/base.py (127行)
- 文件2: schemas/common.py (60行)
- 文件3: schemas/response.py (40行)
- 文件4: dependencies/common.py (21行)
- 文件5: dependencies/projects.py (30行)

### 发现问题

#### 问题 S08-001: BaseModel 使用旧式 Column() 而非 Mapped[] + mapped_column()
- **文件**: models/common/base.py#L115-L127
- **检查项**: H1
- **严重程度**: 🔴严重
- **问题描述**: `BaseModel` 基类使用旧式 `Column()` 语法定义字段，而非 AGENTS.md 要求的 `Mapped[]` + `mapped_column()` 模式。作为所有模型的基类，此问题会传播到所有继承 BaseModel 的子模型。
  ```python
  # 当前代码
  id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
  created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
  updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
  ```
- **最佳实践参考**: AGENTS.md 硬约束："SQLAlchemy 模型使用 `Mapped[]` 类型注解"
- **修改建议**:
  ```python
  from sqlalchemy.orm import Mapped, mapped_column
  from sqlalchemy import String, DateTime

  class BaseModel(Base):
      __abstract__ = True

      id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
      created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
      updated_at: Mapped[datetime] = mapped_column(
          DateTime,
          default=lambda: datetime.now(timezone.utc),
          onupdate=lambda: datetime.now(timezone.utc),
      )
  ```
- **影响范围**: 所有继承 BaseModel 的模型类

#### 问题 S08-002: PaginatedResponse 重复定义
- **文件**: schemas/common.py#L14-L26, schemas/response.py#L13-L29
- **检查项**: D5
- **严重程度**: 🟡中等
- **问题描述**: `PaginatedResponse` 在 `schemas/common.py` 和 `schemas/response.py` 中重复定义，两个版本结构相同但配置不同（common.py 使用 `ConfigDict(from_attributes=True)`，response.py 使用 `json_schema_extra` 示例）。违反 DRY 原则，且使用者可能导入不同版本导致行为不一致。
- **最佳实践参考**: DRY 原则 + FastAPI 最佳实践 — 泛型分页响应统一实现，无重复定义
- **修改建议**:
  1. 保留 `schemas/response.py` 中的定义（包含示例，更适合文档）
  2. 在 `schemas/common.py` 中从 response.py 导入：`from schemas.response import PaginatedResponse`
  3. 或合并为一个文件，统一配置
- **影响范围**: 所有使用分页响应的路由

#### 问题 S08-003: schemas/response.py 注释与 AGENTS.md 规范矛盾
- **文件**: schemas/response.py#L1-L4
- **检查项**: D3
- **严重程度**: 🟡中等
- **问题描述**: 文件头注释声明"遵循 AGENTS.md 规范：直接返回 Pydantic 模型，不使用 code/msg/data 包装器"。但 AGENTS.md 明确要求响应格式为 `{"code":0,"message":"success","data":{}}`。此注释表明开发者可能误解了规范意图，或规范在开发过程中发生了变更但注释未同步。
- **最佳实践参考**: AGENTS.md 硬约束："响应格式：`{"code":0,"message":"success","data":{}}`"
- **修改建议**:
  1. 与团队确认 AGENTS.md 规范的实际意图
  2. 如果确认需要 code/msg/data 包装器，则需创建统一的响应封装模型
  3. 如果确认当前直接返回模式是正确的，则需更新 AGENTS.md 规范
- **影响范围**: 全局响应格式策略

#### 问题 S08-004: pagination 依赖返回 dict 而非 Pydantic 模型
- **文件**: dependencies/common.py#L8-L18
- **检查项**: B1
- **严重程度**: 🟡中等
- **问题描述**: `pagination()` 依赖函数返回 `dict[str, int]`，而非 Pydantic 模型。这导致：
  1. 返回值缺乏类型安全，调用方无法获得 IDE 自动补全
  2. 无法在 OpenAPI 文档中正确展示分页参数结构
  3. 与 FastAPI 推荐的依赖注入模式不一致
- **最佳实践参考**: FastAPI 最佳实践 — 依赖返回值应使用 Pydantic 模型或 NamedTuple 以获得类型安全
- **修改建议**:
  ```python
  from pydantic import BaseModel

  class PaginationParams(BaseModel):
      page: int
      page_size: int

  def pagination(
      page: Annotated[int, Query(ge=1, description="页码")] = 1,
      page_size: Annotated[int, Query(ge=1, le=200, description="每页数量")] = 50,
  ) -> PaginationParams:
      return PaginationParams(page=page, page_size=page_size)

  PaginationDep = Annotated[PaginationParams, Depends(pagination)]
  ```
- **影响范围**: 所有使用 PaginationDep 的路由

#### 问题 S08-005: page_size 上限与 settings.py 不一致
- **文件**: dependencies/common.py#L10
- **检查项**: G5
- **严重程度**: 🟡中等
- **问题描述**: `pagination()` 中 `page_size` 的 `le=200`，但 `settings.py` 中 `max_page_size: int = 1000`。两处配置不一致，且硬编码的 200 覆盖了 settings 中的配置，导致 settings 中的 max_page_size 实际无效。
- **最佳实践参考**: 配置管理最佳实践 — 限制值应从统一配置读取
- **修改建议**:
  ```python
  from settings import settings

  def pagination(
      page: Annotated[int, Query(ge=1, description="页码")] = 1,
      page_size: Annotated[int, Query(ge=1, description="每页数量")] = settings.default_page_size,
  ) -> dict[str, int]:
      # 运行时校验上限
      page_size = min(page_size, settings.max_page_size)
      return {"page": page, "page_size": page_size}
  ```
- **影响范围**: 所有分页查询的 page_size 上限

#### 问题 S08-006: PaginatedResponse 使用 Field(...) 作为必填默认值
- **文件**: schemas/common.py#L21-L24, schemas/response.py#L25-L28
- **检查项**: C2
- **严重程度**: 🟢轻微
- **问题描述**: 两个 `PaginatedResponse` 都使用 `Field(...)` 作为必填默认值。FastAPI 官方推荐使用不带默认值的声明方式代替 `...`（Ellipsis）。
- **最佳实践参考**: FastAPI 官方推荐 — 不使用 `...`（Ellipsis）作为必填参数默认值
- **修改建议**:
  ```python
  # 替代 Field(...) 的方式
  items: list[T]  # 不带默认值即为必填
  total: int
  page: int
  page_size: int
  ```
  或保留 Field 但不使用 `...`：
  ```python
  items: list[T] = Field(description="数据列表")  # 无默认值即为必填
  ```
- **影响范围**: Schema 定义风格一致性

#### 问题 S08-007: schemas/response.py 使用旧式 model_config dict
- **文件**: schemas/response.py#L30-L39
- **检查项**: -
- **严重程度**: 🟢轻微
- **问题描述**: `PaginatedResponse` 使用旧式 `model_config = {"json_schema_extra": {...}}` 字典配置，而非 Pydantic v2 推荐的 `model_config = ConfigDict(...)` 模式。与 schemas/common.py 中的 PaginatedResponse 使用 ConfigDict 不一致。
- **最佳实践参考**: Pydantic v2 最佳实践 — 使用 ConfigDict
- **修改建议**:
  ```python
  from pydantic import ConfigDict

  class PaginatedResponse(BaseModel, Generic[T]):
      model_config = ConfigDict(
          json_schema_extra={
              "examples": [{"items": [{"id": "1"}], "total": 100, "page": 1, "page_size": 50}],
          },
      )
  ```
- **影响范围**: Schema 配置风格一致性

### 审查统计
- 审查文件数: 5
- 发现问题数: 7 (🔴严重: 1, 🟡中等: 4, 🟢轻微: 2)
- 已覆盖检查项: D3, D5, H1, H3, B1, C2, G5
- 未覆盖检查项: 无（本次审查覆盖了计划中的所有重点检查项）

### 审查人备注
1. **最关键发现**：BaseModel 基类使用旧式 Column() 是系统性问题，与 S02-001/S02-005（lead.py 和 _project_base.py 使用旧式 Column()）属于同一根因。修复 BaseModel 后，所有继承它的模型也应逐步迁移到 Mapped[] 模式。
2. **PaginatedResponse 重复定义**确认了 Phase 1 探索中发现的 P05 问题。两个版本配置不同（from_attributes vs json_schema_extra），需要统一。
3. **响应格式矛盾**：schemas/response.py 的注释明确说"不使用 code/msg/data 包装器"，与 AGENTS.md 规范直接矛盾。这是一个需要团队决策的关键问题。
4. **dependencies/projects.py** 是一个良好的依赖注入范例 ✅：使用 Annotated 类型别名、Service 通过 DB 会话注入、清晰的类型注解。
5. **dependencies/common.py** 的 pagination 依赖使用了 Annotated 模式 ✅，但返回类型需要改进。
