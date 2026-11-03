# REQ-IT7 迭代 7 验收工件（2026-11-02）

> 来源：m03941「我们接下来迭代admin端，a. admin/merchant/stores模块 1. 需要添加删除功能（软删除） 2. 需要添加详情抽屉，点击后弹开详情抽屉，然后支持编辑模式，支持修改信息 b. admin/merchant/companies 需要支持软删除 c. 使用 /baoyu-design 重新设计admin/merchant/brokers模块，遵循DESIGN.md」
> 需求台账：`docs/商户管理模块需求/商户管理模块-需求与迭代记录.md` §13。

## 1. 需求 ↔ 用例映射

| 需求 | 自动化用例 | 类型 |
|---|---|---|
| REQ-IT7-01 门店详情抽屉（查看 → 编辑 → 保存） | `frontend/e2e/merchant-iteration7.spec.ts` › REQ-IT7-01 门店详情抽屉 | E2E（UI + 接口回读） |
| REQ-IT7-01 门店软删除 | 同文件 › REQ-IT7-01 门店软删除 | E2E（UI + 接口断言） |
| REQ-IT7-02 公司软删除（接口/拦截/幂等） | 同文件 › REQ-IT7-02 公司软删除 | E2E（接口） |
| REQ-IT7-02 公司软删除（后台 UI） | 同文件 › REQ-IT7-02 公司删除 UI | E2E（UI） |
| REQ-IT7-03 经纪人模块设计稿 | 同文件 › REQ-IT7-03 设计稿存在且遵循 Steep 规范 | 静态断言 + 浏览器实测 |
| REQ-IT7-04 经纪人模块设计稿落代码 | 同文件 › REQ-IT7-03 经纪人管理页：KPI / 分段筛选 / 新建弹层 / 详情抽屉 / 编辑资料 | E2E（UI + 接口回读） |
| REQ-IT7-05 详情抽屉样式补齐 | 同文件 › REQ-IT7-03 经纪人管理页（抽屉步骤）+ 计算样式断言 | E2E + 浏览器实测 |
| REQ-IT7-06 换绑 / 新建门店关键词搜索 | 同文件 › REQ-IT7-05 换绑门店改为关键词搜索选择 | E2E（UI + 接口回读） |
| REQ-IT7-07 经纪人建店页公司搜索反馈 | 同文件 › REQ-IT7-07 经纪人建店页公司搜索有可见反馈且接口可查 | E2E（源码三态断言 + C 端接口） |
| REQ-IT7-08 经纪人绑定门店（扫码 / 搜索双路径） | 同文件 › REQ-IT7-08 经纪人绑定门店：扫码 + 搜索两条路径，搜索无结果可创建 | E2E（源码断言）+ 既有后端绑定用例 |
| REQ-IT7-09 门店邀请二维码扫码无反应（主包落地页 + 冷/热启动） | 同文件 › REQ-IT7-09 门店邀请二维码：主包落地页 + 冷/热启动都能解析 scene | E2E（源码断言 + 生成/解析接口契约）+ 反向验证 |

## 2. 自动化命令与实测结果

```bash
cd frontend && npx playwright test e2e/merchant-iteration7.spec.ts --reporter=list
# 10 passed (12.2s)

cd backend && .venv/bin/pytest tests/test_merchant_broker.py -q --no-cov
# 24 passed

cd backend && .venv/bin/pytest tests/test_merchant_admin.py -q --no-cov
# 19 passed

cd backend && .venv/bin/pytest tests/test_merchant_admin.py tests/test_merchant_store_visit.py -q --no-cov
# 34 passed

cd backend && .venv/bin/pytest tests/test_migration_registry.py -q --no-cov
# 9 passed

cd frontend && npx tsc --noEmit            # 零错
cd frontend && pnpm lint                   # 0 warning（eslint src）
cd frontend && npx eslint e2e/merchant-iteration7.spec.ts   # 无输出
cd backend && .venv/bin/ruff check services/merchant routers/merchant schemas/merchant models/merchant migrations
# All checks passed!
```

### 2.1 公司软删除接口实测（E2E 内断言）

