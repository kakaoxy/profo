# profo 项目详情页独立页重构 — 设计系统选择与设计令牌

> 设计系统专家(彩格调)· 2025-08-16 · 供原型构建师消费 · 只产出规范/令牌,不写业务代码
> 前置输入:Phase 1 需求摘要(`requirements.md`)、`frontend/DESIGN.md`(Steep 参考)、`frontend/src/lib/status-colors.ts`、`frontend/src/app/globals.css`、现有 `project-detail` 组件源码
> 原则:**零影响基线** —— 不触碰全局 `:root` token,新令牌以页面作用域注入,列表页/全局组件不受影响。

---

## 0. 设计系统选择与理由

### 候选对比(结合 71 套系统库认知 + 项目现实)

| 方案 | 系统 | 匹配度 | 特征 | 为何适配 / 为何否决 |
|------|------|--------|------|---------------------|
| **A(选型)** | **shadcn/ui 基线 + Steep 质感定制** | ★★★★★ | 浅色 admin 语义 token(`background/muted/card/primary/border`)、Tailwind v4、new-york 风格;叠加 Steep 的暖灰画布 `#f7f7f8`、克制留白、大圆角卡片、单一暖色点缀 | 代码库已是 shadcn/ui 体系(sidebar/DataTable/Card/Dialog/AlertDialog 全在用),**换基线 = 破坏零影响**。Steep 已部分注入 globals.css(`--color-fog/ink/rust` 等),可提取其"编辑质感"而非照搬营销衬线大字。 |
| B(参考) | **Linear 风格**(单深色 CTA + 大圆角 + 克制灰阶) | ★★★★☆ | 极简、单一强调、圆角卡片、focus 精致 | Steep 官方在 Similar Brands 中明确对标 Linear;其"1 个主 CTA / 灰阶 chrome / 克制强调"原则可直接作为本页 CTA 与色彩纪律的执行参照,但**不作为独立选型**。 |
| C(否决) | Supabase / PostHog(数据密度型 admin) | ★★★☆☆ | 高密度表格、强数据可视化 | 与"暖灰画布 + 编辑质感 + 克制留白"的调性冲突;且本项目已有成熟列表页,详情页应更聚焦/舒展,不追高密度。 |

### 最终选型结论

> **采用方案 A:shadcn/ui 基线 + Steep 质感定制(页面作用域定制,非全局改造)。**
>
> 具体落地边界:
> 1. 一切组件结构/交互沿用现有 shadcn 组件(Button、Card、Badge、Dialog、AlertDialog、Tabs、Sheet、DropdownMenu、Separator、Skeleton、Tooltip);
> 2. Steep 只借 3 样东西:**暖灰页面画布**(`fog #f7f7f8`)、**克制留白**(分区间距 24–32px、卡片内 16–20px)、**单一暖色点缀**(`rust #5d2a1a` + `apricot-wash #fbe1d1` 仅数据点缀,每屏 ≤1 处);
> 3. **禁止**引入 Steep 的衬线 display 字体、24px 卡片圆角、大三层阴影、营销渐变;
> 4. 状态色 100% 沿用 `status-colors.ts`,不新增色系。

---

## 1. 色彩令牌

### 1.1 画布 / 表面 / 边框 分层(页面作用域)

> 页面根容器加 `project-detail` class 或直接使用以下 Tailwind 语义类;不修改全局 `:root`。

| 层级 | 推荐类名 | 色值 | 用途 |
|------|---------|------|------|
| 页面画布 | `bg-fog` | `#f7f7f8` | 页面外壳(替代纯白),对齐 Steep 暖灰;当前页 `bg-muted` 偏冷,本页换 fog 制造编辑质感 |
| 分区内嵌面 | `bg-muted` | oklch(0.968 0.007 247.896) ≈ `#f4f4f5` | 表格 zebra、卡内次级区块、stepper 底色 |
| 卡片表面 | `bg-card` | `#ffffff` | 所有卡片 |
| 浮层表面 | `bg-popover` | `#ffffff` | Dropdown / Dialog / Popover |
| 描边(hairline) | `border-border` | oklch(0.929 0.013 255.508) ≈ `#e2e8f0`(slate-200) | 卡片描边 |
| 输入框描边 | `border-input` | 同 `#e2e8f0` | Input / Select |
| 卡内分隔线 | `divide-border` 或 `bg-border` | `#e2e8f0` | Divider / 分隔条 |
| 悬停描边 | `hover:border-foreground/20` | — | 可交互卡片 hover 反馈 |

