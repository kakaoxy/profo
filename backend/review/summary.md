# ProFo 后端 FastAPI 最佳实践审查总结报告

## 一、审查概览

| 指标 | 数值 |
|------|------|
| 审查会话数 | 10 |
| 审查文件数 | 50 |
| 审查代码行数 | ~6,500 行 |
| 总问题数 | 86 |
| 🔴 严重 | 14 (16.3%) |
| 🟡 中等 | 52 (60.5%) |
| 🟢 轻微 | 20 (23.2%) |

## 二、各检查项通过率

| 编号 | 检查领域 | 通过率 | 关键差距 |
|------|----------|--------|----------|
| A | 路由设计 | 55% | 路由层越层操作数据库(5处)、子路由缺少prefix/tags(4处)、缺少返回类型注解 |
| B | 依赖注入 | 70% | 依赖中含DB查询、pagination返回dict而非模型、async/def混用 |
| C | 请求验证 | 60% | 缺少Filter Schema(3处)、使用dataclass而非BaseModel、Field(...)用法 |
| D | 响应处理 | 35% | **响应格式与AGENTS.md不一致(全局)**、PaginatedResponse重复定义、Schema过大 |
| E | 错误处理 | 50% | **Service层HTTPException泄漏(7个Service)**、手动异常转换(20+处) |
| F | 文档生成 | 40% | 大量端点缺少summary/description、字段缺少description/examples |
| G | 性能优化 | 65% | N+1查询风险(3处)、async def调用同步Service(2处)、page_size配置不一致 |
| H | 模型与数据层 | 45% | **旧式Column()(4个模型文件)**、**物理ForeignKey(3处)**、init_db用create_all() |

## 三、各优先级分组健康度评分

| 优先级 | 分组 | 健康度 | 说明 |
|--------|------|--------|------|
| P0 | 核心业务+高频 | 45/100 | 认证模块严重越层、异常处理不规范 |
| P1 | 核心业务+复杂 | 50/100 | 模型层旧式语法、Schema设计问题 |
| P2 | 支撑模块 | 55/100 | Service层HTTPException泄漏、路由层越层 |
| P3 | 市场/营销/监控 | 60/100 | 部分模块有良好实践(importer.py) |
| P4 | 基础设施/公共 | 40/100 | **响应格式全局不一致**、BaseModel旧式语法 |

## 四、系统性问题模式

### 模式1：Service层HTTPException泄漏（影响最广）

**涉及文件**：services/leads/core.py, services/projects/renovation.py, services/projects/sales.py, services/projects/finance.py, routers/common/upload.py, routers/public/projects.py, routers/system/roles.py

**问题描述**：7个Service/路由文件直接抛出HTTPException，违反分层职责原则。Service层应抛业务异常，由全局处理器统一转换。

**修复方案**：
1. 创建 `BusinessRuleError` 等业务异常类（已有 ServiceException 体系）
2. 批量替换 Service 层的 `raise HTTPException(...)` 为 `raise ResourceNotFoundError(...)` / `raise BusinessLogicError(...)` 等
3. 路由层的 HTTPException 也应替换为对应业务异常

**预估工作量**：~30处替换，影响7个文件

### 模式2：路由层直接操作数据库（架构违规最严重）

**涉及文件**：routers/public/auth.py, routers/market/communities.py, routers/public/projects.py, dependencies/auth.py

**问题描述**：4个文件在路由/依赖层直接执行 `db.query()` 查询，严重违反 AGENTS.md 的 Router→Service→Model 分层约束。

**修复方案**：
1. 为每个违规路由创建对应的 Service 方法
2. 路由层仅负责参数接收和响应返回
3. 依赖层中的查询逻辑移至 Service

**预估工作量**：4个文件重构，需新建/扩展3-4个Service

### 模式3：SQLAlchemy 旧式 Column() 语法（技术债务最大）

**涉及文件**：models/common/base.py, models/lead/lead.py, models/project/_project_base.py, models/property/property.py

**问题描述**：4个模型文件使用旧式 `Column()` 而非 `Mapped[]` + `mapped_column()`，3处使用物理 ForeignKey。BaseModel 基类本身使用旧式语法，影响所有子模型。

**修复方案**：
1. 先修复 BaseModel 基类（S08-001）
2. 逐个迁移子模型到 Mapped[] 语法
3. 物理 ForeignKey 改为逻辑外键 + Service 层级联
4. 需配合 Alembic 迁移

**预估工作量**：4个文件 + 所有继承 BaseModel 的子模型，需 Alembic 迁移

## 五、最佳实践范例

### 范例1：services/market/importer.py — 不使用HTTPException
通过 `ImportResult` 返回值对象传递导入结果和错误信息，Service 层完全不抛 HTTPException，由路由层根据结果决定响应。这是 Service 层异常处理的最佳实践。

