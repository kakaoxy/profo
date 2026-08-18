# 签约阶段页 · 交互与展示优化 — 开发任务说明

> 需求方输入（2026-08-17）｜目标页面：`/admin/projects/{projectId}`（签约阶段视图）
> 配套设计稿：[project-detail-page-design-v4.html](./project-detail-page-design-v4.html) ｜ 设计说明：[PROJECT-DETAIL-PAGE-DESIGN-V4.md](./PROJECT-DETAIL-PAGE-DESIGN-V4.md)
> 遵循 `AGENTS.md`：谨慎 > 速度，显式 > 隐式；所有不确定项以「⚠️ 未覆盖/不确定」显式标注，禁止假成功。

---

## 0. 总览

签约阶段页面存在三处与设计稿预期不一致的问题，本次逐一修复：

| # | 问题 | 现状（代码事实） | 目标 | 主要涉及文件 |
|---|------|------------------|------|--------------|
| 1 | 项目信息编辑方式 | 点击「编辑」打开新建/编辑弹窗（`ProjectFormDialog`） | 卡片内就地编辑（inline editing），不弹窗 | `views/default/tabs/info-tab.tsx`、`create-project/*`、`project-detail-page-view.tsx` |
| 2 | 右侧「团队与成员」三类信息 | 渠道/讲房/谈判**渲染不出来**（字段缺失）；对接负责人错用公司名 | 展示 项目负责人 / 对接负责人 / 渠道·讲房·谈判 三类 | `page-shell/side-column.tsx`、`project-detail-page-view.tsx` |
| 3 | 右侧面板浮动 | `<aside>` 已配置 `lg:sticky`，需验证生效并修复潜在破坏因素 | 桌面端 团队/关键日期/快捷入口 吸附于视口，不随主列滚走 | `project-detail-page-view.tsx`、`page-shell/side-column.tsx` |

**成功标准**：三处行为与设计稿一致；`tsc --noEmit` 零错、`pnpm lint` 通过、`pytest` 全绿（涉及后端改动时）；无功能回退（文书/附件/阶段流转等原有能力不变）。

---

## 1. 问题一：项目信息就地编辑（Inline Editing）

### 1.1 需求与设计稿对照

- 设计稿「项目信息」卡头为「编辑」textlink（原型 `project-detail-page-design-v4.html` L817-827），点击后应**在卡片原位**进入编辑态，而非弹出弹窗。
- 需求原文：*「当前项目信息的编辑会弹出新建/编辑弹窗。期望改为无需弹出弹窗，直接在页面相应位置进行就地编辑。」*

### 1.2 现状（代码定位）

| 环节 | 位置 | 说明 |
|------|------|------|
| 顶栏「编辑」 | `[projectId]/_components/page-shell/top-toolbar.tsx` → `project-detail-page-view.tsx` L162-173 `handleEditClick` | 先 `refreshFullWithSkeleton()`（全量刷新 + skeleton）再 `setIsEditOpen(true)` |
| 项目信息卡「编辑」 | `views/default/tabs/info-tab.tsx` L379-388（`onEdit` prop）→ 同一个弹窗 | 由 `DefaultView` 传入 `onEditProject={handleEditClick}` |
| 编辑弹窗 | `_components/create-project/index.tsx`（`ProjectFormDialog`，新建/编辑共用） | 受控挂在 `project-detail-page-view.tsx` L423-433 |
| 保存数据流 | `create-project/use-create-project.ts` `onSubmit`（L52-161） | 组装 payload → `updateProjectAction(project.id, payload)`；含小区行政区/商圈回写逻辑（L122-143） |
| 表单 Schema | `create-project/schema.ts` `formSchema` | 基础信息 + 合同要件 + `owners` 多业主数组 + `notes`；日期为 `z.date()`，提交时 `toDateStr()` |
| 只读展示卡 | `views/default/tabs/info-tab.tsx` `InfoTab` | 房源 / 业主（多业主遍历）/ 合同要件 / 公用事业户号 / 交易数据 |

### 1.3 目标交互

