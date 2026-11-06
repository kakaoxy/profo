# `/admin/merchant/companies` 设计批判（DESIGN.md 单契约）

> 本报告只以仓库根目录 `DESIGN.md` 为视觉与交互契约，不把旧页面、shadcn 默认值、同产品的其他页面或“看起来还行”当作豁免理由。审查目标是「找出所有偏离与 AI 味」，不是改页面。
>
> `DESIGN.md` 的 M1-M8 移动端条款只适用于 `miniapp/**`，不适用于本 Web 后台页；本报告只引用 Web 条款。

| 项目 | 内容 |
|---|---|
| 审查日期 | 2026-11-06 |
| 审查路由 | `/admin/merchant/companies`（商户公司） |
| 对照契约 | `DESIGN.md`（537 行，Web 条款） |
| 审查方式 | 源码逐行审查 + Playwright 真实渲染（390 / 768 / 1024 / 1440）+ `getComputedStyle` / `getBoundingClientRect` + `document.fonts` 字体核验 |
| 原始度量 | [companies-metrics.json](evidence/companies-metrics.json)、[companies-breakpoints.json](evidence/companies-breakpoints.json) |
| 结论 | **Fail — 5 个 P0 / 8 个 P1 / 5 个 P2** |
| 页面代码改动 | 无；本报告只做 critique |

## 0. 一句话结论

**这不是“配色太素”或“缺少装饰”的问题，而是页面把 shadcn 默认组件和通用后台模板直接拼在一个 44px 衬线标题下面：按钮、输入、圆角、字号、字重、表格密度、状态语言全部没有进入 DESIGN 的系统。** 远看是干净后台，近看是：26 个按钮里 24 个是 outline，表格在 1440 就裁掉“操作”列，8 个相同的浅蓝胶囊成为全页最强色块，加载、空、错误三种状态互相打架。

先明确通过项，避免误伤：

- 页面没有紫蓝渐变、彩色光晕、渐变文字、emoji 标题、玻璃拟态、blob 或循环动画。
- 页面最大宽度 1200px 正确；1440 视口下 `PageContainer` 实测 1200px。
- `h1` 是 44px / 400 / Source Serif，描述是 16px / 1.38 / Graphite，和 `DESIGN.md` 的 heading / body 档一致；Inter 与 Source Serif 都在 `document.fonts` 中加载成功（两者是 DESIGN 明确列出的替代字体）。
- 卡片 24px 圆角，筛选卡和表单卡内边距 20px；所有边框均为 1px，没有超过契约上限。
- 表格没有竖线，表头用 Fog 底；删除按钮有可访问名称，搜索框和状态筛选有 `aria-label`。
- 没有把 Ink 实心滥用成普通卡片；Ink 只出现在保存按钮和当前页码上（但“两个实心”本身是 P0-03 的问题）。

## 1. 判定摘要（五维）

| 维度 | 判定 | 直接原因 |
|---|---|---|
| 视觉语言 | **Fail** | 白色画布上的白色卡片、shadcn 冷灰边框、8px 控件圆角、12px 表头、缺失的 430/450/480 字重 |
| 组件一致性 | **Fail** | Button / Input / Select / Dialog 全部是 shadcn 默认形态；项目已有的 `SteepButton` / `SteepInput` / `SteepSelectTrigger` 完全未使用 |
| 信息层级 | **Fail** | “新建公司”埋在一个和“查询”同权重的 outline 按钮里；常驻表单制造第二个主操作；每行编辑/删除同权重 |
| 响应式 | **Fail** | 1440 表格已被裁掉 128px；1024 表格卡仅 336px 宽；768/390 表格和表单卡被撑到 880px，无可用横向滚动 |
| 状态与可访问性 | **Fail** | 8 个相同的 Sky Wash 状态胶囊；加载/空/错误/分页文案互相矛盾；9 个 12px 节点；两处文字对比度低于 AA |
| 无 AI 装饰 | **Pass** | 没有渐变、发光、emoji、blob、循环动画或夸张 hero；问题属于“默认组件 + 模板结构”的结构性 AI 味 |

## 2. 契约 vs 实际（硬指标）

| 契约项 | `DESIGN.md` | 本页实际 | 结果 |
|---|---|---|---|
| 页面最大宽度 | 1200px（L117） | 1440 视口下 `main` x=240 / w=1200 | **Pass** |
| 页面画布 | 产品截图为 Fog canvas 上的白色 dashboard（L226、L245） | `body` / `main` 均为 `#ffffff`；没有 `bg-fog` 包裹 | **Fail** |
| H1 | Signifier 44/400，44px 字距 -0.015em（L67、L255） | Source Serif 44/400/48.4，-0.66px | **Pass** |
| 正文字体 | Sohne（允许 Inter 替代），14–26px | Inter 16/400/24，加载成功 | **Pass**（字体族） |
| 字号 | Type Scale 最小 caption 14px（L59-70） | 9 个页面 12px 节点：7 个 `th` + 分页“8” + 当前页码“1” | **Fail** |
| 字重 | 仅 400 / 430 / 450 / 480 / 500；禁止 bold Sohne（L51-57、L255） | 正文 400、按钮和表单标题 500、Dialog 标题 600；450 只出现在状态胶囊 | **Fail** |
| 按钮 | pill 9999、Sohne 15/450、8×20 padding、每屏最多一个 filled（L124-132） | 36px 高 / 32px sm、radius 8、14/500、padding 8/16 或 0/12；24 个 outline + 2 个 Ink filled | **Fail** |
| Input | 16px 圆角（L98-108）；项目 `SteepInput` 为 44px 高 / 15px 文本 | 36px 高、radius 8、14px、`shadow-xs`、border 对比度 1.24:1 | **Fail** |
| 卡片 | 24px 圆角、20–24px 内边距、唯一三层 signature shadow（L110-114、L201） | 24px 圆角；筛选/表单 p20；表格卡 p0；三张卡都用 `shadow-steep-sm`，不是唯一阴影 | **Fail** |
| 次要动作 | text links，不是 ghost / outline（L129-132、L207） | 24 个 outline 按钮：查询、新建、8 行×2、分页 6 | **Fail** |
| 状态 | 状态要有语义且同一状态同一画法（L255 的区域语气） | 8/8 行都是“正常”，8 个相同的 Sky Wash 胶囊；没有状态差异可读 | **Fail**（使用层） |
| 表格 | 4px 网格上的稳定节奏；内容卡 20–24px 内边距 | 行高 57 / 65 混排；表格卡 p0；1440 表格 880 放进 752 | **Fail** |
| 页面节奏 | Section gap 80px（L117-120） | `PageContainer` `gap-6` = 24px | **Fail**（见 P2-01 的契约歧义） |
| 边框 | 不超过 1px（L203） | 所有边框 1px | **Pass** |
| 图标 | 16–20px、1.5–2px stroke（L226） | 页面本身没有自定义图标；壳层图标一致 | **Pass / N/A** |
| 装饰 | 无渐变、无 glow、无 emoji | 通过 | **Pass** |