| 场景 | 期望 | 实测 |
|---|---|---|
| 删除无门店公司 | 200 `{"deleted": true}` | 通过 |
| 搜索已删公司（include_disabled=true） | 不返回该 id，total=0 | 通过 |
| 删除仍有门店公司 | 409，消息含「门店」 | 通过 |
| 重复删除同一公司 | 200（幂等） | 通过 |

### 2.2 门店详情抽屉实测（E2E 内断言）

| 步骤 | 期望 | 实测 |
|---|---|---|
| 列表搜索目标门店 → 点「详情」 | 右侧抽屉打开，展示「基础信息」与门店名 | 通过 |
| 抽屉内点「编辑」 | 出现「门店名称」输入框等表单 | 通过 |
| 改门店名称 → 「保存修改」 | 抽屉标题更新为新名称 | 通过 |
| `GET /api/v1/admin/merchant/stores/{id}` 回读 | `store_name` 为新名称，`district` 非空 | 通过 |

### 2.3 迁移

- `backend/migrations/_merchant_company_soft_delete.py`：幂等 `ADD COLUMN deleted_at TIMESTAMPTZ`、`deleted_by VARCHAR(36)`，`CREATE INDEX idx_merchant_companies_deleted`。
- 版本登记：`backend/migrations/registry.py` v117（`kind=schema`, `risk=A`, `reversible=True`），`NEXT_VERSION = 118`。
- 本地实库已随 `uvicorn --reload` 执行：`merchant_companies.deleted_at/deleted_by` 均存在（`inspect(engine)` 验证 True）。

### 2.4 REQ-IT7-04 经纪人模块落代码验证（2026-11-02，m04343）

| 项 | 命令/断言 | 结果 |
|---|---|---|
| 后端概览 | `GET /api/v1/admin/merchant/brokers/summary` | `{'total': 30, 'bound': 30, 'unbound': 0, 'pending': 0, 'disabled': 0, 'pending_binding_count': 0}` |
| 来源筛选 | `GET /api/v1/admin/merchant/brokers?source=store_contact` | `total=27`（其余为后台新增/扫码注册） |
| 单测 | `pytest tests/test_merchant_broker.py`（新增 `test_admin_broker_summary_and_source_filter`） | 24 passed |
| E2E 页面 | `merchant-iteration7.spec.ts` › 经纪人管理页 | 4 张 KPI + 4 个 tab、新建弹层创建成功、搜索命中、行 → 抽屉（绑定信息/基本信息/绑定历史）、编辑资料改名并接口回读 → 通过（6 passed） |
| 视觉 | Chromium 1280×720 截图，实现态存档 `designs/admin-merchant-brokers/preview-implementation.png` | 与设计稿结构一致：KPI 卡、tabs、表格、右侧抽屉 |
| 类型/格式 | `npx tsc --noEmit`（frontend）、`npx eslint "src/app/(main)/admin/merchant/brokers"`、`ruff check` | 全部通过 |

### 2.5 REQ-IT7-05 / REQ-IT7-06 补修验证（2026-11-02，m04680 / m04707）

| 项 | 命令/断言 | 结果 |
|---|---|---|
| 抽屉内边距（REQ-IT7-05） | Playwright `getComputedStyle`：`[data-slot=sheet-content]` 宽 480px，header `padding-right: 32px`、`border-bottom: 1px` | 通过（修复前内容贴边，footer `-mx-6` 失效） |
| 抽屉卡片/标签（REQ-IT7-05） | 绑定信息卡背景 `rgb(247,247,248)`、圆角 16px、内边距 `14px 16px`；分组标题 12px / `rgb(119,123,134)` | 通过（token 生效） |
| 已删门店文案（REQ-IT7-05） | `broker.store_id` 存在但 `store_name` 为空 → 显示「门店已删除」+「原绑定门店已删除，可换绑到其他门店」 | 通过 |
| 换绑门店搜索（REQ-IT7-06） | E2E：抽屉 → 换绑 → 输入关键词 → 选择搜索结果 → 填原因 → 确认 → 接口轮询回读 `store_id` | 通过（`merchant-iteration7.spec.ts` 7 passed） |
| 新建弹层门店搜索（REQ-IT7-06） | 新建经纪人弹层「绑定门店」使用同一 `BrokerStorePicker` | 通过（代码复用 + E2E 新建步骤） |
| 单文件行数 | `frontend/src/app/(main)/admin/merchant/brokers/page.tsx` | 473 行（拆分 `broker-summary-cards.tsx`、`broker-pending-panel.tsx`） |
| 类型/格式 | `npx tsc --noEmit`、`npx eslint "src/app/(main)/admin/merchant/brokers"` | 零错 / 无告警 |
| 回归 | `merchant-iteration7.spec.ts` + `merchant-admin-forms.spec.ts` `--workers=1` | **12 passed (22.2s)**（admin-forms 的经纪人编辑用例已改为「行 → 抽屉 → 编辑资料」） |

