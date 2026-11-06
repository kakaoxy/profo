# `/admin/merchant/stores` 修复验证

- 日期：2026-11-06
- 依据：[审查报告](./README.md)（FAIL：6 个 P0 / 10 个 P1 / 10 个 P2）
- 范围：只修改 Web 门店列表页及其直接依赖的共享组件；未改 API、数据库结构或业务字段语义。
- 结论：**审查报告中的 P0 / P1 / P2 已逐项处理，相关 E2E 通过。**

## 1. 修复结果

### P0

| 编号 | 处理 |
|---|---|
| P0-01 字体链断裂 | `frontend/src/app/layout.tsx:36` 移除无效的 `font-(--font-sohne)`；`frontend/src/app/globals.css:348` 直接用 `var(--font-inter)`；新增 `.page-title` 明确 44px 档字距。实测 body 为 Inter、`document.fonts.check("16px Inter") === true`。 |
| P0-02 shadcn 默认组件语言 | 新增 `frontend/src/components/custom/steep-controls.tsx`：`SteepButton`（pill、15/450）、`SteepInput`（16px 圆角、15/450、44px 高）、`SteepSelectTrigger`（16px 圆角）。页面、抽屉、删除弹窗全部改用。 |
| P0-03 12/13px 与 700 字重 | 页面、抽屉、弹窗、筛选标签、状态 badge 最小字号统一为 14px；表头 14/450；标题 26/500；无 700。 |
| P0-04 11 列表格 | 改为 7 列：门店 / 区域·商圈 / 合作状态 / 审核状态 / 负责人 / 最近拜访 / 操作；固定列宽、`table-fixed`、表头不换行、名称/地址截断、数字 `tabular-nums`。1024 以下切换卡片列表，操作不再进入横向滚动盲区。 |
| P0-05 状态语言不一致 | 新增 `_components/store-status.ts` 统一 cooperation / review / store 的 label 与 tone；表格、卡片、抽屉共用 `StatusBadge`。`正常 / 已转正 / 未合作` 等徽标同义同色。 |
| P0-06 响应式 | 1440 表格；1024 / 768 / 390 卡片列表。实测三档 `pageWidth === viewport`、无横向溢出、12 张卡片、操作可见。 |

### P1

| 编号 | 处理 |
|---|---|
| P1-01 版心 | `PageContainer` 由 `max-w-400` 改为 `max-w-[1200px]`，桌面左右 32px padding。 |
| P1-02 次要动作 | 导出 CSV、编辑、取消、清空、重试、分页全部改 text link；每屏只有一个 Ink filled “新建门店”。 |
| P1-03 筛选墙 | 11 个控件收敛为：搜索 + 门店状态 + 审核状态 + 高级筛选 + 清空 + 查询；高级区 6 个字段有可见 label 和 aria-label；已选项以可移除 chip 展示。 |
| P1-04 卡片阴影 | 页面卡片统一 `shadow-steep`（DESIGN 三层阴影），移除 `shadow-steep-sm` 使用。 |
| P1-05 侧栏 | `defaultOpen`、240px（`--sidebar-width: 15rem`）；导航 15/450、图标 16px、active 用 Ink/5 底色而非白卡阴影。 |
| P1-06 H1 | 移动与桌面均 44px/400；44px 字距 -0.015em（实测 -0.66px）。 |
| P1-07 loading / empty / error | 加载 skeleton + `aria-busy`；错误 Apricot/Rust + 重试；空态清空筛选 + 新建；分页单页不显示翻页按钮。 |
| P1-08 键盘与 ARIA | 整行可点击打开详情，点击按钮/菜单不会误触发行事件；门店名按钮提供键盘入口；操作收入菜单，删除/详情有可读名称；两个 Select 与搜索框有 aria-label；筛选字段有可见标签。 |
| P1-09 error / ring | `--error` 改 Rust `#5d2a1a`、`--error-container` 改 Apricot Wash、`--ring` 改 Ink；移除饱和红 `#ef4444`。 |
| P1-10 卡片 padding | 列表卡、筛选卡统一 `p-5`（20px）；表格内层 16px 圆角容器。 |

### P2