## 3. P0（阻断级）

### P0-01 基础控件仍穿 shadcn 默认：项目已有的 Steep 控件完全没用

**位置**

- `frontend/src/app/(main)/admin/merchant/companies/page.tsx:3-9`：只从 `@/components/ui/button`、`@/components/ui/input`、`@/components/ui/select` 引入默认控件。
- `frontend/src/components/ui/button.tsx:8`：`rounded-md text-sm font-medium transition-all`；`:22-23`：default `h-9 px-4`、sm `h-8`。
- `frontend/src/components/ui/input.tsx:11`：`h-9 rounded-md border px-3 py-1 text-base shadow-xs md:text-sm`。
- `frontend/src/components/ui/select.tsx:37`：`rounded-md border h-9 text-sm shadow-xs`。
- `frontend/src/components/custom/steep-controls.tsx:9-18` 已有正确的 `SteepButton`（`rounded-full text-[15px] font-[450]`、primary `h-10 bg-ink px-5`）；`:49-58` 的 `SteepInput` 是 `h-11 rounded-[16px]`、15px/450；`:61-76` 的 `SteepSelectTrigger` 是 `h-11 w-full rounded-[16px]`。本页一个都没用。

**实测**

| 控件 | 本页实际 | DESIGN / Steep 标准 |
|---|---|---|
| 查询按钮 | 61.7×36px、radius 8px、14px/500、padding 8/16 | pill 9999、15/450、8×20、高度 40 |
| 新建公司 | 89.4×36px、白底 1px 边框、radius 8px | 应该是页面唯一 Ink filled CTA |
| 编辑 / 删除 | 53.7×32px、radius 8px、14/500 | text link，不带边框和背景 |
| 搜索框 | 256×36px、radius 8px、14px、border `#e5e7eb` | 16px 圆角、15px、Dove 边框 |
| 状态 Select | 36px 高、radius 8px、14px | 44px 高、16px 圆角、15px |

**影响**

- 这是整页“默认后台感”的第一根因：所有交互元素的圆角、字号、字重、高度都在 DESIGN 体系之外。
- 局部给 `Card` 加 `rounded-cards` 无法弥补：按钮/输入仍然是 8px 小圆角，视觉上像两个不同的组件库拼在一起。
- 同一个仓库的门店页已经使用 `SteepButton` / `SteepInput`（见 `frontend/src/app/(main)/admin/merchant/stores/page.tsx:127-137`），公司页因此看起来像“另一个产品的旧页面”。

**修复方向**

- 页面层统一改用 `SteepButton` / `SteepInput` / `SteepSelectTrigger`；不要在每个 `Button` 上逐个加 className 打补丁。
- 主 CTA 用 `variant="primary"`，次要动作用 `variant="text"`；行内编辑/删除也改为 text link 或“更多”菜单。
- 若 Steep 控件缺少 Dialog / textarea / select item 的对应封装，先补齐 `components/custom`，再改页面。

### P0-02 表格在 1440 已被裁掉“操作”列，1024/768/390 直接不可用

**位置**

- `frontend/src/app/(main)/admin/merchant/companies/page.tsx:192`：`grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start`。
- `frontend/src/app/(main)/admin/merchant/companies/page.tsx:193-195`：表格卡 `p-0`，内部 `table w-full min-w-[880px]`，外包一层 `overflow-x-auto`。

**实测（四断点）**

| 视口 | 内容区 | 表格卡 | 表格 | 外层 client / scroll | 结果 |
|---|---|---|---|---|---|
| 1440 | 1200 | 752 | 880 | 752 / 880 | 右侧 128px 不可见；“操作”列 147px 完全在卡片外 |
| 1024 | 784（侧栏 240） | 336 | 880 | 336 / 880 | 只显示前 3 列，状态/备注/创建时间/操作都要横向滚动 |
| 768 | 528（侧栏 240） | 880 | 880 | 880 / 880 | 卡片右缘到 1144，超出 768 视口，被 `overflow-x: clip` 硬裁 |
| 390 | 390 | 880 | 880 | 880 / 880 | 卡片右缘到 896；空态文案中心在 x≈456，屏幕里只露出一个“暂”字 |

窄屏下 `grid` 的 client 宽度只有 358px，但 scrollWidth 是 880px；问题不是“没有滚动条”，而是**表格卡自身被 min-content 撑到 880px，`overflow-x-auto` 内部 client 和 scroll 都是 880，根本没有可滚动区**。`main` / `body` 的 `overflow-x: clip` 把超出部分直接切掉。

**影响**

- 1440 桌面第一屏就无法点击编辑/删除；这是功能级阻断，不是小屏适配问题。
- 1024 是常见的 13 寸笔记本宽度，表格只剩公司/联系人/电话三列，状态不可见。
- 768/390 右侧表单卡也被撑到 880px，输入框右半截直接消失。
- 空态和错误态的文案也会被居中到不可见的 880px 画布中，移动端用户看不到“没有数据”。

**修复方向**

- 立即给 grid 直接子项加 `min-w-0`，把两列布局推迟到 `xl`（1280px）；`lg` 到 `xl` 之间用单列，表单放表格下方或改为抽屉。
- 表格改 `table-fixed` + `colgroup`，明确列宽；`备注` 和 `创建时间` 在 `lg` 以下隐藏或降级为第二行。
- 小于 `md` 不渲染七列表格，改为公司卡片列表（名称/状态/联系人/操作）。
- 如果保留横向滚动：滚动容器必须是被约束宽度的那一层，不能是 880px 的卡片；同时给出可见的滚动提示或渐变边缘，不能依赖隐藏滚动条。
- 更根本的方案是把右侧常驻表单改为抽屉/弹窗，释放 360px，让表格在 1440 获得完整的 1136px 可用宽度。

### P0-03 动作层级失效：24 个 outline，2 个 Ink filled，“新建公司”不是主 CTA

**位置与实测**

