# REQ-IT5 迭代 5 验收工件（协议签署流程简化）

- 迭代：迭代 5（2026-11-01）
- 需求来源：用户消息 m02501（三条）
- 需求台账：`docs/商户管理模块需求/商户管理模块-需求与迭代记录.md` §11
- 状态：**待验收**（自动化全绿；小程序真机路径未复测，见 §5）

---

## 1. 需求 ↔ 用例映射

| 需求 | 结论性变更 | 自动化用例 |
|---|---|---|
| REQ-IT5-01 合作状态与协议解耦 | 「已合作」不再要求已签协议；候选＝字典启用项（排除当前状态） | `e2e/merchant-iteration5.spec.ts::REQ-IT5-01 合作状态与协议解耦…`；`pytest tests/test_merchant_store_visit.py::test_employee_status_permission_and_decoupled_from_agreement` |
| REQ-IT5-02 协议「全部」含待签署 | 列表页新增 `onShow` 静默刷新（首帧 `shownOnce` 跳过） | `e2e/merchant-iteration5.spec.ts::REQ-IT5-02/03 小程序源码断言…` |
| REQ-IT5-03 取消审核 + 商户自助签署 | 发起即 `pending_sign` + `sign_code`；审核端点删除；商户凭分享码签署 | `e2e/merchant-iteration5.spec.ts`（发起即待签署 / 商户凭码签署 / 后台无审核入口）；`pytest tests/test_merchant_agreement.py`（11 passed，含 `test_merchant_self_sign_via_share_code`） |

| REQ-IT5-04 发起页签署人改门店经纪人 | 选中门店后 picker 选经纪人（手机号因脱敏仍手填）；无经纪人退回手填；清理残留审核文案 | `e2e/merchant-iteration5.spec.ts::REQ-IT5-04 发起协议签署人来自门店经纪人（接口 + 源码断言）`（含反向验证） |
| REQ-IT5-05 发起页直接补录门店经纪人 | 门店无经纪人时出现「＋ 新增门店经纪人」，录入姓名+手机号即绑定本店并成为本次签署人；同店/跨店重复手机号给出明确冲突 | `e2e/merchant-iteration5.spec.ts::REQ-IT5-05 门店无经纪人时可在发起页直接补录经纪人（接口 + 源码断言）`（含反向验证） |
| REQ-IT5-06 建店联系人自动建档为门店经纪人 | 建店即建档并绑定本店（`source=store_contact`）；同号扫码认证复用同一档案回填 `user_id`；同号已被占用时跳过建档并留审计、建店照常成功 | `e2e/merchant-iteration5.spec.ts::REQ-IT5-06 建店联系人自动建档为门店经纪人，重复手机号跳过不阻断建店`；`pytest tests/test_merchant_broker.py`（3 条新用例：自动建档+绑定 / 同号扫码复用档案 / 冲突跳过留审计） |
---

## 2. 自动化命令与实测结果（2026-11-01）

```bash
# 后端静态检查与导入
cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check .
# → All checks passed! / 已格式化
cd backend && .venv/bin/python -c "import main"
# → ok

# 后端用例（协议 / 后台商户 / 拜访 / 平台 / 迁移账本）
cd backend && .venv/bin/pytest tests/test_merchant_agreement.py tests/test_merchant_admin.py \
  tests/test_merchant_store_visit.py tests/test_merchant_platform.py \
  tests/test_migration_registry.py -q --no-cov
# → 62 passed

# 契约生成与类型检查
cd frontend && pnpm gen-api          # → 生成 src/lib/api-types.d.ts 与 ../miniapp/types/api-types.d.ts
cd frontend && npx tsc --noEmit      # → 零错误
cd frontend && pnpm lint             # → 通过（0 warning）
cd miniapp  && npx tsc --noEmit      # → 零错误

# 迭代 5 用例
cd frontend && npx playwright test e2e/merchant-iteration5.spec.ts --reporter=line
# → 5 passed (1.2s)

# merchant 回归（10 个 spec，串行避免登录限流）
cd frontend && npx playwright test e2e/merchant-iteration1.spec.ts e2e/merchant-iteration2.spec.ts \
  e2e/building-dict-region-dicts.spec.ts e2e/merchant-iteration4.spec.ts e2e/merchant-iteration5.spec.ts \
  e2e/merchant-admin-forms.spec.ts e2e/merchant-company-admin.spec.ts e2e/merchant-store-admin-v7.spec.ts \
  e2e/merchant-store-activation.spec.ts e2e/merchant-map-tracks.spec.ts --workers=1 --reporter=line
# → 32 passed（见 §2.1）
```

