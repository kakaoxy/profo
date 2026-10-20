# SPEC · 迭代一：迁移版本化与可回滚（实施版）

> **状态**：**已实施**（T1.1–T1.9 完成，T1.10 本机演练完成；见 §19 实施记录）｜撰写 2026-10-17｜module id：`iter1-migrations`
> **上游**：`docs/To-Do/2026-10-17-三迭代-SPEC-index.md`（共享契约 C1–C9、已决口径 D-01/D-02/D-03）
> **计划稿**：`docs/To-Do/2026-10-17-后续三迭代计划.md` §3
> **纠偏**：本迭代按总纲 §1 的 B1/B8（实测 **82** 个迁移，非 77/80）、B2（部署链路已有全库备份）、B4（wrapper 内含子迁移）实施。

---

## 1. 定位与范围

### 1.1 一句话定位

给现有「代码即清单」的 82 项启动迁移加一层**版本账本**：每次迁移都有版本号、执行记录、源码校验和、迁移前备份，以及可审计的补偿/恢复入口。**不改写任何既有迁移函数的业务逻辑**。

### 1.2 现状（已核对代码，含行号）

| 事实 | 证据 | 后果 |
|------|------|------|
| 82 项迁移硬编码在 `_run_all_migrations` | `backend/migrations/__init__.py` L297+ | 增删要改中心文件，顺序不可视 |
| 43 个迁移文件（42 模块 + `__init__`） | `ls backend/migrations/*.py` | 人工核对成本高 |
| 无版本表 | 全仓无 `schema_migrations` | 无法回答「这个环境跑到第几版」 |
| 幂等靠 `_column_exists/_index_exists/IF NOT EXISTS` | `migrations/_helpers.py` | 可重复执行，但**无执行记录** |
| 多 worker 串行化 | `pg_advisory_lock(20260722130001)` | 可复用，不需要新机制 |
| 无 down / 补偿 | 无 `compensations/` | 事故只能靠人工经验 |
| 备份靠人工 + 部署脚本 | `deploy-server.sh` L56–90 | 部署路径有全库备份，但**无「版本↔备份」关联**，非部署路径（重启/CLI 触发）无备份 |
| 迁移失败 = 启动失败 | `main.py::lifespan` 无 try 包裹 `run_startup_migrations` | Fail Loud 正确，但失败现场（哪个迁移、堆栈、是否部分提交）未落库 |

### 1.3 范围

**In Scope**

1. `schema_migrations` / `migration_compensations` 两张表（幂等建表）。
2. `migrations/registry.py`：82 项登记 + 元数据（kind / backup / reversible / risk / description）。
3. `migrations/runner.py`：执行器（锁、校验和、pending、失败落库、启动阻断）。
4. `migrations/backup.py`：`pg_dump` 备份 + sha256 + 保留策略 + 磁盘阈值。
5. `migrations/manage.py`：CLI（`status/baseline/up/verify/retry/compensate/restore-hint`）。
6. `migrations/compensations/`：框架 + 3 个实脚本（B 级 2 个 + 1 个 dry-run 演示）。
7. 82 项迁移**风险分级矩阵**（本文 §11）。
8. `docs/Base/migrations-runbook.md`（发布/事故/恢复/基线四段）。
9. `backend/Dockerfile` + `docker-compose.yml`（`postgresql-client`、`./backups` 挂载、新环境变量）。

**Out of Scope**

- ❌ 迁 Alembic / 独立迁移服务 / 迁移工单审批流
- ❌ 为 82 项补写 down SQL（C/D 级一律备份恢复）
- ❌ 零停机在线 DDL / 锁表优化
- ❌ 改动任何既有迁移函数的业务逻辑（只允许加装饰性 docstring 之外的零改动）
- ❌ 迁移并发并行化（保持全串行）

---

## 2. 目标与成功指标

| # | 指标 | 目标值 | 度量方式 |
|---|------|--------|---------|
| G1 | 迁移记录覆盖率 | 82/82 = 100% | `manage status --json \| jq '.total'` == 82 |
| G2 | 启动可解释 | 每次启动一行结构化摘要 | 日志含 `迁移状态：applied=82 pending=0 failed=0` |
| G3 | 校验和阻断 | 已执行迁移源码逻辑变化 → 启动失败 | 单测 `test_checksum_drift_blocks_startup` |
| G4 | 备份强制 | `backup != none` 且备份失败 → 迁移不执行 | 单测 `test_backup_failure_aborts_migration` |
| G5 | 回滚演练 | 1 个 B 级迁移「备份→dry-run→补偿→验证」≤30 分钟 | staging 演练工件 |
| G6 | 启动增量开销 | applied 全绿时额外耗时 ≤ 2s | 3 次测量取中位数 |
| G7 | 零业务回归 | 应用功能用例全绿 | 既有 pytest 全量 + 8 个 `/health` 冒烟 |

---

## 3. 关键口径收口（K1–K14）

| # | 决策 | 实施口径 |
|---|------|---------|
| **K1** | 版本映射 | `version = 1..82`，严格按 `_run_all_migrations` **当前调用顺序**编号（本文 §11 表即权威映射）。新增迁移从 **83**（`registry.NEXT_VERSION`）开始，**禁止插入历史中间序号**，禁止复用已删除版本号。 |
| **K2** | 注册表粒度 | 一个 `Migration` = `_run_all_migrations` 里的一次顶层 `fn(engine)` 调用。wrapper 内部子步骤（如 `create_marketing_project_subscription_table` 内的 `add_last_subscribed_at_*`）**不单列**，随父项一起回滚/补偿。 |
| **K3** | 函数签名不变 | 所有迁移保持 `fn(engine: Engine) -> None`。执行器**不**包裹外层大事务（迁移内部自行 `engine.begin()` 提交）。 |
| **K4** | 校验和算法 | `sha256(normalize(inspect.getsource(fn)))`，`normalize` 用 `tokenize` 去掉 `COMMENT`/`NL`/`INDENT` 无关空白与 docstring 前空行，再 `dedent`。**只对逻辑敏感，不对注释/空行敏感**（避免格式化工具有效改动阻断启动）。 |
| **K5** | 校验和冲突处置 | 启动**阻断**，错误信息含 `version / name / expected / actual` + 两条修复路径（新增迁移 or `manage rebaseline`）。`rebaseline` 写 `migration_compensations(action='rebaseline')` 审计。 |
| **K6** | 失败语义 | 迁移抛错 → 写 `status='failed'` + `error`（`traceback.format_exc()` 前 4000 字符）+ `backup_path` → **raise**（启动失败）。下次启动检测到 `failed` 直接阻断并提示 `manage retry <version>`。 |
| **K7** | 空版本表判定 | `lifespan` 先 `init_db()`（`create_all`）再迁移，所以「表存在」不能区分新旧库。判定：`users/projects/leads` **任一非空** → 既有库（未 baseline 则**阻断**）；三者全空 → 全新库（自动全量执行）。`MIGRATION_AUTO_BASELINE=true` 时既有库也自动 baseline（**仅限开发/测试**，生产 `DEBUG=false` 拒绝）。 |
| **K8** | 旧执行器保留 | `MIGRATION_LEGACY_MODE=true` → 直接调用旧 `_run_all_migrations` + 打 WARNING。保留 **1 个 release**，条款见 §12 退出条件。 |
| **K9** | 备份工具 | `pg_dump --format=custom --no-owner --no-privileges --compress=6`，二进制由 `shutil.which("pg_dump")` 发现，缺失即 `RuntimeError`（不静默跳过）。 |
| **K10** | 备份范围 | `full` → 全库；`table` → `--data-only` + 逐个 `--table=public.<t>`；`none` → 跳过。**C/D 级迁移不得为 none**（§11）。 |
| **K11** | 备份失败处置 | 备份失败（非零退出 / 0 字节 / sha256 计算失败 / 磁盘余量 < `MIGRATION_BACKUP_MIN_FREE_MB`）→ **迁移不执行**，写 `status='failed'`、`error='backup_failed: ...'`，raise。`MIGRATION_BACKUP_MODE=off` 仅 `DEBUG=true` 可用，否则启动期校验直接拒绝。 |
| **K12** | 补偿事务模型 | 补偿函数签名为 `compensate(conn: Connection, ctx: CompensationContext) -> CompensationResult`，**由执行器统一开启单事务**（`engine.begin()`），失败整体回滚。补偿函数**禁止**自行 `commit()`。 |
| **K13** | 补偿安全阈值 | `--dry-run` 必须只读（内部一律 `SELECT count(*)`，不执行 DML）；实际行数 > `MIGRATION_COMPENSATION_MAX_ROWS`（默认 10000）需 `--force`；生产（`DEBUG=false`）需 `--yes` + `MIGRATION_PRODUCTION_CONFIRM=<环境名>` 双确认。 |
| **K14** | 备份保留 | 每次启动完成后执行 `prune`：删除超过 `MIGRATION_BACKUP_RETENTION_DAYS` 且总量超过 `MIGRATION_BACKUP_MAX_COUNT` 的旧文件，**始终保留最新 1 份**；`prune` 异常只记 WARNING，不影响启动。 |

