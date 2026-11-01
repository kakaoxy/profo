# 迭代 1 验收工件（REQ-IT1-01 ~ REQ-IT1-05）

- 迭代：迭代 1 · 门店创建流程
- 日期：2026-11-01
- 环境：本地调试模式（后端 `uvicorn main:app --reload --host 0.0.0.0 --port 8000`，前端 `pnpm dev` :3000），非 docker 部署
- 自动化用例：`frontend/e2e/merchant-iteration1.spec.ts` + 助手 `frontend/e2e/helpers/merchant-store-form.ts`

---

## 1. 自动化验证（可复跑）

### 1.1 本轮新增用例

```bash
cd frontend && npx playwright test e2e/merchant-iteration1.spec.ts --reporter=list
```

实测（2026-11-01）：`4 passed`

用例与需求映射：

| 用例标题 | 覆盖需求 | 断言要点 |
|---|---|---|
| REQ-IT1-05 公司列表默认展示最新创建并带分页 | REQ-IT1-05 | 进入页面无需搜索即有数据行；空态文案「输入公司名称后查询」不再出现；显示「共 N 条」「每页」；切页大小触发 `page_size=10` 请求并回到第 1 页；API 侧 `items/total/page/page_size` 齐备且 `created_at` 降序 |
| REQ-IT1-03/04 后台门店表单无省市、区域商圈来自系统列表、后端补齐省市 | REQ-IT1-03、REQ-IT1-04 | 表单无「省份/城市」输入；区域为下拉且只能选列表项；商圈为该区域系统候选下拉；提交后 `GET /admin/merchant/stores/{id}` 返回 `province=上海市`、`city=上海市`、`district`/`business_circle` 与选择一致 |
| Q4 后台门店列表移除省/市筛选控件 | REQ-IT1-03（Q4=A） | 门店列表无「省份/城市」输入，区县/商圈筛选保留 |
| REQ-IT1-01/02/04 小程序源码断言 | REQ-IT1-01、REQ-IT1-02、REQ-IT1-04 | `＋ 新增公司` 由 `wx:if="{{companySearched}}"` 控制；`.mini-btn`/`.section` 含 `box-sizing: border-box`；字段顺序 门店名称 → 地图选点 → 区域/商圈；区域/商圈为 `picker` 且区域取 `districts`；WXML 不再引用 `form.province`/`form.city`（小程序 + 经纪人自建店页） |

稳定性验证（并行 + 重复）：

```bash
cd frontend && npx playwright test e2e/merchant-iteration1.spec.ts --repeat-each=2 --reporter=list
```

实测：`8 passed (1.1m)`（5 workers 并行；单个用例超时设为 120s，用于覆盖后端登录限流 5 次/分钟时的退避重试）。

### 1.2 关联用例回归

```bash
cd frontend && npx playwright test \
  e2e/merchant-iteration1.spec.ts \
  e2e/merchant-company-admin.spec.ts \
  e2e/merchant-admin-forms.spec.ts \
  e2e/merchant-store-admin-v7.spec.ts \
  e2e/merchant-store-activation.spec.ts \
  e2e/merchant-map-tracks.spec.ts --reporter=list
```

说明：`e2e/merchant-admin-forms.spec.ts` 的两条门店用例原先直接手填「商圈」文本，迭代 1 后商圈为列表选择，已改为复用 `pickStoreRegion()`（区域取列表首项 → 等 `/business-circles?district=` 响应 → 有候选选首项、无候选退回手填），断言目标（负责人/合作状态/重复候选）未变。

### 1.3 静态检查

