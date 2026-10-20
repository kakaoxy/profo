# ProFo 后续三迭代 · SPEC 总纲（能力地图 + 共享契约）

> **状态**：实施依据（S1 · 待开工）｜撰写 2026-10-17
> **上游计划**：`docs/To-Do/2026-10-17-后续三迭代计划.md`（计划稿，本总纲对其**口径纠偏**见 §1）
> **实施级模块 spec**：
> - `docs/To-Do/SPEC-iteration1-migrations.md`（迭代一：迁移版本化与可回滚）
> - `docs/To-Do/SPEC-iteration2-notifications-workbench.md`（迭代二：统一消息中心 + 角色化工作台）
> - `docs/To-Do/SPEC-iteration3-observability.md`（迭代三：Prometheus 指标 + 慢查询告警）
> **基线**：`main` @ 2026-10-17 工作区（含楼盘字典修复未提交改动）

---

## 0. 阅读顺序与执行约定

| 顺序 | 文档 | 谁读 |
|------|------|------|
| 1 | 本文（总纲） | 全体：产品/后端/前端/运维 |
| 2 | `SPEC-iteration1-migrations.md` | 后端（主）+ 运维 |
| 3 | `SPEC-iteration2-notifications-workbench.md` | 后端 + 前端 + 产品 |
| 4 | `SPEC-iteration3-observability.md` | 后端 + 运维 |

**执行铁律**（与 `AGENTS.md` 叠加，不替代）：

1. **本 spec 是唯一实施依据**。计划稿与本 spec 冲突时，以本 spec 为准（差异已在 §1 列明）。
2. **口径只改一处**：§4 已决口径（D-01…D-10）视为已批准，实施中不得自行偏离；确需变更，先改 spec、评审、再改代码。
3. **每完成一个任务必须留可复现验证证据**（命令 + 预期 + 实际输出），归档到模块 spec 指定路径。无证据不得标记完成。
4. **⚠️未覆盖必须显式报**。不允许「编译通过＝功能生效」。接线类改动（新增回调/挂载点/开关）必须验证消费方真实生效。

---

## 1. 基线纠偏（已用代码核对，非计划稿转述）

计划稿 §1 的现状描述有 3 处与代码不符。**本 spec 一律按下列实测口径实施**。