### 1.2 文字分层

| 角色 | 类名 | 色值 | 用途 |
|------|------|------|------|
| 主文字 | `text-foreground` | oklch(0.129 0.042 264.695) ≈ `#0f172a` | 标题、项目名、关键数值 |
| 次要文字 | `text-muted-foreground` | ≈ `#64748b`(slate-500) | 标签、说明、卡标题 |
| 弱化文字 | `text-muted-foreground/70` | — | 时间戳、辅助信息 |
| 占位文字 | `placeholder:text-muted-foreground` | — | Input placeholder |

### 1.3 项目状态色(5 阶段 · 沿用 status-colors.ts,禁止改动)

| 阶段 | key | 色值 | 徽标类(固定样式) | 场景 |
|------|-----|------|------------------|------|
| 签约 | `signing` | `#005daa` | `bg-status-signing/10 text-status-signing border-status-signing/20` | Header 徽标、文书状态、交接前 |
| 装修 | `renovating` | `#f97316` | `bg-status-renovating/10 text-status-renovating border-status-renovating/20` | 装修视图、子阶段 |
| 在售 | `selling` | `#10b981` | `bg-status-selling/10 text-status-selling border-status-selling/20` | 在售视图、上架后 |
| 已售 | `sold` | `#64748b` | `bg-status-sold/10 text-status-sold border-status-sold/20` | 已售视图 |
| 已下架 | `ended` | `#78716c` | `bg-status-ended/10 text-status-ended border-status-ended/20` | 已下架视图 |

- 徽标通用样式:`inline-flex items-center rounded-full h-6 px-3 text-xs font-medium border`。
- 全实底场景(如表格列)用 `getProjectStatusClassName`(白字),本页统一用浅底徽标(`getProjectStatusBadgeClass`)。
- 阶段 Stepper 的**完成态统一用 `primary` 蓝**(单一强调,见 §5.1),不逐阶段变色,避免五色打架。

### 1.4 强调色

| 角色 | Token | 色值 | 使用边界 |
|------|-------|------|---------|
| 主交互强调 | `--primary` | `#005daa`(**现状,不动**) | 主 CTA、链接、focus ring、Stepper 完成态、选中态、进度条 |
| 暖色点缀 | `--color-rust` | `#5d2a1a` | **仅数据/图标点缀**:单个暖色数据卡标题或图标、图表第二系列、暖色小徽标;每屏 ≤1 处。**禁止**做按钮背景、链接色、默认边框色 |
| 暖色卡底 | `--color-apricot-wash` | `#fbe1d1` | 仅暖色 KPI 卡/装修进度卡背景,每屏 ≤1 张;其上文字用 `text-ink #17191c` 保证对比度 |

### 1.5 语义色(成功 / 警告 / 错误)

> 系统已有 success/error token;warning 无现成 token,本页新增页面作用域 `--warning` 建议值(不改全局)。

| 语义 | Token | 色值 | 使用场景 |
|------|-------|------|---------|
| 成功 | `--success` | `#059669` | 完成、已到账、已保存 |
| 成功容器 | `--success-container` | `#ecfdf5` | 成功提示条背景 |
| 警告 | `--warning`(页面新增) | `#d97706`(amber-600) | **临期**提示(距交房 ≤N 天)、待处理 |
| 警告容器 | `--warning-container` | `#fffbeb` | 临期提示条背景 |
| 错误 | `--error` | `#ef4444` | **超时**、删除、失败、校验错误 |
| 错误容器 | `--error-container` | `#fef2f2` | 错误提示条/净利卡背景 |
| 信息 | 沿用 `--primary` | `#005daa` | 一般提示 |
| 金额正(流入/盈利) | `--money-positive` | `#ef4444`(红) | 收入、净利润、回款 |
| 金额负(流出/亏损) | `--money-negative` | `#10b981`(绿) | 支出、投入、亏损 |

