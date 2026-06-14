## 审查记录 - 会话02 - 2026-06-14

### 审查范围
- 文件1: services/projects/facade.py (186行, 20个方法)
- 文件2: services/projects/core.py (264行, 8个方法)
- 文件3: models/lead/lead.py (134行, 3个模型)
- 文件4: models/project/_project_base.py (58行, 1个模型)
- 文件5: schemas/project/core.py (264行, 7个Schema)

### 发现问题

---

#### 问题 S02-001: Lead 模型使用旧式 Column() 而非 Mapped[] 类型注解
- **文件**: models/lead/lead.py#L1-L134
- **检查项**: H1
- **严重程度**: 🔴严重
- **问题描述**: `Lead`、`LeadFollowUp`、`LeadPriceHistory` 三个模型全部使用旧式 `Column()` 风格定义字段，不符合 AGENTS.md 要求的 `Mapped[]` 类型注解规范。
  ```python
  # 当前代码
  id = Column(String(36), primary_key=True, comment="UUID")
  community_name = Column(String(200), nullable=False, comment="小区名称")

  # 应改为
  id: Mapped[str] = mapped_column(String(36), primary_key=True, comment="UUID")
  community_name: Mapped[str] = mapped_column(String(200), nullable=False, comment="小区名称")
  ```
- **最佳实践参考**: AGENTS.md 硬约束 "SQLAlchemy用Mapped[]"；SQLAlchemy 2.0 推荐使用 `Mapped[]` + `mapped_column()` 声明式风格。
- **修改建议**: 将所有 `Column()` 定义迁移为 `Mapped[]` + `mapped_column()` 风格。需配合 Alembic 迁移。
- **影响范围**: models/lead/lead.py, 相关的 Service 和 Schema 文件

---

#### 问题 S02-002: Lead 模型使用物理外键违反逻辑外键规范
- **文件**: models/lead/lead.py#L48, L58, L72-L75, L95, L101, L119, L125
- **检查项**: H2
- **严重程度**: 🔴严重
- **问题描述**: Lead 模型中多处使用物理 `ForeignKey()` 和 `relationship()`，违反 AGENTS.md "关联用逻辑外键(`user_id: int`)，级联由Service处理"的规范。
  ```python
  # 物理外键
  auditor_id = Column(String(36), ForeignKey("users.id"), nullable=True, comment="审核人ID")
  creator_id = Column(String(36), ForeignKey("users.id"), nullable=True, comment="创建人ID")

  # 物理关系
  creator = relationship("User", foreign_keys=[creator_id])
  follow_ups = relationship("LeadFollowUp", back_populates="lead", cascade="all, delete-orphan")
  ```
- **最佳实践参考**: AGENTS.md 硬约束 "关联用逻辑外键(`user_id: int`)，级联由Service处理"
- **修改建议**: 移除所有 `ForeignKey()` 声明和 `relationship()` 定义，改为纯逻辑引用（仅保留 `creator_id: Mapped[str | None]` 字段）。关联查询在 Service 层通过显式 JOIN 实现，级联删除由 Service 方法处理。
- **影响范围**: models/lead/lead.py, services/leads/, 相关路由

---

#### 问题 S02-003: Lead 模型未继承 BaseModel 基类
- **文件**: models/lead/lead.py#L22-L69
- **检查项**: H3
- **严重程度**: 🟡中等
- **问题描述**: `Lead` 模型直接继承 `Base` 而非 `BaseModel`，手动定义了 `id`、`created_at`、`updated_at` 字段，与 `BaseModel` 提供的公共字段重复。同项目的 `Project` 模型正确继承了 `BaseModel`。
  ```python
  # Lead - 手动定义公共字段
  class Lead(Base):
      id = Column(String(36), primary_key=True, comment="UUID")
      created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), comment="创建时间")
      updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=..., comment="更新时间")

  # Project - 正确继承 BaseModel
  class Project(BaseModel):
      # id, created_at, updated_at 由 BaseModel 提供
  ```
