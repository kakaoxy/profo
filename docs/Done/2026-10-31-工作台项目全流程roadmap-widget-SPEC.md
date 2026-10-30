# 工作台 · 项目全流程 Roadmap Widget · 技术方案 Spec（实施版）

> 撰写日期：2026-10-31 ｜ 状态：**实施依据（本文即落地执行口径）**
> 视觉与交互真源：`docs/design/工作台-项目全流程roadmap-widget-hifi.html`（2026-10-30）
> 视觉规范：`/DESIGN.md`（Steep）——本文只引用 token 名，不复制色值；冲突时以 `DESIGN.md` 为准
> 代码现状依据：commit `39e8020f`（设计稿 HTML 尚未纳入版本库，实施时一并留档）
> 需求方指令：2026-10-31「针对该设计稿撰写 spec 文档并落地执行」

---

## 一、定位与范围

### 1.1 一句话定位

在 `/admin` 工作台 **KPI 四卡之后、获客总览之前**插入一张 **span 12** 的新 widget「项目全流程」：
把每个项目的 `签约 → 交房 → 上架 → 成交` 四阶段画成横向时间轴（甘特条），
一屏看清 38 个在途/已成交项目各自卡在哪个阶段、卡了多久、计划节点是否临近。

**不新增路由、不新增页面、不改项目列表页**；仅新增一张工作台卡片 + 一个后端排序开关。

### 1.2 范围（In）

| 层 | 内容 |
|---|---|
| 后端 | `GET /api/v1/projects` 新增 `signing_sort` 排序开关（按 `project_contracts.signing_date` 降序，空值置后）；Router→Service→Query 三层透传 |
| 前端 | 新 widget：前端注册表 `project_roadmap`、数据获取器、纯函数模型、卡片组件、tooltip、骨架；`globals.css` 补 2 个阶段深色变量 |
| 布局 | 后端 `WORKBENCH_ROLE_DEFAULTS`：admin / operator 默认启用，插在 `todo_board_summary` 之后；user 角色不可见（无 `project:read`） |
| 交互 | 阶段筛选（图例即筛选）、最新 10 / 全部切换、缩放（滑杆 / ±10% / 适应）、悬停与键盘聚焦 tooltip、行 Enter 进入详情、方向键平移 |
| 测试 | 新增 `frontend/e2e/workbench-project-roadmap.spec.ts` + 更新角色数量断言（admin 10→11、operator 8→9） |

### 1.3 非范围（Out）

- ❌ 不改 `/admin/projects` 列表页、详情页、项目创建/状态流转逻辑；
- ❌ 不新增 `ProjectResponse` 字段、不改数据库 schema（**无迁移**）；
- ❌ 不做后端聚合接口（`/projects/roadmap`）：当前 47 个项目 < 单页上限 200，复用列表接口即可（见 D1）；
- ❌ 不做暗色模式专属配色：沿用现有 widget 的 `bg-white` 卡面口径（`globals.css` 的 `.dark` 块未覆写 Steep token，admin 工作台实际为浅色）；
- ❌ 不做时间轴拖拽平移 / 惯性滚动 / 双指缩放（设计稿未要求）；
- ❌ 不改 `WidgetSkeleton` 的通用形态（仅为本 widget 增加专用骨架，见 §4.7）。

---

## 二、视觉规格（对齐设计稿）

### 2.1 Token 映射（设计稿 CSS 变量 → 前端）

| 设计稿 | 前端来源 | 说明 |
|---|---|---|
| `--ink` | `--color-ink` / `text-ink` | 主文字、上架条底色 |
| `--pwhite` | `bg-white` | 卡面、sticky 列底色 |
| `--fog` | `--color-fog` / `bg-fog` | 悬停行底色、工具条胶囊底 |
| `--ash` | `--color-ash` / `text-ash` | 图例 chip 文字 |
| `--graphite` | `--color-graphite` / `text-graphite` | 副标签、meta、页脚 |
| `--dove` | `--color-dove` / `text-dove` | 刻度、网格线、计数 |
| `--rust` | `--color-rust` / `text-rust` | 成交点、今天线、「新增」徽标文字 |
| `--apricot` | `--color-apricot-wash` | 交房条底色、「新增」徽标底 |
| `--sky` | `--color-sky-wash` | 签约条底色 |
| `--st-listing` | `--color-ink` | 上架条（复用 Ink，不新增） |
| `--st-sold` | `--color-rust` | 成交点（复用 Rust，不新增） |
| `--st-sign-deep` | **新增** `.rm-dash-sign` / `.rm-dot-sign` | 「计划中」签约段虚线描边 + 左列圆点（见 D8） |
| `--st-handover-deep` | **新增** `.rm-dash-handover` / `.rm-dot-handover` | 「计划中」交房段虚线描边 + 左列圆点 |
| `--r-card` | `rounded-cards` | 卡面圆角 |
| `--shadow-steep-sm` | `shadow-steep-sm` | 卡面阴影 |
| `--shadow-steep` | `shadow-steep` | tooltip 阴影 |