| # | 计划稿说法 | 实测（核对方式） | 影响 | 处置 |
|---|-----------|-----------------|------|------|
| **B1** | 「77 个迁移函数」 | `_run_all_migrations` 实际调用 **80** 项（多出 `add_published_at_to_l4_marketing_projects`、`run_bd_audit_20261017_fixes`、`run_bd_audit_20261018_fixes`；计划稿的 grep 漏了含数字的函数名） | 版本映射表少 3 行；新迁移起点错位 | ~~`version=1..80`；新增迁移从 81 开始~~ → **已被 B8 修正为 82 / 83** |
| **B2** | 备份需「backend 镜像安装 `postgresql-client`（+20MB）」 | 成立，但**部署链路已有全库备份**：`deploy-server.sh` 在重建容器前用 db 容器 `pg_dump \| gzip` 落盘（`BACKUP_DIR`，按份数轮转） | 迁移备份是**第二层**（可关联到版本、可回放单表），不是唯一防线 | 仍装 `postgresql-client`（`--no-install-recommends`），备份纳入 `schema_migrations.backup_path` 审计链 |
| **B3** | `PATH_PERMISSION_MAP`「已按 prefix 长度降序排列」 | docstring 这样写，实测**顺序并非长度降序**（`/admin/settings` 在 `/admin/projects/todo-board` 之前）。实现是「首个命中即返回」 | 新条目若依赖自动排序放错位置 → 权限影子（guard 落在错误前缀） | 新条目**手工插入到更宽前缀之前**；迭代二顺带修正 docstring/补排序断言测试 |
| **B4** | （未提）`_marketing_notify.create_marketing_project_subscription_table` 内部还调 `add_last_subscribed_at_*` / `add_cancelled_at_*` 两个子迁移 | 实测存在（wrapper 内调用，`_run_all_migrations` 只调 wrapper） | 注册表若按「函数」逐一定义，会重复登记子步骤 | 注册表粒度 = **`_run_all_migrations` 的顶层调用单元（B8 实测 82 个）**，子步骤不单列 |
| **B5** | （未提）`Dockerfile` 只有 `CMD`，无 `ENTRYPOINT` | 实测 `backend/Dockerfile` 末尾仅 `CMD [".venv/bin/uvicorn", ...]` | 迭代三 multiprocess 目录清理**无法**靠 compose `command:` 覆盖实现 | 新增 `backend/docker-entrypoint.sh` + `ENTRYPOINT`（迭代三 T3.1a） |
| **B6** | （未提）`request_id_var` 定义在 `main.py` | 实测全仓仅 `main.py` 3 处引用（L79/L100/L321-L327），无外部 import | 迭代三抽 `utils/observability.py` 改动面极小、无循环依赖风险 | 迭代三 T3.3 抽取，`main.py` 改为 import |
| **B7** | （未提）`/projects/todo-board` **无 `scope` 参数**，`TodoBoardService._load_projects()` 全量加载 | 实测 `routers/projects/core.py:188` + `services/projects/todo_board.py:49` | 计划稿 T2.6 的 `todo-board?scope=mine` 不是「前端传参」而是**后端新增能力** | 迭代二 T2.6b 明确为后端改动（Router+Service），`services/projects/core.py:444 get_my_responsible_projects` 的过滤谓词抽公共函数复用 |
| **B8** | （未提）实测 `_run_all_migrations` 顶层调用为 **82** 项，非 B1 的 80；且 v23 位置是 `add_project_archive_columns`（B1 统计时还未提交），`create_biz_dict_items_table` 在末尾 | `grep -c '^        [a-z_]*(engine)$'` + AST 解析 `backend/migrations/__init__.py::_run_all_migrations`；`python -c "from migrations.registry import MIGRATIONS; print(len(MIGRATIONS))"` → 82 | ① 迭代一 §11 表整体重排（v23=archive 列，v24=`migrate_add_ended_status`，后续顺延）；② `NEXT_VERSION` = **83**（非 81）；③ 迭代二原规划的种子迁移 81–85 顺延为 **83–87**（§2 表已更新）；④ MVP 补偿脚本版本号 v49→**v50**、v77→**v78** | 迭代一起 `version=1..82`；新增迁移从 **83** 起 |
| **B9** | （未提）`pg_dump ≥17` 产出的归档格式为 **1.16**，PG16 自带的 `pg_restore` 直接拒绝；且 client ≥17 会写 `SET transaction_timeout`（PG16 报 unrecognized parameter）。另外 `--data-only` 恢复时加 `--table=` 过滤会**静默灌 0 行**（退出码 0、无报错） | 本机实测：`pg_dump 18.6` → `pg_restore 16.15` 报 `unsupported version (1.16) in file header`；`pg_dump 17.11` 同样；`--table=public.leads` 恢复 0 行、不加则 977 行 | 恢复不能只在 runbook 里写「用 psql 重放」——必须**同大版本客户端**，且避免 `--table` 过滤 | ① 备份时把 `pg_dump` 版本写入 `schema_migrations.backup_client`；② `restore-hint` 按 `backup_client` 与 server 版本输出命令并给出跨大版本告警；③ runbook §5 提供**实测跑通**的两段式配方（`restored_leads=977 == prod_leads=977`）；④ 备份前 `assert_client_compatible` 校验 client ≥ server |
| **B10** | （未提）`str(sqlalchemy.engine.URL)` 会把密码渲染成 `***` | `make_url(db.engine.url.render_as_string(hide_password=False))` 与 `make_url(str(db.engine.url))` 对比：后者 `password` 长度 3（`***`），前者 24 | 备份模块若用 `str(engine.url)` 取密码，`PGPASSWORD` 会变成 `***`，pg_dump 认证失败 | 统一传 `URL` 对象（`build_dump_command(database_url: str \| URL)`），单测 `test_subprocess_run_not_called_with_password_in_argv` 断言 argv 无密码且 `PGPASSWORD` 正确 |


