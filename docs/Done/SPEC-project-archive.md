# SPEC · 项目归档状态（成交后补录信息与锁定收口）

> **状态**：✅ 已实施并验收（S1）｜撰写 2026-11-25｜module id：`project-archive`
> **需求来源**：业务反馈——项目成交（sold）后无法修改任何信息、无法上传附件（含签约材料/文书），与线下"成交后再补文档/补信息"的实际流程冲突；需要一个**手动归档**机制，归档前任意可编辑（有权限前提下），归档后全量锁定。
> **交互参照**：`admin/ledger` 资金账本「结算/反结算」（弹窗形态、审计语义同构）。
> **用户已确认决策**（ask_user_question 两轮）：
> 1. 实现 = **独立归档标记**（不动 ProjectStatus 枚举）；
> 2. 支持**反归档**（记审计 + 原因必填）；
> 3. 权限 = **复用 `project:write`**，不新增权限码；
> 4. **移除 sold 状态字段编辑白名单**，锁定语义收口到归档；
> 5. 仅 **sold / ended** 状态可归档；
> 6. 归档后**禁止删除**，需先反归档。

---

## 1. 现状核对（已核实代码）

| # | 事实 | 证据 | 后果 |
|---|------|------|------|
| F1 | sold 状态下 PUT 更新走白名单过滤：合同字段、业主列表（owners）、签约材料附件（signing_materials）被**静默丢弃**，接口仍返回 200 | `backend/services/projects/internal/updater.py:61-64`（`if project.status == ProjectStatus.SOLD.value: update_dict = self._filter_allowed_fields(...); owners_payload = None`）+ `updater.py:97-137`（`_filter_allowed_fields` 白名单） | **「成交后无法修改/无法传附件」的直接根因** |
| F2 | 文书签收（documents 增删改）、装修进度/照片/合同、销售角色维护、带看记录：后端**未按 sold 状态封锁**（renovation 的 allowed_statuses 含 SOLD；sales 的 update_roles 无状态校验） | `backend/services/projects/internal/documents.py`、`backend/services/projects/renovation.py:207-212,300-305,380-385,434-439,573-578`、`backend/services/projects/sales.py:86-` | 前端未暴露入口（SoldView 无编辑 UI），后端实际放行，前后端口径不一 |
| F3 | sold 视图（SoldView）唯一编辑入口是「修改销售信息」弹窗（sold_price/sold_date/list_price/listing_date），恰在白名单内所以可用 | `frontend/src/app/(main)/admin/projects/_components/project-detail/views/sold/edit-sales-info-dialog.tsx` | 成交后其他信息在前端无编辑入口 |
| F4 | ProjectStatus 枚举：signing/renovating/selling/sold/ended/deleted；状态流转校验集中在 `validate_transition`；ended 为终态（仅可转 deleted） | `backend/models/common/base.py:46-54`、`backend/services/projects/internal/state.py:38-75` | 归档不应混入生命周期状态机 |
| F5 | 结算锁可参照：`finance_settlement_status/finance_settled_date/finance_settled_note` 三列 + settle/unsettle 端点（`ledger:settle` 权限码）+ 写锁 `_assert_finance_editable` + 前端 `settlement-dialog.tsx`（归档弹窗形态的成熟样板） | `backend/models/project/_project_base.py:74-90`、`backend/services/projects/finance/base.py:152-156`、`backend/services/projects/finance/settlement.py`、`frontend/src/app/(main)/admin/ledger/[projectId]/_components/settlement-dialog.tsx` | 复用其模式，但**权限复用 project:write**（用户决策 3） |
| F6 | 项目软删除会同步软删合同并改写 status=deleted，无归档拦截 | `backend/services/projects/core.py:540-585`（`delete_project`） | 需补「已归档不可删除」 |
| F7 | 状态流转入口 `PUT /projects/{id}/status` → `state.update_status`（行锁 + TOCTOU 防护），无归档校验 | `backend/services/projects/internal/state.py:77-135` | 需补归档写锁 |
| F8 | 列表筛选 `ProjectFilter.status`（单值）+ 状态 Tab（签约/装修/在售/已售/已下架）+ stats 五状态计数；`ProjectStatsResponse.ended` 带默认值兼容旧消费方 | `backend/schemas/project/core.py:17-26,343-353`、`frontend/src/app/(main)/admin/projects/_components/project-view.tsx:104-142` | 归档筛选作为独立维度叠加，不动状态 Tab |
| F9 | 启动迁移体系：幂等（`_column_exists`）、PG-only、advisory lock 串行化；`finance_settlement_columns` 是最接近的先例 | `backend/migrations/__init__.py:262-472`、`backend/migrations/_finance.py`（`add_project_finance_settlement_columns`） | 新迁移照此登记 |
| F10 | 前端本地类型 `Project` interface 为手写（`types/project.ts`），生成类型在 `src/lib/api-types.d.ts`（`ProjectStatus: "signing"|...|"deleted"`，L14023） | `frontend/src/app/(main)/admin/projects/types/project.ts:127-`、`frontend/src/lib/api-types.d.ts:14023` | 后端加字段后需 `pnpm gen-api` + 手动同步本地 interface |
| F11 | 详情页删除入口有两处（TopToolbar 删除按钮 + 删除 AlertDialog；列表 ActionCell 菜单），编辑入口 V4.3 改为 InfoTab 就地编辑（顶栏「编辑」触发） | `frontend/src/app/(main)/admin/projects/[projectId]/_components/project-detail-page-view.tsx:82-90,369-430`、`.../page-shell/top-toolbar.tsx:95-135`、`.../views/default/tabs/info-tab.tsx` | 归档后需同时收敛顶栏编辑/删除、就地编辑、上传入口 |

