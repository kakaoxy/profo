# 启动迁移 Runbook（迭代一 · 发布 / 事故 / 恢复 / 基线）

> **适用版本**：`iter1-migrations`（迁移版本化与可回滚）
> **权威口径**：`docs/To-Do/SPEC-iteration1-migrations.md`（下文 § 均指该文档）
> **原则**：本文件里**每一条命令都能直接复制执行**，不含「请自行补参数」的步骤（验收项 A12）。

---

## 0. 一分钟速查

```bash
# 当前状态（人类可读）
docker compose exec backend .venv/bin/python -m migrations.manage status

# 当前状态（给脚本/巡检消费）
docker compose exec backend .venv/bin/python -m migrations.manage status --json | jq '.applied, .pending, .failed'

# 自检（注册表 / checksum / 备份 sha256 / failed）
docker compose exec backend .venv/bin/python -m migrations.manage verify

# 某版本的恢复指引（含可直接执行的 pg_restore 命令）
docker compose exec backend .venv/bin/python -m migrations.manage restore-hint 50
```

**版本表为什么不由迁移创建**（总纲 C2 唯一豁免）：`schema_migrations` 记录「已执行到第几版」，
若它自身也登记为一个迁移，就会形成「版本表自己的版本」的自举悖论（第一次启动时版本表不存在，
无法记录「创建版本表」这件事）。因此两张账本表由执行器建表阶段用 `CREATE TABLE IF NOT EXISTS`
创建，等价于「schema 的 schema」，不参与版本序列。同理，`migration_compensations` 是纯审计流水。

**当前口径**：注册表 **82 项**（`version=1..82`），下一个可用版本号 **83**（`registry.NEXT_VERSION`）。
> 与计划稿的 77/80 差异见总纲 §1 的 B1/B8：实测 `_run_all_migrations` 有 82 个顶层调用
> （多出 `add_project_archive_columns` / `create_biz_dict_items_table`）。

---

## 1. 发布前（每次上线必做）

```bash
# 1) 确认目标环境当前账面干净（应为 pending=0 failed=0）
docker compose exec backend .venv/bin/python -m migrations.manage status | tail -3

# 2) 全库备份（部署脚本已自带；非部署路径的手工发版务必手动做一次）
docker compose exec -T db bash -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip \
  > "backups/backup_$(date +%Y%m%d_%H%M%S).sql.gz"

# 3) 预演：列出本次将执行哪些迁移（不写库、不备份）
docker compose exec backend .venv/bin/python -m migrations.manage status --json \
  | jq -r '.migrations[] | select(.status=="pending") | "v\(.version)\t\(.risk)\t\(.backup_scope)\t\(.name)"'
```

**判读**：若 `pending` 列表里出现 `risk=C` 或 `risk=D`，必须先看 §5 的恢复路径与备份是否就位。

---

## 2. 发布（正常路径）

```bash
# 方式 A：走部署脚本（推荐，脚本内含全库备份与健康检查）
./deploy-local.sh

# 方式 B：只重启后端，让启动迁移执行（--reload 不会触发 lifespan，需重启进程）
docker compose up -d --no-deps backend
docker compose logs -f backend | grep -E '迁移状态|MIGRATION'

# 方式 C：手工执行 pending（等价启动流程，但不跑 init_db，不重启服务）
docker compose exec backend .venv/bin/python -m migrations.manage up
```

**成功标志**（日志里一行结构化摘要）：

```
迁移状态：applied=82 pending=0 failed=0 executed_now=N duration_ms=...
```

**审计链异常标志**（⚠️ 必须处理）：

```
[ALARM] MIGRATION_LEDGER_WRITE_FAILED version=<v> name=<name> status=<applied|failed> ...
迁移状态：... audit_chain_broken=true（本条审计链缺失，见上方 MIGRATION_LEDGER_WRITE_FAILED 告警）
```

该告警表示**版本账本写不进去**：迁移可能已在库上成功，但账本没记住。此时
「备份失败/执行失败 → 写 `failed` → 下次启动阻断」这条保护链**已失效**，必须立即排查
`schema_migrations` 可写性与数据库连接（见 §3.4）；修复后重跑 `manage up` 补齐账本。

健康检查：

```bash
curl -fsS http://127.0.0.1:8000/health
# 期望：{"status":"healthy","database":"connected"}
```

---

## 3. 事故处置

### 3.1 启动被阻断：存在 failed 记录

**现象**（后端容器反复重启，日志出现）：

