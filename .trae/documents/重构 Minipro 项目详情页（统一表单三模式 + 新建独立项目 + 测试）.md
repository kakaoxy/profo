## 现状与差距（基于代码扫描）
- 当前 `/minipro/projects/[id]` 页面实际是“编辑页”，没有独立只读详情模式；表单逻辑散落在 `edit-form.tsx` 与多个 section 组件中。
- 表单 schema 只做了最基础校验（仅 title 必填），URL/数字范围/标签等规则缺失。
- “新建独立项目”按钮被禁用；虽已有 `createMiniProjectAction`，但没有创建页/弹窗。
- 照片渲染未使用后端 `final_url`，同步来源照片可能出现空图；照片的 `renovation_stage/description/sort_order` 目前不可维护。

## 字段对齐策略（严格映射后端 models/schemas）
- **MiniProject（可编辑字段）**：`title(必填)`、`cover_image`、`style`、`description`、`marketing_tags`、`share_title`、`share_image`、`consultant_id(关联顾问)`、`sort_order`、`is_published`。
- **MiniProject（只读展示字段）**：`id`、`project_id`、`address/area/price/layout/orientation/floor_info`、`view_count`、`published_at`、`created_at/updated_at`、`consultant`。
- **MiniProjectPhoto（详情页展示/可维护目标）**：`renovation_stage/description/sort_order/origin_photo_id/image_url/final_url/created_at`。

## 路由与页面重构（实现“新增/编辑/详情”三模式）
1. 调整路由结构：
   - `GET /minipro/projects/[id]` → **详情只读页**（mode=view）
   - `GET /minipro/projects/[id]/edit` → **编辑页**（mode=edit）
   - `GET /minipro/projects/new` → **新建独立项目页**（mode=create）
2. 抽一个服务端加载层（Server Component）负责并行拉取数据（避免瀑布）：
   - `getMiniProjectAction(id)`（edit/view）
   - `getConsultantsAction(page_size=100)`（create/edit/view）
   - `getMiniPhotosAction(id)`（edit/view；create 阶段不展示照片管理）

## 统一可复用表单组件（核心交付）
1. 新建可复用组件 `MiniProjectForm`（Client Component）：
   - Props：`mode: 'create' | 'edit' | 'view'`、`initialProject?`、`consultants`、`initialPhotos?`。
   - 内部统一用 `react-hook-form` + `zod`：
     - create schema：严格对齐 `MiniProjectCreate`（title 必填；URL 校验；tags 规则；sort/publish 走后续 update）。
     - edit schema：严格对齐 `MiniProjectUpdate`（全部 optional + 业务校验：`sort_order >= 0` 等）。
     - view 模式：不允许提交；全部字段以文本/Badge/链接形式展示（同组件自动切换）。
2. Section 组件全部改为支持 `readOnly`/`mode`：
   - `MarketingInfoSection`、`ShareConfigSection`、`RightColumn`、`PropertyHardInfoSection`、`PhotoManager`。
   - 规则：
     - create/edit：显示 Input/Select/Switch 等交互组件。
     - view：渲染同字段对应的静态展示组件，禁用任何交互（按钮隐藏或 disabled）。
3. 提交策略（满足“部分更新”）：
   - edit：根据 `formState.dirtyFields` 构造 patch，仅提交变更字段（避免无意覆盖）。
   - create：先 `POST createMiniProjectAction` 创建；若用户在创建页填写了 `is_published/sort_order` 等只存在于模型但不在 create schema 的字段，则创建成功后紧接一次 `PUT updateMiniProjectAction` 补齐（对用户表现为一次提交）。

## 数据流与用户反馈
- 统一处理 Loading/Error/Success：
  - 页面 SSR 加载失败：保留现有 401/403 特殊文案。
  - 表单提交：
    - pending：按钮进入 loading（可用 `useTransition` 避免阻塞交互）。
    - success：toast + `router.refresh()`；create 成功后 `router.replace(/minipro/projects/{id}/edit)`。
    - error：toast 显示后端 `detail`（若能取到）或兜底文案。

## 响应式布局
- 沿用现有 12 栅格，但抽为可配置的 `FormLayout`：
  - `lg` 以上：左 7 / 右 5。
  - `lg` 以下：单列堆叠。
- view 模式减少密度：长文本字段（description）用 Markdown/换行友好展示；URL 字段显示为可点击链接。

## 照片区对齐与改造（与后端 schema 一致）
- 展示逻辑改为优先 `final_url ?? image_url`，避免同步照片空图。
- `renovation_stage/description/sort_order`：
  - 前端层面：在“新增照片/批量添加”时允许设置 stage 与 sort 策略；view 模式只读。
  - 若要满足“编辑既有照片元数据并持久化”，需要补后端端点（建议新增 `PUT /api/v1/admin/mini/photos/{photo_id}` 与批量排序接口）。我会在实现阶段给出最小后端改动建议与对应前端调用。

## 测试（单元 + 集成）
1. 引入前端测试基础设施（当前项目无测试脚本/依赖）：
   - `vitest` + `@testing-library/react` + `@testing-library/user-event` + `jsdom` + `@testing-library/jest-dom`。
   - 配置 TS 路径别名（支持 `@/`）。
2. 单元测试覆盖：
   - 三模式渲染差异：view 模式无可编辑控件/按钮禁用；create/edit 可编辑。
   - zod 校验：title 必填、URL 格式、sort_order 非负、tags 去重/非空等。
   - submit 行为：
     - create：触发 create action；若含发布/排序，触发后续 update。
     - edit：仅提交 dirty 字段（断言 body）。
   - 错误处理：action 返回失败时展示错误提示（toast 可用 mock）。
3. 集成测试覆盖：
   - 通过模块 mock `fetchClient()` 返回的 openapi client，断言请求路径/方法/params/body 与后端契约一致。

## 代码规范与注释
- 全部新/重构文件使用 TypeScript 严格类型（从 `api-types` 推导，不引入 any）。
- 在“模式切换/patch 构造/两段式创建”这些非直观逻辑处添加必要注释，保证可维护性。

## 交付物清单（实施后你会看到的变化）
- 新增：`/minipro/projects/new`、`/minipro/projects/[id]/edit` 页面。
- 变更：`/minipro/projects/[id]` 变为只读详情。
- 新增/替换：统一的 `MiniProjectForm`（三模式复用）与更严格的 zod schema。
- 新增：完整的 vitest + RTL 测试与关键用例覆盖。

如果你确认这个方案，我会按 TDD 先补测试与新路由骨架，然后逐步替换现有 `edit-form.tsx` 与各 section 组件，最后跑通页面与测试。