---

## 4. 数据模型

### 4.1 `schema_migrations`

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
    version        INTEGER      PRIMARY KEY,
    name           VARCHAR(200) NOT NULL,
    checksum       VARCHAR(64)  NOT NULL,
    kind           VARCHAR(20)  NOT NULL,   -- schema / data / seed
    risk           VARCHAR(2)   NOT NULL,   -- A / B / C / D
    status         VARCHAR(20)  NOT NULL,   -- applied / failed
    started_at     TIMESTAMPTZ  NOT NULL,
    applied_at     TIMESTAMPTZ,             -- 仅成功写入
    duration_ms    INTEGER,
    app_version    VARCHAR(32),
    worker         VARCHAR(100),            -- hostname:pid
    backup_path    TEXT,
    backup_sha256  VARCHAR(64),
    backup_scope   VARCHAR(10),             -- none / table / full
    error          TEXT,
    notes          TEXT,
    CONSTRAINT uq_schema_migrations_name UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_status
    ON schema_migrations (status);
```

- **无 DB 外键**（项目约定：逻辑外键）。`migration_compensations.version` 为逻辑外键。
- `status='failed'` 的行**保留**（不删除、不覆盖为 applied），`retry` 成功后 UPDATE 同一行为 `applied` 并清空 `error`。

### 4.2 `migration_compensations`

```sql
CREATE TABLE IF NOT EXISTS migration_compensations (
    id           BIGSERIAL   PRIMARY KEY,
    version      INTEGER     NOT NULL,      -- 逻辑外键 → schema_migrations.version
    action       VARCHAR(20) NOT NULL,      -- compensate / restore / rebaseline / retry / baseline
    operator     VARCHAR(100) NOT NULL,     -- os user / 容器内 USER / MIGRATION_OPERATOR
    dry_run      BOOLEAN     NOT NULL DEFAULT false,
    reason       TEXT,
    started_at   TIMESTAMPTZ NOT NULL,
    finished_at  TIMESTAMPTZ,
    duration_ms  INTEGER,
    result       VARCHAR(20) NOT NULL,      -- success / failed / dry_run / aborted
    affected_rows INTEGER,
    notes        TEXT
);

CREATE INDEX IF NOT EXISTS idx_migration_compensations_version
    ON migration_compensations (version, started_at DESC);
```

### 4.3 ORM 模型

新增 `backend/models/system/schema_migration.py`：

```python
class SchemaMigration(Base):
    """迁移版本账本（不继承 BaseModel：version 为主键，无 UUID/updated_at 语义）。"""
    __tablename__ = "schema_migrations"
    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    risk: Mapped[str] = mapped_column(String(2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    app_version: Mapped[str | None] = mapped_column(String(32))
    worker: Mapped[str | None] = mapped_column(String(100))
    backup_path: Mapped[str | None] = mapped_column(Text)
    backup_sha256: Mapped[str | None] = mapped_column(String(64))
    backup_scope: Mapped[str | None] = mapped_column(String(10))
    error: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)


class MigrationCompensation(Base):
    """补偿/恢复/重基线审计（不继承 BaseModel：BIGSERIAL 主键 + 审计语义）。"""
    __tablename__ = "migration_compensations"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    operator: Mapped[str] = mapped_column(String(100), nullable=False)
    dry_run: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    reason: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    result: Mapped[str] = mapped_column(String(20), nullable=False)
    affected_rows: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)
```

> ⚠️ 两张表**新增第 81/82 号迁移的问题**：它们由 `runner.ensure_version_tables()` 在建表阶段就创建（`CREATE TABLE IF NOT EXISTS`），**不登记为迁移**——否则「版本表自己的版本」形成自举悖论。这是本迭代唯一豁免 C2 的表，理由写入 runbook。

---

## 5. 注册表 `migrations/registry.py`

### 5.1 数据结构

```python
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Literal

from sqlalchemy.engine import Engine

Kind = Literal["schema", "data", "seed"]
Backup = Literal["none", "table", "full"]
Risk = Literal["A", "B", "C", "D"]


@dataclass(frozen=True, slots=True)
class Migration:
    """一条可执行迁移的登记元数据."""

    version: int
    name: str
    fn: Callable[[Engine], None]
    kind: Kind
    risk: Risk
    backup: Backup
    reversible: bool
    backup_tables: tuple[str, ...] = ()
    compensation: str | None = None      # "0034_add_media_type_to_renovation_photos"
    description: str = ""

    def __post_init__(self) -> None:
        """登记期自检：backup=table 必须给表；C/D 级不得 backing=none 或声明可逆."""
        if self.backup == "table" and not self.backup_tables:
            raise ValueError(f"v{self.version} backup=table 必须提供 backup_tables")
        if self.risk in ("C", "D") and self.reversible:
            raise ValueError(f"v{self.version} 风险 {self.risk} 不得声明 reversible=True")
        if self.risk in ("C", "D") and self.backup == "none":
            raise ValueError(f"v{self.version} 风险 {self.risk} 必须备份")


MIGRATIONS: tuple[Migration, ...] = (
    Migration(1, "add_token_version_column", add_token_version_column, "schema", "A", "none", True,
              description="users.token_version 列（H-002）"),
    # ... 共 82 条，见本文 §11 表
)

MIGRATION_BY_VERSION: dict[int, Migration] = {m.version: m for m in MIGRATIONS}