---

## 2. 目标与成功标准

| # | 目标 | 验收方式 |
|---|------|----------|
| G1 | 成交（sold）项目归档前可修改**任意**项目信息（含合同字段、业主列表）并上传/删除签约材料附件、文书 | E2E：sold 项目 PUT contract_no/owners/signing_materials 均持久化 |
| G2 | 归档后所有项目写接口返回 400（更新、状态流转、文书增删改、装修进度/照片/合同、销售角色/记录、删除项目） | E2E + 后端测试锁定矩阵（§5） |
| G3 | 反归档后恢复可编辑，归档/反归档均写 OperationLog 审计（含归档日期/说明、反归档原因） | E2E 断言审计日志接口可见记录 |
| G4 | 列表页可按「已归档」筛选并显示徽标；详情页归档态视觉明确（锁形徽标）且写入口隐藏 | E2E 截图工件 |
| G5 | 既有白名单回归测试语义同步收敛（白名单移除由归档锁替代） | 后端 pytest 通过 |

**Out of Scope（显式不做）**
- ❌ 钥匙管理（keys）写操作不受归档锁约束（钥匙有独立生命周期，已售项目仍可能发生钥匙交接/归还）。
- ❌ 资金账本流水不受归档锁约束（已有结算锁 `_assert_finance_editable` 独立生效；归档不叠加账本锁，避免双锁语义混乱）。
- ❌ C 端展示逻辑（public 房源单等）不动。
- ❌ 不新增权限码、不动角色种子数据。

---

## 3. 方案设计

### 3.1 数据模型与迁移

**`projects` 表新增 3 列**（迁移模块 `backend/migrations/_project_archive.py`，登记进 `_run_all_migrations`）：

```
is_archived    boolean      NOT NULL DEFAULT false   -- 归档标记
archived_at    date         NULL                     -- 归档日期（业务口径，弹窗必填，默认今天）
archived_note  text         NULL                     -- 归档说明（选填）
```

> ⚠️ **显式偏差**：用户确认的预览稿中 `archived_at` 为 timestamptz；实施按 AGENTS.md「日期列用 Date」调整为 `Date`——归档日期是业务口径（同 `finance_settled_date` 先例），精确操作时刻已由 `updated_at` + OperationLog 审计承载，不重复存时间戳。若评审认为需要精确时刻，仅需把列类型换为 `DateTime(timezone=True)` 并去掉弹窗日期输入，改动局部。

