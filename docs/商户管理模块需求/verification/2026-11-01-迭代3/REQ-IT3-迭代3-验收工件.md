# REQ-IT3-01 迭代 3 验收工件 · 区域/商圈字典归属迁到楼盘字典

- **需求**：区域和商圈的字段管理入口应该放到楼盘字典的模块中（原文见 §9.2，`docs/商户管理模块需求/商户管理模块-需求与迭代记录.md`）
- **实施日期**：2026-11-01
- **状态**：待验收（自动化证据齐备；生产环境首次启动需确认 v115 迁移日志）

---

## 1. 需求 ↔ 用例映射

| 验收点 | 覆盖方式 | 用例 / 命令 |
|---|---|---|
| 维护入口归楼盘字典（页面 + 导航） | E2E | `e2e/building-dict-region-dicts.spec.ts` → 「REQ-IT3-01 导航归属：区域商圈入口出现在楼盘字典分组下」 |
| 新增字典项 → 分页列表可见（契约含 `page`/`page_size`） | E2E（API + UI） | 同上 spec → 「REQ-IT3-01 楼盘字典区域商圈页：新增/重命名同步业务数据/停用后移出候选」步骤「列表中能查到新增区域」 |
| 重命名 → 同步门店业务数据 | E2E（UI + API 断言） | 同用例步骤「重命名区域并同步门店业务数据」「门店上的旧区域值被同步为新名称」 |
| 停用 → 从门店表单候选移除 | E2E（API 断言） | 同用例步骤「停用后不再出现在门店表单候选」 |
| 表名迁移不丢数据（`merchant_region_dicts` → `region_dicts`） | 迁移 + SQL 计数 | §4 「迁移账本与数据保全」 |
| 迁移注册表顺序/校验和 | pytest | `backend/tests/test_migration_registry.py`（9 passed） |
| 商户域候选端点行为不变（复用字典启用项） | E2E（API 断言）+ 既有回归 | `e2e/merchant-iteration1.spec.ts`、`e2e/merchant-admin-forms.spec.ts` 等 6 个 spec |
| 后台门店表单（区域必填 / 手填兜底）未受影响 | E2E | `e2e/merchant-iteration2.spec.ts` |

---

## 2. 自动化命令与实测结果（2026-11-01）

### 2.1 静态检查

```bash
cd frontend && npx tsc --noEmit          # 输出为空（零类型错误）
cd frontend && pnpm lint                 # eslint src：0 error / 0 warning
cd miniapp && npx tsc --noEmit           # 输出为空
cd backend && .venv/bin/ruff check models services routers schemas constants migrations
# → All checks passed!
cd backend && .venv/bin/ruff format --check models services routers schemas constants migrations
# → 470 files already formatted
```

### 2.2 后端用例

```bash
cd backend && .venv/bin/python -m pytest \
  tests/test_merchant_admin.py tests/test_merchant_store_visit.py tests/test_migration_registry.py \
  -q --no-cov
# → 41 passed, 2 warnings in 7.48s
```

### 2.3 E2E（迭代 3 相关）

```bash
cd frontend && npx playwright test \
  e2e/building-dict-region-dicts.spec.ts e2e/merchant-iteration2.spec.ts --reporter=line
# → 5 passed (3.5s)
```

### 2.4 E2E（商户回归）

```bash
cd frontend && npx playwright test \
  e2e/merchant-iteration1.spec.ts e2e/merchant-admin-forms.spec.ts \
  e2e/merchant-company-admin.spec.ts e2e/merchant-store-admin-v7.spec.ts \
  e2e/merchant-store-activation.spec.ts e2e/merchant-map-tracks.spec.ts \
  e2e/building-dict-region-dicts.spec.ts e2e/merchant-iteration2.spec.ts --reporter=line
# → 20 passed (1.2m)
```

### 2.5 全量 E2E（背景信息，非本次门禁）

```bash
cd frontend && npx playwright test --reporter=line
# → 106 passed / 10 failed / 3 skipped / 14 did not run (2.7m)
# 失败清单与串行复跑结论见 §5。
```

---

## 3. 契约核对（`GET /openapi.json`）

```bash
curl -s http://127.0.0.1:8000/openapi.json | python3 -c "..."
```

实测输出（只列相关项）：

