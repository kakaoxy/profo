# 详情页头部布局修复 · 验证工件（2026-10-28 四轮）

对应修复记录：[2026-10-28-小程序房源详情页-三状态-修复记录.md](../../../To-Do/2026-10-28-小程序房源详情页-三状态-修复记录.md) §六

## 改动

- 价格行：左 `detail-price-main`（价格 + 价格口径 chip），右 `detail-head-actions`（状态徽章 + 调价铃铛），水平同排、垂直居中。
- 标签行 `detail-chips-row` 仅在有 tags 时渲染，状态徽章不再位于标签行。

## 验证

复现命令（仓库根目录）：

```bash
node tmp/detail-header-verify/build.mjs
NODE_PATH="$PWD/frontend/node_modules" node tmp/detail-header-verify/verify.mjs
```

实测（`report.json`）：

| 指标 | 修复前 375px | 修复后 375px / 320px |
|---|---|---|
| 徽章是否在标签行 | 是 | 否 |
| 徽章与铃铛中心差 | 76.0px（上下堆叠） | 0～0.1px（水平同排） |
| 挂牌价 chip 与价格中心差 | 13.7px（下沉） | 0px（垂直居中） |
| 徽章与价格中心差 | — | 0～0.1px |
| 320/375 横向溢出 | — | 无 |
| 7 状态断言 | — | 7/7 全部通过 |

## 截图

- `comparison-375.png`：修复前/后同宽对比（上：上下堆叠；下：水平同排）。
- `before-on-sale-375.png`：修复前，「在售」徽章在标签行右侧、铃铛在价格行右侧，二者上下堆叠。
- `after-on-sale-375.png`：修复后，「在售 + 铃铛」同处价格行右侧。
- `after-renovating-375.png`：装修中态。
- `after-sold-375.png`：过往案例态（无铃铛）。
- `after-pending-375.png`：价格待定态。
- `after-long-price-320.png`：320px 长价格（¥ 12888 万）+ 双标签。
