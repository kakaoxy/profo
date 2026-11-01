# 迭代 2 · 验收工件（REQ-IT2-01 ~ 03）

> 需求台账：`docs/商户管理模块需求/商户管理模块-需求与迭代记录.md` §8
> 环境：后端 `http://127.0.0.1:8000`（`uvicorn main:app --reload`）、前端 `http://127.0.0.1:3000`（`pnpm dev`）
> 记录时间：2026-11-01 · 结果：自动化全绿；小程序真机复测待人工执行（见 §4）

---

## 1. 需求与验证用例映射

| 需求 | 验证手段 | 用例 / 命令 |
|---|---|---|
| REQ-IT2-01 字典页新增/重命名同步/停用 | Playwright | `frontend/e2e/merchant-iteration2.spec.ts` ›「REQ-IT2-01 字典页：新增/重命名同步业务数据/停用后移出候选」 |
| REQ-IT2-01 门店表单区域必填拦截 | Playwright | 同文件 ›「REQ-IT2-01 门店表单：城市字段下线，区域/商圈未选不允许建店」 |
| REQ-IT2-01 区域空候选时可手填 | 源码断言 | 同文件 ›「REQ-IT2-01 门店表单区域候选为空时提供手填降级（源码断言）」 |
| REQ-IT2-02 建店页去首访（后端放宽） | pytest | `backend/tests/test_merchant_store_visit.py::test_employee_create_store_without_first_visit` |
| REQ-IT2-02 建店页去首访（小程序） | 源码断言 | `frontend/e2e/merchant-iteration2.spec.ts` ›「REQ-IT2-02/03 小程序源码断言…」 |
| REQ-IT2-03 拜访人改经纪人选择 | 源码断言 + 既有接口测试 | 同上断言；接口 `GET /public/merchant/stores/{store_id}/brokers` 已由 `backend/tests/test_merchant_lead_attribution.py:454` 覆盖 |
| 迁移可复跑 | pytest | `backend/tests/test_migration_registry.py`（`v114 create_merchant_region_dict_table`） |

---

## 2. 自动化命令与实测结果

### 2.1 后端

```bash
cd backend
.venv/bin/ruff check services/merchant routers/merchant schemas/merchant models constants migrations
# All checks passed!

.venv/bin/ruff format --check services/merchant routers/merchant schemas/merchant models constants migrations
# 32 files already formatted

.venv/bin/pytest tests/test_merchant_store_visit.py tests/test_merchant_admin.py tests/test_migration_registry.py -q -p no:cacheprovider --no-cov
# 41 passed, 2 warnings in 7.56s
```

建表验证（迁移 v114 幂等，随 `--reload` 启动执行）：

```bash
cd backend && .venv/bin/python -c "from db import engine; from sqlalchemy import inspect; print(inspect(engine).has_table('merchant_region_dicts'))"
# True
```

存量业务数据补录（幂等）：

```bash
cd backend && .venv/bin/python -c "
from db import SessionLocal
from services.merchant.region_dict import MerchantRegionDictService
db = SessionLocal(); print(MerchantRegionDictService(db).sync_from_business_data()); db.close()"
# {'district': 27, 'business_circle': 251}
```

### 2.2 接口契约

`pnpm gen-api` 已按新 Pydantic 重新生成两端类型（`frontend/src/lib/api-types.d.ts`、`miniapp/types/api-types.d.ts`），新增：

- 路径：`GET/POST /api/v1/admin/merchant/region-dicts`、`POST /api/v1/admin/merchant/region-dicts/sync`、`PUT /api/v1/admin/merchant/region-dicts/{dict_id}`、`POST /api/v1/admin/merchant/region-dicts/{dict_id}/status`
- Schema：`MerchantRegionDictItem`、`MerchantRegionDictListResponse`、`MerchantRegionDictCreate`、`MerchantRegionDictUpdate`、`MerchantRegionDictStatusRequest`

### 2.3 前端 / 小程序静态检查

```bash
cd frontend && npx tsc --noEmit && pnpm lint
# tsc 零错；eslint 0 error 0 warning

cd miniapp && npx tsc --noEmit
# 零错
```

### 2.4 Playwright

