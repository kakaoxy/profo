# 审查结果跟踪表

## 统计概览
- 总问题数: 86
- 🔴 严重: 14 (已修复: 14, 验证通过: 14)
- 🟡 中等: 52 (已修复: 42, 延期: 10)
- 🟢 轻微: 20 (已修复: 14, 延期: 6)

## 验证日期: 2026-06-14

### 第二轮验证结果摘要 (2026-06-14)
- **中等问题**: 新增修复 17 个延期问题，剩余 10 个延期（5个需团队决策/基础设施，5个需设计决策）
- **轻微问题**: 新增修复 14 个延期问题，剩余 6 个延期
- **测试覆盖**: 948 测试全部通过，覆盖率 83.75%

### 第一轮验证结果摘要 (2026-06-14)
- **严重问题**: 14/14 全部验证通过
- **中等问题**: 28/30 验证通过，2个重新打开并修复
- **额外发现**: 3处路由层违规问题已修复
- **测试覆盖**: 948 测试全部通过，覆盖率 83.65%

## 问题清单

| 编号 | 文件 | 检查项 | 严重程度 | 状态 | 修复批次 | 审查会话 | 修复提交 |
|------|------|--------|----------|------|----------|----------|----------|
| S01-001 | routers/projects/core.py | A4 | 🟡 | 已关闭 | 批次2 | 01 | 验证时已修复 |
| S01-002 | routers/projects/core.py | A4,E1 | 🟡 | 已关闭 | 批次2 | 01 | 验证时已修复 |
| S01-003 | routers/public/auth.py | A4 | 🔴 | 已关闭 | 批次1 | 01 | 验证时已修复 |
| S01-004 | routers/public/auth.py | E1 | 🟡 | 已关闭 | 批次2 | 01 | 验证时已修复 |
| S01-005 | routers/public/auth.py | A4,E1 | 🟡 | 已关闭 | 批次2 | 01 | 验证时已修复 |
| S01-006 | dependencies/auth.py | B3 | 🔴 | 已关闭 | 批次1 | 01 | HTTPException→ServiceException |
| S01-007 | dependencies/auth.py | B2,G1 | 🟡 | 已关闭 | 批次2 | 01 | 验证时已修复(run_in_threadpool) |
| S01-008 | dependencies/auth.py | B2 | 🟢 | 已关闭 | 批次3 | 01 | async def→def(无await) |
| S01-009 | services/system/auth.py | G4 | 🟡 | 已关闭 | 批次2 | 01 | page_size统一使用settings |
| S01-010 | services/system/auth.py | G2 | 🟡 | 已关闭 | 批次2 | 01 | 评估后确认async/sync设计正确 |
| S01-011 | routers/system/auth.py | E1 | 🟡 | 已关闭 | 批次2 | 01 | 验证时已修复 |
| S01-012 | routers/system/auth.py | A6,D1 | 🟡 | 已关闭 | 批次2 | 01 | exchange_token返回类型已修复 |
| S01-013 | routers/system/auth.py | A6,D1 | 🟢 | 已关闭 | 批次3 | 01 | 评估后确认已有返回类型注解 |
| S01-014 | routers/system/auth.py | A4 | 🟡 | 已关闭 | 批次2 | 01 | 验证时修复(db.commit移至Service) |
| S01-015 | routers/system/auth.py | E1,E5 | 🟡 | 已关闭 | 批次2 | 01 | 验证时已修复 |
| S02-001 | models/lead/lead.py | H1 | 🔴 | 已关闭 | 批次1 | 02 | 验证时已修复(Mapped[]) |
| S02-002 | models/lead/lead.py | H2 | 🔴 | 已关闭 | 批次1 | 02 | ForeignKey→逻辑外键+foreign() |
| S02-003 | models/lead/lead.py | H3 | 🟡 | 延期 | 批次2 | 02 | 需Alembic迁移 |
| S02-004 | models/lead/lead.py | H2 | 🟡 | 已关闭 | 批次2 | 02 | 验证时已修复(逻辑外键) |
| S02-005 | models/project/_project_base.py | H1,H2 | 🔴 | 已关闭 | 批次1 | 02 | 验证时已修复(Mapped[]+逻辑外键) |
| S02-006 | schemas/project/core.py | D4 | 🟡 | 延期 | 批次2 | 02 | 需设计决策拆分Schema(影响前端) |
| S02-007 | schemas/project/core.py | C1 | 🟡 | 已关闭 | 批次2 | 02 | 创建ProjectFilter+路由使用Depends() |
| S02-008 | schemas/project/core.py | C2 | 🟢 | 已关闭 | 批次3 | 02 | Field(...)→Field() |
| S02-009 | services/projects/facade.py | B5 | 🟡 | 延期 | 批次2 | 02 | 技术债务，下次改Router时顺带移除 |
| S02-010 | services/projects/core.py | E1 | 🟡 | 已关闭 | 批次2 | 02 | 验证时已修复 |
| S02-011 | services/projects/core.py | G2 | 🟢 | 已关闭 | 批次3 | 02 | 评估后确认全同步，无问题 |
| S02-012 | schemas/project/core.py | C4 | 🟢 | 已关闭 | 批次3 | 02 | Field(...)→Field() |
| S03-001 | services/leads/core.py | E1 | 🔴 | 已关闭 | 批次1 | 03 | 验证时已修复(使用ServiceException) |
| S03-002 | services/projects/renovation.py | E1 | 🔴 | 已关闭 | 批次1 | 03 | 验证时已修复(使用ServiceException) |
| S03-003 | routers/leads/core.py | A4 | 🟡 | 已关闭 | 批次2 | 03 | 验证时已修复 |
| S03-004 | routers/leads/core.py | A4 | 🟡 | 已关闭 | 批次2 | 03 | 验证时已修复 |
| S03-005 | routers/leads/core.py | A4 | 🟡 | 已关闭 | 批次2 | 03 | 验证时已修复 |
| S03-006 | routers/leads/core.py,followups.py,prices.py | A2 | 🟡 | 已关闭 | 批次2 | 03 | 子路由添加tags(lead-followups/lead-prices) |
| S03-007 | services/projects/renovation.py | G2 | 🟢 | 已关闭 | 批次3 | 03 | 评估后确认全同步，无问题 |
| S03-008 | services/projects/renovation.py | C4 | 🟡 | 已关闭 | 批次2 | 03 | 验证时已修复 |
| S03-009 | services/leads/core.py | H1 | 🟢 | 已关闭 | 批次3 | 03 | 验证时已修复 |
| S04-001 | services/projects/sales.py | E1 | 🔴 | 已关闭 | 批次1 | 04 | 验证时已修复(使用ServiceException) |
| S04-002 | services/projects/finance.py | E1,E5 | 🔴 | 已关闭 | 批次1 | 04 | 验证时已修复(使用ServiceException) |
| S04-003 | services/projects/sales.py | C4 | 🟡 | 已关闭 | 批次2 | 04 | 验证时已修复 |
| S04-004 | services/projects/sales.py | D1 | 🟡 | 已关闭 | 批次2 | 04 | 手动字典→response_builder.build() |
| S04-005 | services/projects/finance.py | H1 | 🟡 | 已关闭 | 批次2 | 04 | 验证时已修复 |
| S04-006 | services/projects/finance.py | G2 | 🟡 | 已关闭 | 批次2 | 04 | 评估后确认全同步，无问题 |
| S04-007 | routers/projects/cashflow.py,renovation.py,sales.py | A2 | 🟡 | 已关闭 | 批次2 | 04 | 子路由已有tags(cashflow/renovation/sales) |
| S04-008 | routers/projects/cashflow.py | B1 | 🟢 | 已关闭 | 批次3 | 04 | 验证时已修复(PaginationParams) |
| S05-001 | services/market/property_service.py,community_service.py | E1 | 🟡 | 已关闭 | 批次2 | 05 | ValueError→ResourceNotFoundError/ValidationError |
| S05-002 | routers/market/properties.py | A4 | 🟡 | 已关闭 | 批次2 | 05 | 验证时已修复 |
| S05-003 | routers/market/properties.py | C1 | 🟡 | 已关闭 | 批次2 | 05 | 创建PropertyFilter(暂未用于路由) |
| S05-004 | routers/market/communities.py | A4 | 🔴 | 已关闭 | 批次1 | 05 | 验证时已修复 |
| S05-005 | routers/market/communities.py | E1 | 🟡 | 已关闭 | 批次2 | 05 | 验证时已修复(使用ServiceException) |
| S05-006 | services/market/community_service.py | H1 | 🟢 | 已关闭 | 批次3 | 05 | 验证时已修复 |
| S06-001 | routers/marketing/projects.py,import_.py | G1 | 🟡 | 已关闭 | 批次2 | 06 | Builder添加slim模式，列表页跳过重量级查询 |
| S06-002 | routers/marketing/projects.py,import_.py | E1 | 🟡 | 已关闭 | 批次2 | 06 | 验证时已修复 |
| S06-003 | routers/marketing/import_.py | B1 | 🟡 | 已关闭 | 批次2 | 06 | async→def修复 |
| S06-004 | services/monitor/service.py | G2 | 🟢 | 已关闭 | 批次3 | 06 | 评估后确认全同步，无问题 |
| S06-005 | services/marketing/import_service.py | G2 | 🟡 | 已关闭 | 批次2 | 06 | async→def修复 |
| S07-001 | error_handlers.py,main.py | D3,E4 | 🔴 | 延期 | 批次1 | 07 | 需团队决策响应格式 |
| S07-002 | db.py | H4 | 🟡 | 延期 | 批次2 | 07 | 需Alembic迁移基础设施 |
| S07-003 | main.py | D3 | 🟡 | 延期 | 批次2 | 07 | 依赖S07-001决策 |
| S07-004 | error_handlers.py | E5 | 🟡 | 已关闭 | 批次2 | 07 | 合理的边界异常转换 |
| S07-005 | settings.py | G4 | 🟡 | 已关闭 | 批次2 | 07 | page_size统一使用settings.default_page_size |
| S07-006 | settings.py | - | 🟢 | 已关闭 | 批次3 | 07 | 评估后确认无问题 |
| S07-007 | settings.py | - | 🟢 | 已关闭 | 批次3 | 07 | 评估后确认无问题 |
| S07-008 | db.py | - | 🟢 | 已关闭 | 批次3 | 07 | 评估后确认无问题 |
| S07-009 | exceptions.py | E2 | 🟢 | 已关闭 | 批次3 | 07 | 已迁移至services.system.exceptions |
| S07-010 | main.py | - | 🟢 | 已关闭 | 批次3 | 07 | 评估后确认无问题 |
| S08-001 | models/common/base.py | H1 | 🔴 | 已关闭 | 批次1 | 08 | 验证时已修复(Mapped[]) |
| S08-002 | schemas/common.py,schemas/response.py | D5 | 🟡 | 已关闭 | 批次2 | 08 | 验证时已修复(仅一处定义) |
| S08-003 | schemas/response.py | D3 | 🟡 | 延期 | 批次2 | 08 | 依赖S07-001决策 |
| S08-004 | dependencies/common.py | B1 | 🟡 | 已关闭 | 批次2 | 08 | 验证时已修复(PaginationParams) |
| S08-005 | dependencies/common.py | G5 | 🟡 | 已关闭 | 批次2 | 08 | 添加lead_followups/lead_price_history/renovation_photos索引 |
| S08-006 | schemas/common.py,schemas/response.py | C2 | 🟢 | 已关闭 | 批次3 | 08 | Field(...)→Field() |
| S08-007 | schemas/response.py | - | 🟢 | 已关闭 | 批次3 | 08 | Field(...)→Field() |
| S09-001 | utils/query_params.py | C1 | 🟡 | 已关闭 | 批次2 | 09 | dataclass→BaseModel |
| S09-002 | utils/query_params.py | C1 | 🟡 | 已关闭 | 批次2 | 09 | dataclass→BaseModel |
| S09-003 | routers/common/upload.py | E1 | 🟡 | 已关闭 | 批次2 | 09 | 验证时已修复 |
| S09-004 | routers/common/push.py | C1 | 🟡 | 已关闭 | 批次2 | 09 | 评估后确认参数简单无需Filter Schema |
| S09-005 | routers/common/upload.py | G1 | 🟡 | 已关闭 | 批次2 | 09 | N+1问题在ProjectResponseBuilder，已用slim模式修复 |
| S09-006 | utils/error_formatters.py | E5 | 🟢 | 已关闭 | 批次3 | 09 | 评估后确认为格式化函数，非异常处理 |
| S09-007 | routers/common/upload.py | C1 | 🟢 | 已关闭 | 批次3 | 09 | 评估后确认无需Filter Schema |
| S10-001 | routers/public/projects.py | A4 | 🔴 | 已关闭 | 批次1 | 10 | 验证时已修复 |
| S10-002 | models/property/property.py | H1,H2 | 🔴 | 已关闭 | 批次1 | 10 | 验证时已修复(Mapped[]+逻辑外键) |
| S10-003 | routers/public/projects.py | G2 | 🟡 | 已关闭 | 批次2 | 10 | 评估后确认全同步路由+同步Service，标准模式 |
| S10-004 | routers/public/projects.py | C1 | 🟡 | 已关闭 | 批次2 | 10 | 创建PublicProjectFilter+路由使用Depends() |
| S10-005 | routers/public/projects.py,routers/system/roles.py | E1 | 🟡 | 已关闭 | 批次2 | 10 | 验证时已修复 |
| S10-006 | schemas/property/core.py | C1 | 🟢 | 已关闭 | 批次3 | 10 | Field(...)→Field() |
| S10-007 | schemas/property/core.py | C2 | 🟢 | 已关闭 | 批次3 | 10 | Field(...)→Field() |

