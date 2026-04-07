# ProFo API C端与B端解耦整改任务清单

> 本文档由整改计划自动生成，包含56项具体任务，覆盖7周实施周期。

---

## 任务统计

| 阶段 | 任务数 | 优先级分布 |
|------|--------|------------|
| 现状分析 | 4 | 高:3 中:1 |
| API改造 | 43 | 高:34 中:9 |
| 测试验证 | 5 | 高:3 中:2 |
| 上线切换 | 4 | 高:3 低:1 |
| **总计** | **56** | **高:43 中:12 低:1** |

---

## 一、现状分析阶段（已完成）

| 序号 | 任务 | 状态 | 负责人 | 优先级 | 备注 |
|------|------|:----:|--------|:------:|------|
| 1 | 梳理现有85个API端点完整清单 | ✅ | - | 高 | 详见API_Analysis.md |
| 2 | 标记每个接口的当前权限要求 | ✅ | - | 高 | 已完成分类 |
| 3 | 识别B端与C端耦合点 | ✅ | - | 高 | 已识别3类耦合 |
| 4 | 输出接口分类统计报告 | ✅ | - | 中 | API_Analysis.md |

---

## 二、API改造阶段

### 2.1 基础架构（4项）

| 序号 | 任务 | 状态 | 负责人 | 优先级 | 预计工时 | 依赖 |
|------|------|:----:|--------|:------:|:--------:|------|
| 5 | 创建新的路由目录结构 | ⬜ | - | 高 | 2h | - |
| 6 | 定义新的权限依赖函数 | ⬜ | - | 高 | 4h | - |
| 7 | 创建向后兼容中间件 | ⬜ | - | 中 | 4h | 5 |
| 8 | 更新main.py路由注册 | ⬜ | - | 高 | 2h | 5,6 |

**目录结构规划：**
```
/routers
├── /auth              # 认证相关（共用）
│   └── auth.py
├── /admin             # B端管理接口
│   ├── __init__.py
│   ├── users.py       # 用户管理
│   ├── roles.py       # 角色管理
│   ├── system.py      # 系统管理
│   ├── properties.py  # 房源管理
│   ├── communities.py # 小区管理
│   ├── data.py        # 数据导入
│   ├── files.py       # 文件上传
│   ├── projects.py    # 项目管理
│   ├── leads.py       # 线索管理
│   ├── marketing.py   # 市场营销
│   └── ai_strategy.py # AI策略
├── /client            # C端客户端接口
│   ├── __init__.py
│   ├── properties.py  # 房源查询
│   └── communities.py # 小区查询
└── /public            # 公共接口（保留）
    └── health.py      # 健康检查
```

### 2.2 认证模块（4项）

| 序号 | 任务 | 状态 | 负责人 | 优先级 | 预计工时 | 依赖 |
|------|------|:----:|--------|:------:|:--------:|------|
| 9 | 迁移auth/me接口 | ⬜ | - | 高 | 2h | 8 |
| 10 | 迁移change-password接口 | ⬜ | - | 高 | 2h | 8 |
| 11 | 更新前端认证调用 | ⬜ | - | 高 | 4h | 9,10 |
| 12 | 测试认证流程 | ⬜ | - | 高 | 2h | 11 |

### 2.3 Admin模块 - 用户角色（7项）

| 序号 | 任务 | 状态 | 负责人 | 优先级 | 预计工时 | 依赖 |
|------|------|:----:|--------|:------:|:--------:|------|
| 13 | 创建admin/users路由 | ⬜ | - | 高 | 2h | 8 |
| 14 | 创建admin/roles路由 | ⬜ | - | 高 | 2h | 8 |
| 15 | 创建admin/system路由 | ⬜ | - | 高 | 1h | 8 |
| 16 | 迁移用户管理接口(10个) | ⬜ | - | 高 | 8h | 13 |
| 17 | 迁移角色管理接口(5个) | ⬜ | - | 高 | 4h | 14 |
| 18 | 添加admin权限校验 | ⬜ | - | 高 | 2h | 16,17 |
| 19 | 废弃旧users/roles接口 | ⬜ | - | 中 | 2h | 18 |