- 迁移幂等：`_column_exists` 逐列检查；存量数据无需回填（默认 false）。
- `models/project/_project_base.py`：`Project` 模型同步声明 3 字段（`Mapped[bool]` / `Mapped[date | None]` / `Mapped[str | None]`）。
- **不加索引**：归档项目占比低且筛选与其他条件组合出现，全表过滤即可；如后续量大再补部分索引（`WHERE is_archived`）。

### 3.2 后端 Service

**新模块 `backend/services/projects/archive.py`**（与 `finance/settlement.py` 同构的 mixin/服务）：

```
archive_project(project_id, req: ProjectArchiveRequest, *, operator_id, request) -> ProjectResponse
  - 项目存在校验（404）
  - 仅 status ∈ {sold, ended} 可归档，否则 400「仅已售或已下架项目可归档」
  - is_archived 已为 true → 400「项目已归档，无需重复归档」
  - 写 is_archived=True / archived_at=req.archived_at / archived_note=req.archived_note
  - commit 后写 OperationLog：action="update", resource_type="project",
    after={"archived": true, "archived_at": iso, "archived_note": ...}

unarchive_project(project_id, req: ProjectUnarchiveRequest, *, operator_id, request) -> ProjectResponse
  - is_archived 已为 false → 400「项目未归档，无需反归档」
  - 写 is_archived=False，archived_at / archived_note 置 None
  - OperationLog：after={"archived": false, "reason": req.reason}
```

`facade.py`（ProjectService）暴露 `archive_project` / `unarchive_project`。

**写锁（Fail Loud，全部 400，不静默）**——统一 helper 放 `archive.py`：`assert_project_not_archived(project)`，抛 `ValidationError("项目已归档，请先反归档后再操作")`：

| 写路径 | 拦截点 |
|--------|--------|
| PUT `/projects/{id}` 全量更新（含附件合并、owners 同步） | `updater.py::update()` 开头；**同时删除 `_filter_allowed_fields` 与 sold 白名单分支（F1 根因清除）** |
| PUT `/projects/{id}/status` 状态流转 | `state.py::update_status()` 取行锁后、`validate_transition` 前校验 |
| POST `/projects/{id}/complete` 确认成交 | `sales.py::complete_project()` 状态校验处 |
| 文书 create / update / delete / initialize | `internal/documents.py` 四个写方法（`assert_project_exists` 之后） |
| 装修：更新进度/阶段日期/信息/上传照片/装修合同 | `renovation.py` 5 处 `allowed_statuses` 校验之后各加一行 |
| 销售：update_roles / create_record / delete_record | `sales.py` 对应方法 |
| DELETE `/projects/{id}` 删除项目 | `core.py::delete_project()` 软删改写前 → 400「已归档项目不可删除，请先反归档」 |

> 注：`updater.py` 白名单删除后，其 docstring 与 `backend/tests/test_project_update_sold_fields.py` 的白名单语义同步重写（见 §6）。

### 3.3 后端 Schema 与 Router

`schemas/project/archive.py`（新建，严格 *Request 命名，AGENTS.md 触发动作类规范）：

```
ProjectArchiveRequest:
  archived_at:   date        # 必填（弹窗默认今天）
  archived_note: str | None  # 选填，max_length=500

ProjectUnarchiveRequest:
  reason: str                # 必填，min_length=1, max_length=500
```

`routers/projects/core.py` 新增两个端点（均 `ProjectWritePermDep`，复用 `RateLimits.PROJECT_STATUS_UPDATE` 限流）：

```
POST /api/v1/projects/{project_id}/archive    → ProjectResponse
POST /api/v1/projects/{project_id}/unarchive  → ProjectResponse
```

响应复用 `ProjectResponse`（前端归档后直接刷新详情数据）。

