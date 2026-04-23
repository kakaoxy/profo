# Bug 记录

> 用于记录项目中发现的缺陷、复现步骤与修复进展。

## Bug 列表

### BUG-0001：使用社区筛选器创建的小区未写入小区表

- **标题**：使用社区筛选器创建的小区并不会在小区表中创建小区
- **严重程度**：中
- **优先级**：P2
- **状态**：未修复
- **模块**：社区/小区
- **发现时间**：2026-04-23

#### 现象
使用前端“小区搜索/筛选器（CommunitySelect）”的“使用新名称”能力输入一个不存在的小区名并提交后：
- 表单里的小区名称会被填入（看起来“创建成功”）
- 但系统用于“小区管理/小区表”的 `communities` 表不会新增记录，导致在小区管理列表里查不到该小区

#### 复现步骤
1. 打开任一使用 `CommunitySelect` 的页面/弹窗（例如：线索录入弹窗、项目创建页、营销项目表单）
2. 在“小区名称”输入框中输入一个不存在的小区名（例如：`不存在的小区A`）
3. 在下拉面板中点击 **“使用新名称 '不存在的小区A'”**
4. 提交表单（创建线索/创建项目/保存营销项目信息）
5. 打开“小区管理”列表接口或页面进行验证：`GET /api/v1/admin/communities`（或直接查库表 `communities`）
6. 观察：列表/表中不存在刚刚“创建”的小区记录

#### 预期结果
当用户通过筛选器选择“使用新名称”时，应视为“创建小区”：
- `communities` 表新增一条记录（至少包含 `name`，必要时补齐 `district/business_circle` 等）
- 后续 `GET /api/v1/admin/communities` 可查询到该小区
- 前端应拿到新建小区的 `id`（用于后续关联）

#### 实际结果
前端仅把输入的字符串写入表单字段（如 `community_name`），未触发任何“小区创建/落库”逻辑；因此：
- `communities` 表无新增记录
- `GET /api/v1/admin/communities` 查不到该小区
- `GET /api/v1/properties/communities/search?q=...` 也搜不到（因为它仅查询 `communities` 表）

#### 影响范围
- 产品/交互层面：UI 暗示“新建”但实际只是“填值”，容易造成误解
- 数据层面：新输入的小区名仅存在于线索/项目等业务表的冗余字段中，无法进入“小区管理/标准小区库”
- 功能层面：依赖 `communities` 表的小区相关能力（小区管理、竞品/雷达等）无法使用该小区

#### 涉及数据表 / 模型
- 小区表：`communities`
  - 模型定义：`backend/models/property/community.py` → `class Community`（`__tablename__ = "communities"`）

#### 涉及接口（现状）
- 小区搜索（仅查询，不创建）：
  - 前端调用：`frontend/src/app/(main)/leads/actions/search-communities.ts` → `GET /api/v1/properties/communities/search?q=...`
  - 后端实现：`backend/routers/market/properties.py` → `search_communities()`
- 小区管理列表（用于验证小区是否存在）：
  - 后端实现：`backend/routers/market/communities.py` → `get_communities()`（挂载前缀见 `backend/main.py`）
  - 完整路径：`GET /api/v1/admin/communities`

#### 涉及前端代码位置（关键点）
- “使用新名称创建”仅构造本地对象并回调，不做落库：
  - `frontend/src/components/common/community-select.tsx`
    - `handleCreateNew()`：构造 `{ id: "", name: query }` 并执行 `onChange(newCommunity, true)`
- 调用方未处理 `isNew`（即便回调提供了 `isNew` 参数，也没有触发创建接口）：
  - 线索录入：`frontend/src/app/(main)/leads/_components/add-lead-modal.tsx`
  - 项目创建：`frontend/src/app/(main)/projects/_components/create-project/tabs/basic-info-tab.tsx`
  - 营销项目表单：`frontend/src/app/(main)/l4-marketing/projects/_components/project-form/MarketingInfoFields.tsx`