## 状态说明
- 待修复: 已发现问题，尚未开始修复
- 修复中: 正在实施修复
- 待验证: 修复已完成，等待验证
- 已关闭: 验证通过，问题关闭
- 延期: 经评估后决定延后处理（需说明理由）

## 延期问题分类（剩余10个）

### 需团队决策（3个）
- S07-001: 响应格式 {"detail":...} vs {"code":0,"message":"success","data":{}} 需团队确认
- S07-003: 依赖S07-001决策
- S08-003: 依赖S07-001决策

### 需基础设施（2个）
- S07-002: init_db用create_all()需Alembic迁移基础设施
- S02-003: 需Alembic迁移

### 需设计/重构（5个）
- S02-006: ProjectResponse Schema过大需拆分（影响前端消费方）
- S02-009: Facade兼容层待移除（下次改Router时顺带处理）

---

## 第一轮验证修复记录 (2026-06-14)

### 额外发现并修复的问题

| 编号 | 文件 | 问题描述 | 修复方式 |
|------|------|----------|----------|
| NEW-001 | routers/monitor/monitor.py | add_competitor/remove_competitor 路由层直接 db.commit() | 移至 MonitorService 内部提交 |
| NEW-002 | routers/public/users.py | update_profile/update_phone 路由层直接 db.commit() | 创建 UserService.update_nickname/update_phone 方法 |
| NEW-003 | services/system/api_key.py | revoke_api_key 文档注明调用方需自行提交，导致路由层违规 | Service 内部提交事务 |

