# SPEC：admin/marketing 调价独立组件 × 详情页双栏重构（全量落地）

> 依据设计稿：`docs/2026-10-06-admin-marketing-298详情页与调价组件-高保真设计稿.html`（v1.0，四口径经用户确认）
> 现状勘察已核对：notify-section.tsx 五职责混杂属实、ActionCell 无调价入口属实、数据口径（notify_summary / latest_price_change / GET price-changes / PUT 局部更新）全部就绪，**后端零改动**。
> 用户已裁定：① 覆盖详情页+列表行内入口全量；② NotifySection 删除、职责并入 PushStatCard；③ 本次建立 e2e/ 目录。

---

## 1. Objective

调价是「房源营销」模块最高频的写操作，但当前内嵌在 `detail/notify-section.tsx`（约 270 行，五职责混杂）且沉在详情页第三屏；列表页操作列无调价入口。本 spec 将调价拆为**独立自包含组件 `<PriceChangeCard>`**（浏览/表单/成功三态），详情页重构为**左主右辅双栏**（价格与调价升入右栏第一卡，sticky 常驻），并为列表页操作列补上**行内快捷调价弹层**。

**用户故事**：
- 运营进入详情页，无需滚动即可看到当前总价并一键进入调价表单；输入新总价时实时看到差价与折算单价，同值被禁用；提交后明确看到「订阅推送已排队」。
- 运营在列表页（如「近期调价」筛选视图）对任一已发布房源直接行内调价，不必进详情页。

**成功形态**：PriceChangeCard 被详情右栏与列表弹层两处复用，同一交互语言；NotifySection 删除；E2E 六用例可重复执行。

### 裁定口径（对设计稿的两处修正，评审可推翻）

| # | 设计稿原文 | 本 spec 裁定 | 理由 |
|---|---|---|---|
| D-1 | 口径表定义入口可见性 = `发布 && canWrite`；Artboard C 又注明列表「已售行不渲染调价项」，存在内部矛盾 | **详情卡与列表弹层共用同一判定，且均排除已售**：`showPricingEntry = publish_status === "发布" && canWrite && project_status !== "已售"` | 改价语义对已售房源已终结，两处口径必须一致（设计稿口径表自身也要求「共用同一判定」） |
| D-2 | 组件架构称「数据入 props（project、timeline）」 | **timeline 由组件内部拉取**（`variant="card"` 挂载即拉，`variant="popover"` 不拉）；props 只收 `project / variant / onPriceSuccess` | timeline 仅组件自身消费，「props 传入」要求宿主代管拉取与提交后重拉两个状态，违背设计稿自己提出的「三态自包含」；内部拉取是更简方案（AGENTS.md 更简方案原则） |

其余口径严格对齐设计稿 SEC 06（金额方向降价=success 绿 / 单价折算 / 时间线倒序全量 / 同值后端兜底 / 成功反馈只承诺「推送已排队」）。

---

## 2. Tech Stack（无新增依赖）

- Next.js App Router + React 19 + TypeScript（严格模式，`tsc --noEmit` 零错）
- shadcn/ui：`Button / Input / Form / Popover`（现有依赖；不修改 `components/ui/` 源码）
- zod v4（`error` 映射语法，沿用 notify-section 现状写法）+ react-hook-form + zodResolver
- SWR 仅用于既有 hooks，本 spec 不新增 SWR 调用
- lucide-react 图标（沿用 `Pencil / TrendingDown / TrendingUp / Bell` 等既有图标）
- Playwright（`@playwright/test ^1.59.1` 已在 devDependencies）

---

## 3. Commands

```bash
# 启动数据库（首次/日常）
./dev-start.sh db            # 或 ./dev-start.sh up 全启

# 后端（调试模式，改动自动重载）
cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 前端（调试模式，HMR 自动生效）
cd frontend && pnpm dev

# 类型检查（提交前必须零错）
cd frontend && pnpm typecheck

# Lint（提交前必须通过）
cd frontend && pnpm lint

# E2E（需 :8000 与 :3000 已运行；playwright webServer 会复用现有 :3000）
cd frontend && pnpm exec playwright test

# API 类型同步：本 spec 无 API 变更，不执行 pnpm gen-api
```