> 色值不在此复制（`DESIGN.md` 为唯一来源，避免双源），上表只做**名称映射**。
> 唯一例外是两个「深一档」阶段色：它们不在 `DESIGN.md` 中，按 `globals.css` 注释记录字面量与出处（hifi `--st-*-deep`）。
>
> ⚠️ **偏离标注（需人工确认，见 D8）**：`--st-sign-deep` 的 `#8fb3e8` 未收录于 `DESIGN.md`。设计稿声明
> 「只用现有调色板」，但「今天之后为计划」的虚线必须用深一档的同色系（`--color-sky-wash` 白底 1.5px 虚线对比度仅 1.15:1，不可见）。
> 落地形态为 `globals.css` `@layer utilities` 里 4 个字面量工具类（`.rm-dash-*` / `.rm-dot-*`），**仅本 widget 使用**；
> 刻意不用 CSS 自定义属性：Next 的 CSS 压缩会剔除「仅被 JS 内联样式引用」的自定义属性，`var()` 会失效并回退 `currentColor`（实测虚线变黑）。
> 是否把该色正式收录进 `DESIGN.md` 请人工决策（本次未改 `DESIGN.md`）。

### 2.2 版式度量（来自设计稿 CSS，实施按此写死）

| 元素 | 度量 |
|---|---|
| 卡片 | `bg-white` + `rounded-cards` + `shadow-steep-sm` + `padding: 20px 22px` |
| 卡头 | 标题 15px/500 Ink；副标签 12px/430 Graphite；「新增」10.5px/500 Rust 底 Apricot 圆角胶囊 `padding 2px 7px`；计数徽标 11.5px Graphite `rgba(23,25,28,.045)` 底 `padding 2px 8px` |
| 工具条 | `display:flex; gap:10px; flex-wrap:wrap; margin:12px 0 8px` |
| 图例 chip | 12px Ash，`bg-fog`，`padding 5px 10px`，圆角 9999；选中态白底 + `shadow-steep-sm` + Ink 480；色块 10×10 圆角 3（成交为圆形）；计数 Dove |
| 视图切换 | `bg-fog` 胶囊 `padding 3px`，内部按钮 `padding 5px 11px` 12px；选中白底 + 阴影 + 480 |
| 缩放组 | `bg-fog` 胶囊；±按钮 25×25 圆形；range 68×3px；百分比 11px 最小宽 32px；「适应」高 25px |
| 滚动区 | `max-height: 508px`，圆角 14px，`overflow:auto`，`focus-visible` 内阴影 2px `rgba(23,25,28,.18)` |
| 时间轴 | 轴高 46px（sticky top）；行高 40px；左列宽 208px（sticky left）；`plotW = round(totalDays × ppd) + 24` |
| 轴刻度 | 年份 11px/480 Ash `top:5px`；月份 10.5px Dove `bottom:7px`；今天刻度 3×5px Rust 圆角上两角 |
| 网格线 | 1px `rgba(163,166,175,.14)`；跨年（1 月）`rgba(163,166,175,.28)` |
| 今天线 | 1.5px dashed `rgba(93,42,26,.42)`，贯穿全部行 |
| 阶段条 | `top:13px; height:14px; border-radius:5px`；`live` 态右端 2px 白色内阴影；未来段 `top:12px; height:16px` 透明底 + 1px dashed 深色描边 |
| 成交点 | 10×10 圆点 `top:15px`，白 2px 环 + `rgba(93,42,26,.13)` 3px 外环；行悬停外环加深至 4px |
| 行左列 | 项目名 13px/480 Ink 单行省略；楼栋号 10.5px Graphite；meta 11px Graphite + 5px 阶段圆点 |
| 页脚 | 11.5px Graphite，`border-top: 1px rgba(163,166,175,.16)`，`padding-top:10px`，`margin-top:10px` |
| tooltip | `position:fixed; width:304px; border-radius:18px; padding:14px 16px 13px`；标题 13.5px/500；日期表 `grid 38px 1fr 46px`，`gap 7px 8px`，11.5px；页脚 11px |

### 2.3 阶段色与形状（颜色永不单独承载语义）

| 阶段 | 实心条 | 计划段（虚线） | 语义补充 |
|---|---|---|---|
| 签约 `sign` | `bg-sky-wash` + 内描边 `rgba(23,25,28,.06)` | `.rm-dash-sign` | 左列圆点 `.rm-dot-sign` |
| 交房 `handover` | `bg-apricot-wash` + 内描边 `rgba(93,42,26,.08)` | `.rm-dash-handover` | 左列圆点 `.rm-dot-handover` |
| 上架 `listing` | `bg-ink` | `border-ink/50` | 深底，无文字 |
| 成交 `sold` | 瞬时节点 `bg-rust` 圆点 | — | 圆点 + 白环，与「条」形状区分 |

### 2.4 状态矩阵