**接口迁移清单：**
- [ ] `GET /api/v1/admin/users` - 用户列表
- [ ] `GET /api/v1/admin/users/simple` - 简化用户列表
- [ ] `GET /api/v1/admin/users/{id}` - 用户详情
- [ ] `POST /api/v1/admin/users` - 创建用户
- [ ] `PUT /api/v1/admin/users/{id}` - 更新用户
- [ ] `PUT /api/v1/admin/users/{id}/reset-password` - 重置密码
- [ ] `DELETE /api/v1/admin/users/{id}` - 删除用户
- [ ] `GET /api/v1/admin/roles` - 角色列表
- [ ] `GET /api/v1/admin/roles/{id}` - 角色详情
- [ ] `POST /api/v1/admin/roles` - 创建角色
- [ ] `PUT /api/v1/admin/roles/{id}` - 更新角色
- [ ] `DELETE /api/v1/admin/roles/{id}` - 删除角色
- [ ] `POST /api/v1/admin/system/init` - 系统初始化

### 2.4 Client模块（6项）

| 序号 | 任务 | 状态 | 负责人 | 优先级 | 预计工时 | 依赖 |
|------|------|:----:|--------|:------:|:--------:|------|
| 20 | 创建client/properties路由 | ⬜ | - | 高 | 2h | 8 |
| 21 | 创建client/communities路由 | ⬜ | - | 高 | 2h | 8 |
| 22 | 迁移房源查询接口(4个) | ⬜ | - | 高 | 4h | 20 |
| 23 | 迁移市场监控接口(4个) | ⬜ | - | 高 | 4h | 21 |
| 24 | 添加数据脱敏处理 | ⬜ | - | 中 | 4h | 22,23 |
| 25 | 废弃旧properties/monitor接口 | ⬜ | - | 中 | 2h | 24 |

**接口迁移清单：**
- [ ] `GET /api/v1/client/properties` - 房源列表
- [ ] `GET /api/v1/client/properties/{id}` - 房源详情
- [ ] `GET /api/v1/client/communities/search` - 小区搜索
- [ ] `GET /api/v1/client/communities/{id}/sentiment` - 市场情绪
- [ ] `GET /api/v1/client/communities/{id}/trends` - 市场趋势
- [ ] `GET /api/v1/client/communities/{id}/radar` - 竞品雷达
- [ ] `GET /api/v1/client/communities/{id}/competitors` - 竞品列表

### 2.5 Admin模块 - 数据管理（5项）

| 序号 | 任务 | 状态 | 负责人 | 优先级 | 预计工时 | 依赖 |
|------|------|:----:|--------|:------:|:--------:|------|
| 26 | 创建admin/data路由 | ⬜ | - | 高 | 2h | 8 |
| 27 | 创建admin/files路由 | ⬜ | - | 高 | 1h | 8 |
| 28 | 迁移数据导入接口(4个) | ⬜ | - | 高 | 4h | 26,27 |
| 29 | 添加API Key认证(push) | ⬜ | - | 高 | 4h | 28 |
| 30 | 废弃旧upload/files接口 | ⬜ | - | 中 | 2h | 29 |

**接口迁移清单：**
- [ ] `POST /api/v1/admin/data/push` - JSON数据推送
- [ ] `POST /api/v1/admin/data/upload/csv` - CSV上传
- [ ] `GET /api/v1/admin/data/download/{filename}` - 下载失败记录
- [ ] `POST /api/v1/admin/files/upload` - 文件上传

### 2.6 Admin模块 - 项目（7项）

| 序号 | 任务 | 状态 | 负责人 | 优先级 | 预计工时 | 依赖 |
|------|------|:----:|--------|:------:|:--------:|------|
| 31 | 创建admin/projects路由 | ⬜ | - | 高 | 2h | 8 |
| 32 | 迁移项目管理接口(10个) | ⬜ | - | 高 | 8h | 31 |
| 33 | 迁移改造管理接口(6个) | ⬜ | - | 高 | 6h | 31 |
| 34 | 迁移销售管理接口(6个) | ⬜ | - | 高 | 6h | 31 |
| 35 | 添加operator权限校验 | ⬜ | - | 高 | 2h | 32,33,34 |
| 36 | 优化项目数据返回结构 | ⬜ | - | 中 | 4h | 35 |
| 37 | 废弃旧projects接口 | ⬜ | - | 中 | 2h | 36 |

