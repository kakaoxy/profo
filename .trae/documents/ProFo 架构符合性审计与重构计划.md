## 已发现问题（按你列的 1-11 对照）

### 第一部分：数据库 Schema 与数据现状
1) projects 表真实物理依赖
- 代码侧“DDL 来源”是 SQLAlchemy 模型 + 启动时 `create_all()`（无迁移脚本）：[db.py](file:///c:/Users/Bugco/Desktop/ProFo/backend/db.py#L59-L67)
- `Project` 模型里 **没有** `rooms/halls/baths/orientation`，只有 `area`（且为 `Numeric(10,2)`）：[project.py](file:///c:/Users/Bugco/Desktop/ProFo/backend/models/project.py#L12-L105)
- 结论（基于代码生成的 DDL）：属于“需要新增字段”，不是“补全字段”。但仍需对现有 `backend/data.db` 的真实 DDL 做一次确认（可能历史上有人手改过表）。

2) FLOAT 类型滥用
- `property_current.build_area/inner_area/listed_price_wan/sold_price_wan` 是 `Float`：[property.py](file:///c:/Users/Bugco/Desktop/ProFo/backend/models/property.py#L15-L115)
- `projects.roi` 是 `Float`（而 `total_income/total_expense` 已是 `Numeric(15,2)`）：[project.py](file:///c:/Users/Bugco/Desktop/ProFo/backend/models/project.py#L85-L89)
- `leads.area` 仍是 `Float`，但其价格类字段已是 `Numeric(15,2)`：[lead.py](file:///c:/Users/Bugco/Desktop/ProFo/backend/models/lead.py#L12-L70)
- 结论：FLOAT/REAL 确实存在，且命中你点名的 `roi/build_area` 风险位。

3) 外键约束的“硬度”（mini_projects → projects）
- `mini_projects.project_id` 目前是 **nullable=True**，但也确实声明了 **物理 FK**：`ForeignKey("projects.id")`：[mini.py](file:///c:/Users/Bugco/Desktop/ProFo/backend/models/mini.py#L31-L74)
- 结论：
  - 插入“历史案例”如果 `project_id = NULL` 不会被 FK 拦截。
  - 但如果你希望“历史案例也能填一个 project_id 但不要求真实存在/允许项目被删除后保留”，那现有 FK 会阻止（属于你说的“硬度”风险）。

### 第二部分：后端代码逻辑
4) Pydantic alias 魔法
- 存在 alias，但不是你希望的“全局 snake_case + 对外 camelCase 的统一策略”。
- 反而出现了更糟的情况：后端 **直接定义并持久化了 camelCase 字段名**（模型层 + schema 层贯穿），例如 `soldPrice/soldDate/channelManager/...`：
  - 模型层：[project.py](file:///c:/Users/Bugco/Desktop/ProFo/backend/models/project.py#L28-L84)
  - schema 层：[project_core.py](file:///c:/Users/Bugco/Desktop/ProFo/backend/schemas/project_core.py#L11-L140)
  - service 写入：[project_sales.py](file:///c:/Users/Bugco/Desktop/ProFo/backend/services/project_sales.py#L106-L126)
- 结论：属于你定义的“最坏情况”分支：Python/DB 层已违规驼峰，需要系统性重构（不能仅靠 alias 粉饰）。

5) 是否存在隐式连表 / 跨域 JOIN
- L4 mini 同步时 **直接 JOIN/查询 L1 `property_current`** 来拼 `layout/orientation`：[mini_service.py](file:///c:/Users/Bugco/Desktop/ProFo/backend/services/mini_service.py#L59-L118)
- L2 `leads.source_property_id` 目前是 **硬 FK 到 `property_current.id`**（违背“软引用”规则）：[lead.py](file:///c:/Users/Bugco/Desktop/ProFo/backend/models/lead.py#L45-L59)
- 结论：跨域耦合点已存在，且一旦断开/去 FK 会影响 mini 同步、lead 的 relationship 等路径。

6) 硬编码 SQL 字符串
- 目前原生 SQL 主要集中在初始化脚本；未发现在 SQL 字符串内写死 `soldPrice` 等 camelCase 列名的证据：[init_admin.py](file:///c:/Users/Bugco/Desktop/ProFo/backend/init_admin.py#L49-L139)
- 结论：这类“字符串隐形地雷”暂时不多，但仍建议在执行重构前跑一次全库 grep 的二次校验。

### 第三部分：前端数据消费
7) 类型定义来源
- `frontend/src/lib/api-types.d.ts` 明确为 openapi-typescript 自动生成：[api-types.d.ts](file:///c:/Users/Bugco/Desktop/ProFo/frontend/src/lib/api-types.d.ts#L1-L4)
- 生成脚本：`pnpm gen-api`：[package.json](file:///c:/Users/Bugco/Desktop/ProFo/frontend/package.json#L5-L11)
- 结论：API types 主体是“生成的”，这是利好。

8) 前端对驼峰依赖深度
- `soldPrice`：17 次 / 9 文件；`soldDate`：21 次 / 9 文件；`listPrice`：16 次 / 7 文件（并不算爆炸级）。
- 但注意：前端存在手写的 `Project` 类型，甚至双写兼容 snake_case 与 camelCase（说明历史包袱已在前端堆起来）：[projects/types.ts](file:///c:/Users/Bugco/Desktop/ProFo/frontend/src/app/(main)/projects/types.ts#L61-L157)
- 结论：改动量中等，可控；但应该尽快收敛到“单一命名体系”。

### 第四部分：业务逻辑盲区
9) leads 现状
- 代码里实际上 **已经有 leads 表与前端 leads 模块**（并非“没有 leads 表”）：
  - 后端模型：[lead.py](file:///c:/Users/Bugco/Desktop/ProFo/backend/models/lead.py#L12-L111)
  - 前端页面：[leads/page.tsx](file:///c:/Users/Bugco/Desktop/ProFo/frontend/src/app/(main)/leads/page.tsx)
- 但是否“真实在用/有历史数据”，需要对 `backend/data.db` 做数据层确认。

10) mini_projects 数据来源
- 增量同步逻辑：从 `projects` 复制 `title/address/area/price`，但 `layout/orientation` 目前来自 L1 `property_current`；`description/marketing_tags` 没有自动填充（更像运营后续手填）：[mini_service.py](file:///c:/Users/Bugco/Desktop/ProFo/backend/services/mini_service.py#L59-L118)

11) 资金字段记录方式
- 已存在明细流水表 `cashflow_records`（每笔 `amount Numeric(15,2)`），并在 `projects` 里缓存 `total_income/total_expense/net_cash_flow`：[project.py](file:///c:/Users/Bugco/Desktop/ProFo/backend/models/project.py#L85-L136)
- 现金流汇总/ROI 计算目前会把 Decimal 转 float 返回，并依赖 `project.soldDate`（camelCase）：[cashflow_service.py](file:///c:/Users/Bugco/Desktop/ProFo/backend/services/cashflow_service.py#L153-L168)
- 结论：新增 `deposit_amount` 前，必须明确它与 `CashFlowCategory.PERFORMANCE_BOND`（履约保证金）以及 `total_expense` 缓存的关系，避免语义重叠。

---

## 接下来执行“数据库实况核对”的计划（需要你允许我执行命令/SQL）

### 1) 直接从 `backend/data.db` 抽取真实 DDL
- 用 sqlite3 执行：
  - `.schema projects` / `.schema property_current` / `.schema mini_projects` / `.schema leads`
  - `PRAGMA table_info('projects');` 等，确认列是否与模型一致（尤其 rooms/halls/baths/orientation 是否存在、是否缺一部分）。

### 2) 核对 FLOAT/REAL 实际落库类型
- `PRAGMA table_info('property_current');` 与 `PRAGMA table_info('projects');`
- 重点看 `roi/build_area/listed_price_wan/sold_price_wan` 的 type 字符串是否为 `REAL/FLOAT/NUMERIC`。

### 3) 核对 mini_projects 的 FK 约束细节
- `PRAGMA foreign_key_list('mini_projects');`
- 同时检查 `PRAGMA foreign_keys;`（SQLite 运行时是否启用 FK enforcement）。

### 4) 数据现状与迁移风险评估
- 统计与抽样：
  - `SELECT COUNT(*) FROM projects;` / `mini_projects` / `leads` / `property_current`
  - `SELECT COUNT(*) FROM mini_projects WHERE project_id IS NULL;`（历史案例比例）
  - `SELECT COUNT(*) FROM mini_projects WHERE project_id IS NOT NULL AND project_id NOT IN (SELECT id FROM projects);`（如果 FK 没启用可能会存在脏数据）
  - 对未来要新增的 rooms/halls/baths/orientation/area 等字段做 NULL 分布评估。

---

## 重构方向建议（在拿到数据库实况后落地）

### A) projects 补齐“物理属性”并去依赖
- 给 `projects` 新增 `rooms/halls/baths/orientation/area`（你们规范要求），并在“从 leads 创建 project”时做快照写入。
- mini_projects 的 layout/orientation 只从 projects 取，不再查询 property_current。

### B) 统一 snake_case（DB/Python）并提供兼容层
- 把 `projects` 里 camelCase 列迁回 snake_case（如 `soldPrice → sold_price` 等）。
- 兼容策略：短期允许 API 同时返回两套字段（或仅对外 camelCase），但内部持久化与业务逻辑必须统一 snake_case。

### C) FLOAT → NUMERIC 的迁移策略
- 对 `build_area/inner_area/roi` 等字段统一改为 Numeric，并在 Pydantic 层统一使用 Decimal（或字符串）承接，前端根据需要格式化展示。

### D) 外键“硬度”对齐 AGENTS 规则
- 将 `leads.source_property_id` 从硬 FK 改为纯软引用。
- 评估 `mini_projects.project_id` 是否保留 FK：
  - 如果要支持“项目删除后 mini 仍保留关联 id”或“允许无效 id”，则需要移除物理 FK。
  - 否则保留 FK 但确保历史案例永远用 NULL。

---

## 验证与交付
- 后端：跑现有 tests（`backend/tests`）覆盖 project/leads/mini/cashflow。
- 前端：重生成 openapi types（`pnpm gen-api`），并用 TypeScript 编译检查所有 camelCase 改动点。
- 数据：提供一份迁移前后字段映射表 + 回滚策略（备份 data.db）。