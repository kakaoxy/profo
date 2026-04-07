# ProFo 后端 API 接口分类分析报告

## 一、概述

本文档对 ProFo 房地产翻新与销售管理系统后端 API 进行全面审查和分类，明确区分面向终端用户（to C）的 API 和仅用于内部管理系统的 API。

### 1.1 项目架构
- **后端框架**: FastAPI (Python)
- **API 前缀**: `/api/v1`
- **认证方式**: JWT Bearer Token (OAuth2)
- **用户角色**: admin(管理员) / operator(运营人员) / user(普通用户)

### 1.2 角色权限说明
| 角色 | 代码 | 权限范围 |
|------|------|----------|
| 管理员 | admin | 所有权限，包括用户管理、权限配置 |
| 运营人员 | operator | 数据修改权限，包括项目、房源的增删改查 |
| 普通用户 | user | 仅数据查看权限 |

---

## 二、API 接口分类清单

### 2.1 公共接口（无需认证）

| 序号 | 接口路径 | 方法 | 功能描述 | 分类 | 判断依据 |
|------|----------|------|----------|------|----------|
| 1 | `/` | GET | 根路径 - 健康检查 | 公共 | 系统健康检查，无需认证 |
| 2 | `/health` | GET | 健康检查端点 | 公共 | 系统健康检查，无需认证 |
| 3 | `/api/v1/auth/token` | POST | OAuth2 兼容的 token 获取 | 公共 | 登录获取令牌，无需认证 |
| 4 | `/api/v1/auth/login` | POST | 用户名密码登录 | 公共 | 登录接口，无需认证 |
| 5 | `/api/v1/auth/wechat/authorize` | GET | 生成微信登录授权URL | 公共 | 微信授权入口，无需认证 |
| 6 | `/api/v1/auth/wechat/callback` | GET | 微信授权回调 | 公共 | 微信回调接口，无需认证 |
| 7 | `/api/v1/auth/wechat/login` | POST | 微信小程序登录 | 公共 | 小程序登录，无需认证 |

### 2.2 认证相关接口（to C + 内部管理共用）

| 序号 | 接口路径 | 方法 | 功能描述 | 分类 | 权限要求 |
|------|----------|------|----------|------|----------|
| 8 | `/api/v1/auth/refresh` | POST | 刷新令牌 | 共用 | 需有效refresh_token |
| 9 | `/api/v1/auth/me` | GET | 获取当前用户信息 | 共用 | 需登录（任意角色） |

### 2.3 用户管理接口（仅内部管理）

| 序号 | 接口路径 | 方法 | 功能描述 | 分类 | 权限要求 |
|------|----------|------|----------|------|----------|
| 10 | `/api/v1/users/users` | GET | 获取用户列表（支持搜索筛选） | 内部管理 | admin |
| 11 | `/api/v1/users/simple` | GET | 获取简化用户列表（下拉选择） | 内部管理 | 任意登录用户 |
| 12 | `/api/v1/users/me` | GET | 获取当前登录用户信息 | 共用 | 任意登录用户 |
| 13 | `/api/v1/users/users/{user_id}` | GET | 获取指定用户信息 | 内部管理 | admin |
| 14 | `/api/v1/users/users` | POST | 创建新用户 | 内部管理 | admin |
| 15 | `/api/v1/users/users/{user_id}` | PUT | 更新用户信息 | 内部管理 | admin |
| 16 | `/api/v1/users/users/{user_id}/reset-password` | PUT | 重置用户密码 | 内部管理 | admin |
| 17 | `/api/v1/users/users/{user_id}` | DELETE | 删除用户 | 内部管理 | admin |
| 18 | `/api/v1/users/users/change-password` | POST | 修改当前用户密码 | 共用 | 任意登录用户 |
| 19 | `/api/v1/users/init-data` | POST | 初始化系统数据（角色和默认管理员） | 内部管理 | 无需认证（首次初始化） |

### 2.4 角色管理接口（仅内部管理）

