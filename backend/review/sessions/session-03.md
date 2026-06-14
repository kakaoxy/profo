## 审查记录 - 会话03 - 2026-06-14

### 审查范围
- 文件1: services/leads/core.py (187行, 6个方法)
- 文件2: routers/leads/core.py (166行, 6个端点)
- 文件3: routers/leads/followups.py (39行, 2个端点)
- 文件4: routers/leads/prices.py (42行, 2个端点)
- 文件5: services/projects/renovation.py (268行, 10个方法)

### 发现问题

---

#### 问题 S03-001: LeadService.get_lead_or_404() 直接抛出 HTTPException
- **文件**: services/leads/core.py#L83-L99
- **检查项**: E1
- **严重程度**: 🔴严重
- **问题描述**: `LeadService.get_lead_or_404()` 方法直接抛出 `HTTPException(status_code=404)`，违反了"Service 层不应知道 HTTP 协议细节"的分层原则。同项目的 `ProjectCoreService` 正确使用了 `ResourceNotFoundError`。
  ```python
  def get_lead_or_404(self, lead_id: str) -> Lead:
      lead = self.get_lead(lead_id)
      if not lead:
          raise HTTPException(status_code=404, detail="Lead not found")
      return lead
  ```
- **最佳实践参考**: AGENTS.md "严格分层 Router→Service→Model"；FastAPI 最佳实践：Service 层抛业务异常，由全局处理器转换。
- **修改建议**: 改为抛出 `ResourceNotFoundError`，让全局异常处理器转换为 404 响应。同时 `update_lead()` 和 `delete_lead()` 也受影响（它们调用 `get_lead_or_404()`）。
  ```python
  def get_lead_or_404(self, lead_id: str) -> Lead:
      lead = self.get_lead(lead_id)
      if not lead:
          raise ResourceNotFoundError("线索不存在")
      return lead
  ```
- **影响范围**: services/leads/core.py, services/system/exceptions.py

---

#### 问题 S03-002: RenovationService 大量使用 HTTPException
- **文件**: services/projects/renovation.py#L36, L75-L78, L133-L137, L169-L172, L219-L222, L246-L250
- **检查项**: E1
- **严重程度**: 🔴严重
- **问题描述**: `RenovationService` 中有 6 处直接抛出 `HTTPException`，包括 404（资源不存在）和 400（状态不允许操作）。Service 层不应了解 HTTP 状态码。
  ```python
  # 404 - 应使用 ResourceNotFoundError
  raise HTTPException(status_code=404, detail="项目不存在")

  # 400 - 应使用 ValidationError 或自定义 PermissionDeniedError
  raise HTTPException(status_code=400, detail="当前状态不允许更新改造进度")
  ```
- **最佳实践参考**: 同 S03-001
- **修改建议**:
  - 404 → `ResourceNotFoundError("项目不存在")`
  - 400（状态不允许）→ `PermissionDeniedError("当前状态不允许更新改造进度")` 或新增 `BusinessRuleError`
  - 移除 `from fastapi import HTTPException, status` 导入
- **影响范围**: services/projects/renovation.py, services/system/exceptions.py

---

#### 问题 S03-003: 路由层包含数据转换逻辑 _lead_to_list_item
- **文件**: routers/leads/core.py#L25-L55
- **检查项**: A4
- **严重程度**: 🟡中等
- **问题描述**: `_lead_to_list_item()` 函数在路由层手动将 ORM 对象映射为 Pydantic 模型，包含约 30 行字段映射逻辑和业务规则（如图片长度过滤）。这属于数据转换业务逻辑，应在 Service 层或通过 Pydantic 的 `from_attributes=True` 自动完成。
  ```python
  def _lead_to_list_item(lead) -> LeadListItem:
      safe_images = [img for img in (lead.images or []) if isinstance(img, str) and len(img) < _MAX_IMAGE_LENGTH]
      return LeadListItem(
          id=lead.id,
          community_name=lead.community_name,
          ...
      )
  ```
- **最佳实践参考**: AGENTS.md "Router禁SQLAlchemy查询，禁止跨模型直接操作" — 虽然此处不是 SQL 查询，但数据转换逻辑同样不应在路由层。
- **修改建议**: 将转换逻辑移到 `LeadService` 中，或利用 Pydantic 的 `from_attributes=True` 配合适当的字段定义自动完成映射。图片过滤逻辑应在 Schema 的 `@field_validator` 中实现。
- **影响范围**: routers/leads/core.py, services/leads/core.py, schemas/lead/

---

#### 问题 S03-004: 路由层直接修改 ORM 对象属性
- **文件**: routers/leads/core.py#L107, L139
- **检查项**: A4
- **严重程度**: 🟡中等
- **问题描述**: `create_lead` 和 `update_lead` 路由直接修改 ORM 对象的 `creator` 属性，这是为了解决 N+1 查询问题的临时方案，但违反了分层原则。
  ```python
  # create_lead
  db_lead.creator = current_user

  # update_lead
  if not lead.creator:
      lead.creator = current_user
  ```
- **最佳实践参考**: 路由层不应直接操作 ORM 对象，应在 Service 层处理关联数据的预加载。
- **修改建议**: 在 Service 的 `create_lead()` 和 `update_lead()` 方法中使用 `joinedload(Lead.creator)` 预加载关联数据，或返回包含 creator 信息的响应模型。
- **影响范围**: routers/leads/core.py, services/leads/core.py

---

