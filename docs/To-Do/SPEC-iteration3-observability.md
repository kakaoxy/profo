# SPEC · 迭代三：Prometheus 指标 + 慢查询告警（实施版）

> **状态**：实施依据（S3）｜撰写 2026-10-17｜module id：`iter3-observability`
> **上游**：`docs/To-Do/2026-10-17-三迭代-SPEC-index.md`（C1–C9、D-07/D-08/D-09/D-10）
> **计划稿**：`docs/To-Do/2026-10-17-后续三迭代计划.md` §5
> **依赖**：迭代一（迁移指标消费注册表）；迭代二**弱依赖**（告警写站内信，失败降级为纯 webhook）
> **纠偏**：总纲 §1 的 B5（Dockerfile 无 `ENTRYPOINT`）、B6（`request_id_var` 在 `main.py`）

---

## 1. 定位与范围

### 1.1 一句话定位

以最小依赖接入 Prometheus：覆盖 **HTTP / DB / 连接池 / 迁移 / 通知** 五类指标 + 慢查询日志与计数，配 7 条告警规则；`/metrics` 只在内网可达，`METRICS_ENABLED=false` 可整层关闭。

### 1.2 现状（已核对代码）

| 事实 | 证据 | 后果 |
|------|------|------|
| 274 个路径（多 router 注册） | `main.py` L381–L420 连续 `include_router` | 无法回答「哪个接口最慢」 |
| 2 worker | `Dockerfile` `ENV WEB_CONCURRENCY=2` | 指标必须 multiprocess，否则减半 |
| 健康检查只有进程/DB 连通 | `main.py:369 /health` 恒返回 `healthy` | 不反映业务健康 |
| 连接池 `QueuePool(10, max_overflow=20)` | `db.py` | 打满即全站排队，当前无指标 |
| 无慢查询监听 | 全仓无 `before_cursor_execute` | 只能靠 `pg_stat_activity` 人工捞 |
| 无 prometheus 依赖 | `pyproject.toml` 无 `prometheus-client` | 无时间序列 |
| 请求 ID 已就绪 | `main.py::request_id_var`（**仅 `main.py` 3 处引用**） | 慢查询日志可关联请求，但需抽到 `utils/` 避免循环依赖 |
| 已有守护线程范式 | `main.py::_bd_archive_daily_cleanup`（`threading.Thread(daemon=True)`） | 连接池采集器直接复用该模式 |
| 端口未公网暴露 | `docker-compose.yml` `127.0.0.1:8000:8000`（仅宿主 nginx 可达） | `/metrics` 天然非公网；nginx 侧再兜一层 |

### 1.3 范围

**In Scope**

1. `prometheus-client` 依赖 + multiprocess 模式（含 entrypoint 目录清理）。
2. HTTP 指标中间件（请求数 / 延迟直方图 / 进行中 / 异常）。
3. SQLAlchemy 事件监听（耗时直方图 / 慢查询计数 / 慢查询日志 / `source` 标记）。
4. 连接池指标（后台线程 15s 采集）。
5. 迁移指标（消费迭代一注册表与执行结果）。
6. 通知指标（消费迭代二 `NotificationService`）。
7. `deploy/observability/**`：`prometheus.yml`、`alerts.yml`、`alerts.test.yml`、`alertmanager.yml`、`docker-compose.observability.yml`（profile `observability`）。
8. `POST /api/v1/internal/alerts`（Alertmanager → 站内信，API Key 鉴权，T3.7 可选但本期实现）。
9. nginx `/metrics` 加固片段 + 公网隔离验收。
10. `docs/Base/observability-runbook.md`。

**Out of Scope**

- ❌ OpenTelemetry / Tracing / APM
- ❌ Loki / ELK 日志聚合
- ❌ 全量业务指标治理（只做最小集）
- ❌ Grafana 托管看板（提供可选基础 JSON，默认不启）
- ❌ `pg_stat_statements`（D-10，写入 runbook「后续」）
- ❌ 为 274 个 API 逐个定义 SLO

---

## 2. 目标与成功指标

| # | 指标 | 目标 | 度量 |
|---|------|------|------|
| G1 | 路由覆盖率 | 100% 已注册路由有 `route` 模板标签；未命中归 `unmatched` | 遍历 `app.routes` 断言每条 `path` 都能作为 label 出现（含 1 次真实请求） |
| G2 | 多 worker 正确性 | 2 worker 聚合值 = 实际请求数 | 对 `/` 打 100 次 → `sum(profo_http_requests_total{route="/"})` == 100 |
| G3 | 慢查询捕获 | 超阈值 SQL 100% 记日志 + 计数（不抽样） | 注入 `SELECT pg_sleep(1)` → 计数 +1、日志命中 |
| G4 | 告警时效 | 关键告警 ≤10 分钟；宕机 ≤2 分钟 | `for:` 配置 + 演练 |
| G5 | 安全性 | 公网 `/metrics` 返回 404/403 | `curl https://fangmengchina.com/metrics` |
| G6 | 开销 | P95 增幅 < 5%；内存增幅 < 50MB | 前后各 3 轮 `hey -n 2000 -c 20` 对比 + `docker stats` |
| G7 | 可验证 | `promtool check rules` + `promtool test rules` 通过 | CI/本地脚本 |

---

## 3. 关键口径收口（K1–K18）