`ProjectResponse` 增加透出字段：`is_archived: bool = False`、`archived_at: date | None`、`archived_note: str | None`（`builder.py` 同步组装）。

**列表筛选**：`ProjectFilter` 增加 `is_archived: bool | None = None`（None=全部；false=仅未归档；true=仅已归档），`internal/query.py::get_by_status` 增加对应 filter。stats 五状态计数不变（归档项目仍计入原状态，用户决策 1 的独立标记语义）。

### 3.4 前端

**类型同步**：`pnpm gen-api` 更新 `api-types.d.ts`；手写 `types/project.ts` 的 `Project` interface 补 `is_archived` / `archived_at` / `archived_note` 三字段。

**列表页**（`admin/projects/_components/`）：
- `columns.tsx`：项目名称列在 `is_archived` 时追加「已归档」锁形徽标（`Archive` icon + fog 底，风格对齐既有状态徽章）。
- `project-view.tsx`：业务形式 Select 旁新增「归档状态」Select（全部 / 未归档 / 已归档），经 URL query（`is_archived`）传服务端筛选，与既有 status/business_form 同模式。
- `action-cell.tsx`：归档项目隐藏「删除」菜单项（后端亦 400 兜底）。

**详情页**（`[projectId]/` 与抽屉两处共用组件级收敛）：
- 归档徽标：`page-shell/hero-section.tsx` 状态 pill 旁追加「已归档」锁形 badge；`top-toolbar.tsx` 状态文案区追加同样标识。
- 写入口收敛（统一判据 `project.is_archived === true`）：
  - `top-toolbar.tsx`：编辑按钮置灰、删除按钮隐藏；
  - `views/default/tabs/info-tab.tsx`：就地编辑入口（卡头「编辑」textlink）隐藏；
  - `views/default/`：附件库「上传附件」、文书行 attach-chip / 编辑 / 删除入口隐藏；
  - `views/sold/`：「修改销售信息」入口（Hero textlink）隐藏。
- **归档/反归档入口**：`top-toolbar.tsx` 在 `status ∈ {sold, ended}` 时显示「归档」（未归档）或「反归档」（已归档）按钮（`HasPermission PROJECT_WRITE` 包裹）；列表 `action-cell.tsx` 菜单同步提供入口。

**归档弹窗**（新组件 `admin/projects/_components/archive-dialog.tsx`，参照 `settlement-dialog.tsx` 双模式）：
- mode="archive"：流转图（已售 → 已归档）+ 归档日期（必填，默认今天）+ 说明（选填）；
- mode="unarchive"：警示条（「反归档后项目恢复可编辑，此操作会写入操作日志」）+ 原因（必填）；
- 成功后 toast + `router.refresh()` + 详情数据局部刷新。

**Server Actions**（`actions/core.ts`）：
- `archiveProjectAction(projectId, {archived_at, archived_note})` / `unarchiveProjectAction(projectId, {reason})`；
- Zod schema 与后端 Pydantic 语义对齐（日期必填、说明/原因长度、原因必填）；
- `requirePermission(PERMISSION_CODES.PROJECT_WRITE)` 前置（与 `updateProjectStatusAction` 同模式）。

### 3.5 归档态行为矩阵（唯一权威口径）

| 操作 | 未归档（任意状态） | 已归档 |
|------|------------------|--------|
| 编辑项目信息（含合同/业主/账户号） | ✅（sold 白名单已移除） | ❌ 400 |
| 上传/删除签约材料附件 | ✅ | ❌ 400 |
| 文书签收增删改 / 初始化 | ✅ | ❌ 400 |
| 装修进度 / 照片 / 装修合同 | ✅（状态门槛不变） | ❌ 400 |
| 销售角色 / 带看出价面谈记录 / 确认成交 | ✅（状态门槛不变） | ❌ 400 |
| 状态流转 | ✅（既有 validate_transition 规则不变） | ❌ 400 |
| 归档 / 反归档 | sold/ended 可归档；其余状态 400 | 可反归档（原因必填） |
| 删除项目 | ✅（project:delete） | ❌ 400（先反归档） |
| 资金账本流水 | 由结算锁独立控制 | 同左（不受归档影响） |
| 钥匙管理 | 独立生命周期 | 同左（不受归档影响） |