> ⚠️ **金额红涨绿跌(中国习惯),全页一致,禁止反转。** 已售 Hero 净利润卡沿用现有约定:`bg-error-container/50 border-error/30`。

### 1.6 图表色

- 沿用现有 `--chart-*` 系列,不新增。
- 需要对比强调时:**主系列 = `--primary #005daa`(或状态色),第二系列 = `--color-rust #5d2a1a`**;网格/标签用 `--chart-grid #e2e8f0` / `--chart-label #64748b`。

---

## 2. 排版令牌

> 字体沿用现有 sans 体系(`--font-sohne` = Inter fallback),**中文无衬线、不引入 Signifier**。中文正文字距 0;负字距仅用于英文/数字标题。

| 角色 | 字号 | 字重 | 行高 | 字距 | 类名建议 | 用途 |
|------|------|------|------|------|---------|------|
| 页面标题 | 20px | 700 | 1.3 | -0.01em | `text-xl font-bold text-foreground` | Header 项目名 |
| 分区/卡标题 | 15px | 600 | 1.4 | 0 | `text-sm font-semibold` | Section Card 标题、Stepper label |
| KPI 标签 | 13–14px | 500 | 1.4 | 0 | `text-sm font-medium text-muted-foreground` | 卡内小标签 |
| 正文 | 14px | 400 | 1.5 | 0 | `text-sm text-foreground` | 详情/列表内容 |
| 次要正文 | 13px | 400 | 1.5 | 0 | `text-[13px] text-muted-foreground` | 辅助说明 |
| 时间戳/说明 | 12px | 400 | 1.5 | 0 | `text-xs text-muted-foreground` | 日期、元信息 |
| 状态徽标 | 12px | 500 | 1 | 0 | `text-xs font-medium` | 徽标文字 |
| 按钮文字 | 14px | 500 | 1 | 0 | `text-sm font-medium` | Button(沿用 shadcn) |
| KPI 大数字 | 24–30px | 800 | 1.2 | -0.02em(仅数字) | `text-2xl/3xl font-extrabold tracking-tight tabular-nums font-mono` | 指标数值/金额(沿用现有 font-mono 约定) |
| 大金额(已售 Hero) | 30px | 800 | 1.2 | -0.02em | `text-3xl font-extrabold tabular-nums font-mono` | 净利润/成交价等 |

- **数字对齐**:所有金额/百分比/天数一律 `tabular-nums`(金额可沿用 `font-mono`,与现有 hero-metrics / financial-lifecycle 一致;全页统一二选一)。
- **中文排版**:正文行高 1.5、标题 1.3–1.4;不加大负字距;不强制大写。

---

## 3. 间距 / 圆角 / 阴影令牌

### 3.1 间距(4px 基准)

| 用途 | 值 | 类名 |
|------|-----|------|
| 元素内间距(紧凑) | 4 / 8px | `gap-1` / `gap-2` |
| 卡内区块间距 | 16–20px | `space-y-4` / `space-y-5` |
| 卡与卡间距 | 16–20px | `gap-4` / `gap-5` |
| 页面分区间距 | 24–32px | `space-y-6` / `space-y-8` |
| 页面边距 | 16 / 24 / 32px | `px-4 sm:px-6 lg:px-8` |
| 卡片内边距 | 16–20px | `p-4` / `p-5`(可 `px-6` 加大) |
| 内容容器宽 | lg:1152 / xl:1280px | `lg:max-w-6xl xl:max-w-7xl mx-auto` |