> 以上 10 条纠偏均已复核到行号/实测命令；实施时若发现第 11 条，**追加进本表再开工**，不得静默处理。

---

## 2. 能力地图

三个迭代 = 三个**可独立验收**的模块。依赖方向单向，无环。

| module id | 职责 | 依赖 | 交付形态 |
|---|---|---|---|
| `iter1-migrations` | 迁移可追溯 / 可校验 / 可备份 / 可补偿 | —（仅依赖现有 PG + SQLAlchemy） | 后端 + CLI + compose/Dockerfile + runbook |
| `iter2-notify-workbench` | 统一消息中心 + 角色化工作台 | `iter1-migrations`（新表必须登记版本 + 备份元数据；**版本号从 83 起**，见 B8） | 后端表/服务/API + 前端页面/组件 + 权限种子 |
| `iter3-observability` | Prometheus 指标 + 慢查询 + 告警 | `iter1-migrations`（迁移指标消费注册表）；`iter2-notify-workbench`（告警站内信，**弱依赖，可降级**） | 后端埋点 + 监控 compose + 告警规则 + runbook |

**构建顺序**：`iter1` → `iter2`（后端表设计可与 iter1 后半并行，**上线不可并行**）→ `iter3`。

**并行边界（防写冲突，按文件归属划分）**：

| 阶段 | 后端 A（迁移/数据） | 后端 B（业务/接口） | 前端 | 运维 |
|------|------------------|------------------|------|------|
| W1–W2 | `backend/migrations/**`、`backend/db.py` | （空档，可预研 iter2 模型） | — | 备份目录/镜像 |
| W3–W5 | `backend/migrations/**`（**83–87**，B8 顺延）+ 模型 | `services/notification/**`、`routers/**` | `src/app/(main)/admin/notifications/**`、`workbench-widgets.ts` | — |
| W6–W7 | `backend/utils/metrics.py`、`middleware/**` | — | — | `deploy/observability/**`、nginx |

---

## 3. 共享契约（跨迭代，冲突即缺陷）

### C1 · 环境变量契约

- 所有新增变量必须：① 在对应模块 spec 的「环境变量」表登记；② 有代码默认值（除安全类必须显式配置）；③ 同步写入 **根目录 `.env.docker.example`**（含注释与生成命令）。
- 新增变量一律 `SCREAMING_SNAKE`，按模块前缀：`MIGRATION_*` / `NOTIFICATION_*` / `WORKBENCH_*` / `METRICS_*` / `SLOW_QUERY_*` / `DB_POOL_*` / `ALERT_*`。
- `settings.py` 内**只新增字段**，不重构 `Settings` 类（项目已有「不拆分」决策）。
- 危险默认值必须 Fail Loud：生产禁用值（如 `MIGRATION_BACKUP_MODE=off`）在 `DEBUG=false` 时拒绝启动并打印修复指令。

### C2 · 迁移登记契约（迭代二/三的一切新表都受此约束）

- 新迁移**只能追加**在 `MIGRATIONS` 元组末尾，`version` 严格递增（下一个可用值从 **81** 开始）。
- 每个 `Migration` 必填：`version / name / fn / kind / backup / reversible / risk / description`；`backup=table` 时 `backup_tables` 不得为空；`risk=C/D` 时 `reversible=False`。
- `name` 一经登记**不得修改**（进 checksum 与审计）；文件名约定 `compensations/<version:03d>_<name>.py`。
- 新表在「全新库」由 `Base.metadata.create_all` 创建、在「既有库」由迁移创建 → **两者 DDL 必须逐列一致**，由迭代一 T1.8 的 `test_migration_model_parity` 强制。
- 涉及数据删除/加密/列重命名/多表改写的迁移，`backup` 不得为 `none`（迭代一 §11 矩阵为准）。

### C3 · 权限点契约