```
[FATAL] 迁移状态异常：存在 1 条 failed 记录
  v049_backfill_lead_unit_price  时间：...  耗时：812ms
    错误：OperationalError: ...
    备份：/app/backups/migrations/20261019-145620_v049_backfill_lead_unit_price.dump
下一步（择一）：
  1) 修复后重试：... manage retry 49 --reason "修复后重试"
  2) 回滚该迁移：... manage compensate 49 --dry-run
  3) 查看全量状态：... manage status
```

**处置顺序（不要跳步）**：

```bash
# ① 看清失败原因与备份是否就位
docker compose exec backend .venv/bin/python -m migrations.manage status
docker compose exec backend .venv/bin/python -m migrations.manage verify
docker compose exec db ls -l /dev/null  # 占位：真实备份在宿主 ./backups/migrations/
ls -lt backups/migrations | head -5

# ② 修好根因（改代码/补权限/恢复连接）后重试该版本（幂等）
docker compose exec backend .venv/bin/python -m migrations.manage retry 49 \
  --reason "修复 XXX 后重试"

# ③ 或判定该迁移必须回退（先演练，确认行数合理）
docker compose exec backend .venv/bin/python -m migrations.manage compensate 49 --dry-run
docker compose exec backend .venv/bin/python -m migrations.manage compensate 49 \
  --yes --reason "回退 v49 回填"

# ④ 复核
docker compose exec backend .venv/bin/python -m migrations.manage status | tail -3
```

> ⚠️ **不要在 failed 状态直接重启容器期望自愈**：执行器按设计**不自动重试**，
> 避免「反复失败-重启」掩盖问题（K6）。

### 3.2 启动被阻断：checksum 不匹配

**现象**：

```
[FATAL] 迁移源码校验和不匹配（已应用的迁移被修改）
  version=49 name=backfill_lead_unit_price
    expected=...
    actual  =...
```

**两条合法修复路径**（没有第三条）：

```bash
# 路径 A：确属「无行为变化的重构」（改名/提取变量/补类型注解/格式化）
docker compose exec backend .venv/bin/python -m migrations.manage rebaseline 49 \
  --reason "提取常量，无行为变化"

# 路径 B：确有行为变化 → 撤销对旧函数的修改，把变更写成**新的追加迁移**
#   1) 回退对 migrations/*.py 中既有函数逻辑的修改
#   2) 在 backend/migrations/ 新增模块 + 在 registry.MIGRATIONS 末尾追加（version=83）
#   3) 重启后端 → 新版本自动执行
docker compose exec backend .venv/bin/python -m migrations.manage status --json | jq '.checksum_mismatch'
```

### 3.3 启动被阻断：既有库未基线

**现象**：

```
[FATAL] 检测到既有数据库（users/projects/leads 非空）但迁移版本表为空。
```

**处置**：见 §4（这是**需要维护窗口**的操作，不要在高峰期做）。

### 3.4 备份失败导致迁移未执行

**现象**：`manage status` 里该版本 `status=failed`，`error` 前缀 `backup_failed:`。

排查顺序：

```bash
# ① pg_dump 是否存在（K9：缺失即报错，不会静默跳过）
docker compose exec backend sh -c 'command -v pg_dump && pg_dump --version'

# ② 客户端大版本是否 ≥ 服务端（client 必须 >= server major）
docker compose exec backend sh -c 'pg_dump --version'
docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc 'SHOW server_version'

# ③ 备份目录可写 + 权限（应为 0700，属主 app:app）
docker compose exec backend sh -c 'ls -ld /app/backups/migrations; touch /app/backups/migrations/.probe && rm /app/backups/migrations/.probe && echo WRITABLE'

# ④ 磁盘余量（低于 MIGRATION_BACKUP_MIN_FREE_MB 会直接拒绝）
docker compose exec backend df -h /app/backups

# 修好后重试
docker compose exec backend .venv/bin/python -m migrations.manage retry <version> --reason "修复备份后重试"
```

宿主目录权限修复（若容器内不可写）：

```bash
mkdir -p backups/migrations
sudo chown -R 1001:1001 backups      # 容器内 USER app = uid 1001
chmod 700 backups/migrations
```

> `deploy-server.sh` 已在启动容器前执行上述步骤（§2.1 准备迁移备份目录）。
> 若目录是**手建**或由 docker 自动创建的，属主会是 root → `create_backup` 写入失败 →
> `backup_failed` → 迁移中止 → 容器反复重启（compose `restart: unless-stopped`）。

