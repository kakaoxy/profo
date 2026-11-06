# 公司页面修复验证

- 页面：`/admin/merchant/companies`
- 验证日期：2026-11-06
- 验证方式：Next.js dev server（`:3000`）+ FastAPI（`:8000`）+ Playwright Chromium 真机浏览器
- 结论：**通过**（类型、lint、构建、四断点布局、创建/编辑/删除、加载/错误态均验证）

## 1. 静态检查

| 命令 | 结果 |
| --- | --- |
| `pnpm typecheck`（`tsc --noEmit`） | 通过，0 error |
| `pnpm lint`（`eslint src --ext .ts,.tsx --max-warnings 0`） | 通过，0 warning |
| `pnpm build`（`next build`） | 通过，15/15 静态页生成成功 |

## 2. 四断点布局

数据来源：[`companies-final-metrics.json`](./companies-final-metrics.json)。所有宽度均无横向溢出，页面背景为 Fog，整页只有 1 个 Ink 实心主按钮。

| 视口 | `docScrollWidth` | 表格模式 | 表格宽度 | 主按钮数 | 实际字号 |
| --- | --- | --- | --- | --- | --- |
| 1440 × 1000 | 1440 = viewport | 桌面表格 | 1096px（容器 1096/1096） | 1 | 14 / 15 / 16 / 44px |
| 1024 × 900 | 1024 = viewport | 卡片列表 | — | 1 | 14 / 15 / 16 / 44px |
| 768 × 900 | 768 = viewport | 卡片列表 | — | 1 | 14 / 15 / 16 / 44px |
| 390 × 844 | 390 = viewport | 卡片列表 | — | 1 | 14 / 15 / 16 / 44px |

- 页面根背景：`rgb(247, 247, 248)`（Fog）。
- 页面内无 12px 文本。
- 桌面表格使用 `table-fixed`，1440 下容器与表格同宽，无隐藏列。
- 390 下打开“新建公司”Sheet：`x=0 / width=390 / right=390`，`documentElement.scrollWidth=390`。
- 键盘焦点：Tab 顺序为页头主按钮 → 搜索输入 → 状态选择 → 查询；搜索框 `:focus-visible` 时边框变为 Ink `rgb(23,25,28)`，按钮显示 2px 焦点环。

## 3. 交互验证

验证流程（公司名自动生成，验证后已删除）：

1. 新建公司 `E2E-UI-公司-1793955917643`，填写公司名称、联系人、联系电话、备注。
2. 按公司名称搜索并确认唯一结果。
3. 编辑联系人，状态改为“停用”，保存后列表显示停用。
4. 打开行操作菜单，填删除原因，确认删除。
5. 删除后按公司名搜索，结果为空。
6. 390 宽度打开新建 Sheet，确认全宽、无横向溢出，Esc 关闭。

结果：`errors=[]`，创建/搜索/编辑/停用/删除全部通过。

## 4. 状态验证

- 加载态：将列表接口延迟 2500ms，截取 `11-loading-1440.png`，显示表格骨架 + 筛选区，不显示“暂无数据/1 / 1”矛盾分页。
- 错误态：将列表接口置为 HTTP 500（`{"code":1,"message":"服务器内部错误"}`），截取 `12-error-1440.png`，显示「公司列表加载失败：服务器内部错误」+「重试」，不显示空态表格。
- 空态：搜索 `ZZZ_NO_MATCH_999`，截取 `07-empty-1440.png` 与 `13-empty-390.png`，显示「没有符合条件的公司」+「清空筛选 / 新建公司」，移动端 `docScrollWidth=390`。
- 删除弹窗：`06-delete-dialog-1440.png`，标题 26/500、24px 圆角、可见“删除原因”标签。
- 编辑 Sheet：`05-edit-sheet-1440.png` / `09-edit-filled-1440.png`，表单全宽一致、状态 Select 与输入框同宽。

## 5. 关键 token 实测

数据来源：[`companies-token-metrics.json`](./companies-token-metrics.json)。

| 元素 | 实测 |
| --- | --- |
| 页面画布 | `rgb(247, 247, 248)`（Fog） |
| h1 | 44px / 400 / 48.4px / -0.66px |
| 筛选卡、表格卡 | 白色，24px 圆角 |
| 搜索框 | 44px 高，16px 圆角，15/450 |
| 主按钮“新建公司” | 40px 高，胶囊（9999），Ink `rgb(23,25,28)`，白字 15/450 |
| 表头 | 14px / 450 / Graphite |
| 表格行高 | 84px |
| 新建/编辑 Sheet | 560px 宽，24px 左侧圆角，标题 26/500 |
| 删除弹窗 | 440px 宽，24px 圆角，标题 26/500，输入 44px 高 / 16px 圆角 |

## 6. 截图索引

| 文件 | 内容 |
| --- | --- |
| `01-desktop-1440.png` | 1440 桌面列表（Fog 画布 + 白色卡 + 唯一主按钮） |
| `02-desktop-1024.png` | 1024 列表（卡片布局） |
| `03-desktop-768.png` | 768 列表（卡片布局） |
| `04-mobile-390.png` | 390 移动端列表 |
| `05-edit-sheet-1440.png` | 编辑 Sheet |
| `06-delete-dialog-1440.png` | 删除弹窗 |
| `07-empty-1440.png` | 搜索空态 |
| `08-create-sheet-1440.png` | 新建 Sheet（已填写） |
| `09-edit-filled-1440.png` | 编辑 Sheet（已改状态） |
| `10-create-sheet-390.png` | 390 新建 Sheet |
| `11-loading-1440.png` | 加载骨架 |
| `12-error-1440.png` | 接口错误态 |
| `13-empty-390.png` | 390 搜索空态 |

## 7. 复验命令

```bash
cd frontend
pnpm typecheck
pnpm lint
pnpm build

# 复验脚本已归档在 tmp/unslop/verification-scripts/，复制到 frontend 后运行
cp ../tmp/unslop/verification-scripts/.verify-*.mjs .
node .verify-companies.mjs
node .verify-interactions.mjs
node .verify-states.mjs
node .verify-tokens.mjs
```

> 注：Playwright 脚本依赖根目录 `.env` 的 `TEST_USERNAME` / `TEST_PASSWORD`；它们属于临时验证工具，不参与应用构建。截图、metrics JSON 与 token JSON 为最终可复验工件。
