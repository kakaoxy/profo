# profo 项目详情页独立页重构 — 设计令牌 v2(Steep 对齐重制)

> 设计系统专家(彩格调)· 2025-08-16 · 供原型构建师直接消费 · 只产出规范/令牌,不写业务代码
> 前置输入:Phase 1 需求摘要(`requirements.md`)、`DESIGN.md`(Steep 风格参考,须严格遵循)、v1 令牌(`design-tokens.md`,本版替代其地位)、现有 `project-detail-page-design.html`(91KB,结构/功能/交互已过审,本次仅改视觉风格)
> 原则:**视觉风格全面对齐 DESIGN.md(Steep)**;业务状态色、金额红涨绿跌、断点策略、可访问性/加载/空错态结构**冻结保留**;页面级 token 以作用域注入,不改全局 `:root`、不影响列表页与全局组件。

---

## 0. 本版与 v1 核心差异(旧 → 新)

| 维度 | v1(shadcn 基线) | v2(Steep 对齐) |
|------|------------------|----------------|
| 设计基线 | shadcn/ui + Steep 只借 3 样 | **全面对齐 DESIGN.md(Steep)**,shadcn 仅保留组件结构 |
| 卡片圆角 | 10–14px(禁 24px) | **24px** |
| 按钮形态 | 8px `rounded-md` | **9999px 胶囊** |
| 主 CTA 色 | `#005daa`(蓝) | **Ink `#17191c` filled**(每屏 ≤1) |
| 标题字体 | 无衬线 bold | **衬线 display**(仅页面级标题,`"Noto Serif SC","Songti SC",serif`) |
| KPI 大数字 | `font-mono` 800 extrabold | 无衬线 480 字重(Hero 级数字可衬线) |
| 卡片阴影 | `shadow-sm`(边框+轻影) | **签名三层阴影** |
| 输入圆角 | 8px | **16px** |
| 图片/缩略图 | 10px | **12px** |
| 内嵌 chip/文书行 | 8px | **12px**(禁锐角) |
| UI chrome 强调 | 蓝为主 | **Ink/Rust 为主**;蓝仅业务状态+必要链接 |
| Stepper 完成/当前态 | 蓝 | **Ink** |
| 主文字 | `#0f172a` | **Ink `#17191c`** |
| 次要文字 | `#64748b` | **Ash `#4c4c4c`** |
| 卡片描边 | `#e2e8f0` | Dove `#a3a6af` 或签名阴影 1px 环 |
| 营销 hero/渐变 | 禁 | **禁**(延续) |
| 状态色 5 色 / 金额红涨绿跌 | 冻结 | **冻结(不变)** |

---

## ① DESIGN.md 对齐总则(照搬 / 映射 / 禁用 / 冻结)

### 1.1 照搬(直接采用 Steep 规范)
| 项 | 取值 | 落地 |
|----|------|------|
| 灰阶色板 | Ink `#17191c` / White `#ffffff` / Fog `#f7f7f8` / Ash `#4c4c4c` / Graphite `#777b86` / Dove `#a3a6af` / Slate `#8b8c8d` / Obsidian `#000000` | 全部照搬 |
| 双暖色 | Rust `#5d2a1a` / Apricot Wash `#fbe1d1` / Sky Wash `#d3e3fc` | 全部照搬(Rust=唯一暖 chrome 强调;两 wash 仅数据卡底) |
| 圆角语言 | 卡片 24px / 图片 12px / 输入 16px / 标签·按钮·头像 9999px | 照搬 |
| 签名三层阴影 | `rgba(4,23,43,.05) 0 0 0 1px + rgba(0,0,0,.1) 0 20px 25px -5px + rgba(0,0,0,.1) 0 8px 10px -6px` | 照搬,作为全卡片默认 |
| 填充 CTA | Ink 底白字胶囊,每屏 1 个,旁配文字链次级 | 照搬 |
| 次级操作 | 文字链(无边框无底),居主 CTA 右侧 | 照搬 |
| 灰阶 chrome | UI chrome 单色,唯一色彩 = Rust + 两 wash | 照搬 |
| 无衬线微字重 | 400/430/450/480/500 阶梯(UI 用 450/480/500) | 照搬(见 §③) |
| 边框纪律 | 边框 ≤1px;分隔靠表面色差+大圆角 | 照搬 |