### 3.5 需要立刻停止迁移（逃生阀）

```bash
# 在 .env 增加一行后重启后端 → 回退到旧硬编码路径（版本表保留但不参与决策）
echo 'MIGRATION_LEGACY_MODE=true' >> .env
docker compose up -d --no-deps backend
docker compose logs --tail=50 backend | grep -i legacy
# 期望日志：MIGRATION_LEGACY_MODE 已启用，跳过版本化执行器，回退旧硬编码迁移路径
```

**退出条件**（spec §15.2）：下一个 release 发布成功、观察期无异常后，删除该开关与旧
`_run_all_migrations`。删除前必须在本节标注「已观察 N 个 release 无异常」。

---

## 4. 既有库基线（维护窗口 30–60 分钟，D-01）

**触发条件**：本库在版本化执行器上线前就已有数据（`users`/`projects`/`leads` 任一非空），
版本表为空。此时直接执行全部迁移会重复改写历史数据，必须**先登记基线**。

### 4.1 staging 先演练（必做，D-01）

```bash
# ① 预演：只打印计划，不写库、不备份
docker compose exec backend .venv/bin/python -m migrations.manage baseline --dry-run

# 期望输出包含：
#   baseline --dry-run：将执行 82 项（其中 C/D 级 23 项：v3_..., v9_...），需要一次 full 备份；不写库不备份

# ② 全库备份（第二层防线；第一层是执行器内的版本备份）
docker compose exec -T db bash -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip \
  > "backups/baseline_staging_$(date +%Y%m%d_%H%M%S).sql.gz"

# ③ 实跑（自动做一次 full 备份，然后逐条幂等执行 + 登记）
time docker compose exec backend .venv/bin/python -m migrations.manage baseline --confirm

# 实测参考（本机 82 项 + 1 次全库备份）：约 58 秒
# ⚠️ v2 起 baseline **只做 1 次**全库备份（逐条备份跳过，见 runner.baseline 注释）：
#    此前实现会额外触发 28 次单表 + 8 次全库 dump（共 9 次整库 dump），既有库上极慢。
# ④ 核对
docker compose exec backend .venv/bin/python -m migrations.manage status | tail -3
# 期望：迁移状态：applied=82 pending=0 failed=0 total=82
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
  "SELECT action, result, affected_rows, notes FROM migration_compensations ORDER BY id DESC LIMIT 1"
# 期望：baseline|success|82|baseline 登记 82 项；全库备份 /app/backups/migrations/...
```

### 4.2 生产执行

```bash
# ① 前置核对（D-01 要求）
docker compose exec backend .venv/bin/python -m migrations.manage status --json | jq '.applied, .failed'
docker compose exec backend df -h /app/backups          # 余量 >= MIGRATION_BACKUP_MIN_FREE_MB
ls -lt backups/ | head -3                                # 全库备份就在手边

# ② 实跑（同 staging 命令）
docker compose exec backend .venv/bin/python -m migrations.manage baseline --confirm

# ③ 立即核对
docker compose exec backend .venv/bin/python -m migrations.manage verify
curl -fsS http://127.0.0.1:8000/health
```

**中途失败的处置**：`baseline` 的每一项都是幂等的，失败项写入 `failed` 后**保留已完成记录**，
退出码 1。修复后直接重跑同一条 `baseline --confirm` 即可续跑（不会重复执行已登记项）。

```bash
# 若重跑仍失败，先处理 failed 项再继续
docker compose exec backend .venv/bin/python -m migrations.manage retry <version> --reason "baseline 续跑"
```

### 4.3 开发/测试环境的自动基线（禁止用于生产）

```bash
# .env（仅 DEBUG=true 生效；DEBUG=false 时该开关被忽略并打 WARNING）
echo 'MIGRATION_AUTO_BASELINE=true' >> .env
```

---

## 5. 恢复（按备份恢复某版本）

本迭代**只提供**「恢复到临时库 + 手工比对」流程，**不写自动合并脚本**
（spec §18.2 已声明该边界：单表 `pg_restore` 需处理「恢复期间新增行」的合并语义）。

```bash
# ① 取该版本的备份路径与恢复命令（全部可直接复制执行）
docker compose exec backend .venv/bin/python -m migrations.manage restore-hint 50
```

输出示例（**以下配方已在本机实测跑通**，2026-10-19，client 18.6 / server 16.15）：

