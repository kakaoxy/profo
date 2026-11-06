# `/admin/merchant/stores` 设计批判（DESIGN.md 单契约）

> 本报告只以仓库根目录 `DESIGN.md` 为视觉与交互契约，不把旧页面、shadcn 默认值或“看起来还行”当作豁免理由。审查目标是「找出所有偏离与 AI 味」，不是改页面。
>
> **修复状态（2026-11-06）：已按本报告完成修复，验证见 [FIX-VERIFICATION.md](./FIX-VERIFICATION.md)。**

| 项目 | 内容 |
|---|---|
| 审查日期 | 2026-11-06 |
| 审查路由 | `/admin/merchant/stores`（门店列表） |
| 对照契约 | `DESIGN.md`（537 行，Web 条款） |
| 审查方式 | 源码逐行审查 + Playwright 真实渲染（390 / 768 / 1024 / 1280 / 1440）+ `getComputedStyle` / `getBoundingClientRect` + `document.fonts` 字体核验 |
| 原始度量 | [`evidence/stores-metrics.json`](evidence/stores-metrics.json)（h1/筛选/按钮/表格/行高/抽屉/弹窗计算样式） |
| 结论 | **Fail — 6 个 P0 / 10 个 P1 / 10 个 P2** |
| 页面代码改动 | 审查时无；后续修复见 [FIX-VERIFICATION.md](./FIX-VERIFICATION.md) |

## 0. 一句话结论

**这不是“配色丑”或“渐变、emoji 太多”的问题，而是页面把 shadcn 默认组件直接穿在身上，同时失去 DESIGN 的字体、尺度、动作层级和状态语言。** 远看是干净后台，近看是：字体链断裂、按钮/输入全是 8px 小圆角、表格被 11 列挤成竖排、同一状态在表格和抽屉里有三种画法、次要动作铺满 outline 按钮。

先明确通过项，避免误伤：

- 页面没有紫蓝渐变、彩色光晕、emoji 标题、玻璃拟态或循环动画。
- 白色卡 + Fog 画布 + Ink 文字的主方向正确；没有把 Ink 填充滥用成普通卡片。
- 桌面 `h1` 的 44px / 400 / Source Serif 字体族正确（字距另见 P1-06）。
- 卡片 24px 圆角正确；`新建门店` 是页面唯一 filled CTA。
- `SheetTitle` / `SheetDescription`、`DialogTitle` / `DialogDescription` 均存在，删除图标按钮有 `aria-label`，这两点比常见 AI 页面好。

## 1. 判定摘要（五维）

| 维度 | 判定 | 直接原因 |
|---|---|---|
| 视觉语言 | **Fail** | Sohne/Inter 未生效；12/13px 小字和 700 表头；8px 控件圆角；卡片阴影不是 DESIGN token |
| 组件一致性 | **Fail** | Button / Input / Badge / Dialog / Sheet 全部使用 shadcn 默认形态，页面没有自己的组件语言 |
| 信息层级 | **Fail** | 11 个筛选控件同权重；11 列表格没有列策略；每行同时有整行点击、店名链接、“详情”按钮 |
| 响应式 | **Fail** | 1024 已裁掉操作列，390 首屏只剩两列；移动标题 34px 低于 40px 下限 |
| 状态与可访问性 | **Fail** | 同一状态三种画法；加载/错误/空态没有恢复路径；可点击行不可键盘操作；两个 Select 无可访问标签；Graphite 小字对比度不足 |
| 无 AI 装饰 | **Pass** | 没有渐变文字、彩色光晕、blob、emoji、循环动画 |

## 2. 契约 vs 实际（硬指标）