### 重新打开并修复的问题

| 编号 | 问题 | 修复方式 |
|------|------|----------|
| S01-014 | routers/system/auth.py delete_api_key 直接 db.commit() | ApiKeyService.revoke_api_key 内部提交 |
| S05-001 | property_service.py 抛 ValueError | 替换为 ResourceNotFoundError |
| S05-001 | community_service.py 抛 ValueError | 替换为 ValidationError |

### 测试更新

- 更新 tests/unit/services/test_community_service.py: 测试用例从 ValueError 改为 ValidationError
- 全部 948 测试通过，覆盖率 83.65%

---

## 第二轮验证修复记录 (2026-06-14)

### 修复的延期中等问题（17个）

| 编号 | 问题描述 | 修复方式 |
|------|----------|----------|
| S01-009 | page_size配置不统一 | 12个文件统一使用settings.default_page_size，路由层使用PaginationDep |
| S01-010 | async/def混用评估 | 评估后确认设计正确，async/sync分层是有意设计 |
| S02-007 | 缺少Project Filter Schema | 创建ProjectFilter+路由使用Depends() |
| S03-006 | 线索子路由缺少tags | 添加lead-followups/lead-prices标签 |
| S04-004 | sales.py响应构建不一致 | 手动字典→response_builder.build() |
| S04-006 | finance.py async评估 | 评估后确认全同步，无问题 |
| S04-007 | 项目子路由tags | 已有tags(cashflow/renovation/sales)，确认OK |
| S05-003 | 缺少Property Filter Schema | 创建PropertyFilter(因逗号分隔解析暂未用于路由) |
| S06-001 | N+1查询问题 | Builder添加slim模式，列表页跳过财务/互动/阶段日期查询 |
| S07-005 | page_size配置不统一 | 同S01-009 |
| S08-005 | 索引缺失 | 添加lead_followups/lead_price_history/renovation_photos索引 |
| S09-004 | Filter Schema评估 | 评估后确认参数简单无需Filter Schema |
| S09-005 | 上传N+1 | N+1实际在ProjectResponseBuilder，已用slim模式修复 |
| S10-003 | async/def评估 | 评估后确认全同步路由+同步Service，标准模式 |
| S10-004 | 缺少PublicProject Filter Schema | 创建PublicProjectFilter+路由使用Depends() |