1. 点击「项目信息」卡头**编辑**（或顶栏「编辑」）→ 滚动到项目信息卡（`scrollIntoView`），卡片切换为**编辑态**：所有字段在原位渲染为输入控件，卡头右侧出现「保存 / 取消」。
2. **保存**：前端校验（复用 `formSchema` 语义）→ `updateProjectAction` → toast → 局部刷新（`refreshProjectData(false)`）→ 退出编辑态。
3. **取消**：丢弃未保存修改，恢复只读态。
4. 顶栏「编辑」语义改为「滚动至项目信息卡并进入编辑态」（不再弹窗）；顶栏「删除」保持 AlertDialog 不变。

### 1.4 实现要点

1. **新增编辑态**：建议在 `views/default/` 下新建 `components/info-inline-editor.tsx`（或改造 `InfoTab` 内部），承载编辑态表单；只读态仍由现有 `InfoTab` 渲染，两种状态由 `isEditing` 状态切换。
2. **表单与校验**：复用 `create-project/schema.ts` 的 `formSchema` + `use-form-init.ts` 的 `getFormResolver()` / `getDefaultValues()`（编辑模式已支持，`getDefaultValues(project, true)`），避免两套校验规则漂移；日期字段沿用 `toDateStr()` 转换。
3. **Payload 组装复用**：将 `use-create-project.ts` `onSubmit` 中的 `basePayload` 组装（L58-100）与小区回写（L122-143）**抽为公共函数**（如 `create-project/utils.ts` 新增 `buildProjectUpdatePayload(values)`），弹窗编辑与就地编辑共用——禁止复制两份逻辑。
4. **进入编辑态前数据完整性**：沿用现状做法，进入编辑态前调用 `refreshProjectData(true)`（全量，带卡片 skeleton），确保 `owners`（银行卡号等）字段完整；表单初值从最新 `project` 派生。
5. **字段控件复用**（避免新造轮子）：
   - 小区搜索选择器、项目负责人下拉、户型三输入、朝向 Radio：复用 `create-project/tabs/basic-info-tab.tsx` 内组件；
   - 日期选择：复用 `create-project/date-picker-field.tsx`；
   - 业主动态数组（增删）：复用 `create-project/tabs/owner-tab.tsx` 的表单片段；
   - 敏感字段（电话/身份证/银行卡）：编辑态为**明文输入框**，银行卡完整号需按需解密（复用 `InfoTab` 中 `getOwnerBankCardAction(owner.id)` 的能力回填）；⚠️ 编辑态明文展示属敏感操作，保存前可加轻量确认或保持现状的「显示后再编辑」交互。
6. **保存后联动**：保存成功后 `useProjectDetail` 的 `project` state 更新，Hero Meta 行、右侧「关键日期/团队」卡自动联动（均直接读 `project`），无需额外处理；仅需验证。
7. **错误处理**：校验失败停留编辑态并 toast 具体字段错误（沿用 `use-create-project` 的错误摘要逻辑）；网络失败 toast + 保留编辑态。

### 1.5 数据来源与字段映射

编辑保存 payload（`ProjectUpdate`，字段与 `use-create-project.ts` 现有一致）：
`community_id / community_name / address / area / layout / orientation / floor_info / project_manager_id / business_form / electricity_account / water_account / gas_account / notes / contract_no / signing_price / signing_date / signing_period / extension_period / extension_rent / cost_assumption_type / cost_assumption_other / planned_handover_date / commission_start_date / commission_end_date / other_agreements / owners[]`

> 展示/编辑的数据源即页面已加载的 `Project`（`initialProject` + `refreshProjectData(true)` 全量）；无新增后端字段需求。

### 1.6 涉及文件

- 新增：`views/default/components/info-inline-editor.tsx`（编辑态表单，可并入 `InfoTab`）
- 修改：`views/default/tabs/info-tab.tsx`（加编辑态切换）、`project-detail-page-view.tsx`（顶栏/卡头编辑统一走就地编辑；移除 `isEditOpen` 弹窗分支，`ProjectFormDialog` 仅保留新建场景或整体移除）、`create-project/utils.ts`（抽 `buildProjectUpdatePayload`）、`create-project/use-create-project.ts`（改用公共函数）
- ⚠️ 拆除弹窗会同时影响「新建项目」入口（列表页 `_components/create-project/index.tsx` 独立使用）——**新建弹窗必须保留**，仅编辑场景改就地编辑。