#### 后端链路现状（导致“不落库”的直接原因）
- 线索/项目创建只保存 `community_name` 字符串，不会写入 `communities`：
  - 线索创建：`backend/services/leads/core.py` → `LeadService.create_lead()`（直接 `Lead(**lead_data.model_dump())`）
  - 项目创建：`backend/services/projects/core.py` → `ProjectCoreService._create_base_project()`（写入 `Project.community_name`）
- 目前代码库中没有“小区创建”接口（仅有查询/合并等管理接口），因此前端也无处调用完成落库。
- 代码库里存在“创建小区”的实现，但仅用于“市场房源导入”链路：
  - `backend/services/market/importer.py` → `PropertyImporter.find_or_create_community()` / `_create_community()`

#### 修复建议（可选方案）
**方案 A（推荐）：实现真正的“小区新建”闭环**
1. 后端新增创建接口（例如 `POST /api/v1/admin/communities` 或 `POST /api/v1/properties/communities`），在服务层复用/抽取 `PropertyImporter._create_community()` 的创建逻辑（注意处理 `name` 唯一约束与并发）。
2. 前端在 `CommunitySelect` 的 `handleCreateNew()` 分支（或调用方 `onChange` 的 `isNew=true` 分支）调用该创建接口，成功后回填真实 `community.id`。

**方案 B：收敛交互，避免“伪创建”**
1. 如果业务上不允许从筛选器创建标准小区：禁用 `allowCreate` 或移除“使用新名称”入口；
2. 或将文案调整为“按该名称继续填写/保存”，明确不会进入小区库。

### BUG-0002：户型输入框默认显示 0/0/0，导致输入体验异常（例如输入 2 变成 02）

- **标题**：户型（室/厅/卫）输入框默认值为 0，输入时容易出现 02 这类显示
- **严重程度**：低
- **优先级**：P3
- **状态**：未修复
- **模块**：项目管理 / 创建项目表单
- **发现时间**：2026-04-23

#### 现象
在“创建项目”的基础信息页中，户型的 3 个数字输入框（室/厅/卫）默认显示 `0 / 0 / 0`。

当用户想把默认的 `0` 改成 `2` 时，往往会直接在输入框中键入 `2`，此时输入框显示为 `02`（视觉上很怪）；部分情况下用户会认为 `0` 无法删除（需要先全选或退格清空）。

#### 复现步骤
1. 打开“创建项目”弹窗/页面 → 基础信息 Tab
2. 观察“户型”区域的 3 个输入框默认值为 `0/0/0`
3. 在“室”的输入框中直接键入 `2`
4. 观察显示为 `02`（类似地，“厅/卫”也可能出现 `01/02` 等）

#### 预期结果
户型输入框在“未填写户型”时，应显示为空（使用 placeholder 提示如 2/1/1），或提供合理默认值（如 2/1/1），避免出现前置 `0` 的输入体验问题。

#### 实际结果
户型输入框被赋予了真实数值 `0` 作为默认值，导致：
- 用户输入时会在现有 `0` 后追加数字，出现 `02` 视觉效果
- 需要额外操作（全选/删除）才能替换掉 `0`

#### 涉及前端代码位置（关键点）
- 户型输入框组件（受控 number input）：
  - `frontend/src/app/(main)/projects/_components/create-project/tabs/basic-info-tab.tsx`
    - `RoomNumberField`：`value={field.value ?? ""}`，而 `field.value` 的默认值来自 `useForm` 的 `defaultValues`
- 默认值生成逻辑：
  - `frontend/src/app/(main)/projects/_components/create-project/use-form-init.ts`
    - `getDefaultValues()`：`rooms: layoutData.rooms ?? 2`（`halls/bathrooms` 同理）
  - `frontend/src/app/(main)/projects/_components/create-project/utils.ts`
    - `parseLayout()`：当 `layout` 为空/不匹配时返回 `{ rooms: 0, halls: 0, bathrooms: 0 }`
    - 因为 `0` 不会触发 `??` 的兜底逻辑，最终默认值变成 `0/0/0`

