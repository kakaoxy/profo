# 账本模块分类体系重构计划

> 目标：将记账模块从"枚举硬编码单层分类"重构为"大类固定 + 子项半灵活"的两层结构，支持业务在线扩展细项。
>
> 适用范围：`backend/services/projects/finance/`、`backend/models/project/_project_finance.py`、`frontend/src/components/finance/record-dialog.tsx`、统计接口与卡片。
>
> 编写日期：2026-07-26

---

## 1. 背景与目标

### 1.1 业务诉求

当前记账模块的明细分类是**写死在代码中**的，业务还在发展，未来可能新增细分科目。诉求示例：

- 装修类下添加"定制柜"细项（已存在）
- 差额税费下添加"个税"或"增值税差额"细项（当前不存在）
- 营销类下按业务需要扩展更多细项

期望结构：**大类不动，允许业务在大类下灵活添加细项**。

### 1.2 重构目标

| 维度 | 当前 | 目标 |
|---|---|---|
| 分类层级 | 单层（`category` 枚举） | 两层（大类 + 子项） |
| 大类来源 | `CashFlowCategory` 枚举（46 项） | 大类字典表（系统初始化，业务不可删） |
| 子项来源 | 无（部分细项被并到大类枚举里） | 子项字典表（系统预置 + 业务可加） |
| 前端选项 | 硬编码 `LEDGER_CATEGORY_DATA` | 接口拉取，按钮组渲染 |
| 统计聚合 | `GROUP BY (type, category)` | `GROUP BY (type, category, subcategory_id)` |
| 分类元数据 | 散落在枚举、`RECEIVABLE_PAYABLE_METADATA`、`LEDGER_CATEGORY_DATA` 三处 | 统一收归到字典表与 API |

### 1.3 设计原则（呼应 AGENTS.md）

- **谨慎 > 速度**：保留 `CashFlowCategory` 枚举作为大类来源，避免一次性推翻既有结构
- **显式 > 隐式**：子项必须挂在大类下，禁止"无大类"的孤儿子项
- **简单 > 复杂**：不引入树形结构（不做三级），仅两层
- **向后兼容**：`finance_records.category` 字段保留，新增 `subcategory_id` 字段可空

---

## 2. 现状分析

### 2.1 数据库层

- `finance_records.category` 为 `SQLEnum(CashFlowCategory)` 单层枚举，无 `subcategory` 字段
- `finance_records.receipt_urls` 为 `JSON` 列（`list[str] | None`），存储票据图片 URL 列表，**已存在且保留**
- 无独立分类字典表

### 2.2 后端校验