```bash
cd frontend && npx playwright test e2e/merchant-iteration2.spec.ts --reporter=list
# 4 passed (2.5s)

cd frontend && npx playwright test \
  e2e/merchant-iteration1.spec.ts e2e/merchant-iteration2.spec.ts \
  e2e/merchant-admin-forms.spec.ts e2e/merchant-company-admin.spec.ts \
  e2e/merchant-store-admin-v7.spec.ts e2e/merchant-store-activation.spec.ts \
  e2e/merchant-map-tracks.spec.ts --reporter=list
# 19 passed (30.8s)
```

用例内实测断言要点：

1. 字典页新增区域 + 商圈后，`GET /admin/merchant/region-dicts?dict_type=district&keyword=<MARK>&page=1&page_size=20` 能查到，且响应含 `page=1`、`page_size=20`；
2. UI 重命名后提示「已改名，并同步更新小区主数据与门店上的同值记录」，且用该区域建的门店 `district` 变为新名称（`GET /admin/merchant/stores/{id}` 断言）；
3. 停用后 `GET /admin/merchant/districts` 不含该值（即从门店表单候选移除）；
4. 门店表单不填区域点「保存门店」→ 页面提示「请选择或填写区域」，未发起建店请求；
5. 小程序源码：建店页无「首次拜访」/`firstVisit`/`first_visit`/`merchant_visit_result`；拜访页含 `range="{{brokerLabels}}"`、`bindchange="onSelectBroker"` 与降级提示。

---

## 3. 数据与清理

- 用例数据统一带 `E2EIT2<时间戳>` 前缀，`afterAll` 通过后端 `SessionLocal` 清理 `merchant_stores` / `merchant_companies` / `merchant_region_dicts`；
- 门店坐标/手机号按时间戳派生，避开后端查重半径（`_DISTANCE_LIMIT_M = 500`），避免历史残留数据导致假失败；
- 不写入任何真实账号/密码，测试账号取自 `frontend/.env.local` 的 `E2E_ADMIN_USER` / `E2E_ADMIN_PASSWORD`。

---

## 4. 小程序手工复测步骤（待人工执行）

| 步骤 | 期望 |
|---|---|
| 1. 微信开发者工具打开 `miniapp`，进入「门店建档」 | 页面**没有**「首次拜访」区块；字段为 门店名称 → 地图选点 → 区域 → 商圈 → 详细地址 → 联系人/电话 → 合作状态 → 照片/备注 |
| 2. 页面加载后检查网络面板 | 不再请求 `/public/dicts/merchant_visit_result` |
| 3. 提交建档 | 请求体不含 `first_visit`；成功后门店详情正常；`merchant_visits` 无首访记录 |
| 4. 进入该门店「拜访登记」 | 「拜访人 *」为下拉，选项来自该门店已绑定经纪人（默认选中第一位），选中后显示姓名 |
| 5. 门店无有效经纪人时进入拜访登记 | 「拜访人」退回输入框，placeholder 为「门店暂无经纪人，可填写联系人」 |
| 6. 后台补建一个区域（`/admin/merchant/region-dicts`）后回到建档页刷新 | 区域下拉出现新增项 |

> 定位到 `miniapp/pages/merchant/store/create/index` 与 `miniapp/pages/merchant/visit/create/index`；如遇后端 400，请附响应体与操作步骤登记到本工件。

---

## 5. 已知偏差与遗留

| # | 项 | 说明 |
|---|---|---|
| 1 | 员工自建门店不再有首访记录 | 决策 Q4=A 的直接结果；拜访轨迹/首访考核口径需运营确认 |
| 2 | 字典重命名不回溯历史快照 | 只同步 `communities` / `merchant_stores` 文本列；审计 JSON、报表快照中的旧值保持不变 |
| 3 | 停用不影响已建门店 | 仅从候选移除，已建门店继续显示该区域/商圈 |
| 4 | 商圈「所属区域」未与区域字典强绑定 | 后台可填任意区域名，后续可加联动校验 |
| 5 | 经纪人电话无法回填 | `BrokerResponse` 仅返回 `phone_masked`，拜访电话仍手填（默认带出门店电话） |
| 6 | 小程序运行时未在真机验证 | Playwright 只能锁源码与后台 UI，见 §4 待人工复测 |