#### 可能原因（代码级结论）
`parseLayout()` 在“无户型/解析失败”时返回 `0`，而 `getDefaultValues()` 使用了 `??` 做兜底，导致 `0` 被当作“合法值”保留下来，覆盖了希望的 placeholder/默认值策略。

#### 修复建议（可选方案）
**方案 A（推荐）：无户型时返回 undefined，让 placeholder 生效**
- 修改 `parseLayout()`：当 `layout` 为空或解析失败时，返回 `{ rooms: undefined, halls: undefined, bathrooms: undefined }`
- 保留 `getDefaultValues()` 逻辑（或将默认值也改为 `undefined`，让 placeholder 负责提示）

**方案 B：保持 parseLayout 返回 0，但修正默认值兜底逻辑**
- 将 `getDefaultValues()` 中的 `??` 改为 `||`（或显式判断 `> 0`），例如：
  - `rooms: layoutData.rooms || 2`
  - `halls: layoutData.halls || 1`
  - `bathrooms: layoutData.bathrooms || 1`

### BUG-0003：项目编辑表单未正确加载业主信息（详情有值但编辑弹窗为空）

- **标题**：项目管理点击“编辑”时，业主信息（姓名/电话/身份证）未回显到编辑表单
- **严重程度**：中
- **优先级**：P2
- **状态**：未修复
- **模块**：项目管理 / 项目详情抽屉 / 编辑项目弹窗
- **发现时间**：2026-04-23

#### 现象
在项目详情抽屉中点击“编辑”打开编辑弹窗时，原项目记录中已存在的业主信息字段：
- `owner_name`（业主姓名）
- `owner_phone`（联系电话）
- `owner_id_card`（身份证号）

没有正确显示在编辑表单对应输入框中（表现为空）。

但点击取消不保存后，项目详情页仍能看到业主信息，说明数据本身未丢失，问题更可能是“编辑表单未正确初始化/未加载到最新 project 数据”。

#### 复现步骤
1. 进入“项目管理”列表，打开任一项目详情抽屉
2. 在详情页的“业主信息”区域确认能看到业主姓名/电话/身份证（已有数据）
3. 点击右上角“编辑”
4. 弹窗切换到“业主信息”Tab，观察 3 个输入框为空
5. 点击“取消”关闭弹窗
6. 回到详情页，业主信息仍可见

#### 预期结果
编辑弹窗打开时，应以当前项目数据初始化表单，业主信息字段应自动回显。

#### 实际结果
编辑弹窗中业主信息字段未回显（为空），与详情页显示不一致。

#### 涉及接口 / 后端数据来源（验证点）
- 项目详情接口：`GET /api/v1/projects/{project_id}?full=true|false`
  - 路由：`backend/routers/projects/core.py` → `get_project()`
  - 构建 owner 字段：`backend/services/projects/internal/builder.py` → `_build_owner_info()`（从 `project_owners` 表查询并返回 `owner_name/owner_phone/owner_id_card`）

#### 涉及前端代码位置（关键点）
- “编辑”入口（项目详情抽屉 Header）：
  - `frontend/src/app/(main)/projects/_components/project-detail/header.tsx`
    - `handleEditClick()`：`await onRefresh(true); setIsEditOpen(true);`
    - 打开编辑弹窗：`<ProjectFormDialog project={project} open={isEditOpen} ... />`
- 编辑表单（Dialog）：
  - `frontend/src/app/(main)/projects/_components/create-project/index.tsx` → `CreateProjectDialog`
- 表单逻辑 Hook（关键问题点）：
  - `frontend/src/app/(main)/projects/_components/create-project/use-create-project.ts`
    - 内部维护 `const [open, setOpen] = useState(false)`
    - `useFormInit({ form, project, open, isEditMode });`
