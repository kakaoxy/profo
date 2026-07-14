## 审查记录 - 11 - 限速逻辑全面评估

### 审查范围
- 限流核心实现: `utils/common.py`(`_get_client_ip`、`Limiter` 实例、`RateLimits` 常量类)
- 应用入口: `main.py`(`SlowAPIMiddleware` 注册、`rate_limit_handler` 异常处理器)
- 配置文件: `settings.py`(`trusted_proxies`)、`.slowapi.env`(空占位)、`.env.docker.example`(`TRUSTED_PROXIES` 示例)
- 错误处理: `error_handlers.py`(统一错误处理器)
- 部署架构: `backend/Dockerfile`(CMD 单进程)、`docker-compose.yml`(单容器)、`deploy-server.sh`(部署脚本)
- 前端配合: `frontend/src/lib/error-handling.ts`、`frontend/src/lib/error-utils.ts`、`frontend/src/lib/swr.ts`、`frontend/src/app/admin/login/actions.ts`
- 限流覆盖: 所有 `routers/` 下的 `@limiter.limit` 装饰器应用(认证/用户/项目/投资/线索/市场/上传/C 端公开)

### 评估维度
1. 限流算法选择(固定窗口 vs 滑动窗口 vs 令牌桶)
2. 限流粒度设计(IP 级 / 用户级 / 接口级 / 全局)
3. 阈值合理性(与业务需求、服务器承载能力匹配)
4. 响应机制完善性(错误码、错误提示、降级策略)
5. 安全隐患(绕过限流的潜在风险)
6. 覆盖完整性(哪些接口未限流)
7. 前端配合(429 处理、重试、倒计时)

---

### 当前实现概览

**技术栈**: `slowapi>=0.1.9`(基于 `limits` 库)

| 维度 | 当前实现 |
|---|---|
| 算法 | 固定窗口(Fixed Window)— `Limiter` 未传 `strategy` 参数,使用默认值 |
| 存储 | 进程内存(`MemoryStorage`)— 未配置 `storage_uri`,未使用 Redis |
| 粒度 | IP 级 key + 接口级阈值覆盖,无用户级限流 |
| 默认限流 | `200/day + 50/hour`(IP 维度,应用于未显式限流的路由) |
| Key 函数 | `_get_client_ip` —「从右向左跳过可信代理」XFF 解析策略 |
| 部署 | Docker 单容器,`uvicorn main:app` 单进程(无 `--workers`) |

---

### 发现问题

#### 问题 S11-001: 响应格式与 AGENTS.md 硬约束不一致(系统性问题)
- **文件**: `main.py#L243-L248`(rate_limit_handler)、`error_handlers.py#L77-L197`(所有错误处理器)
- **检查项**: 响应格式合规性
- **严重程度**: 🔴严重(系统性)
- **问题描述**: AGENTS.md §2 要求错误响应统一 `{"code":≠0,"message":"..."}` 格式。但实际所有限流响应返回 `{"detail": "请求过于频繁,请稍后重试"}`,且 `error_handlers.py` 中所有 5 个错误处理器(service/validation/sqlalchemy/http/general)也都返回 `{"detail": "..."}` 格式。这是一个系统性不一致,非限流独有。
- **影响范围**: 前端 50+ 处读取 `.detail` 字段(涵盖 `lib/swr.ts`、`lib/action-result.ts`、`lib/error-utils.ts`、`app/admin/login/actions.ts`、`app/(c)/valuation/actions.ts`、`app/(main)/admin/investments/actions/*`、`app/(main)/admin/ledger/actions.ts` 等)
- **修复决策**: ⚠️ 本次不单独修改限流响应格式,否则会引入新的不一致(限流 429 返回 `{code,message}` 而其他错误返回 `{detail}`)。建议作为独立系统性重构任务,统一所有错误处理器格式并同步前端适配。
- **本次处理**: 保持 `{"detail": "..."}` 格式,仅迁移处理器位置(见 S11-002)

#### 问题 S11-002: `rate_limit_handler` 位置违反分层一致性
- **文件**: `main.py#L233-L249`
- **检查项**: 代码组织一致性
- **严重程度**: 🟡中等
- **问题描述**: 限流异常处理器定义在 `main.py`,而其他 5 个处理器(service/validation/sqlalchemy/http/general)定义在 `error_handlers.py`。位置不一致,维护时易遗漏。
- **最佳实践参考**: DRY 原则 + 代码组织一致性
- **修改建议**: 将 `rate_limit_handler` 迁移至 `error_handlers.py`,`main.py` 改为导入注册
- **影响范围**: 代码组织,无功能影响
- **状态**: 本次修复

