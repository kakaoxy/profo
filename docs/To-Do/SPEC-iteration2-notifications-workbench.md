# SPEC · 迭代二：统一消息中心 + 角色化工作台（实施版）

> **状态**：实施依据（S2）｜撰写 2026-10-17｜module id：`iter2-notify-workbench`
> **上游**：`docs/To-Do/2026-10-17-三迭代-SPEC-index.md`（C1–C9、D-04/D-05/D-06）
> **计划稿**：`docs/To-Do/2026-10-17-后续三迭代计划.md` §4
> **强依赖**：迭代一（新表必须登记 `version=81+` 并带 backup/reversible/risk 元数据）
> **纠偏**：总纲 §1 的 B3（`PATH_PERMISSION_MAP` 非自动排序）、B7（`todo-board` 无 `scope` 参数，需后端新增）

---

## 1. 定位与范围

### 1.1 一句话定位

把 4 条各自为战的微信订阅链路，收拢成「**一个事件 → 统一收件人解析 → 站内信（持久化、可已读、可偏好）+ 微信（best-effort）**」；同时把单套 `/admin` 仪表盘换成「**角色默认布局 + 个人定制 + 权限硬门控**」的工作台。

### 1.2 现状（已核对代码）

| 事实 | 证据 | 后果 |
|------|------|------|
| 6 个微信通知入口，各自解析 openid / 拼模板 | `services/recruit/attribution.py:279`、`services/growth_center/customer_notify.py:143,168`、`services/leads/notify.py:63`、`services/marketing/notify.py:537,689` | 无统一收件箱；用户漏看即永久丢失 |
| 持久化仅营销侧 | `l4_marketing_notify_logs`（发送日志，非收件箱） | 无法统一查询/已读 |
| 无站内信表 | 全仓无 `notifications` | 无兜底渠道 |
| 工作台单套布局 | `frontend/src/app/(main)/admin/page.tsx`（固定 7 个区块 + `HasPermission` 门控） | admin/operator/user 看到的高度同质 |
| 权限体系完备可复用 | `_PERMISSIONS_SEED` + `role_permissions` + `PermissionService.get_user_permission_codes(db, user) -> set[str]`（L222） | 无需新机制 |
| 全局配置 KV 已有 | `system_configs(key,value,updated_by_id)` + 读写范式 `services/system/subscribe_templates.py` | 角色默认布局不需要新表 |
| 「我负责的项目」已实现 | `services/projects/core.py:444` → `ProjectQueryService.get_by_business_identity(user_id)` | `my_projects` 卡片零后端改动 |
| 待办看板无 scope | `TodoBoardService.get_board()` 全量加载（`services/projects/todo_board.py:49`） | `my_todos` 卡片**需要后端新增参数** |

### 1.3 范围

**In Scope**

1. 4 张新表（`notifications` / `notification_recipients` / `notification_delivery_logs` / `user_preferences`）+ 迁移 81/82。
2. `NotificationService`：事件字典、收件人解析、去重、偏好过滤、站内信持久化、微信渠道适配、审计日志。
3. `/api/v1/notifications/*` 7 个端点 + 偏好读写。
4. 现有员工侧 3 个微信入口**旁路双写**（招募新线索、我的客户新线索、我的客户状态变更）+ 授权价变更（C 端，仅记录不双写）。
5. 前端：侧边栏/移动端铃铛 + 未读角标 + 抽屉 + `/admin/notifications` 页面 + 偏好设置。
6. 工作台：`/api/v1/admin/workbench/*` 5 端点、`system_configs` 角色默认布局、`user_preferences` 个人覆盖、前端 widget 注册表、5 个新卡片（`growth_overview`/`finance_summary`/`audit_summary`/`my_projects`/`my_todos`）。
7. `todo-board?scope=mine` 后端能力（Router + Service）。
8. 新权限点 `workbench:manage`（仅 admin）。

**Out of Scope**

- ❌ 小程序消息中心页 / C 端站内信（D-05；C 端 3 个事件本期仅落 `notification_delivery_logs` 审计）
- ❌ 邮件/短信/Web Push
- ❌ SSE/WebSocket 实时推送（MVP：SWR 轮询 30s + 窗口聚焦刷新）
- ❌ 通知模板编辑器 / 多语言
- ❌ 工作台拖拽自由布局（只做「显示/隐藏 + 上下移动 + 重置」）

---

## 2. 目标与成功指标

| # | 指标 | 目标 | 度量 |
|---|------|------|------|
| G1 | 站内信可见时延 | 事件成功后 ≤ 2s | E2E 打点：emit 返回 → `GET /notifications` 命中 |
| G2 | 未读数一致性 | 列表 / 角标 / 已读操作后 100% 一致 | E2E 断言 `unread-count == 列表中 unread 条数` |
| G3 | 跨用户隔离 | 0 泄漏 | 专项用例：A 读 B 的通知 ID → 404 |
| G4 | 通知去重 | 同一 `dedupe_key` 只产生 1 条通知、1 条收件记录 | 单测 + E2E 重复触发 |
| G5 | 角色布局差异 | 三角色默认可见 widget 集合不同 | 后端返回快照断言 + Playwright |
| G6 | 权限不扩张 | 布局 JSON 写入无权 widget 时后端不返回 | 单测 `test_workbench_filters_unauthorized_widget` |
| G7 | 工作台首屏 | P95 ≤ 现状 + 20% | 前后各 20 次采样（本地 `curl -w %{time_total}`） |
| G8 | 现有微信零回归 | 6 个入口行为不变 | §7.3 冒烟脚本 |

---

## 3. 关键口径收口（K1–K18）