### 2.6 REQ-IT7-07 经纪人建店页公司搜索补修验证（2026-11-03，m05050）

| 项 | 命令/断言 | 结果 |
|---|---|---|
| 后端接口（前置核对） | broker C 令牌 `GET /api/v1/public/merchant/broker-companies?keyword=公司`；`/public/merchant/districts` | 均 200，返回公司 5 条 → 确认不是后端问题 |
| 前端源码三态（REQ-IT7-07） | E2E 用例 8：`index.ts` 含 `companiesLoading/companiesSearched/companiesError/companyTimer/companySeq`、`loadPage` 内 `void this.searchCompanies()`；`index.wxml` 含「正在搜索公司」「没有找到匹配的公司」「company-status」；`index.wxss` 含 `.company-status` | 通过 |
| 接口命中/空结果（REQ-IT7-07） | C 端令牌按 `${MARK}搜索目标` 查到新建公司；按 `${MARK}不存在的公司` 返回 `items: []` | 通过 |
| 逻辑仿真（REQ-IT7-07） | Node 模拟 `wx.request`：`loadPage()` 后 `state=form`、`companies=1`、`companiesSearched=true`；请求失败时 `companiesLoading=false`、`companiesError` 写入具体网络原因 | 通过 |
| 类型检查 | `cd miniapp && npx tsc --noEmit` | 零错 |
| E2E 全量（本文件） | `npx playwright test e2e/merchant-iteration7.spec.ts --reporter=line` | **10 passed (12.2s)**（含 REQ-IT7-08/09） |

### 2.7 REQ-IT7-08 经纪人绑定门店双路径验证（2026-11-03，m05520）

| 项 | 命令/断言 | 结果 |
|---|---|---|
| 未绑定卡双入口 | E2E 用例 9：`index.wxml` 含「搜索绑定门店」（`bindtap="onOpenBind"`）、「扫码绑定门店」（`bindtap="onScanBind"`）、「找不到自己的门店」；认证页含「搜索门店（认证后绑定）」「扫码识别门店」 | 通过 |
| 搜索弹层空态 | `index.wxml` 含「门店搜索中」「找不到？创建新门店」与 `bindtap="onCreateStoreFromPanel"`；`index.ts` 含 `storeSearching/storeSearched` | 通过 |
| 扫码实现 | `index.ts` 含 `wx.scanCode`、`extractStoreQrCode`（兼容 `?scene=`/`?code=`/纯短码）、`/public/merchant/brokers/me/bind` | 通过 |
| 认证页选店 / 扫码 | `index.wxml` 含「搜索门店（认证后绑定）」「扫码识别门店」；`onSubmitStore` 在 `state=register` 时写 `pendingStoreId/pendingStoreName`，`onRegister` 成功后调 `/brokers/me/bind`；`bindByQrCode` 在 `state=register` 时写 `qrCode/qrStoreName`，认证后由 `register` 自动绑定 | 通过（源码 + 既有 register / bind 用例） |
| 类型检查 | `cd miniapp && npx tsc --noEmit` | 零错 |
| E2E | `npx playwright test e2e/merchant-iteration7.spec.ts --reporter=line` | **10 passed (12.2s)** |

### 2.8 REQ-IT7-09 门店邀请二维码落地补修验证（2026-11-03，m05723）

