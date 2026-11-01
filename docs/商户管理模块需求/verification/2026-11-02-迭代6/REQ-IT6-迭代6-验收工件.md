# REQ-IT6 · 迭代 6 验收工件（2026-11-02）

> 需求来源：用户 2026-11-02 反馈（m03667）；需求台账见 `docs/商户管理模块需求/商户管理模块-需求与迭代记录.md` §12。
> 本轮改动全部落在**小程序视图层**（wxml / wxss / ts 常量），无法在浏览器里渲染，因此用例以「源码契约 + 静态规则」为主，并配合 `tsc`、E2E 回归与真机复测清单。

## 1. 需求 ↔ 用例映射

| 需求 | 验收要点 | 自动化用例 |
|---|---|---|
| REQ-IT6-01 | 卡片不显示详细地址、右侧「＋ 拜访」直达拜访录入 | `frontend/e2e/merchant-iteration6.spec.ts` 用例 1 |
| REQ-IT6-02 | 六项动作改内联 SVG 图标、「佣金结算」替换「补录照片」并与「合作协议」换位；补录入口按反馈彻底移除、改由「编辑门店」承担 | 用例 2 |
| REQ-IT6-03 | 11 个商户页配色对齐 DESIGN.md（hero 白底、卡片三层阴影、次要动作降级） | 用例 3 |
| REQ-IT6-BUG-01 | WXSS 主题引入相对路径必须能从各自文件解析（修小程序打不开） | 用例 3 的路径解析断言 |

运行：

```bash
cd frontend
npx playwright test e2e/merchant-iteration6.spec.ts --reporter=line
# 3 passed (489ms)
```

## 2. 自动化结果（2026-11-02 实测）

| 检查 | 命令 | 结果 |
|---|---|---|
| 新增用例 | `npx playwright test e2e/merchant-iteration6.spec.ts` | **3 passed (489ms)** |
| merchant 回归（11 spec） | `npx playwright test e2e/merchant-iteration1.spec.ts e2e/merchant-iteration2.spec.ts e2e/merchant-iteration4.spec.ts e2e/merchant-iteration5.spec.ts e2e/merchant-iteration6.spec.ts e2e/merchant-admin-forms.spec.ts e2e/merchant-company-admin.spec.ts e2e/merchant-store-admin-v7.spec.ts e2e/merchant-store-activation.spec.ts e2e/merchant-map-tracks.spec.ts e2e/building-dict-region-dicts.spec.ts --workers=1` | **38 passed (32.9s)** |
| 小程序类型 | `cd miniapp && npx tsc --noEmit` | 零错误 |
| 前端类型 | `cd frontend && npx tsc --noEmit` | 零错误 |
| 前端 lint | `cd frontend && pnpm lint` | 0 error / 0 warning |
| 新增用例 lint | `npx eslint e2e/merchant-iteration6.spec.ts` | 无输出 |

## 3. 反向验证（证明用例能拦住回退）

| 反向改动 | 期望 | 实测 |
|---|---|---|
| `home/index.wxml` 加回 `<text>{{item.address}}</text>` | REQ-IT6-01 失败 | `1 failed`（`expect(wxml).not.toContain("item.address")`） |
| `store/detail/index.ts` 的 `visit` 图标换成 `https://at.alicdn.com/visit.svg#` | REQ-IT6-02 失败 | `1 failed`（远程图标断言命中） |
| `store/detail/index.wxss` 的 hero 恢复 `background: var(--ink); color: var(--pure-white)` | REQ-IT6-03 失败 | `1 failed`（`.hero 仍是深色底`） |
| 某深层页 theme 引入改回 `../../../`（复现用户报的编译错误） | REQ-IT6-03 失败 | `1 failed`，报告「theme 路径无法解析」 |
| 详情页加回 `bindtap="onAddPhotos"` | REQ-IT6-02 失败 | `1 failed`（补录入口不应存在） |

五处临时改动均已还原，还原后重新执行 `3 passed`。

## 4. 真机复测清单（人工，未执行）

| # | 步骤 | 期望 |
|---|---|---|
| 1 | 首页门店列表 → 点卡片右侧「＋ 拜访」 | 直接进入该门店的拜访录入页（门店名已带出），且不额外跳一次详情页 |
| 2 | 门店详情 → 观察动作区六个图标 | 六个图标离线可见（断网/飞行模式仍显示），无空白方块 |
| 3 | 门店详情 → 点「佣金结算」 | 弹出「佣金结算功能下一期开发」提示，无报错、无假数据 |
| 4 | 门店详情 / 各类下级页 → 观察配色 | hero 为白底墨字 + 柔和投影；页面内只有一个深墨填充按钮（页脚主 CTA）；状态页按钮为文字链接 |
| 5 | 门店详情 → 门店照片区块 | 只展示照片，无补录按钮；空态提示「暂无门店照片，可在「编辑门店」中补充」；到「编辑门店」可增删照片并保存成功 |
| 6 | 小屏机型（iPhone SE 尺寸）首页卡片 | 「＋ 拜访」热区不误触卡片跳转，按钮与箭头不重叠 |

## 5. 数据与清理

- 本轮新增用例只读源码，不写数据库，无需清理。
- 回归用例沿用既有 `E2E_MARK` 清理逻辑（`afterAll` 中按标记删门店/公司/经纪人/协议）。

## 6. 已知偏差

1. 「补录照片」按钮已按用户后续反馈（m03878）彻底移除，照片增删统一在「编辑门店」页完成；详情页空态文案引导用户去编辑门店。
2. 「佣金结算」为占位入口，无数据、无接口；下一期需补模型与页面。
3. 照片维护改为「编辑门店」内完成（低频动作），详情页不再提供入口；若现场需要高频补拍需重新评估。
4. 用例只校验样式声明是否符合规则，不覆盖渲染结果（例如写了 `width: 90%` 仍会通过；阴影在不同机型的观感无法自动化）。
5. `miniapp/utils/config.ts` 中 `develop` 指向本机 `http://192.168.110.102:8000/api/v1`（开发者本地联调改动，非本轮引入），提交前需切回线上域名。