| # | 决策 | 实施口径 |
|---|------|---------|
| **K1** | 事实源 | **站内信是唯一事实源**；微信是 best-effort 渠道。任何渠道失败都不得回滚业务、不得让 API 失败。 |
| **K2** | 触发时机 | 必须在业务事务 **commit 之后** emit。Service 层在 `db.commit()` 后调用；禁止事务内发。 |
| **K3** | 收件人最小化 | 禁止默认全员广播。`audience` 必须显式（`user_ids` / `role_codes` / `permission_codes` 之一非空），否则 `ValueError`。 |
| **K4** | 去重 | `dedupe_key` 唯一（DB unique）；重复 emit 返回既有通知，**不重复插收件人**（`ON CONFLICT DO NOTHING`）。`dedupe_key` 为空则不去重（仅适用于一次性系统告警，需 `notes` 说明）。 |
| **K5** | 偏好粒度 | 按 `category × channel`（`in_app` / `wechat`）两级开关。`system`、`security` 两类**不可关闭站内信**（后端强制忽略关闭请求）。默认全开（`true`），使行为与现状一致。 |
| **K6** | 站内信范围 | 仅 B 端事件（`lead/project/growth/key/finance/system/security`）。C 端事件（`marketing.*`、`lead.eval_price_changed`）**不建收件记录**，只写 `notification_delivery_logs` 审计。 |
| **K7** | 用户隔离 | 所有查询强制 `notification_recipients.user_id = current_user.id`，**在 SQL 层**（不是取回后过滤）。按 `notification_id` 单条操作时必须先校验收件关系，否则 404（不用 403，避免探测）。 |
| **K8** | 已读幂等 | `POST /{id}/read` 重复调用返回 200 + 同一响应；`read_at` 只写首次（`WHERE read_at IS NULL`）。 |
| **K9** | 保留策略 | `NOTIFICATION_RETENTION_DAYS=180`。清理策略：删除 `read_at IS NOT NULL` 且通知 `created_at < cutoff` 的收件行，再删除无收件行的通知。每日守护线程执行（复用 `main.py` 既有 `bd-archive-cleanup` 线程模式）。 |
| **K10** | API 前缀 | `/api/v1/notifications/*`（`API_V1_PREFIX` + 无额外前缀）。工作台：`/api/v1/admin/workbench/*`。**不复用** `/admin/settings` 路径前缀。 |
| **K11** | 布局来源优先级 | 用户覆盖（`user_preferences` ns=`workbench.layout`）→ 角色默认（`system_configs` key=`workbench_role_layouts`）→ 代码 fallback（`WORKBENCH_ROLE_DEFAULTS`）。三级都必须过权限过滤。 |
| **K12** | 角色默认布局存储 | `system_configs` 单键 JSON，`{"version":1,"roles":{"admin":[{...}],"operator":[...],"user":[...]}}`。缺行/损坏 JSON → 回退代码 fallback（不抛错）。 |
| **K13** | 用户覆盖存储 | `user_preferences(user_id, namespace='workbench.layout')`，`value = {"version":1,"widgets":[{"key","order","enabled"}]}`。 |
| **K14** | 布局字段 | 只存 `key / order / enabled`。**span 由前端注册表决定**（避免布局 JSON 破坏栅格）。`order` 整数，间隔 10，后端按 `order ASC, key ASC` 稳定排序。 |
| **K15** | 权限硬门控 | 后端按 `PermissionService.get_user_permission_codes` 过滤（widget 声明 `permission` 且用户无该码 → 剔除）；前端 `<HasPermission>` 二次兜底。**布局永远不能授予权限**。 |
| **K16** | 未知 key | 布局中出现未注册 widget key → 后端丢弃 + `logger.warning`；不报错（防版本回退后崩溃）。 |
| **K17** | 双写开关 | `NOTIFICATION_DUAL_WRITE=true`：3 个员工侧微信入口旁路写站内信。`false`：完全不写（读能力保留）。改造方式：**在原函数体尾部追加 `try/except` 旁路调用**，不修改原发送逻辑。 |
| **K18** | 微信模板缺失 | 模板未配置（`resolve_template_id` 空）→ 渠道 `status='skipped'` + `error_code='TEMPLATE_MISSING'`；偏好页微信开关置灰并提示，不允许用户打开。 |

---

## 4. 设计

### 4.1 数据模型（迁移 v81 / v82）

> **DDL 必须与 ORM 逐列一致**（迭代一 `test_migration_model_parity` 强制）。下列 DDL 为 `notifications` 用 `BaseModel`（UUID + created_at + updated_at）、另两表用 `Base` + BIGSERIAL。

#### v81 `create_notification_tables`（kind=schema, risk=A, backup=none, reversible=true）

```sql
CREATE TABLE IF NOT EXISTS notifications (
    id            UUID         PRIMARY KEY,
    category      VARCHAR(30)  NOT NULL,
    type          VARCHAR(60)  NOT NULL,
    title         VARCHAR(200) NOT NULL,
    body          VARCHAR(500),
    action_type   VARCHAR(20),
    action_url    VARCHAR(500),
    payload       JSONB,
    priority      VARCHAR(10)  NOT NULL DEFAULT 'normal',
    dedupe_key    VARCHAR(200),
    source_module VARCHAR(30),
    source_id     VARCHAR(64),
    created_by    VARCHAR(36),
    expires_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL,
    updated_at    TIMESTAMPTZ  NOT NULL,
    CONSTRAINT uq_notifications_dedupe_key UNIQUE (dedupe_key),
    CONSTRAINT ck_notifications_priority CHECK (priority IN ('low','normal','high','urgent'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_category_created ON notifications (category, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_recipients (
    id              BIGSERIAL    PRIMARY KEY,
    notification_id UUID         NOT NULL,
    user_id         VARCHAR(36)  NOT NULL,
    read_at         TIMESTAMPTZ,
    archived_at     TIMESTAMPTZ,
    delivery_status JSONB,
    created_at      TIMESTAMPTZ  NOT NULL,
    CONSTRAINT uq_notification_recipients_pair UNIQUE (notification_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_notification_recipients_user_unread
    ON notification_recipients (user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notification_recipients_user_created
    ON notification_recipients (user_id, id DESC);

CREATE TABLE IF NOT EXISTS notification_delivery_logs (
    id              BIGSERIAL    PRIMARY KEY,
    notification_id UUID         NOT NULL,
    user_id         VARCHAR(36)  NOT NULL,
    channel         VARCHAR(20)  NOT NULL,
    status          VARCHAR(20)  NOT NULL,
    error_code      VARCHAR(50),
    error_message   VARCHAR(500),
    attempt         INTEGER      NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ  NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_logs_notification
    ON notification_delivery_logs (notification_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_logs_created
    ON notification_delivery_logs (created_at DESC);
```