- 命名 `module:action`（小写、冒号分隔），与既有 `_PERMISSIONS_SEED` 同构（`code/name/module/category/sort_order/description`）。
- 新权限点通过**种子迁移**（`kind=seed`）写入，必须幂等（`WHERE NOT EXISTS`），且**不自动授予已有角色**（除非 spec 明示）。
- 前端 `src/lib/auth/permissions.ts` 的 `PATH_PERMISSION_MAP` 是**有序首个命中**结构：
  - 新增条目必须**手工插到更宽前缀之前**（例：`/admin/settings/workbench` 必须在 `/admin/settings` 之前）；
  - 每次增删条目必须补一条单测断言具体路径→权限映射（防后续插入错位）。
- 后端权限校验一律复用 `dependencies/auth.py::require_permission` / `PermissionService.get_user_permission_codes`，**禁止**新写权限查询 SQL。

### C4 · 日志与 PII 契约

- 日志统一走 `logging`，格式已含 `[%(request_id)s]`；新增日志必须能关联 `X-Request-ID`。
- **禁止**入日志/指标的：SQL 参数值、原始 URL（含 query）、手机号/身份证/银行卡、openid 全文、微信 `secret`/`access_token`。
- 需要展示的敏感值走 `utils/mask.py` 既有掩码函数，不新写。
- 慢查询日志：SQL 截断（默认 500 字符）、去换行、多语句只取首段、**不含 parameters**。

### C5 · 错误响应契约

- 错误响应**必须** `{"code": ≠0, "message": "..."}` + 标准 HTTP 状态码；成功响应可裸返回 Pydantic 模型。
- 新端点不得返回裸 `{"detail": ...}`（FastAPI 默认形态），必须走 `error_handlers.py` 既有处理器或显式 `ServiceException`。
- 触发动作类请求体命名 `*Request`（非实体 CRUD），对齐 `AGENTS.md`。

### C6 · 开关与降级矩阵（每个开关都必须能在不回滚代码的情况下关掉本迭代）

| 开关 | 默认 | 关闭后行为 | 属于 |
|------|------|-----------|------|
| `MIGRATION_LEGACY_MODE` | `false` | 走旧 `_run_all_migrations` 硬编码路径（一个 release 后删除） | iter1 |
| `MIGRATION_AUTO_BASELINE` | `false` | 空版本表 + 有数据 → 启动阻断 | iter1 |
| `MIGRATION_BACKUP_MODE` | `on` | `off` 仅 DEBUG 允许；生产拒绝启动 | iter1 |
| `NOTIFICATION_DUAL_WRITE` | `true` | 现有微信链路不再双写站内信（消息中心保留读能力） | iter2 |
| `WORKBENCH_LAYOUT_ENABLED` | `true` | `/admin` 回落到当前单套仪表盘（v0 布局） | iter2 |
| `METRICS_ENABLED` | `true` | 不挂载 `/metrics`、不注册中间件/事件监听 | iter3 |
| `NOTIFICATION_ALERT_SINK` | `webhook` | 告警不写站内信，只走 Alertmanager webhook | iter3 |

### C7 · 类型同步契约

- 任何新增/变更 API → 启后端 → `cd frontend && pnpm gen-api` → 提交 `src/lib/api-types.d.ts`。
- 前端**禁止手写** API 类型；表单 Zod schema 与 Pydantic 语义对齐（尤其 `priority`、`category` 枚举）。

### C8 · 时间与列类型契约

- 时间列一律 `TIMESTAMPTZ`（SQLAlchemy `DateTime(timezone=True)`）；日期列用 `Date`。
- 新表 `created_at/updated_at` 与 `BaseModel` 完全一致（`default=now(utc)` / `onupdate=now(utc)`），迁移 DDL 不得写成 `timestamp without time zone`。
- 后端比较/聚合按 `Asia/Shanghai` 自然日（沿用既有 `services/.../time_windows` 与 `astimezone()` 模式）。

### C9 · 前端消费契约（RSC 优先 + NEXT_REDIRECT 守卫）