| 序号 | 接口路径 | 方法 | 功能描述 | 分类 | 权限要求 |
|------|----------|------|----------|------|----------|
| 20 | `/api/v1/roles` | GET | 获取角色列表（支持搜索筛选） | 内部管理 | admin |
| 21 | `/api/v1/roles/{role_id}` | GET | 获取指定角色信息 | 内部管理 | admin |
| 22 | `/api/v1/roles` | POST | 创建新角色 | 内部管理 | admin |
| 23 | `/api/v1/roles/{role_id}` | PUT | 更新角色信息 | 内部管理 | admin |
| 24 | `/api/v1/roles/{role_id}` | DELETE | 删除角色 | 内部管理 | admin |

### 2.5 房源查询接口（to C + 内部管理共用）

| 序号 | 接口路径 | 方法 | 功能描述 | 分类 | 权限要求 |
|------|----------|------|----------|------|----------|
| 25 | `/api/v1/properties/communities/search` | GET | 按名称搜索小区 | to C/内部 | 无需认证 |
| 26 | `/api/v1/properties` | GET | 查询房源列表（多维度筛选分页） | to C/内部 | 任意登录用户 |
| 27 | `/api/v1/properties/export` | GET | 导出房源数据为CSV | 内部管理 | admin/operator |
| 28 | `/api/v1/properties/{id}` | GET | 获取房源详情 | to C/内部 | 任意登录用户 |

### 2.6 小区管理接口（仅内部管理）

| 序号 | 接口路径 | 方法 | 功能描述 | 分类 | 权限要求 |
|------|----------|------|----------|------|----------|
| 29 | `/api/v1/admin/communities` | GET | 查询小区列表 | 内部管理 | admin/operator |
| 30 | `/api/v1/admin/dictionaries` | GET | 获取行政区/商圈字典 | 内部管理 | admin/operator |
| 31 | `/api/v1/admin/communities/merge` | POST | 合并小区操作 | 内部管理 | admin |

### 2.7 数据导入接口（仅内部管理）

| 序号 | 接口路径 | 方法 | 功能描述 | 分类 | 权限要求 |
|------|----------|------|----------|------|----------|
| 32 | `/api/v1/push` | POST | JSON数据推送接口（批量导入房源） | 内部管理 | 无需认证（系统间对接） |
| 33 | `/api/v1/upload/csv` | POST | 上传并处理CSV文件 | 内部管理 | admin/operator |
| 34 | `/api/v1/upload/download/{filename}` | GET | 下载失败记录文件 | 内部管理 | 任意登录用户 |
| 35 | `/api/v1/files/upload` | POST | 上传文件（通用） | 内部管理 | admin/operator |

### 2.8 项目管理接口（仅内部管理）

| 序号 | 接口路径 | 方法 | 功能描述 | 分类 | 权限要求 |
|------|----------|------|----------|------|----------|
| 36 | `/api/v1/projects` | POST | 创建项目 | 内部管理 | 依赖注入，需认证 |
| 37 | `/api/v1/projects` | GET | 获取项目列表 | 内部管理 | 依赖注入，需认证 |
| 38 | `/api/v1/projects/stats` | GET | 获取项目统计 | 内部管理 | 依赖注入，需认证 |
| 39 | `/api/v1/projects/{project_id}` | GET | 获取项目详情 | 内部管理 | 依赖注入，需认证 |
| 40 | `/api/v1/projects/{project_id}` | PUT | 更新项目信息 | 内部管理 | 依赖注入，需认证 |
| 41 | `/api/v1/projects/{project_id}` | DELETE | 删除项目 | 内部管理 | 依赖注入，需认证 |
| 42 | `/api/v1/projects/{project_id}/status` | PUT | 更新项目状态 | 内部管理 | 依赖注入，需认证 |
| 43 | `/api/v1/projects/{project_id}/complete` | POST | 完成项目 | 内部管理 | 依赖注入，需认证 |
| 44 | `/api/v1/projects/{project_id}/report` | GET | 获取项目报告 | 内部管理 | 依赖注入，需认证 |
| 45 | `/api/v1/projects/export` | GET | 导出项目数据 | 内部管理 | 依赖注入，需认证 |

### 2.9 项目改造管理接口（仅内部管理）