> **C 端事件**（K6）没有 `notifications` 行 → `notification_delivery_logs.notification_id` 允许指向「审计占位通知」存在吗？**不允许**破坏逻辑。C 端审计复用同一表但 `notification_id` 用 `uuid4()` 值 + `status` 记录，注释写明「C 端审计专用，无对应 notifications 行」。这是本表唯一逻辑外键例外，实现时必须写注释。

#### v82 `create_user_preferences_table`（kind=schema, risk=A, backup=none, reversible=true）

```sql
CREATE TABLE IF NOT EXISTS user_preferences (
    id         UUID        PRIMARY KEY,
    user_id    VARCHAR(36) NOT NULL,
    namespace  VARCHAR(50) NOT NULL,
    value      JSONB       NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_user_preferences_user_ns UNIQUE (user_id, namespace)
);
```

#### v83 `seed_workbench_manage_permission`（kind=seed, risk=B, backup=none, reversible=false）

幂等插入权限点（`_PERMISSIONS_SEED` 追加 + 迁移内 `WHERE NOT EXISTS`）：

| code | name | module | category | sort_order | description |
|------|------|--------|----------|-----------:|-------------|
| `workbench:manage` | 管理工作台布局 | `workbench` | `api` | 10 | 管理角色默认工作台布局（仅 admin） |

并授予 `admin` 角色（`role_permissions` 幂等插入）。**不授予** operator/user。

### 4.2 事件字典（D-04 已决：12 个）

| # | event type | category | 收件人 | 渠道 | dedupe_key 模板 | 触发点（文件:函数） |
|--:|-----------|----------|--------|------|----------------|-------------------|
| 1 | `lead.assigned` | lead | 被分配员工 | 站内(+微信可选) | `lead:{id}:assigned:{user_id}` | `services/leads/core.py`（分配/改派后） |
| 2 | `lead.status_changed` | lead | 线索归属员工 | 站内(+微信) | `lead:{id}:status:{status}` | `services/leads/core.py`（状态变更后） |
| 3 | `customer.new` | growth | 分享归属员工 | 站内+微信 | `customer:{module}:{id}:new:{user_id}` | `services/growth_center/customer_notify.py:143` |
| 4 | `customer.status_changed` | growth | 归属员工 | 站内+微信 | `customer:{module}:{id}:status:{status}` | `services/growth_center/customer_notify.py:168` |
| 5 | `recruit.new_lead` | growth | 推荐员工 | 站内+微信 | `recruit:{lead_id}:new:{user_id}` | `services/recruit/attribution.py:279` |
| 6 | `project.todo_due` | project | 项目业务负责人/团队 | 站内 | `todo:{rule}:{project_id}:{date}:{user_id}` | 待办看板聚合（**本期只在 `my_todos` 打开时按需生成，不做定时任务**） |
| 7 | `project.status_changed` | project | 项目团队 | 站内 | `project:{id}:status:{status}` | `services/projects/core.py`（状态流转后） |
| 8 | `key.share_viewed` | key | 分享人 | 站内 | `key-share:{share_id}:view:{view_id}` | `routers/keys/*`（分享被查看后） |
| 9 | `system.alert` | security | admin | 站内(+微信可选) | `alert:{fingerprint}` | 迭代三 `/api/v1/internal/alerts` |
| 10 | `marketing.published` | marketing | C 端订阅用户 | 仅微信（C 端审计） | `marketing:{id}:published:{user_id}` | `services/marketing/notify.py:537` |
| 11 | `marketing.price_changed` | marketing | C 端订阅用户 | 仅微信（C 端审计） | `marketing:{id}:price:{change_id}:{user_id}` | `services/marketing/notify.py:689` |
| 12 | `lead.eval_price_changed` | lead | 线索提交人（C 端） | 仅微信（C 端审计） | `lead:{id}:eval:{eval_price}` | `services/leads/notify.py:63` |

**MVP 必做（前端有 UI 的）**：#3、#4、#5（双写）+ #1、#2（新埋点）+ #9（迭代三消费）。
**本期只落审计日志的**：#10、#11、#12（C 端，无站内信）。
**延后（写进 backlog，不阻塞验收）**：#6 定时化、#7、#8 —— 事件字典先登记、`EventSpec` 先定义，触发点为 **TODO 注释 + `⚠️未覆盖` 记录**，避免「声明了但没接」。

### 4.3 目录与文件

**后端新增**

```
backend/models/notification/__init__.py
backend/models/notification/notification.py          # Notification / NotificationRecipient / NotificationDeliveryLog
backend/models/user/preference.py                    # UserPreference
backend/schemas/notification.py                      # *Response / *Request
backend/schemas/workbench.py
backend/services/notification/__init__.py
backend/services/notification/events.py              # EventType + EVENT_SPECS
backend/services/notification/recipients.py          # 收件人解析
backend/services/notification/preferences.py          # 偏好读写 + 默认值 + 关闭校验
backend/services/notification/service.py             # emit / list / unread / read / read_all
backend/services/notification/channels.py            # in_app + wechat 适配器
backend/services/notification/cleanup.py             # 保留策略清理
backend/services/system/workbench_layout.py          # 角色默认 + 用户覆盖 + 权限过滤
backend/routers/notification.py
backend/routers/workbench.py
backend/migrations/notification_tables.py            # v81/v82/v83 的实现（由 registry 登记）
```

**后端修改**

```
backend/migrations/registry.py                        # 追加 v81/v82/v83
backend/migrations/_seeds.py                          # 追加 workbench:manage
backend/models/__init__.py / models/user/__init__.py  # 导出
backend/main.py                                       # 挂载 2 个 router + 清理守护线程
backend/settings.py                                   # NOTIFICATION_*/WORKBENCH_* 字段
backend/services/growth_center/customer_notify.py      # K17 旁路双写（尾部追加）
backend/services/recruit/attribution.py                # K17 旁路双写
backend/services/leads/notify.py                       # C 端审计（仅 delivery_logs）
backend/services/projects/todo_board.py                # scope=mine
backend/routers/projects/core.py                       # todo-board 新增 scope 参数
frontend/src/lib/auth/permissions.ts                   # PATH_PERMISSION_MAP 插入
frontend/src/lib/admin-nav-data.ts                     # （可选）不新增菜单项，见 K10 说明
```

**前端新增**