### 1.2 映射(admin 场景合理改写,防做成营销页)
| DESIGN.md 原规则 | Admin 映射 | 原因 |
|------------------|-----------|------|
| Signifier 衬线 display(44–90px,仅 hero/section headline) | 中文衬线栈 `"Noto Serif SC","Songti SC",serif`;仅 **3 处**:① 项目名标题 ② 大分区标题(section opener)③ Hero 级醒目数字/金额;**字号上限 44px、下限 17px** | 中文衬线在 <40px 仍具编辑感,但绝不可下探到正文/标签 |
| Sohne 正文/UI(14–26px) | 无衬线栈 `Inter` + 系统 sans(含 PingFang SC / 微软雅黑),14–26px | 中文 UI 工作字体 |
| 页宽 1200px / section gap 80px(营销) | 页宽 1200px;**分区间距 24–32px**(保留 admin 密度) | 长页多分区,80px 会导致过度纵向滚动 |
| 签名阴影=营销浮卡专用 | 升级为**所有内容卡默认阴影**;sticky 条仍用 border-t + 轻影 | admin 卡片同享编辑质感 |
| hero 暖色径向渐变 | **禁用** | 无营销 hero |
| 浮卡环绕 hero 的营销布局 | **禁用** | 无营销 hero |
| 灰阶 chrome + 单暖强调 | Ink/Rust 主导;蓝 `#005daa` 仅保留给**业务状态色与必要链接** | 减少饱和蓝大面积出现 |

### 1.3 禁用(admin 内不出现)
1. 营销 hero 结构(大衬线标语 + 环绕浮卡 + 径向渐变)
2. 暖色径向渐变(任何位置)
3. 饱和蓝/绿/红做 UI chrome(按钮、边框、图标默认色、进度条底)
4. 每屏超过 1 个 filled 按钮
5. 边框 >1px;圆角 <12px(锐角)
6. Ink filled 用于非主 CTA 或非深色文字
7. 衬线用于正文、标签、表格、按钮文字、表单
8. 将 wash 当作装饰性普通卡背景(仅数据卡底)

### 1.4 冻结保留(业务口径,不属 UI chrome)
- 状态色 5 色(`status-colors.ts`):签约 `#005daa` / 装修 `#f97316` / 在售 `#10b981` / 已售 `#64748b` / 已下架 `#78716c`
- 金额红涨绿跌:`money-positive=红 #ef4444` / `money-negative=绿 #10b981`
- 断点策略(sm 640 / md 768 / lg 1024 / xl 1280,双栏 lg 切换)
- 可访问性骨架(focus 环、disabled、空/错/加载态结构)、5 阶段视图、双栏信息架构、sticky 层级

---

## ② 色彩令牌

### 2.1 画布 / 表面 / 边框 分层(页面作用域 CSS 变量)
> 页面根容器注入以下 CSS 变量(作用域限定,不改全局 `:root`)。

| 层级 | 变量 | 色值 | 用途 |
|------|------|------|------|
| 页面画布 | `--canvas` | `#f7f7f8`(Fog) | 页面外壳(替代 v1 冷灰 `#f4f4f5`,对齐 Steep 暖灰) |
| 卡片表面 | `--card` | `#ffffff` | 所有卡片、浮层、输入底 |
| 分区交替面 | `--section-fog` | `#f7f7f8` | 与白卡交替,体现"大理石分层";卡内次级区块可用 Fog |
| 浮层表面 | `--popover` | `#ffffff` | Dropdown / Dialog / Popover |
| 描边(hairline) | `--border-subtle` | `rgba(163,166,175,.35)`(Dove 35%) | 卡内分隔线、表格行分隔;卡片外框优先用签名阴影 1px 环 |
| 输入框描边 | `--input-border` | `#a3a6af`(Dove) | Input / Select / Dropzone |
| 悬停描边 | `--border-hover` | `#777b86`(Graphite) | 可交互卡片 hover 反馈 |

> 规则:卡片外框**用签名阴影的 1px 环替代粗边框**;确需显式边框时 ≤1px、Dove 系,禁止 `#e2e8f0` 冷边框。

### 2.2 文字分层
| 角色 | 变量 | 色值 | 对比度(白底) | 用途 |
|------|------|------|--------------|------|
| 主文字 | `--text-primary` | `#17191c`(Ink) | ~17:1 | 标题、项目名、关键数值、按钮文字 |
| 次要文字 | `--text-secondary` | `#4c4c4c`(Ash) | ~9:1 | 标签、说明、卡标题、表头 |
| 三级文字 | `--text-tertiary` | `#777b86`(Graphite) | ~4.6:1 | 时间戳、辅助信息、图标描边、占位 |
| 占位文字 | `--text-placeholder` | `#777b86`(Graphite) | ~4.6:1 | Input placeholder(**禁 Dove**) |
| 弱化文字 | `--text-faint` | `#8b8c8d`(Slate) | ~3.9:1 | 仅装饰性/禁用态文字,不作正文 |
| 链接 | `--link` | `#005daa` | ~5.5:1 | 必要链接(复制、跳转、编辑入口) |

> 对比度注:`Dove #a3a6af` 仅用于边框/发丝线/占位图形,**禁止作正文文字色**;正文最小对比 ≥4.5:1(AA)。

