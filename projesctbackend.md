角色：作为 Python 后端开发专家，精通 FastAPI、Pydantic v2、SQLAlchemy 及 clean code 工程规范。

背景：  
项目前端已使用 **Vue 3** 完成开发，所有页面功能就绪。现需为其构建完整、健壮、可维护的后端服务。前端通过标准 RESTful API 与后端交互，仅依赖 JSON 接口，不涉及任何前端框架特定逻辑。

---

### 🔧 数据模型约束（必须严格遵守）

#### 1. 项目主状态（`status`）枚举：
- `signing`（签约阶段）
- `renovating`（改造阶段）
- `selling`（在售阶段）
- `sold`（已售阶段）

> ⚠️ 状态变更必须通过合法路径（如：`signing → renovating → selling → sold`），禁止跳跃或回退（除非业务允许，当前不允许）。

#### 2. 改造子阶段（`renovationStage`）枚举：
- `拆除`
- `设计`
- `水电`
- `木瓦`
- `油漆`
- `安装`
- `交付`

#### 3. 现金流类型（`type`）：
- `income`（收入）
- `expense`（支出）

#### 4. 现金流分类（`category`）：
- **支出类**：`履约保证金`、`中介佣金`、`装修费`、`营销费`、`其他支出`、`税费`、`运营杂费`
- **收入类**：`回收保证金`、`溢价款`、`服务费`、`其他收入`、`售房款`

> ✅ 校验规则：若 `type=expense`，则 `category` 必须为支出类；若 `type=income`，则必须为收入类。

---

### 📡 前端接口需求（必须实现）

#### 【仪表盘 / 项目列表】
- `GET /api/v1/projects/stats`  
  → 返回 `{ signing: int, renovating: int, selling: int, sold: int }`
- `GET /api/v1/projects`  
  → 查询参数：`status?`, `communityName?`  
  → 返回分页或全量项目列表（含 `netCashFlow` 字段）
- `GET /api/v1/projects/export`
  → 生成 Excel 并返回 `StreamingResponse`

#### 【签约阶段】
- `POST /api/v1/projects`  
  → 创建项目，初始状态为 `signing`
- `GET /api/v1/projects/{id}`  
  → 返回完整项目详情（含各阶段数据、现金流汇总等）
- `PUT /api/v1/projects/{id}`  
  → 仅允许更新签约阶段字段（如业主信息、物业地址、备注等）
- `POST /api/v1/upload`  
  → 上传图片，返回 `{ "url": "https://...", "id": "uuid" }`

#### 【改造阶段】
- `PUT /api/v1/projects/{id}/renovation`  
  → 更新 `renovationStage` 和 `stageCompletedAt`
- `POST /api/v1/projects/{id}/renovation/photos`  
  → 上传图片，关联到当前改造阶段
- `PUT /api/v1/projects/{id}/status`  
  → 仅当当前状态为 `renovating` 且改造阶段为 `交付` 时，才允许转为 `selling`

#### 【在售阶段】
- `PUT /api/v1/projects/{id}/selling/roles`  
  → 更新销售角色（三个字段）
- `POST /api/v1/projects/{id}/selling/viewings|offers|negotiations`  
  → 分别新增带看、出价、面谈记录
- `DELETE /api/v1/projects/{id}/selling/records/{recordId}`  
  → 删除指定记录（需校验 recordId 所属类型及项目归属）

#### 【已售 / 简报】
- `POST /api/v1/projects/{id}/complete`  
  → 接收 `{ soldPrice: float, soldDate: date }`，状态设为 `sold`
- `GET /api/v1/projects/{id}/report` **[可选]**  
  → 返回结构化简报（含关键节点时间、总投入、总收入、ROI 等）

#### 【现金流管理】
- `GET /api/v1/projects/{id}/cashflow`  
  → 返回收支明细列表 + 汇总（总收入、总支出、净现金流、ROI = (收入-支出)/支出）
- `POST /api/v1/projects/{id}/cashflow`  
  → 接收 `{ type, category, amount, date, description, relatedStage }`，**必须校验 category 与 type 匹配**
- `DELETE /api/v1/cashflow/{recordId}`  
  → 删除记录（需校验该记录属于当前项目）

---

### 🛠 任务要求

1. **接口实现**：严格按上述路径、方法、参数、响应格式和业务规则实现。
2. **模块化结构**（示例）：
   backend/
├── routers/
│   ├── projects.py          # 项目相关路由
│   ├── upload.py            # 文件上传路由
│   └── cashflow.py          # 现金流路由
├── services/
│   ├── project_service.py   # 项目业务逻辑
│   └── cashflow_service.py  # 现金流业务逻辑
├── schemas/
│   ├── project.py           # 项目Pydantic模型（含Enum校验）
│   └── cashflow.py          # 现金流Pydantic模型
├── utils/
│   ├── excel_export.py      # Excel导出工具 [可选]
│   └── storage.py           # 文件存储模拟
└── tests/                   # pytest测试用例
    ├── test_projects.py
    ├── test_cashflow.py
    └── test_status_flow.py

3. **数据校验**：
- 所有枚举字段使用 `Literal` 或 `Enum` 在 Pydantic 模型中强制校验
- 状态流转逻辑在 service 层校验（如禁止从 `signing` 直接跳到 `sold`）
4. **错误处理**：
- 统一响应格式：
  ```json
  { "code": 400, "msg": "错误描述", "data": null }

- 常见错误：参数无效、资源不存在、状态非法、权限不足（如有）
5. **测试**：
- 为每个接口编写 `pytest` 测试
- 覆盖：正常流程、枚举值非法、状态流转违规、现金流类型/分类不匹配等
6. **隔离性**：
- **不得修改现有前端或已有后端服务**
- 所有新代码按项目规范组织

---

### 📌 技术栈与规范

- 框架：**FastAPI**（支持异步，但可同步实现）
- ORM：**SQLAlchemy**（复用现有 `Project`、`CashFlowRecord` 等模型；若缺失，请基于上述字段定义）
- 文件存储：本地临时目录（返回可访问 URL 即可）
- 响应成功格式：
json
{ "code": 200, "msg": "success", "data": { ... } }