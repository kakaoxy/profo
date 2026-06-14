## 审查记录 - 会话01 - 2026-06-14

### 审查范围
- 文件1: routers/projects/core.py (302行, 10个端点)
- 文件2: routers/public/auth.py (172行, 4个端点)
- 文件3: dependencies/auth.py (213行, 8个类型别名+3个函数)
- 文件4: services/system/auth.py (335行, 12个方法)
- 文件5: routers/system/auth.py (298行, 10个端点)

### 发现问题

---

#### 问题 S01-001: 路由层包含大量 CSV 导出业务逻辑
- **文件**: routers/projects/core.py#L101-L207
- **检查项**: A4
- **严重程度**: 🟡中等
- **问题描述**: `export_projects` 端点中包含约 100 行 CSV 构建逻辑（硬编码表头、逐字段格式化、编码处理），属于业务逻辑，应下沉到 Service 层。路由层应只负责调用 Service 获取数据并返回响应。
- **最佳实践参考**: AGENTS.md "Router禁SQLAlchemy查询，禁止跨模型直接操作" — 虽然此处不是 SQL 查询，但 CSV 构建逻辑属于数据处理业务逻辑，同样不应在路由层。
- **修改建议**: 将 CSV 构建逻辑提取到 `services/projects/` 下的新方法（如 `export_projects_csv()`），路由层仅调用 Service 并返回 `StreamingResponse`。
- **影响范围**: routers/projects/core.py, services/projects/

---

#### 问题 S01-002: 路由层手动抛出 HTTPException(404) 而非委托 Service
- **文件**: routers/projects/core.py#L220-L221, L239-L240, L273-L274, L288-L289, L300-L301
- **检查项**: A4, E1
- **严重程度**: 🟡中等
- **问题描述**: 5 个端点在 Service 返回 `None` 后手动 `raise HTTPException(status_code=404, detail="...")`。这违反了分层原则——路由层不应判断资源是否存在，Service 层应在资源不存在时抛出 `ResourceNotFoundError`，由全局异常处理器转换为 404 响应。
  ```python
  # 当前代码
  project = service.get_project(project_id, include_all=full)
  if not project:
      raise HTTPException(status_code=404, detail="Project not found")
  ```
- **最佳实践参考**: AGENTS.md "严格分层 Router→Service→Model"；FastAPI 最佳实践：Service 层抛业务异常，由全局处理器转换。
- **修改建议**: Service 层的 `get_project()`、`update_project()` 等方法应在资源不存在时抛出 `ResourceNotFoundError`，路由层直接调用无需判空。
  ```python
  # 建议代码
  return service.get_project(project_id, include_all=full)
  # Service 内部:
  # if not project:
  #     raise ResourceNotFoundError("项目不存在")
  ```
- **影响范围**: routers/projects/core.py, services/projects/core.py, services/projects/facade.py

---

#### 问题 S01-003: C端注册路由直接操作数据库
- **文件**: routers/public/auth.py#L56-L82
- **检查项**: A4
- **严重程度**: 🔴严重
- **问题描述**: `register` 端点直接执行了 3 次 SQLAlchemy 查询（查用户名、查手机号、查角色）和数据库写入操作（`db.add()`, `db.commit()`, `db.refresh()`），严重违反"Router禁SQLAlchemy查询"的分层约束。
  ```python
  existing_user = db.query(User).filter(User.username == body.username).first()
  existing_phone = db.query(User).filter(User.phone == body.phone).first()
  customer_role = db.query(Role).filter(Role.code == "customer").first()
  db_user = User(...)
  db.add(db_user)
  db.commit()
  db.refresh(db_user)
  ```
- **最佳实践参考**: AGENTS.md 硬约束 "Router禁SQLAlchemy查询，禁止跨模型直接操作"
- **修改建议**: 将注册逻辑提取到 `AuthService.register_public_user(db, username, password, phone, nickname)` 方法中，路由层仅调用 Service。
  ```python
  # 建议代码
  @router.post("/register")
  def register(request: Request, body: PublicRegisterRequest, db: DbSessionDep):
      db_user = AuthService.register_public_user(db, body.username, body.password, body.phone, body.nickname)
      token_data = AuthService.create_tokens_for_user(db, db_user)
      return PublicRegisterResponse(...)
  ```
- **影响范围**: routers/public/auth.py, services/system/auth.py

---

