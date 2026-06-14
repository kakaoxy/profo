## 审查记录 - 会话04 - 2026-06-14

### 审查范围
- 文件1: services/projects/sales.py (243行, 6个方法)
- 文件2: services/projects/finance.py (392行, 10个方法)
- 文件3: routers/projects/cashflow.py (69行, 3个端点)
- 文件4: routers/projects/renovation.py (102行, 6个端点)
- 文件5: routers/projects/sales.py (96行, 6个端点)

### 发现问题

---

#### 问题 S04-001: SalesService 大量使用 HTTPException
- **文件**: services/projects/sales.py#L44-L48, L55-L58, L127-L130, L186-L189, L199-L203
- **检查项**: E1
- **严重程度**: 🔴严重
- **问题描述**: `SalesService` 中有 5 处直接抛出 `HTTPException`，包括 404（资源不存在）和 400（状态不允许）。与 S03-002 同属系统性问题。
  ```python
  raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")
  raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="只有在售阶段才能添加销售记录")
  ```
- **最佳实践参考**: AGENTS.md "严格分层 Router→Service→Model"
- **修改建议**: 404 → `ResourceNotFoundError`，400 → `PermissionDeniedError` 或 `ValidationError`。移除 `from fastapi import HTTPException, status`。
- **影响范围**: services/projects/sales.py

---

#### 问题 S04-002: FinanceService 大量使用 HTTPException 且包含 500 错误
- **文件**: services/projects/finance.py#L42-L45, L94-L97, L117-L120, L142, L218-L223, L275-L278, L361-L370
- **检查项**: E1, E5
- **严重程度**: 🔴严重
- **问题描述**: `FinanceService` 中有 7 处直接抛出 `HTTPException`，其中最严重的是将通用异常包装为 `HTTPException(500)` 返回给用户：
  ```python
  # 将通用异常包装为 500 错误 — 应让全局异常处理器处理
  except Exception as e:
      raise HTTPException(
          status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
          detail="获取现金流记录失败",
      ) from e
  ```
  这掩盖了真实错误信息，不利于排查，且违反了"全局异常处理器统一处理"的原则。
- **最佳实践参考**: FastAPI 最佳实践 — Service 层不应处理 HTTP 错误响应，应让异常自然传播到全局处理器。
- **修改建议**:
  - 404 → `ResourceNotFoundError`
  - 400 → `ValidationError`
  - 500 → 移除 try-except，让异常自然传播到全局 `general_exception_handler`
  - 移除 `from fastapi import HTTPException, status`
- **影响范围**: services/projects/finance.py

---

#### 问题 S04-003: SalesService.update_roles 使用不安全的通用 setter 模式
- **文件**: services/projects/sales.py#L87-L89
- **检查项**: C4
- **严重程度**: 🟡中等
- **问题描述**: 与 S03-008 相同的问题——`update_roles()` 使用 `hasattr()` + `setattr()` 通用模式更新字段，存在安全风险。
  ```python
  for field, value in update_dict.items():
      if hasattr(sale, field):
          setattr(sale, field, value)
  ```
- **最佳实践参考**: 应使用显式字段白名单或 Pydantic Schema 验证。
- **修改建议**: 定义允许更新的字段白名单，或使用 Pydantic Schema 的字段映射。
- **影响范围**: services/projects/sales.py

---

#### 问题 S04-004: SalesService.update_roles 手动构建响应字典
- **文件**: services/projects/sales.py#L99-L119
- **检查项**: D1
- **严重程度**: 🟡中等
- **问题描述**: `update_roles()` 方法手动构建包含 17 个字段的响应字典，然后用 `ProjectResponse.model_validate()` 验证。这既脆弱又与 `ProjectResponseBuilder` 重复，且容易遗漏字段。
  ```python
  response_data = {
      "id": project.id,
      "name": project.name,
      "status": project.status,
      ...  # 17个字段
  }
  return ProjectResponse.model_validate(response_data)
  ```
- **最佳实践参考**: 应复用 `ProjectResponseBuilder`，保持一致性。
- **修改建议**: 使用 `self.response_builder.build(project)` 构建响应，与其他方法保持一致。
- **影响范围**: services/projects/sales.py

---

#### 问题 S04-005: FinanceService 参数类型使用 Any
- **文件**: services/projects/finance.py#L34, L381
- **检查项**: H1
- **严重程度**: 🟡中等
- **问题描述**: `create_record()` 和 `create_cashflow_record()` 的 `record_data` 参数类型为 `Any`，缺少具体类型注解。
  ```python
  def create_record(self, project_id: str, record_data: Any) -> FinanceRecord:  # noqa: ANN401
  ```
- **最佳实践参考**: AGENTS.md "所有函数必须完整注解"
- **修改建议**: 使用具体的 Schema 类型（如 `CashFlowRecordCreate`）替代 `Any`。
- **影响范围**: services/projects/finance.py

