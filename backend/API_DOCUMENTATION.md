# ProFo 后端 API 说明文档

## 文档概述

本文档详细描述了 ProFo 房地产翻新与销售管理系统的后端 API 接口，包含所有端点的路径、方法、参数、响应结构、错误码及认证要求。

**文档版本**: v1.0  
**最后更新**: 2026-04-08  
**API 基础 URL**: `http://127.0.0.1:8000/api/v1`

---

## 目录

1. [系统架构](#系统架构)
2. [认证与授权](#认证与授权)
3. [通用规范](#通用规范)
4. [API 端点总览](#api-端点总览)
5. [认证模块](#认证模块)
6. [用户管理模块](#用户管理模块)
7. [角色管理模块](#角色管理模块)
8. [项目管理模块](#项目管理模块)
9. [线索管理模块](#线索管理模块)
10. [房源管理模块](#房源管理模块)
11. [小区管理模块](#小区管理模块)
12. [L4 营销模块](#l4-营销模块)
13. [现金流模块](#现金流模块)
14. [监控分析模块](#监控分析模块)
15. [文件管理模块](#文件管理模块)
16. [数据导入模块](#数据导入模块)
17. [错误码参考](#错误码参考)
18. [接口调用流程图](#接口调用流程图)

---

## 系统架构

### 四层业务领域架构

```
┌─────────────────────────────────────────────────────────────┐
│                        L4 市场营销层                          │
│                    (mini_projects - CMS)                     │
│                  角色: 门面与作品集                            │
│              职责: 房源营销展示、历史案例作品集                  │
└───────────────────────────┬─────────────────────────────────┘
                            │ 写时复制 (CoW)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                        L3 项目管理层                          │
│                    (projects - 核心ERP)                       │
│                    角色: 工厂                                 │
│          职责: 合同管理、装修管控、销售跟进、财务记录            │
│              核心能力: 项目全生命周期管理                       │
└───────────────────────────┬─────────────────────────────────┘
                            │ 写时复制 (CoW)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                        L2 线索管理层                          │
│                      (leads - 筛选器)                         │
│                    角色: 漏斗瓶颈                              │
│          职责: 房源线索创建、跟进、评估与筛选                   │
└───────────────────────────┬─────────────────────────────────┘
                            │ 写时复制 (CoW)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                        L1 市场情报层                          │
│                 (property_current - 参考基准)                  │
│                    角色: 参考基准                              │
│          职责: 小区信息管理、房源市场数据、价格变动记录          │
└─────────────────────────────────────────────────────────────┘
```

---

## 认证与授权

### 认证方式

系统采用 **JWT (JSON Web Token)** 认证机制，支持以下登录方式：

1. **用户名密码登录** - 标准登录方式
2. **微信 OAuth 登录** - 网页端微信授权
3. **微信小程序登录** - 小程序端登录

### 获取 Token

```http
POST /api/v1/auth/token
Content-Type: application/x-www-form-urlencoded

username=admin&password=Fdd123..
```

### 使用 Token

在请求头中添加 Authorization 字段：

```http
Authorization: Bearer {access_token}
```

### 角色权限体系

| 角色代码 | 角色名称 | 权限范围 |
|---------|---------|---------|
| `admin` | 管理员 | 所有权限，包括用户管理、权限配置 |
| `operator` | 运营人员 | 数据修改权限，项目/房源增删改查 |
| `user` | 普通用户 | 仅数据查看权限 |

### 权限依赖函数

| 依赖函数 | 允许角色 | 用途 |
|---------|---------|-----|
| `get_current_active_user` | 所有激活用户 | 基础认证 |
| `get_current_admin_user` | admin | 管理员操作 |
| `get_current_operator_user` | admin, operator | 运营操作 |
| `get_current_internal_user` | admin, operator | 内部管理接口 |

---

## 通用规范

### 请求格式

- **Content-Type**: `application/json` (除文件上传外)
- **字符编码**: UTF-8
- **日期格式**: `YYYY-MM-DD` 或 ISO 8601 格式

### 响应格式

**成功响应** (直接返回 Pydantic 模型，无包装)：
```json
{
  "id": "uuid",
  "name": "项目名称",
  "created_at": "2024-01-01T00:00:00"
}
```

**错误响应** (统一格式)：
```json
{
  "detail": "错误描述"
}
```

### HTTP 状态码规范

| 状态码 | 含义 | 使用场景 |
|-------|------|---------|
| 200 | OK | GET/PUT 成功 |
| 201 | Created | POST 创建成功 |
| 204 | No Content | DELETE 删除成功 |
| 400 | Bad Request | 请求参数错误 |
| 401 | Unauthorized | 未认证或 Token 无效 |
| 403 | Forbidden | 权限不足 |
| 404 | Not Found | 资源不存在 |
| 409 | Conflict | 资源冲突（如重复） |
| 422 | Unprocessable Entity | 验证失败 |
| 429 | Too Many Requests | 速率限制 |
| 500 | Internal Server Error | 服务器内部错误 |

### 分页规范

列表接口统一返回分页格式：

```json
{
  "items": [],
  "total": 100,
  "page": 1,
  "page_size": 20
}
```

**分页参数**：
- `page`: 页码 (默认 1, >= 1)
- `page_size`: 每页数量 (默认 20, 范围 1-200)

### 速率限制

| 接口 | 限制 |
|-----|------|
| 登录相关 | 5次/分钟 |
| 其他接口 | 100次/分钟 |

---

## API 端点总览

### 端点统计

| 模块 | 端点数量 | 主要功能 |
|-----|---------|---------|
| 认证 | 7 | 登录、Token刷新、微信登录 |
| 用户管理 | 9 | 用户CRUD、密码管理 |
| 角色管理 | 5 | 角色CRUD |
| 项目管理 | 12 | 项目全生命周期管理 |
| 线索管理 | 10 | 线索跟进、评估、价格历史 |
| 房源管理 | 4 | 房源查询、导出 |
| 小区管理 | 4 | 小区查询、合并 |
| L4营销 | 10 | 营销项目、媒体管理 |
| 现金流 | 3 | 财务记录管理 |
| 监控分析 | 6 | 市场分析、竞品监控 |
| 文件管理 | 2 | 文件上传、下载 |
| 数据导入 | 3 | CSV/JSON 导入 |

### 完整端点列表

```
# 系统
GET    /                         # 根路径 - 健康检查
GET    /health                   # 健康检查

# 认证
POST   /api/v1/auth/token        # OAuth2 Token 获取
POST   /api/v1/auth/login        # 用户登录
POST   /api/v1/auth/refresh      # 刷新 Token
GET    /api/v1/auth/me           # 获取当前用户信息
GET    /api/v1/auth/wechat/authorize  # 微信授权URL
GET    /api/v1/auth/wechat/callback   # 微信回调
POST   /api/v1/auth/wechat/login    # 微信小程序登录

# 用户管理
GET    /api/v1/users/users       # 用户列表
GET    /api/v1/users/simple      # 简化用户列表
GET    /api/v1/users/me          # 当前用户信息
GET    /api/v1/users/{id}        # 用户详情
POST   /api/v1/users/users       # 创建用户
PUT    /api/v1/users/{id}        # 更新用户
DELETE /api/v1/users/{id}        # 删除用户
PUT    /api/v1/users/{id}/reset-password  # 重置密码
POST   /api/v1/users/change-password      # 修改密码
POST   /api/v1/users/init-data   # 初始化系统数据

# 角色管理
GET    /api/v1/roles             # 角色列表
GET    /api/v1/roles/{id}        # 角色详情
POST   /api/v1/roles             # 创建角色
PUT    /api/v1/roles/{id}        # 更新角色
DELETE /api/v1/roles/{id}        # 删除角色

# 项目管理
GET    /api/v1/projects          # 项目列表
POST   /api/v1/projects          # 创建项目
GET    /api/v1/projects/stats    # 项目统计
GET    /api/v1/projects/{id}     # 项目详情
PUT    /api/v1/projects/{id}     # 更新项目
DELETE /api/v1/projects/{id}     # 删除项目
PUT    /api/v1/projects/{id}/status      # 更新状态
POST   /api/v1/projects/{id}/complete    # 完成项目
GET    /api/v1/projects/{id}/report      # 项目报告
GET    /api/v1/projects/export   # 导出项目

# 项目装修
PUT    /api/v1/projects/{id}/renovation  # 更新装修信息
POST   /api/v1/projects/{id}/renovation/photos  # 上传装修照片

# 项目销售
POST   /api/v1/projects/{id}/sales/records      # 创建销售记录
PUT    /api/v1/projects/{id}/sales/roles        # 更新销售角色

# 项目现金流
POST   /api/v1/projects/{id}/cashflow           # 创建现金流记录
GET    /api/v1/projects/{id}/cashflow           # 获取现金流
DELETE /api/v1/projects/{id}/cashflow/{rid}     # 删除现金流记录

# 线索管理
GET    /api/v1/leads              # 线索列表
POST   /api/v1/leads              # 创建线索
GET    /api/v1/leads/{id}         # 线索详情
PUT    /api/v1/leads/{id}         # 更新线索
DELETE /api/v1/leads/{id}         # 删除线索
POST   /api/v1/leads/{id}/follow-ups    # 添加跟进记录
GET    /api/v1/leads/{id}/follow-ups    # 获取跟进记录
GET    /api/v1/leads/{id}/prices        # 获取价格历史
POST   /api/v1/leads/{id}/prices        # 添加价格记录

# 房源管理
GET    /api/v1/properties/communities/search    # 搜索小区
GET    /api/v1/properties/                      # 房源列表
GET    /api/v1/properties/export                # 导出房源
GET    /api/v1/properties/{id}                  # 房源详情

# 小区管理
GET    /api/v1/communities                      # 小区列表
GET    /api/v1/dictionaries                     # 字典查询
POST   /api/v1/communities/merge                # 合并小区

# L4 营销
GET    /api/v1/admin/l4-marketing/projects              # 营销项目列表
POST   /api/v1/admin/l4-marketing/projects              # 创建营销项目
GET    /api/v1/admin/l4-marketing/projects/{id}         # 营销项目详情
PUT    /api/v1/admin/l4-marketing/projects/{id}         # 更新营销项目
DELETE /api/v1/admin/l4-marketing/projects/{id}         # 删除营销项目
GET    /api/v1/admin/l4-marketing/projects/{id}/media   # 媒体列表
POST   /api/v1/admin/l4-marketing/projects/{id}/media   # 添加媒体
PUT    /api/v1/admin/l4-marketing/media/{id}            # 更新媒体
DELETE /api/v1/admin/l4-marketing/media/{id}            # 删除媒体

# 监控分析
GET    /api/v1/monitor/communities/{id}/sentiment       # 市场情绪
GET    /api/v1/monitor/communities/{id}/trends          # 价格趋势
GET    /api/v1/monitor/communities/{id}/radar           # 周边雷达
POST   /api/v1/monitor/ai-strategy                      # AI策略
GET    /api/v1/communities/{id}/competitors             # 竞品列表
POST   /api/v1/communities/{id}/competitors             # 添加竞品
DELETE /api/v1/communities/{id}/competitors/{cid}       # 删除竞品

# 文件管理
POST   /api/v1/files/upload      # 文件上传
GET    /api/v1/files/download/{filename}  # 下载失败记录

# 数据导入
POST   /api/v1/upload/csv        # CSV上传
POST   /api/v1/push              # JSON推送
```

---

## 认证模块

### 1. OAuth2 Token 获取

**端点**: `POST /api/v1/auth/token`

**描述**: OAuth2 兼容的 token 获取接口，用于标准 OAuth2 客户端

**请求参数** (form-data):

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| username | string | 是 | 用户名 |
| password | string | 是 | 密码 |

**响应** (200 OK):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": "uuid",
    "username": "admin",
    "nickname": "管理员",
    "role": { "id": "uuid", "name": "管理员", "code": "admin" }
  }
}
```

**特殊响应** (403 Forbidden - 首次登录需改密码):
```json
{
  "detail": {
    "code": "HTTP_403",
    "message": "首次登录必须修改密码",
    "temp_token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**速率限制**: 5次/分钟

---

### 2. 用户登录

**端点**: `POST /api/v1/auth/login`

**描述**: 标准用户名密码登录接口

**请求体**:
```json
{
  "username": "admin",
  "password": "Fdd123.."
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 约束 | 说明 |
|-----|------|-----|------|-----|
| username | string | 是 | min=1 | 用户名 |
| password | string | 是 | min=1 | 密码 |

**响应**: 同 OAuth2 Token 响应

---

### 3. 刷新 Token

**端点**: `POST /api/v1/auth/refresh`

**描述**: 使用刷新令牌获取新的访问令牌

**请求体**:
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**响应** (200 OK): 同登录响应

---

### 4. 获取当前用户信息

**端点**: `GET /api/v1/auth/me`

**描述**: 获取当前登录用户的详细信息

**认证**: Bearer Token

**响应** (200 OK):
```json
{
  "id": "uuid",
  "username": "admin",
  "nickname": "管理员",
  "phone": "13800138000",
  "avatar": "https://...",
  "role_id": "uuid",
  "role": {
    "id": "uuid",
    "name": "管理员",
    "code": "admin",
    "permissions": ["view_data", "edit_data", "manage_users"]
  },
  "status": "active",
  "last_login_at": "2024-01-01T00:00:00",
  "created_at": "2024-01-01T00:00:00",
  "updated_at": "2024-01-01T00:00:00"
}
```

---

### 5. 微信授权 URL

**端点**: `GET /api/v1/auth/wechat/authorize`

**描述**: 生成微信 OAuth 授权 URL

**查询参数**:

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| redirect_uri | string | 否 | 回调地址 |

**响应** (200 OK):
```json
{
  "auth_url": "https://open.weixin.qq.com/connect/qrconnect?..."
}
```

---

### 6. 微信回调

**端点**: `GET /api/v1/auth/wechat/callback`

**描述**: 微信 OAuth 授权回调处理

**查询参数**:

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| code | string | 是 | 授权码 |
| state | string | 是 | 状态参数 |

**响应**: 302 重定向到前端登录页，携带 token 参数

---

### 7. 微信小程序登录

**端点**: `POST /api/v1/auth/wechat/login`

**描述**: 微信小程序登录

**请求体**:
```json
{
  "code": "wx_auth_code"
}
```

**响应**: 同登录响应

---

## 用户管理模块

### 1. 获取用户列表

**端点**: `GET /api/v1/users/users`

**描述**: 获取用户列表，支持搜索和筛选

**认证**: Admin

**查询参数**:

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| username | string | 否 | 用户名搜索（模糊） |
| nickname | string | 否 | 昵称搜索（模糊） |
| role_id | string | 否 | 角色ID筛选 |
| status | string | 否 | 用户状态筛选 |
| page | int | 否 | 页码 (默认1) |
| page_size | int | 否 | 每页数量 (默认50, max=200) |

**响应** (200 OK):
```json
{
  "total": 100,
  "items": [
    {
      "id": "uuid",
      "username": "admin",
      "nickname": "管理员",
      "role": { ... },
      "status": "active",
      "created_at": "2024-01-01T00:00:00"
    }
  ]
}
```

---

### 2. 获取简化用户列表

**端点**: `GET /api/v1/users/simple`

**描述**: 获取简化用户列表（仅ID和昵称），用于下拉选择

**认证**: 内部用户

**查询参数**:

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| nickname | string | 否 | 昵称搜索 |
| status | string | 否 | 状态筛选 (默认active) |

**响应** (200 OK):
```json
{
  "total": 10,
  "items": [
    { "id": "uuid", "nickname": "管理员", "username": "admin" }
  ]
}
```

---

### 3. 获取用户详情

**端点**: `GET /api/v1/users/{user_id}`

**描述**: 获取指定用户信息

**认证**: Admin

**路径参数**:

| 字段 | 类型 | 说明 |
|-----|------|-----|
| user_id | string | 用户ID |

**响应** (200 OK): UserResponse

---

### 4. 创建用户

**端点**: `POST /api/v1/users/users`

**描述**: 创建新用户

**认证**: Admin

**请求体** (UserCreate):
```json
{
  "username": "newuser",
  "password": "SecurePass123!",
  "nickname": "新用户",
  "phone": "13800138000",
  "role_id": "role_uuid"
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 约束 | 说明 |
|-----|------|-----|------|-----|
| username | string | 是 | min=3, max=100 | 用户名 |
| password | string | 是 | min=6, max=255 | 密码 |
| nickname | string | 否 | max=100 | 昵称 |
| phone | string | 否 | max=20 | 手机号 |
| role_id | string | 是 | - | 角色ID |

**响应** (201 Created): UserResponse

---

### 5. 更新用户

**端点**: `PUT /api/v1/users/{user_id}`

**描述**: 更新用户信息

**认证**: Admin

**请求体** (UserUpdate):
```json
{
  "nickname": "新昵称",
  "phone": "13900139000",
  "role_id": "new_role_uuid",
  "status": "active"
}
```

**响应** (200 OK): UserResponse

---

### 6. 删除用户

**端点**: `DELETE /api/v1/users/{user_id}`

**描述**: 删除用户

**认证**: Admin

**响应** (204 No Content)

---

### 7. 重置用户密码

**端点**: `PUT /api/v1/users/{user_id}/reset-password`

**描述**: 管理员重置用户密码

**认证**: Admin

**请求体**:
```json
{
  "password": "NewSecurePass123!"
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 约束 | 说明 |
|-----|------|-----|------|-----|
| password | string | 是 | min=8, max=255 | 新密码 |

**响应** (200 OK):
```json
{
  "message": "密码重置成功"
}
```

---

### 8. 修改当前用户密码

**端点**: `POST /api/v1/users/change-password`

**描述**: 当前用户修改自己的密码

**认证**: 已登录用户

**请求体** (PasswordChange):
```json
{
  "current_password": "OldPass123!",
  "new_password": "NewSecurePass123!"
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 约束 | 说明 |
|-----|------|-----|------|-----|
| current_password | string | 是 | - | 当前密码 |
| new_password | string | 是 | min=8, max=255 | 新密码 |

**响应** (200 OK):
```json
{
  "message": "密码修改成功"
}
```

---

### 9. 初始化系统数据

**端点**: `POST /api/v1/users/init-data`

**描述**: 初始化系统数据，创建默认角色和管理员用户

**响应** (200 OK):
```json
{
  "message": "系统数据初始化成功",
  "warning": "请立即使用临时密码登录并修改密码",
  "temp_admin": {
    "username": "admin",
    "temp_password": "Temp...9!",
    "note": "此密码仅显示一次，请妥善保存。首次登录必须修改密码。"
  }
}
```

---

## 角色管理模块

### 1. 获取角色列表

**端点**: `GET /api/v1/roles`

**描述**: 获取角色列表

**认证**: Admin

**查询参数**:

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| name | string | 否 | 角色名称搜索 |
| code | string | 否 | 角色代码搜索 |
| is_active | bool | 否 | 是否激活筛选 |
| page | int | 否 | 页码 |
| page_size | int | 否 | 每页数量 |

**响应** (200 OK):
```json
{
  "total": 3,
  "items": [
    {
      "id": "uuid",
      "name": "管理员",
      "code": "admin",
      "description": "拥有所有权限",
      "permissions": ["view_data", "edit_data", "manage_users"],
      "is_active": true,
      "created_at": "2024-01-01T00:00:00"
    }
  ]
}
```

---

### 2. 获取角色详情

**端点**: `GET /api/v1/roles/{role_id}`

**描述**: 获取指定角色信息

**认证**: Admin

**响应** (200 OK): RoleResponse

---

### 3. 创建角色

**端点**: `POST /api/v1/roles`

**描述**: 创建新角色

**认证**: Admin

**请求体** (RoleCreate):
```json
{
  "name": "新角色",
  "code": "new_role",
  "description": "角色描述",
  "permissions": ["view_data"]
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 约束 | 说明 |
|-----|------|-----|------|-----|
| name | string | 是 | min=2, max=100 | 角色名称 |
| code | string | 是 | min=2, max=50 | 角色代码 |
| description | string | 否 | - | 角色描述 |
| permissions | array | 否 | - | 权限列表 |

**响应** (200 OK): RoleResponse

---

### 4. 更新角色

**端点**: `PUT /api/v1/roles/{role_id}`

**描述**: 更新角色信息

**认证**: Admin

**请求体** (RoleUpdate):
```json
{
  "name": "新名称",
  "permissions": ["view_data", "edit_data"],
  "is_active": true
}
```

**响应** (200 OK): RoleResponse

---

### 5. 删除角色

**端点**: `DELETE /api/v1/roles/{role_id}`

**描述**: 删除角色

**认证**: Admin

**响应** (204 No Content)

---

## 项目管理模块

### 1. 获取项目列表

**端点**: `GET /api/v1/projects`

**描述**: 获取项目列表，支持筛选和分页

**认证**: 内部用户

**查询参数**:

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| status | string | 否 | 项目状态筛选 |
| community_name | string | 否 | 小区名称筛选（模糊） |
| page | int | 否 | 页码 (默认1) |
| page_size | int | 否 | 每页数量 (默认50, max=200) |

**响应** (200 OK):
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "项目名称",
      "status": "签约",
      "community_name": "小区名称",
      "address": "物业地址",
      "area": "100.00",
      "layout": "三室两厅",
      "orientation": "南北通透",
      "contract_no": "HT2024001",
      "signing_price": "500.00",
      "signing_date": "2024-01-01",
      "owner_name": "业主姓名",
      "total_income": "0.00",
      "total_expense": "0.00",
      "net_cash_flow": "0.00",
      "roi": 0.0,
      "created_at": "2024-01-01T00:00:00"
    }
  ],
  "total": 100,
  "page": 1,
  "size": 20
}
```

---

### 2. 创建项目

**端点**: `POST /api/v1/projects`

**描述**: 创建新项目

**认证**: 内部用户

**请求体** (ProjectCreate):
```json
{
  "community_name": "小区名称",
  "address": "物业地址",
  "area": "100.50",
  "layout": "三室两厅",
  "orientation": "南北通透",
  "contract_no": "HT2024001",
  "signing_price": "500.00",
  "signing_date": "2024-01-01",
  "signing_period": 180,
  "extension_period": 30,
  "extension_rent": "5000.00",
  "cost_assumption": "各付各税",
  "planned_handover_date": "2024-02-01",
  "other_agreements": "其他约定内容",
  "owner_name": "业主姓名",
  "owner_phone": "13800138000",
  "owner_id_card": "310101199001011234",
  "owner_info": "业主备注",
  "list_price": "550.00",
  "listing_date": "2024-03-01"
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 约束 | 说明 |
|-----|------|-----|------|-----|
| community_name | string | 是 | max=200 | 小区名称 |
| address | string | 是 | max=500 | 物业地址 |
| area | decimal | 否 | - | 产证面积(m²) |
| layout | string | 否 | max=50 | 户型 |
| orientation | string | 否 | max=50 | 朝向 |
| contract_no | string | 是 | max=100 | 合同编号 |
| signing_price | decimal | 否 | - | 签约价格(万) |
| signing_date | string | 否 | YYYY-MM-DD | 签约日期 |
| signing_period | int | 否 | - | 合同周期(天) |
| extension_period | int | 否 | - | 顺延期(天) |
| extension_rent | decimal | 否 | - | 顺延期租金(元/月) |
| cost_assumption | string | 否 | max=50 | 税费承担 |
| planned_handover_date | string | 否 | YYYY-MM-DD | 计划交房时间 |
| other_agreements | string | 否 | - | 其他约定 |
| owner_name | string | 否 | max=100 | 业主姓名 |
| owner_phone | string | 否 | max=20 | 业主电话 |
| owner_id_card | string | 否 | max=18 | 业主身份证号 |
| owner_info | string | 否 | - | 业主备注 |
| list_price | decimal | 否 | - | 挂牌价(万) |
| listing_date | string | 否 | YYYY-MM-DD | 上架日期 |

**响应** (201 Created): ProjectResponse

---

### 3. 获取项目统计

**端点**: `GET /api/v1/projects/stats`

**描述**: 获取项目统计数据

**认证**: 内部用户

**响应** (200 OK):
```json
{
  "signing": 10,
  "renovating": 5,
  "selling": 8,
  "sold": 20
}
```

---

### 4. 获取项目详情

**端点**: `GET /api/v1/projects/{project_id}`

**描述**: 获取项目详情

**认证**: 内部用户

**路径参数**:

| 字段 | 类型 | 说明 |
|-----|------|-----|
| project_id | string | 项目ID |

**查询参数**:

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| full | bool | 否 | 是否获取完整详情(包含大字段) |

**响应** (200 OK): ProjectResponse

---

### 5. 更新项目

**端点**: `PUT /api/v1/projects/{project_id}`

**描述**: 更新项目信息

**认证**: 内部用户

**请求体** (ProjectUpdate): 同 ProjectCreate，所有字段可选

**响应** (200 OK): ProjectResponse

---

### 6. 删除项目

**端点**: `DELETE /api/v1/projects/{project_id}`

**描述**: 删除项目

**认证**: 内部用户

**响应** (204 No Content)

---

### 7. 更新项目状态

**端点**: `PUT /api/v1/projects/{project_id}/status`

**描述**: 更新项目状态

**认证**: 内部用户

**请求体** (StatusUpdate):
```json
{
  "status": "挂牌",
  "listing_date": "2024-03-01",
  "list_price": "550.00"
}
```

**状态枚举值**: `签约`, `装修`, `挂牌`, `已售`

**响应** (200 OK): ProjectResponse

---

### 8. 完成项目

**端点**: `POST /api/v1/projects/{project_id}/complete`

**描述**: 完成项目

**认证**: 内部用户

**请求体** (ProjectCompleteRequest):
```json
{
  "sold_price": "600.00",
  "sold_date": "2024-06-01"
}
```

**响应** (201 Created): ProjectResponse

---

### 9. 获取项目报告

**端点**: `GET /api/v1/projects/{project_id}/report`

**描述**: 获取项目报告

**认证**: 内部用户

**响应** (200 OK): ProjectReportResponse

---

### 10. 导出项目

**端点**: `GET /api/v1/projects/export`

**描述**: 导出项目数据为 CSV 文件

**认证**: 内部用户

**查询参数**: 同项目列表筛选参数

**响应**: CSV 文件下载 (Content-Type: text/csv)

---

## 线索管理模块

### 1. 获取线索列表

**端点**: `GET /api/v1/leads`

**描述**: 获取线索列表，支持多维度筛选

**认证**: 内部用户

**查询参数**:

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| page | int | 否 | 页码 (默认1) |
| page_size | int | 否 | 每页数量 (默认20, max=200) |
| search | string | 否 | 小区名称搜索（模糊） |
| statuses | array | 否 | 状态筛选数组 |
| district | string | 否 | 行政区筛选 |
| creator_id | int | 否 | 创建人ID筛选 |
| layout | string | 否 | 户型筛选 |
| floor | string | 否 | 楼层筛选 |

**响应** (200 OK):
```json
{
  "items": [
    {
      "id": "uuid",
      "community_name": "小区名称",
      "is_hot": 1,
      "layout": "三室两厅",
      "orientation": "南北",
      "floor_info": "15/28层",
      "area": 100.5,
      "total_price": 500.0,
      "unit_price": 49751.24,
      "eval_price": 480.0,
      "status": "pending_assessment",
      "district": "徐汇区",
      "business_area": "徐家汇",
      "creator_name": "创建人",
      "created_at": "2024-01-01T00:00:00"
    }
  ],
  "total": 50,
  "page": 1,
  "page_size": 20
}
```

---

### 2. 创建线索

**端点**: `POST /api/v1/leads`

**描述**: 创建新线索

**认证**: 内部用户

**请求体** (LeadCreate):
```json
{
  "community_name": "小区名称",
  "is_hot": 1,
  "layout": "三室两厅",
  "orientation": "南北",
  "floor_info": "15/28层",
  "area": 100.5,
  "total_price": 500.0,
  "unit_price": 49751.24,
  "eval_price": 480.0,
  "district": "徐汇区",
  "business_area": "徐家汇",
  "remarks": "备注",
  "source_property_id": 123,
  "images": ["url1", "url2"],
  "status": "pending_assessment"
}
```

**状态枚举值**:
- `pending_assessment` - 待评估
- `pending_visit` - 待看房
- `pending_decision` - 待决策
- `approved` - 已通过
- `rejected` - 已拒绝
- `converted` - 已转化

**响应** (200 OK): LeadResponse

---

### 3. 获取线索详情

**端点**: `GET /api/v1/leads/{lead_id}`

**描述**: 获取线索详情

**认证**: 内部用户

**响应** (200 OK): LeadResponse

---

### 4. 更新线索

**端点**: `PUT /api/v1/leads/{lead_id}`

**描述**: 更新线索信息

**认证**: 内部用户

**请求体** (LeadUpdate): 所有字段可选

**响应** (200 OK): LeadResponse

---

### 5. 删除线索

**端点**: `DELETE /api/v1/leads/{lead_id}`

**描述**: 删除线索

**认证**: 内部用户

**响应** (204 No Content)

---

### 6. 添加跟进记录

**端点**: `POST /api/v1/leads/{lead_id}/follow-ups`

**描述**: 添加线索跟进记录

**认证**: 内部用户

**请求体** (FollowUpCreate):
```json
{
  "method": "phone",
  "content": "跟进内容"
}
```

**跟进方式枚举值**:
- `phone` - 电话
- `wechat` - 微信
- `visit` - 实地看房
- `other` - 其他

**响应** (200 OK): FollowUpResponse

---

### 7. 获取跟进记录

**端点**: `GET /api/v1/leads/{lead_id}/follow-ups`

**描述**: 获取线索跟进记录列表

**认证**: 内部用户

**响应** (200 OK): FollowUpResponse[]

---

### 8. 获取价格历史

**端点**: `GET /api/v1/leads/{lead_id}/prices`

**描述**: 获取线索价格历史记录

**认证**: 内部用户

**响应** (200 OK): PriceHistoryResponse[]

---

### 9. 添加价格记录

**端点**: `POST /api/v1/leads/{lead_id}/prices`

**描述**: 添加价格历史记录

**认证**: 内部用户

**请求体** (PriceHistoryCreate):
```json
{
  "price": 480.0,
  "remark": "业主降价"
}
```

**响应** (200 OK): PriceHistoryResponse

---

## 房源管理模块

### 1. 搜索小区

**端点**: `GET /api/v1/properties/communities/search`

**描述**: 根据名称搜索小区

**认证**: 内部用户

**查询参数**:

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| q | string | 是 | 搜索关键词 (min=1) |

**响应** (200 OK):
```json
[
  {
    "id": 1,
    "name": "小区名称",
    "district": "徐汇区",
    "business_circle": "徐家汇"
  }
]
```

---

### 2. 获取房源列表

**端点**: `GET /api/v1/properties/`

**描述**: 查询房源列表，支持多维度筛选

**认证**: 内部用户

**查询参数**:

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| status | string | 否 | 房源状态: 在售/成交 |
| community_name | string | 否 | 小区名称（模糊） |
| districts | string | 否 | 行政区，逗号分隔 |
| business_circles | string | 否 | 商圈，逗号分隔 |
| orientations | string | 否 | 朝向关键词，逗号分隔 |
| floor_levels | string | 否 | 楼层级别，逗号分隔 |
| min_price | float | 否 | 最低价格（万） |
| max_price | float | 否 | 最高价格（万） |
| min_area | float | 否 | 最小面积（㎡） |
| max_area | float | 否 | 最大面积（㎡） |
| rooms | string | 否 | 室数量，逗号分隔 |
| rooms_gte | int | 否 | 最少室数量 |
| sort_by | string | 否 | 排序字段 (默认updated_at) |
| sort_order | string | 否 | 排序方向: asc/desc |
| page | int | 否 | 页码 (默认1) |
| page_size | int | 否 | 每页数量 (默认50, max=200) |

**响应** (200 OK):
```json
{
  "total": 1000,
  "page": 1,
  "page_size": 50,
  "items": [
    {
      "id": 1,
      "data_source": "lianjia",
      "source_property_id": "SH123456",
      "status": "在售",
      "community_id": 1,
      "community_name": "小区名称",
      "district": "徐汇区",
      "business_circle": "徐家汇",
      "rooms": 3,
      "halls": 2,
      "baths": 1,
      "layout_display": "3室2厅1卫",
      "orientation": "南北",
      "floor_display": "15/28层",
      "floor_level": "中楼层",
      "build_area": 100.5,
      "inner_area": 85.0,
      "total_price": 500.0,
      "unit_price": 49751.24,
      "listed_date": "2024-01-01T00:00:00",
      "property_type": "住宅",
      "build_year": 2010,
      "decoration": "精装",
      "elevator": true,
      "picture_links": ["url1", "url2"],
      "created_at": "2024-01-01T00:00:00",
      "updated_at": "2024-01-01T00:00:00"
    }
  ]
}
```

---

### 3. 导出房源

**端点**: `GET /api/v1/properties/export`

**描述**: 导出房源数据为 CSV 文件

**认证**: 内部用户

**查询参数**: 同房源列表筛选参数

**响应**: CSV 文件下载 (Content-Type: text/csv)

---

### 4. 获取房源详情

**端点**: `GET /api/v1/properties/{id}`

**描述**: 获取房源详情

**认证**: 内部用户

**路径参数**:

| 字段 | 类型 | 说明 |
|-----|------|-----|
| id | int | 房源ID |

**响应** (200 OK): PropertyDetailResponse

---

## 小区管理模块

### 1. 获取小区列表

**端点**: `GET /api/v1/communities`

**描述**: 查询小区列表

**认证**: 运营人员

**查询参数**:

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| search | string | 否 | 小区名称搜索（模糊） |
| page | int | 否 | 页码 (默认1) |
| page_size | int | 否 | 每页数量 (默认50, max=200) |

**响应** (200 OK):
```json
{
  "total": 100,
  "items": [
    {
      "id": 1,
      "name": "小区名称",
      "city_id": 1,
      "district": "徐汇区",
      "business_circle": "徐家汇",
      "avg_price_wan": 8.5,
      "total_properties": 50
    }
  ]
}
```

---

### 2. 获取字典数据

**端点**: `GET /api/v1/dictionaries`

**描述**: 获取行政区或商圈的去重列表

**认证**: 运营人员

**查询参数**:

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| type | string | 是 | 字典类型: district/business_circle |
| search | string | 否 | 模糊搜索关键词 |
| limit | int | 否 | 返回数量上限 (默认50, max=500) |

**响应** (200 OK):
```json
{
  "type": "district",
  "items": ["徐汇区", "静安区", "黄浦区"]
}
```

---

### 3. 合并小区

**端点**: `POST /api/v1/communities/merge`

**描述**: 合并小区操作

**认证**: Admin

**请求体**:
```json
{
  "primary_id": 1,
  "merge_ids": [2, 3]
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| primary_id | int | 是 | 主小区ID |
| merge_ids | array | 是 | 要合并的小区ID数组 |

**响应** (200 OK):
```json
{
  "success": true,
  "affected_properties": 10,
  "message": "成功合并 2 个小区，影响 10 条房源记录"
}
```

---

## L4 营销模块

### 1. 获取营销项目列表

**端点**: `GET /api/v1/admin/l4-marketing/projects`

**描述**: 获取营销项目列表

**认证**: 运营人员

**查询参数**:

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| page | int | 否 | 页码 (默认1) |
| page_size | int | 否 | 每页大小 (默认20, max=200) |
| publish_status | string | 否 | 发布状态: 草稿/发布 |
| project_status | string | 否 | 项目状态: 在途/在售/已售 |
| consultant_id | int | 否 | 顾问ID |
| community_id | int | 否 | 小区ID |

**响应** (200 OK):
```json
{
  "items": [
    {
      "id": 1,
      "community_id": 1,
      "community_name": "小区名称",
      "layout": "三室两厅",
      "orientation": "南北通透",
      "floor_info": "15/28层",
      "area": "100.50",
      "total_price": "500.00",
      "unit_price": "49751.24",
      "title": "营销标题",
      "images": "url1,url2",
      "sort_order": 0,
      "tags": "标签1,标签2",
      "decoration_style": "现代简约",
      "publish_status": "发布",
      "project_status": "在售",
      "project_id": null,
      "consultant_id": null,
      "media_files": [],
      "created_at": "2024-01-01T00:00:00"
    }
  ],
  "total": 50,
  "page": 1,
  "page_size": 20
}
```

---

### 2. 创建营销项目

**端点**: `POST /api/v1/admin/l4-marketing/projects`

**描述**: 创建独立营销项目（不关联L3项目）

**认证**: 运营人员

**请求体** (L4MarketingProjectCreate):
```json
{
  "community_id": 1,
  "community_name": "小区名称",
  "layout": "三室两厅",
  "orientation": "南北通透",
  "floor_info": "15/28层",
  "area": "100.50",
  "total_price": "500.00",
  "title": "营销标题",
  "images": ["url1", "url2"],
  "sort_order": 0,
  "tags": ["标签1", "标签2"],
  "decoration_style": "现代简约",
  "publish_status": "草稿",
  "project_status": "在途",
  "project_id": null,
  "consultant_id": null
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 约束 | 说明 |
|-----|------|-----|------|-----|
| community_id | int | 是 | gt=0 | 关联小区ID |
| community_name | string | 否 | max=200 | 小区名称(冗余) |
| layout | string | 是 | max=100 | 户型 |
| orientation | string | 是 | max=50 | 朝向 |
| floor_info | string | 是 | max=100 | 楼层信息 |
| area | decimal | 是 | gt=0, decimal_places=2 | 面积(m²) |
| total_price | decimal | 是 | gt=0, decimal_places=2 | 总价(万元) |
| title | string | 是 | max=255 | 标题 |
| images | string/array | 否 | - | 图片URL列表 |
| sort_order | int | 否 | ge=0 | 排序权重 |
| tags | string/array | 否 | max=500 | 标签 |
| decoration_style | string | 否 | max=100 | 装修风格 |
| publish_status | string | 否 | - | 发布状态 |
| project_status | string | 否 | - | 项目状态 |
| project_id | int | 否 | - | 关联L3项目ID |
| consultant_id | string | 否 | max=36 | 顾问ID |

**响应** (201 Created): L4MarketingProjectResponse

---

### 3. 获取营销项目详情

**端点**: `GET /api/v1/admin/l4-marketing/projects/{project_id}`

**描述**: 获取营销项目详情

**认证**: 运营人员

**响应** (200 OK): L4MarketingProjectResponse

---

### 4. 更新营销项目

**端点**: `PUT /api/v1/admin/l4-marketing/projects/{project_id}`

**描述**: 更新营销项目

**认证**: 运营人员

**请求体** (L4MarketingProjectUpdate): 所有字段可选

**响应** (200 OK): L4MarketingProjectResponse

---

### 5. 删除营销项目

**端点**: `DELETE /api/v1/admin/l4-marketing/projects/{project_id}`

**描述**: 逻辑删除营销项目

**认证**: 运营人员

**响应** (204 No Content)

---

### 6. 获取媒体列表

**端点**: `GET /api/v1/admin/l4-marketing/projects/{project_id}/media`

**描述**: 获取营销项目的媒体列表

**认证**: 运营人员

**查询参数**:

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| page | int | 否 | 页码 (默认1) |
| page_size | int | 否 | 每页数量 (默认100, max=200) |

**响应** (200 OK):
```json
{
  "items": [
    {
      "id": 1,
      "marketing_project_id": 1,
      "origin_media_id": null,
      "media_type": "image",
      "renovation_stage": "水电",
      "description": "描述",
      "file_url": "https://...",
      "thumbnail_url": null,
      "sort_order": 0,
      "is_deleted": false,
      "created_at": "2024-01-01T00:00:00"
    }
  ],
  "total": 10,
  "page": 1,
  "page_size": 100
}
```

---

### 7. 添加媒体

**端点**: `POST /api/v1/admin/l4-marketing/projects/{project_id}/media`

**描述**: 为营销项目添加媒体

**认证**: 运营人员

**请求体** (L4MarketingMediaCreate):
```json
{
  "media_type": "image",
  "renovation_stage": "水电",
  "description": "描述",
  "file_url": "https://...",
  "thumbnail_url": null,
  "sort_order": 0
}
```

**响应** (201 Created): L4MarketingMediaResponse

---

### 8. 更新媒体

**端点**: `PUT /api/v1/admin/l4-marketing/media/{media_id}`

**描述**: 更新媒体信息

**认证**: 运营人员

**请求体** (L4MarketingMediaUpdate): 所有字段可选

**响应** (200 OK): L4MarketingMediaResponse

---

### 9. 删除媒体

**端点**: `DELETE /api/v1/admin/l4-marketing/media/{media_id}`

**描述**: 逻辑删除媒体

**认证**: 运营人员

**响应** (204 No Content)

---

## 现金流模块

### 1. 创建现金流记录

**端点**: `POST /api/v1/projects/{project_id}/cashflow`

**描述**: 创建项目现金流记录

**认证**: 内部用户

**请求体** (CashFlowRecordCreate):
```json
{
  "type": "expense",
  "category": "装修费",
  "amount": "50000.00",
  "record_date": "2024-01-01T00:00:00",
  "operator_id": "user_uuid",
  "remark": "首期装修款"
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| type | string | 是 | 类型: income/expense |
| category | string | 是 | 费用类别 |
| amount | decimal | 是 | 金额(元) |
| record_date | datetime | 是 | 发生日期 |
| operator_id | string | 否 | 经办人ID |
| remark | string | 否 | 备注 |

**响应** (201 Created): CashFlowRecordResponse

---

### 2. 获取项目现金流

**端点**: `GET /api/v1/projects/{project_id}/cashflow`

**描述**: 获取项目现金流明细和汇总

**认证**: 内部用户

**响应** (200 OK):
```json
{
  "records": [
    {
      "id": "uuid",
      "project_id": "uuid",
      "type": "expense",
      "category": "装修费",
      "amount": "50000.00",
      "record_date": "2024-01-01T00:00:00",
      "operator_id": "user_uuid",
      "remark": "首期装修款",
      "created_at": "2024-01-01T00:00:00"
    }
  ],
  "summary": {
    "total_income": "0.00",
    "total_expense": "50000.00",
    "net_cash_flow": "-50000.00"
  }
}
```

---

### 3. 删除现金流记录

**端点**: `DELETE /api/v1/projects/{project_id}/cashflow/{record_id}`

**描述**: 删除现金流记录

**认证**: 内部用户

**响应** (204 No Content)

---

## 监控分析模块

### 1. 获取市场情绪

**端点**: `GET /api/v1/monitor/communities/{community_id}/sentiment`

**描述**: 获取小区市场情绪分析

**认证**: 内部用户

**响应** (200 OK): MarketSentimentResponse

---

### 2. 获取价格趋势

**端点**: `GET /api/v1/monitor/communities/{community_id}/trends`

**描述**: 获取小区价格趋势数据

**认证**: 内部用户

**查询参数**:

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| months | int | 否 | 月份数 (默认6, range=1-24) |

**响应** (200 OK): TrendData[]

---

### 3. 获取周边雷达

**端点**: `GET /api/v1/monitor/communities/{community_id}/radar`

**描述**: 获取周边竞品雷达数据

**认证**: 内部用户

**响应** (200 OK): NeighborhoodRadarResponse

---

### 4. 生成AI策略

**端点**: `POST /api/v1/monitor/ai-strategy`

**描述**: 生成AI定价策略

**认证**: 内部用户

**请求体** (AIStrategyRequest):
```json
{
  "project_id": 1,
  "user_context": "用户上下文信息"
}
```

**响应** (200 OK): AIStrategyResponse

---

### 5. 获取竞品列表

**端点**: `GET /api/v1/communities/{community_id}/competitors`

**描述**: 获取小区竞品列表

**认证**: 内部用户

**响应** (200 OK): CompetitorResponse[]

---

### 6. 添加竞品

**端点**: `POST /api/v1/communities/{community_id}/competitors`

**描述**: 添加竞品小区

**认证**: 内部用户

**请求体**:
```json
{
  "competitor_community_id": 2
}
```

**响应** (201 Created)

---

### 7. 删除竞品

**端点**: `DELETE /api/v1/communities/{community_id}/competitors/{competitor_id}`

**描述**: 删除竞品关联

**认证**: 内部用户

**响应** (204 No Content)

---

## 文件管理模块

### 1. 文件上传

**端点**: `POST /api/v1/files/upload`

**描述**: 上传文件

**认证**: 运营人员

**请求体** (multipart/form-data):

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| file | file | 是 | 文件 |

**支持的文件类型**:
- 图片: jpg, jpeg, png, gif, webp
- 文档: pdf, doc, docx, xls, xlsx
- 其他: 根据配置

**响应** (200 OK):
```json
{
  "url": "/static/uploads/20240101_abc123.jpg",
  "filename": "20240101_abc123.jpg"
}
```

---

### 2. 下载失败记录

**端点**: `GET /api/v1/files/download/{filename}`

**描述**: 下载导入失败的记录文件

**认证**: 内部用户

**响应**: 文件下载

---

## 数据导入模块

### 1. CSV 文件上传

**端点**: `POST /api/v1/upload/csv`

**描述**: 上传并处理 CSV 文件

**认证**: 内部用户

**请求体** (multipart/form-data):

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| file | file | 是 | CSV 文件 |

**响应** (200 OK) - UploadResult:
```json
{
  "success": true,
  "total": 100,
  "imported": 95,
  "failed": 5,
  "failed_file": "failed_records_20240101_120000.csv"
}
```

---

### 2. JSON 数据推送

**端点**: `POST /api/v1/push`

**描述**: JSON 数据批量推送接口

**认证**: 无需认证（内部接口）

**请求体**: PropertyIngestionModel 数组

**限制**: 单次最多 10000 条记录

**响应** (200 OK) - PushResult:
```json
{
  "total": 100,
  "success": 95,
  "failed": 5,
  "errors": [
    {
      "index": 0,
      "source_property_id": "SH123456",
      "reason": "验证失败: 总价不能为空"
    }
  ]
}
```

---

## 错误码参考

### HTTP 状态码

| 状态码 | 含义 | 场景 |
|-------|------|-----|
| 200 | OK | 请求成功 |
| 201 | Created | 资源创建成功 |
| 204 | No Content | 删除成功，无返回内容 |
| 400 | Bad Request | 请求参数错误 |
| 401 | Unauthorized | 未提供认证信息或Token无效 |
| 403 | Forbidden | 权限不足 |
| 404 | Not Found | 资源不存在 |
| 409 | Conflict | 资源冲突（如唯一约束 violation） |
| 422 | Unprocessable Entity | 请求验证失败 |
| 429 | Too Many Requests | 请求过于频繁 |
| 500 | Internal Server Error | 服务器内部错误 |

### 业务错误码

| 错误码 | 说明 | HTTP状态码 |
|-------|------|-----------|
| VALIDATION_ERROR | 数据验证错误 | 400 |
| DUPLICATE_RECORD | 记录已存在 | 409 |
| RESOURCE_NOT_FOUND | 资源不存在 | 404 |
| FILE_PROCESSING_ERROR | 文件处理错误 | 400 |
| BUSINESS_LOGIC_ERROR | 业务逻辑错误 | 422 |
| DATABASE_ERROR | 数据库错误 | 500 |
| AUTHENTICATION_ERROR | 认证失败 | 401 |
| PERMISSION_DENIED | 权限不足 | 403 |
| DATE_PROCESSING_ERROR | 日期处理错误 | 400 |
| PASSWORD_VALIDATION_ERROR | 密码验证错误 | 400 |
| RATE_LIMIT_EXCEEDED | 请求过于频繁 | 429 |
| INTERNAL_SERVER_ERROR | 服务器内部错误 | 500 |

---

## 接口调用流程图

### 用户认证流程

```
┌─────────┐     1.登录请求      ┌─────────┐
│  客户端  │ ─────────────────> │  后端   │
│         │                    │         │
│         │ <───────────────── │         │
│         │   2.返回Token      │         │
│         │   {access_token,   │         │
│         │    refresh_token}  │         │
│         │                    │         │
│         │ 3.携带Token请求    │         │
│         │ Authorization:     │         │
│         │ Bearer {token}     │         │
│         │ ─────────────────> │         │
│         │                    │         │
│         │ <───────────────── │         │
│         │   4.返回数据       │         │
└─────────┘                    └─────────┘
```

### 项目创建流程

```
┌─────────┐     1.创建项目      ┌─────────┐     2.创建合同      ┌─────────┐
│  客户端  │ ─────────────────> │  后端   │ ────────────────> │ 数据库  │
│         │   ProjectCreate    │         │   project_contracts│         │
│         │                    │         │                    │         │
│         │ <───────────────── │         │ <──────────────── │         │
│         │   3.返回项目信息    │         │                    │         │
│         │   ProjectResponse  │         │ 4.创建业主信息      │         │
│         │                    │         │ ────────────────> │         │
│         │                    │         │   project_owners   │         │
│         │                    │         │                    │         │
│         │                    │         │ 5.创建销售信息      │         │
│         │                    │         │ ────────────────> │         │
│         │                    │         │   project_sales    │         │
└─────────┘                    └─────────┘                    └─────────┘
```

### 线索转化流程

```
┌─────────┐     1.创建线索      ┌─────────┐
│  客户端  │ ─────────────────> │  后端   │
│         │   LeadCreate       │         │
│         │                    │         │
│         │ 2.添加跟进记录     │         │
│         │ POST /follow-ups   │         │
│         │ ─────────────────> │         │
│         │                    │         │
│         │ 3.更新线索状态     │         │
│         │ PUT /{id}          │         │
│         │ status: approved   │         │
│         │ ─────────────────> │         │
│         │                    │         │
│         │ 4.转化为项目       │         │
│         │ (写时复制)         │         │
│         │ ─────────────────> │         │
│         │                    │         │
│         │ <───────────────── │         │
│         │   5.返回项目ID     │         │
└─────────┘                    └─────────┘
```

---

## 附录

### A. 常用枚举值

#### 项目状态 (ProjectStatus)
- `签约` - 签约阶段
- `装修` - 装修阶段
- `挂牌` - 挂牌销售
- `已售` - 已售出

#### 线索状态 (LeadStatus)
- `pending_assessment` - 待评估
- `pending_visit` - 待看房
- `pending_decision` - 待决策
- `approved` - 已通过
- `rejected` - 已拒绝
- `converted` - 已转化

#### 跟进方式 (FollowUpMethod)
- `phone` - 电话
- `wechat` - 微信
- `visit` - 实地看房
- `other` - 其他

#### 发布状态 (PublishStatus)
- `草稿` - 草稿状态
- `发布` - 已发布

#### 营销项目状态 (MarketingProjectStatus)
- `在途` - 在途
- `在售` - 在售
- `已售` - 已售

### B. 数据类型说明

| 类型 | 说明 | 示例 |
|-----|------|-----|
| string | 字符串 | "文本" |
| int | 整数 | 123 |
| float | 浮点数 | 123.45 |
| decimal | 高精度小数(金额) | "500.00" |
| bool | 布尔值 | true/false |
| datetime | 日期时间 | "2024-01-01T00:00:00" |
| uuid | UUID字符串 | "550e8400-e29b-41d4-a716-446655440000" |

### C. 测试环境

| 服务 | 地址 | 账号 | 密码 |
|-----|------|-----|------|
| 后端API | http://127.0.0.1:8000 | admin | Fdd123.. |
| API文档 | http://127.0.0.1:8000/docs | - | - |
| 前端 | http://127.0.0.1:3000 | 同上 | 同上 |

---

**文档结束**