### 2.1 回归结果

| 轮次 | 结果 | 说明 |
|---|---|---|
| 第 1 轮 | 31 passed / 1 failed (2.6m) | 失败为 `e2e/merchant-admin-forms.spec.ts::后台发起协议`：用例仍在点「提交审核」并断言「待审核」 |
| 修复 | 改用例 | 按钮改点「发起并生成签署链接」、断言改「待签署」（REQ-IT5-03 的预期变化） |
| 第 2 轮 | **32 passed (31.1s)** | 10 个 merchant spec 全绿 |

> ⚠️ 该失败是**需求变更导致的断言过期**，不是产品缺陷：后台确实不再有审核入口。

### 2.2 全量回归与并行抖动甄别

```bash
cd frontend && npx playwright test --reporter=line
# → 122 passed / 9 failed / 3 skipped / 11 did not run (2.4m)

# 对 9 条失败串行复跑（--workers=1）
cd frontend && npx playwright test e2e/admin-attachments.spec.ts e2e/bd-kpi-slow-query.spec.ts \
  e2e/bd-room-pagination.spec.ts e2e/dict-picker-project-edit.spec.ts e2e/lead-eval-verdict.spec.ts \
  e2e/lead-followup-conclusion.spec.ts e2e/lead-list-followup-columns.spec.ts \
  e2e/merchant-admin-forms.spec.ts e2e/merchant-notification.spec.ts --workers=1 --reporter=line
# → 22 passed / 4 failed
```

| 失败用例 | 串行结果 | 归因 |
|---|---|---|
| `admin-attachments.spec.ts` | 通过 | 并行抖动（登录限流/资源竞争） |
| `bd-kpi-slow-query.spec.ts` | 通过 | 并行抖动 |
| `dict-picker-project-edit.spec.ts` | 通过 | 并行抖动 |
| `lead-eval-verdict.spec.ts` | 通过 | 并行抖动 |
| `merchant-admin-forms.spec.ts::后台编辑门店并留痕原因` | 通过 | 并行抖动（同一 spec 在 10-spec 串行轮全绿） |
| `merchant-notification.spec.ts::消息中心出现商户分类与两条商户通知` | **复跑仍失败 → 已修** | 造数脚本仍在写 `MerchantAgreement(review_status="approved")`，v116 删列后抛 `TypeError: 'review_status' is an invalid keyword argument`；删掉该参数后 **3 passed** |
| `bd-room-pagination.spec.ts` | 失败 | **既有基线失败**（迭代 2 起记录在案，本次未触及该模块） |
| `lead-followup-conclusion.spec.ts` | 失败 | **既有基线失败**（同上） |
| `lead-list-followup-columns.spec.ts` | 失败 | **既有基线失败**（表头期望 11 列、实际 13 列，与商户模块无关） |

> 结论：本次改动只引入 1 条真实的测试造数失效（`merchant-notification`），已修；其余失败要么是并行抖动，要么是迭代 5 之前就存在的基线失败。

### 2.3 merchant 模块 11 个 spec 串行复跑

```bash
cd frontend && npx playwright test e2e/merchant-iteration{1,2,4,5}.spec.ts e2e/building-dict-region-dicts.spec.ts \
  e2e/merchant-{admin-forms,company-admin,store-admin-v7,store-activation,map-tracks,notification}.spec.ts \
  --workers=1 --reporter=line
# → 结果见 §2.4
```

### 2.4 最终结果

