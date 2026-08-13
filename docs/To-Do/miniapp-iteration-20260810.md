# 小程序迭代计划（2026-08-10）

> 目标：补齐 C 端小程序「我的」页内部员工功能与分享能力，并复用后台已成熟的数据能力。
> 遵循 `AGENTS.md`：默认 Server 组件 / 小程序按页面拆文件、显式标注所有不确定项。

> ✅ **状态更新（2026-08-11）**：模块 1「房源查询功能」已**完成并完善**（列表 / 筛选 / 小区搜索 / 商圈搜索 / 分页 / 图片展示），见 [§1](#1-房源查询模块对等-adminproperties) 底部「完成记录」。其余模块（§2 关于页分享、§3 数据分析、§4 小区分析、§5 微信登录）仍为待办。

## 总览

| # | 模块 | 页面/入口 | 对应后台 | 受众 | 后端依赖 | 状态 |
|---|------|-----------|----------|------|----------|------|
| 1 | 房源查询 | profile 内部入口 → 新页 `pages/properties/*` | `admin/properties` | 内部员工 | 无（复用现有 `GET /api/v1/properties`） | ✅ 已完成 |
| 2 | 关于页分享 | `pages/about` | - | 公开（C 端） | 无（仅前端分享配置） | ⬜ 待办 |
| 3 | 数据分析 | profile 内部入口 → 新页 `pages/analysis/*` | `admin/reports/market` | 内部员工 | 无（复用现有 `GET /api/v1/reports/market/*`） | ⬜ 待办 |
| 4 | 小区数据分析 | `pages/valuation/detail`（房源信息与评估价格之间） | `admin/reports/communities` | C 端 | **需新增 C 端公开接口（见 §4 不确定项）** | ⬜ 待办 |
| 5 | 微信授权登录 | profile 登录按钮 | 后端 `/auth/wechat/login` 已实现 | C 端/内部 | 主要缺口在前端（见 §5 现状核对） | ⬜ 待办 |

---

## 1. 房源查询模块（对等 `admin/properties`）

**入口**：`pages/profile/index` 的 `INTERNAL_ENTRIES.properties` 已存在（`key: "properties"`），当前无 `route`（点击「功能待开放」）。本项补上 `route: "/pages/properties/list/index"` 并新建页面。

**成功标准**：内部员工可进入房源查询，完成 房源列表 / 筛选 / 小区搜索 / 商圈搜索，与后台 `admin/properties` 数据一致。

**页面拆分**（对等后台 `properties/page.tsx` 的表格+筛选结构，按小程序布局）：
- `pages/properties/list/index`：房源列表页（主界面）
  - 列表卡片：小区名、户型、朝向、楼层、面积、总价、单价、状态
  - 筛选（可折叠面板或底部弹出）：小区名、行政区、商圈、户型(室)、楼层级别
  - 排序：总价/单价/面积/成交时间 asc|desc（`sort_by=sold_date`）
  - 分页：`page` / `page_size`，上拉加载更多
- `pages/properties/list/constants.ts`（若超过 500 行再拆分，参照 `renovation/detail` 的拆分习惯）

**API（后台令牌，`request.ts` 非 `/public/*` 自动注入 `access_token`）**：
- 列表：`GET /api/v1/properties`（admin 令牌）
  - 参数：`community_name`、`districts`、`business_circles`、`rooms`、`floor_levels`、`min_price`、`max_price`、`min_area`、`max_area`、`sort_by`、`sort_order`、`page`、`page_size`
- 小区搜索：`GET /api/v1/properties/communities/search?q=`（admin 令牌，精简返回 `id/name/district/business_circle`）
- 商圈/行政区字典：`GET /api/v1/admin/dictionaries?dict_type=business_circle|district`（admin 令牌）

**复用（已确认）**：复用 `components/community-search`，**必须参数化**（props 传入搜索 url 与响应类型），不改写共用逻辑——该组件正被 C 端 `valuation/submit` 使用（硬编码 `/public/communities/search` + `PublicCommunitySearchItem`）。本页传入 admin 接口 `GET /api/v1/properties/communities/search`，并回归验证 `valuation/submit` 不受影响。

**状态筛选说明**：`GET /api/v1/properties` 支持 `status`（在售/成交/过期）参数，列表卡片展示状态；如需按状态筛选，前端补传 `status` 参数（本计划默认列表展示全部状态，不强制筛选）。

**任务**
1. `pages/profile/index.ts`：`INTERNAL_ENTRIES.properties` 补 `route`。
2. 新建 `pages/properties/list` 四件套（ts/js/json/wxml/wxss）+ `app.json` 注册。
3. 实现列表拉取、筛选态、小区搜索、商圈搜索、分页。
4. `pnpm tsc --noEmit` 通过；编译 `index.js` 与 `index.ts` 逻辑一致。

**验证**：内部员工登录 → profile 点「房源查询」→ 进入列表；筛选/搜索/翻页生效，数据与后台一致。

> ✅ **完成记录（2026-08-11）**：本模块已全部落地并通过验证。
> - 完成：profile 入口补 `route` 并置顶；新建 `pages/properties/list` 四件套并注册；实现列表拉取、筛选、小区搜索、商圈搜索、分页与图片展示。
> - 复用：`components/community-search` 已参数化（`searchUrl` 默认 `/public/communities/search` + `skipAuth` 默认 `true`），本页传入 admin 接口，且回归验证 `valuation/submit` 不受影响。
> - 工具：`getFloorPlan` / `isValidUrl` 已从 `utils/floor-plan.ts` 迁移（含微信环境不支持 `URL` 构造器的修复）。
> - 验证：`pnpm tsc --noEmit` 零错、`pnpm test` 通过；真机/开发者工具预览确认筛选、搜索、翻页、图片展示均正常。
> - 附加修复：筛选遮罩层级、原生导航栏去重、链家图床 403/CDN 参数、OSS 图片 URL 误加 CDN 参数等历史问题均已收敛。

---

## 2. 关于页分享按钮（`pages/about`）

**成功标准**：在 `pages/about` 提供分享入口，分享卡片带标题、路径与配置图片。

**改动**（纯前端，`pages/about/index`）：
- 页面增加分享按钮：`<button open-type="share">`（或右上角胶囊菜单分享）。
- 在 `onLoad` 调用 `wx.showShareMenu({ withShareTicket: true })` 开启页面分享。
- 新增 `onShareAppMessage`（及可选 `onShareTimeline`）：
  - `title`：如「约定好上家，约定好下家」或品牌口号
  - `path`：`/pages/valuation/submit/index`（卖房估价入口，转化主路径）
  - `imageUrl`：**分享图片需配置**（见任务 2）
- `onShareTimeline` 需配置 `imageUrl` 才可显示自定义封面。

**分享图片来源（已确认）**：使用小程序静态本地图片（`miniapp/assets/share.png`），`imageUrl` 用本地路径。

**任务**
1. `pages/about/index/index.wxml` 增加 `open-type="share"` 按钮。
2. `pages/about/index/index.ts` 增加 `onShareAppMessage` / `onShareTimeline`，配置 `title/path/imageUrl`。
3. 准备分享图片资源 `miniapp/assets/share.png`（尺寸建议 5:4，如 500×400）。
4. `pnpm tsc --noEmit` 通过。

**验证**：真机预览「...」菜单或分享按钮 → 分享卡片显示配置的标题与图片。

---

## 3. 数据分析模块（对等 `admin/reports/market`）

**入口**：profile `INTERNAL_ENTRIES` 新增 `{ key: "analysis", title: "数据分析", sub: "商圈/小区市场行情", icon: "析", route: "/pages/analysis/index/index" }`（仅内部用户可见）。

**成功标准**：内部员工可搜索商圈/小区并查看市场分析（KPI、趋势、分布），与后台 `admin/reports/market` 数据一致。

**页面拆分**：
- `pages/analysis/index`：主界面
  - 商圈搜索：`GET /api/v1/reports/market/dictionaries?dict_type=business_circle`（字典）+ 搜索交互
  - 小区搜索：`GET /api/v1/properties/communities/search?q=`（admin）
  - 筛选：`range`（4w/8w/6m/12m/24m）、`business_circles`、`community_name`、`status`（在售/成交）
  - 展示：KPI 卡片（成交均价/在售/成交/去化月数等）、价格趋势、价格/户型/楼层分布
- `pages/analysis/constants.ts`：`range`/`status`/维度枚举与标签（控制行数）

**API（admin 令牌）**：
- `GET /api/v1/reports/market/kpi`
- `GET /api/v1/reports/market/trend`
- `GET /api/v1/reports/market/price-distribution`
- `GET /api/v1/reports/market/rooms-distribution`
- `GET /api/v1/reports/market/floor-distribution`
- `GET /api/v1/reports/market/dictionaries?dict_type=business_circle`
- 小区搜索：`GET /api/v1/properties/communities/search`

**任务**
1. `pages/profile/index.ts`：`INTERNAL_ENTRIES` 新增 `analysis` 条目。
2. 新建 `pages/analysis/index` 四件套 + `app.json` 注册。
3. 实现商圈/小区搜索、筛选、聚合端点并行拉取（消除瀑布）、图表渲染（轻量 canvas/svg 或数字卡片）。
4. `pnpm tsc --noEmit` 通过。

**验证**：内部员工 profile → 数据分析 → 选商圈/小区 → 看 KPI/趋势/分布，与后台一致。

---

## 4. 小区数据分析模块（`pages/valuation/detail`）

**位置**：`pages/valuation/detail` 的「房源信息」与「评估价格」之间插入「小区数据分析」区块。

**成功标准**：C 端用户在评估详情页可看到当前小区（`community_name`）的市场分析摘要。

**改动**：
- `pages/valuation/detail/index.ts`：`applyDetail` 后按 `community_name` 触发小区分析加载；新增 `analysis` 相关 data 与状态（loading/error/empty）。
- `pages/valuation/detail/index.wxml`：在房源信息与评估价格之间插入分析区块。
- 纯 C 端令牌（`/public/*` 自动注入 `c_access_token`）。

**后端依赖（已确认方案 A）**：
- 后台小区分析数据在 `admin/reports/communities/[communityId]`，但**无 C 端公开接口**。C 端令牌无法访问 admin 接口。
- 新增 C 端公开端点（**方案 A**）：`GET /public/communities/{community_id}/analysis?range=...`，返回小区市场摘要（KPI + 价格趋势 + 近期成交）。将后台 `reports/communities` 的聚合逻辑以 `aud=c` 可访问方式暴露。
  - **路由注意**：挂载在现有 `routers/public/communities.py`（已含 `/search`）。`community_id` 用 UUID 类型，且 `/search` 静态路由声明保持在 `/analysis` 之前，避免被 `{community_id}` 动态路径吞掉。
  - 前端先用 `GET /public/communities/search?q=` 按 `community_name` 定位 `community_id`，再查询分析。
- 数据来源校验：小区分析数据是否允许对 C 端公开（业务口径）需产品/后端确认。

**任务（含后端）**
1. 【后端】新增 C 端公开小区分析端点（方案 A `GET /public/communities/{community_id}/analysis`），Schema 命名 `Public*`，限流防刷。
2. `pnpm gen-api` 生成前端类型。
3. 【前端】`valuation/detail` 接入分析端点，房源信息与评估价格之间渲染分析区块。
4. 空态/加载中/失败态处理。
5. `pnpm tsc --noEmit` 通过；后端 `pytest` 覆盖新端点。

**验证**：C 端用户在评估详情页房源信息下方看到小区分析摘要；后端单测通过。

---

## 5. 微信授权登录（前端到后端全链路）

**现状核对**：
- 后端**已实现**：`POST /auth/wechat/login`（miniapp `code2Session`），核心逻辑在 `services/system/wechat.py`：
  - `fetch_wechat_miniapp_session(code)`：用 `settings.wechat_appid/wechat_appsecret`（环境变量，禁硬编码）换 `openid/session_key/unionid`
  - `login_or_register_wechat_user`：微信用户统一归入 **customer** 角色，注册用户 `username=wechat_{openid[:10]}`、`password=openid 占位哈希`（禁止走密码通道，纵深防御）
  - `_create_miniapp_tokens`：内部身份签发 admin 令牌（aud=admin），纯 C 端签发 aud=c 令牌
- 前端**缺口**：`pages/profile/index.ts` 的 `onGoLogin` 仍跳 `test-login` 测试页（注释「后端微信登录未完成」），未真正调 `wx.login()` + `/auth/wechat/login`。

**成功标准**：小程序内点击「微信一键登录」→ `wx.login()` 获取 code → `POST /auth/wechat/login` 换取令牌并存储 → 刷新 profile 登录态；纯 C 端、内部员工均正确识别，全程无需跳 test-login。

**前端改动（miniapp）**
1. `pages/profile/index.ts`：
   - `onGoLogin` 改为微信登录：`wx.login({ success })` 取 code → `request<TokenResponse>({ url: "/auth/wechat/login", method: "POST", data: { code }, skipAuth: true })`
     - `skipAuth: true`：登录接口无需鉴权，避免注入旧令牌
   - 成功后按返回 `aud` 分端存储（`c_access_token`/`c_refresh_token` 或 `access_token`/`refresh_token`）→ toast「登录成功」→ `loadUser()` 刷新
   - 登录中按钮置灰「登录中…」；失败透出后端 message
2. `pages/profile/index.wxml`：登录按钮文案改为「微信一键登录」。
3. 移除 profile 对 `test-login` 页的跳转引用（页面文件保留作调试兜底）。
4. 交互对齐现有风格（loading/toast/防重复提交）。

**后端改动**
- **直接复用 `/auth/wechat/login` 即可全链路打通，无需新增 `/public/auth/wechat/login`**：该端点虽在后台 `/auth` 路由，但登录本身无需鉴权；后端按 user 身份（非路由）签发令牌，纯 C 端用户调用也能拿到 aud=c 令牌。
- **⚠️ 内部员工首次微信登录会被强制改密**：`_create_miniapp_tokens` 对内部身份走 `force_temp_token=True`，`require_password_change` 时抛错要求改密，与"微信一键登录无感"体验冲突（既有后端行为）。需产品确认内部员工是否走微信通道。
- 核对 `WechatLoginRequest` / `TokenResponse` 类型已生成；如缺 `pnpm gen-api`。

**任务**
1. 确认 `WechatLoginRequest`/`TokenResponse` 在 `miniapp/types/api-types.d.ts`（缺则 `pnpm gen-api`）。
2. `pages/profile/index.ts` 接入 `wx.login()` + `/auth/wechat/login`，令牌分端存储 + 登录态刷新。
3. `pages/profile/index.wxml` 登录按钮文案与交互调整。
4. 移除 test-login 跳转引用。
5. `pnpm tsc --noEmit` 通过；后端 `pytest` 覆盖 wechat 登录回归。

**验证**：真机预览 → 微信一键登录 → 进入已登录态（C 端/内部身份正确）→ 退出登录正常。

---

## 跨模块约束与验证

- 内部模块（§1/§3）仅内部员工可见（沿用 profile `isInternal` 门控）；§4 为 C 端公开。
- 后台接口统一以 admin 令牌访问（`request.ts` 非 `/public/*` 自动注入 `access_token`）；C 端接口走 `/public/*`（注入 `c_access_token`）。
- 聚合/无依赖异步请求并行（`Promise.all`），消除请求瀑布。
- 提交前：`pnpm tsc --noEmit` 零错、`pnpm lint` 通过；后端改动 `ruff check .` / `ruff format .`与 `pytest` 全绿。
- 类型：C 端新增接口走 `pnpm gen-api` 生成，禁手写。

## 决策记录（原不确定项已确认）

1. **§2 分享图片来源**：✅ 已确认 → 小程序静态本地图片（`miniapp/assets/share.png`）。
2. **§4 小区分析对 C 端开放的接口形态**：✅ 已确认 → 方案 A `GET /public/communities/{community_id}/analysis`；**业务口径**（小区数据是否允许对 C 端公开）仍待产品/后端最终确认。
3. **§1 小区搜索**：✅ 已确认 → 复用 `components/community-search`（改造为 admin 搜索接口传参）。

## 审查修正记录（2026-08-10）

对照现状核对后落地的修正：

1. **§1 组件复用加固**：`community-search` 被 C 端 `valuation/submit` 使用，复用必须参数化（props 传 url/类型）+ 回归验证，禁改共用逻辑。
2. **§1 状态筛选**：补充 `status` 参数说明（卡片展示状态，默认全量，可选筛选）。
3. **§4 路由冲突**：`/public/communities/{id}/analysis` 挂载于现有 `public/communities.py`，`community_id` 用 UUID、`/search` 声明在 `/analysis` 之前。
4. **§5 移除过度设计**：直接复用 `/auth/wechat/login`，无需新增 `/public/auth/wechat/login`。
5. **§5 新增风险提示**：内部员工首次微信登录会触发强制改密闸门，待产品确认。