- 10px 间距改为 4px 网格；`mr-1` 图标偏移移除（Button 自身 `gap-2`）。
- 查询图标由 `RefreshCw` 改 `Search`；日期不再使用原生 `mm/dd/yyyy`，改为文本输入 + `YYYY-MM-DD` 提示；日期显示统一 `YYYY/MM/DD HH:mm`。
- 数字/日期使用 `tabular-nums`；单页只显示“第 1 / 1 页”；删除进入“更多操作”菜单；2px 边框改 1px；`加载中...` 改中文省略号。
- 页面区块与同一工作区统一使用移动 24 / 桌面 32 间距；实测 `header → filter = 32px`、`filter → list = 32px`，不再出现标题区、筛选区、列表区间距不一致。

## 2. 验证证据

| 检查 | 命令 | 结果 |
|---|---|---|
| 类型 | `cd frontend && pnpm typecheck` | 通过 |
| Lint | `cd frontend && pnpm lint` | 通过（0 warnings） |
| 门店主 E2E | `pnpm exec playwright test e2e/merchant-store-admin-v7.spec.ts --workers=1` | 3 passed |
| 关联筛选/删除/抽屉 E2E | `pnpm exec playwright test e2e/merchant-iteration1.spec.ts e2e/merchant-iteration7.spec.ts --grep "Q4 后台门店列表\|门店软删除\|门店详情抽屉" --workers=1` | 3 passed |
| 全量商户域 E2E（最终工作区） | `pnpm exec playwright test e2e/merchant-*.spec.ts --workers=2` | 46 passed / 3 skipped / 3 failed / 13 did not run；3 个失败均在公司页，与并行未提交的公司页重构有关，门店相关用例全部通过 |

关键计算样式（完整原始值见 [fixed-stores-metrics.txt](./evidence/fixed-stores-metrics.txt)）：

- 1440：`bodyFont = inter, "inter Fallback", ...`；`interLoaded = true`；`h1 = 44px/400/-0.66px Source Serif`；`containerWidth = 1200`；`minVisibleFont = 14`；`filledButtonCount = 1`（新建门店）；7 个表头高度均为 48px。
- 1024 / 768 / 390：`visibleTable = false`、`visibleCards = 12`；`pageWidth === viewport`；无横向溢出；`filledButtonCount = 1`。
- 高级筛选：桌面 3 列两行，6 个字段均有可见标签；日期占位完整。
- 状态一致性：列表、卡片、抽屉共用 `store-status.ts` 映射。

## 3. 修复后截图

### 1440 桌面

![1440 门店列表](./fixed/01-desktop-1440.png)

### 1440 高级筛选

![1440 高级筛选](./fixed/02-desktop-1440-advanced.png)

### 1024 平板（卡片列表）

![1024 门店列表](./fixed/03-tablet-1024.png)

### 390 移动端（卡片列表）

![390 门店列表](./fixed/04-mobile-390.png)

### 门店详情抽屉

![1440 门店抽屉](./fixed/05-drawer-1440.png)

### 删除门店弹窗

![删除门店弹窗](./fixed/06-delete-dialog.png)

## 4. 边界与已知问题

- 本轮只覆盖 `/admin/merchant/stores` 与其直接共享组件；未改动其他后台页面的既有视觉。全仓 170 项 E2E 回归中另有 9 项非门店模块失败（审计日志空态、营销调价、项目弹窗、楼盘字典导入/KPI/分页、字典选择器、线索表头），不在本轮范围，未在本轮处理。
- 最终全量商户套件另有 3 个**公司页**用例失败：工作区中的 `frontend/src/app/(main)/admin/merchant/companies/` 正处于并行重构（含未跟踪新文件），搜索框 copy 已从「按公司名称搜索」改为「搜索公司名称」，旧断言失配。该目录不是本任务改动，未修改或回滚；门店相关用例均通过。
- DESIGN 自身已记录的 M8 未消除：Graphite `#777b86` 在白底约 4.23:1、Fog 底约 3.95:1，仍低于 WCAG AA 4.5；这是 DESIGN token 层问题，不在本页私自改色。
- 截图中的 `SHOT... / DBG... / 【审计】...` 是测试库数据，不是 UI 缺陷。
- 右上角黑色 `N` 是 Next.js 开发工具浮层，不是页面元素。