| 契约项 | `DESIGN.md` | 本页实际 | 结果 |
|---|---|---|---|
| 页面最大宽度 | 1200px（L117） | 1440 视口内容区 1312px；`PageContainer` 的 `max-w-400` 注释直言“不设宽度上限” | **Fail** |
| 正文字体 | Sohne（当前仓库以 Inter 替代）；14–26px，body/UI 常用 15–18px | 实际 `ui-sans-serif, system-ui`；Inter `unloaded`、`document.fonts.check('16px Inter') === false` | **Fail** |
| 标题 | Signifier 44/64/90，400，44px 字距 -0.015em | 44/400，但 computed `letter-spacing: -1.1px`（-0.025em）；移动 34px | **Fail** |
| 字号 | Type Scale 最小 caption 14px；13px 仅限 DESIGN 明确局部用途（头像 L172 / 数据卡 caption L187 / 侧栏分组 L249） | 12px 文本节点 62 个；13px 用于筛选 label、抽屉 section label、`Field` label | **Fail** |
| 字重 | 仅 400/430/450/480/500 | 表头 12px/700；Dialog 标题 18px/600 | **Fail** |
| 按钮 | 9999px、Sohne 15/450、8px 20px padding | 8px、14/500、36px 高；实际 padding 8/12 或 8/16 | **Fail** |
| Input | 16px 圆角 | 8px 圆角、36px 高、14px 文本 | **Fail** |
| 卡片 | 24px 圆角、20–24px 内边距、唯一三层阴影 | 24px 圆角；筛选卡 p20；表格卡 p0；阴影是自造 `shadow-steep-sm` | **部分 Fail** |
| 次要动作 | text links，不是 ghost / outline buttons | 单页 DOM 内最多 28 个 outline 按钮（12 行 × 2 + 导出/查询/分页） | **Fail** |
| 状态 | 同一状态同一视觉语言 | 表格“正常”是纯文本；抽屉“正常”是 Rust 空心 badge；“已转正”表格 positive、抽屉 neutral；“合作状态”抽屉永远 neutral | **Fail** |
| 表格行 | 4px 网格上的稳定节奏 | 实测行高 61 / 77 / 81 / 97px 混排 | **Fail** |
| 侧栏 | Fog、约 240px、16px 图标 + 15px Sohne | 默认 68px icon rail；nav 14.5/450，图标 18px | **Fail** |
| 主题色 | 唯一强调色 Rust；禁止饱和红/绿/蓝 chrome | 错误态 `text-error` = `#ef4444`，饱和红；focus ring 为 shadcn 冷蓝灰 | **Fail** |
| 装饰 | 无渐变、无 glow、无 emoji | 通过 | **Pass** |

## 3. P0（阻断级）

### P0-01 正文字体链断裂：全页正文实际不是 Sohne / Inter

**位置**

- `frontend/src/app/layout.tsx:36`：`<body className="... font-(--font-sohne) antialiased">`
- `frontend/src/app/globals.css:160-162`：`--font-sohne` 只定义在 `@theme inline`
- `frontend/src/app/globals.css:346-350`：`body { font-family: var(--font-sohne); }`

**实测**

```text
body.class = "inter_...variable sourceserif_...variable font-(--font-sohne) antialiased"
getComputedStyle(document.body).fontFamily
  = 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", ...'
getComputedStyle(document.body).getPropertyValue('--font-sohne') = ''
document.fonts.check('16px Inter') = false
Inter fontFace status = unloaded
Source Serif fontFace status = loaded
```

`@theme inline` 不会把变量输出到 `:root`；`body` 上的 `font-(--font-sohne)` 和 CSS 里的 `var(--font-sohne)` 都取不到值，最终回退系统 UI 字体。`globals.css:362-364` 的注释已经承认 `--font-signifier` 有同样问题，但 `--font-sohne` 没有修。

**影响**

- 只有 `h1` 使用了正确的 Source Serif；按钮、表格、筛选项、抽屉、弹窗、分页全部是系统无衬线。
- 所有按 Sohne 15/450 设计的字重、字宽、字距在真实渲染中都不成立；页面看起来“像默认后台”，这是第一根因。
- 这个问题在 `docs/To-Do/2026-10-27-前端设计审查报告.md:162` 的 B-06 已记录，至今未修复；本页只是把它放大到所有 UI 文本。

**修复方向**

- 在 `body` 直接使用 `font-family: var(--font-inter), ui-sans-serif, system-ui, ...`，或建立有效的 `--font-sohne` 映射。
- 移除无效的 `font-(--font-sohne)` 类。
- 增加可执行断言：`document.fonts.check('16px Inter') === true`，关键元素 computed `font-family` 含 `Inter` / `Source Serif`。
- 如果长期要 Sohne，需设计确认字体授权；如果继续用 Inter，需把 DESIGN 的字体声明改成可执行的替代策略。

### P0-02 基础组件被 shadcn 默认值统治：按钮、输入、徽章、弹层

**位置与实测**

