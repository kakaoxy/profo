# Admin Marketing 重设计落地验证

日期：2026-11-07

## 验证环境

- 前端：`http://127.0.0.1:3000`
- 后端：`http://127.0.0.1:8000`
- 浏览器：Chrome headless / Playwright

## 页面截图

- `list.png`：营销列表页（概览卡、筛选工具条、7 列表格、浏览统计列）
- `detail.png`：房源详情页（392px 画廊、房源档案、浏览统计卡、调价卡）
- `create.png`：创建新房源（Listing studio、3 步 flowline、客户端预览、sticky 操作条）
- `edit.png`：编辑房源（房源编辑室、dirty bar、客户端预览、sticky 操作条）
- `mobile-detail.png`：390×844 移动端详情页（无横向溢出）
- `detail-delete-dialog.png`：详情页右上角「删除」入口与二次确认弹窗

## 自动化检查

```bash
cd frontend
pnpm exec tsc --noEmit --pretty false
pnpm lint

cd ../backend
.venv/bin/ruff check .
.venv/bin/ruff format --check .
```

结果：TypeScript 无错误、ESLint 通过、Ruff 全部通过。

## 交互复验要点

1. 列表搜索「不存在的房源zzz」→ 显示「没有匹配的房源」，行数 0。
2. 列表切换「画廊」→ 4 列画廊；切换「新上房源」→ 数据过滤。
3. 详情页点「调整价格」→ 内联表单出现「新总价（万）」与「确认调价」。
4. 编辑页修改标题 → 出现「N 项修改待保存」；取消 → AlertDialog「未保存的修改将丢失」。
5. 移动端 390×844：`document.documentElement.scrollWidth === 390`，无横向溢出。
6. 详情页右上角「删除」→ AlertDialog「确认删除…」；点「取消」停留在详情页。

## 生产构建

```bash
cd frontend
pnpm build
```

结果：构建成功，`frontend/.next/BUILD_ID` 已生成。
