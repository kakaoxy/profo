## 审查记录 - 会话05 - 2026-06-14

### 审查范围
- 文件1: services/market/property_service.py (86行, 3个方法)
- 文件2: services/market/community_service.py (161行, 4个方法)
- 文件3: services/market/importer.py (394行, ~15个方法)
- 文件4: routers/market/properties.py (330行, 4个端点)
- 文件5: routers/market/communities.py (180行, 4个端点)

### 发现问题

---

#### 问题 S05-001: 市场模块 Service 层使用 ValueError 而非项目异常体系
- **文件**: services/market/property_service.py#L46-L51, services/market/community_service.py#L123
- **检查项**: E1
- **严重程度**: 🟡中等
- **问题描述**: `PropertyService.get_detail()` 和 `CommunityQueryService.query_dictionaries()` 抛出 Python 内置的 `ValueError` 而非项目定义的业务异常（`ResourceNotFoundError`、`ValidationError`）。这导致路由层需要手动捕获 `ValueError` 并转换为 `HTTPException`。
  ```python
  # property_service.py
  if not property_obj:
      raise ValueError("房源不存在")

  # community_service.py
  raise ValueError(f"不支持的字典类型: {dict_type}")
  ```
- **最佳实践参考**: 项目已建立 `ResourceNotFoundError`、`ValidationError` 等业务异常体系，Service 层应统一使用。
- **修改建议**: `ValueError("房源不存在")` → `ResourceNotFoundError("房源不存在")`；`ValueError(f"不支持的字典类型...")` → `ValidationError(f"不支持的字典类型...")`。
- **影响范围**: services/market/property_service.py, services/market/community_service.py, routers/market/properties.py, routers/market/communities.py

---

#### 问题 S05-002: properties 路由包含大量 CSV 导出和格式化逻辑
- **文件**: routers/market/properties.py#L179-L330
- **检查项**: A4
- **严重程度**: 🟡中等
- **问题描述**: 与 S01-001 同类问题——`_generate_csv_response()` 约 90 行 CSV 构建逻辑、`_format_datetime()` 等 4 个格式化函数、`_parse_rooms_param()` 参数解析函数都在路由文件中。这些应下沉到 Service 层或 utils/。
- **最佳实践参考**: AGENTS.md "Router禁SQLAlchemy查询，禁止跨模型直接操作" — 数据处理逻辑同样不应在路由层。
- **修改建议**: 将 CSV 生成逻辑移到 `PropertyService` 或新建 `PropertyExportService`；格式化函数移到 `utils/formatters.py`；参数解析移到 Schema 或 utils。
- **影响范围**: routers/market/properties.py, services/market/

---

#### 问题 S05-003: properties 路由缺少 Filter Schema（15+ 查询参数散落在签名中）
- **文件**: routers/market/properties.py#L56-L76
- **检查项**: C1
- **严重程度**: 🟡中等
- **问题描述**: `get_properties` 端点有 15+ 个查询参数（status, community_name, districts, business_circles, orientations, floor_levels, min_price, max_price, min_area, max_area, rooms, rooms_gte, sort_by, sort_order, page, page_size），全部散落在函数签名中。AGENTS.md 要求 Pydantic 模型按 `*Filter` 分离。
- **最佳实践参考**: AGENTS.md 硬约束 "Pydantic分*Create/*Update/*Response/*Filter"
- **修改建议**: 创建 `PropertyFilter(BaseModel)` Schema，使用 `Depends()` 注入筛选参数。
- **影响范围**: routers/market/properties.py, schemas/property/

---

#### 问题 S05-004: communities 路由直接操作数据库创建小区
- **文件**: routers/market/communities.py#L127-L178
- **检查项**: A4
- **严重程度**: 🔴严重
- **问题描述**: `create_community()` 端点直接创建 ORM 对象、执行 `db.add()`、`db.commit()`、`db.refresh()`，并处理 `IntegrityError` 等数据库异常。这全部是业务逻辑，应在 Service 层处理。
  ```python
  new_community = Community(id=str(uuid.uuid4()), name=body.name.strip(), ...)
  db.add(new_community)
  try:
      db.commit()
      db.refresh(new_community)
  except IntegrityError as e:
      db.rollback()
      ...
  ```
- **最佳实践参考**: AGENTS.md 硬约束 "Router禁SQLAlchemy查询，禁止跨模型直接操作"
- **修改建议**: 将创建逻辑移到 `CommunityService.create_community(db, name, district, business_circle)` 方法中。
- **影响范围**: routers/market/communities.py, services/market/community_service.py

---

#### 问题 S05-005: communities 路由大量手动异常转换
- **文件**: routers/market/communities.py#L69-L70, L116-L124, L164-L178
- **检查项**: E1
- **严重程度**: 🟡中等
- **问题描述**: `merge_communities()` 和 `create_community()` 中有多处手动将业务异常转换为 `HTTPException`，包括将 `ValueError` 转为 400、将 `SQLAlchemyError` 和通用 `Exception` 转为 500。应让全局异常处理器处理。
  ```python
  except ValueError as e:
      raise HTTPException(status_code=400, detail=str(e)) from e
  except SQLAlchemyError:
      raise HTTPException(status_code=500, detail="合并操作失败，请联系管理员") from None
  ```
- **最佳实践参考**: 全局异常处理器应统一处理，路由层不应包含异常转换逻辑。
- **修改建议**: Service 层使用项目异常体系，移除路由层的 try-except。
- **影响范围**: routers/market/communities.py

---

#### 问题 S05-006: community_service 中 _find_existing_community_by_name 是模块级函数
- **文件**: services/market/community_service.py#L143-L161
- **检查项**: H1
- **严重程度**: 🟢轻微
- **问题描述**: `_find_existing_community_by_name()` 是模块级函数而非类方法，与同文件中 `CommunityQueryService` 的类方法模式不一致。且被 `routers/market/communities.py` 直接导入使用（第 30 行），破坏了封装性。
- **最佳实践参考**: 一致性原则 — 同一 Service 模块内应使用统一的代码组织模式。
- **修改建议**: 将此函数移入 `CommunityQueryService` 类中作为静态方法或类方法。
- **影响范围**: services/market/community_service.py, routers/market/communities.py

---

### 审查统计
- 审查文件数: 5
- 发现问题数: 6 (🔴严重: 1, 🟡中等: 4, 🟢轻微: 1)
- 已覆盖检查项: A2, A4, C1, E1, G2, H1
- 未覆盖检查项: A1, A3, A5-A6, B1-B5, C2-C5, D1-D5, E2-E5, F1-F4, G1, G3-G5, H2-H5

### 审查人备注
1. `services/market/importer.py` 是审查中发现的最佳实践范例——不使用 HTTPException，而是通过 `ImportResult` 返回结果，使用 savepoint 保护事务，错误信息持久化。其他 Service 可参考此模式。
2. 市场模块的 CSV 导出问题（S05-002）与项目模块（S01-001）是同类问题，建议统一提取 CSV 生成工具到 `utils/` 或独立的 export service。
3. `routers/market/communities.py` 的 `create_community()` 直接操作数据库（S05-004）是本次审查发现的第 3 个路由层直接操作数据库的案例（前两个在 `routers/public/auth.py`），说明这是一个系统性问题。
