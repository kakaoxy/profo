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
| 后端 | `pytest tests/test_merchant_{agreement,admin,store_visit,platform}.py tests/test_migration_registry.py -q --no-cov` | **62 passed** |
| 迭代 5 用例 | `npx playwright test e2e/merchant-iteration5.spec.ts` | **5 passed** |
| merchant 回归（含通知） | 11 个 spec `--workers=1` | **35 passed (36.7s)** |
| 静态检查 | `ruff check` / `ruff format --check` / `npx tsc --noEmit`×2 / `pnpm lint` | 全绿 |

---

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