**接口迁移清单：**
- [ ] `GET /api/v1/admin/projects` - 项目列表
- [ ] `POST /api/v1/admin/projects` - 创建项目
- [ ] `GET /api/v1/admin/projects/{id}` - 项目详情
- [ ] `PUT /api/v1/admin/projects/{id}` - 更新项目
- [ ] `DELETE /api/v1/admin/projects/{id}` - 删除项目
- [ ] `GET /api/v1/admin/projects/stats` - 项目统计
- [ ] `PUT /api/v1/admin/projects/{id}/status` - 更新状态
- [ ] `POST /api/v1/admin/projects/{id}/complete` - 完成项目
- [ ] `GET /api/v1/admin/projects/{id}/report` - 项目报告
- [ ] `GET /api/v1/admin/projects/export` - 导出项目
- [ ] `PUT /api/v1/admin/projects/{id}/renovation` - 更新改造
- [ ] `POST /api/v1/admin/projects/{id}/renovation/photos` - 上传照片
- [ ] `GET /api/v1/admin/projects/{id}/renovation/photos` - 获取照片
- [ ] `DELETE /api/v1/admin/projects/{id}/renovation/photos/{pid}` - 删除照片
- [ ] `GET /api/v1/admin/projects/{id}/renovation/contract` - 获取合同
- [ ] `PUT /api/v1/admin/projects/{id}/renovation/contract` - 更新合同
- [ ] `PUT /api/v1/admin/projects/{id}/selling/roles` - 更新销售角色
- [ ] `POST /api/v1/admin/projects/{id}/selling/viewings` - 创建带看
- [ ] `POST /api/v1/admin/projects/{id}/selling/offers` - 创建出价
- [ ] `POST /api/v1/admin/projects/{id}/selling/negotiations` - 创建面谈
- [ ] `GET /api/v1/admin/projects/{id}/selling/records` - 获取记录
- [ ] `DELETE /api/v1/admin/projects/{id}/selling/records/{rid}` - 删除记录

### 2.7 Admin模块 - 现金流（3项）

| 序号 | 任务 | 状态 | 负责人 | 优先级 | 预计工时 | 依赖 |
|------|------|:----:|--------|:------:|:--------:|------|
| 38 | 迁移现金流接口(3个) | ⬜ | - | 高 | 2h | 31 |
| 39 | 添加operator权限校验 | ⬜ | - | 高 | 1h | 38 |
| 40 | 废弃旧cashflow接口 | ⬜ | - | 中 | 1h | 39 |

**接口迁移清单：**
- [ ] `GET /api/v1/admin/projects/{id}/cashflow` - 获取现金流
- [ ] `POST /api/v1/admin/projects/{id}/cashflow` - 创建现金流
- [ ] `DELETE /api/v1/admin/projects/{id}/cashflow/{cid}` - 删除现金流

### 2.8 Admin模块 - 线索（4项）

| 序号 | 任务 | 状态 | 负责人 | 优先级 | 预计工时 | 依赖 |
|------|------|:----:|--------|:------:|:--------:|------|
| 41 | 创建admin/leads路由 | ⬜ | - | 高 | 2h | 8 |
| 42 | 迁移线索管理接口(9个) | ⬜ | - | 高 | 6h | 41 |
| 43 | 添加operator权限校验 | ⬜ | - | 高 | 2h | 42 |
| 44 | 废弃旧leads接口 | ⬜ | - | 中 | 2h | 43 |

**接口迁移清单：**
- [ ] `GET /api/v1/admin/leads` - 线索列表
- [ ] `POST /api/v1/admin/leads` - 创建线索
- [ ] `GET /api/v1/admin/leads/{id}` - 线索详情
- [ ] `PUT /api/v1/admin/leads/{id}` - 更新线索
- [ ] `DELETE /api/v1/admin/leads/{id}` - 删除线索
- [ ] `GET /api/v1/admin/leads/{id}/follow-ups` - 获取跟进
- [ ] `POST /api/v1/admin/leads/{id}/follow-ups` - 添加跟进
- [ ] `GET /api/v1/admin/leads/{id}/prices` - 获取价格历史
- [ ] `POST /api/v1/admin/leads/{id}/prices` - 添加价格记录

### 2.9 Admin模块 - 市场营销（3项）

| 序号 | 任务 | 状态 | 负责人 | 优先级 | 预计工时 | 依赖 |
|------|------|:----:|--------|:------:|:--------:|------|
| 45 | 重命名l4-marketing为marketing | ⬜ | - | 中 | 2h | - |
| 46 | 调整删除权限为仅admin | ⬜ | - | 中 | 1h | 45 |
| 47 | 更新前端调用 | ⬜ | - | 中 | 2h | 46 |

**接口变更清单：**
- [ ] `GET /api/v1/admin/marketing/projects` - 营销项目列表
- [ ] `POST /api/v1/admin/marketing/projects` - 创建营销项目
- [ ] `GET /api/v1/admin/marketing/projects/{id}` - 营销项目详情
- [ ] `PUT /api/v1/admin/marketing/projects/{id}` - 更新营销项目
- [ ] `DELETE /api/v1/admin/marketing/projects/{id}` - 删除营销项目（仅admin）
- [ ] `GET /api/v1/admin/marketing/projects/{id}/media` - 获取媒体
- [ ] `POST /api/v1/admin/marketing/projects/{id}/media` - 添加媒体
- [ ] `PUT /api/v1/admin/marketing/media/{id}` - 更新媒体
- [ ] `DELETE /api/v1/admin/marketing/media/{id}` - 删除媒体