| 组件 | 源码 | 实测 | DESIGN |
|---|---|---|---|
| Button | `frontend/src/components/ui/button.tsx:6-28` | `rounded-md` 8px、`text-sm` 14/500、`h-9` 36px、`px-4` 16 | pill 9999、15/450、8px 20px |
| Input | `frontend/src/components/ui/input.tsx:10-25` | `h-9` 36px、`rounded-md` 8px、桌面 14px | 16px 圆角、15px 文本 |
| Badge | `frontend/src/components/ui/badge.tsx:8-18` | `rounded-full`、约 22px 高、12px/500 | 标签圆角可，但字号最低 14 |
| Dialog | `frontend/src/components/ui/dialog.tsx:54-74` | 10px 圆角、1px 边框、`shadow-lg`、标题 18/600 | 禁止低于 12px 的尖角；无 18/600 标题档 |
| Sheet | `frontend/src/components/ui/sheet.tsx:45-73` | 0 圆角、`shadow-lg`、默认 `font-semibold` | 卡片语言应为 24px / 三层阴影 |

**为什么这是 P0**

这不是个别页面写错 class，而是整个页面的控件词汇不属于 DESIGN。即使页面把标题、文案、颜色改对，按钮和输入仍是“默认 shadcn 后台”，不可能达到契约。

**影响**

- 整页交互元素统计为 49 button / 29 link，视觉基座全部偏离；任何局部的 `rounded-cards` 都救不了。
- 删除弹窗的 10px 圆角、18/600 标题、`shadow-lg` 是三个同时可见的违约点。
- 右侧抽屉的 `shadow-lg` 无圆角，与页面卡片的三层阴影并列时像两个不同产品。

**修复方向**

- 不要在 `page.tsx` 里逐个传 className 打补丁；建立 `components/custom` 的 Steep Button / Input / Badge / Dialog 封装，或通过受控的全局 token 层映射 shadcn variants。
- 遵守 AGENTS.md 的约束：不直接改 `components/ui/` 源码，优先 `cn()` 覆盖 + custom wrapper。
- 验收：按钮 `border-radius: 9999px`、15/450、padding 8/20；Input `border-radius: 16px`；Badge 文本不低于 14；Dialog 圆角不低于 12、标题不出现 600。

### P0-03 字阶碎裂：62 个 12px 节点 + 11 个 700 表头 + 13px 标签

**证据**

- 1440 计算样式分布：14/400×118、14/500×31、**12/400×26、12/500×25、12/700×11**、16/400×14、14.5/450×11、13/400×2、15/400×1、44/400×1。
- `page.tsx:267`：`thead className="bg-fog text-left text-xs text-graphite"`，浏览器默认给 `th` 700，所以表头是 **12px/700**。
- `page.tsx:300/303/313/341/346`：地址、去审核、商圈、来源、最近拜访均 `text-xs` 12px。
- `page.tsx:188/212`：筛选 label 13px；`page.tsx:199/220`：“至”12px。
- `store-drawer.tsx:205`：描述 13px；`:234/349`：section label 13px + `tracking-wide`；`:323-372`：`dt` 12px。
- `frontend/src/app/(main)/admin/_components/field.tsx:25`：所有 Field label 13px；hint `text-xs` 12px。
- `body { letter-spacing: -0.009em }` 在 16px 上计算成固定的 `-0.144px` 后被后代继承；12px 文本实际得到约 `-0.012em`，不是设计要求的 -0.009em，小字更紧。

**为什么违反**

- `DESIGN.md:59-70` 的 Type Scale 最小档是 caption 14px；`:51-57` 的 Sohne 字重只有 400/430/450/480/500；`:253-263` 明确 “Never bold Sohne”。
- 12px/700 的表头同时违反字号、字重和层级；13px 在 DESIGN 中只用于头像、数据卡 caption、侧栏分组等局部（L172 / L187 / L249），不应扩展成页面筛选、抽屉 section、Field 的通用 label 尺寸。

**影响**

- 表格看起来像数据库导出：表头比正文更黑更小，字号层级倒置。
- 12px + Graphite 的地址/来源/日期在 Fog 上实测约 **3.95:1**，低于 WCAG AA 4.5:1；12px 又进一步降低可读性。
- 抽屉的 13px section label 加 `tracking-wide`（约 +0.325px）与 Sohne 的 -0.009em 方向相反，显得松散、像后台原型。

**修复方向**

- 表头 14/500（不要 700）；正文/表格 meta 最低 14；Badge 最低 14。
- 抽屉 section label 改为 14/500，去掉 `tracking-wide`；`dt` 改 14。
- 移动端标题不使用 34px（见 P1-06）。
- 不要在 `body` 上用会继承成绝对值的 `em` 字距；按元素设置 `letter-spacing: -0.009em`，或统一在 16px 基准上计算。