---

## 4. 实施步骤（含验证点）

1. **迁移 + 模型 + Schema**：`_project_archive.py` → 模型 3 列 → `archive.py` schema → `ProjectResponse`/`ProjectFilter` 扩展。验证：启动后端无迁移报错，psql `\d projects` 见 3 列。
2. **Service + Router**：archive/unarchive 服务与端点 + 写锁矩阵逐点接入 + 白名单删除。验证：`pytest backend/tests/test_project_archive.py`（新增）与改造后的 `test_project_update_sold_fields.py` 通过；curl 归档/反归档/锁定矩阵手测。
3. **类型同步**：`pnpm gen-api` 提交生成类型；手动补本地 `Project` interface。验证：`tsc --noEmit` 零错。
4. **前端**：列表徽标/筛选/入口 + 详情页写入口收敛 + archive-dialog + server actions。验证：`pnpm lint` 通过。
5. **E2E 收尾**：`frontend/e2e/admin-project-archive.spec.ts`（见 §6），产出可复验工件（trace/截图）。
6. 提交前全量门禁：`tsc --noEmit` / `ruff check .` / `ruff format .` / `pnpm lint` / `pnpm gen-api` 无 diff。

---

## 5. 后端测试（pytest，改造 + 新增）

**改造 `backend/tests/test_project_update_sold_fields.py`**：白名单移除后语义反转——
- sold 项目更新 `contract_no` / `signing_price` / `owners` **必须持久化**（原断言"被过滤"删除）；
- 文件改名或改 docstring 说明白名单已由归档锁替代（保留文件名避免引用断裂，正文改写）。

**新增 `backend/tests/test_project_archive.py`**（先列失败路径再写码，AGENTS.md 测试策略）：
1. 仅 sold/ended 可归档；signing/renovating/selling 归档 → 400；
2. 归档后：PUT 更新 / status 流转 / 文书增删改 / 装修写 / 销售写 / DELETE 全部 400 且 DB 无变更；
3. 反归档后全部恢复可写；archived_at/note 清空；
4. 归档必填日期缺失 → 422；反归档原因缺失 → 422；
5. 已归档再次归档 → 400；未归档反归档 → 400；
6. 列表筛选 is_archived=true/false/None 三态正确；
7. sold 项目附件（signing_materials）与 owners 在归档前可正常写入合并（覆盖 G1，含既有并发合并语义不回归）。

## 6. E2E 验收（Playwright，唯一测试机制收口）

`frontend/e2e/admin-project-archive.spec.ts`（账号走环境变量；断言与工件）：
1. 建/选 sold 项目 → 详情页上传附件 + 修改合同字段保存 → 刷新后仍在（G1，白名单移除真实生效）；
2. 顶栏「归档」→ 弹窗日期+说明提交 → 徽标出现、编辑/删除/上传入口消失；
3. 直接调 PUT 接口（page.request）→ 400 且 message 含「已归档」；
4. 「反归档」→ 原因必填校验 → 提交成功 → 编辑/上传恢复；
5. 列表筛选「已归档」仅显示归档项目 + 名称列徽标；
6. 产出：`playwright-report/` + 截图目录，作为可复验工件留档。

---

## 7. 风险与开放问题

| # | 风险/问题 | 处置 |
|---|-----------|------|
| R1 | 白名单移除后，历史上依赖"sold 锁合同字段"的隐性预期被打开（如误改合同编号） | 归档即终锁的业务预期由用户显式确认（决策 4）；OperationLog 全量留痕可追责 |
| R2 | 归档与结算双状态并存：可能出现「已归档但账本未结算」 | 开放问题：是否在归档弹窗提示"账本未结算"？本期不做硬校验，仅 UI 提示（弹窗内文案），待业务反馈 |
| R3 | `project_status_logs` 表 CHECK 约束与 PG enum 均不涉及（归档不动 ProjectStatus），无 `migrate_add_ended_status` 类连锁 | 已规避 |
| R4 | 前端两套承载（详情独立页 + 列表抽屉）需同步收敛写入口 | 以 `is_archived` 单一判据封装公共计算（视图组件内一次性判断），避免散落 |
| R5 | 归档项目仍计入状态 Tab 计数与 stats | 符合"独立标记"语义；如业务要求归档单列统计，另行迭代 |