> 容器说明:现有页 `max-w-5xl`(1024px)偏窄,双栏后建议升级为 `max-w-6xl`(≥lg)/ `max-w-7xl`(≥xl),全局 sidebar 已占位,容器本身会被视口自然钳制。

### 3.2 圆角(贴近 shadcn,避免 24px 过度放大)

| 元素 | 值 | 类名 | 备注 |
|------|-----|------|------|
| 默认卡片 | 10px | `rounded-lg`(=`--radius`) | 绝大多数 Card |
| 强调卡/Hero 指标 | 14px | `rounded-xl`(=`radius+4`) | 摘要卡、KPI 网格 |
| 图片缩略图 | 10px | `rounded-lg` | 照片网格 |
| 内嵌小卡/chip/doc 项 | 8px | `rounded-md` | 文书行、分组项 |
| 输入框 | 8px | `rounded-md` | 沿用 shadcn default |
| 按钮 | 8px | `rounded-md` | 沿用 shadcn default;阶段主 CTA 可 `rounded-lg` |
| 徽标/头像/返回按钮 | 圆形 | `rounded-full` | 仅此三类用圆 |
| 上传虚线区 | 10px | `rounded-lg border-dashed` | Dropzone |

> 硬约束:卡片圆角 ≤ **20px**(仅 Hero 级可碰 20),默认 10–14px;**禁用 24px**。

### 3.3 阴影

| 层级 | 值 | 用途 |
|------|-----|------|
| 静止卡片 | `shadow-sm`(现有 `--shadow-card`) | 默认卡片 |
| 悬停卡片 | `hover:shadow-md transition-shadow` | 可交互卡片 |
| sticky 头/阶段导航 | `shadow-sm` + `border-b` | 横向分隔,不悬浮 |
| 浮层 | `shadow-lg` + `border` | Dropdown / Dialog / Popover |
| 底部固定操作栏 | `border-t` + `backdrop-blur bg-background/95` | 在售底部栏 |
| ~~营销三层阴影~~ | **禁用 `--shadow-steep`** | 那是营销浮卡用,admin 用边框 + 轻阴影 |

---

## 4. 组件规范

### 4.1 Stepper 阶段导航(核心骨架)

- **结构**:Header 之下第二行,`sticky top-[64px] z-30 bg-background/95 backdrop-blur border-b`,内容与页面容器对齐。
- **5 节点**:签约(0)→ 装修(1)→ 在售(2)→ 已售(3)→ 已下架(4)。
- **节点状态**(沿用现有 `lifecycle-stepper` 视觉,新增锁定态):

| 状态 | 样式 |
|------|------|
| 已完成 | 32px 圆 `bg-primary border-primary text-white`,内为 `Check` 白图标;连接线 `bg-primary` |
| 当前 | 32px 圆 `bg-card border-2 border-primary text-primary ring-4 ring-primary/10`;label `text-primary font-semibold` |
| 解锁未到 | 32px 圆 `bg-card border-border text-muted-foreground`;label muted;可点击切换 |
| **锁定** | 同"解锁未到"样式 + 节点内 `Lock` 图标 / `opacity-50` + `cursor-not-allowed` + `aria-disabled`;**不响应 hover/点击**,`title="当前阶段未解锁"` |

- 连接线:2px(`h-0.5`),已完成段 `bg-primary`,其余 `bg-border`。
- 节点间距:`flex-1` 等分;节点与 label 间距 8px。
- **sm(<640)**:整条 Stepper 横向滚动 `overflow-x-auto scrollbar-hide min-w-[520px]`,节点缩至 28px。
- 依赖数据:`PROJECT_LIFECYCLE_STEPS`(signing→renovating→selling→sold)+ ended 终态;locked 由 `currentProjectStageIndex` 推导。

### 4.2 KPI 卡

