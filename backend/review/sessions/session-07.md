## 审查记录 - 07 - P4 基础设施

### 审查范围
- 文件1: main.py (200行)
- 文件2: settings.py (120行)
- 文件3: db.py (106行)
- 文件4: error_handlers.py (183行)
- 文件5: exceptions.py (28行)

### 发现问题

#### 问题 S07-001: 全局响应格式与 AGENTS.md 规范不一致
- **文件**: error_handlers.py#L64-L183, main.py#L132-L149
- **检查项**: D3, E4
- **严重程度**: 🔴严重
- **问题描述**: 所有异常处理器（service_exception_handler, validation_exception_handler, sqlalchemy_exception_handler, http_exception_handler, general_exception_handler）以及 rate_limit_handler 统一返回 `{"detail":"..."}` 格式。root() 和 health_check() 返回自定义 dict 格式。AGENTS.md 明确要求响应格式为 `{"code":0,"message":"success","data":{}}`，错误时 `code != 0`。当前实现完全偏离此规范。
- **最佳实践参考**: AGENTS.md 硬约束："响应格式：`{"code":0,"message":"success","data":{}}`，错误code≠0，HTTP状态码标准"
- **修改建议**:
  1. 创建统一的响应封装函数：
  ```python
  def success_response(data: Any, message: str = "success") -> dict:
      return {"code": 0, "message": message, "data": data}

  def error_response(code: int, message: str, status_code: int) -> JSONResponse:
      return JSONResponse(status_code=status_code, content={"code": code, "message": message, "data": None})
  ```
  2. 所有异常处理器改用 `error_response()`
  3. 路由函数通过中间件或依赖自动封装 `success_response()`
- **影响范围**: 全部 API 端点的响应格式，前端需同步调整

#### 问题 S07-002: init_db() 使用 create_all() 而非 Alembic 迁移
- **文件**: db.py#L76-L85
- **检查项**: H4
- **严重程度**: 🟡中等
- **问题描述**: `init_db()` 调用 `Base.metadata.create_all(bind=engine)`，这只能创建新表，无法处理列变更（增删改列）。AGENTS.md 明确要求 "Schema变更→必须Alembic迁移并检SQLite兼容"。生产环境中如果模型发生变更，create_all() 不会应用这些变更。
- **最佳实践参考**: AGENTS.md 硬约束："Schema变更→必须Alembic迁移并检SQLite兼容"
- **修改建议**:
  1. 引入 Alembic 进行迁移管理
  2. `init_db()` 仅在开发环境首次初始化时使用
  3. 生产环境启动时执行 `alembic upgrade head` 替代 `create_all()`
  ```python
  def init_db() -> None:
      """开发环境初始化 - 仅创建不存在的表."""
      import os
      if os.getenv("ENVIRONMENT") == "development":
          from models import Base
          Base.metadata.create_all(bind=engine)
      # 生产环境应使用 alembic upgrade head
  ```
- **影响范围**: 数据库迁移策略，影响部署流程

#### 问题 S07-003: rate_limit_handler 响应格式与 AGENTS.md 不一致
- **文件**: main.py#L180-L189
- **检查项**: D3
- **严重程度**: 🟡中等
- **问题描述**: `rate_limit_handler` 返回 `{"detail": "请求过于频繁，请稍后重试"}`，与 S07-001 同属响应格式不一致问题。此外，此处理器直接定义在 main.py 中，而其他 5 个处理器定义在 error_handlers.py 中，位置不一致。
- **最佳实践参考**: AGENTS.md 硬约束 + DRY 原则
- **修改建议**:
  1. 将 rate_limit_handler 移至 error_handlers.py
  2. 统一使用 `error_response()` 格式
  ```python
  # error_handlers.py
  async def rate_limit_handler(_request: Request, exc: RateLimitExceeded) -> JSONResponse:
      return error_response(code=42901, message="请求过于频繁，请稍后重试", status_code=429)
  ```
- **影响范围**: 速率限制响应格式

#### 问题 S07-004: validation_exception_handler 暴露验证错误详情
- **文件**: error_handlers.py#L77-L118
- **检查项**: E5
- **严重程度**: 🟡中等
- **问题描述**: `validation_exception_handler` 将格式化后的验证错误信息直接返回给客户端：`f"请求参数验证失败: {error_message}"`。虽然 format_request_validation_error 做了格式化，但错误信息仍可能包含字段名、类型信息等内部结构细节，存在信息泄露风险。
- **最佳实践参考**: 安全最佳实践 — 验证错误（422）响应信息清晰且不泄露内部细节
- **修改建议**:
  1. 生产环境返回简化错误信息
  2. 详细错误信息仅记录在日志中
  ```python
  # 生产环境
  content={"code": 42200, "message": "请求参数验证失败", "data": None}
  # 开发环境可保留详细信息
  ```
- **影响范围**: 422 响应的安全性和可用性

#### 问题 S07-005: wechat_redirect_uri 硬编码 localhost
- **文件**: settings.py#L104
- **检查项**: G4
- **严重程度**: 🟡中等
- **问题描述**: `wechat_redirect_uri: str = "http://localhost:8000/api/auth/wechat/callback"` 硬编码了本地开发地址。部署到生产环境时，此值必须修改，但当前默认值指向 localhost，容易遗漏导致微信回调失败。
- **最佳实践参考**: pydantic-settings 最佳实践 — 环境相关配置应从环境变量读取
- **修改建议**:
  ```python
  wechat_redirect_uri: str  # 强制从环境变量读取，不提供默认值
  ```