### 2.3 状态色冻结表(业务口径,不改值)
| 阶段 | key | 色值 | 徽标样式(固定) | 场景 |
|------|-----|------|----------------|------|
| 签约 | `signing` | `#005daa` | `bg-status-signing/10 text-status-signing border-status-signing/20` | Header 徽标、文书状态、交接前 |
| 装修 | `renovating` | `#f97316` | `bg-status-renovating/10 text-status-renovating border-status-renovating/20` | 装修视图、子阶段 |
| 在售 | `selling` | `#10b981` | `bg-status-selling/10 text-status-selling border-status-selling/20` | 在售视图、上架后 |
| 已售 | `sold` | `#64748b` | `bg-status-sold/10 text-status-sold border-status-sold/20` | 已售视图 |
| 已下架 | `ended` | `#78716c` | `bg-status-ended/10 text-status-ended border-status-ended/20` | 已下架视图 |

- 徽标通用:`inline-flex items-center rounded-full h-6 px-3 text-xs font-medium border`(pill 形态,9999px)。
- **可访问性建议(仅文字色加深一档,不改状态色语义)**:装修橙 `#f97316` 在 10% 浅底上对比度偏低(≈2.9:1),徽标文字可加深为 `#c2410c`;在售 `#059669`、签约 `#004a91`、已售 `#475569`、已下架 `#57534e`,均 ≥4.5:1。状态色值本身冻结,加深仅作用于"文字颜色"这一渲染层。
- 全实底场景(如表格列)继续用 `getProjectStatusClassName`(白字);本页统一浅底徽标 `getProjectStatusBadgeClass`。

### 2.4 强调色(UI chrome 一律 Ink / Rust)
| 角色 | 变量 | 色值 | 使用边界 |
|------|------|------|---------|
| 主交互强调(filled) | `--accent-fill` | `#17191c`(Ink) | **唯一 filled 按钮底色**(阶段 CTA);每屏 ≤1;白字 |
| 暖色强调 | `--accent-warm` | `#5d2a1a`(Rust) | 数据图表暖系列、暖 KPI 卡内点缀、暖徽标;装饰性 chrome 首选 |
| 暖色卡底 | `--surface-warm` | `#fbe1d1`(Apricot Wash) | 仅暖色数据卡底,每屏 ≤1 张;其上文字 Ink |
| 冷色卡底 | `--surface-cool` | `#d3e3fc`(Sky Wash) | 仅冷色数据卡底,每屏 ≤1 张;其上文字 Ink |
| 业务蓝(收缩) | `--business-blue` | `#005daa` | **仅** 状态徽标 + 必要链接 + 焦点可读性兜底;不得作按钮底、边框默认色、图标默认色、进度条底 |

> 规则:页面所有"交互 chrome"(按钮、描边、图标、选中态、进度条)默认 Ink/Rust/灰阶;**饱和蓝只出现在状态徽标与必要链接**。Stepper 完成/当前态用 Ink(见 §5.5)。

### 2.5 语义色(成功 / 警告 / 错误 —— 来源说明)
> 来源:DESIGN.md 未定义绿/红/琥珀语义色(其唯一暖色为 Rust)。故功能语义色**沿用 v1 冻结的 admin 语义值**(来源 = 现有 admin 语义体系,与列表页/既有交互一致),并在容器/点缀层吸收 Steep 的克制灰阶。

| 语义 | 变量 | 色值 | 容器(浅底) | 使用场景 | 来源 |
|------|------|------|-----------|---------|------|
| 成功 | `--success` | `#059669` | `#ecfdf5` | 完成、已到账、已保存、已上架 | 沿用 v1(admin 语义;DESIGN.md 无绿) |
| 警告 | `--warning` | `#d97706` | `#fffbeb` | 临期(距交房 ≤N 天)、待处理 | 沿用 v1(admin 语义;DESIGN.md 暖色为 Rust,可作装饰性替代) |
| 错误 | `--error` | `#ef4444` | `#fef2f2` | 超时、删除、失败、校验错误 | 沿用 v1(admin 语义;与金额正红同色系) |
| 信息 | `--info` | `#005daa` | `#e6f0fa` | 一般提示 | 沿用业务蓝 |
| 金额正(流入/盈利) | `--money-positive` | `#ef4444`(红) | — | 收入、净利润、回款 | **冻结(红涨)** |
| 金额负(流出/亏损) | `--money-negative` | `#10b981`(绿) | — | 支出、投入、亏损 | **冻结(绿跌)** |

> ⚠️ **金额红涨绿跌全页一致,禁止反转。** 已售 Hero 净利润卡沿用 `bg-error-container/50 border-error/30`(v1 约定保留)。
> 提示条统一样式:`rounded-[16px] px-4 py-3 text-[13px]` + 容器浅底 + 语义主色文字/图标 + 1px 同色 20% 描边;避免大色块,维持灰阶克制。

### 2.6 图表色
- 主系列 = Ink `#17191c` 或 Rust `#5d2a1a`(暖数据);次系列 = Sky Wash 内的 `#4a90e2`(冷数据,对齐 DESIGN.md AI Response Card 的 blue 用法)。
- 网格/标签:Grid `#e2e8f0` 替换为 `#a3a6af`(Dove,发丝线),Label 用 `#777b86`(Graphite)。
- 不新增图表色系;状态色可用作对应阶段图表点缀。