### 1.7 验收标准

- [ ] 签约阶段「项目信息」卡点击编辑，卡片原位进入编辑态，无弹窗出现；
- [ ] 修改任意字段（含多业主增删、日期、项目负责人）保存后：卡片更新、Hero Meta 更新、右侧关键日期/团队联动更新；
- [ ] 取消编辑不产生任何写入；
- [ ] 列表页「新建项目」弹窗功能不受影响；
- [ ] 刷新页面后数据持久化正确。

---

## 2. 问题二：右侧「团队与成员」三类信息

### 2.1 需求与设计稿对照

- 需求原文：右侧区域应展示——**项目负责人**（来源：新建项目弹窗数据）、**对接负责人**（来源：装修合同信息数据）、**销售团队渠道 / 讲房 / 谈判成员**（来源：在售阶段销售团队模块）。
- 设计稿参考：签约阶段右侧栏「团队与成员」卡（`project-detail-page-design-v4.html` L1056-1076：项目经理 + 业主，person 行带头像/角色/编辑按钮）；装修阶段（L1334-1345：项目经理 + 装修公司·对接人）；在售阶段（L1539-1546：项目经理 + 渠道/讲房/谈判三人）。

### 2.2 现状与根因（重要，先读这段）

`page-shell/side-column.tsx` L58-66 当前 members 构造：

```
managerName = project.project_manager?.nickname || project.manager   // ✅ 项目负责人有数据
renovationMeta?.companyName → "装修对接人"                            // ❌ 显示的是装修公司名，非对接负责人
project.channel_manager → "渠道"                                     // ❌ 后端不返回该字段
project.presenter → "讲房"                                           // ❌ 后端不返回该字段
project.negotiator → "谈判"                                          // ❌ 后端不返回该字段
```

**根因**：后端 `ProjectResponse`（`backend/schemas/project/core.py` L260-262）只返回角色 **ID**（`channel_manager_id / property_agent_id / negotiator_id`），**不返回** `channel_manager / presenter / negotiator` 文本字段（前端 `types/project.ts` L222-225 的文本字段仅为历史兼容声明，实际永远为 `undefined`）→ **渠道/讲房/谈判三行永远不会渲染**。这即是需求方看到「右侧信息缺失」的直接原因。

### 2.3 目标展示（签约阶段右侧「团队与成员」卡，自上而下）

| 顺序 | 角色标签 | 数据来源（字段） | 解析方式 |
|------|----------|------------------|----------|
| 1 | 项目负责人 | `project.project_manager`（`UserBrief`: `id/nickname/avatar/username`）| 直接取 `nickname`，回退 `username` |
| 2 | 对接负责人 | 装修合同 `contact_person_id`（`GET /api/v1/projects/{id}/renovation/contract` → `RenovationContractResponse.contact_person_id`）| 用用户列表将 ID 解析为昵称 |
| 3a | 渠道（渠道经理） | `project.channel_manager_id` | 用用户列表解析昵称 |
| 3b | 讲房（讲房人） | `project.property_agent_id` | 用用户列表解析昵称 |
| 3c | 谈判（谈判人） | `project.negotiator_id` | 用用户列表解析昵称 |

- 头像首字圆徽 + 三色 wash 沿用现有 `PersonRow`（`side-column.tsx` L232-250），无需改动。
- 角色标签文案建议：项目负责人 / 对接负责人 / 渠道经理 / 讲房人 / 谈判人（与在售阶段 `team-panel.tsx` 的 `roleLabel` 对齐）；⚠️ 设计稿签约阶段右侧 prole 为「项目经理」，需求方称「项目负责人」——标签文案以需求方口径为准，实现时确认。

### 2.4 实现要点