- `frontend/src/app/(main)/admin/merchant/companies/page.tsx:181-186`：查询和新建公司都是 `Button variant="outline"`。
- `frontend/src/app/(main)/admin/merchant/companies/page.tsx:224-233`：每行编辑/删除都是 `Button variant="outline" size="sm"`。
- `frontend/src/components/common/pagination.tsx:156-218`：分页 6 个按钮全部 `variant="outline"`，当前页额外 `bg-ink text-white`。
- 全页 26 个页面按钮：**24 个 outline**（查询 1、新建 1、表格 16、分页 6），**2 个 Ink filled**（保存 59.7×36 / radius 8；当前页码 32×32 / radius 10）。

`DESIGN.md:124-132` 规定主 CTA 是唯一 Ink filled pill，每个屏幕最多一个；`DESIGN.md:207` 明确“secondary actions are text links, not ghost buttons”。本页恰好相反：主操作穿 outline，普通分页页码穿 Ink，次要动作铺满 outline。

**影响**

- 用户视线无法判断“新建公司”是主操作；它和“查询”同形，甚至位于筛选卡最右侧，像一个筛选附属按钮。
- 8 行 × 2 个同权重按钮使表格成为“按钮墙”；删除与编辑同权重，危险动作没有视觉隔离。
- 保存按钮和当前页码同时是 Ink filled，直接违反“每屏最多一个 filled”；当前页码还使用了 32px 高的实心块，是页面上最重的元素之一。
- 常驻表单又制造了第二个“保存”主操作：即使把“新建公司”改成 filled，只要表单还在页面上，仍会有两个 filled 同屏。

**修复方向**

- 页面级只保留一个 `SteepButton variant="primary"`：放在 `PageHeader actions`，与 `SteepButton variant="text"` 的次级动作并排。
- 查询改为搜索框的回车/后缀 text button；行内编辑/删除改为 text link 或 overflow menu；删除用 Rust 语义，不用 outline 按钮。
- 分页当前页不要用 Ink 实心；改为 Fog 底、Ink 文字的页码，或细下划线。
- 表单改为由“新建公司/编辑”打开的 Sheet 或 Dialog，表单内的保存成为该浮层的唯一主操作。

### P0-04 类型系统碎裂：12px 表头 + 只有 400/500/600，没有 DESIGN 的 430/450/480

**位置与实测**

- `frontend/src/app/(main)/admin/merchant/companies/page.tsx:196`：`thead className="bg-fog text-xs text-slate"`；7 个 `th` 实测 `12px / 400 / line-height 16px / #8b8c8d on #f7f7f8`，对比度 **3.15:1**。
- `frontend/src/components/common/pagination.tsx:102,122,151`：`text-xs`，分页“共 8 条”、当前页码、每页说明全是 12px；页面主体共 **9 个 12px 节点**（不含壳层 logo）。
- `DESIGN.md:59-70` 的 Type Scale 从 caption 14px 起，没有 12px 档；`DESIGN.md:255` 明确“a 450 weight table header reads as 'important' without being heavy”。
- 字重分布：正文/表格/字段标签 400，按钮和表单卡标题 500，Dialog 标题 600；`font-[450]` 只出现在 `StatusBadge`。430/450/480 的微字重体系没有建立。
- `frontend/src/app/(main)/admin/merchant/companies/_components/company-delete-dialog.tsx:64` 使用 `DialogTitle` 默认 `text-lg leading-none font-semibold`，实测 **18px / 600 / line-height 18px**；`DESIGN.md:255` 规定“Never bold Sohne; use 480 or 500 instead”。

**影响**

- 表头比正文更小、更浅、更细，表格的列名读起来像辅助说明；12px 在 1440 的截图里已经接近不可读。
- 公司名称、联系人、备注、日期全是 14/400，行内没有主/次层级；只有颜色差异（Ink vs Graphite），扫描时无法先读公司名。
- 12px + 3.15:1 对比度同时违反字号与可读性；这是表格看起来“廉价”的直接原因。
- Dialog 的 600 字重和 1.0 行高是整个页面唯一“粗体标题”，和 DESIGN 的微字重语言相反。

**修复方向**

- 表头：14px / 450 / Graphite（或 Ink），行高 1.4；正文主值 15/450 Ink，次值 14/400 Graphite。
- 分页全部改 14px；移除 `text-xs`。
- 建立页面级 token 映射：caption 14/400、body 16/400、button 15/450、table header 14/450、dialog title 18/450（或 22/450），禁止 600。
- 用 430/450/480 替代 `font-medium` / `font-semibold` 的粗暴层级。

### P0-05 状态语言失真：8 个相同蓝色胶囊 + 加载/空/错误三套矛盾文案

**位置与实测**

- `frontend/src/app/(main)/admin/merchant/companies/page.tsx:217-222`：每行都用 `StatusBadge tone={normal ? "positive" : "neutral"}`；8 条数据全是“正常”，实测 8 个 `52×28px` 的 `bg #d3e3fc` 胶囊，成为全页最强色块。
- `frontend/src/app/(main)/admin/merchant/companies/page.tsx:239-245`：加载/空态共用一行 `<td colSpan={7}>`，文案是 `loading ? "加载中…" : appliedKeyword ? "没有符合条件的公司" : "暂无公司，可在右侧新建"`。
- `frontend/src/app/(main)/admin/merchant/companies/page.tsx:249-258`：`Pagination` 始终渲染，`totalPages={Math.max(1, ...)}`。
- 加载截图：表格显示“加载中…”，分页同时显示“暂无数据”“1 / 1”和黑色当前页 1；查询按钮“查询中…”被 disabled。
- 错误截图（拦截 500）：页面顶部出现裸 `<p>`“服务器内部错误”（宽 1136、14px Rust），表格同时显示“暂无公司，可在右侧新建”，分页仍是“暂无数据 / 1 / 1 / 黑页 1”，且没有重试按钮。
- 空搜索结果截图：表格显示“没有符合条件的公司”，分页显示“暂无数据”，右侧表单仍停留在上一次的“编辑公司”状态。
- 移动端空态：由于表格 880px 宽，`暂无公司，可在右侧新建` 的居中位置在 x≈456，390 视口中只露出最右一个“暂”字。

**影响**

- “正常”是唯一状态，却占用了最强的颜色；状态列变成装饰，而不是信息。用户看不出哪一行需要处理。
- 加载、空、错误三种状态在同一个表格/分页区域里互相矛盾；错误看起来像“没有数据”，用户不知道应该重试还是新建。
- 空结果时仍能编辑已不在列表中的公司，存在误操作风险。
- 空态文案写死“右侧”，在 390/768 单列布局里是错的（表单在下方且被裁掉）。