```text
# 恢复指引：v50 backfill_lead_unit_price（kind=data risk=B）
# 备份范围：table  表：leads
# 备份文件：/app/backups/migrations/20261019-150959_v050_....dump

# ⚠️ 归档格式与客户端版本强绑定（实测）：
#    pg_dump ≥17 产出的归档是 1.16 版，PG16 自带的 pg_restore 会直接拒绝：
#      pg_restore: error: unsupported version (1.16) in file header
#    ⇒ 恢复必须用产生该备份的同一大版本客户端（即 backend 容器，不是 db 容器）
```

**实测验证记录**（可复现）：

```text
$ restore_check 恢复结果
restored_leads=977     # 从 v050 的 data-only 备份恢复
prod_leads=977         # 与生产一致 ✓
```

> ⚠️ **两个实测坑（已在 `restore-hint` 输出里写明，勿自行简化）**：
> 1. **不能用 db 容器恢复**：`pg_restore` 必须与 `pg_dump` 同大版本，否则直接
>    `unsupported version (1.16) in file header`。本迭代的备份由 backend 容器内的
>    `postgresql-client` 产出，因此恢复也在 backend 容器执行。
> 2. **`--data-only` 恢复时不要加 `--table` 过滤**：实测 `--table=public.leads`
>    会**静默灌 0 行**（退出码 0、无报错），不加反而正常灌入全部表数据。
>    首次恢复务必按 `restore-hint` 输出的行数核对（步骤 2）确认非 0。

**生产补偿的双确认**（K13，`DEBUG=false` 时强制）：

```bash
# 需同时满足：--yes 且 MIGRATION_PRODUCTION_CONFIRM == MIGRATION_ENV_NAME（默认 production）
docker compose exec -e MIGRATION_PRODUCTION_CONFIRM=production backend \
  .venv/bin/python -m migrations.manage compensate 50 --yes --reason "生产回退 v50"
```

**行数上限**：影响行数 > `MIGRATION_COMPENSATION_MAX_ROWS`（默认 10000）时需加 `--force`：

```bash
docker compose exec backend .venv/bin/python -m migrations.manage compensate 50 \
  --yes --force --reason "确认可丢弃 12000 行回填值"
```

---

## 6. 补偿能力矩阵（哪些能回滚、哪些只能恢复）

| 类型 | 覆盖 | 命令 | 说明 |
|------|------|------|------|
| **实脚本（B 级）** | v4 / v50 / v78 | `compensate <v> --dry-run` → `--yes` | `--dry-run` 只统计；v50 只清「公式可复现」的行（保守反向） |
| **A 级通用 DROP** | 44 项（见 `migrations/compensations/generic_drop.py`） | 同上 | 表非空时**拒绝**，需 `--force` 显式确认 |
| **C 级（25 项）** | 加密 / 删列 / 改类型 / 枚举 / 多表改写 | `restore-hint <v>` | 只能按备份恢复；不提供「一键合并」 |
| **D 级** | 当前 0 项 | — | 若未来出现外部副作用类迁移，必须人工评审后手工执行 |

完整分级见 spec §11 矩阵（`docs/To-Do/SPEC-iteration1-migrations.md`）。

**已验证的实跑样例**（本机实测，可复现）：

```text
$ manage compensate 50 --dry-run
  v50 backfill_lead_unit_price：dry-run 预计影响 945 行
$ manage compensate 50 --yes --reason "演练"
  v50 backfill_lead_unit_price：已影响 945 行
$ manage compensate 3 --dry-run
  [REFUSED] v3 encrypt_existing_phones（风险 C）不可自动补偿，请使用 restore-hint
  退出码 2
```

---

## 7. 备份保留与磁盘

| 变量 | 默认 | 行为 |
|------|------|------|
| `MIGRATION_BACKUP_DIR` | `/app/backups/migrations`（compose 挂 `./backups`） | 目录权限 0700，文件 0600 |
| `MIGRATION_BACKUP_RETENTION_DAYS` | 30 | 与份数**同时满足**才删 |
| `MIGRATION_BACKUP_MAX_COUNT` | 20 | 始终保留最新 1 份 |
| `MIGRATION_BACKUP_MIN_FREE_MB` | 2048 | 不足则拒绝备份 → 该迁移不执行 |

```bash
# 查看份数/总大小/余量
docker compose exec backend .venv/bin/python -m migrations.manage status --json | jq '.backups'

# 手工清理（执行器每次启动会自动 prune，异常只告警不影响启动）
ls -lt backups/migrations | tail -5
```