| # | 决策 | 实施口径 |
|---|------|---------|
| **K1** | multiprocess 判定 | 若 `PROMETHEUS_MULTIPROC_DIR` 已设置且可写 → 走 multiprocess（生产 2 worker）；否则默认单进程 registry（开发 `--reload`）。判定必须在**创建任何 instrument 之前**完成（模块 import 期读 env）。 |
| **K2** | 目录生命周期 | entrypoint 在 exec uvicorn **之前** `rm -rf && mkdir -p`（B5 纠偏：现 Dockerfile 无 ENTRYPOINT，必须新增 `docker-entrypoint.sh`）。worker 不得清理目录。 |
| **K3** | Gauge multiprocess 语义 | 所有 `Gauge` 必须显式 `multiprocess_mode`：请求进行中用 `livesum`、连接池用 `livesum`、`profo_app_info` 用 `max`（避免 2 worker 变 2）。 |
| **K4** | 禁用的 instrument 类型 | 不用 `Info` / `Enum` / `Summary`（multiprocess 不支持或有风险）。应用信息用 `Gauge`。 |
| **K5** | `route` 标签 | 只取 `scope["route"].path` 模板（FastAPI 已写入）；无 route → `"unmatched"`。**禁止**原始路径、query、`user_id`、手机号。 |
| **K6** | 排除路径 | `/metrics`、`/static/*`、`/health` 不计入 HTTP 指标（`up{}` 与外部探针覆盖）。`/` **计入**（用于 G2 验证）。 |
| **K7** | 状态码 | 记录真实值（`200/400/401/403/404/409/422/429/500/502/503`）；异常路径记 `500`（无响应对象时）。 |
| **K8** | `operation` 标签 | SQL 首关键字大写（`SELECT/INSERT/UPDATE/DELETE/ALTER/CREATE/DROP/COPY/WITH/其他`），白名单外归 `OTHER`。`source` 取 `request/migration/background/other`（contextvar，默认 `background`）。 |
| **K9** | 慢查询阈值 | `SLOW_QUERY_THRESHOLD_MS=500`（D-09）；`>=` 判定（恰好 500ms 也算）。 |
| **K10** | 慢查询日志脱敏 | SQL 去换行/折叠空白、截断 `SLOW_QUERY_LOG_SQL_MAX_LEN=500`、多语句只取首段（按 `;`）、**绝不记录 parameters**；日志带 `duration_ms/operation/source/route/request_id`。 |
| **K11** | 连接池采集 | 后台 daemon 线程，间隔 `DB_POOL_METRICS_INTERVAL_SECONDS=15`；每次采集先 `engine.pool.status()` 兜底异常（`pool disposed` 时跳过）；线程在 `lifespan` 启动、随进程退出。 |
| **K12** | 迁移指标 | 只对**实际执行**的迁移计数（advisory lock 下其他 worker 的 no-op 不计）→ 由迭代一执行器在 `_apply_one` 成功/失败分支打点。标签 `status=applied|failed`、`migration=v{version:03d}`。 |
| **K13** | 通知指标 | `profo_notifications_total{category,channel,status}`，在 `NotificationService` 写 `delivery_logs` 的同一分支打点。`METRICS_ENABLED=false` 时指标存在但不上报（instrument 仍定义，避免迭代二代码分支）。 |
| **K14** | `/metrics` 访问控制 | ① 容器绑定 `127.0.0.1`（现状即满足）；② nginx 显式 `location = /metrics { return 404; }`（生产未走 nginx 时天然不可达）；③ 可选 `METRICS_TOKEN` → 校验 `Authorization: Bearer <token>`（`secrets.compare_digest`）。 |
| **K15** | 开关 | `METRICS_ENABLED=false` → 不注册中间件、不注册 `/metrics` 路由、不启动池采集线程、不注册 SQL 事件（性能零开销）。**指标对象仍定义**（no-op 上报）。 |
| **K16** | 告警送达 | 主通道 `ALERT_WEBHOOK_URL`（企业微信/飞书机器人，D-08）；增强通道 `POST /api/v1/internal/alerts`（`X-API-Key` = `ALERT_API_KEY`）→ 迭代二 `system.alert` 站内信给 admin；增强通道失败不影响 webhook。 |
| **K17** | 指标 vs 迁移失败语义 | 迁移失败会阻断启动 → `/metrics` 不可抓取。因此 `ProfoMigrationFailed` 只在「启动成功但后续 CLI 迁移失败」或「Pushgateway」场景有效；**生产首要信号是 `ProfoBackendDown` + `schema_migrations.status='failed'`**（runbook 明写）。 |
| **K18** | contextvar 抽取 | `request_id_var` 与新增 `query_source_var`/`route_var` 统一放 `backend/utils/observability.py`；`main.py` 改为 import（B6 纠偏，全仓仅 3 处引用，无循环依赖风险）。 |

---

## 4. 设计

### 4.1 多 worker 方案（关键路径）

```
docker-entrypoint.sh（B5 新增）
  ├─ METRICS_ENABLED=true 且 PROMETHEUS_MULTIPROC_DIR 非空
  │    → rm -rf $DIR; mkdir -p $DIR; chmod 700; export PROMETHEUS_MULTIPROC_DIR=$DIR
  └─ exec uvicorn main:app ...（master 不再改目录）
        ├─ worker 1 import main → utils/metrics.py 建 instrument（写 mmap）
        ├─ worker 2 同上（各自 mmap 文件）
        └─ /metrics 请求落到任一 worker：
             registry = CollectorRegistry()
             multiprocess.MultiProcessCollector(registry)
             generate_latest(registry)   # 聚合全部 worker 的 mmap
```

**为什么不放 `main.py` 里清理**：2 个 worker 各自 import，谁先清谁破坏另一个（甚至清空已写入的 mmap）。必须在 master fork 之前（entrypoint）做。

**为什么不放 compose `command:`**：`Dockerfile` 只有 `CMD`，compose 覆盖 command 会丢失 `--proxy-headers --forwarded-allow-ips`（部署必需）。新增 entrypoint 后 `CMD` 保持原样，`exec "$@"` 透传。

### 4.2 文件清单

**新增（后端）**

```
backend/docker-entrypoint.sh
backend/utils/observability.py              # ContextVar：request_id / query_source / route_template
backend/utils/metrics.py                    # instrument 定义 + registry + generate()
backend/middleware/__init__.py
backend/middleware/metrics.py               # HTTPMiddleware
backend/utils/db_instrumentation.py         # SQLAlchemy 事件 + 慢查询日志 + 池采集线程
backend/routers/internal.py                 # POST /api/v1/internal/alerts（T3.7）
```