| 序号 | 接口路径 | 方法 | 功能描述 | 分类 | 权限要求 |
|------|----------|------|----------|------|----------|
| 46 | `/api/v1/projects/{project_id}/renovation` | PUT | 更新改造阶段 | 内部管理 | 依赖注入，需认证 |
| 47 | `/api/v1/projects/{project_id}/renovation/photos` | POST | 上传改造阶段照片 | 内部管理 | 依赖注入，需认证 |
| 48 | `/api/v1/projects/{project_id}/renovation/photos` | GET | 获取改造阶段照片 | 内部管理 | 依赖注入，需认证 |
| 49 | `/api/v1/projects/{project_id}/renovation/photos/{photo_id}` | DELETE | 删除改造阶段照片 | 内部管理 | 依赖注入，需认证 |
| 50 | `/api/v1/projects/{project_id}/renovation/contract` | GET | 获取装修合同信息 | 内部管理 | 依赖注入，需认证 |
| 51 | `/api/v1/projects/{project_id}/renovation/contract` | PUT | 更新装修合同信息 | 内部管理 | 依赖注入，需认证 |

### 2.10 项目销售管理接口（仅内部管理）

| 序号 | 接口路径 | 方法 | 功能描述 | 分类 | 权限要求 |
|------|----------|------|----------|------|----------|
| 52 | `/api/v1/projects/{project_id}/selling/roles` | PUT | 更新销售角色 | 内部管理 | 依赖注入，需认证 |
| 53 | `/api/v1/projects/{project_id}/selling/viewings` | POST | 创建带看记录 | 内部管理 | 依赖注入，需认证 |
| 54 | `/api/v1/projects/{project_id}/selling/offers` | POST | 创建出价记录 | 内部管理 | 依赖注入，需认证 |
| 55 | `/api/v1/projects/{project_id}/selling/negotiations` | POST | 创建面谈记录 | 内部管理 | 依赖注入，需认证 |
| 56 | `/api/v1/projects/{project_id}/selling/records` | GET | 获取销售记录 | 内部管理 | 依赖注入，需认证 |
| 57 | `/api/v1/projects/{project_id}/selling/records/{record_id}` | DELETE | 删除销售记录 | 内部管理 | 依赖注入，需认证 |

### 2.11 现金流管理接口（仅内部管理）

| 序号 | 接口路径 | 方法 | 功能描述 | 分类 | 权限要求 |
|------|----------|------|----------|------|----------|
| 58 | `/api/v1/projects/{project_id}/cashflow` | POST | 创建现金流记录 | 内部管理 | 依赖注入，需认证 |
| 59 | `/api/v1/projects/{project_id}/cashflow` | GET | 获取项目现金流明细和汇总 | 内部管理 | 依赖注入，需认证 |
| 60 | `/api/v1/projects/{project_id}/cashflow/{record_id}` | DELETE | 删除现金流记录 | 内部管理 | 依赖注入，需认证 |

### 2.12 市场监控接口（to C + 内部管理共用）

| 序号 | 接口路径 | 方法 | 功能描述 | 分类 | 权限要求 |
|------|----------|------|----------|------|----------|
| 61 | `/api/v1/monitor/communities/{community_id}/sentiment` | GET | 获取市场情绪数据 | to C/内部 | 任意登录用户 |
| 62 | `/api/v1/monitor/communities/{community_id}/trends` | GET | 获取市场趋势数据 | to C/内部 | 任意登录用户 |
| 63 | `/api/v1/monitor/ai-strategy` | POST | 生成AI策略建议 | 内部管理 | admin/operator |
| 64 | `/api/v1/monitor/communities/{community_id}/radar` | GET | 获取周边竞品雷达数据 | to C/内部 | 任意登录用户 |
| 65 | `/api/v1/communities/{community_id}/competitors` | GET | 获取竞品列表 | to C/内部 | 任意登录用户 |
| 66 | `/api/v1/communities/{community_id}/competitors` | POST | 添加竞品 | 内部管理 | admin/operator |
| 67 | `/api/v1/communities/{community_id}/competitors/{competitor_id}` | DELETE | 删除竞品 | 内部管理 | admin/operator |

### 2.13 线索管理接口（Leads - 仅内部管理）