---

## ③ 排版令牌

### 3.1 字体栈
| 角色 | 栈 | 对应 DESIGN.md |
|------|-----|----------------|
| 衬线 display(仅标题/Hero 数字) | `"Noto Serif SC","Songti SC",Georgia,"Times New Roman",serif` | Signifier 替代(中文衬线落地) |
| 无衬线 body / UI | `Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif` | Sohne 替代(Inter/系统 sans) |
| 数字/金额(可选) | 无衬线默认 + `font-variant-numeric:tabular-nums`;Hero 级金额可用衬线栈 | DESIGN.md Stat Card 大数字(Signifier 或 Sohne 480) |

> 说明:上一版 `font-mono` 数字约定**不再作为默认**——数字改用无衬线 480 + `tabular-nums`(更贴 Steep);仅"编号/合同号/流水"等代码类内容可保留等宽栈。

### 3.2 衬线 display 使用映射(全页仅 3 处)
| 位置 | 字号 | 字重 | 行高 | 字距 | 说明 |
|------|------|------|------|------|------|
| ① 项目名标题(Header,页面主标题) | 26–28px | 600 | 1.2 | 中文 0 / 英文数字 -0.015em | 唯一页面级主标题,与徽标同行 |
| ② 大分区标题(Section opener,如"核心概览 / 财务生命周期 / 装修进度") | 22px | 600 | 1.25 | 中文 0 / 英文数字 -0.015em | 每屏 ≤4 处,其余卡标题一律无衬线 |
| ③ Hero 级醒目数字(Hero 净利润/成交价、在售挂牌价大卡、签约摘要总价) | 32–44px | 500–600 | 1.1 | -0.02em(数字) | 金额/百分比/天数可衬线 + tabular-nums |

> 禁:衬线用于卡标题、KPI 网格数字、表格、标签、按钮、表单、正文;衬线字号 <17px 禁用;中文标题不加负字距(≤-0.01em 上限)。

### 3.3 字号阶梯(与 DESIGN.md Type Scale 对应)
| 角色 | 字号 | 行高 | 字距 | 字重 | 对应 DESIGN.md | 用途 |
|------|------|------|------|------|----------------|------|
| caption | 12–13px | 1.5 | 0(中文)/-0.1px(数字) | 400–500 | caption 14px 收敛 | 徽标、时间戳、辅助说明 |
| body | 14px | 1.5 | 0 | 400 | body 16px(admin 收敛) | 详情/列表正文、表单值 |
| body-lg | 15px | 1.4 | 0 | 400–450 | body-lg 18px 收敛 | 卡标题、表头、行内强调 |
| subheading | 18px | 1.3 | 0(中文) | 500 | subheading 22px 收敛 | 分组小标题、无衬线次标题 |
| heading-sm | 22px | 1.25 | 中文 0 / 英文 -0.015em | 600 | heading-sm 26px(衬线) | 大分区标题(衬线) |
| heading | 26–28px | 1.2 | 中文 0 / 英文 -0.015em | 600 | heading 44px(衬线,admin 收敛) | 项目名标题 |
| hero-num | 32–44px | 1.1 | -0.02em | 500–600 | heading-lg 64px(衬线,admin 收敛) | Hero 级醒目数字 |

### 3.4 字重 / 字距规则
- 无衬线微字重阶梯(对齐 Sohne):**400(正文)/ 450(表头、卡标题)/ 480(KPI 数字、行内强调)/ 500(按钮、徽标、标签)**。若字体不支持可变字重,就近取 400/500,但保持"标题不靠粗、靠字重阶梯"的纪律。
- **禁止 bold(700+)作 UI 常规手段**;用 480/500 替代(对齐 DESIGN.md"Never bold Sohne")。
- 中文正文/标题字距一律 0;负字距仅用于英文/数字(-0.01 ~ -0.025em)。
- 所有数字、金额、百分比、天数:`font-variant-numeric:tabular-nums`。

---

## ④ 间距 / 圆角 / 阴影令牌

### 4.1 间距(4px 基准)
| 用途 | 值 | 说明 |
|------|-----|------|
| 元素内间距(紧凑) | 4 / 8px | 图标与文字、徽标内 |
| 卡内区块间距 | 16–20px | `space-y-4/5` |
| 卡与卡间距 | 16–20px | `gap-4/5` |
| 页面分区间距 | 24–32px | `space-y-6/8`(admin 密度,不照搬营销 80px) |
| 页面边距 | 16 / 24 / 32px | `px-4 sm:px-6 lg:px-8` |
| 卡片内边距 | 20–24px | `p-5/p-6`(对齐 DESIGN.md Card padding 20–24px) |
| 内容容器宽 | 1200px | `max-w-[1200px] mx-auto`(对齐 DESIGN.md Page max-width) |
| 元素间距 | 8px | 默认 element gap |