- **最佳实践参考**: 一致性原则 — 同项目内模型应统一继承体系。
- **修改建议**: 将 `Lead`、`LeadFollowUp`、`LeadPriceHistory` 改为继承 `BaseModel`，移除手动定义的公共字段。
- **影响范围**: models/lead/lead.py

---

#### 问题 S02-004: Lead 模型使用数据库级级联删除
- **文件**: models/lead/lead.py#L74
- **检查项**: H2
- **严重程度**: 🟡中等
- **问题描述**: `Lead.follow_ups` 关系使用 `cascade="all, delete-orphan"`，这是数据库级级联删除，违反 AGENTS.md "级联由Service处理"的要求。
  ```python
  follow_ups = relationship("LeadFollowUp", back_populates="lead", cascade="all, delete-orphan")
  ```
- **最佳实践参考**: AGENTS.md "级联由Service处理"
- **修改建议**: 移除 `cascade` 参数，在 Service 层的 `delete_lead()` 方法中显式删除关联的跟进记录和价格历史。
- **影响范围**: models/lead/lead.py, services/leads/core.py

---

#### 问题 S02-005: Project 模型使用旧式 Column() 和物理外键
- **文件**: models/project/_project_base.py#L14-L21
- **检查项**: H1, H2
- **严重程度**: 🔴严重
- **问题描述**: `Project` 模型虽然正确继承了 `BaseModel`，但字段定义仍使用旧式 `Column()` 而非 `Mapped[]`，且使用了物理外键。
  ```python
  # 旧式 Column()
  name = Column(String(700), nullable=False, comment="项目名称(自动生成:小区名称+地址)")

  # 物理外键
  community_id = Column(String(36), ForeignKey("communities.id", ondelete="SET NULL"), nullable=True, comment="小区ID")
  project_manager_id = Column(String(36), ForeignKey("users.id"), nullable=True, comment="项目负责人ID")
  ```
- **最佳实践参考**: AGENTS.md 硬约束 "SQLAlchemy用Mapped[]" 和 "关联用逻辑外键"
- **修改建议**: 迁移为 `Mapped[]` + `mapped_column()` 风格，移除 `ForeignKey()` 和 `ondelete` 参数。
- **影响范围**: models/project/_project_base.py, 其他 _project_*.py 文件

---

#### 问题 S02-006: ProjectResponse 过于庞大（30+ 字段涵盖所有子域）
- **文件**: schemas/project/core.py#L167-L234
- **检查项**: D4
- **严重程度**: 🟡中等
- **问题描述**: `ProjectResponse` 包含 30+ 字段，涵盖合同、业主、销售、财务、装修等所有子域数据。这导致：
  1. 任何子域变更都影响此 Schema
  2. 列表查询返回不必要的详细数据
  3. 敏感信息（如 `owner_id_card`）在不需要时也暴露
  4. `list[Any]` 类型字段（`signing_materials`, `sales_records`, `renovation_photos`）丢失类型安全
  ```python
  class ProjectResponse(BaseModel):
      # 基础字段
      id, name, status, community_name, address, area, layout, orientation...
      # 合同字段
      contract_no, signing_price, signing_date, signing_period...
      # 业主字段
      owner_name, owner_phone, owner_id_card, owner_info
      # 销售字段
      list_price, listing_date, sold_price, sold_date...
      # 财务字段
      total_income, total_expense, net_cash_flow, roi
      # 装修字段
      renovation_stage, renovation_stage_dates, renovation_photos
      # 列表字段（类型不安全）
      signing_materials: list[Any] | None
      sales_records: list[Any] | None
      renovation_photos: list[Any] | None
  ```
- **最佳实践参考**: FastAPI 安全最佳实践 "响应模型字段最小化，避免暴露敏感信息"；DRY 原则。
- **修改建议**: 拆分为 `ProjectBasicResponse`（列表用，仅含基础字段）+ `ProjectDetailResponse`（详情用，含子域数据）。子域数据可进一步拆分为嵌套模型（如 `ContractInfo`, `OwnerInfo`, `SalesInfo`）。`list[Any]` 应替换为具体类型。
- **影响范围**: schemas/project/core.py, routers/projects/core.py, services/projects/