---

#### 问题 S04-006: FinanceService 中 get_summary 和 get_report 存在大量重复查询
- **文件**: services/projects/finance.py#L134-L223, L271-L338
- **检查项**: G2
- **严重程度**: 🟡中等
- **问题描述**: `get_summary()` 和 `get_report()` 都查询了 Project、ProjectContract、ProjectSale 以及 FinanceRecord 聚合数据，存在大量重复代码。且 `sync_financials()` 也执行了类似的聚合查询。
  ```python
  # get_summary 中
  project = self.db.query(Project).filter(...)
  contract = self.db.query(ProjectContract).filter(...)
  sale = self.db.query(ProjectSale).filter(...)
  result = self.db.query(func.sum(...)).filter(...)

  # get_report 中 — 完全相同的查询
  project = self.db.query(Project).filter(...)
  contract = self.db.query(ProjectContract).filter(...)
  sale = self.db.query(ProjectSale).filter(...)
  income_res = self.db.query(func.sum(...)).filter(...)
  ```
- **最佳实践参考**: DRY 原则；SQLAlchemy 最佳实践 — 提取公共查询逻辑。
- **修改建议**: 提取 `_get_project_financials(project_id)` 内部方法，返回项目基础信息 + 财务聚合数据，供 `get_summary()`、`get_report()` 和 `sync_financials()` 复用。
- **影响范围**: services/projects/finance.py

---

#### 问题 S04-007: projects 子路由未在 APIRouter 中定义 prefix/tags
- **文件**: routers/projects/cashflow.py#L18, routers/projects/renovation.py#L17, routers/projects/sales.py#L18
- **检查项**: A2
- **严重程度**: 🟡中等
- **问题描述**: 三个 projects 子路由模块都使用 `router = APIRouter()` 未定义 prefix 和 tags。与 S03-006 同类问题。
- **最佳实践参考**: FastAPI 官方推荐在 `APIRouter()` 中定义 prefix 和 tags。
- **修改建议**: 在各子路由的 `APIRouter()` 中定义 prefix 和 tags，或确认父路由 `projects/core.py` 中的 `include_router()` 调用是否已正确设置。
- **影响范围**: routers/projects/cashflow.py, routers/projects/renovation.py, routers/projects/sales.py

---

#### 问题 S04-008: cashflow 路由自定义依赖而非使用统一模式
- **文件**: routers/projects/cashflow.py#L21-L29
- **检查项**: B1
- **严重程度**: 🟢轻微
- **问题描述**: `cashflow.py` 自定义了 `CashFlowServiceDep` 依赖，而其他 projects 子路由使用 `ProjectServiceDep`。这导致 cashflow 路由直接依赖 `CashFlowService` 而非通过 `ProjectService` Facade，模式不一致。
  ```python
  # cashflow.py — 自定义依赖
  def get_cashflow_service(db: Session = _get_db_dep) -> CashFlowService:
      return CashFlowService(db)
  CashFlowServiceDep = Annotated[CashFlowService, Depends(get_cashflow_service)]

  # renovation.py, sales.py — 使用统一依赖
  service: ProjectServiceDep
  ```
- **最佳实践参考**: 一致性原则 — 同一模块内的路由应使用统一的依赖注入模式。
- **修改建议**: 统一使用 `ProjectServiceDep`，通过 Facade 访问财务功能。或在 Facade 被移除后，统一使用各子 Service 的依赖。
- **影响范围**: routers/projects/cashflow.py

---

### 审查统计
- 审查文件数: 5
- 发现问题数: 8 (🔴严重: 2, 🟡中等: 5, 🟢轻微: 1)
- 已覆盖检查项: A2, B1, C4, D1, E1, E5, G2, H1
- 未覆盖检查项: A1, A3-A6, B2-B5, C1-C3, C5, D2-D5, E2-E4, F1-F4, G1, G3-G5, H2-H5

### 审查人备注
1. Service 层 HTTPException 泄漏是全系统最严重的问题模式——4 个 Service（auth、leads、renovation、sales、finance）都直接抛出 HTTPException。建议创建一个统一的迁移方案：
   - 在 `services/system/exceptions.py` 中补充 `BusinessRuleError`（用于状态不允许等业务规则校验）
   - 批量替换所有 Service 层的 `HTTPException(404)` → `ResourceNotFoundError`
   - 批量替换所有 Service 层的 `HTTPException(400)` → `ValidationError` 或 `BusinessRuleError`
   - 移除所有 Service 文件中的 `from fastapi import HTTPException`
2. `FinanceService` 的 500 错误包装（S04-002）尤其危险——它掩盖了真实异常，使问题难以排查。
3. `SalesService.update_roles()` 的手动响应构建（S04-004）说明 `ProjectResponseBuilder` 的使用不一致，部分方法用 Builder，部分手动构建。