- 默认 Server Component；`'use client'` 仅在需要浏览器 API/交互状态时使用。
- Server Component 内无依赖的异步取数**必须并行**（`Promise.all` / `Promise.allSettled` 或独立 `Suspense`），禁止串行 `await` 瀑布。
- 数据加载的 `try/catch`（含 `allSettled`）**必须放行** `isRedirectError(e)`，否则 401 刷新重定向链断裂。
- 新页面不得修改 `src/components/ui/**`；样式用 `cn()` 覆盖，视觉令牌沿用 Steep（`bg-fog`/`rounded-cards`/`shadow-steep`）。

---

## 4. 已决口径（计划稿 §10 Q1–Q10 → 决策）

> 已确认：**全部落为已决口径**。执行中如需变更，走 §10 变更控制。

| ID | 原问题 | 已决值 | 影响面 |
|----|--------|--------|--------|
| **D-01** | baseline 是否允许维护窗口 | **允许 30–60 分钟**；必须在 staging 先演练一次并留工件；生产执行前 `manage status` 核对 + 全库备份 | iter1 |
| **D-02** | 备份保留天数/份数 | **30 天 + 20 份**（两者取先到者；始终保留最新 1 份） | iter1 |
| **D-03** | 是否接受镜像 +`postgresql-client` | **接受**，用 `--no-install-recommends`，固定大版本（Debian trixie 自带 `postgresql-client` 17，可 dump PG16） | iter1 |
| **D-04** | 迭代二 MVP 通知事件范围 | **客户/线索/待办/系统 四类**共 12 个事件（详见 iter2 §4.2 事件字典） | iter2 |
| **D-05** | 站内信是否需要小程序入口 | **本期不做**；小程序保持现有微信订阅 + 「我的客户」角标；C 端站内信留二期 | iter2 |
| **D-06** | 角色默认布局清单 | 按 iter2 §4.5 组件注册表（admin 9 / operator 6 / user 3，具体以表为准） | iter2 |
| **D-07** | 监控部署位置 | **独立监控主机优先**；单机仅 `--profile observability` 验证，Grafana 默认不启 | iter3 |
| **D-08** | 告警接收通道 | **企业微信/飞书机器人 webhook** 为必选；站内信为增强（失败不影响 webhook） | iter3 |
| **D-09** | 慢查询阈值 | **500ms**；上线后观察 1 周，按 P95 数据调整并记录到 runbook | iter3 |
| **D-10** | 是否启用 `pg_stat_statements` | **本期不启用**（需重启 PG + 改 `shared_preload_libraries`）；作为增强项写进 runbook 的「后续」 | iter3 |

---

## 5. 里程碑与排期

| 里程碑 | 时点 | 判定条件（缺一不算达成） |
|--------|------|------------------------|
| **M1** | iter1 末（W2） | ① `manage status` 可读 **82** 条记录；② 既有库 baseline 完成；③ 1 个数据修复迁移「备份→补偿→验证」演练 ≤30 分钟并留工件；④ `MIGRATION_LEGACY_MODE` 可回退 |
| **M2** | iter2 末（W5） | ① 员工侧 3 类事件（招募新线索、我的客户新线索、状态变更）站内信贯通；② 三角色默认布局生效且权限不扩张；③ Playwright 2 个 spec 通过；④ 4 条微信链路零回归 |
| **M3** | iter3 末（W7） | ① `/metrics` 暴露 6 类指标；② 2 worker 计数不下折；③ 慢查询注入命中日志+计数；④ `promtool` 通过；⑤ 公网 `/metrics` 非 200 |
| **缓冲** | W8 | 观察期、阈值调参、遗留问题收口、文档归档 |

**总估**：2 后端 + 1 前端 + 运维配合 ≈ 7 周 + 1 周缓冲；仅 1 名后端 ≈ 9 周 + 缓冲（iter1 +1 周、iter3 +1 周）。

---

## 6. 统一 DoD（每个迭代收尾逐条打勾）