---

## 8. 实施与验收记录（可复跑）

**代码落点**

| 层 | 文件 |
|----|------|
| 迁移 | `backend/migrations/_project_archive.py`（登记于 `_run_all_migrations`，幂等 `_column_exists`） |
| 模型/响应 | `backend/models/project/_project_base.py`、`services/projects/internal/builder.py`、`schemas/project/core.py` |
| 归档服务 | `backend/services/projects/archive.py`（`assert_project_not_archived` + `ProjectArchiveService`）、`facade.py` |
| Schema/Router | `backend/schemas/project/archive.py`、`routers/projects/core.py`（`POST /{id}/archive`、`POST /{id}/unarchive`） |
| 写锁接入 | `internal/updater.py`（白名单删除）、`internal/state.py`、`internal/documents.py`、`renovation.py`、`sales.py`、`core.py::delete_project` |
| 列表筛选 | `internal/query.py`、`schemas/project/core.py::ProjectFilter.is_archived` |
| 前端 | `_components/archive-dialog.tsx`、`actions/core.ts`（archive/unarchive Server Action + Zod）、`columns.tsx`、`project-view.tsx`、`action-cell.tsx`、`page-shell/top-toolbar.tsx`、`page-shell/hero-section.tsx`、`views/default/*`、`views/ended/*`、`types/project.ts` |
| 测试 | `backend/tests/test_project_archive.py`（新增 22 例）、`backend/tests/test_project_update_sold_fields.py`（语义反转重写）、`frontend/e2e/admin-project-archive.spec.ts` |

**验收命令与结果**

```bash
# 后端（PostgreSQL profo_test，SAVEPOINT 隔离）
cd backend && .venv/bin/python -m pytest tests/test_project_archive.py \
    tests/test_project_update_sold_fields.py tests/test_documents.py -q --no-cov
# → 69 passed

cd backend && .venv/bin/ruff check . && .venv/bin/ruff format .
# → All checks passed! / 520 files left unchanged

# 前端静态门禁
cd frontend && pnpm gen-api && pnpm typecheck && pnpm lint
# → 生成类型无额外 diff（新增 2 端点 + 3 响应字段 + 1 查询参数）/ tsc 0 error / eslint 0 warning

# E2E（唯一测试机制收口；依赖本地 :8000 + :3000 调试进程）
cd frontend && npx playwright test e2e/admin-project-archive.spec.ts
# → 1 passed；工件 e2e/.artifacts/project-archive-{detail-archived,list-filter,detail-unarchived}.png
```

**与 spec 文本的显式偏差**

1. `archived_at` 按 AGENTS「日期列用 Date」实现为 `DATE`（spec §3.1 已声明该偏差）。
2. §6 步骤 1 原文「详情页上传附件 + 修改合同字段保存」：sold 视图（SoldView）当前不渲染
   附件库与项目信息卡（§1 F3 记录的现状，§3.4 未要求新增 sold 编辑 UI），故 G1 按 §2 验收
   口径在 API 层断言（`PUT contract_no / owners / signing_materials` 全部持久化）。
   ⚠️ **未覆盖（待业务确认）**：sold 项目在前端仍无「上传签约材料 / 编辑合同字段」入口，
   若需成交后补录走 UI，需另开迭代新增 sold 视图编辑能力。
3. `documents.initialize_documents` 新增可选 `project` 入参（创建链路项目尚未 flush，
   会话 `autoflush=False`，服务层重新查库会误报 404）——由 `creator.py` 传入已建实例。