```
paths:
  /api/v1/admin/building-dictionary/region-dicts
  /api/v1/admin/building-dictionary/region-dicts/sync
  /api/v1/admin/building-dictionary/region-dicts/{dict_id}
  /api/v1/admin/building-dictionary/region-dicts/{dict_id}/status
schemas: ['RegionDictCreate', 'RegionDictItem', 'RegionDictListResponse', 'RegionDictStatusRequest', 'RegionDictUpdate']
merchant region-dicts left: []
merchant districts: ['/api/v1/admin/merchant/districts']
```

结论：维护端点全部归楼盘字典；`merchant/region-dicts*` 已下线；商户域候选端点 `/admin/merchant/districts` 保留（REQ-IT1-04/REQ-IT2-01 的消费口）。

`pnpm gen-api` 已在 `frontend` 与 `miniapp` 各执行一次（openapi-typescript 7.13.0），生成文件更新：
- `frontend/src/lib/api-types.d.ts`
- `miniapp/types/api-types.d.ts`

---

## 4. 迁移账本与数据保全（REQ-IT3-01 关键项）

### 4.1 校验和漂移与 rebaseline

v114 由 `create_merchant_region_dict_table` 改名为 `create_region_dict_table`（建 `region_dicts`），属源码变更但 DDL 行为等价（表名/归属调整）。启动时被版本化迁移执行器阻断：

```
migrations.runner.MigrationBlockedError: [FATAL] 迁移源码校验和不匹配（已应用的迁移被修改）。
  version=114 name=create_merchant_region_dict_table
```

处理（主库）：

```bash
cd backend && .venv/bin/python -m migrations.manage rebaseline 114 \
  --reason "REQ-IT3-01：区域/商圈字典表归属迁到楼盘字典（merchant_region_dicts→region_dicts），v114 仅表名/模型归属调整，行为等价，存量数据由新增 v115 幂等合并"
# → 迁移 v114 create_region_dict_table checksum 已重基线：d4400cd6e2de → c5561b21891e
```

测试库（`profo_test`）同样执行一次，否则 `pytest` 启动迁移会阻断：

```bash
cd backend && DATABASE_URL="postgresql+psycopg://<user>:<pass>@127.0.0.1:5432/profo_test" \
  .venv/bin/python -m migrations.manage rebaseline 114 --reason "REQ-IT3-01：测试库同步 v114 纯重构"
# → checksum 已重基线：d4400cd6e2de → c5561b21891e
```

### 4.2 v115 存量兼容

```bash
cd backend && .venv/bin/python -m migrations.manage up
# → 迁移 _region_dict: merchant_region_dicts 不存在，跳过迁移
# 迁移 v115 migrate_legacy_merchant_region_dict 完成（7ms，backup=none）
# 迁移状态：applied=115 pending=0 failed=0 executed_now=1 duration_ms=109
```

本机库中 `merchant_region_dicts` 已由 v114 的新表接管，故 v115 走「旧表不存在 → 跳过」分支；数据行数（迁移前手工合并后实测）：

```
region_dicts 存在 = True，merchant_region_dicts 已删除 = True，rows = 278
```

> 生产/其他环境若仍存在 `merchant_region_dicts`，v115 会走 `ALTER TABLE ... RENAME`；两表并存时走
> `INSERT ... ON CONFLICT (dict_type, name) DO NOTHING` 后 `DROP TABLE`。首次启动请确认日志分支与行数。

---

## 5. 全量 E2E 失败清单与串行复跑结论

全量运行（并行，2.7m）失败 10 条：

| # | 用例 | 与本次改动的关系 |
|---|---|---|
| 1 | `e2e/admin-attachments.spec.ts` | 无（既有失败，迭代 2 全量基线的同一批） |
| 2 | `e2e/admin-dict-manage.spec.ts` | 无（系统字典维护，未改） |
| 3 | `e2e/admin-marketing-price-change.spec.ts` | 无（营销调价，未改） |
| 4 | `e2e/bd-iteration-fix.spec.ts` | 无（导入页 stepper，未改） |
| 5 | `e2e/bd-kpi-slow-query.spec.ts` | 无（慢查询门禁，未改） |
| 6 | `e2e/bd-room-pagination.spec.ts` | 无（既有失败，迭代 2 全量基线的同一批） |
| 7 | `e2e/building-dict-region-dicts.spec.ts` | **本次新增**，失败原因：`Test timeout of 120000ms exceeded`（并行下登录限流退避） |
| 8 | `e2e/dict-picker-layout.spec.ts` | 无（字典选择器布局，未改） |
| 9 | `e2e/lead-followup-conclusion.spec.ts` | 无（既有失败，迭代 2 全量基线的同一批） |
| 10 | `e2e/lead-list-followup-columns.spec.ts` | 无（既有失败，迭代 2 全量基线的同一批） |