| 状态 | 表现 |
|---|---|
| loading | 本 widget 专用骨架（高度对齐终态，见 §4.7），其余卡不受影响 |
| empty（无任何可绘制项目） | 卡头 + 空态块：52px 圆角 16 图标底 + 「暂无项目」+「新建项目后，签约、交房、上架、成交会依次出现在这里」+「新建项目」链接 → `/admin/projects`；**不渲染空时间轴** |
| filtered-empty（筛选后为 0） | 保留卡头/图例/视图/缩放；图表区显示「该阶段暂无项目」+「当前视图下没有「X」阶段的项目」+「清除筛选」 |
| forbidden | 无 `project:read` → 注册表过滤，**整卡不渲染**（后端 `WORKBENCH_WIDGETS` 的 permission/roles 与前端注册表双重把关） |
| error（项目列表加载失败） | 卡内暖色 banner：图标 +「项目列表加载失败」+「时间轴暂时不可用，其他卡片不受影响」+「重试」按钮（`router.refresh()`） |

---

## 三、数据契约

### 3.1 字段映射（全部复用现有 `ProjectResponse`，零新增字段）

| 时间轴语义 | 来源 | 前端字段 | 缺失处理 |
|---|---|---|---|
| 签约日期 | `project_contracts.signing_date` → `ProjectResponse.signing_date`（`YYYY-MM-DD` 字符串） | `signingDate` | **整行不绘制**（无法定位起点），计入页脚「缺日期未展示」 |
| 交房日期 | `ProjectResponse.planned_handover_date`（同一字段兼作「计划」与「实际」） | `handoverDate` | 无交房段；签约段终点顺延到上架日（无则今天） |
| 上架日期 | `project_sales.listing_date` → `ProjectResponse.listing_date` | `listingDate` | 无上架段；交房段终点顺延到成交日（无则今天） |
| 成交日期 | `project_sales.sold_date` → `ProjectResponse.sold_date` | `soldDate` | 无成交点；末段以今天为活口 |
| 当前阶段 | `ProjectResponse.status` | `status` | `ended` 排除 |
| 签约价 | `signing_price` | `signingPrice`（万元） | tooltip 显示 `—` |
| 挂牌价 | `list_price` | `listPrice` | tooltip 显示 `—` |
| 成交价 | `sold_price` | `soldPrice` | 无成交时 tooltip 改显示挂牌价 |
| 项目名 / 楼栋 | `name` / `building_no` | `name` / `buildingNo` | 楼栋为空则不渲染 |
| 负责人 | `project_manager.nickname`（`UserBrief` 无 `name` 字段） | `managerName` | tooltip 显示「未指派」 |

> 日期口径：后端 `ProjectResponse` 的四个日期均为 `str | None`，格式 `YYYY-MM-DD`（`builder.py` 用
> `strftime("%Y-%m-%d")` 序列化）。前端**必须按「日」解析**（`Date.UTC(y, m-1, d)`），
> 禁止 `new Date("2026-04-10")`（会被当 UTC 午夜，UTC+8 下显示为前一天）。

### 3.2 接口

```
GET /api/v1/projects?page=1&page_size=200&signing_sort=true
```

- `signing_sort=true`：新增开关（§5），`ORDER BY project_contracts.signing_date DESC NULLS LAST, projects.created_at DESC`
- `page_size=200` = `settings.max_page_size` 上限；实测（2026-10-31 开发库）`total=47`，其中 **34 条**有签约日期、`ended` 1 条 → 可绘制 33 条
- 响应 `PaginatedResponse[ProjectResponse]`，`slim=True` 路径已包含全部所需字段（`_build_contract_info` / `_build_sale_info`）
- 价格字段（`signing_price` / `list_price` / `sold_price`）实测序列化为**字符串**（如 `"115.00"`），前端 `Number()` 归一化后再换算万元

### 3.3 排序与视图

- **最新 10**（默认）：全部可绘制项目按 `signingDate` 降序，取前 10；
- **全部 N**：全部可绘制项目；`N` = 可绘制项目数（非接口 `total`）；
- 排序在前端再排一次（防御性）：`signingDate` 降序，同日按 `created_at` 降序（后端已保证，前端不依赖）。

### 3.4 时间轴几何（与设计稿 JS 一致）

```
stageOf(p):   sold → sold；listing → listing；handover ≤ 今天 → handover；否则 sign
segmentsOf(p): 签约 [sign, handover||listing||sold||今天)
               交房 [handover, listing||sold||今天)
               上架 [listing, sold||今天)
               任一段 daysBetween(start,end) ≤ 0 → 不画该段
域:           start = min(sign) - 14d；end = max(sold||handover||listing||今天, 今天) + 21d
ppd = 2.6 × zoom（zoom 0.35–3）
x(d) = daysBetween(domain.start, d) × ppd
实心段 = [start, min(end, 今天)]；未来段 = [max(start, 今天), end) 虚线
今天线 x = x(今天)
```

### 3.5 排除规则

| 规则 | 处理 |
|---|---|
| `is_deleted = true` | 后端已过滤 |
| `status = ended`（已下架） | 前端排除（设计稿数据映射口径） |
| `is_archived = true`（已归档） | **保留**（归档仍是真实历史流程，设计稿未要求排除） |
| `signing_date` 为空 | 排除，页脚提示「N 个项目缺日期未展示」 |
| 接口 `total > 已加载条数` | 页脚提示「仅加载最近 200 个项目」，不静默截断 |

---