### P0-04 11 列表格在 1440 已竖排，在 1024 已裁掉操作列

**位置**

- `page.tsx:266`：`<table className="w-full min-w-[960px] text-sm">`
- `page.tsx:269-279`：11 个 `th` 全部只有 `px-4 py-3`，没有列宽、`whitespace-nowrap`、`truncate` 或固定布局。
- `page.tsx:284-290`：行 `cursor-pointer`；`:352-373`：行尾“详情”+ 删除按钮。

**实测**

- 1440：列宽 362 / 193 / **76** / 86 / 86 / 67 / 64 / 59 / 120 / 68 / 132。区域/商圈只有 76px，表头被拆成多行；“浦东新区”被拆成 3 行。
- 行高：`97 / 97 / 97 / 97 / 97 / 81 / 61 / 81 / 77 / 61 / 77 / 61px`，同页列表行高相差 36px。
- 1024：内容区约 896px，表格 `min-width: 960px` 超宽；“详情”按钮只露出半个，删除按钮完全在裁切区外。
- 390：表格仍为 960px，首屏只看到“门店 / 公司”两列，横向滚动无提示。

**影响**

- 信息没有被“设计”，只是把数据库字段横着排；扫描成本高、操作不可达。
- 表头竖排和行高抖动是用户对“AI 后台模板”最敏感的信号之一；这里不是审美问题，已经影响可操作性。

**修复方向**

- 先做列策略：首屏保留门店、合作状态、审核、负责人、最近拜访、操作（6–7 列）；公司、来源、经纪人、门店状态移入抽屉/展开行。
- 表头 `whitespace-nowrap`；列设定最小宽度；名称/地址 `truncate` + title/详情；数字列右对齐。
- < 1024 时改卡片式记录列表或冻结首列/操作列，不要让用户在没有提示的情况下横向找按钮。
- 验收：1440 无竖排表头；1024 所有操作可达；390 无需隐藏操作即可完成详情/删除。

### P0-05 状态语义自相矛盾：同一门店在不同位置有三种画法

**位置**

- `page.tsx:315-326`：合作状态 `cooperated → positive`，`negotiating → attention`，其余 neutral。
- `page.tsx:328-339`：审核 `pending → attention`，`approved → positive`，其余 neutral。
- `page.tsx:349`：门店状态“正常”是纯文本，没有 badge。
- `store-drawer.tsx:208-218`：
  - 门店正常 `positive`；
  - 审核 `pending → attention`，其余 **neutral**（所以 approved 在抽屉是灰的）；
  - 合作状态 **永远 neutral**（所以表格里的 positive/attention 在抽屉全变灰）。
- `status-badge.tsx:11-15`：neutral 是 secondary 灰、attention 是 Apricot + Rust、positive 是 **Rust 空心描边**；positive 和 attention 共用 Rust 色相。

**具体矛盾**

| 门店状态 | 表格 | 抽屉 |
|---|---|---|
| 门店正常 | 纯文本“正常” | `positive` Rust 空心 badge |
| 审核已转正 | `positive` Rust 空心 badge | `neutral` 灰 badge |
| 合作洽谈中 | `attention` Apricot 底 | `neutral` 灰 badge |
| 合作已合作 | `positive` 空心 | `neutral` 灰 |

**影响**

- 用户无法建立“颜色/形状 → 状态”的稳定记忆；同一个“已转正”在列表里是强调色，在详情里是低权重灰色。
- positive（Rust 描边）和 attention（Rust 字 + Apricot 底）都使用 Rust，视觉上无法靠色相区分“正向”和“待处理”，只剩填充方式差异。
- `StatusBadge` 的 12px 字/22px 高度进一步压低权重（同时命中 P0-03）。

**修复方向**

- 建一个单一映射：`getStatusBadge(status, domain) -> {label, tone}`，表格、抽屉、弹窗共用。
- 在 DESIGN 色板内定义三档：neutral = Fog/Graphite，attention = Apricot/Rust，positive = Sky Wash/Ink（或经设计确认的中性 positive），禁止 positive 与 attention 共用 Rust 主色。
- 同一字段在所有 context 使用同一组件；不要让“正常”在表格是文本、抽屉是 badge。
- 加一条最简回归：同一个 mock store 在列表和抽屉截图里 badge 的 label / tone class 必须完全一致。