---

#### 问题 S02-007: 缺少 ProjectFilter Schema
- **文件**: schemas/project/core.py
- **检查项**: C1
- **严重程度**: 🟡中等
- **问题描述**: 项目列表的筛选参数（`status`、`community_name`）直接在路由函数签名中定义（routers/projects/core.py#L74-L75），未封装为 `ProjectFilter` Schema。AGENTS.md 要求 Pydantic 模型按 `*Create/*Update/*Response/*Filter` 分离。
  ```python
  # 当前：筛选参数散落在路由签名中
  status: Annotated[str | None, Query(description="项目状态筛选")] = None,
  community_name: Annotated[str | None, Query(description="小区名称筛选")] = None,
  ```
- **最佳实践参考**: AGENTS.md 硬约束 "Pydantic分*Create/*Update/*Response/*Filter"
- **修改建议**: 创建 `ProjectFilter(BaseModel)` Schema，将筛选参数集中管理，便于复用和验证。
- **影响范围**: schemas/project/core.py, routers/projects/core.py

---

#### 问题 S02-008: Schema 中使用 Ellipsis (...) 作为必填字段默认值
- **文件**: schemas/project/core.py#L64, L76, L77, L83
- **检查项**: C2
- **严重程度**: 🟢轻微
- **问题描述**: `ProjectResponse.id`、`ProjectCreate.community_name`、`ProjectCreate.address`、`ProjectCreate.contract_no` 使用 `Field(...)` 作为必填标记。FastAPI 官方推荐不使用 Ellipsis。
  ```python
  id: str = Field(..., description="项目ID")
  community_name: str = Field(..., max_length=200, description="小区名称")
  ```
- **最佳实践参考**: FastAPI 官方 "Do not use Ellipsis for Pydantic models. Do this, without Ellipsis (...)"
- **修改建议**: 移除 `...`，直接声明类型不带默认值即可表示必填：
  ```python
  id: str = Field(description="项目ID")
  community_name: str = Field(max_length=200, description="小区名称")
  ```
- **影响范围**: schemas/project/core.py 及其他 Schema 文件

---

#### 问题 S02-009: Facade 延迟导入暗示循环依赖
- **文件**: services/projects/facade.py#L105
- **检查项**: B5
- **严重程度**: 🟡中等
- **问题描述**: `update_renovation_stage` 方法内部使用 `from .internal import ProjectResponseBuilder` 延迟导入，而非文件顶部导入。这通常暗示存在循环依赖问题。
  ```python
  def update_renovation_stage(self, project_id: str, renovation_data: RenovationUpdate) -> ProjectResponse:
      project = self._renovation_service.update_stage(project_id, renovation_data)
      from .internal import ProjectResponseBuilder  # noqa: PLC0415
      return ProjectResponse.model_validate(ProjectResponseBuilder(self.db).build(project))
  ```
- **最佳实践参考**: 循环依赖通常表明模块职责划分不清，应通过重构消除。
- **修改建议**: 分析 `ProjectResponseBuilder` 的依赖链，将共享部分提取到独立模块，消除循环依赖后将导入移到文件顶部。
- **影响范围**: services/projects/facade.py, services/projects/internal/

---