## 四、前端设计

### 4.1 文件清单

| 文件 | 动作 | 说明 |
|---|---|---|
| `frontend/src/app/(main)/admin/_lib/project-roadmap.ts` | 新增 | 纯函数模型：日期解析、阶段判定、段落生成、域/刻度计算、类型定义（无 React，可被单测） |
| `frontend/src/app/(main)/admin/_components/widgets/project-roadmap-card.tsx` | 新增 | `'use client'` 卡片：卡头、工具条、滚动区、行、页脚、三态 |
| `frontend/src/app/(main)/admin/_components/widgets/project-roadmap-tooltip.tsx` | 新增 | `'use client'` 浮层（fixed 定位 + 翻转） |
| `frontend/src/app/(main)/admin/_components/widgets/project-roadmap-skeleton.tsx` | 新增 | 本 widget 专用加载骨架 |
| `frontend/src/app/(main)/admin/_components/widgets/workbench-widgets.tsx` | 修改 | 新增 `getRoadmapProjects()`（`cache()` + `isRedirectError` 放行）+ `ProjectRoadmapWidget` + 注册到 `WIDGET_COMPONENTS` |
| `frontend/src/lib/workbench-widgets.ts` | 修改 | 注册表新增 `project_roadmap`（span 12，`project:read`，admin+operator），顺序插在 `todo_board_summary` 之后 |
| `frontend/src/app/(main)/admin/page.tsx` | 修改 | 仅加载骨架分流：`project_roadmap` 用 `ProjectRoadmapSkeleton`，其余保持 `WidgetSkeleton` |
| `frontend/src/app/globals.css` | 修改 | `@layer utilities` 新增 4 个字面量工具类（`.rm-dash-sign` / `.rm-dash-handover` / `.rm-dot-sign` / `.rm-dot-handover`，§2.1） |

### 4.2 纯函数模块 `project-roadmap.ts`

```ts
export type RoadmapStage = "sign" | "handover" | "listing" | "sold";
export interface RoadmapProject {
  id: string; name: string; buildingNo: string | null;
  status: "signing" | "renovating" | "selling" | "sold" | "ended";
  signingDate: string | null; handoverDate: string | null;
  listingDate: string | null; soldDate: string | null;
  signingPrice: number | null; listPrice: number | null; soldPrice: number | null;
  managerName: string | null; createdAt: string;
}
export const STAGE_ORDER: readonly RoadmapStage[];
export const STAGE_LABEL: Record<RoadmapStage, { short: string; full: string }>; // 签约/签约中 …
export function parseDay(s: string): number;          // Date.UTC 日序号
export function dayToStr(t: number): string;
export function addDays(s: string, n: number): string;
export function daysBetween(a: string, b: string): number;
export function stageOf(p: RoadmapProject, today: string): RoadmapStage;
export function statusText(p: RoadmapProject, today: string): string;
export function segmentsOf(p: RoadmapProject, today: string): { stage; start; end }[];
export function roadmapDomain(rows: RoadmapProject[], today: string): RoadmapDomain;
export function roadmapAxis(domain: RoadmapDomain, ppd: number): RoadmapAxis; // 刻度 + 月步长 + 今天 x
export function isDrawable(p: RoadmapProject): boolean; // status !== "ended" && signingDate
export function toRoadmapProject(p: ProjectResponse): RoadmapProject;
export function tooltipRows(p: RoadmapProject, today: string): RoadmapTipRow[];
export function rowAriaLabel(p: RoadmapProject, today: string): string;
export const BASE_PPD = 2.6;
export const ZOOM_MIN = 0.35;
export const ZOOM_MAX = 3;
export const STAGE_DASH_CLASS: Record<RoadmapStage, string>; // 计划段虚线描边类名
export const STAGE_DOT_CLASS: Record<RoadmapStage, string>;  // 阶段圆点类名
```

### 4.3 组件结构

```
<ProjectRoadmapCard projects today total>
  ├─ 卡头：项目全流程 [新增] 签约 → 交房 → 上架 → 成交 [N 个项目]    项目列表 →
  ├─ 工具条：图例(4 阶段 + 计数, aria-pressed) | spacer | 视图(最新 10/全部 N) | 缩放(− range + 适应 %)
  ├─ 滚动区 [tabIndex=0 role=region]
  │   ├─ 轴（sticky top）：左角 208px（「项目 / 当前阶段」+「今天 MM.DD」）+ 月份/年份刻度 + 今天刻度
  │   └─ 行 × N（role=button tabIndex=0）：左列（名称/楼栋 + 阶段圆点 + 阶段·N 天）+ 轨道（段/未来段/成交点）
  └─ 页脚：共 N 个项目 · 当前显示 M（筛选：X） | 缺日期提示 | 图例「今天之后为计划」「成交（瞬时节点）」| 键盘提示
```

- 网格线与今天线用**单个绝对定位覆盖层**（`.rm-grid` 等价物），位于行之下、sticky 左列之上被遮住；
- 行的左列 `sticky left-0`、`z-index` 高于覆盖层，滚动时左列常驻；
- 行点击 / `Enter` / `Space` → `router.push("/admin/projects/" + id)`；鼠标悬停与键盘聚焦共用 tooltip 状态。