- [ ] `cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check .` 通过
- [ ] `cd frontend && pnpm typecheck`（`tsc --noEmit`）与 `pnpm lint` 通过（前端有改动时）
- [ ] 后端 pytest 全绿；`--cov-fail-under` 维持既有门限（`fail_under=82`，新增代码带入覆盖）
- [ ] 本轮新增 API → `pnpm gen-api` 已执行且 `api-types.d.ts` 变更已提交
- [ ] 新增/变更表 → 迁移已按 C2 登记，`backup/reversible/risk` 元数据齐全，幂等（连跑两次无差异）
- [ ] 新增环境变量 → 代码默认值 + `.env.docker.example` + 模块 spec 三处一致
- [ ] **验证工件已归档**：命令、预期输出、实际输出（文本/JSON）。路径：
  - 后端 pytest / E2E：`backend/tests/e2e/artifacts/`
  - 演练/巡检记录：`docs/Done/2026-XX-XX-迭代N验收报告.md`
- [ ] 开关可用性验证：按 C6 关一次开关，确认降级路径真实生效（不是只看代码分支）
- [ ] 回滚步骤已写进对应 runbook 并在 staging 至少执行一次
- [ ] PII 检查：新增日志/指标 grep 一遍 `phone|id_card|openid|params|sql=`
- [ ] `⚠️未覆盖` 清单已写入验收报告（没有则显式写「无」）

---

## 7. 全局验收命令总表

```bash
# ── 静态检查 ──────────────────────────────────────────────
cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check .
cd frontend && pnpm typecheck && pnpm lint

# ── 迭代一 ────────────────────────────────────────────────
docker compose exec backend .venv/bin/python -m migrations.manage status
docker compose exec backend .venv/bin/python -m migrations.manage verify
docker compose exec backend .venv/bin/python -m migrations.manage compensate <version> --dry-run
cd backend && .venv/bin/pytest tests/test_migration_registry.py tests/test_migration_backup.py tests/e2e/test_migration_runner.py -q

# ── 迭代二 ────────────────────────────────────────────────
cd backend && .venv/bin/pytest tests/test_notification_service.py tests/test_notification_api.py tests/test_workbench_config.py -q
cd backend && .venv/bin/python tests/e2e/test_notification_center.py
cd frontend && pnpm exec playwright test e2e/admin-notifications.spec.ts e2e/workbench-role-layout.spec.ts

# ── 迭代三 ────────────────────────────────────────────────
curl -s http://127.0.0.1:8000/metrics | grep -E '^profo_(http|db|migrations|notifications)'
promtool check rules deploy/observability/alerts.yml
promtool test rules deploy/observability/alerts.test.yml
cd backend && .venv/bin/pytest tests/test_metrics_http.py tests/test_slow_query.py -q
curl -s -o /dev/null -w '%{http_code}\n' https://fangmengchina.com/metrics   # 期望 404/403
```

---

## 8. 跨迭代风险登记

| ID | 风险 | 概率 | 影响 | 应对 | 迭代 | 责任 |
|----|------|:----:|:----:|------|:----:|------|
| R1 | 既有库 baseline 误操作/耗时超窗 | 中 | 高 | D-01 维护窗口 + 全库备份 + staging 预演 + `status` 前置核对 | 1 | 后端 |
| R2 | 补偿脚本二次伤害 | 中 | 高 | dry-run 强制 + 行数上限 + 单事务 + 生产双确认 | 1 | 后端 |
| R3 | checksum 误报（格式化/注释改动） | 高 | 中 | checksum 去注释去空行（tokenize）+ `rebaseline` + 单测覆盖 | 1 | 后端 |
| R4 | 通知洪泛/漏发 | 中 | 中 | dedupe_key + 偏好 + 旁路双写开关 + 冒烟脚本 | 2 | 后端/产品 |
| R5 | 跨用户消息泄漏 | 低 | 极高 | 所有查询强制 `user_id = current_user.id` + 专项 E2E（含直接请求他人 ID） | 2 | 后端 |
| R6 | 角色布局误配致关键卡片消失 | 中 | 中 | 后端 permission 过滤 + 代码 fallback + 管理端预览 + 重置入口 | 2 | 前后端 |
| R7 | 2 worker 指标减半 | 高（若不处理） | 高 | multiprocess 强制 + 2 worker 验收用例 | 3 | 后端 |
| R8 | 1.6G 内存 OOM | 中 | 高 | D-07 独立监控主机 + 单机 profile 限内存 + Grafana 默认关 | 3 | 运维 |
| R9 | 慢查询日志含 PII | 中 | 高 | 不记 parameters + 截断 + 脱敏单测 | 3 | 后端 |
| R10 | 告警疲劳 | 高 | 中 | 分级 + 抑制规则 + 观察期 + 周复盘 | 3 | 运维 |
| R11 | iter2 延期拖累 iter3 | 中 | 中 | 告警先走 webhook（D-08），不阻塞 | 项目 | 项目 |