```
frontend/src/app/(main)/admin/notifications/page.tsx
frontend/src/app/(main)/admin/notifications/preferences/page.tsx
frontend/src/app/(main)/admin/notifications/_components/{notification-list,notification-item,unread-badge,preference-form,notification-bell}.tsx
frontend/src/app/(main)/admin/_lib/notifications-data.ts
frontend/src/app/(main)/admin/_lib/workbench-config.ts
frontend/src/app/(main)/admin/settings/workbench/page.tsx       # 角色默认布局管理（admin）
frontend/src/lib/workbench-widgets.ts                            # widget 注册表
frontend/src/app/(main)/admin/_components/widgets/{growth-overview-card,finance-summary-card,audit-summary-card,my-projects-card,my-todos-card}.tsx
frontend/e2e/admin-notifications.spec.ts
frontend/e2e/workbench-role-layout.spec.ts
```

### 4.4 `NotificationService` 契约

```python
# services/notification/service.py
class NotificationService:
    """统一通知服务：事件 → 收件人 → 站内信 + 微信（best-effort）."""

    def __init__(self, db: Session) -> None: ...

    def emit(self, event: NotificationEvent) -> EmitResult:
        """创建通知并投递（调用方必须在业务事务 commit 之后调用）.

        Args:
            event: 事件对象（type + payload + audience + dedupe_key 由 EVENT_SPECS 生成）

        Returns:
            EmitResult(notification_id, created: bool, recipients: int, skipped: int)

        Raises:
            ValueError: audience 为空 / 未知事件类型 / dedupe 模板占位符未填充
        """

    def list_for_user(self, user_id: str, *, filter: NotificationFilter,
                      page: int, page_size: int) -> tuple[list[NotificationListItem], int]: ...

    def unread_count(self, user_id: str) -> UnreadCountResponse: ...

    def mark_read(self, user_id: str, notification_id: uuid.UUID) -> NotificationReadResponse: ...

    def mark_all_read(self, user_id: str, *, category: str | None = None) -> MarkAllReadResponse: ...
```

```python
# services/notification/events.py
class EventType(StrEnum):
    LEAD_ASSIGNED = "lead.assigned"
    ...
    LEAD_EVAL_PRICE_CHANGED = "lead.eval_price_changed"


@dataclass(frozen=True, slots=True)
class EventSpec:
    type: EventType
    category: str                 # lead/project/growth/marketing/key/finance/system/security
    priority: Literal["low", "normal", "high", "urgent"]
    in_app: bool                  # 是否建站内信（K6）
    wechat: bool                  # 是否尝试微信
    dedupe_template: str          # "customer:{module}:{id}:new:{user_id}"
    title_template: str           # "新客户线索：{module_label}"
    body_template: str | None
    action_type: Literal["route", "miniapp", "none"]
    action_template: str | None
    closeable: bool               # False → 用户不可关闭站内信（system/security）


EVENT_SPECS: dict[EventType, EventSpec] = {...}
```

```python
# services/notification/recipients.py
@dataclass(frozen=True, slots=True)
class Audience:
    user_ids: tuple[str, ...] = ()
    role_codes: tuple[str, ...] = ()
    permission_codes: tuple[str, ...] = ()


def resolve_recipients(db: Session, audience: Audience) -> list[str]:
    """并集去重；空 audience → ValueError（K3）；返回用户 id 列表，按 id 排序保证幂等."""
```

**emit 内部流程（伪代码）**

```
spec = EVENT_SPECS[event.type]
dedupe = spec.dedupe_template.format(**event.dedupe_fields)
title  = spec.title_template.format(**event.fields)
users  = resolve_recipients(db, event.audience)              # K3
prefs  = load_preferences(db, users)                         # 批量，缺行 = 默认全开
users_for_in_app = [u for u in users if spec.in_app and prefs[u].allow(spec.category, "in_app")]
if spec.in_app and users_for_in_app:
    notif, created = upsert_notification(...)                # ON CONFLICT (dedupe_key) DO NOTHING RETURNING
    insert_recipients(notif.id, users_for_in_app)            # ON CONFLICT DO NOTHING
db.commit()                                                  # 站内信先落地
for u in users:
    if spec.wechat and prefs[u].allow(spec.category, "wechat"):
        status, code, msg = send_wechat(u, spec, event)       # 全异常捕获
        log_delivery(notif_id_or_placeholder, u, "wechat", status, code, msg)
db.commit()
return EmitResult(...)
```

**硬约束**：整个 `emit` 被调用方包在 `try/except Exception: logger.exception(...)` 中（旁路绝不能影响主流程）；`emit` 内部也不得抛给调用方（除 `ValueError` 这类编程错误，且调用方已 catch）。

### 4.5 API 契约

| 方法 | 路径 | 请求 | 响应 | 权限 |
|------|------|------|------|------|
| GET | `/api/v1/notifications` | `?page&page_size&unread=true&category=lead&priority=high` | `NotificationListResponse{items[], total, page, page_size, unread_total}` | 登录（`CurrentActiveUserDep`），仅自己 |
| GET | `/api/v1/notifications/unread-count` | — | `{"total":12,"by_category":{"lead":5,"growth":7}}` | 登录 |
| POST | `/api/v1/notifications/{id}/read` | — | `{"id":"...","read_at":"..."}`（幂等） | 仅收件人，否则 404 |
| POST | `/api/v1/notifications/read-all` | `?category=lead`（可选） | `{"affected":7}` | 登录 |
| GET | `/api/v1/notifications/preferences` | — | `{"categories":{"lead":{"in_app":true,"wechat":true,"in_app_locked":false}},"wechat_available":true}` | 登录 |
| PUT | `/api/v1/notifications/preferences` | `NotificationPreferencesUpdateRequest` | 同上 | 登录 |
| GET | `/api/v1/admin/workbench/config` | — | `{"source":"user\|role\|fallback","widgets":[{"key","order","enabled"}]}` | 后台身份 |
| PUT | `/api/v1/admin/workbench/config` | `WorkbenchLayoutUpdateRequest` | 同上（`source="user"`） | 后台身份 |
| DELETE | `/api/v1/admin/workbench/config` | — | 同上（回退后 `source` 为 role/fallback） | 后台身份 |
| GET | `/api/v1/admin/workbench/role-layouts` | — | `{"roles":{"admin":[...],"operator":[...],"user":[...]},"widgets":[{key,label,description,permission,default_span}]}` | `workbench:manage` |
| PUT | `/api/v1/admin/workbench/role-layouts` | `WorkbenchRoleLayoutsUpdateRequest` | 同上 | `workbench:manage` |

