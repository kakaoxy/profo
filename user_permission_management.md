# 用户管理和权限管理系统文档

## 1. 系统概述

本系统采用基于角色的访问控制（RBAC）模型，实现了完整的用户管理和权限管理功能。系统支持三类用户角色，并为每类角色配置了明确的权限边界。

### 核心特性
- **RBAC权限模型**：严格遵循RBAC设计最佳实践
- **多角色支持**：管理员、运营人员、普通用户
- **细粒度权限控制**：基于权限的访问控制
- **JWT认证**：安全的令牌认证机制
- **微信登录集成**：支持微信网页登录和小程序登录
- **动态菜单**：根据用户权限动态显示导航菜单
- **API权限保护**：后端API路由权限控制

## 2. 角色定义与权限配置

### 2.1 角色列表

| 角色名称 | 角色代码 | 权限描述 | 权限范围 |
|---------|---------|---------|---------|
| 管理员 | admin | 拥有所有权限，包括用户管理、权限配置 | 所有功能 |
| 运营人员 | operator | 拥有数据修改权限，包括项目、房源的增删改查 | 数据查看、修改 |
| 普通用户 | user | 仅拥有数据查看权限 | 数据查看 |

### 2.2 权限列表

| 权限代码 | 权限描述 | 适用角色 |
|---------|---------|---------|
| view_data | 数据查看权限 | 所有角色 |
| edit_data | 数据修改权限 | 管理员、运营人员 |
| manage_users | 用户管理权限 | 管理员 |
| manage_roles | 角色管理权限 | 管理员 |

### 2.3 权限继承关系

- 管理员继承所有权限
- 运营人员继承普通用户的所有权限
- 普通用户仅拥有基础数据查看权限

## 3. 系统初始化

### 3.1 默认管理员用户

系统提供了初始化端点，用于创建默认角色和管理员用户：

**API端点**：`POST /api/users/init-data`
**权限要求**：管理员权限

### 3.2 初始化结果

执行初始化后，系统将创建以下默认数据：

#### 默认角色
- 管理员 (admin)
- 运营人员 (operator)
- 普通用户 (user)

#### 默认管理员用户
- **用户名**：admin
- **密码**：admin123
- **角色**：管理员
- **权限**：所有权限

### 3.3 手动初始化

如果系统未自动初始化，可通过以下方式手动执行：

```bash
# 方法1：通过API调用
curl -X POST http://localhost:8000/api/users/init-data

# 方法2：在系统中使用管理员账户登录后，在用户管理页面初始化
```

## 4. 用户管理

### 4.1 用户生命周期管理

#### 创建用户
- 路径：`POST /api/users/users`
- 权限：管理员
- 请求体：
  ```json
  {
    "username": "testuser",
    "password": "test123",
    "nickname": "测试用户",
    "role_id": "role_id",
    "status": "active"
  }
  ```

#### 查询用户列表
- 路径：`GET /api/users/users`
- 权限：管理员
- 支持筛选：用户名、昵称、角色ID、状态

#### 查询单个用户
- 路径：`GET /api/users/users/{user_id}`
- 权限：管理员

#### 更新用户信息
- 路径：`PUT /api/users/users/{user_id}`
- 权限：管理员
- 支持更新：昵称、角色、状态等

#### 删除用户
- 路径：`DELETE /api/users/users/{user_id}`
- 权限：管理员
- 限制：不能删除自己

#### 修改密码
- 路径：`POST /api/users/change-password`
- 权限：当前用户
- 请求体：
  ```json
  {
    "current_password": "old_password",
    "new_password": "new_password"
  }
  ```

## 5. 角色管理

### 5.1 角色生命周期管理

#### 创建角色
- 路径：`POST /api/users/roles`
- 权限：管理员
- 请求体：
  ```json
  {
    "name": "新角色",
    "code": "new_role",
    "description": "角色描述",
    "permissions": ["view_data", "edit_data"]
  }
  ```

#### 查询角色列表
- 路径：`GET /api/users/roles`
- 权限：管理员
- 支持筛选：角色名称、角色代码、是否激活

#### 查询单个角色
- 路径：`GET /api/users/roles/{role_id}`
- 权限：管理员

#### 更新角色信息
- 路径：`PUT /api/users/roles/{role_id}`
- 权限：管理员
- 支持更新：名称、描述、权限列表、状态

#### 删除角色
- 路径：`DELETE /api/users/roles/{role_id}`
- 权限：管理员
- 限制：角色下存在用户时，无法删除

## 6. 认证与登录

### 6.1 用户名密码登录

- 路径：`POST /api/auth/login`
- 请求体：
  ```json
  {
    "username": "admin",
    "password": "admin123"
  }
  ```