#### 问题 S01-004: C端登录路由手动抛出 HTTPException 而非依赖全局处理器
- **文件**: routers/public/auth.py#L110-L114, L117-L120, L148-L151
- **检查项**: E1
- **严重程度**: 🟡中等
- **问题描述**: `login_for_access_token` 和 `refresh_access_token` 端点捕获 `AuthenticationError` 后手动转换为 `HTTPException`。项目已有全局异常处理器（error_handlers.py），应直接让异常传播到全局处理器。
  ```python
  try:
      user = AuthService.authenticate_user(db, form_data.username, form_data.password)
  except AuthenticationError as e:
      raise HTTPException(status_code=401, detail=e.message, ...) from e
  ```
- **最佳实践参考**: FastAPI 最佳实践 — Service 层抛业务异常，由全局处理器统一转换，避免路由层重复处理。
- **修改建议**: 移除 try-except，让 `AuthenticationError` 自然传播到全局异常处理器。如需自定义 HTTP 头（如 `WWW-Authenticate`），可在全局处理器中按异常类型区分处理。
- **影响范围**: routers/public/auth.py, error_handlers.py

---

#### 问题 S01-005: C端登录路由手动进行角色检查
- **文件**: routers/public/auth.py#L116-L120
- **检查项**: A4, E1
- **严重程度**: 🟡中等
- **问题描述**: `login_for_access_token` 在路由函数内手动检查 `user.role.code != "customer"` 并抛出 `HTTPException(403)`。角色检查应通过依赖注入完成（已有 `require_roles` 机制），或在 Service 层处理。
  ```python
  if user.role.code != "customer":
      raise HTTPException(status_code=403, detail="此接口仅限C端用户登录")
  ```
- **最佳实践参考**: 项目已有 `require_roles(["customer"])` 依赖模式，应复用。
- **修改建议**: 将角色检查移到 Service 层的 `authenticate_public_user()` 方法中，或使用 `PermissionDeniedError` 异常让全局处理器处理。
- **影响范围**: routers/public/auth.py, services/system/auth.py

---

#### 问题 S01-006: 依赖层 get_current_user 直接执行 SQLAlchemy 查询
- **文件**: dependencies/auth.py#L116
- **检查项**: B3
- **严重程度**: 🔴严重
- **问题描述**: `get_current_user` 依赖函数中直接执行 `db.query(User).options(joinedload(User.role)).filter(User.id == user_id).first()`。虽然依赖层比路由层更接近基础设施层，但按 AGENTS.md 的严格分层，数据库查询应委托给 Service。
  ```python
  user = db.query(User).options(joinedload(User.role)).filter(User.id == user_id).first()
  ```
- **最佳实践参考**: AGENTS.md "严格分层 Router→Service→Model"；依赖注入层应协调 Service，而非直接操作 ORM。
- **修改建议**: 在 `AuthService` 或 `UserService` 中添加 `get_user_by_id(db, user_id)` 方法，依赖层调用该方法。
  ```python
  # 建议代码
  user = await run_in_threadpool(AuthService.get_user_by_id, db, user_id)
  ```
- **影响范围**: dependencies/auth.py, services/system/auth.py

---

#### 问题 S01-007: get_current_user 异步函数中执行同步 DB 查询阻塞事件循环
- **文件**: dependencies/auth.py#L68-L120
- **检查项**: B2, G1
- **严重程度**: 🟡中等
- **问题描述**: `get_current_user` 是 `async def` 函数，但第 116 行的 `db.query(User)...first()` 是同步阻塞调用，会阻塞事件循环。同文件中的 `require_api_key`（第 59 行）正确使用了 `run_in_threadpool` 包装同步 DB 操作。
  ```python
  # 当前代码 - 阻塞事件循环
  user = db.query(User).options(joinedload(User.role)).filter(User.id == user_id).first()

  # 同文件中的正确做法
  return await run_in_threadpool(ApiKeyService.authenticate_by_api_key, db, api_key)
  ```
- **最佳实践参考**: FastAPI 官方文档 "Make sure blocking code is not run inside of async functions. The logic will work, but will damage the performance heavily."
- **修改建议**: 将 DB 查询包装在 `run_in_threadpool` 中，或将函数改为 `def`（FastAPI 会自动放线程池）。如果改为 `def`，需确认不会影响依赖链中的 async 调用方。
- **影响范围**: dependencies/auth.py

---