- 容器:`Card rounded-xl border shadow-sm hover:shadow-md transition-all`。
- 结构:`CardHeader(flex row justify-between, label 左 + 24px icon 右)` + `CardContent(大数字 + 说明行)`。
- 数值:`text-2xl/3xl font-extrabold tracking-tight tabular-nums font-mono`,颜色按语义(见 §1.5)。
- 可选 delta:`↑/↓` + 百分比,正=红、负=绿(金额口径)或正绿负红(一般指标,与列表页一致)。
- 网格:`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`。
- 特殊:净利润卡用 `bg-error-container/50 border-error/30`(沿用现有约定);暖色点缀卡 ≤1 张。

### 4.3 双栏布局栅格(≥lg)

- 主容器:`grid grid-cols-1 lg:grid-cols-3 gap-6`。
- 左主栏:`lg:col-span-2 space-y-6`(核心概览 + 任务跟进 + 活动记录),DOM 在前。
- 右侧栏:`space-y-6`(成员团队 / 附件文书 / 财务摘要 / 快捷操作),DOM 在后。
- `<lg`:单栏,侧栏自动堆叠到主栏下方(靠 DOM 顺序,无需重排)。
- 侧栏可视宽建议 320–360px(设计稿按 1280/1440 视口输出)。

### 4.4 Section Card(分区卡)

- `Card` + `CardHeader(title + 右侧操作区)` + `CardContent`。
- 标题:`text-sm font-semibold`,可带 `count` 徽标(pill,`bg-muted text-muted-foreground` 或状态色)。
- 每个分区设 `id` 锚点 + `scroll-mt-28`(补偿 sticky header+stepper 高度),供分段导航跳转。
- 卡内子区块用 `Separator` / `divide-y divide-border` 分隔,不叠重边框。

### 4.5 状态徽标

- 统一 `rounded-full h-6 px-3 text-xs font-medium border` + 状态浅底类(§1.3)。
- 出现位置:Header 项目名旁、文书分组状态 pill、表格/行内状态。

### 4.6 附件 / 文书卡

- 分组网格:`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4`。
- 组卡结构:头 = 组名(6 类:合同及协议/产权及权属/身份及账户/财务及税费/房屋交接/其他)+ count pill + 状态 pill;体 = 文档行列表。
- 文档行:左 `FileIcon`(muted)+ 文件名(可截断 `truncate`)+ 大小/日期;右侧操作 icon 按钮(预览/下载/删除),默认隐藏、行 hover 显示;删除需 AlertDialog 或行内二次确认。
- 上传:虚线 dropzone(`border-dashed`),拖拽高亮 `ring-2 ring-primary`,压缩上传带进度条,失败行红字 + 重试按钮。
- 归档:归档后仅可上传附件,不可改行内字段(权限态)。

### 4.7 图片网格

- 网格:`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3`。
- 缩略图:`aspect-[4/3] rounded-lg object-cover`,骨架 `bg-muted animate-pulse`。
- hover 操作:overlay(`bg-black/40`)+ 预览/下载/删除 icon 按钮;批量模式左上 checkbox,底部批量操作条(批量下载/删除)。
- 上传 tile:虚线 `rounded-lg` + 进度环/进度条 + 错误态(红边框 + 重试)。
- 预览:全局共用 `Dialog max-w-4xl h-[75vh]` 图片预览(沿用现有)。

### 4.8 CTA 层级

| 层级 | 样式 | 场景 | 数量约束 |
|------|------|------|---------|
| 主(Primary) | `bg-primary text-primary-foreground hover:bg-primary/90` | 阶段主 CTA、保存 | 每屏 ≤2(Header 主操作 + 阶段流转 CTA) |
| 次(Outline) | `variant="outline"` | 编辑、取消、次要操作 | 不限 |
| 弱(Ghost/链接) | `variant="ghost"` 或 `text-link` | 返回、文本操作 | 不限 |
| 危险(Destructive) | `bg-error hover:bg-red-700` | 删除、结束项目 | 仅在 AlertDialog 内/危险区 |

