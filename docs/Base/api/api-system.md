# ProFo 系统管理模块 API 文档

> 基础路径：`/api/v1`
> 认证方式：Bearer Token（`Authorization: Bearer <access_token>`）

---

## 目录

- [1. 认证管理](#1-认证管理)
  - [1.1 POST /auth/token](#11-post-authtoken)
  - [1.2 POST /auth/login](#12-post-authlogin)
  - [1.3 POST /auth/refresh](#13-post-authrefresh)
  - [1.4 GET /auth/wechat/authorize](#14-get-authwechatauthorize)
  - [1.5 GET /auth/wechat/callback](#15-get-authwechatcallback)
  - [1.6 POST /auth/exchange-token](#16-post-authexchange-token)
  - [1.7 POST /auth/wechat/login](#17-post-authwechatlogin)
  - [1.8 GET /auth/me](#18-get-authme)
  - [1.9 POST /auth/api-key](#19-post-authapi-key)
  - [1.10 GET /auth/api-key](#110-get-authapi-key)
  - [1.11 DELETE /auth/api-key](#111-delete-authapi-key)
- [2. 用户管理](#2-用户管理)
  - [2.1 GET /users/](#21-get-users)
  - [2.2 GET /users/simple](#22-get-userssimple)
  - [2.3 GET /users/me](#23-get-usersme)
  - [2.4 GET /users/{user_id}](#24-get-usersuser_id)
  - [2.5 POST /users/](#25-post-users)
  - [2.6 PUT /users/{user_id}](#26-put-usersuser_id)
  - [2.7 PUT /users/{user_id}/reset-password](#27-put-usersuser_idreset-password)
  - [2.8 DELETE /users/{user_id}](#28-delete-usersuser_id)
  - [2.9 POST /users/change-password](#29-post-userschange-password)
  - [2.10 POST /users/init-data](#210-post-usersinit-data)
- [3. 角色管理](#3-角色管理)
  - [3.1 GET /roles/](#31-get-roles)
  - [3.2 GET /roles/{role_id}](#32-get-rolesrole_id)
  - [3.3 POST /roles/](#33-post-roles)
  - [3.4 PUT /roles/{role_id}](#34-put-rolesrole_id)
  - [3.5 DELETE /roles/{role_id}](#35-delete-rolesrole_id)
- [4. Schema 定义](#4-schema-定义)
- [5. 错误码表](#5-错误码表)

---

## 1. 认证管理

路由文件：`backend/routers/system/auth.py`
前缀：`/auth`

### 1.1 POST /auth/token

OAuth2 兼容的 token 获取接口。适用于 OAuth2 标准客户端。

- **速率限制**：5 次/分钟
- **认证**：无需

**请求体**（`application/x-www-form-urlencoded`）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 用户名 |
| password | string | 是 | 密码 |

**成功响应** `200`：

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 1800,
  "user": {
    "id": "1",
    "username": "admin",
    "nickname": "管理员",
    "phone": null,
    "avatar": null,
    "role_id": "1",
    "role": {
      "id": "1",
      "name": "管理员",
      "code": "admin",
      "description": "系统管理员",
      "permissions": ["*"],
      "is_active": true,
      "created_at": "2025-01-01T00:00:00",
      "updated_at": "2025-01-01T00:00:00"
    },
    "status": "active",
    "last_login_at": "2025-06-01T10:30:00",
    "created_at": "2025-01-01T00:00:00",
    "updated_at": "2025-06-01T10:30:00"
  }
}
```

**首次登录需修改密码** `403`：

```json
{
  "code": "HTTP_403",
  "message": "首次登录必须修改密码",
  "temp_token": "temp_abc123..."
}
```

> 响应头包含 `X-Must-Change-Password: true`

---

### 1.2 POST /auth/login

用户名密码登录。

- **速率限制**：5 次/分钟
- **认证**：无需

**请求体**（`application/json`）：

```json
{
  "username": "admin",
  "password": "Fdd123.."
}
```

**成功响应** `200`：

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 1800,
  "user": {
    "id": "1",
    "username": "admin",
    "nickname": "管理员",
    "phone": null,
    "avatar": null,
    "role_id": "1",
    "role": {
      "id": "1",
      "name": "管理员",
      "code": "admin",
      "description": "系统管理员",
      "permissions": ["*"],
      "is_active": true,
      "created_at": "2025-01-01T00:00:00",
      "updated_at": "2025-01-01T00:00:00"
    },
    "status": "active",
    "last_login_at": "2025-06-01T10:30:00",
    "created_at": "2025-01-01T00:00:00",
    "updated_at": "2025-06-01T10:30:00"
  }
}
```

---

### 1.3 POST /auth/refresh

刷新令牌。

- **速率限制**：10 次/分钟
- **认证**：无需

**请求体**：

```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**成功响应** `200`：

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...(新)",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...(新)",
  "token_type": "bearer",
  "expires_in": 1800,
  "user": {
    "id": "1",
    "username": "admin",
    "nickname": "管理员",
    "phone": null,
    "avatar": null,
    "role_id": "1",
    "role": {
      "id": "1",
      "name": "管理员",
      "code": "admin",
      "description": "系统管理员",
      "permissions": ["*"],
      "is_active": true,
      "created_at": "2025-01-01T00:00:00",
      "updated_at": "2025-01-01T00:00:00"
    },
    "status": "active",
    "last_login_at": "2025-06-01T10:30:00",
    "created_at": "2025-01-01T00:00:00",
    "updated_at": "2025-06-01T10:30:00"
  }
}
```

---

### 1.4 GET /auth/wechat/authorize

生成微信登录授权 URL。

- **认证**：无需

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| redirect_uri | string | 否 | 重定向 URL |

**成功响应** `200`：

```json
{
  "auth_url": "https://open.weixin.qq.com/connect/qrconnect?appid=...&redirect_uri=...&response_type=code&scope=snsapi_login&state=..."
}
```

---

### 1.5 GET /auth/wechat/callback

微信授权回调。由微信服务器重定向调用，前端不应直接调用。

- **认证**：无需

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| code | string | 是 | 微信授权码 |
| state | string | 是 | 状态参数 |

**成功响应** `302`：

重定向到前端页面，URL 格式：`http://localhost:3000/login?code=<一次性授权码>`

---

### 1.6 POST /auth/exchange-token

用一次性授权码兑换 Token。用于微信登录回调后的前端换取 Token。

- **速率限制**：10 次/分钟
- **认证**：无需

**请求体**：

```json
{
  "code": "abc123def456"
}
```

**成功响应** `200`：

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 1800
}
```

> 注意：此接口响应不包含 `user` 字段，与其他 Token 接口格式不同。

---

### 1.7 POST /auth/wechat/login

微信小程序登录。

- **速率限制**：5 次/分钟
- **认证**：无需

**请求体**：

```json
{
  "code": "wx_miniapp_code_xxx"
}
```

**成功响应** `200`：

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 1800,
  "user": {
    "id": "2",
    "username": "wechat_user_abc",
    "nickname": "微信用户",
    "phone": null,
    "avatar": "https://thirdwx.qlogo.cn/...",
    "role_id": "2",
    "role": {
      "id": "2",
      "name": "普通用户",
      "code": "user",
      "description": "普通用户",
      "permissions": ["read"],
      "is_active": true,
      "created_at": "2025-01-01T00:00:00",
      "updated_at": "2025-01-01T00:00:00"
    },
    "status": "active",
    "last_login_at": null,
    "created_at": "2025-06-01T12:00:00",
    "updated_at": "2025-06-01T12:00:00"
  }
}
```

---

### 1.8 GET /auth/me

获取当前用户信息。

- **认证**：需要（Bearer Token）

**成功响应** `200`：

```json
{
  "id": "1",
  "username": "admin",
  "nickname": "管理员",
  "phone": "13800138000",
  "avatar": null,
  "role_id": "1",
  "role": {
    "id": "1",
    "name": "管理员",
    "code": "admin",
    "description": "系统管理员",
    "permissions": ["*"],
    "is_active": true,
    "created_at": "2025-01-01T00:00:00",
    "updated_at": "2025-01-01T00:00:00"
  },
  "status": "active",
  "last_login_at": "2025-06-01T10:30:00",
  "created_at": "2025-01-01T00:00:00",
  "updated_at": "2025-06-01T10:30:00"
}
```

---

### 1.9 POST /auth/api-key

生成新的 API Key。每个用户只能有一个有效 Key，生成新 Key 会自动撤销旧 Key。Key 仅显示一次，请妥善保存。

- **认证**：需要（Bearer Token）

**成功响应** `200`：

```json
{
  "api_key": "pk_live_abc123def456ghi789...",
  "prefix": "pk_live_abc",
  "created_at": "2025-06-01T10:30:00",
  "expires_at": null
}
```

---

### 1.10 GET /auth/api-key

获取当前用户的 API Key 信息。不返回完整的 Key，只返回前缀和状态信息。

- **认证**：需要（Bearer Token）

**成功响应** `200`（已有 Key）：

```json
{
  "id": "1",
  "prefix": "pk_live_abc",
  "status": "active",
  "created_at": "2025-06-01T10:30:00",
  "last_used_at": "2025-06-15T08:00:00",
  "expires_at": null
}
```

**成功响应** `200`（无 Key）：

```json
null
```

---

### 1.11 DELETE /auth/api-key

撤销当前用户的 API Key。

- **速率限制**：20 次/小时
- **认证**：需要（Bearer Token）

**成功响应** `204`：无内容

---

## 2. 用户管理

路由文件：`backend/routers/system/users.py`
前缀：`/users`

### 2.1 GET /users/

获取用户列表，支持搜索和筛选。需要 admin 角色。

- **速率限制**：60 次/分钟
- **认证**：需要 admin 角色

**查询参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| username | string | 否 | - | 用户名搜索 |
| nickname | string | 否 | - | 昵称搜索 |
| role_id | string | 否 | - | 角色 ID 筛选 |
| status | string | 否 | - | 用户状态筛选 |
| page | int | 否 | 1 | 页码（≥1） |
| page_size | int | 否 | 50 | 每页数量（1-200） |

**成功响应** `200`：

```json
{
  "items": [
    {
      "id": "1",
      "username": "admin",
      "nickname": "管理员",
      "phone": "13800138000",
      "avatar": null,
      "role_id": "1",
      "role": {
        "id": "1",
        "name": "管理员",
        "code": "admin",
        "description": "系统管理员",
        "permissions": ["*"],
        "is_active": true,
        "created_at": "2025-01-01T00:00:00",
        "updated_at": "2025-01-01T00:00:00"
      },
      "status": "active",
      "last_login_at": "2025-06-01T10:30:00",
      "created_at": "2025-01-01T00:00:00",
      "updated_at": "2025-06-01T10:30:00"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 50
}
```

---

### 2.2 GET /users/simple

获取简化用户列表（仅包含 ID 和昵称），用于下拉选择。需要内部用户角色。

- **认证**：需要内部用户角色

**查询参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| nickname | string | 否 | - | 昵称搜索 |
| status | string | 否 | "active" | 用户状态筛选 |
| page | int | 否 | 1 | 页码（≥1） |
| page_size | int | 否 | 100 | 每页数量（1-500） |

**成功响应** `200`：

```json
{
  "items": [
    {
      "id": "1",
      "nickname": "管理员",
      "username": "admin"
    },
    {
      "id": "2",
      "nickname": "张三",
      "username": "zhangsan"
    }
  ],
  "total": 2,
  "page": 1,
  "page_size": 100
}
```

---

### 2.3 GET /users/me

获取当前登录用户信息。需要活跃用户。

- **认证**：需要活跃用户（Bearer Token）

**成功响应** `200`：

```json
{
  "id": "1",
  "username": "admin",
  "nickname": "管理员",
  "phone": "13800138000",
  "avatar": null,
  "role_id": "1",
  "role": {
    "id": "1",
    "name": "管理员",
    "code": "admin",
    "description": "系统管理员",
    "permissions": ["*"],
    "is_active": true,
    "created_at": "2025-01-01T00:00:00",
    "updated_at": "2025-01-01T00:00:00"
  },
  "status": "active",
  "last_login_at": "2025-06-01T10:30:00",
  "created_at": "2025-01-01T00:00:00",
  "updated_at": "2025-06-01T10:30:00"
}
```

---

### 2.4 GET /users/{user_id}

获取指定用户信息。需要 admin 角色。

- **认证**：需要 admin 角色

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| user_id | string | 用户 ID |

**成功响应** `200`：

```json
{
  "id": "2",
  "username": "zhangsan",
  "nickname": "张三",
  "phone": "13900139000",
  "avatar": null,
  "role_id": "2",
  "role": {
    "id": "2",
    "name": "普通用户",
    "code": "user",
    "description": "普通用户",
    "permissions": ["read"],
    "is_active": true,
    "created_at": "2025-01-01T00:00:00",
    "updated_at": "2025-01-01T00:00:00"
  },
  "status": "active",
  "last_login_at": null,
  "created_at": "2025-03-15T08:00:00",
  "updated_at": "2025-03-15T08:00:00"
}
```

---

### 2.5 POST /users/

创建新用户。需要 admin 角色。

- **速率限制**：10 次/小时
- **认证**：需要 admin 角色

**请求体**：

```json
{
  "username": "newuser",
  "nickname": "新用户",
  "phone": "13700137000",
  "avatar": null,
  "password": "SecurePass123",
  "role_id": "2"
}
```

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| username | string | 是 | 3-100 字符 | 用户名 |
| nickname | string | 否 | 最多 100 字符 | 昵称 |
| phone | string | 否 | 最多 20 字符 | 手机号 |
| avatar | string | 否 | 最多 500 字符 | 头像 |
| password | string | 是 | 6-255 字符 | 密码 |
| role_id | string | 是 | - | 角色 ID |

**成功响应** `201`：

```json
{
  "id": "3",
  "username": "newuser",
  "nickname": "新用户",
  "phone": "13700137000",
  "avatar": null,
  "role_id": "2",
  "role": {
    "id": "2",
    "name": "普通用户",
    "code": "user",
    "description": "普通用户",
    "permissions": ["read"],
    "is_active": true,
    "created_at": "2025-01-01T00:00:00",
    "updated_at": "2025-01-01T00:00:00"
  },
  "status": "active",
  "last_login_at": null,
  "created_at": "2025-06-01T12:00:00",
  "updated_at": "2025-06-01T12:00:00"
}
```

---

### 2.6 PUT /users/{user_id}

更新用户信息。需要 admin 角色。

- **速率限制**：100 次/小时
- **认证**：需要 admin 角色

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| user_id | string | 用户 ID |

**请求体**：

```json
{
  "nickname": "张三丰",
  "phone": "13900139999",
  "avatar": null,
  "role_id": "3",
  "status": "active"
}
```

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| nickname | string | 否 | 最多 100 字符 | 昵称 |
| phone | string | 否 | 最多 20 字符 | 手机号 |
| avatar | string | 否 | 最多 500 字符 | 头像 |
| role_id | string | 否 | - | 角色 ID |
| status | string | 否 | - | 用户状态 |

**成功响应** `200`：

```json
{
  "id": "2",
  "username": "zhangsan",
  "nickname": "张三丰",
  "phone": "13900139999",
  "avatar": null,
  "role_id": "3",
  "role": {
    "id": "3",
    "name": "编辑",
    "code": "editor",
    "description": "内容编辑",
    "permissions": ["read", "write"],
    "is_active": true,
    "created_at": "2025-01-01T00:00:00",
    "updated_at": "2025-01-01T00:00:00"
  },
  "status": "active",
  "last_login_at": null,
  "created_at": "2025-03-15T08:00:00",
  "updated_at": "2025-06-01T14:00:00"
}
```

---

### 2.7 PUT /users/{user_id}/reset-password

重置用户密码。需要 admin 角色。

- **速率限制**：5 次/小时
- **认证**：需要 admin 角色

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| user_id | string | 用户 ID |

**请求体**：

```json
{
  "password": "NewSecurePass123"
}
```

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| password | string | 是 | 8-255 字符 | 新密码 |

**成功响应** `200`：

```json
{
  "message": "密码重置成功"
}
```

---

### 2.8 DELETE /users/{user_id}

删除用户。需要 admin 角色。

- **速率限制**：20 次/小时
- **认证**：需要 admin 角色

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| user_id | string | 用户 ID |

**成功响应** `204`：无内容

---

### 2.9 POST /users/change-password

修改当前用户密码。需要活跃用户。

- **速率限制**：3 次/分钟
- **认证**：需要活跃用户（Bearer Token）

**请求体**：

```json
{
  "current_password": "OldPass123",
  "new_password": "NewSecurePass456"
}
```

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| current_password | string | 是 | - | 当前密码 |
| new_password | string | 是 | 8-255 字符 | 新密码 |

**成功响应** `200`：

```json
{
  "message": "密码修改成功"
}
```

---

### 2.10 POST /users/init-data

初始化系统数据，包括默认角色和管理员用户。

- **速率限制**：3 次/小时
- **认证**：无需

**成功响应** `200`：

```json
{
  "message": "系统数据初始化完成",
  "roles_created": 3,
  "admin_created": true
}
```

---

## 3. 角色管理

路由文件：`backend/routers/system/roles.py`
前缀：`/roles`

> 所有角色管理接口均需要 admin 角色。

### 3.1 GET /roles/

获取角色列表，支持搜索和筛选。

- **认证**：需要 admin 角色

**查询参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| name | string | 否 | - | 角色名称搜索 |
| code | string | 否 | - | 角色代码搜索 |
| is_active | bool | 否 | - | 是否激活筛选 |
| page | int | 否 | 1 | 页码（≥1） |
| page_size | int | 否 | 50 | 每页数量（1-200） |

**成功响应** `200`：

```json
{
  "items": [
    {
      "id": "1",
      "name": "管理员",
      "code": "admin",
      "description": "系统管理员",
      "permissions": ["*"],
      "is_active": true,
      "created_at": "2025-01-01T00:00:00",
      "updated_at": "2025-01-01T00:00:00"
    },
    {
      "id": "2",
      "name": "普通用户",
      "code": "user",
      "description": "普通用户",
      "permissions": ["read"],
      "is_active": true,
      "created_at": "2025-01-01T00:00:00",
      "updated_at": "2025-01-01T00:00:00"
    }
  ],
  "total": 2,
  "page": 1,
  "page_size": 50
}
```

---

### 3.2 GET /roles/{role_id}

获取指定角色信息。

- **认证**：需要 admin 角色

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| role_id | string | 角色 ID |

**成功响应** `200`：

```json
{
  "id": "1",
  "name": "管理员",
  "code": "admin",
  "description": "系统管理员",
  "permissions": ["*"],
  "is_active": true,
  "created_at": "2025-01-01T00:00:00",
  "updated_at": "2025-01-01T00:00:00"
}
```

---

### 3.3 POST /roles/

创建新角色。

- **认证**：需要 admin 角色

**请求体**：

```json
{
  "name": "编辑",
  "code": "editor",
  "description": "内容编辑角色",
  "permissions": ["read", "write"]
}
```

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| name | string | 是 | 2-100 字符 | 角色名称 |
| code | string | 是 | 2-50 字符 | 角色代码 |
| description | string | 否 | - | 角色描述 |
| permissions | string[] | 否 | - | 权限列表 |

**成功响应** `200`：

```json
{
  "id": "3",
  "name": "编辑",
  "code": "editor",
  "description": "内容编辑角色",
  "permissions": ["read", "write"],
  "is_active": true,
  "created_at": "2025-06-01T12:00:00",
  "updated_at": "2025-06-01T12:00:00"
}
```

---

### 3.4 PUT /roles/{role_id}

更新角色信息。

- **速率限制**：100 次/小时
- **认证**：需要 admin 角色

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| role_id | string | 角色 ID |

**请求体**：

```json
{
  "name": "高级编辑",
  "description": "高级内容编辑角色",
  "permissions": ["read", "write", "publish"],
  "is_active": true
}
```

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| name | string | 否 | 2-100 字符 | 角色名称 |
| code | string | 否 | 2-50 字符 | 角色代码 |
| description | string | 否 | - | 角色描述 |
| permissions | string[] | 否 | - | 权限列表 |
| is_active | bool | 否 | - | 是否激活 |

**成功响应** `200`：

```json
{
  "id": "3",
  "name": "高级编辑",
  "code": "editor",
  "description": "高级内容编辑角色",
  "permissions": ["read", "write", "publish"],
  "is_active": true,
  "created_at": "2025-06-01T12:00:00",
  "updated_at": "2025-06-01T14:00:00"
}
```

---

### 3.5 DELETE /roles/{role_id}

删除角色。

- **速率限制**：20 次/小时
- **认证**：需要 admin 角色

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| role_id | string | 角色 ID |

**成功响应** `204`：无内容

---

## 4. Schema 定义

### 认证相关

#### LoginRequest

```json
{
  "username": "string",
  "password": "string"
}
```

#### TokenResponse

```json
{
  "access_token": "string",
  "refresh_token": "string",
  "token_type": "string",
  "expires_in": 0,
  "user": "UserResponse"
}
```

#### RefreshTokenRequest

```json
{
  "refresh_token": "string"
}
```

#### WechatLoginRequest

```json
{
  "code": "string"
}
```

#### WechatAuthUrlResponse

```json
{
  "auth_url": "string"
}
```

#### ExchangeTokenRequest

```json
{
  "code": "string"
}
```

### 用户相关

#### UserCreate

```json
{
  "username": "string (3-100字符)",
  "nickname": "string | null (最多100字符)",
  "phone": "string | null (最多20字符)",
  "avatar": "string | null (最多500字符)",
  "password": "string (6-255字符)",
  "role_id": "string (必填)"
}
```

#### UserUpdate

```json
{
  "nickname": "string | null (最多100字符)",
  "phone": "string | null (最多20字符)",
  "avatar": "string | null (最多500字符)",
  "role_id": "string | null",
  "status": "string | null"
}
```

#### UserResponse

```json
{
  "id": "string",
  "username": "string",
  "nickname": "string | null",
  "phone": "string | null",
  "avatar": "string | null",
  "role_id": "string",
  "role": "RoleResponse",
  "status": "string",
  "last_login_at": "datetime | null",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

#### UserListResponse

```json
{
  "items": ["UserResponse"],
  "total": 0,
  "page": 1,
  "page_size": 50
}
```

#### UserSimpleResponse

```json
{
  "id": "string",
  "nickname": "string | null",
  "username": "string"
}
```

#### UserSimpleListResponse

```json
{
  "items": ["UserSimpleResponse"],
  "total": 0,
  "page": 1,
  "page_size": 100
}
```

#### PasswordChange

```json
{
  "current_password": "string",
  "new_password": "string (8-255字符)"
}
```

#### PasswordResetRequest

```json
{
  "password": "string (8-255字符)"
}
```

### 角色相关

#### RoleCreate

```json
{
  "name": "string (2-100字符)",
  "code": "string (2-50字符)",
  "description": "string | null",
  "permissions": ["string"] | null
}
```

#### RoleUpdate

```json
{
  "name": "string | null (2-100字符)",
  "code": "string | null (2-50字符)",
  "description": "string | null",
  "permissions": ["string"] | null,
  "is_active": "bool | null"
}
```

#### RoleResponse

```json
{
  "id": "string",
  "name": "string",
  "code": "string",
  "description": "string | null",
  "permissions": ["string"] | null,
  "is_active": "bool",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

#### RoleListResponse

```json
{
  "items": ["RoleResponse"],
  "total": 0,
  "page": 1,
  "page_size": 50
}
```

### API Key 相关

#### ApiKeyCreateResponse

```json
{
  "api_key": "string (仅显示一次)",
  "prefix": "string",
  "created_at": "datetime",
  "expires_at": "datetime | null"
}
```

#### ApiKeyInfoResponse

```json
{
  "id": "string",
  "prefix": "string",
  "status": "string",
  "created_at": "datetime",
  "last_used_at": "datetime | null",
  "expires_at": "datetime | null"
}
```

---

## 5. 错误码表

### HTTP 状态码

| 状态码 | 含义 | 触发场景 |
|--------|------|----------|
| 200 | 成功 | 请求成功 |
| 201 | 已创建 | 创建用户成功 |
| 204 | 无内容 | 删除操作成功 |
| 302 | 重定向 | 微信授权回调重定向到前端 |
| 400 | 请求错误 | 请求参数验证失败 |
| 401 | 未认证 | Token 无效/过期、用户名密码错误 |
| 403 | 禁止访问 | 首次登录需修改密码、权限不足 |
| 404 | 未找到 | 用户/角色/API Key 不存在 |
| 422 | 验证失败 | 请求体字段校验不通过 |
| 429 | 请求过多 | 触发速率限制 |
| 500 | 服务器错误 | 系统数据初始化失败等内部错误 |

### 业务错误详情

#### 认证模块

| 场景 | HTTP 状态码 | 错误信息 |
|------|-------------|----------|
| 用户名或密码错误 | 401 | 认证失败相关消息 |
| 首次登录需修改密码 | 403 | `{"code":"HTTP_403","message":"首次登录必须修改密码","temp_token":"..."}` |
| Token 刷新失败 | 401 | 认证失败相关消息 |
| 授权码兑换失败 | 401 | 认证失败相关消息 |
| API Key 不存在 | 404 | 资源未找到相关消息 |

#### 用户模块

| 场景 | HTTP 状态码 | 错误信息 |
|------|-------------|----------|
| 用户不存在 | 404 | "用户不存在" |
| 当前密码错误 | 400 | 密码验证失败相关消息 |
| 用户名已存在 | 400 | 用户名冲突相关消息 |
| 系统数据初始化失败 | 500 | 错误详情 |

#### 角色模块

| 场景 | HTTP 状态码 | 错误信息 |
|------|-------------|----------|
| 角色不存在 | 404 | "角色不存在" |
| 角色代码已存在 | 400 | 角色代码冲突相关消息 |

### 速率限制汇总

| 接口 | 限制 |
|------|------|
| POST /auth/token | 5 次/分钟 |
| POST /auth/login | 5 次/分钟 |
| POST /auth/refresh | 10 次/分钟 |
| POST /auth/exchange-token | 10 次/分钟 |
| POST /auth/wechat/login | 5 次/分钟 |
| DELETE /auth/api-key | 20 次/小时 |
| GET /users/ | 60 次/分钟 |
| POST /users/ | 10 次/小时 |
| PUT /users/{user_id} | 100 次/小时 |
| PUT /users/{user_id}/reset-password | 5 次/小时 |
| DELETE /users/{user_id} | 20 次/小时 |
| POST /users/change-password | 3 次/分钟 |
| POST /users/init-data | 3 次/小时 |
| PUT /roles/{role_id} | 100 次/小时 |
| DELETE /roles/{role_id} | 20 次/小时 |
| 全局默认 | 200 次/天，50 次/小时 |