### 4.4 状态与副作用

| 状态 | 初值 | 说明 |
|---|---|---|
| `view` | `"recent"` | 最新 10 / 全部 |
| `filter` | `null` | 单阶段筛选（再次点击同一阶段取消） |
| `zoom` | `1` | 0.35–3；滑杆 35–300 step 5；± 步进 0.1（保留 2 位小数） |
| `tip` | `null` | `{ project, x, y }`；滚动、离开、失焦关闭 |

副作用（`useLayoutEffect`，避免闪动）：
1. **初始定位**：`view` 变化后，若最新内容右端超出视口 → `scrollLeft = scrollWidth`（滚到最新），否则 0；
2. **缩放保持中心日期**：记录 `prevPpd`，`ppd` 变化时 `scrollLeft = centerDays × ppd − viewport/2`；
3. **适应**：`zoom = clamp((viewport − 左列 − 32) / totalDays / 2.6, 0.35, 3)` 后 `scrollLeft = 0`。
   余量取 32 而非设计稿的 12：`plotW` 末尾固定带 24px 右留白，只减 12 会在「适应」后仍留一条 ~14px 横向滚动条（实测）。

`today` 由**服务端**用 `todayISO()`（`@/lib/formatters`，本地时区）计算后作为 prop 传入：
避免 client 端 `new Date()` 与服务端渲染日期不一致导致 hydration mismatch；跨零点不自动刷新（与其它 widget 日期口径一致）。

### 4.5 键盘与无障碍

- 滚动区：`role="region"` + `aria-label="项目生命周期时间轴，共 N 个项目；可横向滚动，方向键平移"`，`tabIndex=0`；`←/→` 平移 80px；
- 行：`role="button"` + `tabIndex=0`，`aria-label` 读出「项目名 楼栋，当前 X；签约 …，交房 …，上架 …，成交 …」（缺失日期读作「—」）；`Enter`/`Space` 进入详情；
- 图例 chip：`aria-pressed`，`title="只看当前处于「X」的项目"`；计数随视图变化；
- 缩放：`aria-label="时间轴缩放 NN%"`，±按钮 `aria-label="缩小/放大时间轴"`；
- 颜色非唯一载体：图例带文字+计数，tooltip 给全量日期，成交用圆点形状区分；
- `prefers-reduced-motion`：仅去掉悬停背景过渡（`transition`），不移除功能。

### 4.6 响应式

| 断点 | 处理 |
|---|---|
| ≥1280px | 左列 208px，完整时间轴 |
| 768–1279px | 左列 160px，工具条换行 |
| <768px | 卡片内容横向滚动，左列仍 sticky；工具条纵向堆叠 |

### 4.7 三态实现

- **loading**：`ProjectRoadmapSkeleton`——卡头骨架（标题条 + 4 个图例胶囊）+ **10 行**骨架（左列 118×10、轨道条宽 33%–71%，`h-3.5`），`animate-pulse`，行高与终态一致（40px）；
- **empty**：`projects.length === 0`（排除后无任何可绘制项目）→ 空态块，不渲染轴/行；
- **error**：数据获取器返回 `{ ok: false }` → 卡内 banner + 「重试」按钮（`useRouter().refresh()`）；
- **filtered-empty**：`rows.length === 0 && projects.length > 0` → 图表区空态 + 清除筛选。

---

## 五、后端设计

### 5.1 `backend/services/projects/internal/query.py`

- `get_by_status(...)` 新增关键字参数 `signing_sort: bool = False`；
- `join_contract = monitor_sort or contract_sort or signing_sort`（复用既有 `outerjoin + contains_eager` 分支，避免重复 join）；
- 排序分支新增：

```python
elif signing_sort:
    # 工作台「项目全流程」时间轴：按签约日期降序，无合同的排末尾
    order_clause = (ProjectContract.signing_date.desc().nulls_last(), Project.created_at.desc())
```

### 5.2 `backend/services/projects/{core,facade}.py` + `backend/routers/projects/core.py`

- `ProjectCoreService.get_projects(...)`（`core.py`）与门面 `ProjectService.get_projects(...)`（`facade.py`）**都要**增加 `signing_sort` 形参并透传；
  路由注入的是门面，只改 `core.py` 会在运行期抛 `TypeError: ProjectService.get_projects() got an unexpected keyword argument 'signing_sort'`（实测 HTTP 500）；
- 路由增加 `signing_sort: Annotated[bool, Query(description="按签约日期降序（无签约日期的排末尾），供工作台项目全流程时间轴使用")] = False`；
- 与既有 `monitor_sort` / `contract_sort` 同构，不改变默认行为（默认 `False`）。

### 5.3 契约同步

- 后端热重载后执行 `pnpm gen-api`，`paths["/api/v1/projects"]["get"]["parameters"]["query"]` 自动获得 `signing_sort`；
- 生成文件不手改。

---

## 六、注册与默认布局

### 6.1 前端注册表（`frontend/src/lib/workbench-widgets.ts`）