- **影响范围**: 微信认证功能的生产环境部署

#### 问题 S07-006: settings.py 使用旧式 Config 类
- **文件**: settings.py#L112-L116
- **检查项**: -
- **严重程度**: 🟢轻微
- **问题描述**: `class Config` 是 Pydantic v1 风格配置。Pydantic v2 / pydantic-settings 推荐使用 `model_config = SettingsConfigDict(...)`。
- **最佳实践参考**: pydantic-settings v2 官方文档
- **修改建议**:
  ```python
  from pydantic_settings import BaseSettings, SettingsConfigDict

  class Settings(BaseSettings):
      model_config = SettingsConfigDict(
          env_file=".env",
          env_file_encoding="utf-8",
      )
  ```
- **影响范围**: 配置管理，功能不受影响但不符合最新 API

#### 问题 S07-007: 硬编码默认顾问信息
- **文件**: settings.py#L97-L99
- **检查项**: -
- **严重程度**: 🟢轻微
- **问题描述**: `default_consultant_phone: str = "400-xxx-xxxx"` 和 `default_consultant_wechat: str = "400-xxx-xxxx"` 使用占位符默认值。如果环境变量未设置，C端接口将展示 "400-xxx-xxxx" 这样的无效信息。
- **最佳实践参考**: 配置管理最佳实践 — 面向用户的配置应强制设置或提供有效默认值
- **修改建议**:
  ```python
  default_consultant_phone: str  # 强制从环境变量读取
  default_consultant_wechat: str  # 强制从环境变量读取
  ```
- **影响范围**: C端公开接口的顾问信息展示

#### 问题 S07-008: drop_all_tables() 和 reset_db() 存在于生产代码中
- **文件**: db.py#L88-L106
- **检查项**: -
- **严重程度**: 🟢轻微
- **问题描述**: `drop_all_tables()` 和 `reset_db()` 是危险操作，直接存在于生产代码中。虽然注释说明"仅用于开发和测试环境"，但没有任何运行时保护机制防止在生产环境误调用。
- **最佳实践参考**: 安全最佳实践 — 危险操作应有运行时保护
- **修改建议**:
  ```python
  def drop_all_tables() -> None:
      if settings.environment == "production":
          raise RuntimeError("不允许在生产环境执行此操作")
      # ...
  ```
  或将此类函数移至 scripts/ 目录，不包含在应用代码中。
- **影响范围**: 数据库安全

#### 问题 S07-009: exceptions.py 弃用模块未设置移除时间表
- **文件**: exceptions.py#L1-L28
- **检查项**: E2
- **严重程度**: 🟢轻微
- **问题描述**: exceptions.py 已弃用，使用 `warnings.warn(DeprecationWarning)` 提醒，但没有设置移除版本或时间表。弃用模块长期存在会增加维护负担和代码混淆。
- **最佳实践参考**: Python 弃用策略 — 应标注移除版本
- **修改建议**:
  ```python
  warnings.warn(
      "exceptions 模块已弃用，请改用 services.system.exceptions。将在 v1.0.0 中移除。",
      DeprecationWarning,
      stacklevel=2,
  )
  ```
- **影响范围**: 代码维护性

#### 问题 S07-010: lifespan 中 sys.exit(1) 在异步上下文中不够优雅
- **文件**: main.py#L71-L76
- **检查项**: -
- **严重程度**: 🟢轻微
- **问题描述**: lifespan 上下文管理器中 JWT 配置验证失败时调用 `sys.exit(1)`。在异步上下文中直接调用 sys.exit() 会跳过正常的清理流程，可能导致资源未正确释放。
- **最佳实践参考**: FastAPI lifespan 最佳实践 — 应通过异常让框架处理启动失败
- **修改建议**:
  ```python
  try:
      check_jwt_configuration()
  except Exception as e:
      logger.exception("JWT配置验证失败")
      raise RuntimeError(f"JWT配置验证失败: {e}") from e
  ```
  FastAPI 会捕获 lifespan 中的异常并阻止应用启动。
- **影响范围**: 应用启动失败时的资源清理

### 审查统计
- 审查文件数: 5
- 发现问题数: 10 (🔴严重: 1, 🟡中等: 4, 🟢轻微: 5)
- 已覆盖检查项: D3, E2, E3, E4, E5, H4, H5, G4
- 未覆盖检查项: E3(全局处理器覆盖完整性需进一步评估，当前覆盖基本完整)

### 审查人备注
1. **最关键发现**：响应格式问题是系统性问题，影响全部 API 端点。error_handlers.py 的注释多处声称"符合 AGENTS.md 规范：错误统一 {"detail":"..."}"，但实际上 AGENTS.md 要求的是 `{"code":0,"message":"success","data":{}}` 格式。这表明开发者可能误解了规范，或规范在开发过程中发生了变更但代码未同步。
2. **H5 (PRAGMA foreign_keys=ON)** 已正确实现 ✅
3. **G4 (连接池配置)** QueuePool 配置合理（pool_size=10, max_overflow=20, pool_pre_ping=True）✅
4. **E3 (异常覆盖)** 5+1 个处理器覆盖了主要异常类型，基本完整 ✅
5. exceptions.py 的弃用处理方式（warnings.warn + 重导出别名）是合理的过渡策略，但应标注移除版本。