### P0-06 响应式：不是“折行”，而是操作被裁掉

**位置**

- `page.tsx:266` `min-w-[960px]`；`page-container.tsx:23` 无宽度上限；`page-header.tsx:34` 移动 34px。
- `page.tsx:138` 筛选 `flex flex-wrap`，没有断点级重排或折叠。

**实测**

| 视口 | 内容宽 | 表格表现 | 筛选 | 标题 |
|---|---:|---|---|---|
| 1440 | 1312 | 11 列勉强排下，4 个表头竖排 | 2 行，查询落在第 2 行靠左，右侧约 495px 空 | 44px |
| 1280 | 1152 | 更挤，仍无横向提示 | 2 行 | 44px |
| 1024 | 896 | 960px 表格溢出；“详情”半露，删除不可见 | 3 行 | 44px |
| 768 | 672 | 960px 表格横向裁切 | 4 行 | 44px |
| 390 | 358 | 首屏只露“门店 / 公司” | 8 行纵向堆叠，日期 `mm/dd/yyyy` | **34px** |

**影响**

- 1024 是常见笔记本宽度，删除操作直接不可达；390 用户看不到“合作状态/审核/操作”，必须猜测可横向滑动。
- 移动端标题 34px 明确低于 `DESIGN.md:189-207` 的 “Signifier 不低于 40px”；`page-header.tsx:18-22` 的注释还写“34px 对齐不低于 40px”，是自我矛盾。
- 筛选在 390 占掉约 8 行，把真正的数据推至首屏之外。

**修复方向**

- 表格：桌面列策略 + 移动卡片化；不允许核心操作进入水平滚动盲区。
- 筛选：移动端改为“搜索 + 筛选（n）”抽屉；桌面把次要筛选收进 popover。
- 标题：移动保持 44px（或设计确认的 40px 最低档），不要 34px。
- 验收：1024 和 390 各截一张图，确保详情/删除/状态均无需横向滚动即可看到。

## 4. P1（高优先）

### P1-01 版心 1600 而非 1200

- `page-container.tsx:11-24` 注释把 `max-w-400` 解释为“不设宽度上限”；1440 实测内容 x=96、宽 1312。
- `DESIGN.md:117` 明确 Page max-width 1200px。
- 这是共享组件冲突，不是本页私有 class；结果是 1440 下页面比设计更宽，表格和筛选都显得“铺满屏幕”。
- 修复：PageContainer 设 `max-w-[1200px]`，或在 DESIGN 中明确后台产品页的全宽例外；不能两边同时声称自己是契约。

### P1-02 次要动作全部做成 outline 按钮

- 页面级：导出 CSV、查询、详情、删除、上一页、下一页（`page.tsx:109-127, 254-256, 352-373, 394-406`）。
- 抽屉：编辑、取消（`store-drawer.tsx:221, 378-388`）；弹窗：取消（`store-delete-dialog.tsx:79-85`）。
- 每页满 12 行时仅行内就有 24 个 outline 按钮；整页最多 28 个 outline 同时对用户喊“点我”。
- `DESIGN.md:124-132` 要求次要动作是 text link，`DESIGN.md:189-207` 明确 “not ghost/outline buttons”。
- 修复：导出/查询/详情/编辑/取消改为 Ink text link；删除收进行尾 overflow 菜单或文本链接；分页用纯文字 + chevron；保留一个 filled “新建门店”。

### P1-03 筛选墙：11 个控件、0 个 `<label>`、7 个字段靠 placeholder/当前值

- `page.tsx:137-258` 的筛选卡没有 `<label>`；搜索、门店状态、审核状态、区县、商圈、来源、负责人 7 个字段没有可见 label。
- `page.tsx:148-170` 的两个 `SelectTrigger` 没有 `aria-label`；读屏只播报“全部状态 / 全部审核”，无法区分维度。
- 1440 下查询按钮 x=831 / y=205，落在第二行最左，右侧到卡片边界约 495px 空白；控件没有分组。
- 经纪人数量、创建日期两组有 13px 小标签，其余字段视觉权重完全相同。
- 没有“清空筛选”或 active filter chips；用户改变多个字段后无法一眼确认当前条件。
- 修复：一主搜索 + “筛选”展开；可见 label 或至少字段级 caption；日期/数量分组；查询靠右或占满行；增加清空与条件摘要。

### P1-04 卡片阴影使用自造 `shadow-steep-sm`，不是 DESIGN 三层阴影