| 检查 | 命令 | 结果 |
|---|---|---|
| 前端类型 | `cd frontend && npx tsc --noEmit` | 零错误 |
| 前端 lint | `cd frontend && pnpm lint` | 通过（0 error / 0 warning） |
| 小程序类型 | `cd miniapp && pnpm tsc` | 零错误 |
| 后端 lint | `cd backend && .venv/bin/ruff check services/merchant routers/merchant schemas/merchant` | All checks passed! |
| 后端格式 | `cd backend && .venv/bin/ruff format --check services/merchant routers/merchant schemas/merchant` | 29 files already formatted |
| 契约同步 | `cd frontend && pnpm gen-api`、`cd miniapp && pnpm gen-api` | `MerchantDistrictListResponse`、`MerchantCompanyListResponse.page/page_size`、`MerchantStoreCreate.province/city: string \| null` 已生成 |

---

## 2. 小程序手工复测（无法自动化，需真机/开发者工具）

> 小程序页面不能跑在 Playwright 里，本轮以源码断言 + 以下手工步骤为准。复测后请把实测结果补在本节末尾。

前置：开发者工具点「编译」（Cmd/Ctrl+B）清除增量缓存后重进「商户 → 门店建档」页；真机需已开通 `wx.chooseLocation` 且《用户隐私保护指引》声明「位置信息」。

| 需求 | 步骤 | 预期 |
|---|---|---|
| REQ-IT1-01 | 进入门店建档页，不搜索公司，观察「所属公司」区 | 无「＋ 新增公司」入口；搜索任意关键词（含 0 结果）后才出现 |
| REQ-IT1-01 | 搜索无结果时 | 同时出现「未找到，可新增公司」+「＋ 新增公司」 |
| REQ-IT1-02 | 点「＋ 新增公司」展开表单，观察「创建并选择」按钮（375 / 414 两种屏宽） | 按钮左右边界在屏幕内，无横向滚动 |
| REQ-IT1-03 | 查看门店信息字段 | 无「省」「市」输入项；区域、商圈在同一行 |
| REQ-IT1-04 | 「地图选点」位置 | 位于「门店名称」与「区域/商圈」之间 |
| REQ-IT1-04 | 点「选择位置」选中一个已知地址 | 回填详址/经纬度；命中系统区域时区域自动带出；未命中 toast「未识别到区域，请手动选择区域与商圈」 |
| REQ-IT1-04 | 点击「区域」「商圈」 | 均为底部选择器（非键盘手填）；切换区域后商圈被清空并重新拉取该区域候选 |
| 经纪人自建店 | 进入经纪人自建店页重复 REQ-IT1-03/04 检查 | 与员工建档页一致（无省市、区域/商圈为选择器） |

实测结果：**待真机复测**（⚠️ 未覆盖：本轮无真机环境，故 REQ-IT1-01/02/04 的小程序侧仅有人工待办；源码断言见 1.1）。

---

## 3. 已知偏差与待确认（⚠️ 需评审）

1. **商圈「必须来自列表」存在例外**：按 Q3=A，前端约束为「有系统候选时只能选候选，无候选时退回手填输入框」（两端一致）。原因：`MerchantStoreService.business_circles` 按区域过滤后可能为空，若强约束将导致该区域无法建店。若评审要求硬约束，需要同时评估区域主数据补录流程。
2. **区域下拉依赖主数据**：区域列表来自 `Community.district` distinct（新增端点 `GET /public/merchant/districts`、`GET /admin/merchant/districts`）。字典为空时区域下拉无选项，前端提示「区域列表加载失败」。
3. **历史门店区域不在字典内**：编辑老门店时区域下拉可能显示为空（值不在选项内）。目前未做「保留历史值作为可选项」的处理，待评审是否需要在编辑态把原值注入选项。
4. **REQ-IT1-03 的省市默认值**：后端统一补齐为 `上海市 / 上海市`（常量 `_DEFAULT_PROVINCE`/`_DEFAULT_CITY`，`backend/services/merchant/store.py`）。若后续面向多城市，需要改为从区域→城市主数据推导（当前无 City 模型）。

---

## 4. 改动文件清单