1. **用户列表加载（一次，页面级）**：新增 hook（如 `page-shell/use-team-members.ts`）或直接在 `project-detail-page-view.tsx` 挂载时调用 `getSalesUsersSimpleAction()`（`GET /api/v1/users/simple`，返回全部后台角色用户 `id/nickname/username`，排除 C 端 customer——后端 `services/system/user/core.py` L446-461 已确认），构建 `Map<userId, nickname>` 传入 `SideColumn`。
   - ⚠️ 接口默认 `page_size=100`（上限 500），若用户数可能超 100，需分页拉全后再建 Map（当前 `getSalesUsersSimpleAction` 未传分页参数，默认取 100 条——按现状团队规模大概率够用，超限场景显式标注）。
2. **装修合同加载上提**：当前装修合同仅在 `RenovationView` 挂载时拉取（`views/renovation/index.tsx` L34-54）上报 `onRenovationMeta`，**签约阶段不会加载**。需求要求签约阶段也展示对接负责人 → 将 `getRenovationContractAction(projectId)` 的拉取**上提到页面级**（`project-detail-page-view.tsx`，与用户列表并行 `Promise.all` 消除瀑布，遵循 AGENTS.md），结果通过 props 传给 `SideColumn`；`RenovationView` 内部保留自身逻辑或改为复用页面级数据（二选一，禁止双份拉取打架——建议 RenovationView 复用页面级 meta，删除其内部上报链路或保留上报作兼容）。
3. **SideColumn 重构**：members 改为由「角色 ID + 用户 Map + 装修合同」解析出的结构化数组；删除对 `project.channel_manager / presenter / negotiator` 文本字段的依赖；「对接负责人」改为解析 `contact_person_id` 昵称（角色文案「对接负责人」），**不再显示装修公司名**（公司名如需保留可在 prole 中附带，如「对接负责人 · 境合装饰」，与设计稿装修阶段 L1343 的「装修公司 · 对接人 陈工」呼应——由实现时按需求方确认）。
4. **数据缺失空态**：装修合同不存在（`contact_person_id` 为空）或三角色未设置时，对应行显示「未设置」（浅灰占位，维持行高）或整行隐藏——推荐**显示占位**（需求明确要求展示三类信息，隐藏会再次造成"缺失"观感）；⚠️ 与需求方确认后落地，默认占位。

### 2.5 涉及文件

- 修改：`page-shell/side-column.tsx`（members 数据源与角色解析）、`project-detail-page-view.tsx`（页面级加载用户列表 + 装修合同，props 下发）
- 新增（建议）：`page-shell/use-team-members.ts`（用户列表 + 装修合同并行加载）
- 可选：`views/renovation/index.tsx`（复用页面级装修合同数据）
- 后端：**无需改动**（字段均已具备）；若希望减少前端请求，可另议在 `ProjectResponse` 增加三角色昵称字段（非本次范围）

### 2.6 验收标准

- [ ] 签约阶段右侧「团队与成员」卡展示 项目负责人 / 对接负责人 / 渠道·讲房·谈判 三类（有数据时）；
- [ ] 对接负责人展示装修合同 `contact_person_id` 对应用户昵称（非公司名）；
- [ ] 渠道/讲房/谈判与在售阶段「销售团队」模块（`team-panel.tsx`）保存的成员一致（ID 同源）；
- [ ] 装修合同/销售团队未设置时显示占位，不渲染错位数据；
- [ ] 装修阶段右侧「对接负责人」展示不再回退为公司名。

---

## 3. 问题三：右侧面板浮动展示（sticky / fixed）

### 3.1 需求与设计稿对照

- 需求原文：*「右侧的『团队成员 / 关键日期 / 快捷入口』应实现浮动（fixed/sticky）展示效果，而不是完全跟随左侧基础信息一起随页面滚动。」*
- 设计稿：副栏标注「④ 副栏 — 团队 / 日期 / 快捷入口（吸附）」（`project-detail-page-design-v4.html` L659）；`.col-side` 吸附语义。

### 3.2 现状