#### 问题 S11-003: 固定窗口算法在敏感接口存在 2 倍突发风险
- **文件**: `utils/common.py#L63-L67`(Limiter 构造未指定 strategy)
- **检查项**: 限流算法选择
- **严重程度**: 🔴严重
- **问题描述**: 默认固定窗口算法,窗口边界处可消耗 2 倍配额。对高敏感接口影响:
  - `AUTH_LOGIN = "5/minute"` → 窗口边界可 10 次/秒级突发,削弱暴力破解防护
  - `USER_CHANGE_PASSWORD = "3/minute"` → 6 次突发
  - `PUBLIC_REGISTER = "10/hour"` → 20 次/小时突发
- **最佳实践参考**: 高敏感接口应使用滑动窗口(moving-window)或令牌桶消除边界突发
- **修改建议**: `Limiter` 构造新增 `strategy="moving-window"`,全局升级为滑动窗口
- **影响范围**: 所有限流接口的算法行为
- **状态**: 本次修复

#### 问题 S11-004: 内存存储在多 worker 部署下阈值翻倍失效
- **文件**: `utils/common.py#L63-L67`(未配置 `storage_uri`)
- **检查项**: 存储后端可扩展性
- **严重程度**: 🟡中等(潜在风险)
- **问题描述**: 进程内存存储,计数不跨进程共享。当前生产为单进程(`Dockerfile` CMD 无 `--workers`),**当前无实际影响**。但未来若扩展为 `uvicorn --workers N` 或 gunicorn 多 worker,实际阈值会变成 N 倍。
- **最佳实践参考**: 生产环境限流应使用 Redis 等外部存储支持跨进程共享
- **修改建议**: 评估未来扩展需求,预置 Redis 存储(`storage_uri="redis://..."` + `pyproject.toml` 新增 redis 依赖 + `docker-compose.yml` 新增 redis 服务)
- **影响范围**: 多 worker 部署场景
- **状态**: 列为中期建议,本次不修复(当前单进程无影响)

#### 问题 S11-005: TRUSTED_PROXIES 配置易遗漏导致全站共享限流桶
- **文件**: `settings.py#L48`(默认 `["127.0.0.1", "::1"]`)
- **检查项**: 限流绕过隐患
- **严重程度**: 🟡中等
- **问题描述**: `.env.docker.example` 已有示例 `["127.0.0.1","::1","172.16.0.0/12"]`,但运维可能遗忘配置。Docker 部署下若未设置,所有请求共享 Docker 网关 IP(如 `172.18.0.1`)对应的限流桶,导致全站被限流或限流失效。
- **最佳实践参考**: 启动期 fail-loud 校验,检测到 Docker 环境但未配置网段时警告
- **修改建议**: 在 `utils/common.py` 模块加载时检测 Docker 环境(`/.dockerenv` 存在)且 `trusted_proxies` 无 CIDR 网段时,记录警告日志
- **影响范围**: Docker 部署的限流有效性
- **状态**: 本次修复

#### 问题 S11-006: 前端无 429 专属处理
- **文件**: `frontend/src/lib/error-handling.ts`、`frontend/src/lib/error-utils.ts`、`frontend/src/lib/swr.ts`
- **检查项**: 降级策略与用户体验
- **严重程度**: 🟡中等
- **问题描述**: 前端无读取 `Retry-After` 头、无倒计时禁用、无指数退避、无 429 专属文案。登录被限流时用户可继续点击触发更多 429,体验差。仅 `app/admin/login/actions.ts#L70-L72` 显示 `errorData.detail` 文案,无按钮禁用。
- **最佳实践参考**: 前端应对 429 特殊处理,读取 `Retry-After` 显示倒计时,禁用提交按钮
- **修改建议**: 在 `lib/error-handling.ts` 新增 429 检测,登录/注册表单被限流时禁用提交按钮
- **影响范围**: 用户体验
- **状态**: 列为中期建议,本次不修复(非限流逻辑本身问题)

#### 问题 S11-007: 部分敏感读接口未单独限流
- **文件**: `routers/system/auth.py`、`routers/common/upload.py`
- **检查项**: 覆盖完整性
- **严重程度**: 🟢轻微
- **问题描述**: 以下接口仅依赖默认 `50/hour`:
  - `GET /auth/api-key`(API Key 信息查询,创建/删除已限流)
  - `GET /auth/me`(后台当前用户)
  - `GET /upload/tasks`(任务列表)