### 范例2：routers/marketing/projects.py — 正确使用APIRouter
```python
router = APIRouter(prefix="/l4-marketing", tags=["l4-marketing"], dependencies=[Depends(require_internal_user)])
```
路由级别定义 prefix/tags/dependencies，子路由不需要重复声明。

### 范例3：routers/common/push.py — 正确使用run_in_threadpool
```python
return await run_in_threadpool(importer.batch_import_json, properties, db, current_user.id)
```
async def 路由中正确使用 `run_in_threadpool` 包装同步 I/O 操作。

### 范例4：utils/common.py RateLimits — 速率限制集中管理
所有路由的速率限制值集中在一个类中管理，避免魔法字符串散布在代码中。

## 六、修复优先级建议

### 批次1：🔴 严重问题（14个，优先修复）

| 问题编号 | 文件 | 问题 | 建议修复方式 |
|----------|------|------|-------------|
| S07-001 | error_handlers.py | 响应格式与AGENTS.md不一致 | **需团队决策**后统一修改 |
| S01-003 | routers/public/auth.py | 路由层直接操作数据库 | 创建Service方法 |
| S01-006 | dependencies/auth.py | 依赖层直接操作数据库 | 移至Service |
| S05-004 | routers/market/communities.py | 路由层直接操作数据库 | 创建Service方法 |
| S10-001 | routers/public/projects.py | 路由层直接操作数据库 | 创建Service方法 |
| S02-001 | models/lead/lead.py | 旧式Column() | 迁移到Mapped[] |
| S02-002 | models/lead/lead.py | 物理ForeignKey | 改为逻辑外键 |
| S02-005 | models/project/_project_base.py | 旧式Column()+物理ForeignKey | 迁移到Mapped[] |
| S08-001 | models/common/base.py | BaseModel旧式Column() | 迁移到Mapped[] |
| S10-002 | models/property/property.py | 旧式Column()+物理ForeignKey | 迁移到Mapped[] |
| S03-001 | services/leads/core.py | Service层抛HTTPException | 替换为业务异常 |
| S03-002 | services/projects/renovation.py | Service层抛HTTPException | 替换为业务异常 |
| S04-001 | services/projects/sales.py | Service层抛HTTPException | 替换为业务异常 |
| S04-002 | services/projects/finance.py | Service层抛HTTPException | 替换为业务异常 |

**⚠️ 关键决策点**：S07-001（响应格式）需要团队确认 AGENTS.md 规范的实际意图后再修复。当前代码注释（如 schemas/response.py "不使用 code/msg/data 包装器"）与 AGENTS.md 规范矛盾，需先统一认知。

### 批次2：🟡 中等问题（52个，当前审查轮次结束前修复）

重点修复方向：
1. Service层HTTPException替换（~20处）
2. 缺少Filter Schema（3处）
3. N+1查询优化（3处）
4. async/def使用规范（2处）
5. PaginatedResponse重复定义统一

### 批次3：🟢 轻微问题（20个，下一个迭代周期修复）

重点修复方向：
1. Field(...) 替换
2. 弃用模块移除时间表
3. ConfigDict 统一
4. 文档补充

## 七、改进趋势分析

### 已改善的领域
1. **依赖注入模式**：项目已广泛使用 `Annotated` 类型别名（如 `DbSessionDep`, `CurrentInternalUserDep`），符合 FastAPI 最新推荐
2. **异常体系**：已建立 `ServiceException` 体系（ResourceNotFoundError, ValidationError 等），结构完善
3. **速率限制**：集中管理在 `RateLimits` 类中，避免魔法字符串
4. **Pydantic v2**：大部分 Schema 已使用 `ConfigDict`, `field_validator`, `model_validator`

### 需改善的领域
1. **分层执行**：Router→Service→Model 分层在部分模块执行不到位
2. **响应格式**：全局响应格式需要统一决策和实施
3. **模型语法**：SQLAlchemy 2.0 Mapped[] 语法迁移尚未启动
4. **文档覆盖**：OpenAPI 文档信息不完整

## 八、下轮审查建议

1. **跟踪修复进度**：按批次1→2→3顺序跟踪修复，每批次修复后运行 `pytest` 全量验证
2. **扩展审查范围**：本次未审查的文件（如 models/user/, models/system/, schemas/user/, schemas/l4_marketing/ 等）应在下轮覆盖
3. **新增检查项**：
   - I1: 测试覆盖率（当前无测试覆盖数据）
   - I2: API 版本管理策略
   - I3: 日志规范一致性
4. **自动化**：考虑将部分检查项（如 H1 旧式 Column 检测、E1 HTTPException 泄漏检测）集成到 CI/CD 的 lint 流程中