`project-detail-page-view.tsx` L386 已实现：`<aside className="min-w-0 lg:col-span-4 lg:sticky lg:top-24 lg:self-start">`，≥1024px（`lg`）时副列作为网格项 `sticky` 吸附。**代码层面已具备吸附意图**，本问题核心是：验证是否真实生效，并排查/修复潜在失效因素。

### 3.3 实现 / 验证要点

1. **验证 sticky 生效**：滚动页面，确认 ≥1024px 下右侧三卡（团队/关键日期/快捷入口）吸附于视口顶部（`top-24` ≈ 96px），不与主列同步滚走。
2. **排查 sticky 破坏因素**（按优先级）：
   - 页面根 div `overflow-x-clip`（`project-detail-page-view.tsx` L264）：`overflow: clip` 不创建滚动容器，理论不破坏 sticky；若实测受影响（或需要兼容旧浏览器），改 `overflow-x-visible` 或移除该属性，另行处理横向溢出。
   - 祖先元素存在 `overflow-x: hidden/auto` 会劫持滚动上下文 → 检查 `page.tsx` / 布局容器是否有此类样式。
   - `aside` 的 sticky 需配合 `self-start`（已加）避免网格拉伸吞掉吸附空间。
3. **与吸顶分区导航的层级关系**：`SectionNav` 为 `sticky top-14 z-30 md:top-0`（`section-nav.tsx` L60），`aside` `top-24` 位于其下，滚动时两者应互不遮挡；验证吸顶瞬间副列不被 SectionNav 盖住、也不重叠。
4. **中屏 / 移动端**：<1024px 副列按设计稿响应式**下沉为单列跟随滚动**（设计稿断点表：768-1279px 单栏，副列下沉主列尾部分区）——此为**预期行为**，不做浮动；若需求方要求全宽度浮动，与设计稿冲突，需重新确认。
5. **移动端 <768px**：操作收纳进吸底操作条，副列同样下沉（现状一致，不动）。

### 3.4 涉及文件

- 修改（按需）：`project-detail-page-view.tsx`（aside 容器/根容器样式微调）、`page-shell/side-column.tsx`（若需给副列整体加统一容器或背景）
- 主要是**验证与样式修正**，无逻辑改动预期

### 3.5 验收标准

- [ ] ≥1024px 滚动页面，右侧三卡稳定吸附在视口内，不随主列滚出视野；
- [ ] 吸附时与吸顶分区导航、主列内容无重叠遮挡；
- [ ] <1024px 副列正常下沉跟随滚动（预期行为）；
- [ ] 主列原有滚动锚点（`scroll-mt-28 md:scroll-mt-24`）行为不回归。

---

## 4. 通用验证与提交流程（AGENTS.md 强制）

1. 接口/字段变更（本次预计无后端变更）：启后端 → `pnpm gen-api` → 提交生成类型；如有 Schema 变更必须走 `backend/migrations/__init__.py` 幂等迁移脚本。
2. 提交前：`pytest` 全绿；`tsc --noEmit` 零错；`ruff check .` 与 `ruff format .` 通过；`pnpm lint` 通过。
3. 本地调试：前后端调试模式直接运行（后端 `uvicorn main:app --reload --host 0.0.0.0 --port 8000`，前端 `pnpm dev`），禁止启动 docker 容器抢端口。
4. 每步完成输出「已完成 / 已验证 / 剩余」。

---

## 5. ⚠️ 未覆盖 / 不确定项（Fail Loud，需需求方或开发确认后落地）