| 项 | 命令/断言 | 结果 |
|---|---|---|
| 后端生成/解析实测 | admin C 令牌 `POST /api/v1/public/merchant/stores/c10a8215-04f2-4020-97f7-e0ce463eea1a/broker-qrcode?env_version=develop` → 200，`page=pages/merchant-invite/index`、`env_version=develop`、`image_base64` 长度 117144；`GET /api/v1/public/merchant/broker-qrcodes/{code}` → `valid: true`、`store_id` 一致 | 通过 |
| 主包落地页 | `miniapp/app.json` 主包 `pages` 含 `pages/merchant-invite/index`（且不在 `pages/merchant` 分包）；落地页 `onLoad` + `onShow` 均调用 `handleOptions`，用 `getEnterOptionsSync` 取 `scene/query` | 通过 |
| 旧码兼容 / 直达解析 | `miniapp/pages/merchant/home/index.ts` 含 `extractSceneCode`、`lastHandledSceneCode`，`onShow` 内读 `getEnterOptionsSync`；`miniapp/pages/merchant/broker/index.ts` 含 `parseSceneCode` 与 `options.scene` | 通过 |
| 真机扫码限制（m05978） | `miniapp/pages/merchant/broker/index.ts` 的 `wx.scanCode` **不传 `scanType`**（指定 `scanType:["qrCode"]` 时微信真机不识别小程序码；开发者工具相册上传不受限）；`onlyFromCamera:false` 保留相册能力 | 通过（源码断言；真机已能拉起扫码） |
| 小程序码解析（m06044） | 扫本小程序小程序码时 `res.result` 为空或 `"*"`，scene 只在 `res.path`；回调改为 `for (const candidate of [res.path, res.result])` 逐个 `extractStoreQrCode`，两者兼容 | 通过（源码断言 + 真机待复测绑定） |
| 版本兼容（env_version） | `backend/services/system/wechat.py` 的 `fetch_miniapp_unlimited_qrcode` 写入 `env_version` payload；`broker_qr.generate()` 透传；`POST /broker-qrcode` 支持 `env_version=release|trial|develop`；`miniapp/pages/merchant/store/detail/index.ts` 用 `wx.getAccountInfoSync().miniProgram.envVersion` 请求 | 通过（三种版本实测均 200） |
| E2E 用例 10 | `npx playwright test e2e/merchant-iteration7.spec.ts` | **10 passed (11.9s)**（用例 10 含 `env_version=develop` 契约、主包落地页、旧码兼容、scanCode 无 scanType 断言） |
| 反向验证 | 临时移除落地页 `onShow` → 用例 10 **1 failed**（`expect(inviteTs).toContain("getEnterOptionsSync")`）；恢复后通过 | 通过 |
| 后端回归 | `cd backend && .venv/bin/pytest tests/test_merchant_broker.py tests/test_recruit.py tests/test_property_sheet.py -q --no-cov`；`ruff check .`；`cd miniapp && npx tsc --noEmit` | **129 passed**；All checks passed；零错 |

## 3. 设计稿验证（REQ-IT7-03）

```bash
cd /Users/bugco/Desktop/profo
python3 -m http.server 4311 --directory designs
# 打开 http://127.0.0.1:4311/admin-merchant-brokers/index.html
```

Chromium 1440×900 实测结果：

| 检查项 | 结果 |
|---|---|
| `console` error / `pageerror` | `[]`（无错误） |
| 列表渲染 | 7 行经纪人数据 |
| 行点击打开详情抽屉 | `#drawer.on` 命中 1（7 行） |
| 「新建经纪人」打开弹层 | `#modal.on` 命中 1 |
| Esc 关闭抽屉/弹层、遮罩点击关闭 | 通过（脚本断言 + 手工） |
| 外部资源依赖 | 无（自包含单文件，无 `<script src>`、无外链 CSS/字体/图片） |
| 资产登记 | `designs/admin-merchant-brokers/_d_meta.json`：`type=design`、资产「经纪人管理」、版本 `index.html`、状态 `needs-review`、viewport 1440×900 |

截图（评审时可用）：
- `/tmp/brokers-design2.png`（列表页）
- `/tmp/brokers-design-drawer.png`（详情抽屉）
- `/tmp/brokers-modal2.png`（新建弹层）
> 注：`/tmp` 为临时目录，正式评审以 HTTP 预览为准；截图如需归档可复制到本目录。

## 4. 数据与清理策略

- E2E 使用 `MARK = E2EIT7${Date.now()}` 生成公司/门店名与手机号，坐标按 MARK 派生，避免触发 500m 疑似重复门店。
- `afterAll` 用 `backend/.venv/bin/python` 清理：先按门店 id 删除 `MerchantBrokerBinding`、`MerchantBroker`（含 REQ-IT5-06 建店自动生成的占位经纪人），再删 `MerchantStore`、`MerchantCompany`。
- 未修改任何生产数据；演示/测试数据均带 MARK 前缀。