```ts
project_roadmap: {
  key: "project_roadmap", label: "项目全流程", span: 12,
  permission: PERMISSION_CODES.PROJECT_READ, roles: ["admin", "operator"],
}
```

顺序：紧跟 `todo_board_summary` 之后（= 4 张 span3 卡之后、`growth_overview` 之前）。

### 6.2 后端注册表与默认布局（`backend/services/system/workbench_registry.py`）

- `WORKBENCH_WIDGETS["project_roadmap"]`：`WidgetSpec(key, label="项目全流程", description="签约→交房→上架→成交 生命周期时间轴", permission="project:read", default_span=12, roles=_STAFF_ROLES)`；
- `WORKBENCH_ROLE_DEFAULTS`：admin 与 operator 列表均在 `todo_board_summary` 之后插入 `project_roadmap`；
- 三处兜底：无 `project:read` → 不渲染；布局 JSON 缺条目 → 不进入默认布局；未知 key → `_sanitize_entries` 丢弃（既有逻辑）。

### 6.3 对既有测试的影响

`frontend/e2e/workbench-role-layout.spec.ts` 中硬编码的角色数量需同步：
admin **10 → 11**、operator **8 → 9**（user 仍 3）；文件头注释与 `assertWidgetCount` 调用一并更新。

---

## 七、测试与验证

### 7.1 E2E（`frontend/e2e/workbench-project-roadmap.spec.ts`）

串行 8 条（`test.describe.serial`），期望值在 `beforeAll` 里用 `createApiContext()` 现取接口数据推导，不写死条数：

| # | 用例 | 断言 |
|---|---|---|
| 1 | 卡位置与卡头 | `[data-widget="project_roadmap"]` 紧随 `todo_board_summary`；宽度 = `monitor_projects`（满宽 12 栏）；标题 15px/500；「新增」徽标；`${可绘制数} 个项目`；链接「项目列表」 |
| 2 | 最新 10 vs 全部 | 默认行数 = min(10, 可绘制数)；顺序 = 接口 `signing_sort` 顺序；切「全部」行数 = 可绘制数 |
| 3 | 图例即筛选 | 点计数最大的阶段 chip → 行数 = 该计数，且每行 `aria-label` 含该阶段；再点取消恢复全量 |
| 4 | 缩放 | `+` 与滑块同作用于 `ppd`；300% 时画布宽 ≥ 2 倍、出现横向溢出；「适应」后 `scrollLeft = 0` 且无溢出 |
| 5 | 悬浮提示 | `[data-roadmap-tooltip]` 出现，含 4 个阶段名 + `/^签约价/` + `/^(成交价|挂牌价)/`，且整体在视口内 |
| 6 | 键盘 | 行聚焦出提示；缩放 300% 后滚动区 `←/→` 平移；`Enter` → `/admin/projects/{id}` |
| 7 | 轴吸顶 | `scrollTop = scrollHeight` 后轴 `div.sticky` 的 y 仍等于滚动区顶部 |
| 8 | 错误态/空态 | 真实数据下 `data-roadmap-error` / `data-roadmap-empty` / `data-roadmap-filtered-empty` 均不出现（三态互斥）；同时产出整卡截图与 evidence JSON |
| 9 | 整页版式 | 卡顶 > 项目待办卡底、卡底 ≤ 获客概览卡顶；产出整页截图 |

工件：`docs/design/qa-2026-10-31-workbench-roadmap/` 下 `workbench-roadmap-card.png`、`workbench-roadmap-tooltip.png`、`workbench-fullpage.png`（整页版式）、`roadmap-e2e-evidence.json`（接口 total / 可绘制数 / 渲染行数 / 各阶段计数 / 缩放标签 / 页脚文案）。

### 7.2 提交前检查

```bash
cd frontend && pnpm exec tsc --noEmit && pnpm lint
cd backend  && ruff check . && ruff format --check .
# 接口变更后
cd frontend && pnpm gen-api
# E2E（结束阶段统一跑）
cd frontend && pnpm exec playwright test e2e/workbench-project-roadmap.spec.ts e2e/workbench-role-layout.spec.ts
```

---

## 八、决策与偏离（设计稿 8 个「待确认」的处置）

| # | 待确认 | 决策 | 理由 |
|---|---|---|---|
| D1 | 「全部」取数方式 | 复用 `GET /api/v1/projects` + 新增 `signing_sort`，`page_size=200` | 库内 47 个项目 < 200 上限；不新增聚合接口，避免多一个契约面；`signing_sort` 是设计稿数据源声明「按 signing_date 倒序」的必要条件（现有接口无此排序） |
| D2 | 缺签约日期无法定位 | 不绘制 + 页脚「N 个项目缺日期未展示」 | 不猜 `created_at`（会把未签约项目画到错误位置） |
| D3 | `planned_handover_date` 计划/实际双语义 | 同一字段：未来 → 虚线「计划」；已过 → 实线「已交房」 | 现有 `HandoverDialog` 回写同一字段，无第二来源 |
| D4 | 无「结算完成」字段 | 成交 = 瞬时圆点，不画时长段 | 无数据支撑成交周期，不臆造 |
| D5 | 「最新」口径 | `signing_date` 降序 | 与时间轴起点一致；若产品改口径需换排序键 |
| D6 | `ended` / 已删除 / 归档 | 排除 `ended` 与已删除；**保留归档** | 归档项目仍是真实历史，设计稿只点名排除 `ended` |
| D7 | 权限与价格可见性 | widget = `project:read` + admin/operator；tooltip 价格不额外裁剪 | 项目列表页对 `project:read` 已暴露 `signing_price`/`sold_price`，时间轴不扩大暴露面 |
| D8 | 上架 Ink 与成交 Rust 同为深色 | 用形状区分（条 vs 圆点+白环），**新增 4 个字面量工具类**（虚线描边 + 圆点） | 见 §2.1 偏离标注；`#8fb3e8` 需人工决定是否收录进 `DESIGN.md` |