NEXT_VERSION = 81
```

### 5.2 登记期不变量（由单测强制）

| 不变量 | 测试 |
|--------|------|
| `MIGRATIONS` 长度 == 82，`version` 连续 1..82 无缺口 | `test_registry_versions_contiguous` |
| 顺序与 `_run_all_migrations` 旧序列**逐项相同**（防止上线顺序变化） | `test_registry_matches_legacy_order`（解析旧函数源码对比函数名，legacy 代码保留 1 release） |
| `name` 全局唯一且 `^[a-z][a-z0-9_]{2,199}$` | `test_registry_names_unique` |
| `version >= 81` 的新登记必须 `version > max(MIGRATIONS)` | `test_registry_append_only` |
| 每个 `compensation` 非空时对应模块存在且暴露 `compensate` | `test_compensation_modules_importable` |

---

## 6. 执行器 `migrations/runner.py`

### 6.1 启动流程

```text
run_startup_migrations(engine)
├─ 断言 engine.dialect.name == "postgresql"        # 既有行为保留
├─ if settings.migration_legacy_mode:              # K8
│     logger.warning("MIGRATION_LEGACY_MODE 已启用，跳过版本化执行器")
│     _run_all_migrations(engine); return
├─ with engine.connect() as lock_conn:
│     pg_advisory_lock(20260722130001)             # 复用既有 key，不新增
│     try:
│        ensure_version_tables(engine)              # CREATE TABLE IF NOT EXISTS ×2
│        state = load_state(engine)                 # applied / failed 两集合
│        verify_checksums(state)                    # K4/K5，不符 → raise
│        guard_state(engine, state)                 # K7 空版本表判定
│        pending = [m for m in MIGRATIONS if m.version not in state.applied]
│        logger.info("迁移状态：applied=%d pending=%d failed=%d", ...)
│        for m in pending:
│            _apply_one(engine, m)                  # 见 6.2
│        prune_backups()                            # K14，失败仅 WARNING
│     finally:
│        pg_advisory_unlock(20260722130001)
```

### 6.2 单条迁移执行

```python
def _apply_one(engine: Engine, m: Migration) -> None:
    """执行单条迁移：备份 → 执行 → 落库；任一步失败写 failed 并抛出."""
    started = datetime.now(timezone.utc)
    t0 = perf_counter()
    backup = None
    try:
        if m.backup != "none":
            backup = create_backup(engine, m.version, m.name, m.backup, m.backup_tables)  # 抛错即中止
        m.fn(engine)
    except Exception as exc:
        _record(engine, m, started, t0, backup, status="failed",
                error=f"{type(exc).__name__}: {exc}\n{traceback.format_exc()[-4000:]}")
        logger.exception("迁移 v%d %s 失败", m.version, m.name)
        raise
    _record(engine, m, started, t0, backup, status="applied", error=None)
    logger.info("迁移 v%d %s 完成，耗时 %dms", m.version, m.name, (perf_counter() - t0) * 1000)
```

**关键实现约束**

1. **落库用独立连接**（`with engine.connect() as c: c.execute(...); c.commit()`），不复用迁移函数内的连接——迁移函数内部可能已 `commit` 多次，外层事务模型不成立（K3）。
2. `_record` 必须在 `except` 里**不抛二次异常**（内部再 try/except + `logger.exception`），否则掩盖真实错误。
3. `started_at` 用 Python `datetime.now(timezone.utc)`（与 `BaseModel` 一致），不用 DB `now()`（多 worker 时区一致但便于测试打桩）。
4. advisory lock 使用**独立连接**（`with engine.connect() as lock_conn:`），与既有实现一致；锁内业务连接来自池，不嵌套事务。

### 6.3 幂等与「已 applied 的迁移被重跑」

- `pending` 只取「不在 applied 集合」的版本 → 已 applied 的**永不重跑**。
- `failed` 的版本**不在 applied 集合** → 下次启动会重试（幂等函数安全）；也可以显式 `manage retry`。
- 启动时若存在 `failed` 行：**先阻断**，打印 `manage retry <version>` / `manage compensate <version>` 指引（K6），不自动重试——避免「反复失败-重启」掩盖问题。

### 6.4 启动阻断的错误文案（必须含可执行指令）

```text
[FATAL] 迁移状态异常：存在 1 条 failed 记录（v034_add_media_type_to_renovation_photos）
  时间：2026-10-20T10:11:12+08:00  耗时：812ms
  错误：OperationalError: column "media_type" ...（详见 schema_migrations.error）
  备份：backups/migrations/20261020-101100_v034_add_media_type_to_renovation_photos.dump
下一步（择一）：
  1) 修复后重试：docker compose exec backend .venv/bin/python -m migrations.manage retry 34 --reason "修复后重试"
  2) 回滚该迁移：docker compose exec backend .venv/bin/python -m migrations.manage compensate 34 --dry-run
  3) 查看全量状态：docker compose exec backend .venv/bin/python -m migrations.manage status
```

---

## 7. 基线（baseline）

### 7.1 判定矩阵

| `schema_migrations` 行数 | `users/projects/leads` | 判定 | 启动行为 |
|------------------------|----------------------|------|---------|
| 0 | 全空 | 全新库 | 自动全量执行 82 项并逐条登记（无需人工） |
| 0 | 任一非空 | 既有库未基线 | **阻断启动**，打印 `manage baseline --confirm` 指令 |
| >0 且无 failed | — | 正常 | 只跑 pending |
| >0 且有 failed | — | 异常 | 阻断，打印 retry/compensate 指令 |

`MIGRATION_AUTO_BASELINE=true` 时：第 2 行降级为「自动 baseline」并打 WARNING；**当 `DEBUG=false` 时该开关被忽略并 WARNING**（防止生产误配）。

### 7.2 `baseline` 命令行为

```bash
docker compose exec backend .venv/bin/python -m migrations.manage baseline --confirm
```

1. 必须 `--confirm`（无此 flag → 退出码 2 + 提示）。
2. 步骤：`full` 全库备份 → 逐条执行 82 项（幂等，多为 fast no-op）→ 逐条写 `applied` → 打 `migration_compensations(action='baseline')` 汇总记录。
3. 中途失败：保留已完成记录，失败项写 `failed`，退出码 1。**可重复执行**（幂等续跑）。
4. `--dry-run`：只打印「将执行 82 项 + 需要 full 备份 + 预估风险项清单」，不写库、不备份。

### 7.3 baseline 前置检查（Fail Loud）

- 磁盘余量 ≥ `MIGRATION_BACKUP_MIN_FREE_MB`（默认 2048MB），否则拒绝。
- `pg_dump` 可用；`PG*` 连接参数可从 `settings.database_url` 正确解析。
- 当前无 `failed` 行（有则先要求处理）。
- 打印「本次 baseline 将执行 N 项，其中 C/D 级 M 项：<清单>」，便于操作者确认。

---

## 8. 备份 `migrations/backup.py`

### 8.1 接口

```python
@dataclass(frozen=True, slots=True)
class BackupResult:
    path: str
    sha256: str
    size_bytes: int
    scope: Literal["table", "full"]
    tables: tuple[str, ...]


def create_backup(
    engine: Engine,
    *,
    version: int,
    name: str,
    scope: Literal["table", "full"],
    tables: tuple[str, ...] = (),
) -> BackupResult:
    """执行 pg_dump 备份并校验；任何异常向上抛（调用方据此中止迁移）."""


def prune_backups(*, keep_days: int, keep_count: int) -> int:
    """按保留策略清理，返回删除数量；不删最新 1 份."""


def backup_status() -> dict[str, object]:
    """CLI status 用：目录、份数、总大小、最旧/最新、磁盘余量."""