**新增（部署/文档）**

```
deploy/observability/docker-compose.observability.yml
deploy/observability/prometheus.yml
deploy/observability/alerts.yml
deploy/observability/alerts.test.yml
deploy/observability/alertmanager.yml
deploy/observability/grafana/profo-dashboard.json        # 可选，默认不启
deploy/observability/nginx-metrics.conf.snippet
docs/Base/observability-runbook.md
```

**修改**

```
backend/pyproject.toml                      # prometheus-client
backend/Dockerfile                          # ENTRYPOINT + chmod
backend/settings.py                         # 10 个新字段
backend/main.py                             # import contextvars、注册中间件/路由/线程
backend/db.py                               # 注册 SQLAlchemy 事件（METRICS_ENABLED 时）
backend/services/notification/service.py    # K13 打点（T3.4）
backend/migrations/runner.py                # K12 打点（T3.4，迭代一文件）
.env.docker.example                         # 新变量
docker-compose.yml                          # PROMETHEUS_MULTIPROC_DIR 透传（backend 环境）
```

### 4.3 指标清单（权威）

```python
# backend/utils/metrics.py
from prometheus_client import Counter, Gauge, Histogram

http_requests_total = Counter(
    "profo_http_requests_total", "HTTP 请求数",
    ["method", "route", "status"],
)
http_request_duration_seconds = Histogram(
    "profo_http_request_duration_seconds", "HTTP 请求耗时",
    ["method", "route"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)
http_requests_in_progress = Gauge(
    "profo_http_requests_in_progress", "进行中请求数",
    ["method"], multiprocess_mode="livesum",
)
http_exceptions_total = Counter(
    "profo_http_exceptions_total", "未处理异常数",
    ["route", "exception_type"],
)
db_query_duration_seconds = Histogram(
    "profo_db_query_duration_seconds", "SQL 耗时",
    ["operation", "source"],
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)
db_slow_queries_total = Counter(
    "profo_db_slow_queries_total", "慢查询次数",
    ["operation", "source"],
)
db_pool_connections = Gauge(
    "profo_db_pool_connections", "连接池连接数",
    ["state"], multiprocess_mode="livesum",   # checked_out / checked_in / overflow
)
migrations_total = Counter(
    "profo_migrations_total", "迁移执行次数",
    ["status", "migration"],
)
migration_duration_seconds = Histogram(
    "profo_migration_duration_seconds", "单迁移耗时",
    ["migration"],
    buckets=(0.01, 0.05, 0.1, 0.5, 1.0, 5.0, 15.0, 60.0, 300.0),
)
notifications_total = Counter(
    "profo_notifications_total", "通知投递次数",
    ["category", "channel", "status"],
)
business_events_total = Counter(
    "profo_business_events_total", "业务事件（最小集）",
    ["event", "module"],
)
app_info = Gauge(
    "profo_app_info", "应用信息",
    ["version"], multiprocess_mode="max",
)
```

**标签基数审计（上线前必做）**

| 标签 | 基数上限 | 依据 |
|------|---------|------|
| `method` | 6 | GET/POST/PUT/PATCH/DELETE/HEAD |
| `route` | ≤ 300 | 274 路径 + `unmatched` |
| `status` | ≤ 15 | HTTP 状态白名单 |
| `operation` | ≤ 10 | SQL 首关键字白名单 |
| `source` | 4 | request/migration/background/other |
| `state` | 3 | checked_out/checked_in/overflow |
| `category` | ≤ 10 | 事件字典 category |
| `channel` | 2 | in_app/wechat |
| `migration` | 80 + 新增 | 一迁移一个 label，长期线性增长 → **> 200 时改用 `version` 区间化**（runbook 记录阈值） |

### 4.4 HTTP 中间件

```python
# backend/middleware/metrics.py
_EXEMPT_PREFIXES = ("/metrics", "/static")
_EXEMPT_EXACT = {"/health"}


class MetricsMiddleware:
    """纯 ASGI 中间件（不用 BaseHTTPMiddleware，避免 StreamingResponse 包裹开销）."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or _exempt(scope["path"]):
            await self.app(scope, receive, send)
            return
        method = scope["method"]
        status_holder = {"code": 500}
        http_requests_in_progress.labels(method=method).inc()
        started = perf_counter()
        source_token = query_source_var.set("request")
        try:
            async def _send(message: Message) -> None:
                if message["type"] == "http.response.start":
                    status_holder["code"] = message["status"]
                await send(message)

            await self.app(scope, receive, _send)          # 抛异常 → except 分支
        except Exception as exc:
            route = _route_template(scope)                  # scope["route"].path or "unmatched"
            http_exceptions_total.labels(route=route, exception_type=type(exc).__name__).inc()
            raise
        finally:
            duration = perf_counter() - started
            route = _route_template(scope)
            http_requests_in_progress.labels(method=method).dec()
            http_requests_total.labels(method=method, route=route, status=str(status_holder["code"])).inc()
            http_request_duration_seconds.labels(method=method, route=route).observe(duration)
            query_source_var.reset(source_token)


def _route_template(scope: Scope) -> str:
    route = scope.get("route")
    return getattr(route, "path", None) or "unmatched"
```

**挂载顺序（`main.py`）**：在 `app.add_middleware(GZipExemptPrefixMiddleware)` 之后追加 `app.add_middleware(MetricsMiddleware)`（Starlette 后加者更外层 → 指标覆盖 gzip 与后续所有中间件/路由）。

**注意**：`scope["route"]` 在响应阶段才被 Router 写入（`scope` 是同一 dict，`finally` 中可读到）；404/405 时无 route → `unmatched`。