## 5. 回归与已知基线

```bash
cd frontend && npx playwright test e2e/merchant-iteration1.spec.ts ... e2e/building-dict-region-dicts.spec.ts --workers=1 --reporter=line
# 34 passed / 6 failed / 4 did not run（2026-11-02 复跑，含 REQ-IT7-04 经纪人页用例）
```

6 条失败均为**小程序源码断言**，与本次 Admin 端改动无关：

| 失败用例 | 原因 |
|---|---|
| `merchant-iteration1.spec.ts` › REQ-IT1-01/02/04 | 断言 `.mini-btn { box-sizing }` 仍读单页 wxss；`1f536ce3` 已把共享样式合并到 `miniapp/styles/merchant-theme.wxss` |
| `merchant-iteration4.spec.ts` › REQ-IT4-01 | 同上，`.footer` 已迁到主题文件 |
| `merchant-iteration5.spec.ts` › REQ-IT5-06 | 建店页文案/结构在 `1f536ce3` 重构中调整 |
| `merchant-iteration6.spec.ts` › REQ-IT6-01/02/03 | 旧类名 `store-card__*` 已改为 `store__*`，图标/配色断言需按新结构更新 |

证据：`git status --porcelain` 中本次改动不含任何 `miniapp/**` 文件；`git log --oneline -5` 显示 `1f536ce3 feat(merchant): 重构商户模块状态与错误处理，统一UI规范` 在本轮之前已提交。

## 6. 真机 / 人工复测清单

1. 门店列表点击整行打开抽屉；点击行内门店名仍跳转详情页（不被抽屉拦截）。
2. 抽屉编辑：修改门店名称/地址/区域/商圈/联系人/负责人后保存，刷新页面确认持久化。
3. 门店删除：填写原因后确认，列表消失；有拜访/绑定等关联数据时展示后端 409 文案。
4. 公司删除：无门店公司可删除；有门店公司提示先处理门店；删除后新建门店的公司下拉不再出现。
5. 设计稿：`designs/admin-merchant-brokers/index.html` 在目标浏览器 1440×900 下无横向滚动、抽屉/弹层无遮挡。
6. 经纪人管理页：4 张 KPI 数字与列表数据一致；分段 tabs 与搜索/门店/来源组合筛选；点击整行打开详情抽屉；新建/编辑资料弹层保存后列表与抽屉同步；解绑/停用需填原因。
7. 经纪人未绑定门店：卡内可见「搜索绑定门店」与「扫码绑定门店」两个按钮；搜索无结果出现「找不到？创建新门店」；认证页可先「搜索门店（认证后绑定）」再提交认证；扫内部员工门店二维码可识别并直接绑定（已认证）或认证后自动绑定（未认证）。

## 7. 已知偏差 / 限制

- 「待审核」tab 统计的是**存在 pending 绑定申请的经纪人**（`pending_only`），不是 `bind_status=pending`（当前业务流不会写该状态）；KPI「待审核绑定」展示的是申请条数，两者口径不同，页面文案已分别标注。
- 经纪人列表/KPI 为全量口径，不随页面上的门店/来源筛选联动（与设计稿一致）；若后续需要联动需给 summary 增加筛选参数。

1. 经纪人模块本次仅交付设计稿（`needs-review`），未改 `admin/merchant/brokers/page.tsx`；评审通过后另起迭代实施。
2. 公司软删除无恢复入口（记录保留但列表不可见），如需恢复要另做「回收站」。
3. 门店软删除沿用既有 `soft_delete` 的关联校验：存在拜访/绑定/线索/协议时不可删除，只能停用。
4. 抽屉编辑未覆盖合作状态、照片、协议；这些仍走各自入口。
5. 6 条小程序源码断言用例为既有基线失败（`1f536ce3` 样式合并导致），本次未修复，建议由小程序侧维护者更新断言。
6. 设计稿交互为原型级（toast 模拟保存/审批），不代表最终接口行为。
7. 经纪人扫码绑定依赖微信客户端相机/扫码能力，E2E 仅覆盖源码与接口契约，需真机验证扫码与相机权限。