1. **顶栏「编辑」按钮去留**：需求聚焦"项目信息不弹窗"，顶栏「编辑」建议保留并改为「滚动到项目信息卡 + 进入编辑态」；若需求方希望顶栏编辑仅保留删除（去掉编辑），需确认。
2. **「备注」卡是否也就地编辑**：设计稿备注卡无编辑入口，本次默认**保持只读**；如需编辑可复用问题一的编辑态（`notes` 字段已含在 payload 中），需确认。
3. **对接负责人/销售团队「未设置」的展示形态**：占位「未设置」vs 隐藏该行，默认**占位**，需确认。
4. **角色标签文案**：设计稿签约阶段 prole「项目经理」vs 需求方口径「项目负责人」，默认按需求方口径，需确认。
5. **装修合同数据在签约阶段是否一定存在**：业务上装修公司可能尚未录入；若签约阶段常无装修合同，右侧「对接负责人」将长期占位，需业务确认是否改为「从在售阶段开始展示」或保持占位。
6. **用户列表分页**：`/api/v1/users/simple` 默认取 100 条，若用户规模超过需分页拉全；按现状团队规模默认按 100 条处理。
7. **编辑态下敏感字段（身份证/银行卡）明文编辑的合规性**：建议维持「脱敏展示 → 按需解密后编辑」的现状交互，若需求方要求直接明文编辑需二次确认。
8. **问题三的 sticky 为现状已实现能力**：若验证后发现已生效，本项仅需回归确认，不产生代码改动；若需求方在低版本浏览器（<Chrome 90）观察，`overflow: clip` 可能不支持，需替换为 `overflow-x: visible` 方案。

---

## 6. 执行记录（2026-08-17，已实施）

> ✅ 三处问题均已实现并通过 `tsc --noEmit` / `pnpm lint`（max-warnings 0）。前端 vitest 失败 36 项均为既有失败（`proxy` / `(main)/layout` / `permissions` / `auth/refresh` / `mobile-selling-view` 权限与布局相关，与本改动文件零交集），本次未引入新失败。

### 6.1 已落地改动

**问题二（右侧团队三类信息）**
- 新增 `[projectId]/_components/page-shell/use-team-members.ts`：页面级并行加载用户列表（`getSalesUsersSimpleAction`）+ 装修合同（`getRenovationContractAction`），返回 `usersById` Map 与 `renovationMeta`（含 `contactPersonId`）。
- `side-column.tsx`：members 重构为固定五角色行——项目负责人 / 对接负责人（`contact_person_id` → 昵称，不再用公司名）/ 渠道经理 / 讲房人 / 谈判人；ID 缺失回退旧文本字段，再无显示「未设置」灰底占位（`?` 头像）。
- `renovation/index.tsx` + `kpi.tsx`：`RenovationContractMeta` 增加 `contactPersonId`；`RenovationView` 支持 `contractMeta` prop（页面级传入后不自拉取，旧抽屉不传保持内部自拉取）。
- `project-detail-page-view.tsx`：移除 RenovationView 上报链路，`SideColumn` / `RenovationView` 统一用页面级数据。

**问题一（就地编辑）**
- `create-project/utils.ts`：抽出 `buildProjectUpdatePayload(values)` 与 `syncCommunityDistrict(values)` 公共函数（弹窗与就地编辑共用同一 payload 组装，消除双份逻辑）。
- `create-project/use-create-project.ts`：改用公共函数。
- 新增 `views/default/tabs/info-inline-editor.tsx`：卡片内编辑表单（复用 `formSchema` / `getFormResolver` / `getDefaultValues` / `SimpleInputField` / `DatePickerField` / `CommunitySelect` / `FloorInput`）；银行卡字段聚焦时经 `getOwnerBankCardAction` 按需拉取完整卡号回填（防脱敏值写回）；合同周期自动计算 + 手动开关；保存走 `updateProjectAction` + 小区回写。
- `info-tab.tsx`：支持 `inlineEditable` / `onInlineSaved` / `usersById` / `editRequest`，编辑态与只读态切换；卡头「编辑」经页面层全量刷新后进入编辑态。
- `default/index.tsx`：透传就地编辑 props（`onProjectSaved` 存在即启用就地编辑，旧抽屉不传保持弹窗链路）。
- `project-detail-page-view.tsx` + `top-toolbar.tsx`：顶栏「编辑」改为「全量刷新（skeleton）→ 递增 editRequest → 滚动到项目信息卡进入编辑态」，移除 `ProjectFormDialog` 编辑弹窗挂载；删除确认 AlertDialog 保留；`isEditLoading` 改为可选。