### 4.2 圆角(对齐 DESIGN.md,全页 ≥12px)
| 元素 | 值 | 说明 |
|------|-----|------|
| 卡片 / Section Card / KPI 卡 | **24px** | 全部内容卡 |
| 图片 / 缩略图 | **12px** | 照片网格、Hero 图 |
| 输入框 / Select / Dropzone | **16px** | 表单控件 |
| 标签 / 徽标 / 头像 / 按钮 | **9999px** | 胶囊/圆形 |
| 内嵌 chip / 文书行 / 分组项 | **12px** | ≥12px,禁锐角 |
| Tab(活动记录/文书分组) | **9999px 或 12px** | 胶囊更贴 Steep |
| Dialog / 浮层 | **24px** | 与卡片一致 |

> 硬约束:任何圆角 **≥12px**;卡片 24px、输入 16px、图片 12px、胶囊 9999px,自上而下统一。

### 4.3 阴影(签名三层阴影,全卡默认)
| 层级 | 值 | 用途 |
|------|-----|------|
| 卡片默认 | `0 0 0 1px rgba(4,23,43,.05), 0 20px 25px -5px rgba(0,0,0,.1), 0 8px 10px -6px rgba(0,0,0,.1)` | 所有内容卡(替代 v1 `shadow-sm` + 边框) |
| 卡片 hover | 同三层,第二层放大 `0 24px 30px -6px`;`transition: box-shadow .15s ease` | 可交互卡 |
| 浮层(浮卡/下拉) | 签名三层 + `0 40px 60px -12px rgba(4,23,43,.18)` | Dialog / Dropdown / Popover |
| sticky 头 / 阶段导航 / 底部栏 | `border-b`(或 `border-t`)+ `backdrop-blur bg-white/90`,**不悬浮大阴影** | 横向分隔,保持编辑克制 |
| ~~营销三层阴影~~ | **不禁用,而是成为默认**;仅禁"叠加多重营销大阴影" | v1 曾禁用,现升级为卡片默认 |

> 规则:边框 ≤1px;分隔靠"签名阴影 1px 环 + 表面色差 + 大圆角",不靠粗描边。

---

## ⑤ 组件规范修订(对齐 DESIGN.md)

### 5.1 卡片(Card)
- 白底 `#ffffff`、**24px 圆角**、padding **20–24px**、签名三层阴影(无显式边框)。
- 卡内子区块用 `divide` + Dove 35% 发丝线分隔,不叠重边框。

### 5.2 Section Card(分区卡)
- 结构:`Card(24px)` + Header(标题 + 右侧操作区)+ Content。
- 标题分级:
  - **大分区 opener**(核心概览 / 财务生命周期 / 装修进度等):衬线 22px 600,Ink。
  - **普通卡标题 / 分组小标题**:无衬线 15px 450–500,Ink(对齐 DESIGN.md Region Stats 标题)。
- count 徽标:pill,`bg-fog text-ash` 或状态浅底。
- 每个分区 `id` + `scroll-mt-28` 锚点供分段导航跳转。

### 5.3 KPI 卡(对齐 DESIGN.md Stat Card with Delta)
- 白底 24px 圆角,20px padding,签名阴影。
- 结构:CardHeader(label 左 + 24px icon 右,icon 用 Ink/Graphite)+ CardContent(大数字 + 说明行)。
- 大数字:无衬线 **26px / 480** Ink + `tabular-nums`(Hero 级数字可衬线 32–44px,见 §3.2)。
- 标签:`13px` Graphite 400(对齐 DESIGN.md "caption label in Graphite 13px")。
- Delta:`↑/↓` + 百分比,12px:
  - **金额口径(冻结):正=红 `#ef4444` ↑、负=绿 `#10b981` ↓。**
  - 一般指标(带看环比等,与列表页一致):正=绿 ↑、负=红 ↓。
- 网格:`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`(20px 间距 `gap-5` 更贴编辑质感)。
- 特殊:净利润卡沿用 `bg-error-container/50 border-error/30`;暖色点缀卡(apricot wash 底)每屏 ≤1 张,其上文字 Ink。

### 5.4 Stat Card with Delta(Design.md 原组件)
- 白底 24px 圆角 20px padding;大数字 Ink(26px 无衬线 480 或 Hero 衬线),caption Graphite 13px,delta 12px 箭头。
- 仅用于数据密集 KPI;金额与一般指标 delta 约定见 §5.3。

### 5.5 Stepper 阶段导航(核心骨架,颜色改 Ink)
- 结构/交互沿用 v1(已过审):sticky `top-[64px] z-30 bg-white/90 backdrop-blur border-b`;5 节点 签约→装修→在售→已售→已下架。
- 节点状态(**chrome 从蓝改 Ink**):