**其它实施决策**

| 决策 | 说明 |
|---|---|
| `today` 由服务端注入 | 避免 hydration mismatch；跨零点不自动刷新 |
| 骨架按 widget 分流 | 终态约 700px，通用 168px 骨架会造成明显 CLS；仅对 `project_roadmap` 分流 |
| 网格线/今天线用单覆盖层 | 38 行 × 30+ 刻度不逐行渲染，减少 DOM 节点 |
| 价格单位 | 万元，`Number()` 归一化（后端 Decimal 可能序列化为字符串） |

---

## 九、成功标准

1. `/admin` 工作台在 KPI 四卡之后出现「项目全流程」卡（admin/operator 可见，user 不可见）；
2. 默认展示签约日期最新的 10 个项目，四条时间轴段颜色/形状与设计稿一致；
3. 图例点击即筛选、再点取消；「全部 N」扩展时间域；缩放三入口（滑杆/±/适应）均可用且保持中心日期；
4. 悬停与键盘聚焦均出现 tooltip（4 个日期 + 阶段间隔 + 签约价 + 成交价/挂牌价）；
5. 行可鼠标点击与 `Enter` 进入 `/admin/projects/{id}`；滚动区方向键可平移；
6. 缺日期项目不绘制且有页脚提示；筛选后为空有专属空态；接口失败只降级本卡；
7. `tsc --noEmit`、`pnpm lint`、`ruff check` 全绿；E2E 新增 9 条用例通过并产出截图工件。

---

## 十、⚠️ 未覆盖 / 不确定

- ⚠️ `#8fb3e8` 未进 `DESIGN.md`（D8）：本迭代以 `globals.css` 的局部字面量工具类落地，是否正式收录待人工确认；
- ⚠️ 「计划交房」文案：设计稿 tooltip 仍写「交房」，本迭代保持一致，未单列「计划交房」字样（D3）；
- ⚠️ 数据量 >200 时按签约日期取最新 200 条，页脚提示「仅加载最近 200 个项目」，未做虚拟滚动；
- ⚠️ 归档项目是否应出现在「全部」视图，设计稿未明确（D6 选择保留）；
- ⚠️ 暗色模式下卡面沿用 `bg-white`（与现有 widget 一致），未做暗色专属配色；
- ⚠️ 楼栋号：生产数据 `building_no` 常为空，且 `name` 往往已包含楼栋号（如 `金杨十街坊 - 金杨十街坊 金杨路660弄21号 102` + `building_no=金杨路660弄21号`），
  故仅在 `buildingNo` 非空且未被 `name` 包含时渲染；hifi 的「短楼栋号」字段生产数据不存在，未臆造；
- ⚠️ `error` 与 `filtered-empty` 两态**未在真实数据下触发**（当前库内 4 个阶段都有项目、接口正常），E2E 只断言二者不出现；
  如需正向覆盖，需注入故障/空筛选（未做，避免为测试改造数据获取层）；
- ⚠️ 图例计数按「当前视图」（最新 10 / 全部）的集合统计，**不随筛选收窄**（与设计稿「counts follow view」一致）；
- ⚠️ 行左列 208px 在 1024–1279px 下会挤占时间轴；已按 768–1279 降为 160px，但 1024px 附近仍未单独验证截图。

---

## 十一、落地结果与验证证据（2026-10-31）

### 11.1 变更清单