| 序号 | 接口路径 | 方法 | 功能描述 | 分类 | 权限要求 |
|------|----------|------|----------|------|----------|
| 68 | `/api/v1/leads/` | GET | 获取线索列表 | 内部管理 | 任意登录用户 |
| 69 | `/api/v1/leads/` | POST | 创建线索 | 内部管理 | 任意登录用户 |
| 70 | `/api/v1/leads/{lead_id}` | GET | 获取线索详情 | 内部管理 | 任意登录用户 |
| 71 | `/api/v1/leads/{lead_id}` | PUT | 更新线索 | 内部管理 | 任意登录用户 |
| 72 | `/api/v1/leads/{lead_id}` | DELETE | 删除线索 | 内部管理 | 任意登录用户 |
| 73 | `/api/v1/leads/{lead_id}/follow-ups` | POST | 添加跟进记录 | 内部管理 | 任意登录用户 |
| 74 | `/api/v1/leads/{lead_id}/follow-ups` | GET | 获取跟进记录列表 | 内部管理 | 任意登录用户 |
| 75 | `/api/v1/leads/{lead_id}/prices` | GET | 获取价格历史 | 内部管理 | 任意登录用户 |
| 76 | `/api/v1/leads/{lead_id}/prices` | POST | 添加价格记录 | 内部管理 | 任意登录用户 |

### 2.14 L4 市场营销接口（仅内部管理）

| 序号 | 接口路径 | 方法 | 功能描述 | 分类 | 权限要求 |
|------|----------|------|----------|------|----------|
| 77 | `/api/v1/admin/l4-marketing/projects` | GET | 获取营销项目列表 | 内部管理 | admin/operator |
| 78 | `/api/v1/admin/l4-marketing/projects` | POST | 创建独立营销项目 | 内部管理 | admin/operator |
| 79 | `/api/v1/admin/l4-marketing/projects/{project_id}` | GET | 获取营销项目详情 | 内部管理 | admin/operator |
| 80 | `/api/v1/admin/l4-marketing/projects/{project_id}` | PUT | 更新营销项目 | 内部管理 | admin/operator |
| 81 | `/api/v1/admin/l4-marketing/projects/{project_id}` | DELETE | 删除营销项目 | 内部管理 | admin/operator |
| 82 | `/api/v1/admin/l4-marketing/projects/{project_id}/media` | GET | 获取媒体列表 | 内部管理 | admin/operator |
| 83 | `/api/v1/admin/l4-marketing/projects/{project_id}/media` | POST | 添加媒体 | 内部管理 | admin/operator |
| 84 | `/api/v1/admin/l4-marketing/media/{media_id}` | PUT | 更新媒体 | 内部管理 | admin/operator |
| 85 | `/api/v1/admin/l4-marketing/media/{media_id}` | DELETE | 删除媒体 | 内部管理 | admin/operator |

---

## 三、接口分类统计

### 3.1 按分类统计

| 分类 | 接口数量 | 占比 |
|------|----------|------|
| 公共接口（无需认证） | 7 | 8.2% |
| to C + 内部管理共用 | 14 | 16.5% |
| 仅内部管理 | 64 | 75.3% |
| **总计** | **85** | **100%** |

### 3.2 按模块统计

| 模块 | 接口数量 | 主要分类 |
|------|----------|----------|
| 认证 (auth) | 9 | 公共/共用 |
| 用户管理 (users) | 10 | 内部管理/共用 |
| 角色管理 (roles) | 5 | 内部管理 |
| 房源查询 (properties) | 4 | to C/内部 |
| 小区管理 (admin) | 3 | 内部管理 |
| 数据导入 (push/upload/files) | 4 | 内部管理 |
| 项目管理 (projects) | 22 | 内部管理 |
| 现金流 (cashflow) | 3 | 内部管理 |
| 市场监控 (monitor) | 7 | to C/内部 |
| 线索管理 (leads) | 9 | 内部管理 |
| L4市场营销 (l4-marketing) | 9 | 内部管理 |

---

## 四、判断依据说明

### 4.1 to C 接口判定标准

接口被归类为 to C（面向终端用户）需满足以下条件之一：