### 4.5 SQLAlchemy 埋点与慢查询

```python
# backend/utils/db_instrumentation.py
_SLOW_KEY = "profo_query_start"
_OPERATIONS = {"SELECT","INSERT","UPDATE","DELETE","ALTER","CREATE","DROP","COPY","WITH","TRUNCATE","BEGIN","COMMIT"}


def install_db_instrumentation(engine: Engine) -> None:
    """注册 SQL 事件监听（幂等：重复调用直接返回）."""

    @event.listens_for(engine, "before_cursor_execute")
    def _before(conn, cursor, statement, parameters, context, executemany) -> None:  # noqa: ANN001
        conn.info[_SLOW_KEY] = perf_counter()

    @event.listens_for(engine, "after_cursor_execute")
    def _after(conn, cursor, statement, parameters, context, executemany) -> None:  # noqa: ANN001
        started = conn.info.pop(_SLOW_KEY, None)
        if started is None:
            return
        duration = perf_counter() - started
        operation = _operation_of(statement)
        source = query_source_var.get()
        db_query_duration_seconds.labels(operation=operation, source=source).observe(duration)
        if duration * 1000 >= settings.slow_query_threshold_ms:
            db_slow_queries_total.labels(operation=operation, source=source).inc()
            logger.warning(
                "慢查询 duration_ms=%d operation=%s source=%s route=%s request_id=%s sql=%s",
                int(duration * 1000), operation, source,
                route_template_var.get() or "-", request_id_var.get() or "-",
                _truncate_sql(statement),
            )


def _operation_of(statement: str) -> str:
    """SQL 首关键字（大写）；去前导注释/空白；白名单外归 OTHER."""


def _truncate_sql(sql: str, limit: int | None = None) -> str:
    """去换行/折叠空白 → 只取首个语句 → 截断（默认 settings.slow_query_log_sql_max_len）."""
```

**禁止事项**
- 不记录 `parameters`（哪怕 debug）。
- 不对 `executemany` 逐行计数（用 `context` 忽略即可，避免 N 倍放大）。
- 不在 `before/after` 里做 DB 查询（避免递归）。

### 4.6 连接池采集线程

```python
def start_pool_metrics_collector(engine: Engine) -> None:
    """daemon 线程每 N 秒采集连接池状态（复用 main.py 既有守护线程范式）."""

    def _loop() -> None:
        interval = settings.db_pool_metrics_interval_seconds
        while True:
            time.sleep(interval)
            try:
                pool = engine.pool
                db_pool_connections.labels(state="checked_out").set(pool.checkedout())
                db_pool_connections.labels(state="checked_in").set(pool.checkedin())
                db_pool_connections.labels(state="overflow").set(max(pool.overflow(), 0))
            except Exception:                     # pool disposed / 未初始化
                logger.debug("连接池指标采集跳过", exc_info=True)

    threading.Thread(target=_loop, name="db-pool-metrics", daemon=True).start()
```

- 首次采集在启动后 `interval` 秒（不必立即，避免启动期抖动）。
- `QueuePool.overflow()` 可能为负（归还后），取 `max(..., 0)`。

### 4.7 `/metrics` 端点

```python
@app.get(settings.metrics_path, include_in_schema=False)
@limiter.exempt
async def metrics_endpoint(request: Request) -> Response:
    """Prometheus 抓取端点（非 /api/v1 前缀；仅内网/带 token 可达）."""
    if not settings.metrics_enabled:
        raise HTTPException(status_code=404, detail="Not Found")     # 与未部署等价

    expected = settings.metrics_token
    if expected:
        provided = request.headers.get("authorization", "")
        if not secrets.compare_digest(provided, f"Bearer {expected}"):
            raise HTTPException(status_code=401, detail="Unauthorized")

    return Response(generate_latest(_build_registry()), media_type=CONTENT_TYPE_LATEST)


def _build_registry() -> CollectorRegistry:
    """multiprocess → 聚合全部 worker；否则用默认 REGISTRY."""
    if not os.environ.get("PROMETHEUS_MULTIPROC_DIR"):
        return REGISTRY
    registry = CollectorRegistry()
    multiprocess.MultiProcessCollector(registry)
    app_info.labels(version=settings.app_version).set(1)
    return registry
```

> ⚠️ multiprocess 模式下 `generate_latest(REGISTRY)` 会**漏掉其他 worker**；必须每次请求重新构建 `MultiProcessCollector`（构建成本低，勿缓存跨请求）。

### 4.8 告警规则 `deploy/observability/alerts.yml`

```yaml
groups:
  - name: profo-api
    rules:
      - alert: ProfoApiHigh5xxRate
        expr: |
          sum(rate(profo_http_requests_total{status=~"5.."}[5m]))
          /
          clamp_min(sum(rate(profo_http_requests_total[5m])), 0.001) > 0.02
        for: 5m
        labels: { severity: critical }
        annotations:
          summary: "API 5xx 比例 > 2%"
          description: "当前 5xx 占比 {{ $value | humanizePercentage }}"

      - alert: ProfoApiP95LatencyHigh
        expr: |
          histogram_quantile(0.95,
            sum(rate(profo_http_request_duration_seconds_bucket[5m])) by (le, route)
          ) > 1
        for: 10m
        labels: { severity: warning }
        annotations:
          summary: "路由 {{ $labels.route }} P95 延迟 > 1s"
          description: "当前 P95 = {{ $value | humanizeDuration }}"

      - alert: ProfoDbP95LatencyHigh
        expr: |
          histogram_quantile(0.95,
            sum(rate(profo_db_query_duration_seconds_bucket[5m])) by (le)
          ) > 0.5
        for: 10m
        labels: { severity: warning }
        annotations:
          summary: "DB P95 延迟 > 500ms"

      - alert: ProfoDbSlowQueries
        expr: sum(increase(profo_db_slow_queries_total[5m])) > 1
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: "慢查询 > 1 次/5 分钟"
          description: "请查 app.log 中 duration_ms/source/route 定位"

      - alert: ProfoDbPoolSaturated
        expr: sum(profo_db_pool_connections{state="checked_out"}) > 24
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: "连接池占用 > 80%（24/30）"

      - alert: ProfoMigrationFailed
        expr: increase(profo_migrations_total{status="failed"}[10m]) > 0
        for: 0m
        labels: { severity: critical }
        annotations:
          summary: "迁移失败 v{{ $labels.migration }}"
          description: "迁移失败通常阻断启动；优先看 ProfoBackendDown 与 schema_migrations"

      - alert: ProfoBackendDown
        expr: up{job="profo-backend"} == 0
        for: 1m
        labels: { severity: critical }
        annotations:
          summary: "后端不可抓取（进程挂了或 /metrics 不可达）"

  - name: profo-inhibit-hints
    rules:
      # 仅用于文档提示：抑制在 alertmanager.yml 的 inhibit_rules 中实现
      - record: profo:http_error_ratio5m
        expr: |
          sum(rate(profo_http_requests_total{status=~"5.."}[5m]))
          / clamp_min(sum(rate(profo_http_requests_total[5m])), 0.001)
```