**Response schema 关键字段**

```python
class NotificationListItem(BaseModel):
    id: uuid.UUID
    category: str
    type: str
    title: str
    body: str | None
    action_type: str | None
    action_url: str | None
    priority: Literal["low", "normal", "high", "urgent"]
    read_at: datetime | None
    created_at: datetime
    payload: dict[str, Any] | None = None      # 前端需要时下发（默认不含敏感字段）


class NotificationPreferencesUpdateRequest(BaseModel):
    """分类 × 渠道开关全量提交；未列出的分类保持默认全开."""

    categories: dict[str, dict[str, bool]]     # {"lead": {"in_app": true, "wechat": false}}
```

**错误语义**

- 未知 `category` 过滤值 → 422（Pydantic `Literal`）。
- 标记他人通知 → 404 `{"code": 40400, "message": "通知不存在"}`（K7）。
- 关闭 `system`/`security` 站内信 → 400 `{"code": 40001, "message": "系统与安全通知不可关闭"}`。
- 布局提交未注册 key → 丢弃（K16），响应只回有效项，不报错。

### 4.6 前端消息中心

| 项 | 实施口径 |
|----|---------|
| 铃铛入口 | `app-sidebar.tsx` 的 `SidebarFooter` 内、折叠按钮之下、用户头像之上；折叠态只显示图标（无文字）。移动端：`components/admin-mobile-tab-bar.tsx` 对应位置 |
| 角标 | `unread-count` 的 `total`；>99 显示 `99+`；0 时隐藏（不显示 0） |
| 抽屉 | `Popover`（桌面）/ `Sheet`（移动），最近 10 条 + 分类 tabs（全部/线索/获客/项目/系统）+「全部已读」+「查看全部」 |
| 独立页 | `/admin/notifications`：筛选（未读/分类/优先级）+ 分页（默认 20）+ 单条已读 + 全部已读 + 点击按 `action_type` 跳转 |
| 偏好页 | `/admin/notifications/preferences`：分类 × 渠道开关网格；`system/security` 的 in_app 开关 disabled + 说明；`wechat_available=false` 时微信列整列 disabled + 「先绑定微信」提示 |
| 刷新 | SWR `refreshInterval: 30000`、`revalidateOnFocus: true`、`focusThrottleInterval: 30000`；已读用乐观更新 + 失败 `mutate()` 回滚 |
| 样式 | Steep 令牌（`bg-fog` / `rounded-cards` / `shadow-steep` / `text-ink` / `text-graphite`）；不新增视觉体系，不改 `components/ui/**` |
| 空态 | 「暂无消息」+ 图标；加载态用 `Skeleton`（复用 `ui/skeleton`） |
| 无障碍 | 铃铛 `aria-label="消息"` + `aria-live="polite"` 角标；抽屉 `role="dialog"` |

**路由权限映射（B3 纠偏，必须按此顺序插入）**

```ts
// frontend/src/lib/auth/permissions.ts —— 插在既条目中的相对位置（关键！）
// ① 必须在 "/admin/settings" 之前：否则被 api_key:manage 拦截
{ prefix: "/admin/settings/workbench", permission: PERMISSION_CODES.WORKBENCH_MANAGE },
// ② 不设守卫：所有后台登录用户可访问自己的消息
//    （不写条目 = hasPathPermission 返回 true）
// /admin/notifications 与 /admin/notifications/preferences 故意不登记
```

并在 `PERMISSION_CODES` 增加 `WORKBENCH_MANAGE: "workbench:manage"`；在 `permissions.test.ts` 增加断言：

```ts
expect(hasPathPermission("/admin/settings/workbench", ["workbench:manage"])).toBe(true);
expect(hasPathPermission("/admin/settings/workbench", ["api_key:manage"])).toBe(false);
expect(hasPathPermission("/admin/notifications", [])).toBe(true);
```

### 4.7 角色化工作台

#### 组件注册表（D-06 已决，12 个 widget）

| key | label | 权限 | 默认 span | admin | operator | user | 数据源（已存在则标注） |
|-----|-------|------|:---------:|:-----:|:--------:|:----:|----------------------|
| `project_overview` | 项目总览 | `project:read` | 3 | ✅ | ✅ | — | `GET /api/v1/projects/stats` ✅ |
| `leads_funnel` | 线索漏斗 | `lead:read` | 3 | ✅ | ✅ | — | `GET /api/v1/leads/stats/funnel` ✅ |
| `alert_card` | 待评估提醒 | `lead:write` | 3 | ✅ | ✅ | — | 同上（`total`） ✅ |
| `todo_board_summary` | 项目待办 | `project:read` | 3 | ✅ | ✅ | — | `GET /api/v1/projects/todo-board` ✅ |
| `growth_overview` | 获客总览 | `recruit:read` | 6 | ✅ | ✅ | — | `GET /api/v1/admin/growth-center/overview/kpi` ✅ |
| `finance_summary` | 资金概览 | `ledger:read` | 6 | ✅ | — | — | `GET /api/v1/admin/ledger/stats` ✅ |
| `audit_summary` | 审计概览 | `operation_log:read` | 6 | ✅ | — | — | `GET /api/v1/operation-logs?page=1&page_size=1` ✅ |
| `monitor_projects` | 重点监控项目 | `project:read` | 12 | ✅ | ✅ | — | `GET /api/v1/projects`（现状逻辑） ✅ |
| `leads_table` | 最近线索 | `lead:read` | 12 | ✅ | ✅ | — | `GET /api/v1/leads` ✅ |
| `quick_entry` | 快捷入口 | 按子项过滤 | 12 | ✅ | ✅ | ✅ | 现状 `QuickEntrySection` ✅ |
| `my_projects` | 我负责的项目 | （登录 + 业务身份） | 12 | — | — | ✅ | `GET /api/v1/projects/my-responsible` ✅ |
| `my_todos` | 我的待办 | （登录；`all` 需 `project:read`） | 12 | — | — | ✅ | `GET /api/v1/projects/todo-board?scope=mine` 🆕 |