> ⚠️ **两层备份不要混用**：`deploy-server.sh` 的 `backup_*.sql.gz` 是**全库 plain SQL**
> （回放用）；本模块的 `*_vNNN_*.dump` 是**custom 格式 + 版本关联**（可单表 `pg_restore`）。

---

## 8. 新增迁移的标准动作（防止「代码上了但表没建」）

```bash
# 1) 新迁移函数放在 backend/migrations/<module>.py，保持 fn(engine: Engine) -> None 签名
# 2) 在 registry.MIGRATIONS 末尾追加（version 用 NEXT_VERSION，当前 83）
# 3) 同步追加到 migrations/__init__.py::_run_all_migrations（legacy 路径，保留 1 个 release）
# 4) 补备份/风险元数据：
#    - 纯新增 → risk=A, backup=none, reversible=True
#    - 确定性回填 → risk=B, backup=table, reversible=True（并写补偿脚本）
#    - 删列/改类型/加密/枚举 → risk=C, backup=table|full, reversible=False
# 5) 跑登记期不变量测试
cd backend && .venv/bin/pytest tests/test_migration_registry.py -q --no-cov
```

**测试会拦住的三类错误**：
- `test_registry_matches_legacy_order`：注册表顺序与 legacy 路径不一致；
- `test_no_unregistered_migration_callables`：新函数写了但没登记（白名单需注释理由）；
- `test_registry_metadata_self_check`：`C/D` 级声明了 `reversible=True` 或 `backup=none`。

---

## 9. 排障速查表

| 症状 | 最可能原因 | 首条命令 |
|------|-----------|---------|
| 后端反复重启，日志含 `[FATAL] 迁移状态异常` | 存在 failed 记录 | `manage status` |
| 日志含 `迁移源码校验和不匹配` | 已应用迁移的源码被改 | `manage verify` |
| 日志含 `既有数据库...但迁移版本表为空` | 未基线 | `manage baseline --dry-run` |
| 日志含 `MIGRATION_LEDGER_WRITE_FAILED` / `audit_chain_broken=true` | 版本账本不可写（阻断链失效） | §3.4 ①–③ + `manage status` |
| `failed` 行 `error` 以 `backup_failed` 开头 | pg_dump 缺失/权限/磁盘 | `manage status` → §3.4 |
| `manage` 命令报 `未找到 pg_dump` | 宿主无 PG 客户端 | `brew install libpq` + `MIGRATION_PG_DUMP_PATH` |
| 启动耗时明显变长 | pending 较多 | `manage status --json \| jq '.pending'` |
| 补偿提示需要 `--force` | 行数超限或表非空 | 先 `--dry-run` 核对行数 |
| 补偿提示需要 `MIGRATION_PRODUCTION_CONFIRM` | 生产双确认 | §5 末段命令 |
| `restore-hint` 报「账本中无该版本的备份文件」 | 未执行成功 / 备份已 prune | 按输出改用最近全库备份回放到临时库 |

---

## 10. 已知边界（⚠️ 未覆盖，spec §18）

1. **C 级 25 项不承诺「一键恢复」**：只提供「恢复到临时库 + 手工比对」流程。
2. **D 级 0 项是当前结论**：若后续把「上传 OSS 后删除本地源文件」这类带外副作用纳入启动迁移，
   必须重评为 D 并禁止自动执行。
3. **`pg_dump`/`pg_restore` 与 server 版本**（本机实测，已落地为代码校验）：
   - **导出**：`client major >= server major`（`backup.assert_client_compatible` 启动期校验，
     不满足直接 `BackupError` 中止迁移）；
   - **恢复**：必须用**产出该备份的同一大版本客户端**。实测 client 18.6 产出的归档格式
     1.16 无法被 PG16 的 `pg_restore` 读取；client 16 的归档可被 16/17/18 读取。
   - 因此 `manage restore-hint` 会打印账本里的 `backup_client` 版本，并给出对应命令。
   - 生产镜像内 `postgresql-client` 固定为 Debian trixie 的 17.x（D-03），
     与 server 16 组合下：导出正常、恢复需在 backend 容器执行（runbook §5 已写明）。
4. **baseline 在 2 worker 下的最坏耗时**：本机单 worker 实测 58 秒（82 项 + **1 次**全库备份，v2 起）；
   2 worker 会因 advisory lock 串行化，耗时**不会**翻倍（第二个 worker 只做零 pending 检查）。
5. **legacy 路径退出**：保留 1 个 release，删除前在本文件 §3.5 标注观察结论。