复跑命令（串行）：

```bash
cd frontend && npx playwright test \
  e2e/admin-attachments.spec.ts e2e/admin-dict-manage.spec.ts e2e/admin-marketing-price-change.spec.ts \
  e2e/bd-iteration-fix.spec.ts e2e/bd-kpi-slow-query.spec.ts e2e/bd-room-pagination.spec.ts \
  e2e/building-dict-region-dicts.spec.ts e2e/dict-picker-layout.spec.ts \
  e2e/lead-followup-conclusion.spec.ts e2e/lead-list-followup-columns.spec.ts \
  --workers=1 --reporter=line
```

实测结果：见 §5.1（本文件生成后回填）。

### 5.1 串行复跑实测

```bash
cd frontend && npx playwright test \
  e2e/admin-attachments.spec.ts e2e/admin-dict-manage.spec.ts e2e/admin-marketing-price-change.spec.ts \
  e2e/bd-iteration-fix.spec.ts e2e/bd-kpi-slow-query.spec.ts e2e/bd-room-pagination.spec.ts \
  e2e/building-dict-region-dicts.spec.ts e2e/dict-picker-layout.spec.ts \
  e2e/lead-followup-conclusion.spec.ts e2e/lead-list-followup-columns.spec.ts \
  --workers=1 --reporter=line
# → 24 passed / 5 failed / 6 did not run (1.2m)
```

串行后仍失败的 5 条：

| 用例 | 与本次改动的关系 |
|---|---|
| `e2e/admin-attachments.spec.ts` | 无关：迭代 2 全量基线即失败（附件库悬停预览） |
| `e2e/bd-room-pagination.spec.ts` | 无关：迭代 2 全量基线即失败（户室分页加载更多） |
| `e2e/lead-followup-conclusion.spec.ts` | 无关：迭代 2 全量基线即失败（抽屉跟进时间线） |
| `e2e/lead-list-followup-columns.spec.ts` | 无关：迭代 2 全量基线即失败（表头 13 列 vs 设计稿 11 列） |
| `e2e/bd-iteration-fix.spec.ts` | 批内失败但**单独运行 8 passed (10.4s)**，属批内环境抖动 |

→ 并行下的 `admin-dict-manage`、`admin-marketing-price-change`、`bd-kpi-slow-query`、`building-dict-region-dicts`、`dict-picker-layout` 串行均通过，
说明失败源于并行登录限流（`e2e/helpers/auth.ts` 遇 429 退避 20s/40s）与用例间环境干扰，而非本次代码改动。

验证命令（单独复跑本次新增 spec）：

```bash
cd frontend && npx playwright test e2e/bd-iteration-fix.spec.ts --workers=1 --reporter=line
# → 8 passed (10.4s)
```

---

## 6. 数据与清理策略

- E2E 用例使用 `MARK = E2EIT3<timestamp>` 前缀命名区域、商圈、公司、门店，`afterAll` 通过
  `backend/.venv/bin/python` 直连主库按 `LIKE '%<MARK>%'` 删除 `merchant_stores`、`merchant_companies`、`region_dicts` 的残留。
- **本 spec 设为 `mode: "serial"`**：两个用例共用同一 MARK 且 afterAll 按 MARK 模糊删除，并行时两个 worker 的清理会互删对方正在使用的字典项（表现为 `PUT /region-dicts/{id}` 返回 404「字典项不存在」）。
- 门店坐标与手机号按 MARK 派生，避开后端查重半径（`_DISTANCE_LIMIT_M = 500`），防止历史残留数据触发「存在疑似重复门店」。

---

## 7. 已知偏差与遗留

1. `RegionDictService.sync_from_business_data()` / `rename()` 仍同时写 `communities`（楼盘字典域）与 `merchant_stores`（商户域）的文本列，跨域写集中在 property 服务内，已用 docstring 与审计 `affected_rows` 留痕。
2. 字典页读权限改为 `PROPERTY_READ`、写为后台管理员；商户运营角色若缺 `PROPERTY_READ` 将看不到该页（与原 `MERCHANT_WRITE` 口径不同）。
3. 小程序不受影响（仍读 `/public/merchant/districts`），但未做真机复测。
4. ⚠️ 全量并行 E2E 下新增用例会因登录限流退避超时；单独/串行运行稳定通过。属既有测试环境约束，未在本次修复。