**默认可见数**：admin **10** / operator **7** / user **3**（覆盖计划稿的粗略 9/6/3，以本表为准）。

#### 布局 JSON

```json
{
  "version": 1,
  "widgets": [
    { "key": "project_overview", "order": 10, "enabled": true },
    { "key": "leads_funnel", "order": 20, "enabled": true },
    { "key": "alert_card", "order": 30, "enabled": true },
    { "key": "todo_board_summary", "order": 40, "enabled": true },
    { "key": "growth_overview", "order": 50, "enabled": true },
    { "key": "finance_summary", "order": 60, "enabled": true },
    { "key": "audit_summary", "order": 70, "enabled": true },
    { "key": "monitor_projects", "order": 80, "enabled": true },
    { "key": "leads_table", "order": 90, "enabled": true },
    { "key": "quick_entry", "order": 95, "enabled": true }
  ]
}
```

#### 渲染（RSC + 并行）

```tsx
// frontend/src/app/(main)/admin/page.tsx（重构后核心结构）
export default async function DashboardPage() {
  if (!settings.workbenchLayoutEnabled) return <LegacyDashboard />;   // WORKBENCH_LAYOUT_ENABLED=false
  const layout = await getWorkbenchLayout();      // 服务端取配置（已按权限过滤）
  return (
    <PageContainer>
      <PageHeader title="工作台" ... />
      <HasPermission code={PERMISSION_CODES.PROJECT_READ}>
        <WorkbenchCustomizer widgets={layout.widgets} />   {/* client：显示/隐藏 + 上移下移 + 重置 */}
      </HasPermission>
      <div className="grid grid-cols-12 gap-4 lg:gap-6">
        {layout.widgets.filter(w => w.enabled).map((w) => (
          <Suspense key={w.key} fallback={<WidgetSkeleton span={WIDGETS[w.key].defaultSpan} />}>
            {renderWidget(w.key)}     {/* Server Component，各自取数 */}
          </Suspense>
        ))}
      </div>
    </PageContainer>
  );
}
```

**并行约束（C9）**：每个 widget 的 Server Component 独立取数 + 独立 `Suspense`；**禁止**在页面顶层 `await` 所有数据再分发（会造成瀑布）。共享取数走 `React.cache`（沿用 `dashboard-data.ts` 模式）。

#### `todo-board?scope=mine`（B7 纠偏，后端改动）

```python
# routers/projects/core.py
@router.get("/todo-board")
def get_project_todo_board(
    service: ProjectServiceDep,
    current_user: CurrentActiveUserDep,
    db: DbSessionDep,
    scope: Annotated[Literal["all", "mine"], Query(description="all=全量(需 project:read)；mine=我的业务身份项目")] = "all",
) -> ProjectTodoBoardResponse:
    """项目待办看板；scope=mine 时按业务身份收敛（与 /my-responsible 同口径）."""
    if scope == "all" and not has_permission(current_user, PERMISSION.PROJECT_READ, db):
        raise HTTPException(status_code=403, detail="缺少项目读取权限")   # 走统一错误处理器
    return service.get_todo_board(scope=scope, user_id=str(current_user.id))
```

```python
# services/projects/todo_board.py
def get_board(self, *, scope: Literal["all", "mine"] = "all", user_id: str | None = None) -> ProjectTodoBoardResponse:
    if scope == "mine":
        if not user_id:
            raise ValueError("scope=mine 必须提供 user_id")
        projects = ProjectQueryService(self.db).get_by_business_identity(user_id)   # 复用，禁止重写谓词
    else:
        projects = self._load_projects()
    ...
```

- `facade.get_todo_board(scope=..., user_id=...)` 同步透传。
- **不改变** `scope=all` 的现有行为（权限、返回结构、排序全不变）→ 现有 `test_project_business_permission` / 待办看板测试必须全绿。

### 4.8 双写接入（K17，最小侵入）

以 `services/growth_center/customer_notify.py` 为例，在原函数**末尾**追加：

```python
def notify_new_customer_lead(db: Session, *, module: str, lead_id: int | str, referrer_user_id: str | None, ...) -> None:
    """（原 docstring 不变）"""
    ...  # 原逻辑一行不改

    # ---- 迭代二：站内信旁路双写（best-effort，绝不影响主流程）----
    if not settings.notification_dual_write or not referrer_user_id:
        return
    try:
        NotificationService(db).emit(
            NotificationEvent(
                type=EventType.CUSTOMER_NEW,
                audience=Audience(user_ids=(referrer_user_id,)),
                fields={"module_label": _MODULE_LABELS.get(module, module)},
                dedupe_fields={"module": module, "id": lead_id, "user_id": referrer_user_id},
                action_url="/admin/growth-center/leads",
                payload={"module": module, "lead_id": str(lead_id)},
            ),
        )
    except Exception:
        logger.exception("站内信双写失败（不影响微信通知与业务主流程）：lead_id=%s", lead_id)
```

- `services/recruit/attribution.py:279 notify_new_lead` 同构追加（`EventType.RECRUIT_NEW_LEAD`）。
- `services/leads/notify.py:63 notify_eval_price_changed`：只写 `notification_delivery_logs` 审计（K6），不建收件记录。
- 三个入口的**原逻辑与返回值零改动**；新增代码必须在原函数 `return` 之前且被 `try/except` 包裹。

---

## 5. 任务拆解

