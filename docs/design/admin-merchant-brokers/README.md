# 经纪人管理 · 设计稿（REQ-IT7-03）

## 1. 范围

对 `admin/merchant/brokers` 模块做一次视觉与交互重设计，交付物是**可点击的高保真原型**，评审通过后再落到 React 代码。

- 列表页（KPI、待审核绑定、筛选、经纪人表格、分页）
- 右侧详情抽屉（绑定信息、基本信息、绑定历史、换绑/解绑/停用）
- 新建 / 编辑弹层
- 响应式：≥1100px 四列 KPI，窄屏两列；≤760px 隐藏侧栏、表格横向滚动

## 2. 设计依据

以仓库 `DESIGN.md` 为唯一视觉来源，未引入规范外的新 token：

| 用途 | 取值 |
| --- | --- |
| 画布 / 卡片 | `#f7f7f8` Fog / `#ffffff` Pure White |
| 文字 | `#17191c` Ink（标题与主 CTA 文字）、`#4c4c4c` Ash、`#777b86` Graphite |
| 强调 | `#5d2a1a` Rust（文字链接、危险动作） |
| 浅色块 | `#fbe1d1` Apricot Wash、`#d3e3fc` Sky Wash |
| 圆角 | 卡片 24px、输入框 16px、按钮/徽标 9999px |
| 字体 | 标题 Signifier 风格衬线（Songti SC 回退），正文 Sohne 风格无衬线（系统字体回退） |
| 阴影 | 1px 墨色内描边 + 20/25 + 8/10 两级投影 |
| 按钮 | 一屏只保留 1 个 Ink 填充 CTA（右上「新建经纪人」），其余一律文字链接（DESIGN 的 Text Link Button 规则） |

## 3. 文件

| 文件 | 说明 |
| --- | --- |
| `index.html` | 自包含高保真原型（无外链依赖，含交互脚本） |
| `_d_meta.json` | 设计资产登记（`record-asset.mjs` 生成，状态 needs-review） |

## 4. 预览

```bash
cd /Users/bugco/Desktop/profo
python3 -m http.server 4311 --directory designs
# 打开 http://localhost:4311/admin-merchant-brokers/index.html
```

已用 Chromium 1440×900 实测：无 console error，7 行数据正常渲染，抽屉与新建弹层可开合（Esc / 遮罩关闭）。

## 5. 交互说明

- 表格整行点击打开右侧抽屉；抽屉底部「编辑资料」进入编辑（原型中以 toast 模拟保存）。
- 「待审核绑定」卡片支持通过/驳回，并即时 toast。
- Tabs / 搜索 / 门店 / 来源均为客户端过滤，用于验证信息密度与空态。
- 空态：无匹配结果时展示「没有符合条件的经纪人」。

## 6. 待评审确认

1. KPI 四卡是否保留「待审核绑定」（也可只保留三张、把待审核并入 tabs）？
2. 详情抽屉的「绑定历史」是否需要展示审批意见全文（当前只显示一行摘要）？
3. 新建弹层是否允许直接选择门店（当前默认「暂不绑定」，与「待审核绑定」流程并存）？

## 7. 后续落地

评审通过后按 `admin/merchant/brokers/page.tsx` 现有数据结构改造：列表接口 `GET /admin/merchant/brokers`、详情/编辑/状态接口沿用，新增弹层复用现有新建接口；不引入新依赖，仍用 shadcn `Sheet` / `Dialog`。