---

## 9. 三迭代「不做」清单（防止范围蔓延）

- ❌ 不迁 Alembic、不为 80 个迁移全写 down SQL
- ❌ 不做零停机在线 DDL、迁移审批流/工单
- ❌ 不做邮件/短信/Web Push；不做小程序消息中心页（D-05）
- ❌ 不做 SSE/WebSocket 实时推送（MVP 用 SWR 轮询 + 聚焦刷新）
- ❌ 不做工作台拖拽自由布局（`@dnd-kit` 已在依赖里，仅作 stretch，默认不承诺）
- ❌ 不做 OpenTelemetry/Tracing、Loki/ELK、SLO 平台
- ❌ 不启用 `pg_stat_statements`（D-10）；不做 Grafana 托管看板
- ❌ 不为 274 个 API 逐个定义 SLO

---

## 10. 变更控制（spec 是活文档）

| 触发 | 动作 |
|------|------|
| 需求变化 / 口径变更 | 先改对应模块 spec 的「已决口径」表 → 记录变更人+日期+理由 → 再改代码 |
| 发现新基线偏差 | 追加 §1 表（含核对方式与行号）→ 评估是否影响已完成任务 |
| 任务拆分变化 | 只改模块 spec 的「任务拆解」与「验收标准」，不动口径 |
| 迭代延期 | 更新 §5 里程碑表并说明「砍什么」（禁止静默延期） |

**评审人**：口径类 → 业务负责人 + 后端负责人；测试/工件类 → 后端负责人；运维类（备份/监控）→ 运维。

---

## 11. 附录：三迭代共用索引（实施时直接引用，勿另建）

### A. 关键代码位置（已核对）

