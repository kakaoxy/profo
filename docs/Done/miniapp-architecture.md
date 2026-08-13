# 小程序技术架构设计

> 本文档记录小程序架构 grilling 阶段的所有决策，作为项目推进过程中的持续参考。
> 决策日期：2026-07-31
> 状态：架构设计已收敛，待确认事项见末尾

---

## 一、产品形态

**单一微信小程序**，C 端功能对外，内部功能隐藏入口。

### 功能清单

**C 端（对外）**：
1. 房源展示
2. 估价
3. 服务介绍

**内部（隐藏入口）**：
4. 项目带看/谈价/面谈记录
5. 装修阶段照片上传
6. 项目记账
7. 房源列表信息查询
8. 营销房源录入
9. 数据报表查看

### 选型理由

不拆分为两个小程序、不合并到 admin web，原因：
- 内部员工希望在同一个入口里顺便浏览 C 端房源
- 维护两个小程序的发布/审核成本高
- admin web 已有移动端适配，但小程序原生体验更佳

---

## 二、身份与鉴权

### 2.1 架构：双身份叠加 + 多角色 User

| 维度 | 决策 |
|------|------|
| 数据模型 | 一条 User 记录持多个角色（主角色 admin + 附加 customer），复用现有 `user_roles` 关联表 |
| Token 策略 | C 端页携 c token（aud=c），内部页携 admin token（aud=admin），两套 token 独立存储 |
| Token 发放 | 复用现有 `create_tokens_for_user` 的 `audience` + `role_claim` 参数（已支持多角色） |

### 2.2 登录流程

**C 端登录（所有微信用户）**：
```
wx.login → jscode2session 拿 openid → 命中/新建多角色 User → 发 c token（aud=c）
```

**内部登录 - 新员工（反向升级）**：
```
微信登录建 customer User → 后台改主角色为 admin（7-30 多角色改造已落地，`user_roles` 表 + `User.roles` 附加角色已就绪 → 一条多角色 User）
```
> ⚠️ 待实现：现有 `login_or_register_wechat_user`（`services/system/wechat.py`）仍强制单一 `role_id=customer`，尚不支持「已有 admin 多角色 User 命中即返回并保持主角色」。需按 §9.2 之 5 改造后，反向升级流程才成立。

**内部登录 - 老员工（后台扫码绑定）**：
```
后台用户管理页点"绑定微信" → 调 wxacode.getUnlimited 生成小程序码（scene 放绑定 token，TTL 5 分钟，一次性）→
员工微信扫一扫 → 进小程序绑定页 pages/bind/index → 调 /miniapp/admin/users/bind-wechat →
后端校验 token + jscode2session 拿 openid → 写入 admin User 的 wechat_openid + 加 customer 附加角色 + 删除 Redis token
```

绑定后该 admin User 即多角色 User，员工下次微信登录直接命中，C 端和内部身份统一。

### 2.3 离职管理

禁用 admin User + `token_version+1`（C 端身份保留，可继续逛房源）。

### 2.4 安全边界

- 后端按路径前缀推断 aud（`_infer_audience_from_path` 加 `/miniapp/c/*` 和 `/miniapp/admin/*` 判断）
- 业务身份双通道校验（`ProjectReadOrBusinessPermDep`）后端兜底，不依赖前端
- 绑定接口靠一次性 Redis token（TTL 5 分钟）鉴权，无登录态
- 严格遵守 project_memory 硬约束：C 端 token 不能访问后端接口，后端 token 不能访问 C 端接口

---

## 三、技术栈与工程化

### 3.1 技术栈选型

| 层 | 选型 | 理由 |
|----|------|------|
| 小程序框架 | 原生微信小程序（WXML/WXSS/TS） | 单一平台无跨端需求；零框架依赖风险；微信新特性第一时间可用；包体积最优 |
| 工程组织 | 独立工程（不并入 frontend monorepo） | 前端与小程序是两个完全独立的项目，技术栈/构建/发布链路均不同，共用 workspace 反而增加耦合与复杂度，无收益 |

### 3.2 目录结构

```
profo/
├── backend/       # 现有 FastAPI 后端
├── frontend/      # 现有 Next.js 前端（保持现状，独立 gen-api，零改动）
└── miniapp/       # 新增：独立原生小程序工程（TS + miniprogram-cli，独立 gen-api）
```

### 3.3 类型工程化（独立）