**阈值依据**：`pool_size=10 + max_overflow=20 = 30`（`db.py`），80% = 24；DB P95 500ms 与慢查询阈值同源（D-09）；5xx 2%、路由 P95 1s 为计划稿原值，观察一周后按 runbook 调整。

### 4.9 Alertmanager `deploy/observability/alertmanager.yml`

```yaml
global:
  resolve_timeout: 5m

route:
  receiver: webhook-default
  group_by: [alertname, severity]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - matchers: [severity="critical"]
      receiver: webhook-critical
      group_wait: 10s
      repeat_interval: 1h
    - matchers: [severity="warning"]
      receiver: webhook-default

inhibit_rules:
  # 后端全挂时抑制派生告警，避免风暴
  - source_matchers: [alertname="ProfoBackendDown"]
    target_matchers: [alertname=~"ProfoApi.*|ProfoDb.*"]
    equal: []
  # 同一路由的高延迟被 5xx 风暴覆盖时，先处理错误率
  - source_matchers: [alertname="ProfoApiHigh5xxRate"]
    target_matchers: [alertname="ProfoApiP95LatencyHigh"]
    equal: [route]

receivers:
  - name: webhook-default
    webhook_configs:
      - url: ${ALERT_WEBHOOK_URL}
        send_resolved: true
        max_alerts: 20
  - name: webhook-critical
    webhook_configs:
      - url: ${ALERT_WEBHOOK_URL}
        send_resolved: true
        max_alerts: 20
      # 增强通道（K16）：写站内信，失败不影响上一条
      - url: http://backend:8000/api/v1/internal/alerts
        http_config:
          authorization:
            type: Bearer
            credentials: ${ALERT_API_KEY}
        send_resolved: false
```

> `alertmanager.yml` 原生**不支持** `${ENV}` 插值（Prometheus 支持）。落地方式：compose 用 `envsubst` 预渲染到 `/tmp/alertmanager.yml`，或将 `ALERT_WEBHOOK_URL` 固定写在文件里。**实现采用 envsubst**（entrypoint：`envsubst < /etc/alertmanager/alertmanager.tmpl.yml > /etc/alertmanager/alertmanager.yml`），并在 runbook 标注。

### 4.10 抓取配置 `deploy/observability/prometheus.yml`

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels: { env: production }

rule_files:
  - /etc/prometheus/alerts.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets: ["alertmanager:9093"]

scrape_configs:
  - job_name: profo-backend
    metrics_path: /metrics
    static_configs:
      - targets: ["host.docker.internal:8000"]      # 单机验证；生产改为监控主机可达的 backend 地址
  - job_name: profo-postgres
    static_configs:
      - targets: ["postgres-exporter:9187"]
  - job_name: profo-redis
    static_configs:
      - targets: ["redis-exporter:9121"]
```

- 生产（D-07 独立监控主机）：target 换为 `<backend-host>:8000`、`<db-host>:9187`、`<redis-host>:9121`，通过内网/VPN。
- `host.docker.internal` 需 `extra_hosts: ["host.docker.internal:host-gateway"]`（compose 已写）。

### 4.11 单机验证 compose（`--profile observability`）

```yaml
services:
  prometheus:
    image: prom/prometheus:v3.1.0
    profiles: ["observability"]
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.retention.time=7d
      - --storage.tsdb.retention.size=512MB
      - --web.enable-admin-api=false
      - --web.listen-address=0.0.0.0:9090
    volumes:
      - ./deploy/observability/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./deploy/observability/alerts.yml:/etc/prometheus/alerts.yml:ro
      - promdata:/prometheus
    ports: ["127.0.0.1:9090:9090"]
    mem_limit: 192m
    restart: unless-stopped
    extra_hosts: ["host.docker.internal:host-gateway"]

  alertmanager:
    image: prom/alertmanager:v0.28.0
    profiles: ["observability"]
    entrypoint: ["/bin/sh", "-c"]
    command:
      - 'envsubst < /etc/alertmanager/alertmanager.tmpl.yml > /tmp/am.yml && exec /bin/alertmanager --config.file=/tmp/am.yml --web.listen-address=0.0.0.0:9093'
    environment:
      ALERT_WEBHOOK_URL: ${ALERT_WEBHOOK_URL:-}
      ALERT_API_KEY: ${ALERT_API_KEY:-}
    volumes:
      - ./deploy/observability/alertmanager.yml:/etc/alertmanager/alertmanager.tmpl.yml:ro
    ports: ["127.0.0.1:9093:9093"]
    mem_limit: 48m
    restart: unless-stopped

  postgres-exporter:
    image: prometheuscommunity/postgres-exporter:v0.16.0
    profiles: ["observability"]
    environment:
      DATA_SOURCE_NAME: ${EXPORTER_DB_DSN}       # postgresql://readonly:pass@host.docker.internal:5432/profo?sslmode=disable
    ports: ["127.0.0.1:9187:9187"]
    mem_limit: 32m
    extra_hosts: ["host.docker.internal:host-gateway"]

  redis-exporter:
    image: oliver006/redis_exporter:v1.67.0
    profiles: ["observability"]
    environment:
      REDIS_ADDR: redis://<redis-host>:6379
      REDIS_PASSWORD: ${REDIS_PASSWORD}
    ports: ["127.0.0.1:9121:9121"]
    mem_limit: 24m

  grafana:                                       # 可选，默认不启
    image: grafana/grafana:11.4.0
    profiles: ["observability", "grafana"]
    ports: ["127.0.0.1:3001:3000"]
    mem_limit: 192m