- `page.tsx:137,260,261,264` 全部 `shadow-steep-sm`；`globals.css:169-175` 的 `--shadow-steep` 复刻了 DESIGN 的三层几何，但另造了 `--shadow-steep-sm`（0 0 0 1px + 10/20 + 3/6）。
- `DESIGN.md:109-113` 只定义一个 `subtle` 三层堆叠（token 名 `--shadow-subtle`）；没有 `sm` 变体。
- 影响：卡片表面比设计轻，白卡与 Fog 背景的层次更像普通后台，而非 DESIGN 的标志性 surface。
- 修复：统一用 `--shadow-steep`；如确需轻量版本，先在设计契约新增 token，不能代码先斩后奏。

### P1-05 侧栏：默认 68px 图标 rail，不是 240px Sohne 侧栏

- `frontend/src/app/(main)/layout.tsx:98` `<SidebarProvider defaultOpen={false}>` → 默认 68px。
- `app-sidebar.tsx:78-97`：nav 14.5px/450、图标 18px stroke 1.7、active `shadow-steep-sm`。
- `DESIGN.md:154-157`：约 240px、16px 线性图标、15px Sohne。
- 影响：页面首屏没有可读导航，只剩图标；用户需要先猜图标或展开侧栏。壳层的“默认模板感”会直接传染本页。
- 修复：默认展开 240px 或把 icon rail 定义为 DESIGN 的正式变体；nav 15/450、图标 16。

### P1-06 H1 字距与移动字号都越界

- `page-header.tsx:34` 同时写了 `tracking-[-0.015em]`，但 `.font-display`（`globals.css:360-368`）设置 `letter-spacing: -0.025em`，computed 为 `-1.1px`；44px 应为 `-0.66px`。
- 移动 `text-[34px]` 低于 `DESIGN.md:189-207` 的 40px 下限。
- 影响：桌面标题比设计更紧，移动标题却更小；同一个标题在不同断点像两个系统。
- 修复：`.font-display` 只在 64–90 使用 -0.025em；44px 用 -0.015em。移动字号改为 44（或设计确认的 40 下限）。

### P1-07 加载 / 错误 / 空态：有组件，但没有恢复路径

- `page.tsx:261`：加载时整张表消失，只剩一张 `加载中...` 小卡；没有 skeleton，表格高度塌陷，页面跳动。
- `page.tsx:260`：错误只显示后端文本，没有“重试”；如果之前已有 data，错误卡与旧表格可同时存在，用户不知道数据是否新鲜。
- `page.tsx:378-384`：空态只有“没有符合条件的门店”，没有“清空筛选”或“新建门店”。
- 没有 `aria-live` / `role="status"` / `role="alert"`，读屏用户听不到加载结束或失败。
- 修复：表格 skeleton；错误卡 + 重试；空态 + 清空筛选/新建；状态消息加 live region。

### P1-08 键盘与可访问性：整行点击不可键盘等效，两个筛选 Select 无名

- `page.tsx:284-290`：`<tr cursor-pointer onClick>` 没有 `tabIndex`、`role`、`onKeyDown`；鼠标可点整行，键盘只能 Tab 到店名链接或“详情”按钮，交互模型不一致。
- `page.tsx:148-170`：两个 `SelectTrigger` 无 `aria-label`；其余 9 个表单控件有 aria-label，这点应保留。
- `page.tsx:352-373`：删除按钮有 `aria-label`（好），但只有 Trash 图标，视觉上无“删除”文字；建议放进 overflow 菜单并保留可访问名。
- 修复：行加 `role="button"`/`tabIndex=0`/Enter/Space，或删掉整行点击、只保留店名链接；“详情”按钮改为 text link；两个 Select 补 label；删除动作有文字或菜单项。

### P1-09 错误红与 focus ring：两个非 DESIGN 的颜色逃逸

- `page.tsx:260` `text-error` → `#ef4444`，白底对比约 **3.76:1**，低于 AA 4.5；同时 `DESIGN.md:189-207` 禁止饱和红做 UI chrome。
- `globals.css:210` `--ring: oklch(0.704 0.04 256.788)`，focus ring 呈冷蓝灰；截图里删除弹窗输入框的 focus ring 就是这个颜色，不属于 Ink/Fog/Rust 体系。
- 修复：错误态用 Rust + Apricot Wash 或 DESIGN 正式错误 token；focus ring 用 Ink 或 Rust 的低透明度描边；不要把 shadcn `--ring` 留在亮色主题。

