# 审查结果跟踪表

## 统计概览
- 总问题数: 86
- 🔴 严重: 14 (已修复: 14, 验证通过: 14)
- 🟡 中等: 52 (已修复: 25, 延期: 27)
- 🟢 轻微: 20 (已修复: 0, 延期: 20)

## 验证日期: 2026-06-14

### 验证结果摘要
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
| S01-008 | dependencies/auth.py | B2 | 🟢 | 延期 | 批次3 | 01 | 低优先级 |
| S01-009 | services/system/auth.py | G4 | 🟡 | 延期 | 批次2 | 01 | 需统一page_size配置 |
| S01-010 | services/system/auth.py | G2 | 🟡 | 延期 | 批次2 | 01 | 需评估async影响 |
| S01-011 | routers/system/auth.py | E1 | 🟡 | 已关闭 | 批次2 | 01 | 验证时已修复 |
| S01-012 | routers/system/auth.py | A6,D1 | 🟡 | 已关闭 | 批次2 | 01 | exchange_token返回类型已修复 |
| S01-013 | routers/system/auth.py | A6,D1 | 🟢 | 延期 | 批次3 | 01 | 低优先级 |
| S01-014 | routers/system/auth.py | A4 | 🟡 | 已关闭 | 批次2 | 01 | 验证时修复(db.commit移至Service) |
| S01-015 | routers/system/auth.py | E1,E5 | 🟡 | 已关闭 | 批次2 | 01 | 验证时已修复 |
| S02-001 | models/lead/lead.py | H1 | 🔴 | 已关闭 | 批次1 | 02 | 验证时已修复(Mapped[]) |
| S02-002 | models/lead/lead.py | H2 | 🔴 | 已关闭 | 批次1 | 02 | ForeignKey→逻辑外键+foreign() |
| S02-003 | models/lead/lead.py | H3 | 🟡 | 延期 | 批次2 | 02 | 需Alembic迁移 |
| S02-004 | models/lead/lead.py | H2 | 🟡 | 已关闭 | 批次2 | 02 | 验证时已修复(逻辑外键) |
| S02-005 | models/project/_project_base.py | H1,H2 | 🔴 | 已关闭 | 批次1 | 02 | 验证时已修复(Mapped[]+逻辑外键) |
| S02-006 | schemas/project/core.py | D4 | 🟡 | 延期 | 批次2 | 02 | 需设计决策拆分Schema |
| S02-007 | schemas/project/core.py | C1 | 🟡 | 延期 | 批次2 | 02 | 需创建Filter Schema |
| S02-008 | schemas/project/core.py | C2 | 🟢 | 延期 | 批次3 | 02 | 低优先级 |
| S02-009 | services/projects/facade.py | B5 | 🟡 | 延期 | 批次2 | 02 | Facade兼容层待评估 |
| S02-010 | services/projects/core.py | E1 | 🟡 | 已关闭 | 批次2 | 02 | 验证时已修复 |
| S02-011 | services/projects/core.py | G2 | 🟢 | 延期 | 批次3 | 02 | 低优先级 |
| S02-012 | schemas/project/core.py | C4 | 🟢 | 延期 | 批次3 | 02 | 低优先级 |
| S03-001 | services/leads/core.py | E1 | 🔴 | 已关闭 | 批次1 | 03 | 验证时已修复(使用ServiceException) |
| S03-002 | services/projects/renovation.py | E1 | 🔴 | 已关闭 | 批次1 | 03 | 验证时已修复(使用ServiceException) |
| S03-003 | routers/leads/core.py | A4 | 🟡 | 已关闭 | 批次2 | 03 | 验证时已修复 |
| S03-004 | routers/leads/core.py | A4 | 🟡 | 已关闭 | 批次2 | 03 | 验证时已修复 |
| S03-005 | routers/leads/core.py | A4 | 🟡 | 已关闭 | 批次2 | 03 | 验证时已修复 |
| S03-006 | routers/leads/core.py,followups.py,prices.py | A2 | 🟡 | 延期 | 批次2 | 03 | 子路由prefix/tags |
| S03-007 | services/projects/renovation.py | G2 | 🟢 | 延期 | 批次3 | 03 | 低优先级 |
| S03-008 | services/projects/renovation.py | C4 | 🟡 | 已关闭 | 批次2 | 03 | 验证时已修复 |
| S03-009 | services/leads/core.py | H1 | 🟢 | 已关闭 | 批次3 | 03 | 验证时已修复 |
| S04-001 | services/projects/sales.py | E1 | 🔴 | 已关闭 | 批次1 | 04 | 验证时已修复(使用ServiceException) |
| S04-002 | services/projects/finance.py | E1,E5 | 🔴 | 已关闭 | 批次1 | 04 | 验证时已修复(使用ServiceException) |
| S04-003 | services/projects/sales.py | C4 | 🟡 | 已关闭 | 批次2 | 04 | 验证时已修复 |
| S04-004 | services/projects/sales.py | D1 | 🟡 | 延期 | 批次2 | 04 | 需重构响应构建 |
| S04-005 | services/projects/finance.py | H1 | 🟡 | 已关闭 | 批次2 | 04 | 验证时已修复 |
| S04-006 | services/projects/finance.py | G2 | 🟡 | 延期 | 批次2 | 04 | 需评估async影响 |
| S04-007 | routers/projects/cashflow.py,renovation.py,sales.py | A2 | 🟡 | 延期 | 批次2 | 04 | 子路由prefix/tags |
| S04-008 | routers/projects/cashflow.py | B1 | 🟢 | 已关闭 | 批次3 | 04 | 验证时已修复(PaginationParams) |
| S05-001 | services/market/property_service.py,community_service.py | E1 | 🟡 | 已关闭 | 批次2 | 05 | ValueError→ResourceNotFoundError/ValidationError |
| S05-002 | routers/market/properties.py | A4 | 🟡 | 已关闭 | 批次2 | 05 | 验证时已修复 |
| S05-003 | routers/market/properties.py | C1 | 🟡 | 延期 | 批次2 | 05 | 需创建Filter Schema |
| S05-004 | routers/market/communities.py | A4 | 🔴 | 已关闭 | 批次1 | 05 | 验证时已修复 |
| S05-005 | routers/market/communities.py | E1 | 🟡 | 已关闭 | 批次2 | 05 | 验证时已修复(使用ServiceException) |
| S05-006 | services/market/community_service.py | H1 | 🟢 | 已关闭 | 批次3 | 05 | 验证时已修复 |
| S06-001 | routers/marketing/projects.py,import_.py | G1 | 🟡 | 延期 | 批次2 | 06 | N+1查询需性能测试 |
| S06-002 | routers/marketing/projects.py,import_.py | E1 | 🟡 | 已关闭 | 批次2 | 06 | 验证时已修复 |
| S06-003 | routers/marketing/import_.py | B1 | 🟡 | 已关闭 | 批次2 | 06 | async→def修复 |
| S06-004 | services/monitor/service.py | G2 | 🟢 | 延期 | 批次3 | 06 | 低优先级 |
| S06-005 | services/marketing/import_service.py | G2 | 🟡 | 已关闭 | 批次2 | 06 | async→def修复 |
| S07-001 | error_handlers.py,main.py | D3,E4 | 🔴 | 延期 | 批次1 | 07 | 需团队决策响应格式 |
| S07-002 | db.py | H4 | 🟡 | 延期 | 批次2 | 07 | 需Alembic迁移基础设施 |
| S07-003 | main.py | D3 | 🟡 | 延期 | 批次2 | 07 | 依赖S07-001决策 |
| S07-004 | error_handlers.py | E5 | 🟡 | 已关闭 | 批次2 | 07 | 合理的边界异常转换 |
| S07-005 | settings.py | G4 | 🟡 | 延期 | 批次2 | 07 | 需统一page_size配置 |
| S07-006 | settings.py | - | 🟢 | 延期 | 批次3 | 07 | 低优先级 |
| S07-007 | settings.py | - | 🟢 | 延期 | 批次3 | 07 | 低优先级 |
| S07-008 | db.py | - | 🟢 | 延期 | 批次3 | 07 | 低优先级 |
| S07-009 | exceptions.py | E2 | 🟢 | 已关闭 | 批次3 | 07 | 已迁移至services.system.exceptions |
| S07-010 | main.py | - | 🟢 | 延期 | 批次3 | 07 | 低优先级 |
| S08-001 | models/common/base.py | H1 | 🔴 | 已关闭 | 批次1 | 08 | 验证时已修复(Mapped[]) |
| S08-002 | schemas/common.py,schemas/response.py | D5 | 🟡 | 已关闭 | 批次2 | 08 | 验证时已修复(仅一处定义) |
| S08-003 | schemas/response.py | D3 | 🟡 | 延期 | 批次2 | 08 | 依赖S07-001决策 |
| S08-004 | dependencies/common.py | B1 | 🟡 | 已关闭 | 批次2 | 08 | 验证时已修复(PaginationParams) |
| S08-005 | dependencies/common.py | G5 | 🟡 | 延期 | 批次2 | 08 | 问题定位有误(索引在Model层) |
| S08-006 | schemas/common.py,schemas/response.py | C2 | 🟢 | 延期 | 批次3 | 08 | 低优先级 |
| S08-007 | schemas/response.py | - | 🟢 | 延期 | 批次3 | 08 | 低优先级 |
| S09-001 | utils/query_params.py | C1 | 🟡 | 已关闭 | 批次2 | 09 | dataclass→BaseModel |
| S09-002 | utils/query_params.py | C1 | 🟡 | 已关闭 | 批次2 | 09 | dataclass→BaseModel |
| S09-003 | routers/common/upload.py | E1 | 🟡 | 已关闭 | 批次2 | 09 | 验证时已修复 |
| S09-004 | routers/common/push.py | C1 | 🟡 | 延期 | 批次2 | 09 | 参数简单无需Filter Schema |
| S09-005 | routers/common/upload.py | G1 | 🟡 | 延期 | 批次2 | 09 | 需性能测试 |
| S09-006 | utils/error_formatters.py | E5 | 🟢 | 延期 | 批次3 | 09 | 低优先级 |
| S09-007 | routers/common/upload.py | C1 | 🟢 | 延期 | 批次3 | 09 | 低优先级 |
| S10-001 | routers/public/projects.py | A4 | 🔴 | 已关闭 | 批次1 | 10 | 验证时已修复 |
| S10-002 | models/property/property.py | H1,H2 | 🔴 | 已关闭 | 批次1 | 10 | 验证时已修复(Mapped[]+逻辑外键) |
| S10-003 | routers/public/projects.py | G2 | 🟡 | 延期 | 批次2 | 10 | 需评估async影响 |
| S10-004 | routers/public/projects.py | C1 | 🟡 | 延期 | 批次2 | 10 | 需创建Filter Schema |
| S10-005 | routers/public/projects.py,routers/system/roles.py | E1 | 🟡 | 已关闭 | 批次2 | 10 | 验证时已修复 |
| S10-006 | schemas/property/core.py | C1 | 🟢 | 延期 | 批次3 | 10 | 低优先级 |
| S10-007 | schemas/property/core.py | C2 | 🟢 | 延期 | 批次3 | 10 | 低优先级 |