后端：
- `backend/schemas/merchant/__init__.py`（省市可选、公司列表分页字段、区域字典响应）
- `backend/services/merchant/store.py`（省市补齐、`districts()`）
- `backend/services/merchant/company.py`（`paginate()`，`search()` 语义未变）
- `backend/routers/merchant/admin.py`（公司分页、`GET /admin/merchant/districts`）
- `backend/routers/merchant/public.py`（`GET /public/merchant/districts`）

前端（后台）：
- `frontend/src/app/(main)/admin/merchant/companies/page.tsx`（默认加载 + 分页 + 页大小）
- `frontend/src/app/(main)/admin/merchant/stores/new/page.tsx`（去省市、区域/商圈改选择、字段顺序、`page_size`）
- `frontend/src/app/(main)/admin/merchant/stores/page.tsx`（移除省市筛选控件）
- `frontend/src/app/(main)/admin/merchant/agreements/page.tsx`（`limit` → `page_size`）
- `frontend/src/lib/api-types.d.ts`（gen-api 产物）

小程序：
- `miniapp/pages/merchant/store/create/index.ts` / `index.wxml` / `index.wxss`
- `miniapp/pages/merchant/broker/store-create/index.ts` / `index.wxml` / `index.wxss`
- `miniapp/utils/region.ts`（区域文本匹配，REQ-IT1-04/Q2=A）
- `miniapp/utils/location.ts`（BUG-01 选点诊断，见同目录 BUG-01 工件）
- `miniapp/types/api-types.d.ts`（gen-api 产物）

测试：
- `frontend/e2e/merchant-iteration1.spec.ts`（新增）
- `frontend/e2e/helpers/merchant-store-form.ts`（新增）
- `frontend/e2e/merchant-admin-forms.spec.ts`（适配区域/商圈列表选择）

---

## 5. 自动化稳定性修复（本轮踩到并已修）

并行/重复执行 merchant 用例时暴露了三处非功能性缺陷，均已修复并复跑验证：

| 问题 | 现象 | 根因 | 修复 |
|---|---|---|---|
| 门店新建用例偶发「疑似重复门店」而拿不到 404/未创建 | 提交被前端拦下要求「强制新建理由」，`waitForResponse` 拿到的门店创建请求超时或返回异常 | 用例坐标固定在 `121.5055/31.2455`，与 `merchant-map-tracks.spec.ts` 预置门店相距约 29m，落在后端查重半径 `_DISTANCE_LIMIT_M = 500`（`backend/services/merchant/store.py:69`）内 | `merchant-iteration1.spec.ts` 改为按 `test.info().parallelIndex` 生成唯一坐标（间距 ≈2km + 随机抖动），并在仍命中查重时补「强制新建理由」兜底；断言失败信息附带响应体，便于定位 |
| 公司列表页「默认列表」与「搜索结果」乱序覆盖 | 搜索一个 0 结果关键词后偶发不出现「没有符合条件的公司」空态（旧数据覆盖了新结果） | `load()` 无请求序号，先发的默认列表请求后返回会覆盖后发的搜索请求结果 | `frontend/src/app/(main)/admin/merchant/companies/page.tsx` 增加 `requestSeq` ref，只有最后一次请求的响应才落地（`useRef` 守卫，含 loading/error） |
| 既有用例 `merchant-company-admin.spec.ts` 并行超时 | `Test timeout of 30000ms exceeded` | 后端登录限流 5 次/分钟，`e2e/helpers/auth.ts:47-48` 遇 429 会退避 20s/40s，30s 默认超时不够 | 该用例补 `test.describe.configure({ timeout: 120_000 })`（与 `merchant-iteration1.spec.ts` 一致） |

复跑证据：`npx playwright test e2e/merchant-iteration1.spec.ts e2e/merchant-company-admin.spec.ts e2e/merchant-admin-forms.spec.ts e2e/merchant-store-admin-v7.spec.ts e2e/merchant-store-activation.spec.ts e2e/merchant-map-tracks.spec.ts --reporter=list` → `15 passed`（连续复跑）。