- **阶段流转 CTA(全局唯一主 CTA,常驻)**:
  - 签约 →「交接确认」(选交房日期)→ 流转 renovating
  - 装修 →「上架」(日期 + 挂牌价)→ 流转 selling
  - 在售 →「确认成交」(日期 + 价格)→ 流转 sold;副 CTA「结束项目」(→ ended)
  - 已售/已下架 → 无流转 CTA,仅「编辑(已售)」/「删除」
- loading:按钮内 `Loader2 animate-spin`;disabled:`opacity-50 pointer-events-none`。

### 4.9 Sticky 行为

| 元素 | 行为 |
|------|------|
| 全局 Header | `sticky top-0 z-40 bg-background/95 backdrop-blur border-b` |
| 阶段 Stepper | `sticky top-[64px] z-30`(Header 之下) |
| 底部操作栏(在售) | `sticky bottom-0 bg-background/95 backdrop-blur border-t`,内容与容器对齐 |
| 图片预览 Dialog | 普通 Dialog,z 层高于一切 |

---

## 5. 响应式断点策略

| 断点 | 布局 | 说明 |
|------|------|------|
| **xl ≥1280**(主设计) | 双栏(主 2/3 + 侧 1/3);KPI 4 列;附件 3 列;图片 4 列;容器 `max-w-7xl` | 桌面优先基准 |
| **lg 1024–1279** | 双栏(主 2/3 + 侧 1/3);KPI 3 列;附件 2–3 列;图片 3–4 列;容器 `max-w-6xl` | 双栏下限 |
| **md 768–1023** | **单栏**(侧栏堆主栏后);KPI 2 列;附件 2 列;图片 3 列 | 阶段导航保持完整横向 Stepper |
| **sm <640** | 单栏;KPI 1–2 列;附件 1 列;图片 2 列;Stepper 横向滚动折叠(`min-w-[520px]` + `scrollbar-hide`);Header 次要操作(编辑/删除)收进 `DropdownMenu` 或 icon-only;容器 `px-4` | 移动端特化 |

- 断点遵循 Tailwind 默认:`sm 640 / md 768 / lg 1024 / xl 1280`。
- 双栏切换只依赖 `lg`,无需中间态;内容容器始终 `mx-auto`。

---

## 6. 可访问性与交互状态

| 项 | 规范 |
|----|------|
| 焦点可见 | 所有可交互元素 `focus-visible:ring-2 ring-ring ring-offset-2 ring-offset-background` |
| 触控目标 | icon-only 按钮 ≥32px(建议 36px);主按钮 ≥36px 高 |
| 对比度 | 正文 `text-foreground` on `bg-card` ≥7:1;`text-muted-foreground` on 白 ≥4.5:1(现有 `#64748b` 约 4.7:1,达标);状态徽标文字(状态色)on `/10` 浅底 ≥4.5:1 |
| 不只靠颜色 | 状态 = 徽标文字 + 色;Stepper = 数字/Check/Lock 图标 + 色 + 文字 |
| 禁用 | `opacity-50 cursor-not-allowed` + `aria-disabled`(Stepper 锁定节点) |
| 加载 | 骨架 `bg-muted animate-pulse`;区块骨架保持固定宽高防 CLS;按钮内 `Loader2` |
| 空态 | icon(muted)+ 主文案 + 次文案 + 可选 CTA;图片空 = 虚线 tile +「暂无照片」 |
| 错误态 | 行内 `text-destructive text-xs` + `border-error`;上传失败红边框 + 重试;表单错误 sonner toast |
| 动效 | 过渡 150–200ms ease;尊重 `prefers-reduced-motion`(globals 已内置) |
| 语义标签 | icon-only 按钮(返回/删除/预览/下载)一律 `aria-label` |

---

## 7. Anti-Slop 约束(明确"不能做什么")