```

### 8.2 命令构造（**不把密码放进 argv**）

```python
url = make_url(settings.database_url)          # sqlalchemy.engine.URL
env = {**os.environ, "PGPASSWORD": url.password or ""}
cmd = [
    pg_dump_path,                              # shutil.which("pg_dump")，None → RuntimeError
    "--format=custom", "--no-owner", "--no-privileges",
    "--compress=6",
    "--host", url.host or "localhost",
    "--port", str(url.port or 5432),
    "--username", url.username or "postgres",
    "--dbname", url.database or "postgres",
    "--file", str(out_path),
]
if scope == "table":
    cmd.append("--data-only")
    for t in tables:
        cmd.extend(["--table", f"public.{t}"])
subprocess.run(cmd, env=env, check=True, capture_output=True, timeout=1800)
```

- 输出到**临时文件** → 校验大小/sha256 → `os.replace()` 原子改名（避免半文件被当成有效备份）。
- 目录权限 `0o700`、文件 `0o600`（`os.chmod`），`mkdir(parents=True, exist_ok=True)`。
- 文件命名：`YYYYMMDD-HHMMSS_v{version:03d}_{name}.dump`。
- **客户端版本校验（实施新增，B9）**：`assert_client_compatible()` 在备份前校验
  `pg_dump` 主版本 ≥ 服务端主版本，不满足直接 `BackupError` 中止（不静默降级）。
  版本同时写入 `schema_migrations.backup_client`，作为 `restore-hint` 的唯一权威依据。
- **归档格式实测约束（B9）**：`pg_dump ≥17` 产出归档格式 **1.16**，PG16 自带的
  `pg_restore` 直接报 `unsupported version (1.16) in file header`；且 client ≥17 会写
  `SET transaction_timeout`（PG16 报 unrecognized parameter）。⇒ **恢复必须用产出备份的
  同一大版本客户端**（即 backend 容器），不能用 db 容器。`restore-hint` 已按此输出命令。
- 备份前把 `PGPASSWORD` 从日志中隔离：**只记命令的 `[0]` 与 `dbname`/`host`/`tables`**，不打印完整 argv。

### 8.3 失败判定（任一即中止，K11）

`subprocess.CalledProcessError` / `TimeoutExpired` / 文件不存在 / `size_bytes == 0` / `sha256` 计算异常 / 磁盘余量不足。

### 8.4 保留策略（K14）

```text
prune():
  files = sorted(glob("*.dump"), key=mtime, reverse=True)
  keep = files[:max(1, keep_count)]
  for f in files[keep:]:
      if age_days(f) > keep_days: os.remove(f)     # 两个条件同时满足才删
```

> 语义：**「超过 N 天」与「超过 N 份」同时满足才删**，避免「20 份都在 30 天内」时误删历史，也避免「1 年前 3 份」永久占用。与 D-02 一致。

### 8.5 「更简方案」说明（AGENTS 要求主动提出）

`deploy-server.sh` L56–90 已在部署时做全库 `pg_dump | gzip` 备份。**不能**用它替代本模块，因为：
1. 只在「部署脚本重跑」路径生效；`docker compose restart`、`manage up`、手工迁移无备份。
2. 备份与版本号无关联，无法回答「这次失败前有没有备份、覆盖到哪一版」。
3. 它是 plain SQL gz（恢复需 psql 全量重放），不能做**单表 recovery**。

结论：**保留两层**，`deploy-server.sh` 不动（回放全库用），本模块新增「版本粒度 + 单表可恢复」层。已在总纲 B2 记录。

---

## 9. 补偿框架 `migrations/compensations/`

### 9.1 协议

```python
# migrations/compensations/base.py
@dataclass(frozen=True, slots=True)
class CompensationContext:
    version: int
    dry_run: bool
    max_rows: int
    reason: str | None
    operator: str


@dataclass(frozen=True, slots=True)
class CompensationResult:
    affected_rows: int
    notes: str | None = None


CompensateFn = Callable[[Connection, CompensationContext], CompensationResult]
```

- 执行器：`with engine.begin() as conn: result = fn(conn, ctx)`。
- `dry_run=True`：函数必须只 `SELECT count(*)` 并返回预计行数，**不得执行 DML**（单测强制：dry-run 后表内容不变）。
- 实际行数 > `ctx.max_rows` 且未 `--force` → 执行器 `conn.rollback()` + `raise CompensationTooLargeError`，审计写 `result='aborted'`。

### 9.2 注册表

```python
# migrations/compensations/registry.py
COMPENSATIONS: dict[int, CompensateFn] = {
    4:  populate_phone_hash.compensate,          # B 级：SET phone_hash=NULL
    49: backfill_lead_unit_price.compensate,     # B 级：SET unit_price=NULL
    77: backfill_bd_room_floor.compensate,       # B 级：SET floor=NULL（仅本迁移回填的行）
}
```

> MVP 只做 **3 个 B 级实脚本**（计划稿要求「B/C 各 2 个」，C 级不写脚本只给 runbook，故 B 级 3 个更贴近可验证价值）。其余 77 项：A 级由 `drop_objects` 通用补偿覆盖，C/D 级走 `restore-hint`。

### 9.3 A 级通用补偿（覆盖 40+ 项，零脚本）

`migrations/compensations/generic_drop.py` 提供声明式回退：

```python
DROP_SPECS: dict[int, DropSpec] = {
  1:  DropSpec(columns=[("users", "token_version")]),
  2:  DropSpec(columns=[("users", "phone_hash")], indexes=["ix_users_phone_hash"]),
  5:  DropSpec(columns=[("users", "is_temporary"), ("users", "merged_into_user_id")], indexes=["idx_user_temporary"]),
  # ... 至 v82 的 A 级项（实测 44 项，见 generic_drop.DROP_SPECS）
}

@dataclass(frozen=True, slots=True)
class DropSpec:
    tables: tuple[str, ...] = ()
    columns: tuple[tuple[str, str], ...] = ()
    indexes: tuple[str, ...] = ()
