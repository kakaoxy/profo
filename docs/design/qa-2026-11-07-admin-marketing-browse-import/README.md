# admin/marketing 浏览统计与导入价格修复 · 验证记录

日期：2026-11-07
范围：`frontend/src/app/(main)/admin/marketing`、`backend` 营销项目聚合/导入链路

## 1. 详情页浏览统计

- 页面：`http://127.0.0.1:3000/admin/marketing/306`
- 期望：右辅栏「浏览统计」卡显示浏览次数（PV）与浏览人数（UV），草稿态不展示数字。
- 实测：浏览次数 `46 次`、浏览人数 `37 人`；接口 `GET /api/v1/admin/marketing/projects/306` 返回 `view_summary={"view_count":46,"visitor_count":37}`；列表接口不聚合该字段（`view_summary=null`）。
- 截图：[detail-view-stats.png](detail-view-stats.png)

## 2. 从项目库导入取挂牌价

- 页面：`http://127.0.0.1:3000/admin/marketing/new` → `从项目导入` → `选择项目` → 搜索「振兴大楼」→ 选择「振兴大楼 - 重庆北路235号305室」
- 期望：导入预览总价取挂牌价 `630 万`，而不是签约价 `580 万`；确认导入后表单总价回填 `630`、自动单价 `8.71 万/㎡`。
- 实测：预览显示「总价 630万元 / 单价 8.71万元/m²」；确认导入后 `total_price` 输入值为 `630`，`unit_price` 为 `8.71`。
- 接口：`POST /api/v1/admin/marketing/projects/import-from-l3/7cc5316f-49db-4c03-b8f0-8bc407b6a693` 返回 `total_price=630.00`（该记录 `signing_price=580.00`，`area=72.35`）。
- 截图：[import-price-630.jpg](import-price-630.jpg)

## 复验命令

```bash
# 类型与 lint
cd frontend && pnpm exec tsc --noEmit --pretty false && pnpm lint
cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check .

# 设计稿校验（如需）
/opt/homebrew/bin/node ~/.dsh/profiles/desktop/node_modules/dsh-claude-design/skills/claude-design/scripts/artifact.mjs \
  check docs/design/2026-11-07-admin-marketing-redesign
```

> 账号/密码从 `.env` 的 `TEST_USERNAME` / `TEST_PASSWORD` 读取，未写入本记录。