| 用途 | 位置 |
|------|------|
| 启动编排 | `backend/main.py::lifespan`（`init_db()` → `run_startup_migrations(engine)` → Redis → 归档清理） |
| 迁移编排 | `backend/migrations/__init__.py::run_startup_migrations` / `_run_all_migrations`（80 项硬编码，L240+） |
| advisory lock key | `backend/migrations/_helpers.py::_MIGRATION_ADVISORY_LOCK_KEY = 20260722130001` |
| 迁移幂等工具 | `_helpers.py::_column_exists / _index_exists / _pg_quote_literal` |
| 引擎/连接池 | `backend/db.py`（`QueuePool(pool_size=10, max_overflow=20, pool_pre_ping=True, pool_recycle=3600)`） |
| 配置 | `backend/settings.py`（`Settings`，env_file `../.env`/`.env`） |
| 中间件链 | `main.py`：CORS → SlowAPI → GZipExemptPrefix → `request_id_middleware` → `csrf_protect` |
| 请求 ID | `main.py::request_id_var`（ContextVar，L79） |
| 权限依赖 | `backend/dependencies/auth.py::require_permission / require_any_permission / require_project_read_or_business_permission` |
| 权限码查询（可复用） | `backend/services/system/permission.py::PermissionService.get_user_permission_codes(db, user) -> set[str]`（L222） |
| 权限种子 | `backend/migrations/_seeds.py::_PERMISSIONS_SEED / _ROLE_PERMISSIONS_SEED` |
| 系统配置 KV | `models/system/system_config.py` + `system_configs(key, value, updated_by_id)`；读写范式参考 `services/system/subscribe_templates.py` |
| 前端路径守卫 | `frontend/src/lib/auth/permissions.ts::PATH_PERMISSION_MAP`（首个命中） |
| 前端侧边栏 | `frontend/src/components/app-sidebar.tsx`（`SidebarFooter` 在 L391–453） |
| 前端导航数据 | `frontend/src/lib/admin-nav-data.ts`（`NavItem.permission` 优先于 `roles`） |
| 工作台页面 | `frontend/src/app/(main)/admin/page.tsx`（各卡片独立 `<Suspense>` + `<HasPermission>`） |
| 工作台取数 | `frontend/src/app/(main)/admin/_lib/dashboard-data.ts`（`Promise.allSettled` + `isRedirectError` 放行） |
| 现有微信通知 | `services/leads/notify.py::notify_eval_price_changed`；`services/growth_center/customer_notify.py::notify_new_customer_lead / notify_customer_status_changed`；`services/recruit/attribution.py::notify_new_lead`（L279）；`services/marketing/notify.py::notify_projects_published / notify_project_price_changed` |
| 订阅模板解析 | `services/system/subscribe_templates.py::resolve_template_id`（DB 优先、env 兜底） |
| 微信发送 | `services/system/wechat.py::send_subscribe_message`（L528，返回 `(errcode, errmsg)`） |
| 待办看板 | `routers/projects/core.py:188` + `services/projects/todo_board.py::get_board()`（无 scope） |
| 我负责的项目 | `routers/projects/core.py:227` + `services/projects/core.py:444::get_my_responsible_projects` |
| 部署备份 | `deploy-server.sh` L56–90（db 容器 `pg_dump \| gzip` + 份数轮转） |
| 部署编排 | `deploy-local.sh`（build → save → scp → ssh）→ `deploy-server.sh`（备份 → 起 redis/db → backend → 健康检查 → frontend） |

### B. 现有权限码（本轮新增前，实测 44 个）

```text
api_key:manage          operation_log:read      permission:manage       permission:read
user:create             user:delete             user:read               user:reset_password
user:unbind_wechat      user:update             role:assign_permissions role:create
role:delete             role:read               role:update
project:read            project:write           project:delete
project:renovation:complete_stage               project:renovation:upload_photo
project:sales:add_record                        project:sales:manage_team
lead:read               lead:create             lead:write              lead:submit
lead:upload_photo       property:read           property:write          property:upload
property:governance     l4_marketing:read       l4_marketing:write      investment:read
investment:write        investment:copy         ledger:read             ledger:write
ledger:settle           subject:read            subject:write           recruit:read
recruit:write           valuation:write
```

> 来源：`backend/migrations/_seeds.py::_PERMISSIONS_SEED`（实测 44 项）。**注意**：不存在 `key:*`、`report:*`、`subscribe_template:*` 权限码（计划稿的泛化列举不准确）；钥匙/报表模块按 `project:read`/`property:read` 等既有码鉴权。
> 本轮新增：`workbench:manage`（iter2，种子迁移；受 B8 顺延约束，实际版本号由迭代二按其任务拆解从 **83 起**分配）。

### C. 现有 4 条微信订阅链路（本轮零回归基线）

| 链路 | 入口函数 | 模板 key |
|------|---------|---------|
| 招募新线索 | `RecruitAttribution.notify_new_lead` | `recruit_lead` |
| 我的客户新线索 | `customer_notify.notify_new_customer_lead` | `customer_lead` |
| 我的客户状态变更 | `customer_notify.notify_customer_status_changed` | `customer_lead` |
| 估价授权价变更 | `leads.notify.notify_eval_price_changed` | `valuation_price` |
| 营销上新 / 调价（C 端） | `marketing.notify.notify_projects_published / notify_project_price_changed` | `project_new` / `project_price_change` |

> 冒烟脚本必须覆盖上表 6 个入口（基线回归用例，见 iter2 §7.3）。