- **frontend**：保持现有 `pnpm gen-api` 脚本与产物路径（`frontend/src/lib/api-types.d.ts`），**零改动**；现有 `@/lib/api-types` 与相对 `./api-types` 引用点无需调整
- **miniapp**：独立 `gen-api` 脚本，调 `openapi-typescript` 拉取后端 OpenAPI spec，产物输出到 `miniapp/types/api-types.d.ts`，页面 `import ... from "../types/api-types"` 直接引用
- 两套类型各自独立生成，互不依赖、互不引用；后端接口变更时各自重新 `gen-api` 同步，由后端 OpenAPI spec 单一真源兜底漂移风险
- **不共享 Zod schema**：miniapp 不引入 zod 运行时（约 50KB，对小程序主包 2MB 限制有意义），表单校验原生实现

### 3.4 工程化原则

- 前端与小程序各自独立工程，互不依赖、互不引用对方内部目录
- 各自维护 `gen-api` 脚本，从同一后端 OpenAPI spec 独立生成类型
- 业务逻辑前后端分离（AGENTS.md §1 硬约束）

---

## 四、后端 API 设计

### 4.1 C 端：完全复用现有 `/api/v1/public/*`，零改动

| 功能 | 复用接口 |
|------|----------|
| 房源展示 | `/public/projects`、`/public/projects/{id}`、`/public/projects/sold`、`/public/stats/platform` |
| 估价 | `/public/leads`（POST）、`/public/leads/mine`、`/public/leads/{id}` |
| 服务介绍 | 静态页（无接口），联系方式可复用 `/public/projects/{id}/consultant` 或硬编码默认值 |

### 4.2 内部：新增 `/api/v1/miniapp/admin/*` 独立路径

**设计原则 R1**：路径独立（避免 PC 端路径变更影响小程序），但字段相同的端点用薄转发层调同一 service，避免纯复制粘贴。

| 功能 | 实现方式 |
|------|----------|
| 带看/谈价/面谈记录 | 薄转发 `/miniapp/admin/projects/{id}/selling/*`，调同一 ProjectService，返回同一 SalesRecordResponse |
| 装修照片上传 | 薄转发 `/miniapp/admin/projects/{id}/renovation/*`，调同一 ProjectService |
| 房源列表查询 | 薄转发 `/miniapp/admin/properties`，调同一 PropertyService |
| 数据报表 | 薄转发 `/miniapp/admin/reports/market/*`，调同一 aggregations service |
| 项目记账 | 裁剪 `/miniapp/admin/ledger/projects`（精简列表：项目名/状态/净现金流），明细复用 cashflow |
| 营销房源录入 | 裁剪 `/miniapp/admin/l4-marketing/projects`（精简 schema，草稿态基础字段） |

### 4.3 新增接口

- `/miniapp/admin/projects/mine`：按业务身份过滤的项目列表（供项目选择器调用）
- `/miniapp/admin/users/bind-wechat`：扫码绑定微信 openid 到 admin User
- `/miniapp/upload`：文件上传中转接口

### 4.4 鉴权改造

`_infer_audience_from_path` 增加判断（沿用现有 `settings.api_prefix` 拼接方式，不硬编码 `/api/v1`）：
- `{api_prefix}/v1/miniapp/c/*` → aud=c
- `{api_prefix}/v1/miniapp/admin/*` → aud=admin

### 4.5 小程序请求约束

- 小程序用 `wx.request` header 传 token（`Authorization: Bearer xxx`），不用 cookie
- **无需带 `X-Requested-With`**：CSRF 中间件仅对「纯 Cookie 认证」的写请求校验该头（`has_cookie 且无 Authorization/X-API-Key` 才拦截，见 `main.py:csrf_protect`）。小程序用 Bearer 认证，`has_auth_header` 恒为真，中间件不会触发，故不必额外带此头
- 小程序自定义 header 微信原生支持，无需后端改动

---

## 五、前端架构

### 5.1 分包策略（PK2 按功能域）

```
主包（C 端核心 + 静态页 + 共享组件）：
  pages/index                    首页
  pages/login                    登录页（微信授权）
  pages/profile                  个人中心
  pages/bind                     内部账号绑定页（扫码进入）
  pages/about                    服务介绍（静态页入主包）
  pages/contact                  联系方式（静态页入主包）
  pages/projects/list            房源列表（高频首屏）
  pages/projects/detail          房源详情（C 端转化路径关键节点，入主包无延迟）
  pages/valuation/submit         估价提交
  pages/valuation/mine           我的估价
  pages/valuation/detail         估价详情
  components/project-picker/     项目选择器（4 个内部功能共用，基础设施级组件）

分包：
  subpackages/internal-project/  带看+装修+记账（共用项目选择器）
  subpackages/internal-market/   房源查询+营销录入（共用房源选择器）
  subpackages/internal-reports/  数据报表（含 ec-canvas 图表库，独立分包减体积）
```