⚠️ 本地调试禁止启动 docker compose 全套容器（会抢占 :8000/:3000），仅 `dev-start.sh db` 的数据库容器可用。

---

## 4. Project Structure

```
frontend/src/app/(main)/admin/marketing/
├── _components/
│   ├── price-change-card.tsx        # ★新增 调价三态独立组件（variant="card"|"popover"）
│   ├── push-stat-card.tsx           # ★新增 推送统计纯展示卡（含草稿态+推送说明脚注）
│   ├── price-popover.tsx            # ★新增 列表行内调价弹层（封装 Popover 定位/关闭/Esc 规则）
│   ├── action-cell.tsx              # ✎修改 操作列新增「调价」项（条件渲染，插在编辑与删除之间）
│   ├── marketing-detail-page.tsx    # ✎修改 view 态内容区改双栏 grid；移除 NotifySection 引用
│   ├── marketing-view.tsx           # （不动）
│   ├── columns.tsx                  # （不动：总价副行/通知列/近期调价徽标均沿用服务端数据）
│   └── detail/
│       ├── notify-section.tsx       # ✗删除（priceChangeSchema 平移至 price-change-card.tsx）
│       └── detail/index.ts          # （不动：未导出 NotifySection，已核实）
├── actions/projects.ts              # （不动：updateL4MarketingProjectPriceAction 等直接复用）
└── [id]/page.tsx                    # （不动：服务端并行拉取链路不变）

frontend/e2e/                        # ★新建 E2E 目录（playwright testDir 已指向 ./e2e）
├── admin-marketing-price-change.spec.ts   # 六条验收用例
└── helpers/
    ├── auth.ts                       # 登录（账号密码读环境变量，严禁硬编码）
    └── marketing-data.ts             # 造数/清理（API 创建→发布→测试→删除，保证可重复执行）
```

**数据契约（已从 `src/lib/api-types.d.ts` 核实，前端只消费不新增）**：
- `L4MarketingProjectResponse`：`total_price: string`、`area: string`、`unit_price: string`、`publish_status`、`project_status`、`notify_summary?: { new_listing_count; price_change_count } | null`、`latest_price_change?: { old_price; new_price; direction; changed_at } | null`
- `L4MarketingPriceChangeTimelineItem`（api-types 已有）：`{ id; old_price; new_price; direction; changed_at; notify_success; notify_skipped; notify_failed }` —— **组件直接 import 此类型，删除 notify-section 中的本地重复声明**
- `GET /api/v1/admin/marketing/projects/{id}/price-changes` → `{ items, total }`（倒序全量）
- `PUT /api/v1/admin/marketing/projects/{id}` body `{ total_price }`（exclude_unset 局部更新；同值不产生调价记录/不触发通知由后端保证，前端同值禁用仅是体验层双保险）
- Server actions 复用：`updateL4MarketingProjectPriceAction(id, totalPrice)`（内含 revalidateTag）、`getL4MarketingPriceChangesAction(id)`（均位于 `actions/projects.ts`）
- 权限：`usePermission().hasPermission(PERMISSION_CODES.L4_MARKETING_WRITE)`

---

## 5. 组件规格（核心行为定义）

### 5.1 `<PriceChangeCard>`（`_components/price-change-card.tsx`）

```tsx
/** 调价三态独立组件：浏览 / 表单 / 成功，同位切换（useState，不进 URL）. */
interface PriceChangeCardProps {
  project: L4MarketingProject;
  /** card=详情右栏完整形态；popover=列表弹层紧凑表单态（无浏览/成功态外壳） */
  variant: "card" | "popover";
  /** 提交成功后由宿主执行（router.refresh 等）；组件不感知宿主路由 */
  onPriceSuccess?: (newPrice: number) => void;
}
```

**三态状态机**（`mode: "browse" | "form" | "success"`，popover 变体恒为 form）：

