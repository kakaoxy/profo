# 列表页「已售遮罩 + 无标签总价对齐」验证工件（2026-10-28）

对应页面：`miniapp/pages/projects/list/index`

## 改动

- 已售房源（`item.isSold`）封面新增全幅遮罩：`rgba(23, 25, 28, 0.62)`，居中白色胶囊「已售」，覆盖原封面图。
- `isSold` 由列表展示映射生成：`sold` tab 全量为已售；`all` tab 中 `project_status === "已售"` 为已售。
- `.list-price` 增加 `margin-left: auto`，无标签时总价仍贴卡片右侧，与有标签卡片对齐。

## 验证方式

采用仓库既有 Design QA 方式：真实 WXML/WXSS 编译器校验语法，再按相同类名/结构在 Chromium 375px@2x 复刻渲染并读取 DOM 实测值（微信模拟器受本机 CLI 登录态权限限制，未直接启动）。

复现命令（仓库根目录）：

```bash
# 1) 微信 WXML / WXSS 编译校验
cd miniapp
/Applications/wechatwebdevtools.app/Contents/Resources/app.asar.unpacked/node_modules/wcc-exec/wcc -d pages/projects/list/index.wxml -o /tmp/projects-list-wxml.js
/Applications/wechatwebdevtools.app/Contents/Resources/app.asar.unpacked/node_modules/wcc-exec/wcsc -lc pages/projects/list/index.wxss -o /tmp/projects-list-wxss.css

# 2) 修复前 / 后渲染测量
cd ..
node tmp/projects-list-verify/verify.mjs before
node tmp/projects-list-verify/verify.mjs after

# 3) 类型与测试
pnpm --dir miniapp tsc
pnpm --dir miniapp test
```

## 实测结果

| 指标 | 修复前 375px | 修复后 375px |
|---|---|---|
| 已售遮罩节点 | 无 | 存在，覆盖 `333 × 249.75px`（与封面同尺寸） |
| 遮罩文案 | — | 「已售」，中心偏移 `0 / 0px` |
| 遮罩底色 | — | `rgba(23, 25, 28, 0.62)` |
| 无标签卡片总价距卡片右缘 | `243.02px`（左对齐） | `21px` |
| 有标签卡片总价距卡片右缘 | `21px` | `21px` |
| 3 张卡片总价右间距范围 | `21 ~ 243.02px` | `21 ~ 21px` |
| WXML / WXSS 编译 | — | `wcc exit 0` / `wcsc exit 0` |
| `pnpm --dir miniapp tsc` | — | `exit 0` |
| `pnpm --dir miniapp test` | — | 45 files / 854 tests passed |

结论：`report-after.json` 的 `passed` 为 `true`；修复前可复现「无标签总价左对齐」和「已售无遮罩」，修复后两项指标均通过。

## 截图

- `comparison-375.png`：修复前/后同宽对比（左：无遮罩、无标签总价靠左；右：已售遮罩、总价统一右对齐）。
- `before-375.png`：修复前，首张已售卡无遮罩，且无标签卡总价靠左。
- `after-375.png`：修复后，首张已售卡显示居中「已售」遮罩；三张卡片总价均贴右。

## 备注

- 本验证覆盖样式/布局与 WXML 模板编译；未在微信开发者工具模拟器内做真机渲染，`icon`/字体等平台差异不在本次结论内。
- 遮罩底色与既有已售角标（`property-sheet/detail` 的 `.h-flag`、`property-sheet/landing` 的 `.sheet-flag--sold`）保持一致，均为 `rgba(23, 25, 28, 0.62)`。