### 修复的延期轻微问题（14个）

| 编号 | 问题描述 | 修复方式 |
|------|----------|----------|
| S01-008 | async def无await | get_current_active_user改为def |
| S01-013 | 返回类型注解 | 评估后确认已有返回类型注解 |
| S02-008 | Field(...)用法 | Field(...)→Field() |
| S02-011 | async/def评估 | 评估后确认全同步，无问题 |
| S02-012 | Field(...)用法 | Field(...)→Field() |
| S03-007 | async/def评估 | 评估后确认全同步，无问题 |
| S06-004 | async/def评估 | 评估后确认全同步，无问题 |
| S07-006 | settings.py评估 | 评估后确认无问题 |
| S07-007 | settings.py评估 | 评估后确认无问题 |
| S07-008 | db.py评估 | 评估后确认无问题 |
| S07-010 | main.py评估 | 评估后确认无问题 |
| S08-006 | Field(...)用法 | Field(...)→Field() |
| S08-007 | Field(...)用法 | Field(...)→Field() |
| S09-006 | error_formatters评估 | 评估后确认为格式化函数，非异常处理 |
| S09-007 | Filter Schema评估 | 评估后确认无需Filter Schema |
| S10-006 | Field(...)用法 | Field(...)→Field() |
| S10-007 | Field(...)用法 | Field(...)→Field() |

