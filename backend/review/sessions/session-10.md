## 审查记录 - 10 - 剩余关键文件

### 审查范围
- 文件1: routers/leads/leads.py (20行)
- 文件2: routers/public/projects.py (414行)
- 文件3: models/property/property.py (170行)
- 文件4: schemas/property/core.py (134行)
- 文件5: routers/system/roles.py (92行)

### 发现问题

#### 问题 S10-001: routers/public/projects.py 路由层直接执行大量 SQLAlchemy 查询
- **文件**: routers/public/projects.py#L41-L414
- **检查项**: A4
- **严重程度**: 🔴严重
- **问题描述**: C端公开项目路由中，5个端点全部直接在路由层执行 SQLAlchemy 查询，严重违反 AGENTS.md 的分层约束：
  1. `get_projects()` (L82-L108): 直接 `db.query(L4MarketingProject).filter(...)`，含 7 个条件筛选
  2. `get_sold_projects()` (L154-L165): 直接查询 + 排序 + 分页
  3. `get_project_detail()` (L211-L236): 2 个直接查询（项目 + 媒体列表）
  4. `get_consultant_contact()` (L313-L331): 2 个直接查询（项目 + 顾问）
  5. `get_platform_stats()` (L360-L401): 复杂聚合查询
  6. `_resolve_cover_image()` (L41-L57): 辅助函数直接执行 `db.query(L4MarketingMedia)`
- **最佳实践参考**: AGENTS.md 硬约束："路由层不含业务逻辑（无 SQLAlchemy 查询、无数据处理）"
- **修改建议**: 将所有查询逻辑移至 Service 层（如 `services/marketing/public_service.py`），路由层仅负责参数接收和响应返回
- **影响范围**: C端公开接口的架构合规性

#### 问题 S10-002: models/property/property.py 使用旧式 Column() 和物理 ForeignKey
- **文件**: models/property/property.py#L26-L129
- **检查项**: H1, H2
- **严重程度**: 🔴严重
- **问题描述**: `PropertyCurrent` 和 `PropertyHistory` 模型：
  1. 全部使用旧式 `Column()` 而非 `Mapped[]` + `mapped_column()` (H1)
  2. `community_id = Column(String(36), ForeignKey("communities.id"))` 使用物理外键 (H2)
  3. 未继承 `BaseModel`，自定义了 `id`/`created_at`/`updated_at` 字段 (H3)
- **最佳实践参考**: AGENTS.md 硬约束："SQLAlchemy 模型使用 `Mapped[]` 类型注解"、"关联使用逻辑外键"
- **修改建议**:
  ```python
  class PropertyCurrent(BaseModel):  # 继承 BaseModel
      __tablename__ = "property_current"

      community_id: Mapped[str] = mapped_column(String(36), comment="小区ID")  # 逻辑外键
      # ... 其他字段改用 Mapped[]
  ```
- **影响范围**: 房源数据模型，影响范围广泛

#### 问题 S10-003: get_project_detail N+1 查询风险
- **文件**: routers/public/projects.py#L110-L112, #L168-L169
- **检查项**: G2
- **严重程度**: 🟡中等
- **问题描述**: `get_projects()` 和 `get_sold_projects()` 在循环中调用 `_resolve_cover_image(db, item)`，每次调用执行一次 `db.query(L4MarketingMedia)` 查询。如果返回 20 条项目，将产生 20+1 次数据库查询。
- **最佳实践参考**: SQLAlchemy 最佳实践 — 使用 `selectinload`/`subqueryload` 预加载关联数据
- **修改建议**:
  ```python
  # 在主查询中预加载媒体
  query = query.options(selectinload(L4MarketingProject.media))
  # 或批量查询所有封面图
  ```
- **影响范围**: C端房源列表接口性能

#### 问题 S10-004: get_projects 12个查询参数缺少 Filter Schema
- **文件**: routers/public/projects.py#L66-L80
- **检查项**: C1
- **严重程度**: 🟡中等
- **问题描述**: `get_projects()` 有 12 个查询参数（project_status, community_name, layout, min_price, max_price, min_area, max_area, sort_by, sort_order, page, page_size），函数签名过长(PLR0913)。应使用 Pydantic Filter Schema 封装。
- **最佳实践参考**: AGENTS.md "Pydantic 模型按 *Create/*Update/*Response/*Filter 分离"
- **修改建议**:
  ```python
  class PublicProjectFilter(BaseModel):
      project_status: str | None = None
      community_name: str | None = None
      # ...

  @router.get("/projects")
  def get_projects(db: DbSessionDep, filters: Annotated[PublicProjectFilter, Depends()]) -> ...:
  ```