| 态 | 内容 | 行为 |
|---|---|---|
| browse（仅 card） | 当前总价大数字（Signifier serif）＋单价折算行＋「最近一次」条（读 `latest_price_change`，服务端 7 天窗口下发）＋「调价」主按钮＋「调价历史 (N)」折叠时间线 | 挂载即拉时间线（`variant="card"` 时）；时间线默认折叠，点击展开/收起；提交成功后自动展开 |
| form | 当前总价行＋新总价输入（type=number step=0.01 min=0，空占位）＋实时差价 chip＋单价折算提示（仅 card，popover 不显示）＋推送提示脚注（仅 card） | 进入时自动 focus 输入框；Esc 退出到 browse 并清空输入（card）；确认按钮在 空值/≤0/同值/提交中 时禁用 |
| success（仅 card） | ✓ 图标＋「428.00 → 421.00 万」＋**「订阅推送已排队 · 送达结果稍后回『调价历史』核对」**＋[完成] [查看推送统计] | 「完成」→ browse；「查看推送统计」→ 滚动定位到右栏 PushStatCard（scrollIntoView） |

**差价 chip 联动**（严格对齐设计稿）：
- 输入为空 → idle 灰「输入新总价」（⚠️ 与现状 notify-section 的「默认值=当前价」不同，改为空输入起算）
- 输入 ≤0 →「总价必须大于 0」（zod `total_price = z.number({ error: "请输入新总价" }).positive("总价必须大于 0")`，schema 自 notify-section 平移）
- 差值 <0 → `bg-success-container text-success`「↓ 直降 X.XX 万」
- 差值 >0 → `bg-fog text-graphite`「↑ 上调 X.XX 万」
- 差值 =0 →「价格未变化」＋确认禁用

**单价折算**：`new_total_price × 10000 ÷ Number(area)`，仅 `area` 可解析且 >0 时显示「按 76.5 ㎡ 折合单价约 55,948 元/㎡」；**必须做除零/NaN 防护**（`total_price`/`area` 后端序列化为 string，统一 `Number()` 转换）。

**提交链路**：`updateL4MarketingProjectPriceAction(project.id, newPrice)` → 失败：停留表单态 + `toast.error`（区分校验/网络两类消息，沿用 action 返回的 `error`）；成功：切 success 态 + `toast.success("调价成功，订阅推送已排队")` + 若时间线已加载则静默重拉（新记录送达计数全 0 时渲染「推送已排队 · 送达统计稍后更新」）+ 调用 `onPriceSuccess?.(newPrice)`（宿主执行 `router.refresh()`）。

**入口可见性**（D-1 裁定）：`showPricingEntry = project.publish_status === "发布" && canWrite && project.project_status !== "已售"`。不可用时 browse 态降级为只读价格展示＋原因文案：
- 草稿 →「草稿房源发布后开放调价」
- 无写权限 →「仅查看权限，如需调价请联系管理员」
- 已售 → 只读展示，无原因文案（改价语义终结）

**样式**：沿用 `globals.css` 既有 token（`rounded-cards / shadow-steep-sm / bg-apricot-wash / text-success / tabular-nums` 等），不新增全局样式；卡片内不出现内联 style（tailwindcss 语义类原则）。

### 5.2 `<PushStatCard>`（`_components/push-stat-card.tsx`）

- 纯展示卡：`notify_summary` 两格统计（上新通知累计送达=apricot 暖底 / 调价通知累计送达=fog 冷底），文案「位用户」；底部脚注合并原 NotifySection 推送说明：「授权订阅用户在额度有效期内收到微信服务通知；分次送达明细见调价历史。」
- 草稿或 `notify_summary` 为空：显示引导文案「草稿房源发布后开始推送订阅通知」（对齐现状逻辑）；统计全为 0 且非草稿时同样渲染（数字 0 合法）。
- Props：`{ project: L4MarketingProject }`，无请求、无回调。

### 5.3 `<PricePopover>`（`_components/price-popover.tsx`）