### P1-10 表格卡 `padding: 0`，不符合内容卡 20–24px 内边距

- `page.tsx:264` `Card ... gap-0 overflow-hidden py-0`；实测 tableCard padding 0。
- `DESIGN.md:115-120` Card padding 20–24px；`DESIGN.md:189-207` 所有内容卡 24px + 20px。
- 影响：表格贴边、首列表格文字与卡片边缘没有呼吸；它看起来像“表格容器”而不是 DESIGN 的内容卡。
- 修复：表格卡至少给 20px 内边距（表格可用负 margin 只让分隔线满宽，但内容必须内缩），或明确设计表格卡例外。

## 5. P2（中优先）

| ID | 问题 | 证据 | 修复 |
|---|---|---|---|
| P2-01 | 页头间距 10px，不在 4px 网格 | `page-header.tsx:37,39` `mt-2.5` / `gap-2.5`；1440 下描述与标题、动作间距均为 10 | 改 8 或 12；`gap-2` / `mt-2` |
| P2-02 | 图标与文字的间距变成 12px | `page.tsx:130,255`、`store-drawer.tsx:222` 的 `mr-1` 叠加 Button 的 `gap-2` | 删 `mr-1`，统一用 Button 的 8px gap |
| P2-03 | `RefreshCw` 用作“查询”图标，语义像刷新/重置 | `page.tsx:5,255` | 用 `Search`；重置另设按钮 |
| P2-04 | 原生日期输入显示英文 `mm/dd/yyyy` | 390/1024 截图；`page.tsx:213-226` | 自定义日期控件或中文日期选择器；至少加可见字段名 |
| P2-05 | 数字/日期没有 `tabular-nums`，经纪人数量左对齐 | `page.tsx:345,347` | 数字列右对齐 + `font-variant-numeric: tabular-nums`；日期统一 `YYYY/MM/DD HH:mm` |
| P2-06 | 只有 1 页时仍渲染两个 disabled 的上一页/下一页 outline 按钮 | `page.tsx:391-409`，截图 12 家门店 | 1 页时只显示“第 1 / 1 页”或隐藏分页控件 |
| P2-07 | 同一行有三条进入详情路径：整行点击、店名 Link、“详情”按钮 | `page.tsx:284-290, 293-299, 352-362` | 保留一个主入口（店名 Link），“详情”改 text link 或删除 |
| P2-08 | 2px 微间距 | `page.tsx:303` `mt-0.5`；`field.tsx:31` `ml-0.5` | 归到 4px 网格 |
| P2-09 | 加载文案 `加载中...` 使用 ASCII 三点，与抽屉的 `加载中…` 不一致 | `page.tsx:261` vs `store-drawer.tsx:229` | 统一中文省略号，最好使用 skeleton 替代文案 |
| P2-10 | 页面 section gap 24px，DESIGN 写 80px；需契约裁定 | `page.tsx:103` `gap-6`；`DESIGN.md:118` | 若后台产品页豁免，请写入 DESIGN 例外；否则不要用 24 假装符合 |

## 6. 为什么它看起来“AI 味”

按 unslop 的问题类型归纳，本页命中五类：

1. **组件库默认值即设计**：所有按钮 8px、输入 8px、徽章 12px、Dialog 10px/18px/600。设计系统没有被执行，只有 shadcn 被安装。
2. **控件墙**：11 个筛选控件平铺，0 个 `<label>`，字段宽度从 128 到 256 不等但视觉权重完全一样；查询按钮落在第二行左侧，右边空 495px。这是“AI 生成表单”的典型结构：数量齐全，信息架构缺席。
3. **数据库表格式**：11 列自动布局、无列宽、无截断、无移动策略。看起来像 `SELECT *` 直接渲染，而不是为“看门店、判断状态、做下一步”设计的列表。
4. **状态调色盘**：同一状态在不同组件里换颜色；positive/attention 都吃 Rust；`正常` 在表格是文本，在抽屉是 badge。用户学不会，页面像随机贴标签。
5. **小灰字 + 无边界的 outline 按钮**：12px Graphite 铺满表格；28 个 outline 按钮没有主次；整页没有明确“下一步动作”的视觉答案。

反面证据也要保留：**没有**渐变、彩色 glow、emoji、循环动画、假 3D、紫色 SaaS 味。问题不是“过度装饰”，而是“没有设计”。这类页面比花哨页面更难靠换色修好，必须重做组件与信息结构。