- **最佳实践参考**: 敏感信息查询接口应单独收紧限流阈值
- **修改建议**: 新增 `RateLimits.AUTH_INFO_READ`、`UPLOAD_TASK_LIST` 常量并应用
- **影响范围**: 暴力探测防护
- **状态**: 列为优化建议,本次不修复

#### 问题 S11-008: `.slowapi.env` 空文件无实际作用
- **文件**: `backend/.slowapi.env`
- **检查项**: 配置文件清理
- **严重程度**: 🟢轻微
- **问题描述**: 空文件,`Limiter` 构造传入 `config_filename=".slowapi.env"` 但未配置任何项(无 `RATELIMIT_STORAGE_URI` 等)。且在 `.dockerignore` 中被排除,生产镜像不包含。
- **修改建议**: 移除 `config_filename` 参数,或填充实际配置
- **影响范围**: 无实际影响,仅代码整洁
- **状态**: 列为优化建议,本次不修复

#### 问题 S11-009: `forwarded_allow_ips` 配置与 `trusted_proxies` 不一致
- **文件**: `main.py#L260-261`
- **检查项**: 代理头解析一致性
- **严重程度**: 🟢轻微
- **问题描述**: `forwarded_allow_ips="127.0.0.1"` 仅影响 uvicorn 对 XFF 的信任解析(写入 `request.client`),不影响 slowapi 的 IP 提取(slowapi 使用 `request.client.host` + 自己的 XFF 解析)。Docker 部署下两者配置需保持一致,否则可能出现 uvicorn 信任但 slowapi 不信任的不一致。
- **修改建议**: 将 `forwarded_allow_ips` 也改为从 `trusted_proxies` 读取,或扩展为 `"*"`(因 slowapi 已自行校验)
- **影响范围**: Docker 部署下的 IP 解析一致性
- **状态**: 列为优化建议,本次不修复

#### 问题 S11-010: 无用户级限流
- **文件**: `utils/common.py#L63-L67`(`key_func=_get_client_ip`)
- **检查项**: 限流粒度设计
- **严重程度**: 🟢轻微
- **问题描述**: 所有限流以 IP 为维度,认证用户可跨 IP(如切换网络)规避。对已认证的滥用场景防护不足。
- **最佳实践参考**: 高敏感接口(如登录失败后)应增加用户 ID 维度限流
- **修改建议**: 评估是否对改密失败、登录失败等场景增加用户级限流桶
- **影响范围**: 已认证用户的滥用防护
- **状态**: 列为长期建议,本次不修复

---

### 阈值合理性评估

#### 合理的阈值设定 ✅
| 接口 | 阈值 | 评估 |
|---|---|---|
| 后台登录 `AUTH_LOGIN` | 5/minute | 合理,防暴力破解 |
| 修改密码 `USER_CHANGE_PASSWORD` | 3/minute | 合理,高敏感 |
| 重置密码 `USER_RESET_PASSWORD` | 5/hour | 合理,防滥用 |
| C 端注册 `PUBLIC_REGISTER` | 10/hour | 合理,防批量注册 |
| C 端卖房估价 `PUBLIC_LEAD_CREATE` | 10/hour | 合理,防刷单 |
| C 端手机号绑定 `PUBLIC_PHONE_*` | 10/hour | 合理,防短信轰炸 |
| API Key 创建/删除 | 20/hour | 合理 |
| 导出操作 `PROJECT_EXPORT`/`INVESTMENT_EXPORT` | 10/hour | 合理,防资源耗尽 |
| 删除操作(通用) | 20/hour | 合理,防误操作 |

#### 偏紧的阈值(需评估业务场景) ⚠️
| 接口 | 阈值 | 潜在问题 |
|---|---|---|
| 后台文件上传 `FILE_UPLOAD` | 50/hour | 批量上传凭证/文档时可能不够 |
| CSV 导入 `CSV_IMPORT` | 30/hour | 大批量数据导入时可能触发 |
| C 端图片上传 `PUBLIC_FILE_UPLOAD` | 30/hour | 多图上传场景(如卖房估价多图)可能不够 |

#### 阈值集中管理优点 ✅
- `RateLimits` 类集中管理所有阈值,避免魔法字符串散布
- 修改阈值只需调整一处
- 注释清晰,按模块分组

---

### 优点总结