1. **禁止衬线 display 字体**:admin 内禁用 `font-signifier` / `.font-display`,不出现 40px+ 大标题。
2. **强调色 ≤2**:primary 蓝 + rust 暖点缀;禁止第三色系登场。
3. **圆角纪律**:卡片 ≤20px(默认 10–14),**禁 24px**;按钮 ≤10px;仅徽标/头像/返回用圆形。
4. **主 CTA ≤2/屏**:阶段流转 CTA 全局唯一;Header 主操作与阶段 CTA 不得再叠加第三个 primary。
5. **状态色冻结**:一律走 `status-colors.ts` 映射,不新造、不改值;徽标样式固定 `bg-*/10 + text-* + border-*/20`。
6. **禁用装饰 wash**:apricot/sky 不做普通卡片背景;暖色点缀卡每屏 ≤1 张。
7. **金额红涨绿跌**:`money-positive=红 / money-negative=绿`,禁止反转。
8. **禁用营销大阴影**:不引入 `--shadow-steep` 三层阴影;卡片用 `border + shadow-sm/md`。
9. **禁用渐变**:按钮/卡片无渐变;仅进度条可用渐变(`--progress-*` 已有)。
10. **阶段切换用 Stepper**:不再用纯下拉切换(移动端折叠可保留下拉作为次级入口)。
11. **中文不加负字距**:tracking 仅用于英文/数字;正文保持 0。
12. **不新增图表色**:沿用 `--chart-*`;对比时主 = primary、次 = rust。
13. **零影响全局**:页面级新 token(如 `--warning`、fog 画布)以页面作用域注入,不改 `:root`、不影响列表页与全局组件。
14. **不重造组件**:能复用 shadcn(Button/Card/Badge/Dialog/AlertDialog/Tabs/Sheet/Skeleton/Tooltip)就不手写。

---

## 8. Agent Prompt Guide(供原型构建师)

**快速色板**
- 画布 `#f7f7f8`(fog)/ 卡片 `#ffffff` / 描边 `#e2e8f0` / 主文字 `#0f172a` / 次要 `#64748b`
- 主强调 `#005daa`(primary)/ 暖点缀 `#5d2a1a`(rust)/ 暖卡底 `#fbe1d1`(apricot-wash)
- 状态:签约 `#005daa` / 装修 `#f97316` / 在售 `#10b981` / 已售 `#64748b` / 已下架 `#78716c`
- 语义:成功 `#059669` / 警告 `#d97706` / 错误 `#ef4444` / 金额正红 `#ef4444` / 金额负绿 `#10b981`

**页面骨架示例 Prompt**
> `bg-fog min-h-screen`;sticky Header(`top-0 z-40 bg-background/95 backdrop-blur border-b`,返回 + 项目名 + 状态徽标 + 编辑/删除);其下 sticky Stepper(`top-[64px] z-30`,签约→装修→在售→已售→已下架,锁定态 Lock);内容 `mx-auto max-w-6xl xl:max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-8`;≥lg 双栏 `grid lg:grid-cols-3 gap-6`,主栏 `lg:col-span-2`,侧栏 `space-y-6`;底部(在售)`sticky bottom-0 border-t bg-background/95 backdrop-blur` 操作栏。

**组件 Prompt 要点**
- KPI 卡:`Card rounded-xl border shadow-sm` + `text-2xl font-extrabold tabular-nums font-mono` 大数字 + `text-sm text-muted-foreground` 标签。
- 附件分组:`grid sm:grid-cols-2 xl:grid-cols-3` 组卡,头 = 组名 + count + 状态 pill,行 hover 显操作。
- 图片网格:`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 aspect-[4/3] rounded-lg`,hover overlay + 操作,批量 checkbox + 底部批量条。
- Stepper 节点:`h-8 w-8 rounded-full border-2`,完成 `bg-primary` + Check,当前 `border-primary ring-4 ring-primary/10`,锁定 `Lock` + `opacity-50 cursor-not-allowed`。

---

*本令牌文档为 Phase 2 交付物,供 Phase 3 原型构建师直接消费;若与需求摘要/现有组件行为冲突,以本文件 + `status-colors.ts` 为准并回传 team-lead 复核。*