1. **公开访问**: 无需认证即可访问的公开数据接口
2. **用户自助**: 用户可自行管理个人相关数据（如修改密码、查看个人信息）
3. **数据查询**: 面向客户的房源查询、市场数据查看等只读接口
4. **低权限要求**: 仅需普通用户权限（user角色）即可访问

**当前 to C 接口示例**:
- `/api/v1/properties` - 房源列表查询
- `/api/v1/properties/{id}` - 房源详情
- `/api/v1/properties/communities/search` - 小区搜索
- `/api/v1/monitor/communities/{id}/sentiment` - 市场情绪
- `/api/v1/monitor/communities/{id}/trends` - 市场趋势
- `/api/v1/monitor/communities/{id}/radar` - 竞品雷达
- `/api/v1/communities/{id}/competitors` - 竞品列表

### 4.2 内部管理接口判定标准

接口被归类为内部管理需满足以下条件之一：

1. **高权限要求**: 需要 admin 或 operator 角色
2. **数据管理**: 涉及数据的增删改操作（CURD）
3. **系统配置**: 用户管理、角色管理、权限配置
4. **业务操作**: 项目管理、线索管理、销售记录等业务流程
5. **数据导入**: CSV/JSON 批量导入、文件上传
6. **路径标识**: 路径中包含 `/admin/` 前缀

**内部管理接口特征**:
- 使用 `get_current_admin_user` 或 `get_current_operator_user` 依赖
- 涉及敏感业务数据修改
- 系统管理和配置功能

### 4.3 特殊说明

#### 4.3.1 数据推送接口 (`/api/v1/push`)
- **分类**: 内部管理
- **说明**: 虽然无需认证，但这是系统间数据对接接口，用于外部系统批量推送房源数据，不属于 to C 场景

#### 4.3.2 项目相关接口
- **分类**: 内部管理
- **说明**: 当前项目接口未显式添加权限依赖，但根据业务性质（房产翻新项目管理），这些接口属于内部业务系统使用，未来应添加适当的权限校验

#### 4.3.3 线索管理接口 (`/api/v1/leads`)
- **分类**: 内部管理
- **说明**: 线索管理是销售内部业务流程，虽然使用 `get_current_user` 允许任何登录用户访问，但属于内部业务系统功能

---

## 五、安全建议

### 5.1 权限加固建议

| 优先级 | 接口 | 建议 |
|--------|------|------|
| 高 | `/api/v1/projects/*` | 添加 `get_current_operator_user` 权限依赖 |
| 中 | `/api/v1/leads/*` | 考虑添加 operator 权限限制 |
| 低 | `/api/v1/push` | 考虑添加 API Key 或 IP 白名单验证 |

### 5.2 to C 接口扩展建议

当前系统 to C 接口较少，如需扩展面向终端用户的功能，建议新增：

1. **客户预约看房接口**
2. **客户收藏房源接口**
3. **客户评价反馈接口**
4. **公开项目展示接口**（脱敏后的项目信息）

---

## 六、结论

### 6.1 分类汇总

| 分类 | 数量 | 说明 |
|------|------|------|
| **纯 to C 接口** | ~10 | 主要为房源查询和市场数据查看 |
| **内部管理接口** | ~64 | 涵盖用户、角色、项目、线索等管理功能 |
| **共用接口** | ~11 | 认证、个人信息、部分查询功能 |

### 6.2 核心发现

1. **系统定位**: 当前 ProFo 系统主要定位为**内部业务管理系统**，大部分接口面向内部运营人员
2. **to C 能力有限**: 当前对外暴露的 to C 接口较少，主要为房源查询类只读接口
3. **权限模型清晰**: 使用 admin/operator/user 三级角色模型，权限控制较为规范
4. **部分接口待加固**: 项目相关接口缺少显式权限依赖，建议补充

### 6.3 后续建议

1. 如需扩展 to C 业务，建议新建独立的客户端 API 模块
2. 对现有内部管理接口进行权限审计，确保敏感操作有适当的权限控制
3. 考虑为 to C 场景设计独立的认证体系（如手机号+验证码）

---

*文档生成时间: 2026-04-07*
*分析范围: backend/routers/* 所有路由文件*