| 任务 | 内容 | 估算 | 验证点 |
|------|------|:----:|--------|
| **T2.1** | 迁移 v81/v82/v83 + 4 模型 + 索引 + 权限种子 | 2d | parity 测试绿；`manage status` 见 83；连跑两次幂等 |
| **T2.2** | `EventSpec` 12 条 + `resolve_recipients` + 偏好模块 | 2d | 单测：audience 空→ValueError；role/permission 解析去重 |
| **T2.3** | `NotificationService.emit` + 去重 + 站内信 + delivery_logs | 2d | 单测：重复 dedupe 只 1 条；微信失败不影响站内信 |
| **T2.4** | 6 个消息 API + schemas | 2d | 单测：跨用户 404；已读幂等；read-all 计数 |
| **T2.5** | 双写接入 2 处 + C 端审计 1 处 | 1.5d | 冒烟脚本：3 事件各产 1 条站内信 + 1 条 delivery_log |
| **T2.6a** | workbench 布局服务 + 5 端点 + 权限过滤 | 2d | 单测：三级 fallback；无权 widget 被剔除 |
| **T2.6b** | `todo-board?scope=mine`（Router + Service + facade） | 1d | 既有 todo-board 测试全绿；新用例断言 mine ⊆ all 且只含业务身份项目 |
| **T2.7** | 前端 widget 注册表 + 页面重构 + 定制器 | 3d | tsc/lint 绿；Playwright 角色矩阵 |
| **T2.8** | 前端铃铛/抽屉/消息页/偏好页 | 3d | Playwright `admin-notifications.spec.ts` |
| **T2.9** | 清理守护线程 + 保留策略 | 0.5d | 单测：只删已读且超期；未读保留 |
| **T2.10** | 测试：单测 4 文件 + E2E 1 个 + Playwright 2 个 | 2d | §7 全绿 + 工件归档 |
| **T2.11** | 管理端 `/admin/settings/workbench` + 权限映射 | 1d | 无 `workbench:manage` 用户 403；admin 可编辑 + 预览 |

**合计 ≈ 21.5 人日**（2 后端 + 1 前端 ≈ 3 周）。若砍 `finance_summary` + `audit_summary` + T2.11，可压到 2 周（计划稿同结论）。

**依赖顺序**：T2.1 → T2.2 → T2.3 → T2.4 →（T2.5 ∥ T2.6a ∥ T2.6b）→ T2.9 → 前端 T2.7/T2.8/T2.11 → T2.10。

---

## 6. 权限与安全

| 项 | 要求 |
|----|------|
| 消息读取 | SQL 层强制 `user_id = current_user.id`；单条操作先校验收件关系 |
| 消息写入 | 仅服务端内部调用；**不开放** `POST /notifications` 公共创建端点 |
| 布局管理 | `workbench:manage`（仅 admin）；修改写 `operation_logs`（复用 `OperationLogService`） |
| 布局读取 | 后台登录身份即可读**自己的**生效布局 |
| 敏感字段 | `payload` 不下发手机号/身份证；`title/body` 由模板生成，禁止直接拼接用户输入（防注入/超长） |
| 限流 | `GET /notifications` 与 `unread-count` 使用 `limiter.limit(RateLimits.NOTIFICATION_READ)` 新增限流常量（如 `60/minute`），防止轮询打爆 |
| 审计 | 偏好变更、角色布局变更、`read-all` 写 `operation_logs`（action 命名 `notification.preference.update` / `workbench.role_layout.update`） |

---

## 7. 测试策略

### 7.1 后端单测

| 文件 | 覆盖 |
|------|------|
| `tests/test_notification_service.py` | 事件字典完整性（12 条 + `EVENT_SPECS` 覆盖 `EventType` 全部成员）/ audience 空 ValueError / dedupe 唯一 / 偏好过滤（关闭 in_app 不建收件记录）/ `system` 不可关闭 / 微信失败降级 / 未知 type |
| `tests/test_notification_api.py` | 列表分页 + 筛选 / unread-count 与列表一致 / 单条已读幂等 / 他人通知 404 / read-all 按 category / 偏好读写 + 400 拒绝 / 未登录 401 |
| `tests/test_workbench_config.py` | 三级 fallback / 用户覆盖优先 / 无权 widget 剔除 / 未知 key 丢弃 / 重置回角色默认 / `workbench:manage` 门控 / 角色布局保存幂等 |
| `tests/test_todo_board_scope.py` | `scope=mine` 仅业务身份项目 / `scope=all` 行为不变 / mine 无 project:read 也可访问 / 无业务身份返回空板 |

### 7.2 E2E（后端，`backend/tests/e2e/test_notification_center.py`）

1. 造 2 个员工（A 归属，B 无关）→ 触发 `customer.new` → A 有 1 条，B 有 0 条。
2. 再次触发同 `dedupe_key` → A 仍 1 条（不新增）。
3. A 调 `GET /notifications` 与 `unread-count` → 一致性断言。
4. B 用 A 的通知 ID 调 `read` → 404。
5. A 关闭 `growth.in_app` → 再触发 → 不产生新收件记录，但微信调用仍发生（用 mock/stub 断言）。
6. A 尝试关闭 `system.in_app` → 400。
7. 角色矩阵：admin/operator/user 各调 `GET /admin/workbench/config` → widget 集合与 §4.7 表一致。
8. user 的布局 JSON 手动写入 `finance_summary` → 后端不返回该 widget。

工件：`backend/tests/e2e/artifacts/notification-e2e-YYYYmmdd-HHMMSS.txt`。

### 7.3 微信链路零回归冒烟（必做，归档）

```bash
cd backend && .venv/bin/python tests/e2e/test_wechat_notify_smoke.py
```

覆盖 6 个入口（总纲 §11C 表）：每入口打桩 `send_subscribe_message`，断言「模板未配置 → 跳过」「有 openid → 调用 1 次」「异常不上抛」「双写开关生效/失效各一次」。

### 7.4 前端 Playwright

| spec | 断言 |
|------|------|
| `admin-notifications.spec.ts` | 铃铛角标数字 / 打开抽屉见最近 10 条 / 点单条后角标 -1 / 全部已读后角标消失 / 消息页筛选「未读」生效 / 偏好页关闭某分类后 toast 成功 |
| `workbench-role-layout.spec.ts` | admin 见 `finance_summary`+`audit_summary`，operator 与 user 不见 / user 见 `my_projects`+`my_todos` / 隐藏一个 widget 刷新后仍隐藏 / 「重置」恢复默认 / 无 `workbench:manage` 用户访问 `/admin/settings/workbench` 被拦（页面 403 或重定向） |

---

## 8. 验收标准