| 状态 | 样式 |
|------|------|
| 已完成 | 32px 圆 `bg-ink text-white`,内 `Check` 白图标;连接线 `bg-ink` |
| 当前 | 32px 圆 `bg-card border-2 border-ink text-ink ring-4 ring-ink/10`;label `text-ink font-medium(500)` |
| 解锁未到 | 32px 圆 `bg-card border border-dove text-graphite`;label Graphite;可点击切换 |
| 锁定 | 同"解锁未到" + `Lock` 图标 + `opacity-50 cursor-not-allowed` + `aria-disabled`,不响应交互 |

- 连接线:2px(`h-0.5`),已完成段 `bg-ink`,其余 `bg-dove`。
- 节点间距 8px;sm(<640)横向滚动 `overflow-x-auto scrollbar-hide min-w-[520px]`,节点缩至 28px。

### 5.6 状态徽标
- 统一 pill(9999px):`h-6 px-3 text-xs font-medium rounded-full border` + 状态浅底类(§2.3)。
- 徽标文字建议加深一档保对比(§2.3 可访问性建议)。
- 位置:Header 项目名旁、文书分组状态 pill、表格/行内状态。

### 5.7 文书 / 附件卡
- 分组网格:`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4`。
- 组卡:白底 24px 圆角 20px padding 签名阴影;头 = 组名(无衬线 15px 500 Ink)+ count pill + 状态 pill;体 = 文档行列表。
- 文档行:左 `FileIcon`(Graphite)+ 文件名(truncate)+ 大小/日期(Graphite 12px);右侧 icon 操作(预览/下载/删除),默认隐藏、行 hover 显示;删除需 AlertDialog 或行内二次确认。
- 上传:虚线 dropzone(16px 圆角,`border-dashed` 1px Dove),拖拽高亮 `ring-2 ring-ink/25`;压缩上传带进度条;失败行红字 + 重试。
- 归档:归档后仅可上传附件,不可改行内字段(权限态)。

### 5.8 图片网格
- 网格:`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3`。
- 缩略图:`aspect-[4/3] rounded-[12px] object-cover`,骨架 `bg-fog animate-pulse`。
- hover 操作:overlay(`bg-black/40`)+ 预览/下载/删除 icon 按钮;批量模式左上 checkbox,底部批量操作条。
- 上传 tile:虚线 16px 圆角 + 进度环/进度条 + 错误态(红描边 + 重试)。
- 预览:全局共用 Dialog `max-w-4xl h-[75vh]`(沿用现有)。

### 5.9 CTA 层级(每屏 filled ≤1)
| 层级 | 样式 | 场景 | 数量约束 |
|------|------|------|---------|
| 主(Filled,唯一填充) | **Ink `#17191c` 底白字,9999px 胶囊**,padding 8px 20px,15px/450,字距 -0.009em(数字/英文) | 阶段流转 CTA(交接/上架/成交) | **每屏 ≤1**(全局唯一常驻) |
| 次(Outline) | Ink 描边 1px + Ink 文字,9999px 胶囊或 12px 圆角 | 编辑、取消、次要操作 | 不限 |
| 弱(文字链) | Ink 文字链(无边框无底),配主 CTA 右侧 | 返回、文本操作、预览/下载 | 不限 |
| 危险(Destructive) | **描边式**:`text-error border border-error/40 rounded-full`;仅在 AlertDialog 内/危险区;不做填充红 | 删除、结束项目 | 仅在确认态 |

- **阶段流转 CTA(全局唯一主 CTA,常驻)**:
  - 签约 →「交接确认」(选交房日期)→ renovating
  - 装修 →「上架」(日期+挂牌价)→ selling
  - 在售 →「确认成交」(日期+价格)→ sold;副 CTA「结束项目」用**危险描边**→ ended
  - 已售/已下架 → 无流转 CTA,仅「编辑(已售)」outline /「删除」危险描边
- Header 主操作(编辑/删除)**一律 outline/文字链**,不得与阶段 CTA 构成第二个 filled。
- loading:按钮内 `Loader2 animate-spin`;disabled:`opacity-50 pointer-events-none`。

### 5.10 表单输入
- 白底、**16px 圆角**、高 40–44px、padding 0 14px、1px Dove 描边、14px 正文。
- focus:`outline:none; border-color:#17191c; box-shadow:0 0 0 3px rgba(23,25,28,.15)`(Ink 焦点,替代蓝)。
- error:`border-color:#ef4444; box-shadow:0 0 0 3px rgba(239,68,68,.12)`。
- Select / DatePicker 同输入样式;图标用 Graphite。

### 5.11 Sticky 行为(结构不变)
| 元素 | 行为 |
|------|------|
| 全局 Header | `sticky top-0 z-40 bg-white/90 backdrop-blur border-b` |
| 阶段 Stepper | `sticky top-[64px] z-30 bg-white/90 backdrop-blur border-b` |
| 底部操作栏(在售) | `sticky bottom-0 bg-white/90 backdrop-blur border-t`,内容与容器对齐 |
| 图片预览 Dialog | 普通 Dialog,z 层高于一切 |