volumes:
  promdata: {}
```

**⚠️ 内存核算（1.6G 服务器）**：现有 `db 384 + redis 32 + backend 512 + frontend 256 = 1184m`，剩余约 400m。单机全开 `192+48+32+24 = 296m`（不含 Grafana）→ **危险但可行**，必须先做压测验证；若 OOM 则降到 `prometheus 160m / alertmanager 32m` 或改用独立监控主机（D-07 推荐）。

**只读 DB 账号**：`postgres-exporter` 不得用 `POSTGRES_USER`（超管）。runbook 提供：
```sql
CREATE USER profo_exporter WITH PASSWORD '<随机>';
GRANT CONNECT ON DATABASE profo TO profo_exporter;
GRANT pg_monitor TO profo_exporter;
GRANT USAGE ON SCHEMA public TO profo_exporter;
```

### 4.12 nginx 加固片段（`nginx-metrics.conf.snippet`）

```nginx
# 放在生产 server {} 内。backend 仅绑 127.0.0.1:8000，/metrics 默认不可公网直达；
# 此段是「显式 404」兜底，防止未来有人加了 location / 反代到 backend 而意外暴露。
location = /metrics {
    return 404;
}
```

**实测现状**（用于验收断言）：`profo.nginx.backup` 中 `location /` 反代到 `127.0.0.1:3000`（前端），`/api/v1/` 反代 backend，`/static/`、`/health` 单独反代 → 公网 `/metrics` 命中的是 Next.js，天然 404。故 **G5 在现状即成立**，本片段是防回归。

### 4.13 告警 → 站内信（T3.7，K16）

```python
# backend/routers/internal.py
@router.post("/internal/alerts", status_code=200)
@limiter.limit(RateLimits.INTERNAL_ALERTS)      # 如 120/minute
def ingest_alerts(request: Request, payload: AlertmanagerWebhookRequest, db: DbSessionDep) -> dict[str, int]:
    """Alertmanager webhook 接入：firing 告警写 admin 站内信（system.alert）.

    鉴权：Authorization: Bearer <ALERT_API_KEY>（compare_digest，常量时间）。
    """
    _verify_alert_token(request)
    created = skipped = 0
    for alert in payload.alerts:
        if alert.status != "firing":
            continue
        fingerprint = alert.fingerprint or hashlib.sha1(
            f"{alert.labels.get('alertname')}:{alert.labels}".encode()
        ).hexdigest()
        result = NotificationService(db).emit(...)      # type=system.alert, dedupe=alert:{fingerprint}
        created += int(result.created)
        skipped += int(not result.created)
    return {"created": created, "skipped": skipped, "received": len(payload.alerts)}