### 5.2 分包原则

- 每个分包 < 2MB，按需加载
- 报表的 ec-canvas 隔离不污染其他分包
- 功能演进时新增分包不破坏现有结构
- C 端按功能分包让首屏只加载首页，房源详情/估价等延迟加载（但核心转化路径入主包）

### 5.3 项目选择器（PS1）

- 放主包 `components/project-picker/`，约 10-15KB
- 4 个内部功能（带看/装修/记账/营销录入）共用
- 选择器调 `/miniapp/admin/projects/mine`，后端按业务身份双通道过滤返回"我有权限的项目"
- 用户只能选到自己有权限的项目，选完进功能页时带 project_id，后端再校验一次（兜底）

### 5.4 业务身份判断（BI3）

- **前端层**：项目选择器只展示"我有权限的项目"（调 `/miniapp/admin/projects/mine`）
- **后端层**：`ProjectReadOrBusinessPermDep` 兜底校验，即使前端被篡改也无绕过风险
- **不存 token**：业务身份（负责哪些项目）会随项目指派变化，每次拉"我的项目列表"才是最新状态

---

## 六、上传链路

### 6.1 方案：后端中转（U1）

```
小程序 wx.uploadFile → 后端 /miniapp/upload → OSS
```

### 6.2 复用现有能力

- `utils/image_processing.py`：缩略图生成
- `utils/storage.py`：OSS 存储
- `utils/file_security.py`：安全校验（文件类型/大小/内容）

### 6.3 选型理由

- 上传场景以图片为主（装修照片、营销房源图、估价图），单文件 < 10MB，后端中转无性能瓶颈
- 安全审核集中（project_memory 硬约束：500MB 文件大小限制、扩展名校验、URL 协议白名单）
- 小程序域名配置简单（只需配后端域名，无需配 OSS 域名 + CORS）

---

## 七、部署与用户体系

### 7.1 部署（D1）

小程序直连现有 FastAPI 后端，Nginx 加 location，零架构改动。

- 复用现有后端实例、数据库、Redis、OSS
- 无需独立后端实例（无隔离价值，反而增加运维成本）
- 后端 `--reload` 自动重载 Python 代码，`pnpm gen-api` 需手动执行以同步前端类型

### 7.2 用户体系（C1）

web 与小程序通过 unionid 打通，同一 User 记录。

- `User.wechat_unionid` 字段已就绪（`models/user/user.py` 第 107 行）
- 微信 openid 登录的用户在 web 和小程序是同一条 User 记录
- 用户在 web 下的估价单，小程序也能看到；反之亦然
- 前置条件：微信开放平台已绑定公众号/网页应用 + 小程序（通过 unionid 关联）

---

## 八、决策溯源

### 8.1 关键决策路径

| 决策点 | 选项 | 选型 | 关键理由 |
|--------|------|------|----------|
| 小程序数量 | 1个/2个/合并 | 合并1个 | 内部员工希望同入口浏览房源 |
| 身份模型 | 双身份/单身份/企微 | 双身份叠加 | 契合现有双 aud 模型，不动安全约束 |
| 员工认证 | 账号密码/openid绑定/折中 | 账号密码（A1） | 零后端改动，离职管理最简单 |
| 老员工绑定 | 内部登录/并存/合并 | 后台扫码绑定 | 避免暴露内部入口，无冗余 User |
| 技术栈 | 原生/Taro/uni-app/H5 | 原生（T1） | 无跨端需求，零框架依赖风险 |
| 工程化 | monorepo 共享/独立工程 | 独立工程 | 前端与小程序是独立项目，技术栈/构建/发布不同，共享 workspace 增加耦合无收益 |
| 共享内容 | 类型+Zod/只类型 | 只类型（Z1） | miniapp 不引入 zod 运行时 |
| API 策略 | 全复用/全重写/混合 | C端复用+内部独立路径（A3+R1） | C端已裁剪，内部路径独立避免耦合 |
| 分包 | 两大块/多分包/折中 | 按功能域多分包（PK2） | 每个分包<2MB，按需加载 |
| 上传链路 | 中转/直传/混合 | 后端中转（U1） | 复用现有能力，安全审核集中 |
| 部署 | 直连/独立实例 | 直连现有后端（D1） | 零部署改动 |
| 用户体系 | 统一/独立 | unionid 打通（C1） | web 与小程序数据互通 |