| # | 验收项 | 命令/操作 | 预期 |
|---|--------|----------|------|
| A1 | 新表就位 | `manage status --json \| jq '.migrations[] \| select(.version>=81)'` | 3 条 applied（81/82/83） |
| A2 | 新客户线索双写 | 小程序/接口造 1 条招募或客户线索 | 归属员工消息中心出现 1 条；微信仍按原逻辑发送 |
| A3 | 重复触发不重复 | 同事件触发 2 次 | 收件记录 1 条；`notifications` 1 行 |
| A4 | 隔离 | B 请求 A 的通知 ID | 404；A 列表不含 B 的通知 |
| A5 | 未读一致 | 列表 / `unread-count` / 角标 | 三处数字一致；已读后即时 -1 |
| A6 | 偏好生效 | 关闭 `lead` 的 in_app → 触发 `lead.assigned` | 不产生新收件记录；`system/security` 关闭请求 400 |
| A7 | 角色矩阵 | 三角色登录 `/admin` | admin 10 / operator 7 / user 3 个 widget；与 §4.7 表一致 |
| A8 | 权限不扩张 | user 的 `user_preferences` 手写 `finance_summary` | 页面不渲染，后端响应不含该 key |
| A9 | 定制持久 | 隐藏 `alert_card` → 刷新 → 重置 | 刷新后仍隐藏；重置后恢复 |
| A10 | 微信零回归 | §7.3 冒烟脚本 | 全绿 + 工件文件 |
| A11 | 首屏无瀑布 | 代码审查 + 采样 | 每个 widget 独立 `Suspense`；P95 ≤ 基线 × 1.2 |
| A12 | 开关降级 | `WORKBENCH_LAYOUT_ENABLED=false` 重启 | `/admin` 回到当前单套仪表盘，无报错 |
| A13 | 测试全绿 | §7 命令 | 全绿 + 3 类工件文件存在 |

---

## 9. 风险与回滚

| 风险 | 症状 | 缓解 |
|------|------|------|
| 通知洪泛 | 用户忽略全部消息 | K3 收件人最小化 + dedupe + 偏好默认只开高价值（本期默认全开但事件仅 3 个双写入口）→ 观察一周后按需收窄 |
| 跨用户泄漏 | 严重隐私事故 | K7 SQL 层过滤 + A4/A8 专项用例 + code review checklist 必查 `user_id` |
| 双写重复 | 同一事件两条站内信 | dedupe unique + E2E A3 |
| 微信配额/模板问题 | 发送失败 | 站内信兜底（K1）；`skipped` + `TEMPLATE_MISSING` 日志；偏好页置灰（K18） |
| 工作台 N+1 / 瀑布 | 首屏变慢 | 每 widget 独立 Suspense；共享数据 `React.cache`；禁止顶层 `await` 串行 |
| 布局误配致关键卡片消失 | 用户看不到待办 | 后端 fallback + K16 丢弃未知 key + 「重置」入口 + 管理端预览 |
| `PATH_PERMISSION_MAP` 插入位置错误 | `/admin/settings/workbench` 被 `api_key:manage` 拦截 | B3：手工插入到 `/admin/settings` 之前 + 3 条单测断言 |
| `todo-board` 改动回归 | 现有看板权限/数据变化 | T2.6b 明确 `scope` 默认 `all`，既有测试必须全绿 |
| 清理线程删错 | 未读消息丢失 | K9 只删「已读且超期」；单测 + 先 dry-run 脚本跑一次统计 |

**回滚**

1. `NOTIFICATION_DUAL_WRITE=false` → 停止写入（读能力保留，页面仍可用）。
2. `WORKBENCH_LAYOUT_ENABLED=false` → `/admin` 回落到 v0 单套布局（`LegacyDashboard` 保留一个 release）。
3. 完全回退：前端下线入口（侧边栏铃铛 + 路由返回 404 页）；后端保留表（无业务侵入）。
4. 数据清理：`notifications` 三表可整表 `TRUNCATE`（不影响业务），需走迭代一 `manage compensate 81` 而非手工 DDL。

---

## 10. 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `NOTIFICATION_DUAL_WRITE` | `true` | 现有微信链路是否双写站内信（K17） |
| `NOTIFICATION_RETENTION_DAYS` | `180` | 站内信保留天数（K9） |
| `NOTIFICATION_CLEANUP_ENABLED` | `true` | 清理守护线程开关 |
| `NOTIFICATION_PAGE_SIZE_MAX` | `100` | 消息列表单页上限（防 `page_size=10000`） |
| `WORKBENCH_LAYOUT_ENABLED` | `true` | 角色工作台开关（回退用） |
| `WORKBENCH_ROLE_LAYOUTS_KEY` | `workbench_role_layouts` | `system_configs` 键名（便于测试隔离） |

---

## 11. 交付物

- 迁移 v81/v82/v83 + 4 模型 + 13 个后端新文件（§4.3）
- 6 + 5 = 11 个 API 端点 + `todo-board?scope=mine`
- 前端 13 个新文件 + `page.tsx` 重构 + `permissions.ts` 映射
- 4 个后端单测 + 1 个 E2E + 1 个冒烟脚本 + 2 个 Playwright spec
- `docs/Done/2026-XX-XX-迭代二验收报告.md`
- `.env.docker.example` 新增 6 个变量

---

## 12. ⚠️ 未覆盖 / 不确定（Fail Loud）

1. **⚠️ 事件 #6/#7/#8 本期不接触发点**（`project.todo_due` / `project.status_changed` / `key.share_viewed`）：`EventSpec` 已登记，触发点留 TODO + backlog。验收不要求，但**不得**在文档中宣称已覆盖。
2. **⚠️ `alert_card` 权限沿用 `lead:write`**（与现状 `page.tsx` 一致）。若产品要求 operator 也能看，需改权限并同步 `PATH_PERMISSION_MAP` 与角色种子——属口径变更，走总纲 §10。
3. **⚠️ `/admin/operation-logs` 实际路由为 `/admin/audit-logs`**：`audit_summary` widget 的数据源确认为 `GET /api/v1/operation-logs`，但前端跳转目标必须是 `/admin/audit-logs`（实现时核对一次）。
4. **⚠️ 移动端 header 铃铛落位未确定**：`admin-mobile-tab-bar.tsx` 是否容纳铃铛需前端在 T2.8 首次实现时确认；若空间不足，降级为「消息页入口放在 tab bar 的第 5 个 tab」并记录偏差。
5. **⚠️ `my_todos` 的 `project.todo_due` 预警未做**：本期只展示当前待办，不产生「到期提醒」站内信。与 #1 同源。
6. **⚠️ 清理策略未覆盖 `notification_delivery_logs`**：本期 delivery_logs 不清理（用于迭代三排障），若体积增长需在迭代三后追加保留策略。