1. **XFF 解析策略安全** ✅: `_get_client_ip` 采用「从右向左跳过可信代理」策略,有效防止攻击者在 XFF 头塞入伪造 IP 绕过限流(nginx `$proxy_add_x_forwarded_for` 会追加而非覆盖)
2. **阈值集中管理** ✅: `RateLimits` 类统一管理所有阈值,避免魔法字符串散布
3. **覆盖范围全面** ✅: 所有可能产生副作用的写操作(POST/PUT/PATCH/DELETE)、上传、导出、C 端敏感操作均显式限流
4. **高敏感接口阈值合理收紧** ✅: 登录 5/min、改密 3/min、注册 10/hour、估价 10/hour,符合安全最佳实践
5. **启动期校验 trusted_proxies** ✅: `_TRUSTED_PROXY_NETWORKS` 在模块加载时即校验,拼写错误 fail-loud
6. **默认限流兜底** ✅: `200/day + 50/hour` 为未显式限流的接口提供兜底防护

---

### 关键修复方案(本次实施)

#### 修复 1: 迁移 `rate_limit_handler` 至 `error_handlers.py`(S11-002)
- **改动**: 将 `main.py#L233-L249` 的 `rate_limit_handler` 迁移至 `error_handlers.py`
- **格式**: 保持 `{"detail": "..."}` 与现有错误处理器一致(S11-001 系统性问题另行规划)
- **影响文件**: `error_handlers.py`、`main.py`

#### 修复 2: 升级为滑动窗口算法(S11-003)
- **改动**: `Limiter` 构造新增 `strategy="moving-window"`
- **效果**: 消除窗口边界 2 倍突发风险,敏感接口防护增强
- **影响文件**: `utils/common.py`

#### 修复 3: TRUSTED_PROXIES 启动期 Docker 环境校验(S11-005)
- **改动**: 在 `utils/common.py` 模块加载时检测 Docker 环境且无 CIDR 网段时记录警告
- **效果**: 运维遗忘配置时启动日志可见警告,避免静默失效
- **影响文件**: `utils/common.py`

---

### 优化建议(非本次范围)

#### 中期建议
1. **统一错误响应格式**(S11-001 系统性): 将所有错误处理器从 `{"detail": "..."}` 统一改为 `{"code":≠0,"message":"..."}`,同步适配前端 50+ 处读取点。建议作为独立重构任务规划。
2. **引入 Redis 存储**(S11-004): 当未来扩展为多 worker 或多实例时,迁移到 Redis 存储
3. **前端 429 专属处理**(S11-006): 读取 `Retry-After` 头,显示倒计时,禁用提交按钮
4. **补充敏感读接口限流**(S11-007): 对 `GET /auth/api-key`、`GET /auth/me` 等增加显式限流

#### 长期建议
1. **用户级限流**(S11-010): 对认证后的高敏感操作(如改密失败后)增加用户 ID 维度限流
2. **限流监控与告警**: 接入日志分析,监控 429 触发频率,识别异常 IP
3. **动态阈值**: 基于历史流量数据动态调整阈值

---

### 审查统计
- 审查文件数: ~15(限流核心 + 配置 + 部署 + 前端配合 + 路由覆盖)
- 发现问题数: 10 (🔴严重: 2, 🟡中等: 4, 🟢轻微: 4)
- 优点数: 6
- 本次修复: 3 项(S11-002 处理器迁移、S11-003 滑动窗口、S11-005 TRUSTED_PROXIES 校验)
- 系统性问题: 1 项(S11-001 响应格式统一,需独立规划)

### 审查人备注
1. **最关键发现**: 固定窗口算法在敏感接口的 2 倍突发风险(S11-003)是本次评估最重要的安全问题,通过全局升级为滑动窗口解决,改动最小且治本。
2. **系统性问题**: 响应格式不一致(S11-001)不是限流独有问题,而是整个错误处理层的系统性遗留。session-07「S07-001/S07-003」已记录未修复。本次不单独修改限流响应格式,避免引入新的不一致。
3. **部署风险**: TRUSTED_PROXIES 配置遗漏(S11-005)是 Docker 部署下最易发生的运维陷阱,通过启动期警告降低风险。
4. **当前无多 worker 风险**: 生产为单进程(S11-004),内存存储当前无实际影响,Redis 迁移列为中期建议。
5. **XFF 解析策略优秀**: `_get_client_ip` 的「从右向左跳过可信代理」是业界推荐做法,有效防止 IP 伪造绕过。