- 基于 shadcn `Popover/PopoverTrigger/PopoverContent`（Radix 自动定位与翻转，**不手写设计稿原型的箭头定位 JS**——原型演示性质；`side="top"` + `align="end"`，宽度 `w-72`）。
- 内容：标题「调价 · {title 截断}」＋当前总价/面积行＋内嵌 `<PriceChangeCard variant="popover">`。
- 关闭规则：Radix 默认（点外部/Esc/关闭钮）；提交成功 → 关闭弹层。
- 成功链路：组件内 toast（「X → X 万已生效，订阅推送已排队」）→ 关闭 → `onPriceSuccess` → 宿主（ActionCell）`router.refresh()` 刷新行内总价/调价副行/通知计数（action 内 revalidateTag 已保证服务端数据一致）。

### 5.4 `action-cell.tsx`（修改）

- `usePermission()` 取 `canWrite`；在「编辑」与「删除」之间插入「调价」项（`Pencil`→改用与设计稿一致的调价语义图标，沿用 ghost 圆角按钮样式与现有预览/编辑一致）。
- 渲染条件 = D-1 判定（与详情卡共用同一表达式；抽出为 `showPricingEntry(project, canWrite)` 纯函数放在 `price-change-card.tsx` 导出，**两处 import 同一实现，禁止复制粘贴判定**）。
- 无写权限时不渲染该项（与现有删除按钮的权限现状对齐——若现状删除按钮未做权限隐藏，本次**不顺带改**，仅调价项做权限判定，避免范围蔓延）。

### 5.5 `marketing-detail-page.tsx`（修改，仅 view 态内容区）

```tsx
// view 态：左主（浏览语义）+ 右辅（高频操作语义，sticky 避开顶栏 top-20）
<div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_348px] gap-5 items-start">
  <div className="space-y-6 min-w-0">
    <MarketingInfoSection project={project} photos={photos} />
    <BasicConfigSection project={project} />
    <PhotosSection project={project} photos={photos} />
  </div>
  <div className="space-y-5 lg:sticky lg:top-20">
    <PriceChangeCard variant="card" project={project} onPriceSuccess={...} />
    <PushStatCard project={project} />
  </div>
</div>
```

- edit 态（EditMode 整页表单）**不显示调价入口**——由 mode 分支天然保证（现状逻辑保留，调价卡只在 view 态渲染）。
- <1024px（lg 以下）折叠单列，右栏内容顺延到房源信息/管理配置之后（grid 天然行为，与设计稿一致）。
- 顶栏、`isRefreshing`、AlertDialog 等既有逻辑**不动**。

### 5.6 明确不做（防 scope 蔓延，对齐设计稿 SEC 07）

1. 不新增后端接口/迁移/字段；Router→Service→Model 零改动。
2. 不改列表页筛选链路（`badge_filter=new/price` 服务端筛选不动，仅既有 pill）。
3. 不做批量调价。
4. 不改 `columns.tsx`（总价列/通知列/近期调价徽标均由服务端数据驱动，`router.refresh` 后自动更新）。
5. 不做设计稿顶栏「已调价」临时 chip（原型演示糖，`router.refresh` 已保证数据一致）。
6. 小程序端展示不在范围（C 端消息卡见 2026-10-04 订阅通知稿）。
7. 不执行 `pnpm gen-api`（无 API 变更）。

---

## 6. Code Style

遵循 AGENTS.md：显式>隐式、完整类型注解、中文 JSDoc、`memo` 包裹、禁止内联样式。示例（PriceChangeCard 骨架，命名/注释/结构即规范）：