```

**安全守卫**（防「新表已有业务数据时被 DROP」）：
- `tables` 非空时先 `SELECT count(*)`；`> 0` → 拒绝执行并提示「该表已有 N 行数据，DROP 会丢数据，请改用 `restore` 或 `--force` 并确认」。
- `columns` 非空时检查列是否已被后续迁移依赖（`information_schema` 中是否存在同名外键/索引）；存在则拒绝。
- 全部 `IF EXISTS`，幂等。

### 9.4 CLI 安全闸门（K13）

| 场景 | 闸门 |
|------|------|
| 任意补偿 | `--dry-run` 默认建议；不加 `--yes` 时只做 dry-run 并提示 |
| 行数超限 | `--force` 必需 |
| `DEBUG=false` | `--yes` **且** `MIGRATION_PRODUCTION_CONFIRM` 等于当前 `MIGRATION_ENV_NAME`（默认取 `APP_ENV`，回退 `production`） |
| 不可逆（`reversible=False` 且无脚本） | 拒绝执行，输出 `restore-hint` runbook 段 |
| 并发 | 补偿全程持有同一 advisory lock，防与启动迁移并发 |

---

## 10. CLI `migrations/manage.py`

```bash
python -m migrations.manage <command> [options]
```

| 命令 | 参数 | 行为 | 退出码 |
|------|------|------|-------|
| `status` | `--json` | 打印 82 行（version/name/kind/risk/status/duration/backup/applied_at）+ 汇总 + 备份目录概况 | 0；有 failed → 1 |
| `verify` | — | 校验 82 项：注册表完整 / checksum 一致 / 备份文件存在且 sha256 匹配 / failed 为空 | 0 全绿；1 有问题（逐项列出） |
| `baseline` | `--confirm` `--dry-run` | §7.2 | 0 / 1 / 2（缺 --confirm） |
| `up` | `--to <version>` | 手工执行 pending（持锁；等价启动流程，不带 init_db） | 0 / 1 |
| `retry <version>` | `--reason` | 仅重跑指定 failed 版本（幂等）→ 成功后 UPDATE 为 applied | 0 / 1 |
| `rebaseline <version>` | `--reason`（必填） | 把当前源码 checksum 写回并记审计（**只允许无行为变化的重构**） | 0 / 1 |
| `compensate <version>` | `--dry-run` `--yes` `--force` `--reason` | §9.4 闸门 | 0 / 1 / 2（被闸门拒绝） |
| `restore-hint <version>` | — | 打印该版本的恢复 runbook（备份路径 + psql/pg_restore 命令 + 验证 SQL） | 0 |

**输出约定**：
- 人类可读表 + 关键汇总行（`applied=82 pending=0 failed=0`）。
- `--json` 输出稳定结构（供 CI/巡检脚本消费）：
  ```json
  {"total": 82, "applied": 82, "pending": 0, "failed": 0, "checksum_mismatch": [],
   "backups": {"dir": "...", "count": 12, "total_mb": 84.2, "free_mb": 5120},
   "migrations": [{"version": 1, "name": "...", "status": "applied", "duration_ms": 12,
                   "risk": "A", "backup_scope": "none", "applied_at": "..."}]}
  ```
- **必须可在容器内直接运行**：`python -m migrations.manage` 依赖 `settings` 加载 `.env`，与 `uvicorn` 同环境（`docker compose exec backend`）。

---

## 11. 82 项迁移风险分级矩阵（权威版）

> **等级定义**
> - **A 自动补偿**：纯新增（列/表/索引），补偿 = `DROP ... IF EXISTS`（带数据守卫）
> - **B 脚本补偿**：确定性数据回填，反向 `SET NULL` / 按条件反向更新
> - **C 备份恢复**：加密/删除/改类型/多表改写/枚举改值 → 只能按备份恢复（runbook）
> - **D 不可回滚**：外部副作用或源数据已删 → 禁止自动执行，需人工评审
>
> `backup` 列：`none` / `table(表名)` / `full`。

| v | name | kind | risk | backup | reversible | 补偿策略 |
|--:|------|------|:----:|--------|:----------:|---------|
| 1 | add_token_version_column | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 2 | add_phone_hash_column | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 3 | encrypt_existing_phones | data | **C** | table(users) | ❌ | 备份恢复（restore-hint） |
| 4 | populate_phone_hash | data | **B** | table(users) | ✅ | `0004_populate_phone_hash`（实脚本） |
| 5 | add_user_temporary_fields | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 6 | add_stage_completed_dates_column | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 7 | add_thumbnail_url_to_photos | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 8 | add_renovation_extra_amount_columns | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 9 | drop_other_decoration_amount_column | schema | **C** | table(project_renovations) | ❌ | 备份恢复（restore-hint） |
| 10 | drop_soft_actual_cost_column | schema | **C** | table(project_renovations) | ❌ | 备份恢复（restore-hint） |
| 11 | add_contact_person_id_column | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 12 | run_fix_image_urls | data | **C** | table(renovation_photos, property_media) | ❌ | 备份恢复（restore-hint） |
| 13 | create_investment_tables | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 14 | rename_return_adjustment_columns | schema | **C** | full | ❌ | 备份恢复（restore-hint） |
| 15 | add_finance_record_counterparty_columns | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 16 | create_finance_record_logs_table | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 17 | create_finance_subjects_table | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 18 | migrate_finance_subjects_modes_to_jsonb | schema | **C** | table(finance_subjects) | ❌ | 备份恢复（restore-hint） |
| 19 | add_finance_record_subject_columns | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 20 | add_finance_record_receipt_urls_column | schema | **B** | table(finance_records) | ✅ | dry-run 版脚本 + restore-hint（实跑随迭代追加） |
| 21 | add_cashflow_category_enum_values | schema | **C** | full | ❌ | 备份恢复（restore-hint） |
| 22 | add_project_finance_settlement_columns | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 23 | add_project_archive_columns | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 24 | migrate_add_ended_status | schema | **C** | full | ❌ | 备份恢复（restore-hint） |
| 25 | migrate_record_date_to_timestamptz | schema | **C** | table(finance_records) | ❌ | 备份恢复（restore-hint） |
| 26 | migrate_project_date_columns_to_date | schema | **C** | table(projects) | ❌ | 备份恢复（restore-hint） |
| 27 | migrate_user_datetime_columns_to_timestamptz | schema | **C** | table(users, refresh_tokens, api_keys) | ❌ | 备份恢复（restore-hint） |
| 28 | migrate_encrypted_columns_to_text | schema | **A** | none | ❌ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 29 | widen_url_columns_to_text | schema | **A** | none | ❌ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 30 | migrate_all_datetime_columns_to_timestamptz | schema | **C** | full | ❌ | 备份恢复（restore-hint） |
| 31 | migrate_uuid_columns_to_native_uuid | schema | **C** | full | ❌ | 备份恢复（restore-hint） |
| 32 | create_wechat_oauth_tables | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 33 | create_user_roles_table | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 34 | migrate_installation_stage_to_delivery | data | **C** | table(projects, renovation_photos, l4_marketing_media) | ❌ | 备份恢复（restore-hint） |
| 35 | add_media_type_to_renovation_photos | schema | **B** | table(renovation_photos) | ✅ | dry-run 版脚本 + restore-hint（实跑随迭代追加） |
| 36 | add_counterparty_type_to_finance_records | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 37 | cleanup_reserved_contracts | data | **C** | table(project_contracts) | ❌ | 备份恢复（restore-hint） |
| 38 | rebuild_contract_no_index | data | **C** | table(project_contracts) | ❌ | 备份恢复（restore-hint） |
| 39 | migrate_permission_system | schema | **C** | table(roles, permissions, role_permissions, operation_logs) | ❌ | 备份恢复（restore-hint） |
| 40 | migrate_project_business_permission | seed | **B** | table(permissions, role_permissions) | ✅ | dry-run 版脚本 + restore-hint（实跑随迭代追加） |
| 41 | add_role_is_system_column | schema | **B** | table(roles) | ✅ | dry-run 版脚本 + restore-hint（实跑随迭代追加） |
| 42 | add_permission_risk_level_column | schema | **B** | table(permissions) | ✅ | dry-run 版脚本 + restore-hint（实跑随迭代追加） |
| 43 | add_permission_foreign_indexes | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 44 | add_reports_indexes | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 45 | add_lead_eval_history_and_expected_price | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 46 | add_lead_status_lost_to_competitor | schema | **C** | table(leads) | ❌ | 备份恢复（restore-hint） |
| 47 | add_lead_referrer_column | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 48 | add_project_document_category | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 49 | backfill_lead_total_price_from_expected | data | **B** | table(leads) | ✅ | dry-run 版脚本 + restore-hint（实跑随迭代追加） |
| 50 | backfill_lead_unit_price | data | **B** | table(leads) | ✅ | `0050_backfill_lead_unit_price`（实脚本） |
| 51 | create_community_images_table | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 52 | create_recruit_tables | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 53 | add_poster_bg_url_to_campaigns | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 54 | ensure_visit_referrer_index | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 55 | ensure_campaign_status_created_index | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 56 | create_project_booking_and_share_tables | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 57 | add_project_booking_status_column | schema | **B** | table(project_bookings) | ✅ | dry-run 版脚本 + restore-hint（实跑随迭代追加） |
| 58 | create_property_sheet_tables | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 59 | create_customer_follow_ups_table | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 60 | create_system_configs_table | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 61 | create_key_tables | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 62 | add_key_audit_share_id_index | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 63 | add_normal_key_seq_column | schema | **B** | table(project_normal_keys) | ✅ | dry-run 版脚本 + restore-hint（实跑随迭代追加） |
| 64 | add_project_key_note_column | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 65 | add_trgm_search_indexes | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 66 | add_lead_auditor_index | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 67 | create_marketing_subscription_tables | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 68 | add_published_at_to_l4_marketing_projects | schema | **B** | table(l4_marketing_projects) | ✅ | dry-run 版脚本 + restore-hint（实跑随迭代追加） |
| 69 | add_price_change_id_to_notify_logs | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 70 | add_price_change_id_index_to_notify_logs | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 71 | create_marketing_project_subscription_table | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 72 | widen_subscription_openid_columns | schema | **A** | none | ❌ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 73 | add_lead_referrer_index | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 74 | clear_wechat_session_key | data | **C** | table(users) | ❌ | 备份恢复（restore-hint） |
| 75 | migrate_uploads_to_oss | data | **C** | table(renovation_photos, property_media, l4_marketing_media, project_renovations, l4_marketing_projects, project_contracts, finance_records, leads) | ❌ | 备份恢复（restore-hint） |
| 76 | run_building_dictionary_migrations | schema | **C** | full | ❌ | 备份恢复（restore-hint） |
| 77 | widen_community_address_column | schema | **A** | none | ❌ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |
| 78 | backfill_bd_room_floor | data | **B** | table(bd_rooms) | ✅ | `0078_backfill_bd_room_floor`（实脚本） |
| 79 | recover_stale_bd_import_tasks | data | **B** | table(bd_import_tasks) | ✅ | dry-run 版脚本 + restore-hint（实跑随迭代追加） |
| 80 | run_bd_audit_20261017_fixes | schema | **C** | full | ❌ | 备份恢复（restore-hint） |
| 81 | run_bd_audit_20261018_fixes | schema | **C** | full | ❌ | 备份恢复（restore-hint） |
| 82 | create_biz_dict_items_table | schema | **A** | none | ✅ | DROP ... IF EXISTS（A 级通用补偿，带空表/行数守卫） |

> ✅ **原不确定项已核实（v35 `add_media_type_to_renovation_photos`）**：读源码确认该迁移
> **并非**仅 `ADD COLUMN DEFAULT` —— 它还调用 `_backfill_media_type(engine)`，按 URL 后缀
> 纠正被 `DEFAULT 'image'` 误标的存量视频行。因此维持 **B 级 + `backup=table(renovation_photos)`**，
> 补偿方式落地为「DROP COLUMN（列由本迁移新建时等价回滚）」，并在 `generic_drop.py:35`
> 的 `notes` 中显式标注「含对既有行的视频标记，删列会一并丢失」。
>
> ✅ **v23 口径纠偏**：原表 v23 记为 `migrate_add_ended_status`，但实测 `_run_all_migrations`
> 在该位置还有 `add_project_archive_columns`（项目归档三列）。本表已按注册表逐项重排，
> v23=`add_project_archive_columns`、v24=`migrate_add_ended_status`，后续顺延（见总纲 §1 B8）。

---

## 12. 任务拆解

| 任务 | 内容 | 产出文件 | 估算 | 验证点 |
|------|------|---------|:----:|--------|
| **T1.1** | 版本表/审计表 + ORM + `ensure_version_tables` | `models/system/schema_migration.py`、`migrations/schema_migrations.py` | 1.5d | 连跑两次建表无错；`\d schema_migrations` 与 §4.1 一致 |
| **T1.2** | 注册表 82 项（本文 §11 逐条落码） | `migrations/registry.py` | 2d | 5 条登记期不变量单测全绿 |
| **T1.3** | 执行器（锁/校验和/pending/failed/阻断文案） | `migrations/runner.py`、`migrations/__init__.py` 重构 | 2d | 全新库→82 applied；重复启动 0 pending；篡改源码→阻断 |
| **T1.4** | baseline + 空表判定 + legacy 开关 | `runner.py`、`manage.py` | 1d | 既有库阻断；`baseline --confirm` 后 82 条；`--dry-run` 不写库 |
| **T1.5** | 备份模块 + Dockerfile/compose/挂载/保留 | `migrations/backup.py`、`Dockerfile`、`docker-compose.yml` | 2d | `pg_dump` 存在；备份失败中止；prune 不删最新 |
| **T1.6** | 补偿框架 + A 级通用 + 3 个 B 级脚本 | `migrations/compensations/**` | 3d | dry-run 不改数据；行数上限生效；生产双确认拒绝 |
| **T1.7** | CLI 7 命令 + `--json` + 退出码 | `migrations/manage.py` | 1.5d | 7 命令各有 `test_manage_cli.py` 用例 |
| **T1.8** | 测试：单测 7 个文件 + E2E 1 个 + parity | `backend/tests/test_migration_*.py`、`tests/e2e/test_migration_runner.py` | 2d | §13 清单逐项绿 + 工件归档 |
| **T1.9** | runbook（发布/事故/恢复/基线四段） | `docs/Base/migrations-runbook.md` | 1d | 4 段均含可直接复制的命令 |
| **T1.10** | staging 演练（§14 A6） | `docs/Done/2026-XX-XX-迭代一验收报告.md` | 1d | 演练 ≤30 分钟并留时间戳记录 |

**合计 ≈ 16.5 人日**（2 名后端 ≈ 2 周，与计划稿一致）。

**依赖顺序**：T1.1 → T1.2 → T1.3 → (T1.4 ∥ T1.5) → T1.6 → T1.7 → T1.8 → T1.9 → T1.10。

---

## 13. 测试策略（写代码前先写失败清单，见 §15）

### 13.1 单测（`backend/tests/`）

| 文件 | 覆盖 |
|------|------|
| `test_migration_registry.py` | 版本连续/顺序对齐 legacy/name 唯一/append-only/`__post_init__` 三校验/补偿模块可导入 |
| `test_migration_checksum.py` | 稳定（注释/空行改动不改 checksum）/ 敏感（逻辑改动改 checksum）/ 三方模块函数可取源码 |
| `test_migration_runner.py` | 全新库全量执行 / 重复启动 0 pending / failed 阻断 / retry 成功清零 / 空版本表+有数据阻断 / legacy 开关 |
| `test_migration_backup.py` | 命令构造不含密码 / 0 字节中止 / sha256 一致 / prune 不删最新 / 磁盘不足拒绝 |
| `test_migration_compensation.py` | dry-run 不改数据 / 超行数拒绝 / 事务回滚 / 通用 DROP 空表守卫 / 不可逆拒绝 / 生产双确认 |
| `test_migration_model_parity.py` | `schema_migrations`/`migration_compensations` 的 `information_schema` 与 ORM 逐列一致（C2 契约） |
| `test_manage_cli.py` | 7 命令 × 正常/异常路径 + `--json` 结构 + 退出码 |

### 13.2 E2E（`backend/tests/e2e/test_migration_runner.py`）

真实 PG + 真实 `pg_dump`（测试库），流程：

1. 建空库 → `run_startup_migrations` → 断言 82 applied。
2. 注入一个「必然失败」的临时 Migration（v999）→ 断言启动抛错 + `failed` 行 + `error` 非空 + 备份文件存在。
3. `retry 999` → 改为成功桩 → 断言 applied。
4. 篡改 v49 源码 checksum → 断言阻断 + 报错含 expected/actual → `rebaseline 49` → 断言放行且审计有记录。
5. 对 v49 执行 `compensate --dry-run`（断言 0 变化）→ `--yes`（断言 `unit_price IS NULL` 行数 == dry-run 预估）→ 再跑 `up` 恢复。
6. 公网/CLI 双路径：`python -m migrations.manage status --json | jq '.total'` == 82。

产出：`backend/tests/e2e/artifacts/migration-e2e-YYYYmmdd-HHMMSS.txt`（脚本 `tests/e2e/run_migration_e2e.sh`，仿 `run_all.sh` 的 `tee` 模式）。

### 13.3 回归

- 既有 pytest 全量（`cd backend && .venv/bin/pytest -q`）——迁移重构不得改变任何业务行为。
- 应用启动冒烟：`curl -s localhost:8000/health` 200；登录 + 3 个核心列表接口（projects/leads/marketing）200。

---

## 14. 验收标准（可勾选 + 命令 + 预期）

| # | 验收项 | 命令 | 预期 |
|---|--------|------|------|
| A1 | 全新库自动全量 | `dropdb/createdb` → 起后端 | 日志 `迁移状态：applied=82 pending=0 failed=0`；`manage status --json \| jq .applied` → `82` |
| A2 | 重复启动零 pending | 再起一次 | `pending=0`；启动增量耗时 ≤ 2s（3 次中位数） |
| A3 | 既有库未基线阻断 | 删 `schema_migrations` 后起后端 | 启动失败，文案含 `manage baseline --confirm` |
| A4 | baseline 成功 | `manage baseline --confirm` | 82 条 applied；有 `action='baseline'` 审计行 |
| A5 | checksum 阻断 | 手工改 v49 函数一行逻辑 → 起后端 | 失败，报错含 `version=49 / expected / actual` |
| A6 | 备份强制 | `chmod 000` 备份目录（或 `PATH` 隐藏 pg_dump）→ 起后端跑 pending | 迁移未执行；`status='failed'`、`error` 前缀 `backup_failed` |
| A7 | 补偿 dry-run 无副作用 | `manage compensate 49 --dry-run` | 输出预计行数；`SELECT count(*) WHERE unit_price IS NULL` 不变 |
| A8 | 补偿实跑 | `manage compensate 49 --yes` | 行数与 dry-run 一致；审计 `result='success'`、`affected_rows` 非空 |
| A9 | 不可逆拒绝 | `manage compensate 73 --yes` | 退出码 2；输出 `restore-hint 73` 指引；无 DML |
| A10 | 保留策略 | 造 25 个 30 天+ 旧文件 → 启动 | 只留 20 份（或最新 1 份保底）；日志有 prune 计数 |
| A11 | 单测/E2E 全绿 | §13 命令 | 全绿 + 工件文件存在 |
| A12 | runbook 可执行 | 按 runbook 四段逐条复制执行（staging） | 四段全部一次通过，无「需要现场推断」的步骤 |

> **A12 是硬标准**：runbook 里任何一条命令若需读者自行补参数，视为未完成。

---

## 15. 风险与回滚

### 15.1 失败模式先列（写在代码之前，AGENTS 要求）

| 会怎么坏 | 症状 | 防线 |
|---------|------|------|
| checksum 因格式化改动误报 | 启动被阻断，无法发布 | K4 归一化 + `rebaseline` + 单测 |
| `inspect.getsource` 对动态/decorated 函数失效 | 全部 checksum 变成空串 → 永远一致（假安全） | 单测断言 checksum 长度 64 且互不相同 |
| `pg_dump` 版本低于 server | 备份直接失败，迁移全停 | Dockerfile 固定 client 大版本 ≥ 16；runbook 记录检查命令 |
| 备份目录不可写（非 root 容器） | 每次迁移都失败 | `mkdir` + `chmod 700` 在启动期做一次并打日志；`compose` 挂载 `./backups` 需 `chown 1001` |
| baseline 在 2 worker 下被并发触发 | 重复执行/锁冲突 | 全流程持同一 advisory lock；CLI 也持锁 |
| 部分提交后 `failed` 落到错误版本 | 后续 `retry` 跑错项 | 只在当前迁移执行前/后写记录（不做批量预写）；`error` 保留堆栈 |
| 补偿脚本算错行数 | 二次伤害 | dry-run 强制 + 上限 + 单事务 + staging 演练 |
| `restore-hint` 给出的命令不可用 | 事故时无路可走 | A12 要求逐条验证 |
| 新迁移忘记登记 | 代码上了但表没建（静默） | 启动期断言：`migrations/` 下 `def *_migrations*/def md5` 未登记函数检测 → 单测 `test_no_unregistered_migration_callables`（白名单机制，白名单需注释理由） |

### 15.2 回滚（本迭代自身）

1. `MIGRATION_LEGACY_MODE=true` → 立刻回到旧硬编码路径（版本表冗余存在但不参与决策）。
2. 完全回退：`git revert` 本迭代提交 + 保留两张空表（不影响业务）。
3. **legacy 退出条件**：下一个 release 发布成功后删除 `MIGRATION_LEGACY_MODE`、旧 `_run_all_migrations` 与 `test_registry_matches_legacy_order` 中的源码解析逻辑；删除前必须在 runbook 标注「已观察 N 个 release 无异常」。

---

## 16. 交付物清单

**新增**

```
backend/migrations/registry.py
backend/migrations/runner.py
backend/migrations/backup.py
backend/migrations/manage.py
backend/migrations/schema_migrations.py            # 建表 + 状态读写
backend/migrations/compensations/__init__.py
backend/migrations/compensations/base.py
backend/migrations/compensations/registry.py
backend/migrations/compensations/generic_drop.py
backend/migrations/compensations/0004_populate_phone_hash.py
backend/migrations/compensations/0049_backfill_lead_unit_price.py
backend/migrations/compensations/0077_backfill_bd_room_floor.py
backend/models/system/schema_migration.py
backend/tests/test_migration_registry.py
backend/tests/test_migration_checksum.py
backend/tests/test_migration_runner.py
backend/tests/test_migration_backup.py
backend/tests/test_migration_compensation.py
backend/tests/test_migration_model_parity.py
backend/tests/test_manage_cli.py
backend/tests/e2e/test_migration_runner.py
backend/tests/e2e/run_migration_e2e.sh
docs/Base/migrations-runbook.md
docs/Done/2026-XX-XX-迭代一验收报告.md        （收尾时）
```

**修改**

```
backend/migrations/__init__.py        # run_startup_migrations 委托 runner；_run_all_migrations 保留（legacy）
backend/models/system/__init__.py     # 导出新模型
backend/models/__init__.py            # 导出新模型
backend/settings.py                   # 9 个 MIGRATION_* 字段
backend/Dockerfile                    # postgresql-client + 备份目录
docker-compose.yml                    # ./backups 挂载 + MIGRATION_* 透传
.env.docker.example                   # 新变量 + 注释
```

---

## 17. 环境变量

| 变量 | 默认 | 说明 | 校验 |
|------|------|------|------|
| `MIGRATION_BACKUP_DIR` | `/app/backups/migrations` | 备份目录（compose 挂 `./backups:/app/backups`） | 启动期 `mkdir -p` + `chmod 700`；不可写则 WARNING |
| `MIGRATION_BACKUP_RETENTION_DAYS` | `30` | 保留天数 | `>=1` |
| `MIGRATION_BACKUP_MAX_COUNT` | `20` | 最多份数 | `>=1` |
| `MIGRATION_BACKUP_MODE` | `on` | `on`/`off` | `off` 且 `DEBUG=false` → **启动拒绝** |
| `MIGRATION_BACKUP_MIN_FREE_MB` | `2048` | 备份前磁盘余量下限 | `>=100` |
| `MIGRATION_AUTO_BASELINE` | `false` | 开发/测试自动 baseline | `DEBUG=false` 时忽略 + WARNING |
| `MIGRATION_LEGACY_MODE` | `false` | 回退旧执行器 | — |
| `MIGRATION_PRODUCTION_CONFIRM` | 空 | 生产补偿双确认口令 | 非空时须等于 `MIGRATION_ENV_NAME` |
| `MIGRATION_ENV_NAME` | `production` | 当前环境名 | — |
| `MIGRATION_COMPENSATION_MAX_ROWS` | `10000` | 补偿行数上限 | `>=1` |
| `MIGRATION_OPERATOR` | 空 | 审计 operator（空则用 `user@host:pid`） | — |

---

## 18. ⚠️ 未覆盖 / 不确定（Fail Loud）

1. **⚠️ v34 补偿边界未定**：需实现时读 `migrations/add_media_type_column.py` 确认是否回填存量行，据此定 A 或 B（见 §11 注）。
2. **⚠️ C 级 25 项只给 runbook，不承诺「一键恢复」**：单表 `pg_restore` 需处理「恢复期间新增行」的合并语义，本期只提供「恢复到新库 + 手工比对」流程，不写自动化合并脚本。
3. **⚠️ D 级 0 项是当前结论**：若后续把「上传 OSS 后删本地源文件」的带外脚本纳入启动迁移，该项必须重评为 D 并禁用自动执行。
4. ~~`pg_dump` 与 PG16 server 的兼容性未在本机验证~~ → **已实测并落地为代码校验**（B9）：
   本机 client 16.15 / 18.6、server 16.15。导出方向均已验证可用；**恢复方向发现真实缺陷**：
   client 18.6 的归档（格式 1.16）无法被 PG16 的 `pg_restore` 读取。已通过
   `backup_client` 审计字段 + `restore-hint` 的版本感知命令 + runbook §5 实测配方覆盖。
   ⚠️ 仍**未覆盖**：跨大版本自动恢复脚本（需起临时 PG 容器，本期不做，spec §18.2 边界）。
5. **baseline 最坏耗时已实测**（T1.10）：本机单 worker 82 项 + 2 次 57MB 全库备份 ≈ **58 秒**；2 worker 因 advisory lock 串行化不会翻倍（第二个 worker 仅做零 pending 检查）。远小于 D-01 的 30–60 分钟窗口。

---

## 19. 实施记录（2026-10-19 收尾）

> 完整验收材料见 `docs/Done/2026-10-19-迭代一验收报告.md`；
> E2E 工件 `backend/tests/e2e/artifacts/migration-e2e-20261019-234942.txt`（24/24）。

### 19.1 任务完成度

| 任务 | 状态 | 产出 | 验证 |
|------|:----:|------|------|
| T1.1 账本表 + ORM + `ensure_version_tables` | ✅ | `migrations/schema_migrations.py`、`models/system/schema_migration.py` | `test_migration_model_parity.py`（5 用例，逐列/可空/主键/唯一/时区） |
| T1.2 注册表 82 项 | ✅ | `migrations/registry.py` | `test_migration_registry.py`（9 用例，含 legacy AST 顺序比对、未登记检测） |
| T1.3 执行器 | ✅ | `migrations/runner.py` | `test_migration_runner.py`（19 用例） |
| T1.4 baseline + 空表判定 + legacy | ✅ | `runner.baseline` / `manage baseline` | 本机开发库实跑 82 项 57.99s；`test_baseline_*`（4 用例） |
| T1.5 备份模块 + Dockerfile/compose | ✅ | `migrations/backup.py`、`Dockerfile`、`docker-compose.yml`、`.env.docker.example` | `test_migration_backup.py`（25 用例）+ E2E ④ 真实 pg_dump |
| T1.6 补偿框架 + A 级通用 + 3 个 B 级 | ✅ | `migrations/compensations/**`（7 文件，44 项 A 级 + 3 脚本） | `test_migration_compensation.py`（20 用例）+ E2E ⑤⑦ |
| T1.7 CLI 8 命令 | ✅ | `migrations/manage.py` | `test_manage_cli.py`（19 用例） |
| T1.8 测试 7 单测 + 1 E2E + parity | ✅ | `backend/tests/test_migration_*.py`、`test_manage_cli.py`、`tests/e2e/test_migration_runner.py` + `run_migration_e2e.sh` | 123 passed；E2E 24/24 |
| T1.9 runbook | ✅ | `docs/Base/migrations-runbook.md`（10 节） | 逐段执行，修复 2 处不可执行命令 |
| T1.10 演练 | ✅（本机） | `docs/Done/2026-10-19-迭代一验收报告.md` | 82 项 baseline 57.99s；补偿演练 945 行；恢复验证 977==977 |

### 19.2 与 spec 的差异（均已按 §10 变更控制登记）

| 项 | spec 原口径 | 实施结论 | 登记位置 |
|----|------------|---------|---------|
| 迁移项数 | 80（总纲 B1） | **82** | 总纲 §1 **B8** |
| `NEXT_VERSION` | 81 | **83** | 总纲 §1 **B8**；`registry.NEXT_VERSION` |
| §11 表 v23 起 | v23=`migrate_add_ended_status` | v23=`add_project_archive_columns`，后续顺延 | 本文 §11 已重排 |
| MVP 脚本版本 | v49 / v77 | **v50 / v78** | 本文 §11、§9.2 |
| `CompensationContext` | 5 字段 | **6 字段**（+`force`） | 本文 §9.1 已补；`compensations/base.py` docstring |
| `backup_client` 列 | 无 | **新增**（`schema_migrations.backup_client`） | 总纲 §1 **B9**；本文 §8 |
| 备份前版本校验 | 无 | **`assert_client_compatible`** | 总纲 §1 **B9**；本文 §8 |
| 恢复命令执行容器 | `db` | **`backend`**（同版本客户端） | 总纲 §1 **B9**；runbook §5 |
| `build_dump_command` 入参 | `database_url: str` | `str \| URL`（避免密码被渲染 `***`） | 总纲 §1 **B10** |

### 19.3 分数更新（相对 §11 原统计）

| 级别 | 原统计 | 实测 | 说明 |
|------|-------|------|------|
| A | 44 | **46** | 新增 v23（archive 列）、v82（biz_dict 表） |
| B | 11 | **13** | v23 后顺延导致 v35（media_type）计入，v79（recover_stale）为 B 级 data |
| C | 25 | **23** | v23 重排后，原 v21/v23 等归位；v82 为 A |
| D | 0 | **0** | 无变化 |

> 权威来源：`python -c "from collections import Counter; from migrations.registry import MIGRATIONS; print(Counter(m.risk for m in MIGRATIONS))"`
> → `{'A': 46, 'C': 23, 'B': 13}`