---

## 三、测试验证阶段（5项）

| 序号 | 任务 | 状态 | 负责人 | 优先级 | 预计工时 | 依赖 |
|------|------|:----:|--------|:------:|:--------:|------|
| 48 | 编写接口迁移测试用例 | ⬜ | - | 高 | 8h | 47 |
| 49 | 验证所有新接口功能 | ⬜ | - | 高 | 8h | 48 |
| 50 | 验证权限控制正确性 | ⬜ | - | 高 | 4h | 49 |
| 51 | 验证旧接口向后兼容 | ⬜ | - | 中 | 4h | 49 |
| 52 | 性能测试 | ⬜ | - | 中 | 4h | 49 |

**测试用例清单：**
- [ ] 认证接口测试（登录/刷新/获取用户信息）
- [ ] Admin模块权限测试（admin/operator/user角色）
- [ ] Client模块数据脱敏测试
- [ ] 数据导入接口API Key测试
- [ ] 项目管理CRUD测试
- [ ] 线索管理CRUD测试
- [ ] 市场营销接口测试
- [ ] 旧接口向后兼容测试
- [ ] 并发性能测试

---

## 四、上线切换阶段（4项）

| 序号 | 任务 | 状态 | 负责人 | 优先级 | 预计工时 | 依赖 |
|------|------|:----:|--------|:------:|:--------:|------|
| 53 | 部署新接口 | ⬜ | - | 高 | 4h | 52 |
| 54 | 前端切换至新接口 | ⬜ | - | 高 | 8h | 53 |
| 55 | 监控错误日志 | ⬜ | - | 高 | 持续 | 54 |
| 56 | 移除废弃接口 | ⬜ | - | 低 | 4h | 55（稳定后） |

---

## 五、时间规划

### 5.1 甘特图

```
Week 1       Week 2       Week 3       Week 4       Week 5       Week 6       Week 7
├────────────┼────────────┼────────────┼────────────┼────────────┼────────────┼────────────┤
│ 基础架构    │ 认证模块    │ Admin用户   │ Client模块  │ Admin数据   │ Admin线索   │ 测试验证    │
│ (任务5-8)   │ (任务9-12)  │ (任务13-19) │ (任务20-25) │ 项目现金流   │ 市场营销    │ (任务48-52) │
│             │             │             │             │ (任务26-40) │ (任务41-47) │             │
│             │             │             │             │             │             │ 上线切换    │
│             │             │             │             │             │             │ (任务53-56) │
└────────────┴────────────┴────────────┴────────────┴────────────┴────────────┴────────────┘
```

### 5.2 里程碑

| 里程碑 | 时间节点 | 交付物 |
|--------|----------|--------|
| M1 | Week 1结束 | 新路由架构完成 |
| M2 | Week 2结束 | 认证模块迁移完成 |
| M3 | Week 3结束 | Admin用户角色模块完成 |
| M4 | Week 4结束 | Client模块完成 |
| M5 | Week 5结束 | Admin数据、项目、现金流模块完成 |
| M6 | Week 6结束 | Admin线索、市场营销模块完成 |
| M7 | Week 7结束 | 测试通过，正式上线 |

---

## 六、验收标准

### 6.1 功能验收
- [ ] 所有B端接口路径以 `/api/v1/admin/` 开头
- [ ] 所有C端接口路径以 `/api/v1/client/` 开头
- [ ] 认证接口统一在 `/api/v1/auth/` 下
- [ ] 权限控制正确，无越权访问

### 6.2 性能验收
- [ ] 新接口响应时间 ≤ 旧接口响应时间
- [ ] 并发用户数 ≥ 100

### 6.3 安全验收
- [ ] 敏感接口已添加权限校验
- [ ] 数据脱敏处理正确
- [ ] 无未授权访问漏洞

---

## 七、风险跟踪

| 风险项 | 状态 | 应对措施 | 负责人 |
|--------|:----:|----------|--------|
| 接口迁移遗漏 | 🟡 | 建立完整映射表，逐项核对 | - |
| 权限控制缺陷 | 🟡 | 编写权限测试用例，全面测试 | - |
| 前端调用未更新 | 🟡 | 建立接口调用清单，逐项更新 | - |
| 工期延误 | 🟢 | 分阶段实施，每阶段可独立上线 | - |

---

*文档生成时间: 2026-04-07*
*关联文档: API_Analysis.md, API_C_B_Decoupling_Plan.md*