```tsx
"use client";

import { memo, useCallback, useState } from "react";
import type { components } from "@/lib/api-types";

/** 调价历史时间线条目（复用 OpenAPI 生成类型，禁止本地重复声明）. */
type PriceChangeTimelineItem =
  components["schemas"]["L4MarketingPriceChangeTimelineItem"];

/** 入口可见性判定：已发布 + 有写权限 + 非已售（详情卡与列表弹层共用，D-1 裁定）. */
export function showPricingEntry(
  project: L4MarketingProject,
  canWrite: boolean,
): boolean {
  return (
    project.publish_status === "发布" &&
    canWrite &&
    project.project_status !== "已售"
  );
}

/** 差价 chip 状态：idle/invalid/same/down/up 五态，禁止用布尔拼凑. */
type DiffState = "idle" | "invalid" | "same" | "down" | "up";

/** 由输入值推导差价状态（纯函数，便于对齐设计稿口径）. */
function resolveDiffState(input: number | undefined, current: number): DiffState {
  if (input === undefined || Number.isNaN(input)) return "idle";
  if (input <= 0) return "invalid";
  if (input === current) return "same";
  return input < current ? "down" : "up";
}

export const PriceChangeCard = memo(function PriceChangeCard({
  project,
  variant,
  onPriceSuccess,
}: PriceChangeCardProps) {
  const [mode, setMode] = useState<"browse" | "form" | "success">("browse");
  // …三态切换、zod 表单、时间线懒加载（实现遵循 5.1 行为表）
});
```

补充约定：
- 新组件文件置于 `_components/` 平级（与 `action-cell.tsx` 同层，不进 `detail/` 子目录——弹层也复用）。
- 金额展示统一 `tabular-nums`；差价保留两位小数 `.toFixed(2)`。
- 不使用 barrel file（`detail/index.ts` 已 deprecated，新文件直接路径 import）。

---

## 7. Testing Strategy

**唯一测试机制 = E2E（Playwright）**，不写单元测试（AGENTS.md：NEVER write unit tests after you write code）。E2E 位于 `frontend/e2e/`（`playwright.config.ts` 已就绪：testDir=./e2e，chromium，webServer 复用 :3000）。

**基建约定**：
- 登录：`helpers/auth.ts` 通过 API 登录获取会话（复用 `/admin/login` 同源接口）；**账号密码读环境变量**（`.env` 提供 `E2E_ADMIN_USER` / `E2E_ADMIN_PASSWORD`，代码零字面量）。
- 造数：`helpers/marketing-data.ts` 用 API 创建带唯一后缀的房源（如 `E2E调价-{timestamp}`）→ 发布 → 测试 → `afterAll` 删除，保证**可重复执行**且不污染既有数据。
- 优先走 UI 断言，数据清理走 API；不做视觉回归截图断言。

**六条验收用例**（对齐设计稿 E2E-1~6）：

| # | 用例 | 关键断言 |
|---|---|---|
| E2E-1 | 详情页调价全链路 | 进入造数房源详情 → 右栏第一卡为价格卡（sticky）→ 调价 428→421 → 成功态文案含「推送已排队」→ 完成后浏览态显示新价 → 列表行总价 421、副行「原 428」出现、`badge_filter=price` 可筛出 |
| E2E-2 | 列表行内弹层调价 | 列表页该行操作列出现「调价」→ 弹层输入 415 提交 → 弹层关闭 + toast → 行内总价更新；刷新页面后与服务端一致 |
| E2E-3 | 同值与非法输入 | 弹层输入 428（同值）→ 确认禁用；输入 0 →「总价必须大于 0」；直发 PUT 同值（API 层）→ price-changes 无新记录（后端 exclude_unset 语义回归） |
| E2E-4 | 入口可见性 | 草稿房源：详情卡无调价按钮＋「草稿房源发布后开放调价」；列表草稿行无「调价」项（⚠️ L4 只读角色账号若不可用，该分支降级为手工验证并在此标注） |
| E2E-5 | 时间线两态 | 零记录房源：时间线显示空态引导；调价两次后：倒序两条、方向色（降=绿）、送达/跳过/失败计数渲染 |
| E2E-6 | 响应式与焦点 | 1024px 视口双栏折叠单列；进入表单态自动 focus 输入框；Esc 从表单态回浏览态（card）/关闭弹层（popover） |

**验收门槛**：`pnpm exec playwright test` 全绿；重复执行两遍结果一致（造数唯一后缀保证）。

---

## 8. Boundaries