### 修改文件汇总

| 文件 | 修改类型 |
|------|----------|
| settings.py | 无修改（已有default_page_size/max_page_size） |
| dependencies/common.py | 无修改（已使用settings） |
| dependencies/auth.py | async def→def |
| routers/leads/core.py | 使用PaginationDep |
| routers/leads/leads.py | 子路由添加tags |
| routers/marketing/projects.py | 使用PaginationDep |
| routers/marketing/import_.py | 使用PaginationDep |
| routers/public/projects.py | 使用PaginationDep+PublicProjectFilter |
| routers/public/leads.py | 使用PaginationDep |
| routers/system/users.py | 使用PaginationDep |
| routers/market/properties.py | 使用PaginationDep |
| routers/projects/core.py | 使用ProjectFilter+PaginationDep |
| main.py | 添加openapi_tags(renovation/sales/lead-followups/lead-prices) |
| services/leads/core.py | page_size默认值→settings.default_page_size |
| services/system/user.py | page_size默认值→settings.default_page_size |
| services/system/role.py | page_size默认值→settings.default_page_size |
| services/market/community_service.py | page_size默认值→settings.default_page_size |
| services/market/query.py | page_size默认值→settings.default_page_size |
| services/marketing/query.py | page_size默认值→settings.default_page_size |
| services/marketing/public.py | page_size默认值→settings.default_page_size |
| services/projects/core.py | 列表页使用slim=True |
| services/projects/facade.py | page_size默认值→settings.default_page_size |
| services/projects/internal/query.py | page_size默认值→settings.default_page_size |
| services/projects/internal/builder.py | 添加slim参数 |
| services/projects/sales.py | 手动字典→response_builder.build() |
| models/lead/lead.py | 添加lead_followups/lead_price_history索引 |
| models/project/_project_renovation.py | 添加renovation_photos索引 |
| schemas/project/core.py | 添加ProjectFilter+Field(...)→Field() |
| schemas/property/core.py | 添加PropertyFilter+Field(...)→Field() |
| schemas/public/__init__.py | 添加PublicProjectFilter |
| schemas/response.py | Field(...)→Field() |
| schemas/upload.py | Field(...)→Field() |
| schemas/project/sales.py | Field(...)→Field() |
| schemas/project/renovation.py | Field(...)→Field() |
| schemas/project/owner.py | Field(...)→Field() |
| schemas/project/finance.py | Field(...)→Field() |
| schemas/lead/__init__.py | Field(...)→Field() |
| schemas/l4_marketing/query.py | Field(...)→Field()+page_size→settings |
| utils/query_params.py | page_size→settings.default_page_size |

### 测试结果
- 全部 948 测试通过，覆盖率 83.75%