| 层 | 文件 | 动作 |
|---|---|---|
| 后端 | `backend/services/projects/internal/query.py` | 改：`get_by_status` 增 `signing_sort` + 排序分支 |
| 后端 | `backend/services/projects/core.py` | 改：`ProjectCoreService.get_projects` 透传 |
| 后端 | `backend/services/projects/facade.py` | 改：门面 `ProjectService.get_projects` 透传（漏改会 500） |
| 后端 | `backend/routers/projects/core.py` | 改：`signing_sort` query 参数 |
| 后端 | `backend/services/system/workbench_registry.py` | 改：`project_roadmap` WidgetSpec + admin/operator 默认布局 |
| 前端 | `frontend/src/app/(main)/admin/_lib/project-roadmap.ts` | 新增：纯函数模型 + 类名映射 |
| 前端 | `frontend/src/app/(main)/admin/_components/widgets/project-roadmap-card.tsx` | 新增：卡片主体 |
| 前端 | `frontend/src/app/(main)/admin/_components/widgets/project-roadmap-tooltip.tsx` | 新增：浮层 |
| 前端 | `frontend/src/app/(main)/admin/_components/widgets/project-roadmap-skeleton.tsx` | 新增：骨架 |
| 前端 | `frontend/src/app/(main)/admin/_components/widgets/workbench-widgets.tsx` | 改：`getRoadmapProjects` + `ProjectRoadmapWidget` + 注册 |
| 前端 | `frontend/src/app/(main)/admin/_components/widgets/widget-head.tsx` | 改：`badge` / `count` 可选 prop |
| 前端 | `frontend/src/app/(main)/admin/page.tsx` | 改：骨架分流 |
| 前端 | `frontend/src/lib/workbench-widgets.ts` | 改：`project_roadmap` 注册 |
| 前端 | `frontend/src/app/globals.css` | 改：4 个字面量工具类 |
| 前端 | `frontend/src/lib/api-types.d.ts`、`miniapp/types/api-types.d.ts` | 改：`pnpm gen-api` 生成（`signing_sort`） |
| 测试 | `frontend/e2e/workbench-project-roadmap.spec.ts` | 新增：8 条 |
| 测试 | `frontend/e2e/workbench-role-layout.spec.ts` | 改：admin 10→11、operator 8→9、卡头列表加 `project_roadmap` |
| 文档 | `docs/design/qa-2026-10-31-workbench-roadmap/` | 新增：3 张截图（卡片 / 浮层 / 整页）+ 1 份 evidence JSON |

### 11.2 命令与结果

```bash
# 接口（后端热重载后）
curl -s "http://127.0.0.1:8000/api/v1/projects?page=1&page_size=200&signing_sort=true" \
  -H "Authorization: Bearer <token>"
# → total=47，items=47，34 条有 signing_date，日期严格降序、无日期条目在末尾；status 含 ended(1)

cd frontend && pnpm gen-api          # openapi-typescript 7.13.0，signing_sort 已进 api-types.d.ts
cd frontend && pnpm typecheck        # tsc --noEmit：0 error
cd frontend && pnpm lint             # eslint --max-warnings 0：0 error / 0 warning
cd backend  && .venv/bin/ruff check <5 个改动文件> && .venv/bin/ruff format --check <同上>   # All checks passed / 5 files already formatted

cd frontend && pnpm exec playwright test e2e/workbench-project-roadmap.spec.ts --reporter=line
# → 9 passed (8.2s)
cd frontend && pnpm exec playwright test e2e/workbench-role-layout.spec.ts --reporter=line
# → 10 passed (10.3s)（admin 11 / operator 9 / user 3）
```

`roadmap-e2e-evidence.json` 实测值：

```json
{ "apiTotal": 47, "drawableCount": 33, "renderedRowsRecent": 10,
  "chips": { "sign": 3, "handover": 4, "listing": 2, "sold": 1 },
  "zoomLabel": "100%", "footer": "共 33 个项目 · 当前显示 10" }
```

### 11.3 实施中修正的设计稿/方案细节

| # | 原方案 | 实际落地 | 原因 |
|---|---|---|---|
| 1 | 新增 2 个 CSS 自定义属性 | 改为 `@layer utilities` 4 个字面量工具类 | Next 的 CSS 压缩剔除「仅被 JS 内联样式引用」的自定义属性 → `var()` 失效、`border-color` 回退 `currentColor`，计划段虚线整段变黑（截图复核发现） |
| 2 | 「适应」余量 −12 | −32 | `plotW` 末尾固定 +24px 右留白，只减 12 会在适应后仍留横向滚动条 |
| 3 | 楼栋号直出 | `buildingNo` 非空且未被 `name` 包含时才渲染 | 生产数据 `building_no` 常为空，且 `name` 已含楼栋号，直出会重复 |
| 4 | 骨架 6 行 34px | 10 行，行高 40px | 与终态行高对齐，减少 CLS |
| 5 | `managerName` 取 `project_manager.name` | 取 `project_manager.nickname` | `UserBrief` 无 `name` 字段 |
| 6 | E2E 9 条（含「筛选空态」） | 9 条（口径调整） | 「筛选空态」在当前数据下无法构造（4 个阶段均有项目），改为断言 error/empty/filtered-empty 不出现；补第 9 条「整页版式」并产出整页截图 |
| 7 | 角标「今天 2026.10.31」 | 「今天 10.31」 | 设计稿 `.rm-corner` 为 `fmtDot(TODAY).slice(5)`，年份由轴上年份刻度承载；E2E 断言同步改为 `/今天 \d{2}\.\d{2}$/` |
| 8 | 页脚多条提示直接并列 | 每条提示前加「·」 | 11.5px 下 8px 间距不足以区分「当前显示 10」与「14 个项目缺日期未展示」，截图复核时读成「10 14」 |

### 11.4 提交说明（未执行 commit / push）

建议单条提交：`feat(workbench): 新增「项目全流程」roadmap widget（signing_sort + 时间轴卡 + E2E）`。
涉及接口契约变更（`signing_sort`）与生成类型更新，需与后端一同评审。
