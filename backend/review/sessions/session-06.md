## 审查记录 - 会话06 - 2026-06-14

### 审查范围
- 文件1: services/marketing/project.py (308行, 8个方法)
- 文件2: services/marketing/import_service.py (229行, 7个方法)
- 文件3: routers/marketing/projects.py (271行, 10个端点)
- 文件4: routers/marketing/import_.py (130行, 3个端点)
- 文件5: services/monitor/service.py (547行, 7个方法)

### 发现问题

---

#### 问题 S06-001: 营销路由全部使用 async def 但调用同步 Service 方法
- **文件**: routers/marketing/projects.py#L56,L98,L114,L133,L158,L178,L200,L214,L239,L260, routers/marketing/import_.py#L47,L76,L107
- **检查项**: G1
- **严重程度**: 🟡中等
- **问题描述**: 营销模块的所有路由函数都使用 `async def`，但调用的 Service 方法全部是同步的（DB 查询等）。FastAPI 官方明确指出：同步代码应使用 `def`，FastAPI 会自动在线程池中执行；在 `async def` 中执行同步阻塞操作会损害性能。
  ```python
  # 当前 - async def 调用同步 service
  async def list_marketing_projects(service: _ProjectServiceDep, ...) -> ...:
      summary = service.get_projects_summary(...)  # 同步阻塞

  # 应改为
  def list_marketing_projects(service: _ProjectServiceDep, ...) -> ...:
      summary = service.get_projects_summary(...)
  ```
- **最佳实践参考**: FastAPI 官方 "Use async path operations only when fully certain that the logic called inside is compatible with async and await. In case of doubt, use regular def functions."
- **修改建议**: 将所有仅调用同步 Service 的路由函数从 `async def` 改为 `def`。
- **影响范围**: routers/marketing/projects.py, routers/marketing/import_.py

---

#### 问题 S06-002: 营销路由手动检查 None/False 并抛出 HTTPException(404)
- **文件**: routers/marketing/projects.py#L120-L125,L143-L149,L167-L171,L224-L230,L248-L252, routers/marketing/import_.py#L85-L89,L117-L121
- **检查项**: E1
- **严重程度**: 🟡中等
- **问题描述**: 7 处路由代码检查 Service 返回的 None/False 后手动抛出 `HTTPException(404)`。Service 层应直接抛出 `ResourceNotFoundError`，由全局处理器转换。
  ```python
  item = service.get_project(project_id)
  if not item:
      raise HTTPException(status_code=404, detail="项目不存在")
  ```
- **最佳实践参考**: 与 S01-002 同类问题。
- **修改建议**: Service 层的 `get_project()`、`update_project()`、`delete_project()` 等方法应在资源不存在时抛出 `ResourceNotFoundError`。
- **影响范围**: routers/marketing/projects.py, routers/marketing/import_.py, services/marketing/project.py

---

#### 问题 S06-003: import_.py 中 QueryServiceDep 依赖定义可能有误
- **文件**: routers/marketing/import_.py#L29
- **检查项**: B1
- **严重程度**: 🟡中等
- **问题描述**: `QueryServiceDep = Annotated[L4MarketingQueryService, Depends(L4MarketingQueryService)]` 直接将类作为 `Depends()` 参数，但 `L4MarketingQueryService` 构造函数需要 `db: Session` 参数。FastAPI 的 `Depends()` 会尝试实例化类，但缺少 db 参数会导致运行时错误。实际使用的是 `get_query_service()` 函数依赖（第 48 行），所以这个类型别名可能是未使用的死代码。
  ```python
  # 可能是死代码
  QueryServiceDep = Annotated[L4MarketingQueryService, Depends(L4MarketingQueryService)]
  ImportServiceDep = Annotated[L4MarketingImportService, Depends(L4MarketingImportService)]
  ```
- **最佳实践参考**: 代码应保持整洁，移除未使用的代码。
- **修改建议**: 确认这两个类型别名是否被使用。如未使用，删除它们。
- **影响范围**: routers/marketing/import_.py

---

#### 问题 S06-004: MonitorService.get_neighborhood_radar 方法过于复杂
- **文件**: services/monitor/service.py#L289-L458
- **检查项**: G2
- **严重程度**: 🟢轻微
- **问题描述**: `get_neighborhood_radar()` 方法约 170 行，复杂度极高（代码中已有 `noqa: C901, PLR0912, PLR0915`）。虽然查询逻辑已优化（批量查询），但方法本身应拆分为更小的子方法以提高可读性和可测试性。
- **最佳实践参考**: 单一职责原则；AGENTS.md "文件>250行注释说明不拆理由"
- **修改建议**: 将数据聚合、价差计算、响应构建等逻辑提取为独立方法。
- **影响范围**: services/monitor/service.py

---

#### 问题 S06-005: MarketingImportService._get_total_price 可能触发 N+1 查询
- **文件**: services/marketing/import_service.py#L121-L127
- **检查项**: G2
- **严重程度**: 🟡中等
- **问题描述**: `_get_total_price()` 访问 `project.contract.signing_price` 和 `project.sale.list_price`，但这些关系可能未在查询时预加载（第 53-60 行的查询未使用 `joinedload`），导致延迟加载产生额外 SQL 查询。
  ```python
  # 查询时未预加载
  project = self.db.query(Project).filter(...).first()

  # 后续访问关系属性 - 可能触发 N+1
  if project.contract and project.contract.signing_price:
  ```
- **最佳实践参考**: SQLAlchemy 最佳实践 — 预加载已知需要的关联关系。
- **修改建议**: 在查询 Project 时添加 `joinedload(Project.contract)` 和 `joinedload(Project.sale)`。
- **影响范围**: services/marketing/import_service.py

---

### 审查统计
- 审查文件数: 5
- 发现问题数: 5 (🔴严重: 0, 🟡中等: 4, 🟢轻微: 1)
- 已覆盖检查项: A2, A5, B1, E1, G1, G2
- 未覆盖检查项: A1, A3-A4, A6, B2-B5, C1-C5, D1-D5, E2-E5, F1-F4, G3-G5, H1-H5

### 审查人备注
1. 营销模块的路由设计是审查中发现的最佳范例——正确使用了 `APIRouter(prefix=..., tags=..., dependencies=[...])` 模式（S06-001 中的 async 问题除外），其他模块可参考。
2. `services/marketing/project.py` 的 `update_project()` 使用了 `allowed_fields` 白名单（第 260-277 行），比 `hasattr()` + `setattr()` 模式更安全，值得推广。
3. `services/monitor/service.py` 的 `generate_ai_strategy()` 是 Mock 实现，生产部署前需替换为真实 AI 服务。
4. async/async 混用问题（S06-001）在营销模块特别明显——所有路由都是 `async def` 但所有 Service 都是同步的。建议全局搜索所有 `async def` 路由，确认是否真正需要异步。