### 8.2 否决方案记录

- **拆分两个小程序**：维护成本高，内部员工无法同入口浏览房源
- **openid 绑定后免登（A2）**：C 端用户和内部员工走同一个 wx.login，后端要在发 token 前查 user 表判断身份，逻辑耦合点增多
- **两条 User + 关联字段（D1）**：多角色架构已存在，两条 User 是伪问题
- **放松 phone_hash unique（D3）**：破坏唯一性硬约束
- **Taro（T2）**：单一平台无跨端需求，框架税不值得付
- **uni-app（T3）**：团队是 React 栈，切 Vue 成本高
- **web-view 嵌 H5（T4）**：体验差且审核风险高
- **pnpm workspace monorepo 共享 api-types**：前端与小程序是两个完全独立的项目（技术栈、构建工具、发布链路均不同），共用 workspace + re-export 垫片工程复杂度高、收益低；两端各自 `gen-api` 从同一后端 OpenAPI spec 独立生成即可，漂移风险由后端 spec 单一真源兜底
- **共享包放 frontend/（S2）**：frontend 既是 app 又是 library，边界混乱
- **共享 Zod schema（Z2）**：miniapp 包体积敏感，校验逻辑复杂度低
- **内部接口全部重写（R2）**：4 个功能纯复制粘贴，违反最简代码原则
- **小程序直传 OSS（U2）**：安全审核能力有限，场景无大文件需求
- **独立后端实例（D2）**：无隔离价值，增加运维成本

---

## 九、待确认/未覆盖事项（Fail Loud）

### 9.1 前置条件待确认

1. **unionid 打通前置条件**：微信开放平台是否已绑定公众号/网页应用 + 小程序？若未配置，C1 需要先做微信开放平台配置，否则 web 和小程序的 openid 无法合并到同一条 User。

2. **小程序资质**：内部功能（带看/记账/报表）属"企业内部管理"类，微信审核可能要求企业资质或限制类目。建议提前确认小程序服务类目能覆盖这些功能。

### 9.2 实现阶段需审计

3. **ec-canvas 体积**：报表分包的 echarts 组件需实测体积，若超分包限制要考虑按需引入图表类型。

4. **现有 `login_or_register_wechat_user` 逻辑调整**：多角色 User 命中后应直接返回（不再强制 customer 角色），需确认对已有 admin User 命中时更新 nickname/avatar 是否合适。

### 9.3 未深入决策的实现细节（按最佳实践实现阶段定）

- 小程序状态管理方案（Component + setData / MobX-miniprogram）
- 具体表单校验实现
- 图表组件选型与按需引入策略
- 分包预下载策略
- 缓存与离线策略
- 错误处理与重试机制

---

## 十、后续推进建议

### 阶段一：工程化基础设施
1. 创建 `miniapp/` 工程骨架（TS + miniprogram-cli），含独立 `gen-api` 脚本（输出到 `miniapp/types/api-types.d.ts`）
2. frontend 保持现状，零改动

### 阶段二：身份与鉴权
3. 后端新增 `/miniapp/admin/users/bind-wechat` 接口
4. 后端新增小程序码生成接口（调 wxacode.getUnlimited）
5. 改造 `_infer_audience_from_path` 支持 `/miniapp/*` 前缀
6. 调整 `login_or_register_wechat_user` 支持多角色 User 命中即返回
7. 后台用户管理页加"绑定微信"按钮

### 阶段三：C 端功能
8. 小程序 C 端页面（房源/估价/服务介绍），复用现有 `/public/*` 接口

### 阶段四：内部功能
9. 后端新增 `/miniapp/admin/*` 薄转发 + 裁剪端点
10. 后端新增 `/miniapp/admin/projects/mine` 接口
11. 小程序内部分包页面（带看/装修/记账/房源查询/营销录入/报表）

### 阶段五：上传与部署
12. 后端新增 `/miniapp/upload` 中转接口
13. Nginx 配置（如需）
14. 微信开放平台 unionid 打通（如未配置）