#### 问题 S03-005: 路由层直接访问 Service 内部组件
- **文件**: routers/leads/core.py#L166
- **检查项**: A4
- **严重程度**: 🟡中等
- **问题描述**: `get_leads_funnel` 端点直接访问 `service.query_service.get_funnel_stats()`，绕过了 Service 的公共 API，破坏了封装性。
  ```python
  service = LeadService(db)
  stats = service.query_service.get_funnel_stats()
  ```
- **最佳实践参考**: 封装原则 — 路由层应只调用 Service 的公共方法，不应访问其内部组件。
- **修改建议**: 在 `LeadService` 中添加 `get_funnel_stats()` 公共方法，委托给 `query_service`。
- **影响范围**: routers/leads/core.py, services/leads/core.py

---

#### 问题 S03-006: leads 子路由未在 APIRouter 中定义 prefix/tags
- **文件**: routers/leads/core.py#L20, routers/leads/followups.py#L11, routers/leads/prices.py#L11
- **检查项**: A2
- **严重程度**: 🟡中等
- **问题描述**: 三个 leads 子路由模块都使用 `router = APIRouter()` 未定义 prefix 和 tags。FastAPI 官方推荐在 `APIRouter()` 中定义这些参数，而非在 `include_router()` 中。
  ```python
  # 当前 - 三个文件都是
  router = APIRouter()

  # 应改为
  router = APIRouter(prefix="/leads", tags=["leads"])
  ```
- **最佳实践参考**: FastAPI 官方 "prefer to add router level parameters like prefix, tags, etc. to the router itself, instead of in include_router()"
- **修改建议**: 在各子路由的 `APIRouter()` 中定义 prefix 和 tags。需确认父路由 `leads/leads.py` 中的 `include_router()` 调用是否重复定义了这些参数。
- **影响范围**: routers/leads/core.py, routers/leads/followups.py, routers/leads/prices.py, routers/leads/leads.py

---

#### 问题 S03-007: RenovationService 中重复的状态验证模式
- **文件**: services/projects/renovation.py#L69-L78, L128-L137, L163-L172, L241-L250
- **检查项**: G2
- **严重程度**: 🟢轻微
- **问题描述**: 4 个方法中重复了相同的"允许状态列表 + HTTPException(400)"验证模式，应提取为内部方法。
  ```python
  # 重复4次
  allowed_statuses = [
      ProjectStatus.RENOVATING.value,
      ProjectStatus.SELLING.value,
      ProjectStatus.SOLD.value,
  ]
  if project.status not in allowed_statuses:
      raise HTTPException(status_code=400, detail="当前状态不允许...")
  ```
- **最佳实践参考**: DRY 原则
- **修改建议**: 提取 `_validate_renovation_allowed(project)` 内部方法，统一状态验证逻辑。
- **影响范围**: services/projects/renovation.py

---

#### 问题 S03-008: RenovationService.update_info 使用不安全的通用 setter 模式
- **文件**: services/projects/renovation.py#L142-L144
- **检查项**: C4
- **严重程度**: 🟡中等
- **问题描述**: `update_info()` 方法使用 `hasattr()` + `setattr()` 通用模式更新字段，存在安全风险——调用方可以设置任意字段（如 `is_deleted`、`id` 等），且绕过了 Pydantic 的验证。
  ```python
  for field, value in renovation_data.items():
      if hasattr(renovation, field) and value is not None:
          setattr(renovation, field, value)
  ```
- **最佳实践参考**: 应使用显式字段白名单或 Pydantic Schema 验证，而非通用 setter。
- **修改建议**: 使用 Pydantic Schema 的 `model_dump(exclude_unset=True)` 配合显式字段映射，或定义允许更新的字段白名单。
- **影响范围**: services/projects/renovation.py

---

#### 问题 S03-009: LeadService.get_leads 参数 statuses 缺少类型参数
- **文件**: services/leads/core.py#L107
- **检查项**: H1
- **严重程度**: 🟢轻微
- **问题描述**: `statuses` 参数类型为 `list | None`，缺少元素类型注解，应为 `list[LeadStatus] | None`。
  ```python
  statuses: list | None = None,
  ```
- **最佳实践参考**: AGENTS.md "所有函数必须完整注解"
- **修改建议**: 改为 `statuses: list[LeadStatus] | None = None`
- **影响范围**: services/leads/core.py

---

### 审查统计
- 审查文件数: 5
- 发现问题数: 9 (🔴严重: 2, 🟡中等: 5, 🟢轻微: 2)
- 已覆盖检查项: A2, A4, A6, C4, E1, G2, H1
- 未覆盖检查项: A1, A3, A5, B1-B5, C1-C3, C5, D1-D5, E2-E5, F1-F4, G1, G3-G5, H2-H5

### 审查人备注
1. Service 层 HTTPException 泄漏是系统性问题——`LeadService` 和 `RenovationService` 都直接抛出 HTTPException。建议在 `services/system/exceptions.py` 中补充 `BusinessRuleError`（用于状态不允许等业务规则校验），然后统一迁移所有 Service 层的 HTTPException 为业务异常。
2. `routers/leads/core.py` 的 `_lead_to_list_item()` 和 ORM 属性修改（S03-003, S03-004）说明 Lead 模块的 Schema 设计不够完善——如果 `LeadListItem` 正确使用 `from_attributes=True`，就不需要手动映射。
3. `RenovationService.update_info()` 的通用 setter 模式（S03-008）是一个安全隐患，应优先修复。