#### 问题 S01-008: role_checker 异步函数仅执行同步操作
- **文件**: dependencies/auth.py#L178-L186
- **检查项**: B2
- **严重程度**: 🟢轻微
- **问题描述**: `require_roles` 工厂函数返回的 `role_checker` 是 `async def`，但内部只做同步的角色字符串比较。应改为 `def`，让 FastAPI 自动在线程池中执行。
  ```python
  async def role_checker(user: CurrentActiveUserDep) -> User:
      if user.role.code not in required_roles:
          raise HTTPException(...)
      return user
  ```
- **最佳实践参考**: FastAPI 官方 "In case of doubt, or by default, use regular def functions"
- **修改建议**: 改为 `def role_checker(user: CurrentActiveUserDep) -> User:`。注意需验证 `CurrentActiveUserDep` 依赖链兼容性。
- **影响范围**: dependencies/auth.py

---

#### 问题 S01-009: 临时授权码存储在内存字典中
- **文件**: services/system/auth.py#L184-L216
- **检查项**: G4
- **严重程度**: 🟡中等
- **问题描述**: `AuthService._temp_code_store` 是类变量字典，存储微信 OAuth 临时授权码。存在以下问题：
  1. 应用重启后所有临时码丢失，用户无法完成登录流程
  2. 多进程/多实例部署时数据不共享
  3. `_cleanup_expired_codes()` 在每次操作时全量扫描，O(n) 复杂度
  ```python
  _temp_code_store: ClassVar[dict[str, dict[str, object]]] = {}
  ```
- **最佳实践参考**: 生产环境应使用 Redis 等外部存储，支持 TTL 自动过期和跨进程共享。
- **修改建议**: 短期：接受当前实现但添加容量上限保护。长期：迁移到 Redis，利用 `SETEX` 命令实现 TTL。
- **影响范围**: services/system/auth.py

---

#### 问题 S01-010: refresh_user_token 未预加载角色关系
- **文件**: services/system/auth.py#L162
- **检查项**: G2
- **严重程度**: 🟡中等
- **问题描述**: `refresh_user_token` 中查询用户时未使用 `joinedload(User.role)`，而 `create_tokens_for_user` 后续会访问 `user.role.code`（第 125 行），导致延迟加载（lazy load），可能产生额外的 SQL 查询。
  ```python
  user = db.query(User).filter(User.id == user_id).first()
  # 后续 create_tokens_for_user 中访问 user.role.code
  ```
- **最佳实践参考**: SQLAlchemy 最佳实践 — 预加载已知需要的关联关系，避免 N+1 查询。
- **修改建议**: 添加 `joinedload(User.role)`：
  ```python
  user = db.query(User).options(joinedload(User.role)).filter(User.id == user_id).first()
  ```
- **影响范围**: services/system/auth.py

---

#### 问题 S01-011: 内部认证路由多处手动转换异常为 HTTPException
- **文件**: routers/system/auth.py#L54-L61, L91-L98, L174-L178, L207-L210, L223-L227, L294-L298
- **检查项**: E1
- **严重程度**: 🟡中等
- **问题描述**: 6 处代码捕获业务异常（`AuthenticationError`、`ResourceNotFoundError`）后手动转换为 `HTTPException`。项目已有全局异常处理器（error_handlers.py 中注册了 `ServiceException` 处理器），应直接让异常传播。
  ```python
  # 6处类似模式
  try:
      user = AuthService.authenticate_user(db, ...)
  except AuthenticationError as e:
      raise HTTPException(status_code=401, detail=e.message, ...) from e
  ```
- **最佳实践参考**: FastAPI 最佳实践 — 全局异常处理器统一处理，避免路由层重复的 try-except 样板代码。
- **修改建议**: 移除 try-except，让业务异常自然传播。如需自定义 HTTP 响应头（如 `WWW-Authenticate`），可在全局处理器中按异常子类型区分。
- **影响范围**: routers/system/auth.py, error_handlers.py

---

#### 问题 S01-012: exchange_token 端点返回原始 dict 而非 Pydantic 模型
- **文件**: routers/system/auth.py#L167-L184
- **检查项**: A6, D1
- **严重程度**: 🟡中等
- **问题描述**: `exchange_token` 端点的返回类型注解为 `dict[str, object]`，直接返回手工构建的字典。这导致：
  1. OpenAPI 文档无法正确展示响应结构
  2. 响应数据不受 Pydantic 验证/过滤
  3. 与其他端点返回 Pydantic 模型的模式不一致
  ```python
  def exchange_token(...) -> dict[str, object]:
      ...
      return {
          "access_token": entry["access_token"],
          "refresh_token": entry["refresh_token"],
          "token_type": "bearer",
          "expires_in": settings.jwt_access_token_expire_minutes * 60,
      }
  ```