| 套件 | 命令 | 结果 |
|---|---|---|
| 后端 | `pytest tests/test_merchant_{agreement,admin,store_visit,platform}.py tests/test_migration_registry.py -q --no-cov` | **62 passed**；REQ-IT5-05 补修后 `pytest tests/test_merchant_{admin,platform,agreement,store_visit}.py -q --no-cov` → **54 passed**；REQ-IT5-06 补修后 `pytest tests/test_merchant_{broker,admin,agreement,store_visit,lead_attribution,platform}.py tests/test_migration_registry.py -q --no-cov` → **98 passed** |
| 迭代 5 用例 | `npx playwright test e2e/merchant-iteration5.spec.ts` | **8 passed**（含 REQ-IT5-04/05/06；REQ-IT5-05 补修时为 7 passed） |
| merchant 回归（含通知） | 11 个 spec `--workers=1` | **35 passed (36.7s)**；REQ-IT5-05 补修后 13 个 spec（补 `merchant-agreement-review-permission`、`merchant-store-photos`）→ **39 passed (37.6s)**；REQ-IT5-06 补修后 12 个 spec → **39 passed (42.2s)**，另 4 个 spec（`merchant-notification`/`merchant-agreement-review-permission`/`merchant-amap-config`/`merchant-notify-runs`）→ **6 passed / 3 skipped** |
| 静态检查 | `ruff check` / `ruff format --check` / `npx tsc --noEmit`×2 / `pnpm lint` | 全绿 |

### 2.5 REQ-IT5-04 补修验证（2026-11-01，m03051）