**Always（必须）**：
- 提交前 `pnpm typecheck` 零错 + `pnpm lint` 通过（含 `--max-warnings 0`）。
- 入口可见性判定只有一份实现（`showPricingEntry`），详情卡与列表弹层共用。
- 金额/面积字符串一律 `Number()` 转换并做 NaN/除零防护后才参与计算。
- 成功反馈只承诺「推送已排队」，任何文案不得出现「已通知 N 位用户」。
- 降价 = `text-success` 绿、涨价 = Graphite 灰（不引入红涨绿跌）。
- E2E 账号密码读环境变量。

**Ask first（先问再做）**：
- 实现中发现确需后端变更（如时间线分页、送达状态字段）→ 停下说明，更新本 spec 后再动。
- 需要新增任何 npm 依赖 → 先征得同意。
- 需要改动 `columns.tsx` / `marketing-view.tsx` / 后端任何文件 → 先说明理由。
- 发现顶栏重复渲染等存量 bug 需顺带修复 → 先问。

**Never（禁止）**：
- 修改 `src/components/ui/**`（shadcn 源码）。
- 修改后端 Router/Service/Model、migrations，或执行 `pnpm gen-api`。
- 硬编码账号密码/提交任何凭据。
- 在 edit 态渲染调价入口；做批量调价。
- 删除或弱化现有 E2E 造数清理逻辑（防测试数据残留）。

---

## 9. Success Criteria（全部满足即完成）

1. `/admin/marketing/[id]` view 态在 ≥1024px 呈双栏：右栏第一卡 = 价格与调价卡（sticky top-20），第二卡 = 推送统计；左栏 = 房源信息 → 房源状态/管理配置 → 媒体资源；<1024px 单列且右栏内容顺延。
2. PriceChangeCard 三态行为与 5.1 行为表逐条一致（含差价五态 chip、同值禁用、空输入 idle、自动 focus、Esc 退出）。
3. 调价提交成功：成功态含「推送已排队」；时间线自动展开并出现新记录（计数全 0 时显示「送达统计稍后更新」）；列表行总价/调价副行/通知计数经 `router.refresh` 同步。
4. `notify-section.tsx` 已删除；推送统计与推送说明由 PushStatCard 承接；全仓库无 NotifySection 残留引用。
5. 列表操作列：已发布+有写权限+非已售的行出现「调价」项，弹层提交成功后关闭+toast+行内刷新；草稿/已售/无权限行不出现。
6. `pnpm typecheck` 零错、`pnpm lint` 通过；无 API 变更、后端零 diff（`git diff backend/` 为空）。
7. `frontend/e2e/admin-marketing-price-change.spec.ts` 六用例全绿且可重复执行，产出可复跑的造数/清理 helper。

---

## 10. Open Questions

1. **顶栏疑似存量 bug**：`marketing-detail-page.tsx` 自绘了返回+标题的 sticky 顶栏，同时又在其中渲染 `<MarketingDetailHeader>`（后者内部再次渲染返回+标题+边框条），疑似重复渲染。本 spec 不动顶栏，右栏 sticky 偏移按现状顶栏高度取 `top-20`。是否顺带修复？→ 默认不修，待确认。
2. **单价单位**：设计稿卡片折算行用「55,948 元/㎡」，与全局 `formatUnitPrice`（¥X.XX万/㎡）不一致。已按设计稿裁定（卡内折算用 元/㎡，既有列/信息卡不动）。确认？
3. **L4 只读角色测试账号**：E2E-4 的权限分支自动化依赖只读账号；若环境中无法创建，该分支降级为草稿路径断言 + 手工验证清单（会在 E2E 报告中显式标注 ⚠️）。
4. **时间线分页**：当前 GET 全量倒序，调价记录预期量级小（数十条），本 spec 不做分页；若未来量级增长需另立任务。

---

*冻结状态：本 spec 经用户批准后方可进入 Phase 2（Plan）。后续实现若与本 spec 冲突，以本 spec 为准；若需偏离（如 D-1/D-2 裁定被推翻），先更新本 spec 再动代码。*