**修复方向**

- 状态语义：正常用中性文字/小圆点；只有停用等异常使用 Apricot Wash / Rust；不要把 pastel wash 当作每行默认装饰。
- 状态机：`loading` 用骨架行 + 120–180ms 的 opacity 过渡，不显示分页“暂无数据”；`error` 用带图标/重试按钮的 alert 区；`empty` 只保留一条与筛选条件对应的说明，并隐藏分页。
- 当 `total === 0` 时不渲染分页；空态文案改为不依赖布局方向的“暂无公司，点击「新建公司」添加”。
- 过滤结果变化时清空 `editingId`，或把编辑表单关闭，避免编辑不可见记录。

## 4. P1（高优先）

### P1-01 表面语言：白色画布 + 白卡 + 未定义的 `shadow-steep-sm` + 表格卡 p0

**位置与实测**

- `frontend/src/app/(main)/admin/merchant/companies/page.tsx:157` 直接返回 `PageContainer`，没有 `min-h-screen bg-fog` 外壳；实测 `body` 与 `main` 背景均为 `#ffffff`。
- `DESIGN.md:226`：产品截图是“clean white dashboards on Fog canvas with sidebar navigation”；`DESIGN.md:245` 明确 Dashboard card grid 是“Fog (#f7f7f8) canvas, white cards”。同产品的门店页在 `frontend/src/app/(main)/admin/merchant/stores/page.tsx:120` 使用 `<div className="min-h-screen bg-fog">`。
- `frontend/src/app/(main)/admin/merchant/companies/page.tsx:160,193,261` 三张卡都用 `shadow-steep-sm`；`frontend/src/app/globals.css:170-175` 定义了 `--shadow-steep`（DESIGN 的三层）和 `--shadow-steep-sm`（更弱、更短、更浅的自造版本），本页用了后者；门店页 `store-list.tsx:138` 用的是 `shadow-steep`。
- `frontend/src/app/(main)/admin/merchant/companies/page.tsx:193` 表格卡 `p-0`；`Card` 基础类本身有 `py-6`（`frontend/src/components/ui/card.tsx:10`），`p-0` 把内边距完全取消，表头直接贴住卡片上缘。
- `DESIGN.md:117-120`：Card padding 20–24px。

**影响**

- 白底 + 白卡把卡片边界交给阴影；但 `shadow-steep-sm` 比 DESIGN 的 signature shadow 弱一半，三张卡看起来像同一块白纸上的淡边框，页面没有 “Fog canvas 上浮起白色 widget” 的产品层次。
- 表格卡 p0 让表头的 Fog 底和 24px 圆角相撞，失去内容和卡片边界的呼吸；和门店页的 `p-5 + overflow-hidden rounded-[16px]` 是两套语言。
- 统一白底使页面更像默认 shadcn 示例，而不是 DESIGN 的 product shell。

**修复方向**

- 页面根节点加 `min-h-screen bg-fog`（与门店页一致）；卡片一律 `bg-pure-white shadow-steep`。
- 表格卡改 `p-5`，表格再包 `overflow-hidden rounded-[16px]`；这样表头圆角、边距、阴影都成立。
- 删除 `shadow-steep-sm` 的页面级使用；若它是为小卡设计的 token，需要先纳入 DESIGN 并定义适用条件，否则不应出现。

### P1-02 常驻表单是信息架构错位：挤压表格 360px，又制造第二个主操作

**位置与实测**

- `frontend/src/app/(main)/admin/merchant/companies/page.tsx:192`：`grid … 360px`；1440 时表格卡只有 752px，而表格最小宽度 880px；这正是 P0-02 桌面裁切的直接原因。
- `frontend/src/app/(main)/admin/merchant/companies/page.tsx:261-308`：表单卡始终渲染，标题在“新建公司/编辑公司”之间切换；保存是默认 Ink 按钮，编辑时还有“取消编辑” outline。
- 编辑态实测：状态 Select 约 80px 宽，其他 Input 约 320px；表单卡高 537.6px；标题只有 14px/500。
- 空搜索截图：表格已显示“没有符合条件的公司”，右侧仍是“编辑公司”表单，表单与列表状态不同步。

**影响**

- 页面同时承担“列表浏览”和“表单编辑”两个任务，表格永远让出 360px；这是 tablet/小桌面最严重的空间浪费。
- 页面上永远有两个“提交”方向：新建公司的入口 + 常驻保存按钮；用户不知道当前是在浏览还是在编辑。
- 状态 Select 的 80px 宽度是 shadcn `w-fit` 默认值的结果，和下方 320px 的输入形成明显错位；编辑态看起来像未完成的表单。
- 窄屏时表单卡跟随 880px 表格一起溢出，用户看不到右侧字段；这是 P0-02 的一部分，但根源是这个常驻双栏结构。

**修复方向**

- 删除常驻表单列：`PageHeader` 放一个 `SteepButton variant="primary"` “新建公司”；点击打开右侧 Sheet/Dialog（公司规模小，用 Dialog 也可）。
- 编辑行打开同一个 Sheet，预填公司字段；一次只呈现一个任务，表格获得完整的 1136px。
- 所有输入/选择 `w-full`；表单标题用 18/450 或 22/450，字段标签 14/400，按钮 15/450。

### P1-03 表格数据排版不稳定：57/65px 行高、公司名和日期折行、联系电话列被挤成两行

**位置与实测**

- `frontend/src/app/(main)/admin/merchant/companies/page.tsx:195`：`table w-full min-w-[880px] text-sm`，没有 `table-fixed`、没有 `colgroup`、没有固定行高。
- 列宽实测：公司名称 200 / 联系人 72 / 联系电话 116 / 状态 84 / 备注 105 / 创建时间 156 / 操作 147。
- 行高序列 `[65, 57, 65, 57, 57, 65, 65, 64.5]`；`SHOT1793630391869公司` 在 200px 内折成两行，`王经理` 在 72px 内折成两行，`2026/11/2 22:39:52` 在 156px 内折成两行。
- `frontend/src/app/(main)/admin/merchant/companies/page.tsx:220`：`new Date(company.created_at).toLocaleString("zh-CN")` 直接输出 `2026/11/2 22:39:52`：月/日不补零、带秒、长度不稳定，且没有 `tabular-nums`。
- 备注列 `max-w-[16rem] truncate`（`:218`）实际列宽只有 105px，长备注被静默截断且无 tooltip。

**影响**

- 同一张表里行高相差 8px，视觉上像自动换行造成的“参差表格”，不是有节奏的数据表。
- 公司名与联系人都在垂直居中里折行，首列的主信息反而不如状态胶囊醒目。
- 日期带秒且斜杠格式，在一张中文后台表里像调试输出；数字不对齐，扫读困难。
- 用户无法知道被截断的备注是什么，也无法稳定点击行尾操作（操作列还被裁掉）。

**修复方向**

- 使用 `table-fixed` + `colgroup`；设定 84px 固定行高；公司名 `truncate` + `title`/详情入口，联系人 `whitespace-nowrap`，日期统一 `YYYY/MM/DD` 或 `MM/DD HH:mm` 并 `tabular-nums`。
- 次要信息（联系人/电话/备注/日期）保持 14/400 Graphite；主信息 15/450 Ink。
- 备注列用 `max-w` + `truncate` + `title`；或将备注移到行展开/详情，不在主表硬塞。
- 操作列固定 96–120px，编辑/删除用 text link 或菜单，不参与压缩。

### P1-04 筛选区：四个控件同权重，查询与新建都像“过滤器按钮”

**位置与实测**

- `frontend/src/app/(main)/admin/merchant/companies/page.tsx:161-186`：`flex flex-wrap items-center gap-3`（12px，不是 DESIGN 的 element gap 8）；输入 `w-64`（256px）、Select `w-40`（160px）、查询和新建都是 outline。
- 筛选卡在 768 高 124px、390 高 172px：控件换行堆叠；1440 一行 76px。
- 搜索框 `placeholder="按公司名称搜索（留空显示最新）"` 长 20 个字符，且只有 `aria-label`，没有可见标签；`查询` 与 placeholder 的“搜索”不是同一个动词。
- “新建公司”被 `ml-auto` 推到筛选卡最右，视觉上属于筛选工具，而不是页面主操作。

**影响**

- 用户读完四个控件后仍不知道哪个是主操作；查询和新建同形，误点风险高。
- 长 placeholder 在 256px 中截断/拥挤，输入后提示消失，筛选条件没有持久可见标签。
- 手机端筛选卡高 172px，四个控件堆叠，但“新建公司”仍被放在卡片底部右侧，和表单区距离很远。

**修复方向**

- 搜索框缩短为“搜索公司名称”，旁边放一个 text link“搜索”；状态筛选保持 `SteepSelectTrigger`，可以加“全部状态”可见标签。
- “新建公司”移出筛选卡，放到 `PageHeader actions` 作为唯一 primary CTA。
- 筛选卡内控件统一 44px 高、16px 圆角、15px 文本，间距 8px；窄屏让搜索框全宽、其余控件一行两个。

### P1-05 颜色 token 逃逸：输入/按钮边框是 shadcn 冷灰，不是 Dove / Graphite

**位置与实测**

- `frontend/src/app/globals.css:204`：`--muted-foreground: oklch(0.554 0.046 257.417)`（冷蓝灰），被 `pagination.tsx:102,122` 的 `text-xs text-muted-foreground` 使用。
- `frontend/src/app/globals.css:208-209`：`--border` / `--input: oklch(0.929 0.013 255.508)`；实测输入框/按钮边框约 `#e5e7eb`，与白底对比 **1.24:1**。DESIGN 的边框是 Dove `#a3a6af` 或 Graphite `#777b86`。
- `frontend/src/components/ui/button.tsx:16` 与 `frontend/src/components/ui/input.tsx:11` 都带 `shadow-xs`；这是 shadcn 的小投影，不在 DESIGN 的 `--shadow-subtle` / signature 体系里。
- 页面没有直接写 `#e5e7eb`，但所有 outline 按钮和输入都继承它；这是“看起来像默认后台”的细节来源。

**影响**

- 输入框边界几乎看不见（1.24:1 低于 WCAG 非文本 3:1），用户很难判断可编辑区域。
- pagination 的冷灰文字与页面 Ink/Graphite 文字形成两套灰色，页面显得脏。
- 按钮和输入带一层来源不明的小阴影，和卡片的 `shadow-steep-sm` 叠加后，所有边界都模糊。

**修复方向**

- 在 `globals.css` 把 `--border` / `--input` 映射到 `--color-dove` 或 `--color-dove/70`，`--muted-foreground` 映射到 Graphite；不要在页面级逐个覆盖。
- 移除 Button/Input/Select 的 `shadow-xs`，由 Steep 控件统一 `shadow-none`。
- 用 `--color-*` DESIGN token 审查 `computeStyle`，确保页面不再出现 `#e5e7eb`、`oklch(0.554 … 257)` 这类冷灰。

### P1-06 可访问性：表头/次要文字对比度不足，表格缺 caption/scope，删除输入无可见标签

**实测**

| 文本 | 前景 / 背景 | 对比度 | AA 结论 |
|---|---|---|---|
| 7 个表头 | `#8b8c8d` / `#f7f7f8` | **3.15:1** | 12px 普通文字失败（需 4.5:1） |
| 联系人/电话/备注/日期 | `#777b86` / `#ffffff` | **4.23:1** | 14px 普通文字失败（需 4.5:1） |
| 输入/按钮边框 | `#e5e7eb` / `#ffffff` | **1.24:1** | 非文本控件失败（需 3:1） |
| 表头 / 侧栏 Dove | `#a3a6af` / `#ffffff` | **2.43:1** | 仅装饰性边框时勉强；不可用于文字 |

**结构问题**

- `frontend/src/app/(main)/admin/merchant/companies/page.tsx:198-204` 的 7 个 `<th>` 没有 `scope="col"`；表格没有 `<caption>`（门店页 `store-list.tsx:139` 有 `caption sr-only`）。
- `frontend/src/app/(main)/admin/merchant/companies/_components/company-delete-dialog.tsx:70-75` 的删除原因输入只有 `aria-label` + placeholder，没有可见 `<label>`；输入后 placeholder 消失，视觉用户失去字段名。
- 弹窗关闭按钮 `dialog.tsx:64` 图标 16×16，实际点击热区也小；行内编辑/删除 32px 高、分页按钮 32×32，低于常见的 44×44 触控建议（后台桌面可接受，但需要明确）。
- `page.tsx:190` 的错误是裸 `<p>`，没有 `role="alert"` 或 `aria-live`；加载态也没有对表格更新进行播报。

**影响**

- 低视力用户读不出表头/次要信息；键盘用户虽然能聚焦按钮，但表格没有 caption/scope，屏幕阅读器无法建立列与数据的关系。
- 删除原因输入在视觉上只有一行占位文本，缺少字段标签，是典型“placeholder 当 label”的 AI 表单痕迹。
- 错误/加载的变化没有可访问通知。

**修复方向**

- 表头 14/450 Graphite（提升对比度），次要文字改 Ash/Graphite 的更深一档；输入边框改 Dove/70。
- 表格加 `<caption class="sr-only">公司列表</caption>` + 每个 `<th scope="col">`。
- 删除原因加可见 `<label>`“删除原因”+ Rust 必填星号；输入框用 `SteepInput` 或至少 44px/16px 圆角。
- 错误区加 `role="alert"`；加载区加 `aria-live="polite"`；所有图标按钮加 `aria-label` 并保证 ≥32px 热区。

### P1-07 分页：只有 1 页却铺满 6 个 outline 按钮，12px 文案 + 第二个 Ink 实心

**位置与实测**

- `frontend/src/app/(main)/admin/merchant/companies/page.tsx:249-258` 即使 `total=8 / pageSize=20` 也渲染 `Pagination`；`totalPages` 被 `Math.max(1, ...)` 固定成 1。
- `frontend/src/components/common/pagination.tsx:118` 容器 `px-2 py-2 sm:py-4`；`:102/122/151` `text-xs`；`:137` SelectTrigger `h-8 w-[70px]`；`:156-218` 首/尾/上/下/页码全 `variant="outline"` `h-8 w-8`，当前页 `bg-ink text-white`。
- 1024 时表格卡只剩 336px，分页“每页”被挤成上下两行；390 时整条分页在 880px 卡片内，屏幕上不可见。
- 空态、加载态、错误态都显示“暂无数据 / 1 / 1 / 黑页 1”。

**影响**

- 只有 1 页时仍然出现 6 个按钮，是模板式噪音；用户会以为可以翻页。
- 当前页 Ink 实心是页面上最重的“按钮”，但对只有一页的列表毫无意义。
- 12px 分页文字与 P0-04 的类型问题叠加；1024 的“每页”换行进一步破坏卡片底部节奏。

**修复方向**

- `total <= pageSize` 时只显示“共 8 家公司”文本，不渲染分页控件；空态/错误态隐藏分页。
- 必须分页时，页码用 14px、Fog 底/Ink 文字；当前页不用 Ink 实心，改用底部 2px 短线或 Fog 胶囊。
- 分页容器在窄表格中换行策略改为 `flex-wrap` 或直接隐藏 page size 选择器。

### P1-08 删除弹窗：10px 圆角 + 18/600 标题 + 无可见标签的原因输入

**位置与实测**

- `frontend/src/app/(main)/admin/merchant/companies/_components/company-delete-dialog.tsx:62`：`DialogContent className="sm:max-w-[440px]"`；`frontend/src/components/ui/dialog.tsx:55` 默认 `rounded-lg border p-6 shadow-lg`，实测 440×240、radius 10px；`:99` 标题 `text-lg leading-none font-semibold`，实测 18px / 600 / line-height 18px。
- 输入 `company-delete-dialog.tsx:70-75`：只有 `aria-label="删除原因"` + `placeholder="请填写删除原因（必填）"`；输入框 36px / radius 8px。
- 底部两个按钮 `:79-84` 都是 36px / radius 8px：取消 outline、确认删除 default（Ink 实心），没有 pill / 15/450。
- 移动端实测 358×284，按钮 308×36 全宽，`确认删除` 在 `取消` 上方（`DialogFooter` 的 `flex-col-reverse`）；关闭按钮 16×16。

**影响**

- 10px 圆角低于 DESIGN 的“不得低于 12px 尖角”，`shadow-lg` 不是 signature shadow，18/600 是禁止的字重；弹窗和页面卡片像两个系统。
- 用户输入前看到的是占位文字，输入后没有字段名；错误时只在下方出现一行 14px Rust 文本，缺少字段级反馈。
- 移动端按钮全宽堆叠、确认在取消上方，和页面表单（保存左、取消右）不一致，容易误触。

**修复方向**

- 用统一的 `SteepDialog`/`Sheet` 封装：`rounded-cards`（24px）、`shadow-steep`、`p-6`；标题 18/450 或 22/450、行高 1.25–1.35。
- 原因字段用可见 label + 必填星号；输入框 44px / 16px 圆角；错误放在字段下方并 `aria-describedby` 关联。
- 按钮用 15/450：取消为 text link；确认删除为唯一 filled，但需要明确危险语义（Rust 文字或 Apricot Wash 底，不用饱和红）。
- 移动端按钮改为 44px 高、上下间距 8px，确认/取消顺序与页面主表单一致。

## 5. P2（中优先）

### P2-01 页面垂直节奏 24px，不是 DESIGN 的 80px section gap

`frontend/src/app/(main)/admin/merchant/companies/page.tsx:157` 使用 `gap-6`（24px）连接标题、筛选卡和列表；1440 实测筛选卡 y=134.5、表格卡 y=234.5，筛卡底 210 到表格顶 234.5 仅 24.5px。`DESIGN.md:117-120` 写的是 section gap 80px，同产品门店页使用 `gap-10 lg:gap-20`（40/80px，`stores/page.tsx:121`）。影响：页面像压缩的 CRUD 模板，标题、筛选、数据之间没有呼吸。建议至少 `gap-10 lg:gap-20`；若 80px 只适用于营销页，需要在 DESIGN 中写清后台的 section gap，不能靠页面各自猜。

### P2-02 表单卡标题只有 14/500，和字段标签 14/400 几乎同权

`frontend/src/app/(main)/admin/merchant/companies/page.tsx:262` 的 `text-sm font-medium` 实测 14px/500；`Field` 标签是 14px/400（`field.tsx:25`）。影响：卡片内的“新建公司/编辑公司”不像 section title，用户先看到的是输入框而不是表单区域。建议改为 18/450 或 22/450，并使用 1.25–1.35 行高；字段标签仍保持 14/400 Graphite。

### P2-03 文案不一致：搜索/查询两个动词、placeholder 过长、布局方向写死

具体问题：

- `page.tsx:167` placeholder `按公司名称搜索（留空显示最新）` 20 个字符，`page.tsx:184` 按钮却写 `查询`；同一动作两个动词（搜索 vs 查询），且“最新”没有说明按什么字段排序。
- `page.tsx:245` `暂无公司，可在右侧新建` 写死“右侧”：390/768 单列时表单在下方且被裁掉，文案指错方向。
- `company-delete-dialog.tsx:66` 使用“软删除”这种实现术语；对管理员应说“删除后记录仍保留，可在审计日志追溯”。
- 页面标题 `公司管理` 是通用动词短语，和同模块的 `门店列表` 不一致；`公司` / `公司列表` 更贴近列表页任务。

建议：搜索框 `搜索公司名称`，按钮 `搜索`；空态 `暂无公司，点击「新建公司」添加`；删除描述去掉“软删除”；标题统一为 `公司列表`。

### P2-04 动效与交互状态是 shadcn 默认：`transition-all` + 冷灰 hover

`frontend/src/components/ui/button.tsx:8` 的基础类含 `transition-all`，`:16` 的 outline hover 使用 `hover:bg-accent`（shadcn 冷灰），不是 DESIGN 的 Ink/Fog/Rust 语言；`input.tsx:11` 与 `select.tsx:37` 带 `shadow-xs`、`transition-[color,box-shadow]`。本页没有覆盖 hover/active/focus 状态。影响：所有按钮在 hover 时变成默认 cold-gray，和页面的暖灰体系脱节；`transition-all` 也会让非颜色属性产生不必要的动画。建议删除 `transition-all`，用 `transition-[color,background-color,opacity]`；hover 只改背景/文字色；行 hover 可参考门店页 `hover:bg-fog/60`。

### P2-05 表格分隔线过重，行没有交互反馈

`page.tsx:209` 每行 `border-t border-dove`（全不透明 Dove），对比门店页 `store-list.tsx:165` 的 `border-dove/40`；在 1440 截图里横线明显压过 12px 表头，成为表格里最重的视觉元素。行本身没有 hover/focus 状态（`tr` 没有 `hover:bg-fog/60`），编辑/删除按钮却要求用户逐行寻找。建议使用 `border-dove/40`，行 hover `bg-fog/60`，或把整行点击与键盘焦点做成一致的操作入口。

## 6. 为什么它看起来“AI 味”

1. **默认组件皮肤 + 一个大衬线标题**：这是最典型的“AI 生成后台”结构：`PageHeader` 的 44px Signifier 让第一眼有点设计感，但其下所有按钮、输入、表格、分页都是 shadcn 原样，设计只停留在标题上。
2. **所有东西都是白色圆角矩形 + 弱阴影**：三张卡全白、页面全白、阴影用更弱的变体；没有 Fog 画布、没有材质层次，只有边框和淡阴影在撑结构。远看干净，近看没有产品个性。
3. **动作铺满屏幕**：26 个按钮里 24 个 outline，查询、新建、编辑、删除、分页全部同权重；AI 常用“每个动作都做成按钮”来避免设计决策，这里正是如此。
4. **状态被装饰化**：8 行全是同一个 Sky Wash 胶囊，重复的最强色块不携带信息；同时加载/错误/空态都堆在同一块表格区域里，用同一套占位文案。AI 页面常常“有状态组件”但没有状态设计。
5. **数据排版是机器默认值**：`toLocaleString("zh-CN")` 输出带秒的斜杠时间，行高随内容跳动，联系电话 72px 被挤成两行，12px 表头在 1440 已难读；这些不是内容问题，是没人决定“数据表应该怎么读”。
6. **文案是占位符语气**：`按公司名称搜索（留空显示最新）`、`暂无公司，可在右侧新建`、`软删除`；每句都像开发者临时写在组件里的说明，而不是产品文案。
7. **模板结构**：筛选卡 + 表格 + 右侧常驻表单是通用 admin 模板，换掉“公司”二字可以用于任何实体；DESIGN 的产品性格（Fog 画布、圆角、微字重、Rust 语气）没有进入页面。

需要强调：页面没有紫色渐变、emoji、发光、玻璃拟态这些“显性 AI 装饰”，所以问题更隐蔽——**它是结构性的 AI 味：默认值 + 无决策 + 同权动作 + 装饰性状态。**

## 7. 建议修复顺序

### Phase 0 — 基础层（不改业务逻辑）

1. 页面根节点 `min-h-screen bg-fog`；三张卡统一 `bg-pure-white shadow-steep`。
2. 全页控件切换到 `SteepButton` / `SteepInput` / `SteepSelectTrigger`；按钮 9999、输入 16px 圆角、15/450。
3. 统一 CTA：`PageHeader actions` 放唯一 `SteepButton variant="primary"` “新建公司”；查询/行内操作/分页改 text link。

### Phase 1 — 信息架构与响应式

1. 删除右侧常驻表单，改为点击“新建公司/编辑”打开 Sheet/Dialog；表格恢复全宽。
2. 表格 `table-fixed` + `colgroup` + 84px 行高；在 `xl` 以下隐藏备注/创建时间，`md` 以下改卡片列表。
3. 筛选区重排：搜索 + 状态 + 搜索 text link；新建移出筛选卡。

### Phase 2 — 数据与状态

1. 表头 14/450、正文主 15/450 / 次 14/400；删除所有 12px 例外（分页也改 14）。
2. 正常状态改中性点/文字；停用用 Apricot Wash + Rust；状态列只保留异常色。
3. 状态机：loading 骨架、error alert + 重试、empty 单文案 + 隐藏分页；过滤时关闭编辑态。
4. 日期统一格式 + `tabular-nums`；长公司名/备注截断 + tooltip。

### Phase 3 — 验收

1. 1440 / 1024 / 768 / 390 四断点截图，确认表格操作列、表单、空态文案均在视口内且可操作。
2. `document.fonts.check`、`getComputedStyle` 关键节点、按钮计数（filled=1）、12px 节点数（0）写成断言。
3. 键盘 Tab 走查搜索 → 筛选 → 表格操作 → 分页 → 表单；检查 `scope` / `caption` / `role="alert"`。
4. 与门店页的 Fog 画布、Steep 控件、表格行高做并排视觉对照。

## 8. unslop signs 全组审计

按 `.agents/skills/unslop/references/signs.md` 的分组逐组结论（每组均给出 sign + where + fix；无命中也要说明）：

| 分组 | 结论 | 本页具体表现 / 修复 |
|---|---|---|
| Surfaces and color | **Fail** | 白画布 + 白卡、`shadow-steep-sm`、shadcn 冷灰 `#e5e7eb` 边框、8 个 Sky Wash 胶囊；→ Fog canvas、`shadow-steep`、Dove 边框、状态中性化 |
| Type | **Fail** | 7 个 12px/400 表头、分页 12px、只有 400/500/600、Dialog 18/600；→ 14 起跳、14/450 表头、15/450 主值、禁用 600 |
| Icons | **Pass** | 页面本身没有自造图标；壳层图标为 18px、1.5px 描边，与 DESIGN 的 16–20px 1.5–2px 一致；无 emoji / 混搭图标集 |
| Spacing | **Fail** | `gap-6` 24px vs section 80；表格行高 57/65；表单 Select 80px vs Input 320px；表格卡 p0 → 24/80、84px 行高、全宽控件、p5 |
| Copy | **Fail** | “搜索/查询”混用、20 字 placeholder、“右侧新建”、“软删除”；→ 动词统一、短 placeholder、无方向文案、产品语言 |
| Components | **Fail** | Button / Input / Select / Dialog 全默认；24 outline；分页 1 页仍显示；→ Steep 控件 + 唯一 filled + text links + 隐藏空分页 |
| Landing pages and heroes | **N/A** | 后台 CRUD 页面，无 hero/营销区；不存在 hero 渐变、浮卡、装饰性插画问题 |
| Visuals | **Pass** | 无渐变文字、光晕、blob、玻璃拟态、3D 装饰；视觉问题来自组件和排版，不是装饰堆砌 |
| Motion | **Fail（轻）** | `transition-all`、shadcn `hover:bg-accent`、`shadow-xs`；无循环动画、无 hover scale（这部分通过）→ 只过渡颜色/背景/透明度 |
| Template look | **Fail** | “44px 衬线标题 + 筛选卡 + 表格 + 右表单”可套任何 admin 实体；→ Fog 画布 + Steep 控件 + 抽屉任务流 + 数据排版 |

## 9. 证据截图

### 1440：表格操作列被裁掉，8 个蓝色状态胶囊成为主视觉

![1440 公司列表](screens/01-desktop-1440.png)

### 1024：表格卡只剩 336px，只显示前 3 列

![1024 公司列表](screens/02-desktop-1024.png)

### 768：表格卡和表单卡都撑到 880px，右侧被硬裁

![768 公司列表](screens/03-desktop-768.png)

### 390：首屏只露出前 3 列，表单卡超屏

![390 公司列表](screens/04-mobile-390.png)

### 编辑态：状态 Select 80px，其他输入 320px

![编辑公司表单](screens/05-edit-1440.png)

### 删除弹窗：10px 圆角、18/600 标题、无可见标签的原因输入

![删除公司弹窗](screens/06-delete-dialog-1440.png)

### 移动端空态：880px 表格里的“暂无公司”被居中到屏幕外

![移动端空态](screens/07-empty-mobile-390.png)

### 加载 / 错误态：加载中仍显示“暂无数据 / 1 / 1 / 黑页 1”

![加载态](screens/08-loading-1440.png)

![错误态](screens/09-error-1440.png)

### 桌面空态：搜索无结果时“没有符合条件的公司”与分页“暂无数据”同时出现

![桌面空态](screens/11-empty-1440.png)

### 移动端删除弹窗：按钮全宽堆叠，确认删除在取消之上

![移动端删除弹窗](screens/12-delete-dialog-390.png)

### 同产品门店页参考（不是契约，只用于证明组件语言已存在）

![门店页参考](screens/10-stores-reference-1440.png)

## 10. 证据文件

- [companies-metrics.json](evidence/companies-metrics.json)：1440 下 body/h1/td/button 计算样式、表头、行高、按钮计数、12px 节点、表格滚动宽度。
- [companies-breakpoints.json](evidence/companies-breakpoints.json)：390 / 768 / 1024 / 1440 的主区、筛选卡、表格卡、表单卡、grid、table、wrap、行高、按钮计数。
- 截图目录：[`screens/`](screens/)

## 11. 审查边界与不确定性

- **未做像素级 diff**：没有 Figma 或经批准的像素基线；报告只基于 `DESIGN.md` 的 token、源码和浏览器计算样式。
- **未跑完整 axe 扫描**：可访问性结论来自 DOM/ARIA 检查、`:focus` 实测和手动对比度计算，不能声称覆盖全部 WCAG。
- **hover / active / disabled 未全部截图**：按钮 hover 来自 `button.tsx:16` 的默认 `hover:bg-accent`，未逐个截取；删除弹窗的原因输入 focus ring 已在截图中实测。
- **dark mode / reduced-motion / 200% zoom 未测**：`DESIGN.md` 未给后台定义暗色模式，暂不判定；200% zoom 下可能出现新的表格溢出，需在 Phase 3 补测。
- **测试数据放大折行**：`SHOT1793630391869公司`、`DBG179363...` 是测试生成数据，真实公司名可能更短；但“长名称必须优雅截断”仍是表格设计义务，不能把问题归咎于数据。
- **Next.js 开发工具 `N` 圆球**：截图右上角的黑色 N 是 dev overlay，不是页面元素，不计入设计问题。
- **画布条款存在内部张力**：`DESIGN.md:214` 的 Surface 表把 Canvas `#ffffff` 定义为 page background，而 `:226` / `:245` 描述产品 dashboard 是 Fog canvas + white cards；本报告采用产品壳层的 Fog 读法（并以门店页现有实现为佐证），但建议设计 owner 把后台页面的 Canvas / Fog 用法写死，避免继续双读。
- **Section gap 80 的适用范围**：`DESIGN.md:117-120` 在 Layout 里写 80px，但未明确是营销 section 还是后台 section；本报告按同产品门店页的 `gap-10 lg:gap-20` 将其列为 P2，最终需要设计确认。
- **`shadow-steep-sm` 存在于 `globals.css:173-175`，但不在 DESIGN.md**：按“DESIGN.md 单契约”判为 token 逃逸；若它其实是被批准的 secondary shadow，需要先补进 DESIGN，再在页面中使用。
- **未检查真实 401 / 网络超时 / 并发写入**：错误态通过拦截 500 验证；请求竞态（`requestSeq`）存在源码保护，但不在本次视觉审查范围。

## 12. 后续修复记录（2026-11-06）

本报告的修复项已执行并完成验证：页面改为 Fog 画布 + 白色卡、唯一 Ink 主按钮、24px 卡片/16px 输入/9999 胶囊、去 12px 文本、桌面表格重排 + 移动卡片、Sheet 表单、统一状态语义、加载/空/错误态分离。改动未涉及后端接口。

- 修复验证：[verification/README.md](verification/README.md)
- 修复前后截图：`screens/`（修复前）与 `verification/`（修复后）
- 静态检查：`pnpm typecheck`、`pnpm lint`、`pnpm build` 均通过