```

- `ALERT_API_KEY` 为空 → 端点返回 404（等价关闭），避免裸奔。
- 该端点不使用 Cookie 鉴权 → CSRF 中间件天然豁免（`X-API-Key`/`Authorization` 分支）。
- 不写 `operation_logs`（高频，会污染审计）。

---

## 5. 任务拆解

| 任务 | 内容 | 估算 | 验证点 |
|------|------|:----:|--------|
| **T3.1** | `prometheus-client` + `utils/metrics.py` + `utils/observability.py`（contextvar 抽取） | 1.5d | 单测：instrument 全部可见；`main.py` 改用新 contextvar 后既有日志 `[request_id]` 仍正常 |
| **T3.1a** | `docker-entrypoint.sh` + Dockerfile ENTRYPOINT + compose env 透传（B5） | 0.5d | `docker compose exec backend sh -c 'echo $PROMETHEUS_MULTIPROC_DIR'` 有值；目录为 700 空目录 |
| **T3.2** | HTTP 中间件（route 模板 / 状态 / 延迟 / 进行中 / 异常） | 2d | 单测：200/404/500 三类计数正确；`unmatched` 归并 |
| **T3.3** | SQLAlchemy 事件 + 慢查询日志脱敏 + `source` 标记 | 2d | 单测：超阈值计数 +1、日志不含参数、截断生效 |
| **T3.4** | 池采集线程 + 迁移指标 + 通知指标 | 1.5d | 单测：池三态；迁移 metrics 只在真执行时 +1 |
| **T3.5** | `/metrics` 端点 + token + multiprocess registry | 1d | 单测：无 token 401、关闭时 404、multiprocess 分支走 MultiProcessCollector |
| **T3.6** | `deploy/observability/**`（compose + prom + am + exporters） | 2d | `docker compose --profile observability up -d` 全绿；Prometheus targets 全 UP |
| **T3.7** | `alerts.yml` + `alerts.test.yml` + `promtool` 脚本 | 1.5d | `promtool check rules` / `test rules` 通过 |
| **T3.8** | `/api/v1/internal/alerts` + 限流 + 鉴权 | 1d | 单测：无 key 404、错误 key 401、重复 fingerprint 只 1 条 |
| **T3.9** | nginx 片段 + 公网隔离/压测/慢查询注入脚本 | 1d | §7.3 脚本产出工件 |
| **T3.10** | runbook（抓取/告警/抑制/排障/回滚/后续） | 1.5d | 每段命令可直接复制执行 |
| **T3.11** | 测试：单测 4 文件 + E2E 1 个 | 2d | §7 全绿 |

**合计 ≈ 17.5 人日**（≈2 周 + 缓冲）。

**依赖顺序**：T3.1 → T3.1a →（T3.2 ∥ T3.3）→ T3.4 → T3.5 →（T3.6 ∥ T3.7）→ T3.8 → T3.9 → T3.10 → T3.11。

---

## 6. 测试策略

### 6.1 后端单测

| 文件 | 覆盖 |
|------|------|
| `tests/test_metrics_http.py` | 三类状态计数 / 延迟直方图观测 / 进行中 Gauge 归零 / 异常计数且异常仍抛出 / 排除路径不计数 / `route` 模板化（`/api/v1/projects/{project_id}` 不出现具体 UUID）/ 404 归 `unmatched` |
| `tests/test_slow_query.py` | 阈值判定 `>=` / 计数 +1 / 日志字段齐全 / **日志不含参数值**（用含手机号的参数触发，断言日志中无该值）/ 多语句只取首段 / 截断长度 |
| `tests/test_metrics_multiprocess.py` | `PROMETHEUS_MULTIPROC_DIR` 设置时 `_build_registry()` 返回含 `MultiProcessCollector` 的 registry；`Gauge` 带 `multiprocess_mode` |
| `tests/test_internal_alerts.py` | `ALERT_API_KEY` 空 → 404；错误 token → 401；firing ×2 同 fingerprint → 1 条通知；resolved 不产生通知 |

### 6.2 E2E（`backend/tests/e2e/test_metrics_e2e.py`）

1. 起后端（2 worker）→ `curl /metrics` → 断言 11 个指标名全部出现。
2. 对 `/` 打 100 次 → `sum(profo_http_requests_total{route="/"})` ≥ 100（含其他请求）且 **不少于 100**（防减半）。
3. 注入慢查询：`GET /api/v1/projects/stats`（带登录）前先 `SELECT pg_sleep(1)` 的测试端点或直连 engine 执行 → 断言 `profo_db_slow_queries_total` +1 且 `app.log` 有 `慢查询`。
4. 4xx：请求不存在路由 → `profo_http_requests_total{route="unmatched",status="404"}` +1；无高基数原始路径标签（grep `/api/v1/projects/` 具体 UUID 应无命中）。
5. `ALERT_API_KEY` 配置后调 `/api/v1/internal/alerts` 两次同 fingerprint → 站内信 1 条。

工件：`backend/tests/e2e/artifacts/metrics-e2e-YYYYmmdd-HHMMSS.txt`（含 `/metrics` 采样片段 + 断言输出）。

### 6.3 运维验证脚本（`deploy/observability/verify.sh`）

```bash
#!/bin/bash
set -euo pipefail
echo "== promtool =="
promtool check rules alerts.yml
promtool test rules alerts.test.yml
echo "== 指标存在 =="
curl -fsS http://127.0.0.1:8000/metrics | grep -E '^profo_(http_requests_total|http_request_duration_seconds|db_query_duration_seconds|db_slow_queries_total|db_pool_connections|migrations_total|notifications_total)' | head -20
echo "== 公网隔离 =="
code=$(curl -s -o /dev/null -w '%{http_code}' https://fangmengchina.com/metrics)
[ "$code" = "404" ] || [ "$code" = "403" ] || { echo "❌ 公网 /metrics 返回 $code"; exit 1; }
echo "✅ 全部通过"
```

### 6.4 压测对比（G6）

```bash
# 前（METRICS_ENABLED=false）与后（true）各 3 轮
hey -n 2000 -c 20 http://127.0.0.1:8000/ | grep -E 'Requests/sec|Latency'
docker stats --no-stream backend
```

产物：`deploy/observability/bench-YYYYmmdd.md`（记录 P95/Requests/sec/RSS 三组对比）。

---

## 7. 验收标准

| # | 验收项 | 命令 | 预期 |
|---|--------|------|------|
| A1 | 指标齐全 | `curl -s 127.0.0.1:8000/metrics \| grep -cE '^profo_'` | ≥ 11 个指标族；含 §4.3 全部名称 |
| A2 | 2 worker 不减半 | §6.2 第 2 步 | 计数 ≥ 100 |
| A3 | 路由模板化 | 打 1 个带 UUID 的详情接口 | `/metrics` 中 `route="/api/v1/projects/{project_id}"`，**无** UUID 明文 |
| A4 | 404 归并 | 请求 `/api/v1/nope` | `route="unmatched",status="404"` +1 |
| A5 | 慢查询 | §6.2 第 3 步 | 计数 +1；日志含 `duration_ms/operation/source/route/request_id/sql`；**无参数值** |
| A6 | 连接池 | 压测到 24+ 连接 | `profo_db_pool_connections{state="checked_out"}` 上升；`ProfoDbPoolSaturated` 进 pending/firing |
| A7 | 告警规则 | `promtool check rules` + `test rules` | 通过 + 用例输出 |
| A8 | 公网隔离 | `curl -o /dev/null -w '%{http_code}' https://fangmengchina.com/metrics` | `404` 或 `403` |
| A9 | 宕机告警 | `docker compose stop backend` | ≤2 分钟 `ProfoBackendDown` firing；恢复后 resolved |
| A10 | 告警进站内信 | 手工 POST `/api/v1/internal/alerts` 两次 | 站内信 1 条（去重）；无 key 时 404 |
| A11 | 开关 | `METRICS_ENABLED=false` 重启 | `/metrics` 404；无 HTTP 指标开销（压测对比可见） |
| A12 | 开销 | §6.4 | P95 增幅 < 5%；RSS 增幅 < 50MB |
| A13 | runbook 可执行 | 按 §T3.10 逐段执行 | 全部一次通过 |
| A14 | 单测/E2E | §6 命令 | 全绿 + 工件文件 |

---

## 8. 风险与回滚

| 风险 | 症状 | 缓解 |
|------|------|------|
| 多 worker 指标减半 | 告警误判（半量） | K1/K3 + A2 硬标准；`Gauge` 全部带 `multiprocess_mode` |
| 标签基数爆炸 | Prometheus 内存暴涨 | K5/K8 白名单 + §4.3 基数审计表 + `migration` label 超 200 时改造（runbook） |
| 1.6G 内存不足 | OOM 杀 backend | D-07 独立监控主机优先；单机 profile 限内存（296m）+ 压测；Grafana 默认关 |
| 慢查询日志含 PII | 合规风险 | K10 不记参数 + 截断 + 单测用真实手机号参数断言日志无该值 |
| `/metrics` 暴露 | 信息泄漏 | K14 三层（绑定 127.0.0.1 / nginx 404 / token）+ A8 |
| 中间件开销 | P95 上升 | 纯 ASGI 中间件（非 BaseHTTPMiddleware）+ buckets 精简 + A12 压测 |
| multiprocess 目录权限 | worker 写 mmap 失败 | entrypoint `chmod 700` + 容器 uid 1001 拥有；启动日志校验可写 |
| Alertmanager 不支持 env 插值 | 配置文件渲染失败 | §4.9 envsubst 方案 + runbook 记录 |
| 告警疲劳 | 运维忽略 | 分级 + 抑制 + 观察期 1 周后调参 + 周复盘 |
| 迁移失败告警抓不到 | 以为有监控实际没有 | K17 明确写进 runbook：首看 `ProfoBackendDown` + `schema_migrations.status` |

**回滚**

1. `METRICS_ENABLED=false` 重启 → 中间件/端点/事件/线程全不生效（K15），零性能开销。
2. 停监控栈：`docker compose --profile observability down`（独立 profile，不影响主服务）。
3. 告警静默：Alertmanager `amtool silence add alertname=~"Profo.*" --duration=2h`（runbook 记录）。
4. 完全回退：`git revert` 本迭代 + 移除 `prometheus-client` 依赖（无数据资产依赖）。

---

## 9. 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `METRICS_ENABLED` | `true` | 总开关（K15） |
| `METRICS_PATH` | `/metrics` | 指标路径（改路径时 nginx 片段同步） |
| `METRICS_TOKEN` | 空 | 非空 → 要求 `Authorization: Bearer` |
| `PROMETHEUS_MULTIPROC_DIR` | `/tmp/profo-prometheus` | 多 worker 指标目录（entrypoint 清理） |
| `SLOW_QUERY_THRESHOLD_MS` | `500` | 慢查询阈值（D-09） |
| `SLOW_QUERY_LOG_SQL_MAX_LEN` | `500` | 日志 SQL 截断长度 |
| `DB_POOL_METRICS_INTERVAL_SECONDS` | `15` | 连接池采集间隔 |
| `ALERT_WEBHOOK_URL` | 空 | 企业微信/飞书机器人（D-08） |
| `ALERT_API_KEY` | 空 | `/internal/alerts` 鉴权；空=端点 404 |
| `EXPORTER_DB_DSN` | 空 | postgres-exporter 只读 DSN（仅 compose 使用） |

---

## 10. 交付物

- `backend/utils/metrics.py`、`utils/observability.py`、`utils/db_instrumentation.py`、`middleware/metrics.py`、`routers/internal.py`
- `backend/docker-entrypoint.sh` + `Dockerfile` ENTRYPOINT
- `deploy/observability/`（compose / prometheus / alerts / alerts.test / alertmanager / nginx snippet / verify.sh / bench 报告）
- `docs/Base/observability-runbook.md`（抓取/告警/抑制/排障/回滚/后续含 `pg_stat_statements`）
- `docs/Done/2026-XX-XX-迭代三验收报告.md`
- 4 个单测 + 1 个 E2E + 压测报告

---

## 11. ⚠️ 未覆盖 / 不确定（Fail Loud）

1. **⚠️ `ProfoMigrationFailed` 在「迁移失败阻断启动」场景不可达**（K17）：验收不要求该告警真实触发，只要求 `promtool` 用例通过 + runbook 说明真实信号。若要求可达，需引入 Pushgateway（超范围）。
2. **⚠️ 单机 profile 的 296m 内存未实测**：必须在 staging 压测后确认；未确认前**不得**在生产开启单机监控栈（D-07）。
3. **⚠️ `postgres-exporter` 只读账号需 DBA 创建**：本 spec 只给 SQL，创建动作属运维；未创建时该 target 会 DOWN，告警需临时排除（runbook 写步骤）。
4. **⚠️ 路由覆盖率 100% 的度量方式未完全自动化**：A1/A3 用抽样验证；若要严格 100%，需写 `test_all_routes_instrumented` 遍历 `app.routes` 并逐条发请求（成本高，本期不做，改为抽样 + code review）。
5. **⚠️ `business_events_total` 只定义不使用**：本期不接业务事件（最小集边界），指标族存在但为 0；若被误解为「已覆盖」需在 runbook 注明。
6. **⚠️ Alertmanager `webhook_configs` 双发（webhook + 站内信）失败语义**：Alertmanager 对同一 receiver 内多个 webhook 是「各自独立通知」，**无原子性**；站内信失败仅记 Alertmanager 日志，不影响机器人通知。这一点已在 K16 说明，但「如何发现站内信通道坏了」本期无监控（自身不可观测），记录为已知缺口。
7. **⚠️ 2 worker 下 `livesum` Gauge 的「进行中请求」是跨 worker 求和**：单机看是正确总量，但**不能**用 `avg_over_time` 做单 worker 推断；runbook 注明用法。