- 响应：
  ```json
  {
    "access_token": "jwt_token",
    "refresh_token": "refresh_token",
    "token_type": "bearer",
    "expires_in": 3600,
    "user": {
      "id": "user_id",
      "username": "admin",
      "role": {
        "id": "role_id",
        "code": "admin",
        "permissions": ["view_data", "edit_data", "manage_users", "manage_roles"]
      }
    }
  }
  ```

### 6.2 微信登录

#### 网页端微信登录
- 路径：`GET /api/auth/wechat/authorize`
- 回调路径：`GET /api/auth/wechat/callback`

#### 小程序微信登录
- 路径：`POST /api/auth/wechat/login`
- 请求体：
  ```json
  {
    "code": "wechat_code"
  }
  ```

### 6.3 令牌刷新

- 路径：`POST /api/auth/refresh`
- 请求体：
  ```json
  {
    "refresh_token": "refresh_token"
  }
  ```

## 7. 前端权限控制

### 7.1 路由守卫

系统使用Vue Router的导航守卫实现前端路由权限控制：

- **认证检查**：检查用户是否已登录
- **角色检查**：检查用户角色是否匹配路由要求
- **权限检查**：检查用户是否拥有路由所需权限

### 7.2 动态菜单生成

前端根据用户权限动态生成导航菜单：

- 管理员：显示所有菜单
- 运营人员：显示数据查看和修改相关菜单
- 普通用户：仅显示数据查看相关菜单

### 7.3 组件级权限控制

在组件内部，可以使用权限检查函数控制按钮或功能的显示：

```typescript
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()

// 检查是否有编辑权限
const canEdit = authStore.hasPermission('edit_data')

// 检查是否有管理权限
const canManage = authStore.hasRole('admin')
```

## 8. 后端权限控制

### 8.1 API路由保护

后端使用依赖注入和装饰器实现API路由权限保护：

```python
from dependencies.auth import get_current_admin_user, get_current_operator_user

@router.post("/projects")
async def create_project(
    project_data: ProjectCreate,
    current_user: User = Depends(get_current_operator_user)
):
    # 只有运营人员和管理员可以创建项目
    pass
```

### 8.2 权限装饰器

系统提供了多种权限装饰器：

- `@require_admin()`：要求管理员权限
- `@require_operator()`：要求运营人员或管理员权限
- `@require_view_data()`：要求数据查看权限
- `@require_edit_data()`：要求数据修改权限
- `@require_manage_users()`：要求用户管理权限
- `@require_manage_roles()`：要求角色管理权限

## 9. 安全最佳实践

### 9.1 密码安全

- 使用bcrypt算法进行密码哈希
- 密码长度至少8个字符
- 定期更换密码
- 避免使用弱密码

### 9.2 令牌安全

- 访问令牌有效期设置为30分钟
- 刷新令牌有效期设置为7天
- 令牌泄露后及时重置密码
- 使用HTTPS传输令牌

### 9.3 权限管理

- 最小权限原则：只授予用户必要的权限
- 定期审查用户权限
- 离职员工及时禁用账户
- 敏感操作记录日志

## 10. 系统集成与兼容性

### 10.1 小程序兼容性

- 支持微信小程序登录
- 支持小程序API调用
- 适配小程序端的权限控制

### 10.2 API文档

系统提供自动生成的API文档：
- Swagger UI：http://localhost:8000/docs
- ReDoc：http://localhost:8000/redoc

## 11. 常见问题与排查

### 11.1 忘记管理员密码

- 方法1：使用其他管理员账户重置密码
- 方法2：通过数据库直接修改密码哈希
- 方法3：删除现有管理员账户，重新初始化系统

### 11.2 权限不生效

- 检查用户角色是否正确
- 检查角色权限配置是否完整
- 检查API路由权限装饰器是否正确
- 检查前端路由元信息是否正确

### 11.3 微信登录失败

- 检查微信公众号/小程序配置
- 检查微信回调地址是否正确
- 检查网络连接

## 12. 初始化默认账户

### 12.1 默认管理员账户

系统初始化后，将自动创建以下管理员账户：

- **用户名**：admin
- **密码**：admin123
- **角色**：管理员
- **权限**：所有权限

### 12.2 首次登录建议

1. 使用默认账户登录系统
2. 立即修改默认密码
3. 根据需求创建其他用户和角色
4. 配置微信登录信息
5. 进行权限测试

## 13. 维护与更新

### 13.1 定期备份

- 定期备份数据库
- 备份用户权限配置
- 备份微信登录配置

### 13.2 系统更新

- 先备份数据
- 测试环境验证更新
- 生产环境更新
- 验证更新后功能正常

## 14. 联系方式

如有问题或建议，请联系系统管理员。

---

**文档版本**：v1.0
**更新日期**：2025-12-02
**适用系统**：Profo 房产数据中心