- 表单初始化逻辑（依赖 open 触发 reset）：
  - `frontend/src/app/(main)/projects/_components/create-project/use-form-init.ts`
    - 编辑模式下，仅当 `open && isEditMode && project` 时才会 `form.reset({ owner_name: project.owner_name || "", ... })`
- 业主信息表单字段：
  - `frontend/src/app/(main)/projects/_components/create-project/tabs/owner-tab.tsx`
    - `SimpleInputField name="owner_name" / "owner_phone" / "owner_id_card"`

#### 可能原因（代码级结论）
`CreateProjectDialog` 在“受控模式（controlled open）”下打开时：
- Dialog 的实际开关状态来自外部 prop：`open={isEditOpen}` / `onOpenChange={setIsEditOpen}`
- 但 `useCreateProject` 内部仍使用自己的 `open` state（初始为 `false`），且该 state **不会随着受控 open 改变**

因此 `useFormInit` 里的条件 `open && isEditMode` 永远为 `false`，导致编辑弹窗打开时 **不会执行 form.reset() 来同步当前项目数据**。

最终表现为：编辑表单使用了“组件初次挂载时”的 defaultValues（可能是空/旧值），业主信息无法正确回显。

#### 修复建议（可选方案）
**方案 A（推荐）：让 useCreateProject 支持受控 open**
- 在 `useCreateProject` 增加参数接收 `open`（受控值）并作为 `useFormInit/useDraft` 的 open 依据；
- 或在 `CreateProjectDialog` 内把受控 open 同步回 `useCreateProject.setOpen`，确保二者一致。

**方案 B：移除 useFormInit 对 open 的依赖，改为监听 project 变化**
- 在编辑模式下，只要 `project` 变化就执行一次 `form.reset(...)`（注意避免覆盖用户正在编辑的输入，可在 `open===true` 时才 reset）。

### BUG-0004：项目详情页附件图片“缩略图可见但预览失败”

- **标题**：项目详情页附件中，图片缩略图能显示但点击预览后图片未正确加载
- **严重程度**：中
- **优先级**：P2
- **状态**：未修复
- **模块**：项目管理 / 项目详情抽屉 / 附件 Tab
- **发现时间**：2026-04-23

#### 现象
在项目详情页的“附件”Tab 中：
- 图片附件的缩略图（小方块）可以正常显示；
- 但点击缩略图或点击“眼睛（预览）”按钮后，弹出的图片预览对话框中图片未正确加载（空白/加载失败）。

#### 复现步骤
1. 打开项目详情抽屉 → 切换到“附件”Tab
2. 找到任一图片类型附件（缩略图可见）
3. 点击缩略图或点击右侧“预览(👁)”按钮
4. 观察弹窗中的大图预览未正常显示

#### 预期结果
点击预览后，弹窗中应能正确显示该附件的原图（或至少与缩略图一致可加载）。

#### 实际结果
缩略图正常，但预览弹窗中原图加载失败。

#### 涉及前端代码位置（关键点）
- 附件列表 & 缩略图渲染：
  - `frontend/src/app/(main)/projects/_components/project-detail/components/attachment-group.tsx`
    - 缩略图使用 Next `<Image ... unoptimized />`：
      - `src={attachment.url}`
      - `unoptimized` 已开启（浏览器直接加载 URL，不走 Next Image 优化器）
    - 点击触发预览：`onPreview(attachment.url, attachment.fileType)`
- 预览弹窗渲染：
  - `frontend/src/app/(main)/projects/_components/project-detail/index.tsx`
    - `previewImage` state 保存预览 URL
    - 弹窗内大图使用 Next `<Image />` 但 **未设置 `unoptimized`**：
      - `src={previewImage}`
      - 会走 Next Image 优化器（`/_next/image?...`）
- 预览事件绑定：
  - `frontend/src/app/(main)/projects/_components/project-detail/hooks/use-project-attachments.ts`
    - `onPreview` 对 `image` 仅执行 `setPreviewImage(url)`