| 项 | 内容 |
|---|---|
| 改动 | `miniapp/pages/merchant/agreement/create/index.{ts,wxml,wxss}`：`loadSigners()` 拉 `GET /public/merchant/stores/{id}/brokers`，picker 选择回填 `signer_name`；无经纪人退回输入框；副标题与按钮去掉「审核」口径 |
| 正向（接口） | 后台建经纪人（`POST /api/v1/admin/merchant/brokers`，`store_id` 绑定本用例门店）→ `phone_masked` 形如 `136****1234` 且响应无 `phone` 明文；C 端 `GET /api/v1/public/merchant/stores/{id}/brokers` 含该经纪人；以其姓名作 `signer_name` 走 `POST /api/v1/public/merchant/agreements` → 200 且返回 `signer_name` 与经纪人一致 |
| 正向（源码） | `create/index.ts` 含 `public/merchant/stores/${storeId}/brokers`、`onSelectSigner`、`signerLabels`、`phone_masked`；`index.wxml` 含 `bindchange="onSelectSigner"`、`请选择门店经纪人`、`门店暂无经纪人，可填写签署人`、`签署人手机号`；且不含 `提交审核`/`由运营审核` |
| 反向验证 | 把 `index.wxml` 的 `bindchange="onSelectSigner"` 改成 `bindchange="onSignerNameInput"` 后单跑 `-g "REQ-IT5-04"` → **1 failed**（`expect(createWxml).toMatch(/<picker[\s\S]{0,200}?bindchange="onSelectSigner"/)`）；还原后 **6 passed** |
| 复跑 | `npx playwright test e2e/merchant-iteration5.spec.ts` → **6 passed (1.2s)**；`e2e/merchant-iteration5+2+admin-forms+4 `--workers=1` → **21 passed (13.5s)**；`cd miniapp && npx tsc --noEmit` 零错；`pnpm lint` 0 warning |

### 2.6 REQ-IT5-05 补修验证（2026-11-01，m03196）

| 项 | 内容 |
|---|---|
| 改动 | 后端新增 `BrokerStoreCreate` + `MerchantBrokerService.create_for_store` + `POST /public/merchant/stores/{store_id}/brokers`（`MerchantCWriteDep` + `ensure_store_visible` + 审计 `merchant_broker`）；小程序 `create` 页在 `storeId && !signers.length` 时显示「＋ 新增门店经纪人」并弹出补录表单 |
| 正向（接口，curl 实测） | `POST /api/v1/public/merchant/stores/51afaa6e.../brokers`（`MerchantCWriteDep`）→ **201** 且返回 `"bind_status":"bound"`、`"bind_source":"manual"`、`"source":"store_employee"`、`"phone_masked":"135****8888"`（无明文 `phone`）；同店重复提交 → **409**；换到另一门店提交同一手机号 → **409** `{"code":409,"message":"该手机号已绑定其他门店，请走换绑流程"}` |
| 正向（E2E） | `REQ-IT5-05` 用例：新门店经纪人列表为空 → `POST` 补录 201（`store_id` 为本店、`bind_status=bound`、`phone_masked` 形如 `135****1234`）→ 列表立即包含该经纪人 → 同店重复 409（消息含「已在本门店」）→ 跨店 409（消息含「换绑」）；源码断言 `onOpenBrokerModal`/`onSaveBroker`/`POST` 端点 + wxml「新增门店经纪人」入口与提示文案 |
| 反向验证 | 把 `index.wxml` 的「新增门店经纪人」改成「新增门店员工」后单跑 `-g "REQ-IT5-05"` → **1 failed**（`expect(createWxml).toContain("新增门店经纪人")`）；用备份还原后 **7 passed (1.3s)** |
| 静态检查 | `ruff check` / `ruff format --check services/merchant routers/merchant schemas/merchant` 全绿；`npx tsc --noEmit`（frontend + miniapp）零错；`pnpm lint` 0 warning；`pnpm gen-api` 双端已含 `BrokerStoreCreate` 与新路径 |

---

### 2.7 REQ-IT5-06 补修验证（2026-11-01，m03403）

| 项 | 命令 / 用例 | 实测结果 |
|---|---|---|
| 正向（后端） | `backend/.venv/bin/pytest tests/test_merchant_broker.py -q --no-cov` | **21 passed**，其中 3 条为本次新增：`test_store_creation_auto_creates_contact_broker`（建店 201 → `merchant_brokers` 出现 `source=store_contact`、`bind_status=bound`、`bind_source=manual`、`user_id` 为空，`merchant_broker_bindings` 有 `active` 行，审计 `action=create`）、`test_contact_broker_is_linked_when_same_phone_registers`（同号用户调 `POST /public/merchant/brokers/register` → 档案总数仍为 1、`user_id` 回填、`GET /public/merchant/brokers/me` 指向该门店）、`test_store_creation_skips_existing_broker_phone`（同号再建店 → 201、档案数不变、`operation_logs` 出现 `action=skip_existing` 且 `after.store_id` 为新门店） |
| 正向（E2E） | `npx playwright test e2e/merchant-iteration5.spec.ts -g "REQ-IT5-06"` | **1 passed**：建店后 `GET /public/merchant/stores/{id}/brokers` 返回 1 条（姓名＝联系人、`store_id` 为本店、`phone_masked` 形如 `134****1234`）；同号再建第二家门店 → 201 且该门店经纪人列表为空；源码断言建店页文案「保存后该联系人会自动成为门店经纪人」、后台表单 hint、`ensure_contact_broker(`、`source="store_contact"`、`_ensure_contact_broker(store, actor_id=actor_id, request=request)` |
| 反向验证 | 在 `MerchantStoreService._ensure_contact_broker` 首行插入 `return` 禁用钩子后单跑 `-g "REQ-IT5-06"` | **1 failed**（`expect(brokers).toHaveLength(1)` 实得 0，即门店确无经纪人）；移除 `return` 后全文件 **8 passed (1.4s)** |
| 回归 | 后端全量 `pytest tests -q --no-cov` + merchant 12 spec 串行 + 其余 4 spec + `e2e/merchant-iteration5 + merchant-admin-forms` | 后端全量 **1631 passed / 1 skipped (5m50s)**；merchant 12 spec **39 passed (42.2s)**；其余 4 spec **6 passed / 3 skipped**；`iteration5 + admin-forms` **13 passed (13.1s)**；`ruff check/format`、`tsc --noEmit`（frontend + miniapp）、`pnpm lint` 全绿 |
| 基线更新说明 | — | 自动建档改变了「新门店经纪人数量」这一既有前提，已同步更新 9 处后端断言（`test_merchant_admin.py` 的合并/详情/区间筛选、`test_merchant_store_visit.py` 的经纪人下拉范围、`test_merchant_lead_attribution.py` 的二级联动与门店经纪人列表、`test_merchant_map.py` 的 `broker_count` 与 `stats.broker_count`），并在 `test_merchant_broker.py::test_admin_broker_crud_and_disable_unbind` 注明「2 = 占位经纪人 + 扫码经纪人」 |
| 手工实测（curl + 查库） | 后台建公司 → `POST /admin/merchant/stores`（`contact_name="…联系人"`、`contact_phone=13201232203`）→ 直接查 `merchant_brokers` | 门店 `be2a1203-…`（演示后已清理）立刻出现 1 条档案：`name=DEMOIT506…联系人`、`phone_masked=132****2203`、`bind_status=bound`、`bind_source=manual`、`source=store_contact`、`user_id=None`、`remark="建店联系人自动建档"`，`merchant_broker_bindings` 计数 1 |

### 2.8 全量 E2E 回归与失败甄别（REQ-IT5-06 补修后，2026-11-01 23:11）

| 轮次 | 命令 | 结果 |
|---|---|---|
| 全量（并行） | `npx playwright test --reporter=line` | **130 passed / 9 failed / 3 skipped / 6 did not run (2.9m)** |
| 失败串行复跑 | 9 条失败 spec `--workers=1` | **16 passed / 4 failed / 6 did not run (55.5s)** |

仍失败的 4 条与本次改动无关，均为既有基线问题（本次未改 leads / 楼盘字典导入相关文件）：

| spec | 现象 | 归类 |
|---|---|---|
| `e2e/lead-list-followup-columns.spec.ts` | C1 表头列数期望 11、实测 13 | 迭代 2 起的既有基线漂移 |
| `e2e/lead-followup-conclusion.spec.ts` | C1 抽屉登记后时间线徽标未出现 | 既有基线 |
| `e2e/bd-room-pagination.spec.ts` | 超大楼栋分页渲染 | 既有基线 |
| `e2e/bd-iteration-fix.spec.ts` | `getByText('核对结果', { exact: true })` strict mode 命中 2 个元素（导入页文案重复） | 既有 UI 重复文案，非本次改动 |

并行轮出现的 `admin-project-archive`、`admin-users-internal-list`、`bd-import-capacity`、`bd-kpi-slow-query`、`building-dict-region-dicts` 在串行复跑中全部通过 → 并行下的登录限流退避 / 用例互相干扰，非代码问题。

## 3. 契约核对（`curl http://127.0.0.1:8000/openapi.json`）

| 项 | 迁移前 | 迁移后 |
|---|---|---|
| `POST /api/v1/admin/merchant/agreements/{agreement_id}/review` | 存在 | **已删除**（请求返回 404，用例已断言） |
| `AgreementReviewRequest` | 存在 | **已删除** |
| `GET/POST /api/v1/public/merchant/agreement-sign/{agreement_id}` | 无 | **新增**（`code` query，最低 8 位） |
| `AgreementResponse.review_status/reviewed_at/reviewed_by/review_remark` | 存在 | **已删除** |
| `AgreementResponse.sign_code/void_reason` | 无 | **新增** |
| `AgreementSignView` / `AgreementMerchantSignRequest` | 无 | **新增** |

---

## 4. 迁移与数据保全

迁移版本 **v116 `drop_agreement_review_fields`**（`backend/migrations/_merchant_agreement_no_review.py`）：

```sql
-- 幂等（每个动作先检查存在性）
ALTER TABLE merchant_agreements ADD COLUMN sign_code VARCHAR(36);
ALTER TABLE merchant_agreements ADD COLUMN void_reason VARCHAR(500);
DROP INDEX idx_merchant_agreements_review;
ALTER TABLE merchant_agreements DROP COLUMN review_status;
ALTER TABLE merchant_agreements DROP COLUMN reviewed_at;
ALTER TABLE merchant_agreements DROP COLUMN reviewed_by;
ALTER TABLE merchant_agreements DROP COLUMN review_remark;
CREATE INDEX idx_merchant_agreements_sign_code ON merchant_agreements (sign_code);
UPDATE merchant_agreements SET sign_code = md5(random()::text || id)
 WHERE status IN ('pending_sign','not_initiated') AND sign_code IS NULL;
UPDATE merchant_agreements SET status = 'pending_sign' WHERE status = 'not_initiated';
```

实测（本地库，后端 `--reload` 触发迁移）：

- `merchant_agreements` 的 `review_status/reviewed_at/reviewed_by/review_remark` **已不存在**
- `sign_code`、`void_reason` **已存在**，`idx_merchant_agreements_sign_code` 已建
- `pytest tests/test_migration_registry.py` → 通过（账本顺序与源码校验和一致）

> ⚠️ 该迁移 `reversible=False`、`backup=full`：生产首次启动会**永久删除**审核字段，执行前需备份。

---

## 5. 真机复测清单（未执行，需人工）

| # | 步骤 | 期望 |
|---|---|---|
| 1 | 员工在小程序「门店协议」发起一份协议 | 提交后直接进详情页，状态「待签署」，出现「分享给商户签署」 |
| 2 | 点「分享给商户签署」→ 选择微信联系人发送 | 分享卡片可打开，落地页为商户签署页 |
| 3 | 商户账号（非员工）打开链接，未登录 | 提示「请先登录」，点登录完成微信登录后返回自动加载协议 |
| 4 | 核对正文/主体 → 勾选确认 → 手写签名 → 确认签署 | 提示「签署完成」，回到首页 |
| 5 | 员工侧打开该协���详情 | 状态为「已签署」，可查看协议文件 |
| 6 | 门店详情查看合作状态 | 自动变为「已合作」（Q13=B） |
| 7 | 员工发起协议后不解散页面，返回列表 | 新协议立即出现在「全部」tab（REQ-IT5-02） |
| 8 | 运营在后台把「未合作」门店改为「已合作」 | 不再报「必须先签署电子合作协议」（REQ-IT5-01） |

---

## 6. 数据与清理

- E2E 造数统一带前缀 `MARK = E2EIT5<timestamp>`（公司名、门店名、模板名、协议 `remark`）。
- `afterAll` 用 `backend/.venv/bin/python` + `E2E_MARK` 精确删除 `merchant_agreements`（按 `remark LIKE`）、`merchant_agreement_templates`、`merchant_stores`、`merchant_companies`。
- 用例内部上传的签名图落在 `backend/static/uploads/`（本地存储），属测试副产物，不入库。

---

## 7. 已知偏差

1. **商户签署手机号由商户自填**：签署视图只返回脱敏号码（`signer_phone_masked`），商户在页面上填写 11 位手机号；若需与协议登记号码强一致，需改为短信验证或后端比对。
2. **分享链接无有效期**：`sign_code` 为 UUID4，链接被转发后他人可打开查看正文（签署会记为转发者）。一次性/限时校验未实现。
3. **审核痕迹丢失**：v116 删列不可逆，历史「审核意见」只剩审计日志与 `void_reason`。
4. **旧客户端/脚本**调用 `POST /agreements/{id}/review` 将得到 404，需要发布说明。
5. **真机未复测**：分享卡片落地、签名画布清晰度、登录后自动重试路径（§5 清单）。
6. **员工侧签署页仍在**：`pages/merchant/agreement/sign/index` 保留（员工代签场景），只是文案不再提示「等待运营审核」。
7. **签署人手机号仍需手填**（REQ-IT5-04）：经纪人接口只回 `phone_masked`，页面无法自动带出真实号码，默认沿用门店联系电话；若需自动带出，应新增后端「经纪人完整手机号」受控端点或改为短信验证。
8. **员工补录的经纪人手机号不做短信校验**（REQ-IT5-05）：手机号仅做格式（11 位）与哈希唯一校验，员工可录入任意号码；防滥用依赖审计日志与后台可改权限。
9. **每家新门店自带 1 个占位经纪人**（REQ-IT5-06）：后台经纪人列表与门店 `broker_count` 会 +1，属预期；软删已排除这条占位绑定（否则新门店永远无法删除），但占位档案会留在档案表，需要时再做一次性清理。
10. **联系人改手机号不同步档案**（REQ-IT5-06）：仅在建店时自动建档；后续在门店编辑里改手机号不会重写经纪人档案，需运营在经纪人管理里换绑。
11. **占位档案不校验号码真实性**（REQ-IT5-06）：自动建档时只验证格式与哈希唯一性，号码归属要到本人扫码认证（`register`）时才确认。