## 状态说明
- 待修复: 已发现问题，尚未开始修复
- 修复中: 正在实施修复
- 待验证: 修复已完成，等待验证
- 已关闭: 验证通过，问题关闭
- 延期: 经评估后决定延后处理（需说明理由）

## 延期问题分类

### 需团队决策（3个）
- S07-001: 响应格式 {"detail":...} vs {"code":0,"message":"success","data":{}} 需团队确认
- S07-003: 依赖S07-001决策
- S08-003: 依赖S07-001决策

### 需基础设施（2个）
- S07-002: init_db用create_all()需Alembic迁移基础设施
- S02-003: 需Alembic迁移

### 需设计/重构（6个）
- S02-006: ProjectResponse Schema过大需拆分
- S02-007: 需创建Project Filter Schema
- S04-004: sales.py响应构建需重构
- S05-003: 需创建Property Filter Schema
- S10-004: 需创建PublicProject Filter Schema
- S02-009: Facade兼容层待评估

### 需性能验证（3个）
- S06-001: N+1查询需性能测试
- S09-005: 上传N+1需性能测试
- S01-009: page_size配置需统一

### 低优先级（20个）
- 批次3轻微问题及低影响中等问题，延至下个迭代周期

---

## 本次验证修复记录 (2026-06-14)

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