**问题三（副列浮动）**
- 代码审查确认：`<aside>` 已为 `lg:sticky lg:top-24 lg:self-start`（今日上午已实现并验证）；根容器 `overflow-x-clip` 不创建滚动容器（不破坏 sticky）；`(main)/layout.tsx` 无 overflow 破坏因素；`SectionNav`（`sticky top-14 z-30`）与副列 `top-24` 互不遮挡。<1024px 下沉为设计稿预期行为。**无代码改动**。

### 6.2 与任务说明的偏差（已按此实现）

1. 顶栏「编辑」保留，语义改为「滚动到项目信息卡 + 进入就地编辑态」（任务说明 ⚠️ 1 默认方案）。
2. 对接负责人/销售团队未设置时显示「未设置」占位（任务说明 ⚠️ 3 默认方案）。
3. 角色标签采用需求方口径：项目负责人 / 对接负责人 / 渠道经理 / 讲房人 / 谈判人（⚠️ 4）。
4. 装修合同在签约阶段也会拉取（供右侧展示）；未录入时对接负责人占位（⚠️ 5 默认方案）。
5. 就地编辑进入前先 `refreshProjectData(true)` 全量刷新（skeleton），保证表单字段完整（银行卡等）。
6. 编辑态敏感字段：电话/身份证直接明文编辑；银行卡维持「脱敏 → 聚焦按需解密后编辑」（⚠️ 7 保守方案）。
7. 备注（notes）包含在就地编辑表单中（⚠️ 2 增强）。

### 6.3 遗留事项（⚠️ 待需求方/开发确认）

- 若用户规模超过 `/api/v1/users/simple` 默认 100 条，需在 `use-team-members.ts` 加分页拉全（⚠️ 6）。
- 真实浏览器回归（含 sticky 吸附、编辑态保存、移动端）建议在 `pnpm dev` 环境人工走查一次；本环境已通过代码审查与静态检查。
- 若需求方希望「已下架」以外的所有阶段都保持五角色行（现为所有非 ended 阶段统一五角色），已按此实现；装修阶段渠道/讲房/谈判占位如需隐藏需另行确认。

### 6.4 Bug 修复记录（2026-08-17，用户反馈「修改项目负责人后信息没更新」）

**根因**：`info-inline-editor.tsx` 项目负责人下拉的 `users` 列表用 `useState` 惰性初始化（仅 mount 时执行一次），且兜底加载的 `useEffect` 判断 `if (usersById) return` —— **空 Map 为 truthy，导致 `usersById` 为空时既不使用页面级数据、也不自行加载**，下拉可能永远只有「未选择」选项，用户无法完成负责人修改（数据库无写入，展示自然不变）。

**排查过程**（均已实测）：
- 后端链路正常：PUT `/projects/{id}` 修改 `project_manager_id` → 200 → 独立 GET 详情返回新负责人（用脚本实测改 u1 → GET 返回「测试用户」，并已还原原值）。⚠️ 首次"复现"为脚本误传了与原值相同的用户，属误报。
- 数据库核查：28 个项目 `project_manager` 仅 admin-user / NONE，无任何用户实测修改痕迹 → 修改未写库，问题在前端表单。

**修复**：`users` 改为响应式 `useEffect` 同步（`usersById` 有数据用页面级并随变化更新；为空/未就绪时自行调 `getSalesUsersSimpleAction` 兜底加载）。

**回归测试**：新增 `views/default/tabs/info-inline-editor.test.tsx`（2 用例，均通过）——
1. 有用户列表时打开下拉选「测试用户」→ 保存 → `updateProjectAction` 收到 `payload.project_manager_id === "u1"` 且 `onSaved` 触发；
2. `usersById` 为空时自行加载用户列表兜底，下拉仍可选人。
（测试需在 jsdom 补齐 Radix Select 依赖的 `hasPointerCapture` / `scrollIntoView` polyfill，已内联在测试文件。）

**验证**：`pnpm lint` ✓ / `tsc --noEmit` ✓ / 新测试 2/2 ✓。
