# 小程序实施细分计划

> 基于 [miniapp-architecture.md](miniapp-architecture.md) 拆分。
> **细分原则**：每个切片 = 一个**可独立验证**的功能模块，即使后续切片不推进，已实现切片仍保持完整可用、不破坏现有项目。
> 排序按依赖优先；每个切片有明确的交付物与验证点。

---

## 切片总览

| 切片 | 名称 | 依赖 | 独立可交付 |
|------|------|------|-----------|
| S0 | 工程化地基（非功能） | - | 是（纯地基，不碰 frontend 行为） |
| S1 | C 端房源展示（垂直第一刀） | S0 | ✅ 后端零改动，纯公开接口 |
| S2 | C 端微信登录 + 估价闭环 | S0、S1 | ✅ 复用现有登录接口 |
| S3 | 内部身份与员工绑定闭环 | S0 | ✅ 绑定闭环自洽 |
| S4 | 上传中转 `/miniapp/upload` | S0 | ✅ 独立可验证 |
| S5 | 内部项目功能（带看/装修/记账） | S3、S4 | ✅ |
| S6 | 内部房源/营销/报表 | S3、S4 | ✅ |
| S7 | 部署与上线 | S1–S6 | ✅ |

```
S0 ─┬─ S1 ── S2
    ├─ S3 ──┬─ S5
    │       └─ S6
    └─ S4 ──┬─ S5
            └─ S6
```
> S4 横切依赖（装修照片/营销图上传），故在 S5/S6 前完成。

---

## S0 工程化地基（非功能）

**目标**：搭好小程序独立工程地基，不产生任何业务行为变化。前端保持现状零改动。

**交付物**
- `miniapp/` 骨架：原生小程序（TS + miniprogram-cli）可编译空壳，含独立 `package.json` 与 `gen-api` 脚本（`openapi-typescript ... -o miniapp/types/api-types.d.ts`）
- frontend 保持现状：现有 `pnpm gen-api` 脚本与 `frontend/src/lib/api-types.d.ts` 产物路径**零改动**
- 两端类型各自独立生成，不引入 workspace、不共享包

**实现步骤**
1. 建 `miniapp/`（project.config.json + app/app.json + 一个 index 页空壳 + 独立 `package.json`）
2. 在 `miniapp/package.json` 加 `gen-api` 脚本，调 `openapi-typescript` 拉取后端 OpenAPI spec 输出到 `miniapp/types/api-types.d.ts`
3. 跑一次 `pnpm gen-api`（miniapp 内）确认产物可被页面 `import` 解析

**验证点**
- miniapp 内 `gen-api` 产出到 `miniapp/types/api-types.d.ts`，页面可 `import` ✅
- frontend 行为不变（`pnpm dev` / `tsc --noEmit` 未触碰）✅
- `miniapp/` 能编译出空壳小程序 ✅

**独立性**：纯地基；frontend 零改动、零风险，失败只影响后续切片，不破坏现有项目。

---

## S1 C 端房源展示（垂直第一刀）

**目标**：小程序对外可浏览房源，**纯公开只读、后端零改动、无需登录**。即使后续切片全不上，C 端展示已可用。

**交付物（主包页面）**
- 首页 `pages/index`：调 `/public/stats/platform` 展示平台统计
- 房源列表 `pages/projects/list`：调 `/public/projects`、`/public/projects/sold`
- 房源详情 `pages/projects/detail`：调 `/public/projects/{id}`

**实现步骤**
1. 小程序网络层（`wx.request` 封装，GET 无 token）
2. 三个页面 + 基础样式
3. 真机/模拟器联调

**验证点**
- 无需登录，模拟器可打开首页看到统计与房源列表 ✅
- 点进详情能看到房源字段 ✅
- 后端零改动 ✅

**依赖**：S0。**独立性**：完全自洽，不依赖鉴权/内部功能。

---

## S2 C 端微信登录 + 估价闭环

**目标**：C 端用户能登录并提交/查看估价，自成闭环。

**交付物**
- 登录页 `pages/login`：复用现有 `POST /api/v1/auth/wechat/login`（已实现 jscode2session + `login_or_register_wechat_user`，返回 **c token**），无需新增后端
- 估价提交 `pages/valuation/submit`、我的估价 `pages/valuation/mine`、估价详情 `pages/valuation/detail`：复用 `/public/leads`（POST）、`/public/leads/mine`、`/public/leads/{id}`
- 网络层支持 `Authorization: Bearer <c token>` 自动携带

**实现步骤**
1. 网络层支持 c token 注入与 401 处理
2. 登录页 + 估价三页
3. 联调登录→估价闭环

**验证点**
- `wx.login` → 拿 code → 登录接口 → 命中/新建多角色 User → 发 c token ✅
- 携 c token 提交估价、`/public/leads/mine` 看到自己的估价、详情可看 ✅
- 未登录访问估价页被正确引导登录 ✅

**依赖**：S0（骨架）、S1（网络层/UI 基础）。**独立性**：估价闭环自洽。

> ⚠️ 若发现现有 `/auth/wechat/login` 的 admin 路径归属与 C 端语义冲突，可加 `/public/auth/wechat-login` 别名（复用同一 service），为一处小改动，不影响本切片独立性。

---

## S3 内部身份与员工绑定闭环

**目标**：员工扫码绑定微信，实现「一条多角色 User」的双身份，为内部功能打地基。绑定闭环本身可独立验证。