---

## ⑥ 响应式断点策略(结构不变,仅视觉值更新)

| 断点 | 布局 | 说明 |
|------|------|------|
| **xl ≥1280**(主设计) | 双栏(主 2/3 + 侧 1/3);KPI 4 列;附件 3 列;图片 4 列;容器 `max-w-[1200px]` | 桌面优先基准 |
| **lg 1024–1279** | 双栏(主 2/3 + 侧 1/3);KPI 3 列;附件 2–3 列;图片 3–4 列 | 双栏下限 |
| **md 768–1023** | 单栏(侧栏堆主栏后);KPI 2 列;附件 2 列;图片 3 列 | 阶段导航保持完整横向 Stepper |
| **sm <640** | 单栏;KPI 1–2 列;附件 1 列;图片 2 列;Stepper 横向滚动折叠(`min-w-[520px]` + `scrollbar-hide`);Header 次要操作收进 DropdownMenu 或 icon-only;容器 `px-4` | 移动端特化 |

- 断点遵循 Tailwind 默认:`sm 640 / md 768 / lg 1024 / xl 1280`。
- 双栏切换只依赖 `lg`;内容容器始终 `mx-auto`。
- 视觉自适应:卡片 24px 圆角、签名阴影在窄屏可轻微收敛(圆角≥12px 即可),但默认保持一致。

---

## ⑦ 可访问性

| 项 | 规范 |
|----|------|
| 焦点可见 | 所有可交互元素 `focus-visible:ring-2 ring-ink/35 ring-offset-2 ring-offset-white`;Ink 填充按钮上改用 `ring-white/60`;表单 focus 见 §5.10 |
| 触控目标 | icon-only 按钮 ≥32px(建议 36px);主按钮 ≥36px 高 |
| 对比度 | 正文 Ink on 白 ~17:1;次要 Ash `#4c4c4c` ~9:1;三级 Graphite `#777b86` ~4.6:1(≥4.5 AA);状态徽标文字加深一档保 ≥4.5:1(§2.3) |
| 不只靠颜色 | 状态 = 徽标文字 + 色;Stepper = 数字/Check/Lock 图标 + 色 + 文字;金额 = 数字 + 符号 ↑/↓ + 色 |
| 禁用 | `opacity-50 cursor-not-allowed` + `aria-disabled`(Stepper 锁定节点) |
| 加载 | 骨架 `bg-fog animate-pulse`(替换 v1 `bg-muted`);区块骨架固定宽高防 CLS;按钮内 `Loader2` |
| 空态 | icon(Graphite)+ 主文案(Ink)+ 次文案(Graphite)+ 可选 CTA;图片空 = 虚线 tile +「暂无照片」 |
| 错误态 | 行内 `text-error text-xs` + 16px 圆角 error 描边;上传失败红描边 + 重试;表单错误 sonner toast |
| 动效 | 过渡 150–200ms ease;尊重 `prefers-reduced-motion`(globals 已内置) |
| 语义标签 | icon-only 按钮(返回/删除/预览/下载)一律 `aria-label` |

---

## ⑧ Anti-Slop 约束(v2 更新版)

1. **衬线仅页面级标题(3 处)**:项目名标题 / 大分区标题 / Hero 级醒目数字;禁用于卡标题、正文、标签、表格、按钮、表单;衬线字号 <17px 禁用。
2. **每屏 filled 按钮 ≤1**:仅阶段 CTA(Ink 胶囊);编辑/删除/结束项目一律 outline / 文字链 / 危险描边。
3. **wash 每屏各 ≤1**:apricot / sky 仅作数据卡底,不作普通卡背景、不作装饰 wash。
4. **无渐变**:hero 暖色径向渐变禁用于 admin;按钮/卡片无渐变(进度条渐变可沿用现有)。
5. **无营销 hero**:无 64px+ 衬线标语、无环绕浮卡、无营销大图。
6. **状态色冻结**:5 色走 `status-colors.ts`,不新造、不改值;徽标固定浅底 pill。
7. **金额红涨绿跌冻结**:`money-positive=红 / money-negative=绿`,禁止反转。
8. **圆角纪律**:全页 ≥12px;卡片 24 / 输入 16 / 图片 12 / 胶囊 9999;禁锐角、禁回到 v1 的 8–14px。
9. **边框 ≤1px**:卡片外框用签名阴影 1px 环,分隔靠表面色差 + 圆角,不叠粗描边。
10. **主 CTA = Ink**:`#17191c`;蓝 `#005daa` 仅业务状态 + 必要链接;UI chrome 不引入饱和蓝/绿/红。
11. **无衬线不 bold**:UI 用 450/480/500 微字重阶梯,禁 700+ 作常规手段。
12. **字距纪律**:中文 0;负字距仅英文/数字(-0.01 ~ -0.025em)。
13. **数字对齐**:金额/百分比/天数一律 `tabular-nums`;不再默认 `font-mono`(仅编号/合同号可保留)。
14. **不重造组件结构**:仅改视觉(圆角/色板/字体/阴影/胶囊),结构、交互、sticky、断点全沿用已过审设计稿。
15. **零影响全局**:新 token 以页面作用域注入,不改 `:root`、不影响列表页与全局组件。