- **影响范围**: C端房源列表接口的可维护性

#### 问题 S10-005: 手动抛 HTTPException(404)
- **文件**: routers/public/projects.py#L222-L226, #L324-L328, routers/system/roles.py#L49-L50
- **检查项**: E1
- **严重程度**: 🟡中等
- **问题描述**: 3 处手动抛出 `HTTPException(status_code=404)`：
  1. projects.py L222: 项目不存在
  2. projects.py L324: 项目不存在
  3. roles.py L49: 角色不存在
  应使用项目异常体系的 `ResourceNotFoundError`，由全局处理器统一转换。
- **最佳实践参考**: 分层职责原则 — Service 层抛业务异常，由全局处理器转换
- **修改建议**: 替换为 `ResourceNotFoundError("项目不存在")` 等
- **影响范围**: 异常处理一致性

#### 问题 S10-006: PropertyIngestionModel Schema 命名不符合规范
- **文件**: schemas/property/core.py#L10
- **检查项**: C1
- **严重程度**: 🟢轻微
- **问题描述**: `PropertyIngestionModel` 命名使用 `Ingestion` 而非 AGENTS.md 规范的 `*Create/*Update/*Response/*Filter` 分离模式。虽然 `Ingestion` 语义上准确描述了数据导入场景，但与项目规范不一致。
- **最佳实践参考**: AGENTS.md "Pydantic 模型按 *Create/*Update/*Response/*Filter 分离"
- **修改建议**: 考虑重命名为 `PropertyCreate` 或在规范中增加 `*Ingestion` 作为数据导入场景的允许命名
- **影响范围**: Schema 命名一致性

#### 问题 S10-007: PropertyIngestionModel 使用 Field(...) 作为必填默认值
- **文件**: schemas/property/core.py#L17-L34
- **检查项**: C2
- **严重程度**: 🟢轻微
- **问题描述**: 多个字段使用 `Field(...)` 作为必填默认值，如 `data_source: str = Field(..., alias="数据源")`。FastAPI 官方推荐不使用 `...`（Ellipsis）。
- **最佳实践参考**: FastAPI 官方推荐 — 不使用 `...`（Ellipsis）作为必填参数默认值
- **修改建议**: `data_source: str = Field(alias="数据源", description="数据来源平台")` — 不提供默认值即为必填
- **影响范围**: Schema 定义风格一致性

### 审查统计
- 审查文件数: 5
- 发现问题数: 7 (🔴严重: 2, 🟡中等: 3, 🟢轻微: 2)
- 已覆盖检查项: A4, H1, H2, H3, C1, C2, E1, G2
- 未覆盖检查项: F1-F4（文档生成相关，本次审查文件多数缺少端点描述和字段说明，但作为已知问题不再单独列出）

### 审查人备注
1. **最关键发现**：routers/public/projects.py 是目前审查中发现的最严重的路由层越层案例 — 5个端点全部直接操作数据库，且包含 N+1 查询风险。这与 S01-003（routers/public/auth.py）和 S05-004（routers/market/communities.py）属于同一系统性问题。
2. **models/property/property.py** 的问题与 S02-001/S02-005/S08-001 属于同一根因 — 旧式 Column() + 物理 ForeignKey。PropertyCurrent 和 PropertyHistory 是项目中最大的两个模型，迁移工作量较大。
3. **routers/system/roles.py** 是本次审查中最佳实践范例 ✅：正确使用 APIRouter(prefix/tags)、PaginationDep、def 而非 async def、委托 role_service 处理业务逻辑。仅有一处 HTTPException 需要替换。
4. **routers/leads/leads.py** 作为路由整合模块设计良好 ✅，正确使用 include_router 组织子路由。
5. **schemas/property/core.py** 的 field_validator 和 model_validator 使用是 Pydantic v2 的良好实践 ✅，alias 支持中文字段名也是合理的设计。