- [`backend/services/projects/finance/base.py:89-149`](file:///Users/bugco/Desktop/profo/backend/services/projects/finance/base.py) `_validate_category`：仅按 `type` 分组校验，包含 14 项前端 UI 不展示的历史遗留枚举
- [`backend/services/projects/finance/records.py:48-60`](file:///Users/bugco/Desktop/profo/backend/services/projects/finance/records.py) 业务形式校验仅拦截 `PURCHASE_PRICE` 与 `AGENCY_COMMISSION`，覆盖不全

### 2.3 前端硬编码

- [`frontend/src/components/finance/record-dialog.tsx:45-88`](file:///Users/bugco/Desktop/profo/frontend/src/components/finance/record-dialog.tsx) `LEDGER_CATEGORY_DATA` 三级结构（业务类型 → 阶段 → 分类）硬编码
- 同文件 83-88 行 `CATEGORY_DISPLAY_TO_ENUM` 4 项显示名映射，与后端枚举值不一致
- 同文件 129-177 行**已有票据上传**（`receiptUrls` state，最多 9 张），随 `receipt_urls` 字段提交，**重构保留**
- [`frontend/src/app/(main)/admin/ledger/_components/ledger-schema.ts:23`](file:///Users/bugco/Desktop/profo/frontend/src/app/(main)/admin/ledger/_components/ledger-schema.ts) Zod `category: z.string()` 未对齐枚举
- [`frontend/src/app/(main)/admin/ledger/[projectId]/_components/ledger-detail-table.tsx:149-151`](file:///Users/bugco/Desktop/profo/frontend/src/app/(main)/admin/ledger/[projectId]/_components/ledger-detail-table.tsx) **已有票据筛选** `voucherFilter`（`all` / `with` / `without`），基于 `receipt_urls` 判断，**重构保留**
- [`frontend/src/app/(main)/admin/ledger/[projectId]/_components/ledger-detail-table-row.tsx:34`](file:///Users/bugco/Desktop/profo/frontend/src/app/(main)/admin/ledger/[projectId]/_components/ledger-detail-table-row.tsx) 表格行**已有票据列**（`hasVoucher` + 缩略图），**重构保留**

### 2.4 统计与卡片

- [`backend/services/projects/finance/statistics.py:78-98`](file:///Users/bugco/Desktop/profo/backend/services/projects/finance/statistics.py) 单次 `GROUP BY (type, category)` 聚合
- [`backend/services/projects/finance/statistics_builder.py`](file:///Users/bugco/Desktop/profo/backend/services/projects/finance/statistics_builder.py) calc_breakdown 按 22/17 个枚举硬编码构造
- 装修卡片数据来自 `ProjectRenovation` 合同模型而非流水分类（**两套数据可能不一致**，需在重构中考虑是否统一）
- **统计卡片迭代目标**：[`docs/ledger-cashflow-dashboard/index.html`](file:///Users/bugco/Desktop/profo/docs/ledger-cashflow-dashboard/index.html)，按"利润三层结构 + 全周期现金流时间轴"重构统计页，取代当前按枚举硬编码的卡片布局

### 2.5 关键问题清单

1. **三处手工同步**：枚举 / 校验集合 / 前端硬编码，新增分类要改三处
2. **业务形式校验不全**：wholesale 专属分类在 agent 项目下也能创建
3. **历史遗留枚举**：14 项枚举值前端不展示但仍可通过 API 创建
4. **前端 Zod 未校验**：`category: z.string()` 与后端枚举语义不严格对齐
5. **装修卡片数据源不一致**：流水分类与 `ProjectRenovation` 模型并存

---

## 3. 目标架构

### 3.1 两层分类模型

```
┌─────────────────────────────────────────┐
│  大类 (finance_categories)              │  ← 系统预置，业务不可删
│  - category: 枚举值 (履约保证金 / 装修类 /  │
│    差额税费 / 营销类 / 运营服务费 / ...)   │
│  - type: expense / income               │
│  - business_forms: [agent, wholesale]   │
│  - stage: 签约 / 装修 / 在售 / 已售 / 其他 │
│  - is_system: True (不可删)             │
└────────────────┬────────────────────────┘
                 │ 1:N
┌────────────────▼────────────────────────┐
│  子项 (finance_subcategories)            │  ← 系统预置 + 业务可加
│  - parent_id: → finance_categories.id   │
│  - code: "custom_cabinet" (项目内唯一)   │
│  - name: "定制柜"                       │
│  - is_system: True/False                 │
│  - is_active: True/False                 │
│  - sort_order: int                       │
└─────────────────────────────────────────┘
                 │ 1:N
┌────────────────▼────────────────────────┐
│  finance_records                         │
│  - category: SQLEnum (大类，保留)        │
│  - subcategory_id: FK → subcategories.id │  ← 新增，可空
│  - subcategory_name: str (冗余字段)      │  ← 新增，便于查询展示
└─────────────────────────────────────────┘
```

### 3.2 设计权衡

| 设计点 | 选择 | 理由 |
|---|---|---|
| 大类存储 | 字典表 + 保留枚举字段 | 枚举作为强类型约束，字典表承载元数据（business_forms/stage/label） |
| 子项存储 | 字典表 + 外键 | 业务可加，无需改代码；外键保证引用完整性 |
| 子项作用域 | 项目级 vs 全局 | **全局**（推荐）：一处添加，所有项目可用；避免每个项目重复维护 |
| `subcategory_name` 冗余字段 | 保留 | 子项被删除后历史流水仍可展示名称（软删不硬删） |
| 大类软删 | 不允许 | 大类是系统级，预置后不可删 |
| 子项软删 | 允许 | 业务可停用，但已有流水引用时不允许硬删 |

### 3.3 与 `RECEIVABLE_PAYABLE_METADATA` 的关系

当前 [`backend/services/projects/finance/receivable_payable.py:30-381`](file:///Users/bugco/Desktop/profo/backend/services/projects/finance/receivable_payable.py) 中的 `RECEIVABLE_PAYABLE_METADATA` 列表是项目里最完整的分类元数据来源。**重构后将此列表迁入字典表**，应收应付接口改为查表，不再读硬编码列表。

---

## 4. 数据模型设计

### 4.1 大类字典表 `finance_categories`

```python
class FinanceCategory(BaseModel):
    __tablename__ = "finance_categories"
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)  # 如 "renovation"
    category: Mapped[CashFlowCategory] = mapped_column(SQLEnum(CashFlowCategory), nullable=False)
    label: Mapped[str] = mapped_column(String(64), nullable=False)  # 显示名 "装修类"
    type: Mapped[CashFlowType] = mapped_column(SQLEnum(CashFlowType), nullable=False)
    business_forms: Mapped[list[str]] = mapped_column(JSON, nullable=False)  # ["agent", "wholesale"]
    stage: Mapped[str] = mapped_column(String(16), nullable=False)  # 签约/装修/在售/已售/其他
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_system: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    description: Mapped[str | None] = mapped_column(String(200), nullable=True)
```

索引：`idx_fc_type_business` (type, is_active)、`idx_fc_category` (category)

### 4.2 子项字典表 `finance_subcategories`

```python
class FinanceSubcategory(BaseModel):
    __tablename__ = "finance_subcategories"
    parent_id: Mapped[int] = mapped_column(ForeignKey("finance_categories.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(64), nullable=False)  # 如 "custom_cabinet"
    name: Mapped[str] = mapped_column(String(64), nullable=False)  # 显示名 "定制柜"
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_by: Mapped[int | None] = mapped_column(Integer, nullable=True)  # user_id
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("parent_id", "code", name="uq_subcategory_parent_code"),
    )
```

索引：`idx_fsc_parent_active` (parent_id, is_active)

### 4.3 `finance_records` 表扩展

```python
class FinanceRecord(BaseModel):
    # 既有字段保留
    category: Mapped[CashFlowCategory] = mapped_column(...)  # 大类，保留
    # 新增字段
    subcategory_id: Mapped[int | None] = mapped_column(
        ForeignKey("finance_subcategories.id"), nullable=True
    )
    subcategory_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
```

- `subcategory_id` 可空：兼容历史数据（未挂子项的视为"默认子项"或"无子项"）
- `subcategory_name` 冗余：避免子项被软删后历史流水展示丢失

### 4.4 大类预置清单（基于 `RECEIVABLE_PAYABLE_METADATA` 收敛）

> 详细对照表见附录 A。预置 32 项大类（支出 24 + 收入 8），覆盖当前前端 UI 实际展示的全部分类。14 项历史遗留枚举不预置到大类字典，但保留 Python 枚举本身（避免破坏老数据读取）。

### 4.5 子项预置清单

> 详见附录 B。每个大类预置 1-2 项系统子项（`is_system=True`），业务添加的子项 `is_system=False`。

---

## 5. API 设计

### 5.1 查询接口

#### `GET /api/v1/admin/finance/categories`

返回大类与子项的层级树，按业务形式过滤。

**Query 参数**：
- `business_form`: `agent` / `wholesale` / `all`（默认 `all`）
- `type`: `expense` / `income` / `all`

**响应**：

```json
{
  "expense": [
    {
      "code": "renovation",
      "category": "硬装",
      "label": "装修类",
      "type": "expense",
      "business_forms": ["agent", "wholesale"],
      "stage": "装修",
      "subcategories": [
        {"id": 1, "code": "hard", "name": "硬装", "is_system": true},
        {"id": 2, "code": "soft", "name": "软装", "is_system": true},
        {"id": 3, "code": "custom_cabinet", "name": "定制柜", "is_system": true},
        {"id": 7, "code": "extra_lighting", "name": "灯具", "is_system": false}
      ]
    }
  ],
  "income": [...]
}
```

#### `GET /api/v1/admin/finance/categories/{parent_id}/subcategories`

仅返回指定大类下的子项（用于表单联动选择）。

### 5.2 管理接口

> 仅 admin 角色可访问，权限码：`finance:category:manage`

#### `POST /api/v1/admin/finance/categories/{parent_id}/subcategories`

新增子项（业务可加）。

```json
// Request
{
  "code": "extra_lighting",
  "name": "灯具",
  "description": "室内灯具采购",
  "sort_order": 100
}
// Response
{
  "id": 7,
  "parent_id": 5,
  "code": "extra_lighting",
  "name": "灯具",
  "is_system": false,
  "is_active": true
}
```

**校验**：
- `code` 在同 parent 下唯一
- `name` 非空
- `parent.is_active` 必须为 true
- 不允许业务创建 `is_system=true` 的子项

#### `PATCH /api/v1/admin/finance/subcategories/{id}`

更新子项（仅 `name` / `description` / `sort_order` / `is_active` 可改）。

#### `DELETE /api/v1/admin/finance/subcategories/{id}`

软删子项（`is_active=false`）。**若已有流水引用**：
- 系统子项（`is_system=true`）：禁止删除，仅可停用
- 业务子项（`is_system=false`）：允许软删，历史流水通过 `subcategory_name` 冗余字段保持展示

#### 大类管理

大类**不开放增删改接口**（系统级，由迁移脚本预置）。如需新增大类，走版本迭代 + 迁移脚本。

### 5.3 流水接口调整

#### `POST /api/v1/admin/ledger`

`LedgerRecordCreate` schema 新增字段：

```python
class LedgerRecordCreate(BaseModel):
    # 既有字段
    type: CashFlowType
    category: CashFlowCategory  # 大类，保留
    amount: Decimal
    record_date: datetime
    counterparty: str | None = None
    receipt_urls: list[str] | None = None  # 既有字段，票据图片URL列表，保留
    # 新增字段
    subcategory_id: int | None = None
    subcategory_name: str | None = None  # 与 subcategory_id 二选一或同时传
```

**校验逻辑**（[`backend/services/projects/finance/records.py`](file:///Users/bugco/Desktop/profo/backend/services/projects/finance/records.py)）：

1. 既有 `_validate_category(type, category)` 保留
2. 新增 `_validate_subcategory(category, subcategory_id, business_form)`：
   - 若传 `subcategory_id`：校验子项存在、`is_active=true`、`parent.category == category`、`business_form in parent.business_forms`
   - 若不传：兼容老逻辑，`subcategory_name` 也为空
3. 增强 `_validate_business_form`：基于大类字典的 `business_forms` 字段校验，替换当前硬编码 2 项校验
4. `receipt_urls` 不做特殊校验（URL 列表由前端上传接口返回，后端仅存储）

### 5.4 统计接口调整

#### `GET /api/v1/admin/ledger/{project_id}/statistics`

统计聚合查询改为：

```python
agg_rows = (
    self.db.query(
        FinanceRecord.type,
        FinanceRecord.category,
        FinanceRecord.subcategory_id,
        func.sum(FinanceRecord.amount).label("total"),
    )
    .filter(...)
    .group_by(FinanceRecord.type, FinanceRecord.category, FinanceRecord.subcategory_id)
    .all()
)
```

**响应 schema 调整**：

各分组（如 `LedgerStatisticsRenovation`）新增 `items: list[LedgerStatisticsSubcategoryItem]` 字段，承载子项明细：

```python
class LedgerStatisticsSubcategoryItem(BaseModel):
    subcategory_id: int | None
    subcategory_name: str
    amount: Decimal

class LedgerStatisticsRenovation(BaseModel):
    # 既有字段保留
    hard_amount: Decimal
    custom_cabinet: Decimal
    # ...
    # 新增字段
    items: list[LedgerStatisticsSubcategoryItem]  # 子项明细
```

**前端卡片**：在既有汇总值下方折叠展示子项明细列表（默认折叠，点击展开）。

#### calc_breakdown 构造

[`statistics_builder.py`](file:///Users/bugco/Desktop/profo/backend/services/projects/finance/statistics_builder.py) 改为按字典表查询大类与子项，动态构造 items，不再硬编码 22/17 项枚举。

---

## 6. 前端改造

### 6.1 RecordDialog 改造

**当前**：[`frontend/src/components/finance/record-dialog.tsx:45-88`](file:///Users/bugco/Desktop/profo/frontend/src/components/finance/record-dialog.tsx) 硬编码 `LEDGER_CATEGORY_DATA`；同文件 129-177 行已有票据上传（`receiptUrls` state，最多 9 张）

**目标**：

1. 移除 `LEDGER_CATEGORY_DATA` 与 `CATEGORY_DISPLAY_TO_ENUM`
2. 通过 SWR 拉取 `/admin/finance/categories?business_form={form}`：
   ```typescript
   const { data: categoryTree } = useSWR(
     `/api/v1/admin/finance/categories?business_form=${businessForm}`,
     fetcher
   );
   ```
3. UI 改为两段式：
   - **第一段**：大类按钮组（按 stage 分组），点击后高亮选中
   - **第二段**：子项按钮组（仅展示选中大类下的子项），可多选其一或"无子项"
4. 提交时同时传 `category` 与 `subcategory_id`
5. **票据上传保留**：现有 `receiptUrls` state + 上传组件（最多 9 张）不动，随三层分类一同提交 `receipt_urls`；支持后续在流水表格中补传

### 6.2 子项管理界面

新增 admin 路由 `/admin/finance/categories`：

- 大类列表（只读展示，按 stage 分组）
- 每个大类下展开子项列表（可新增/编辑/停用）
- 操作日志记录

### 6.3 流水表格调整

- [`ledger-detail-table-row.tsx:65-72`](file:///Users/bugco/Desktop/profo/frontend/src/app/(main)/admin/ledger/[projectId]/_components/ledger-detail-table-row.tsx) 渲染 `record.category` 时附加 `subcategory_name`（若有）
- [`ledger-detail-table-filter.tsx`](file:///Users/bugco/Desktop/profo/frontend/src/app/(main)/admin/ledger/[projectId]/_components/ledger-detail-table-filter.tsx) 分类筛选项改为"大类 + 子项"两级 Select 联动
- **票据筛选保留**：现有 `voucherFilter`（`all` / `with` / `without`，见 [`ledger-detail-table.tsx:149-151`](file:///Users/bugco/Desktop/profo/frontend/src/app/(main)/admin/ledger/[projectId]/_components/ledger-detail-table.tsx)）不动，基于 `receipt_urls` 判断有/无票据；筛选条件独立于分类筛选，可与任意层级组合
- **票据列保留**：现有 `hasVoucher` + 缩略图列（见 [`ledger-detail-table-row.tsx:34`](file:///Users/bugco/Desktop/profo/frontend/src/app/(main)/admin/ledger/[projectId]/_components/ledger-detail-table-row.tsx)）不动，展示票据张数徽标 + 点击查看/补传
- **票据补传**：流水行支持后续补传票据（`PATCH /admin/ledger/{id}` 追加 `receipt_urls`，见 [`actions.ts:261-266`](file:///Users/bugco/Desktop/profo/frontend/src/app/(main)/admin/ledger/actions.ts)）

### 6.4 Zod schema 对齐

[`ledger-schema.ts`](file:///Users/bugco/Desktop/profo/frontend/src/app/(main)/admin/ledger/_components/ledger-schema.ts) 调整：

```typescript
category: z.enum([...CASH_FLOW_CATEGORIES], { message: "收支分类无效" })  // 改为枚举校验
subcategory_id: z.number().int().positive().nullable().optional()
```

### 6.5 统计卡片迭代（目标：`docs/ledger-cashflow-dashboard`）

**迭代目标**：统计页按 [`docs/ledger-cashflow-dashboard/index.html`](file:///Users/bugco/Desktop/profo/docs/ledger-cashflow-dashboard/index.html) 的"利润三层结构 + 全周期现金流时间轴"重构，取代当前按枚举硬编码的卡片布局。

**对齐要素**（与 cashflow-dashboard 一致）：

1. **8 项 KPI 网格**：项目总支出 / 前期投入 / 毛利 / 净利 / 收入 / 资金占用天数 / 投资回报率 / 年化回报率
2. **利润三层结构**：收入层 → 毛利层（收入 − 直接成本）→ 净利层（毛利 − 运营 − 融资）
3. **全周期现金流时间轴**：agent 4 阶段（签约 → 装修 → 在售 → 已售）/ wholesale 4 阶段（签约 → 持有 → 装修 → 已售），每阶段列含流向明细 + 阶段净额
4. **流向语义色**：绿（流入）/ 红（流出）/ 蓝（配对核销）/ 棕金（融资往来）
5. **业务模式切换**：agent / wholesale 一键切换，KPI + 三层结构 + 时间轴联动

**子项折叠展示**：各卡片（如 RenovationCard）在既有汇总值下方新增折叠区域，展示子项明细列表：

```
装修预算
├── 硬装    ¥250,000
├── 软装    ¥100,000
├── 定制柜  ¥80,000
└── 业务新增子项...
```

**响应结构对齐**：后端 `ProjectLedgerStatisticsResponse` 改为按算账层级分组（9 层），每层含科目列表 + 子项明细，前端据三层结构算账渲染（见 §5.4）。

---

## 7. 迁移策略

> 严格遵循 AGENTS.md §3：通过 `backend/migrations/__init__.py` 启动迁移脚本管理，必须幂等。

### 7.1 迁移步骤

1. **建表**：`finance_categories` + `finance_subcategories`
2. **加字段**：`finance_records.subcategory_id` + `finance_records.subcategory_name`（nullable）
3. **种子数据**：预置 32 项大类 + 子项（见附录 A/B）
4. **回填 `subcategory_name`**（可选）：对历史 `finance_records` 不强制回填，留空即可

### 7.2 幂等保障

```python
def _ensure_finance_category(code: str, ...) -> None:
    exists = db.query(FinanceCategory).filter_by(code=code).first()
    if exists:
        return
    db.add(FinanceCategory(code=code, ...))

def _ensure_finance_subcategory(parent_code: str, code: str, name: str, ...) -> None:
    parent = db.query(FinanceCategory).filter_by(code=parent_code).first()
    if not parent:
        return
    exists = db.query(FinanceSubcategory).filter_by(parent_id=parent.id, code=code).first()
    if exists:
        return
    db.add(FinanceSubcategory(parent_id=parent.id, code=code, name=name, ...))
```

### 7.3 兼容老数据

- 历史 `finance_records.subcategory_id = NULL`：兼容，统计聚合时 `GROUP BY` 含 NULL 不会报错
- 历史 `category` 枚举值（含 14 项遗留枚举）：保留可读，不主动迁移到大类字典；这些流水的 `category` 字段继续按枚举值展示，但不会出现在新版的"可选大类"列表中

### 7.4 回滚方案

- **数据库回滚**：迁移脚本设计为只增不删，回滚时仅停用字典表 `is_active=false`，`finance_records.subcategory_id` 字段保留为空
- **代码回滚**：保留 `LEDGER_CATEGORY_DATA` 常量一版本作为 fallback，待字典表稳定后再删除

---

## 8. 实施步骤

### 阶段一：基础设施（建议 1-2 个 PR）

| 步骤 | 内容 | 涉及文件 |
|---|---|---|
| 1 | 建 `FinanceCategory` / `FinanceSubcategory` 模型 | `backend/models/project/_project_finance.py` |
| 2 | 迁移脚本预置大类与子项 | `backend/migrations/__init__.py` |
| 3 | `finance_records` 加 `subcategory_id` / `subcategory_name` 字段 | 同 1 |
| 4 | Schema 调整：`LedgerRecordCreate` 等增加 subcategory 字段 | `backend/schemas/project/finance.py` |
| 5 | `pnpm gen-api` 同步前端类型 | `frontend/src/lib/api-types.d.ts` |

### 阶段二：后端 API（建议 1 个 PR）

| 步骤 | 内容 | 涉及文件 |
|---|---|---|
| 6 | 实现分类查询与管理接口 | 新建 `backend/routers/finance/categories.py` |
| 7 | 改造 `_validate_category` / `_validate_subcategory` / `_validate_business_form` | `backend/services/projects/finance/base.py`、`records.py` |
| 8 | 统计聚合 SQL 改为三层 GROUP BY | `backend/services/projects/finance/statistics.py` |
| 9 | calc_breakdown 改为查表构造 | `backend/services/projects/finance/statistics_builder.py` |
| 10 | `RECEIVABLE_PAYABLE_METADATA` 迁入字典表 | `backend/services/projects/finance/receivable_payable.py` |

### 阶段三：前端改造（建议 2 个 PR）

| 步骤 | 内容 | 涉及文件 |
|---|---|---|
| 11 | RecordDialog 改为接口驱动 + 两段式选择 | `frontend/src/components/finance/record-dialog.tsx` |
| 12 | Zod schema 对齐枚举 | `frontend/src/app/(main)/admin/ledger/_components/ledger-schema.ts` |
| 13 | 流水表格筛选项改为大类+子项联动 | `ledger-detail-table-filter.tsx` |
| 14 | 流水行展示 `category / subcategory_name` | `ledger-detail-table-row.tsx` |
| 15 | 统计卡片展示子项明细折叠列表 | `statistics/_components/*.tsx` |
| 16 | 新增子项管理界面 | `frontend/src/app/(main)/admin/finance/categories/` |

### 阶段四：清理与对齐（建议 1 个 PR）

| 步骤 | 内容 |
|---|---|
| 17 | 评估 14 项历史遗留枚举是否清理（标注"已弃用"或迁移到字典） |
| 18 | 评估装修卡片数据源是否统一到流水分类（替代 `ProjectRenovation`） |
| 19 | 删除 `LEDGER_CATEGORY_DATA` 与 `CATEGORY_DISPLAY_TO_ENUM` |
| 20 | 完善 `_validate_business_form` 覆盖所有 wholesale/agent 专属分类 |

---

## 9. 风险与未覆盖点

### 9.1 风险

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| 字典表数据错误导致流水创建失败 | 高 | 迁移脚本幂等 + 预置数据 review + 灰度发布 |
| 统计接口响应结构变化破坏前端 | 中 | 保留既有字段（如 `hard_amount`），仅新增 `items` 字段；分版本切换 |
| 老流水 `subcategory_id=NULL` 在统计中聚合异常 | 低 | GROUP BY 含 NULL 不报错；前端展示"无子项"占位 |
| 业务形式校验增强导致历史流水不合规 | 中 | 仅对**新建**流水做严格校验，历史数据不回溯 |
| 装修卡片数据源是否统一 | 中 | 阶段四评估，本计划不强制处理 |

### 9.2 ⚠️ 未覆盖点

1. **装修卡片数据源不统一**：当前 `RenovationCard` 数据来自 `ProjectRenovation` 合同模型，与流水分类中的装修类（`HARD_DECORATION` 等）并存。本计划**不强制统一**，留待阶段四评估是否将装修合同数据也迁入流水分类体系。
2. **14 项历史遗留枚举的处理**：本计划保留枚举本身（避免破坏老数据读取），但不预置到大类字典。是否彻底清理（删除枚举值）需评估老数据引用情况。
3. **三级分类的可能性**：本计划明确**只做两层**，若未来业务需要三级（如装修类 → 软装 → 窗帘），需重新评估数据结构。
4. **子项作用域**：本计划选择"全局"（一处添加，所有项目可用）。若业务需要"项目级子项"（如某项目独有的费用名），需扩展 `finance_subcategories` 增加 `project_id` 字段（当前不做）。
5. **`RECEIVABLE_PAYABLE_METADATA` 中 calc_type / calc_cap 等计算逻辑字段**：迁入字典表时需考虑这些字段的存储与查询方式，本计划未细化。
6. **权限设计**：管理接口的权限码 `finance:category:manage` 需确认是否在现有权限体系内，或需新增。
7. **跟投逻辑中"首付资金机会成本"是否纳入子项管理**：当前明确**不在项目中计算**，归入跟投逻辑独立模块，本计划不覆盖。

---

## 10. 验收标准

| 维度 | 验收项 |
|---|---|
| 数据库 | 字典表预置 32 大类 + 系统子项；`finance_records` 新字段 nullable；幂等迁移可重复执行 |
| 后端 | `GET /finance/categories` 返回完整层级树；`POST /ledger` 校验子项归属；统计聚合三层 GROUP BY |
| 前端 | RecordDialog 通过接口拉取选项；两段式选择；Zod 对齐枚举；流水表格展示子项 |
| 统计 | 各卡片展示子项明细折叠列表；calc_breakdown 动态构造 |
| 兼容 | 历史流水（无 subcategory_id）正常展示与统计；不强制回填 |
| 测试 | `pytest` 全绿；`ruff check .` / `ruff format .` 通过；`tsc --noEmit` 零错；`pnpm lint` 通过 |

---

## 附录 A：大类预置清单（32 项）

> 基于 `RECEIVABLE_PAYABLE_METADATA` 收敛，对应前端 UI 实际展示的 32 项分类。

### A.1 支出大类（24 项）

| code | category 枚举 | label | type | business_forms | stage |
|---|---|---|---|---|---|
| performance_bond | PERFORMANCE_BOND | 履约保证金 | expense | [agent] | 签约 |
| channel_commission | CHANNEL_COMMISSION | 渠道佣金 | expense | [agent, wholesale] | 签约 |
| purchase_deposit | PURCHASE_DEPOSIT | 购房款-定金 | expense | [wholesale] | 签约 |
| purchase_downpayment | PURCHASE_DOWNPAYMENT | 购房款-首付 | expense | [wholesale] | 签约 |
| purchase_tax | HOUSE_TAX | 购房款-税费 | expense | [wholesale] | 签约 |
| quota_fee | QUOTA_FEE | 名额费 | expense | [wholesale] | 签约 |
| holding_monthly | HOLDING_COST_MONTHLY | 持有月供 | expense | [wholesale] | 签约 |
| hard_decoration | HARD_DECORATION | 硬装 | expense | [agent, wholesale] | 装修 |
| soft_decoration | SOFT_DECORATION | 软装 | expense | [agent, wholesale] | 装修 |
| custom_cabinet | CUSTOM_CABINET_DECORATION | 定制柜 | expense | [agent, wholesale] | 装修 |
| window_decoration | WINDOW_DECORATION | 窗户 | expense | [agent, wholesale] | 装修 |
| wall_decoration | WALL_DECORATION | 墙面 | expense | [agent, wholesale] | 装修 |
| other_decoration | OTHER_DECORATION | 其他装修 | expense | [agent, wholesale] | 装修 |
| marketing_advance | MARKETING_ADVANCE | 营销费垫付 | expense | [agent, wholesale] | 在售 |
| marketing_promotion | MARKETING_PROMOTION | 营销推广费 | expense | [agent, wholesale] | 已售 |
| operation_fee | OPERATION_FEE | 运营费 | expense | [agent, wholesale] | 已售 |
| finance_tax_cost | FINANCE_TAX_COST | 财税成本 | expense | [agent, wholesale] | 已售 |
| project_incentive | PROJECT_INCENTIVE | 项目激励 | expense | [agent, wholesale] | 已售 |
| investment_return | INVESTMENT_RETURN | 跟投本金退还 | expense | [agent, wholesale] | 已售 |
| investor_profit | INVESTOR_PROFIT | 投资人利润分配 | expense | [agent, wholesale] | 已售 |
| tax_commission_diff | TAX_COMMISSION_DIFF | 税费及佣金差额 | expense | [agent] | 已售 |
| paid_commission | PAID_COMMISSION | 代付佣金 | expense | [agent] | 已售 |
| selling_tax | SELLING_TAX | 卖房税费 | expense | [wholesale] | 已售 |
| selling_commission | SELLING_COMMISSION | 卖房佣金 | expense | [wholesale] | 已售 |
| project_reserve | PROJECT_RESERVE | 项目备用金 | expense | [agent, wholesale] | 其他 |
| other_expense | OTHER_EXPENSE | 其他支出 | expense | [agent, wholesale] | 其他 |

### A.2 收入大类（8 项）

| code | category 枚举 | label | type | business_forms | stage |
|---|---|---|---|---|---|
| project_investment | PROJECT_INVESTMENT | 项目跟投款 | income | [agent, wholesale] | 在售 |
| marketing_deduction | MARKETING_PROMOTION_DEDUCTION | 营销推广费抵扣 | income | [agent, wholesale] | 已售 |
| bond_recovery | BOND_RECOVERY | 保证金回收 | income | [agent] | 已售 |
| value_added_fee | VALUE_ADDED_FEE | 增值服务费 | income | [agent] | 已售 |
| owner_commission | OWNER_COMMISSION | 业主佣金 | income | [agent] | 已售 |
| house_sale | HOUSE_SALE | 售房款 | income | [wholesale] | 已售 |
| backup_recovery | BACKUP_RECOVERY | 备用金回收 | income | [agent, wholesale] | 其他 |
| other_income | OTHER_INCOME | 其他收入 | income | [agent, wholesale] | 其他 |

---

## 附录 B：子项预置清单（建议）

> 每个大类预置 1-2 项系统子项（`is_system=True`），其余由业务添加。下表为示例，需与业务方对齐后定稿。

| 大类 code | 预置子项 |
|---|---|
| hard_decoration | 主材、辅材、人工 |
| soft_decoration | 家具、家电、饰品 |
| custom_cabinet | 衣柜、橱柜、书柜 |
| tax_commission_diff | 卖房佣金差额、个税 |
| selling_tax | 增值税、个税、其他税费 |
| marketing_promotion | 平台费、中介费、广告费 |
| operation_fee | 物业费、水电费、维护费 |
| other_decoration | 设计费、拆除费、垃圾费、清洁费 |
| other_expense | （不预置，由业务添加） |
| other_income | （不预置，由业务添加） |

---

## 附录 C：API 示例汇总

### C.1 拉取分类树

```http
GET /api/v1/admin/finance/categories?business_form=agent&type=expense
```

### C.2 新增子项

```http
POST /api/v1/admin/finance/categories/5/subcategories
Content-Type: application/json

{
  "code": "extra_lighting",
  "name": "灯具",
  "description": "室内灯具采购",
  "sort_order": 100
}
```

### C.3 创建流水（带子项）

```http
POST /api/v1/admin/ledger
Content-Type: application/json

{
  "project_id": "abc-123",
  "type": "expense",
  "category": "硬装",
  "subcategory_id": 12,
  "amount": 80000,
  "record_date": "2026-07-26T10:00:00+08:00",
  "counterparty": "上海XX装修公司"
}
```

### C.4 统计响应（含子项明细）

```json
{
  "renovation": {
    "hard_amount": 250000,
    "soft_amount": 100000,
    "items": [
      {"subcategory_id": 11, "subcategory_name": "主材", "amount": 150000},
      {"subcategory_id": 12, "subcategory_name": "辅材", "amount": 60000},
      {"subcategory_id": 13, "subcategory_name": "人工", "amount": 40000},
      {"subcategory_id": 21, "subcategory_name": "灯具", "amount": 80000}
    ]
  }
}
```