---

## ⑨ Agent Prompt Guide(供原型构建师)

**快速色板**
- 画布 `#f7f7f8`(Fog)/ 卡片 `#ffffff` / 描边 `#a3a6af`(Dove)/ 主文字 `#17191c`(Ink)/ 次要 `#4c4c4c`(Ash)/ 三级 `#777b86`(Graphite)
- 强调:filled=`#17191c`(Ink)/ 暖=Rust `#5d2a1a` / 暖卡底 `#fbe1d1`(apricot-wash)/ 冷卡底 `#d3e3fc`(sky-wash);蓝 `#005daa` 仅状态+链接
- 状态:签约 `#005daa` / 装修 `#f97316` / 在售 `#10b981` / 已售 `#64748b` / 已下架 `#78716c`(浅底徽标 `bg-*/10 + text-* + border-*/20`)
- 语义:成功 `#059669` / 警告 `#d97706` / 错误 `#ef4444` / 金额正红 `#ef4444` / 金额负绿 `#10b981`

**关键 CSS 变量(页面作用域)**
```css
--canvas:#f7f7f8; --card:#ffffff; --popover:#ffffff;
--ink:#17191c; --ash:#4c4c4c; --graphite:#777b86; --dove:#a3a6af; --rust:#5d2a1a;
--apricot-wash:#fbe1d1; --sky-wash:#d3e3fc;
--border-subtle:rgba(163,166,175,.35); --input-border:#a3a6af;
--font-display:"Noto Serif SC","Songti SC",Georgia,"Times New Roman",serif;
--font-sans:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
--radius-card:24px; --radius-image:12px; --radius-input:16px; --radius-pill:9999px;
--shadow-card:0 0 0 1px rgba(4,23,43,.05), 0 20px 25px -5px rgba(0,0,0,.1), 0 8px 10px -6px rgba(0,0,0,.1);
```

**页面骨架示例 Prompt**
> `bg-[#f7f7f8] min-h-screen`;sticky Header(`top-0 z-40 bg-white/90 backdrop-blur border-b`,返回 + **衬线项目名(26px,Noto Serif SC)** + 状态徽标 + outline 编辑/删除);其下 sticky Stepper(`top-[64px] z-30`,签约→装修→在售→已售→已下架,完成/当前态 Ink,锁定态 Lock);内容 `mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 py-6 space-y-8`;≥lg 双栏 `grid lg:grid-cols-3 gap-5`,主栏 `lg:col-span-2`,侧栏 `space-y-5`;底部(在售)`sticky bottom-0 border-t bg-white/90 backdrop-blur` 操作栏。

**组件 Prompt 要点**
- 卡片:`bg-white rounded-[24px] p-5` + 签名三层阴影(无边框)。
- 大分区标题:衬线 `22px font-semibold text-[#17191c]`,中文 0 字距。
- KPI 卡:`rounded-[24px] p-5 shadow-card` + `text-[26px] font-[480] tabular-nums` 大数字 + `text-[13px] text-[#777b86]` 标签 + 12px delta 箭头(金额红涨绿跌/一般指标正绿负红)。
- 附件分组:`grid sm:grid-cols-2 xl:grid-cols-3` 组卡(24px 圆角),头 = 组名(15px 500)+ count + 状态 pill,行 hover 显操作。
- 图片网格:`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 aspect-[4/3] rounded-[12px]`,hover overlay + 操作,批量 checkbox + 底部批量条。
- Stepper 节点:`h-8 w-8 rounded-full border-2`,完成 `bg-[#17191c]` + Check,当前 `border-[#17191c] ring-4 ring-[#17191c]/10`,锁定 `Lock` + `opacity-50 cursor-not-allowed`。
- 输入:`h-10 rounded-[16px] border border-[#a3a6af] px-3.5`,focus `border-[#17191c] shadow-[0_0_0_3px_rgba(23,25,28,.15)]`。
- 主 CTA:`bg-[#17191c] text-white rounded-full px-5 py-2 text-[15px] font-[450]`(每屏 ≤1);次级 = outline 胶囊;删除/结束 = 危险描边(`text-[#ef4444] border border-[#ef4444]/40 rounded-full`)。

---

*本令牌文档为 Phase 2 交付物(Step A),替代 v1 `design-tokens.md` 的地位,供 Phase 3 原型构建师直接消费。视觉全面对齐 DESIGN.md(Steep);业务状态色/金额红涨绿跌/断点/可访问性结构冻结。若与需求摘要或现有组件行为冲突,以本文件 + `status-colors.ts` 为准并回传 team-lead 复核。*