## 7. 建议修复顺序

### Phase 0 — 先修基础层（不动业务逻辑）

1. 修 `layout.tsx` / `globals.css` 字体链，验证 Inter 真正加载。
2. 建 `components/custom` 的 Steep Button / Input / Badge / Dialog / Sheet 封装；统一 radius、字号、字重、padding、shadow。
3. 把 `shadow-steep-sm` 从页面移除，统一 `shadow-steep`。
4. 将 `text-error` 与 `--ring` 换回 DESIGN 色板；补 focus 样式。

### Phase 1 — 重做列表信息架构

1. 先定列策略（6–7 列）和排序/默认排序；公司、来源等进抽屉。
2. 表格固定列宽、表头 nowrap、文本 truncate、数字右对齐。
3. 1024 以下改卡片记录列表或冻结操作列；删除操作不再藏在水平滚动里。
4. 状态统一映射，表/抽屉共用。

### Phase 2 — 操作与状态

1. 筛选：一主搜索 + 展开筛选；可见 label；清空/条件 chips。
2. 动作：只留一个 filled CTA；其余 text link；行内删除进 overflow。
3. 加载 skeleton；错误 retry；空态清空筛选/新建。
4. 行键盘可达；两个 Select 补 label；Table 行不再依赖鼠标。
5. 统一 4px 网格，清掉 10px/2px/6px 杂项（按 DESIGN 列表）。

### Phase 3 — 验收

- [ ] `document.fonts.check('16px Inter')` 为 true，body computed 字体含 Inter。
- [ ] h1 44/400/-0.015em；移动标题 ≥40。
- [ ] 页面版心 ≤1200 或 DESIGN 记录全宽例外。
- [ ] 按钮 9999/15/450；Input 16；无 12/13px 文本；无 700 字重。
- [ ] 1440 无竖排表头；1024/390 操作可见。
- [ ] 同一门店的状态在表格/抽屉的 label 与 tone 完全一致。
- [ ] 可见 `<label>` 覆盖所有筛选字段；两个 Select 有 aria-label。
- [ ] 全页只有 1 个 filled CTA；其余次要动作为 text link。
- [ ] `shadow-steep`、24px 卡片、20px padding 全部落地。
- [ ] loading / empty / error 都有截图和恢复动作；错误有 retry。

## 8. 证据截图

### 1440：第一屏的实际权重

![1440 门店列表](screens/01-desktop-1440.png)

### 1024：操作列开始被裁切

![1024 门店列表](screens/02-desktop-1024.png)

### 390：首屏只剩门店/公司两列

![390 门店列表](screens/03-mobile-390.png)

### 抽屉：状态 badge 与表格不一致

![1440 门店抽屉](screens/04-drawer-1440.png)

### 删除弹窗：10px 圆角 + 18/600 标题 + 冷蓝 focus ring

![删除门店弹窗](screens/05-delete-dialog.png)

## 9. 证据文件

- [计算样式原始 JSON](evidence/stores-metrics.json)
- 截图目录：[`screens/`](screens/)

## 10. 审查边界与不确定性

- **未做像素级 diff**：没有 Figma 或经批准的像素基线；本报告只基于 `DESIGN.md` 的 token、源码和浏览器计算样式。
- **未跑完整 axe 扫描**：可访问性结论来自 DOM/ARIA 检查、计算样式和人工键盘路径；不能声称覆盖全部 WCAG。
- **错误态/空态未注入真实 500**：加载、错误、空态结论主要来自源码与渲染截图；正式验收应补网络/接口失败注入。
- **hover / active / disabled / focus 状态未全部截图**：已知 focus ring 来自删除弹窗输入框实测；Button 的 disabled 仅见分页截图。
- **截图含测试数据**：`SHOT1793630391869源门店`、`DBG179...`、`【审计】...` 是测试库数据，不是 UI 缺陷，但会放大“不真实感”；正式验收前应清洗。
- **截图右上角黑色 `N` 圆球是 Next.js 开发工具**，压住“新建门店”按钮右缘；这是开发环境叠加层，不计入页面设计问题。
- **深色模式、reduced-motion、200% 缩放未测**；本页暗色模式需求未在 DESIGN 中定义，暂不判定。
- **全局字体问题已有历史记录**：`docs/To-Do/2026-10-27-前端设计审查报告.md:162`（B-06）已记录；本次复核仍然存在，说明是未修复的系统性问题，不是本页新引入。