**后端交付物**
- `_infer_audience_from_path` 增加 `{api_prefix}/v1/miniapp/c/*`→c、`{api_prefix}/v1/miniapp/admin/*`→admin（沿用 `settings.api_prefix`，不硬编码）
- `login_or_register_wechat_user` 多角色命中改造：已有 admin 多角色 User 命中后直接返回并保持主角色（§9.2-5）
- `POST /miniapp/admin/users/bind-wechat`：一次性 Redis token（TTL 5 分钟）鉴权，写 `wechat_openid` + 加 customer 附加角色
- 小程序码生成接口（`wxacode.getUnlimited`，scene 放绑定 token）
- 后台用户管理页「绑定微信」按钮

**小程序交付物**
- 绑定页 `pages/bind`（扫码进入，调绑定接口）

**实现步骤**
1. 后端：路径推断 + 多角色命中改造（先跑通现有测试）
2. 后端：绑定接口 + 小程序码生成 + Redis token
3. 后台加按钮
4. 小程序绑定页
5. 端到端联调

**验证点**
- `pytest` 全绿（含多角色命中回归）✅
- 员工扫码 → 绑定 → 微信登录命中 admin 多角色 User → 同入口可拿 c token 与 admin token ✅
- 绑定 token 一次性、TTL 5 分钟（复用后失效）✅
- 离职 `token_version+1` 后 C 端仍可逛房源 ✅

**依赖**：S0。**独立性**：绑定闭环自洽；即使内部功能不上，员工身份绑定已可用。

---

## S4 上传中转 `/miniapp/upload`

**目标**：小程序文件上传经后端中转到 OSS，复用现有安全能力。

**交付物**
- `POST /miniapp/upload`：中转接口，复用 `utils/storage.py`（OSS）、`utils/image_processing.py`（缩略图）、`utils/file_security.py`（类型/大小/内存校验）

**实现步骤**
1. 后端中转端点（鉴权：内部 admin token）
2. 小程序 `wx.uploadFile` 封装
3. 联调上传→OSS 返回 URL

**验证点**
- 图片上传成功，OSS 返回可访问 URL ✅
- 非法扩展名/超限文件被 `file_security` 拦截 ✅
- 缩略图正常生成 ✅

**依赖**：S0。**独立性**：独立可验证；S5/S6 依赖它故提前。

---

## S5 内部项目功能（带看/装修/记账）

**目标**：员工在内部入口完成项目带看、装修照片上传、记账。三个功能共用项目选择器。

**后端交付物**
- `GET /miniapp/admin/projects/mine`：按业务身份过滤的项目列表（供选择器）
- 薄转发：`/miniapp/admin/projects/{id}/selling/*`、`renovation/*`（调同一 ProjectService，返回同一 SalesRecordResponse）
- 记账裁剪：`/miniapp/admin/ledger/projects`（精简列表：项目名/状态/净现金流），明细复用 cashflow

**小程序交付物（分包 `subpackages/internal-project/`）**
- 项目选择器 `components/project-picker/`（主包，调 `/miniapp/admin/projects/mine`）
- 带看记录页、装修照片上传页、记账页

**实现步骤**
1. 后端 `projects/mine` + 薄转发 + 记账裁剪端点
2. 项目选择器
3. 三个功能页 + 分包配置
4. 端到端联调（选项目→带看/装修/记账）

**验证点**
- 选择器只展示「我有权限的项目」（`projects/mine` 按业务身份过滤）✅
- 带看/谈价/面谈记录可写可读 ✅
- 装修照片经 S4 上传成功 ✅
- 记账列表/明细正确 ✅
- 后端 `ProjectReadOrBusinessPermDep` 兜底：篡改 project_id 被拒 ✅

**依赖**：S3（身份）、S4（上传）。**独立性**：三个功能各自可验证。

---

## S6 内部房源/营销/报表

**目标**：内部入口完成房源查询、营销房源录入、数据报表查看。

**后端交付物**
- 薄转发 `/miniapp/admin/properties`（调同一 PropertyService）
- 营销裁剪 `/miniapp/admin/l4-marketing/projects`（精简 schema，草稿态基础字段）
- 数据报表薄转发 `/miniapp/admin/reports/market/*`（调 aggregations service）

**小程序交付物（分包）**
- `subpackages/internal-market/`：房源查询 + 营销录入（共用房源选择器）
- `subpackages/internal-reports/`：数据报表（含 ec-canvas；需实测体积，超限按需引入图表类型 §9.2-3）

**实现步骤**
1. 后端薄转发 + 裁剪端点
2. 房源查询页
3. 营销录入页（图经 S4 上传）
4. 报表分包 + 图表

**验证点**
- 房源按条件查询返回正确 ✅
- 营销房源可录入草稿态 ✅
- 报表 KPI/趋势正确拉取与展示 ✅
- 各分包体积 < 2MB ✅

**依赖**：S3、S4。**独立性**：本切片含独立功能，各自可验证。

---

## S7 部署与上线

**交付物**
- nginx location（小程序域名指向现有后端 `/api`）
- 微信小程序类目/资质确认（内部功能「企业内部管理」类属，§9.1-2）
- 微信开放平台 unionid 打通（如未配置，§9.1-1）
- 提审与发布

**验证点**
- 生产域名下小程序可正常请求后端 ✅
- 审核通过并发布 ✅

**依赖**：S1–S6。

---

## 执行顺序建议

按依赖自底向上：**S0 → S1 → S2**（先打通 C 端，风险最低、最快可演示）→ **S3 → S4**（内部地基）→ **S5 / S6**（内部功能，可并行）→ **S7**。

> 每个切片完成即达到「即使后续不上也不影响已实现功能」状态，可随时暂停、单独收尾与上线。