#### 问题 S02-010: ProjectCoreService.get_project 返回 None 而非抛出异常
- **文件**: services/projects/core.py#L95-L107
- **检查项**: E1
- **严重程度**: 🟡中等
- **问题描述**: `get_project()` 方法在项目不存在时返回 `None`，而同类的 `update_project()`、`delete_project()`、`update_status()` 方法在项目不存在时抛出 `ResourceNotFoundError`。不一致的异常处理方式导致调用方（路由层）需要手动检查返回值并抛出 HTTPException（参见 S01-002）。
  ```python
  # get_project - 返回 None
  def get_project(self, project_id: str, *, include_all: bool = False) -> ProjectResponse | None:
      project = self.query_service.get_by_id(project_id, include_all=include_all)
      return ProjectResponse.model_validate(self.response_builder.build(project))

  # update_project - 抛出异常
  def update_project(self, project_id: str, update_data: ProjectUpdate) -> ProjectResponse:
      if not project:
          raise ResourceNotFoundError("项目不存在")
  ```
- **最佳实践参考**: 一致性原则 — 同一 Service 内的查询方法应采用统一的"资源不存在"处理策略。
- **修改建议**: `get_project()` 也应抛出 `ResourceNotFoundError`，保持与其他方法一致。如需"查询可能不存在"的场景，可提供 `try_get_project()` 方法。
- **影响范围**: services/projects/core.py, routers/projects/core.py

---

#### 问题 S02-011: ProjectCoreService 中重复的项目查询模式
- **文件**: services/projects/core.py#L158-L165, L186-L193, L218-L225
- **检查项**: G2
- **严重程度**: 🟢轻微
- **问题描述**: `update_project()`、`delete_project()`、`update_status()` 三个方法中有完全相同的项目查询模式（按 ID + 未删除筛选），应提取为内部方法。
  ```python
  # 重复3次的查询模式
  project = (
      self.db.query(Project)
      .filter(
          Project.id == project_id,
          Project.is_deleted.is_(False),
      )
      .first()
  )
  ```
- **最佳实践参考**: DRY 原则；SQLAlchemy 最佳实践 — 提取公共查询逻辑。
- **修改建议**: 在 `ProjectQueryService` 中添加 `get_active_project(project_id)` 方法，统一处理"查询未删除项目"逻辑。
- **影响范围**: services/projects/core.py, services/projects/internal/query.py

---

#### 问题 S02-012: parse_date_string 工具函数定义在 Schema 文件中
- **文件**: schemas/project/core.py#L16-L40
- **检查项**: C4
- **严重程度**: 🟢轻微
- **问题描述**: `parse_date_string()` 是通用日期解析工具函数，定义在 Schema 文件中而非 utils/ 目录。项目已有 `utils/date_parser.py`，应将此函数移到那里。
  ```python
  def parse_date_string(value: str | datetime | None) -> datetime | None:
      """解析日期字符串为 datetime 对象."""
      ...
  ```
- **最佳实践参考**: 职责分离原则 — Schema 文件应只包含数据结构定义，工具函数应在 utils/ 中。
- **修改建议**: 将 `parse_date_string()` 移到 `utils/date_parser.py`，Schema 文件中导入使用。
- **影响范围**: schemas/project/core.py, utils/date_parser.py

---

### 审查统计
- 审查文件数: 5
- 发现问题数: 12 (🔴严重: 3, 🟡中等: 7, 🟢轻微: 2)
- 已覆盖检查项: H1, H2, H3, C1, C2, C4, D4, D5, E1, G2, B5
- 未覆盖检查项: A1-A6, B1-B4, C3, C5, D1-D3, E2-E5, F1-F4, G1, G3-G5, H4-H5 (将在后续会话中覆盖)

### 审查人备注
1. Lead 模型是本次审查发现的最严重问题集中区域——旧式 Column()、物理外键、未继承 BaseModel、数据库级级联，几乎违反了所有模型层规范。建议作为批次1优先修复。
2. Project 模型虽然继承了 BaseModel，但字段定义仍用旧式 Column() 和物理外键，说明模型层迁移工作未完成。
3. `ProjectResponse` 的"上帝Schema"问题（S02-006）是架构层面的设计问题，修复需要较大的重构工作量，建议在批次2中规划。
4. `ProjectCoreService.get_project()` 返回 None 的不一致行为（S02-010）直接导致了路由层的 HTTPException 泄漏（S01-002），两者应一起修复。