- **最佳实践参考**: FastAPI 官方 "When possible, include a return type. It will be used to validate, filter, document, and serialize the response."
- **修改建议**: 创建 `ExchangeTokenResponse` Pydantic 模型，或复用已有的 `TokenResponse`。
- **影响范围**: routers/system/auth.py, schemas/user/

---

#### 问题 S01-013: login_for_access_token 返回值类型不匹配
- **文件**: routers/system/auth.py#L54-L76
- **检查项**: A6, D1
- **严重程度**: 🟢轻微
- **问题描述**: `login_for_access_token` 返回类型注解为 `TokenResponse`，但实际返回的是 `AuthService.create_tokens_for_user()` 的原始 dict 结果（第 76 行 `return result`）。虽然 FastAPI/Pydantic 会自动转换，但代码意图不明确，且 `result` 包含 `require_password_change`、`user` 等字段，可能泄露到响应中。
  ```python
  def login_for_access_token(...) -> TokenResponse:
      result = AuthService.create_tokens_for_user(db, user, force_temp_token=True)
      if result.get("require_password_change"):
          raise HTTPException(...)
      return result  # dict, not TokenResponse
  ```
- **最佳实践参考**: FastAPI 官方推荐显式构造响应模型，确保只返回预期字段。
- **修改建议**: 显式构造 `TokenResponse` 对象：
  ```python
  return TokenResponse(
      access_token=result["access_token"],
      refresh_token=result["refresh_token"],
      token_type=result["token_type"],
      expires_in=result["expires_in"],
  )
  ```
- **影响范围**: routers/system/auth.py

---

#### 问题 S01-014: wechat_callback 硬编码前端 URL
- **文件**: routers/system/auth.py#L157
- **检查项**: A4
- **严重程度**: 🟡中等
- **问题描述**: 微信回调中硬编码了前端 URL `http://localhost:3000`，应从 settings 中读取。
  ```python
  frontend_url = f"http://localhost:3000/login?code={auth_code}"
  ```
- **最佳实践参考**: 配置应集中管理，硬编码 URL 在部署到不同环境时会出问题。
- **修改建议**: 在 `settings.py` 中添加 `frontend_base_url` 配置项，从环境变量读取。
- **影响范围**: routers/system/auth.py, settings.py

---

#### 问题 S01-015: wechat_app_login 使用过宽的异常捕获
- **文件**: routers/system/auth.py#L221-L227
- **检查项**: E1, E5
- **严重程度**: 🟡中等
- **问题描述**: `wechat_app_login` 使用 `except Exception` 捕获所有异常并返回通用错误信息，可能掩盖未预期的异常类型（如数据库错误、配置错误等），不利于问题排查。
  ```python
  except Exception as e:
      raise HTTPException(status_code=401, detail="微信登录失败，请稍后重试") from e
  ```
- **最佳实践参考**: 应捕获具体的异常类型，让全局异常处理器处理未预期的异常。
- **修改建议**: 只捕获已知的异常类型（`AuthenticationError`、`ValidationError`），移除通用 `except Exception`。
- **影响范围**: routers/system/auth.py

---

### 审查统计
- 审查文件数: 5
- 发现问题数: 15 (🔴严重: 2, 🟡中等: 11, 🟢轻微: 2)
- 已覆盖检查项: A1, A2, A3, A4, A6, B1, B2, B3, D1, E1, E5, G1, G2, G4
- 未覆盖检查项: A5, B4, B5, C1-C5, D2-D5, E2-E4, F1-F4, G3, G5, H1-H5 (将在后续会话中覆盖)

### 审查人备注
1. 最严重的问题是 `routers/public/auth.py` 直接操作数据库（S01-003）和 `dependencies/auth.py` 中的 DB 查询（S01-006），这两个问题应优先修复。
2. 路由层大量手动将业务异常转换为 HTTPException（S01-004, S01-011），说明全局异常处理器可能未覆盖所有异常类型，或开发者不熟悉全局处理器机制。建议检查 error_handlers.py 的覆盖范围。
3. `AuthService.create_tokens_for_user()` 返回 dict 而非 Pydantic 模型，导致调用方需要手动处理字段，容易出错（S01-012, S01-013）。
4. 异步/同步混用问题（S01-007）需要系统性解决，建议在后续会话中检查所有 async 路由函数中是否有同步阻塞调用。