#### 可能原因（代码级结论）
缩略图与预览大图使用了**不同的加载策略**：
- 缩略图：`unoptimized`（浏览器直连加载，哪怕域名未加入 Next images 白名单也能显示）
- 预览大图：未 `unoptimized`（走 Next Image 优化器，受 `next.config.ts -> images.remotePatterns` 限制，且服务端拉取远程图片时可能缺少鉴权/Cookie）

因此会出现“缩略图可见，但预览失败”的不一致现象。

#### 修复建议（可选方案）
**方案 A（推荐）：预览大图也使用 `unoptimized`，与缩略图策略保持一致**
- 在 `project-detail/index.tsx` 的预览 `<Image />` 增加 `unoptimized`；
- 或改用原生 `<img src=...>`（参考：`frontend/src/app/(main)/projects/_components/create-project/tabs/file-preview.tsx` 中的图片预览实现）。

**方案 B：统一使用 Next Image 优化器，但补齐域名/URL 规范化**
- 确保 `attachment.url` 为可被 Next Image 允许的绝对 URL，并将对应域名加入 `frontend/next.config.ts -> images.remotePatterns`；
- 若 `attachment.url` 可能为相对路径，建议在预览与缩略图处统一使用 `getFileUrl()` 做拼接规范化（参考装修照片组件已使用 `getFileUrl(photo.url)`）。

### BUG-0005：装修阶段合同信息的费用汇总未保留两位小数

- **标题**：项目详情页装修阶段-合同信息的“费用汇总”金额未显示小数点后两位
- **严重程度**：低
- **优先级**：P3
- **状态**：未修复
- **模块**：项目管理 / 项目详情抽屉 / 装修阶段 / 装修合同信息
- **发现时间**：2026-04-23

#### 现象
在项目详情页“装修阶段 → 装修合同信息 → 费用汇总”中，金额展示会被格式化为整数，未显示小数点后两位（例如应为 `¥12,345.67`，实际显示为 `¥12,346` 或 `¥12,345`）。

#### 复现步骤
1. 打开项目详情抽屉
2. 切换到“装修阶段”
3. 在“装修合同信息”中录入带小数的费用（例如：设计费 `12.34`、软装实际 `1000.56` 等）并保存
4. 查看同卡片底部“费用汇总”区域
5. 观察金额未展示两位小数

#### 预期结果
费用汇总金额应统一显示到小数点后 2 位（或至少与输入精度一致），避免四舍五入/截断造成误解。

#### 实际结果
费用汇总金额按“无小数”格式输出，导致小数部分丢失。

#### 涉及前端代码位置（关键点）
- 费用汇总组件：
  - `frontend/src/app/(main)/projects/_components/project-detail/views/renovation/contract-form/cost-summary.tsx`
    - `formatAmount()` 使用：
      - `toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })`
      - 这会强制不显示小数（并可能触发四舍五入）
- 组件使用位置：
  - `frontend/src/app/(main)/projects/_components/project-detail/views/renovation/contract-form/index.tsx`
    - `CostSummarySection({ values })`

#### 可能原因（代码级结论）
`formatAmount` 的格式化选项显式把 `minimumFractionDigits/maxFractionDigits` 设为 `0`，因此无论输入/后端返回是否包含小数，显示都会被“压缩”为整数。

#### 修复建议（可选方案）
**方案 A（推荐）：费用汇总统一保留两位小数**
- 将 `formatAmount()` 改为：
  - `toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })`
  - 或 `amount.toFixed(2)`（注意千分位需求）

**方案 B：抽取通用金额格式化工具，按场景控制精度**
- 在项目详情 `utils.ts` 或共享工具中提供 `formatCurrency(amount, digits=2)`；
- 对“费用汇总/金额”使用 2 位小数；对“比例/计数”等保持 0 位或按需求。
