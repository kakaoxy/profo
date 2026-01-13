# AGENTS.md - ProFo 房产数据中心开发指南

## 项目概述

**ProFo 房产数据中心**是一个全栈本地化应用，包含：

- **后端**: Python 3.10+ / FastAPI / SQLAlchemy / SQLite
- **前端**: Next.js 16 / TypeScript / shadcn/ui / Tailwind CSS 4
- **包管理**: 后端使用 `uv`，前端使用 `pnpm`

---

## 命令指南

### 后端命令 (backend/)

| 命令 | 说明 |
|------|------|
| `uv run pytest` | 运行所有测试 |
| `uv run pytest backend/tests/test_auth.py` | 运行单个测试文件 |
| `uv run pytest backend/tests/test_auth.py::test_login_success` | 运行单个测试用例 |
| `uv run python main.py` | 启动开发服务器 (端口8000) |
| `uv run python -m pytest -v` | 详细模式运行测试 |
| `uv run pytest --collect-only` | 列出所有测试用例 |

### 前端命令 (frontend/)

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发服务器 (端口3000) |
| `pnpm lint` | ESLint检查 |
| `pnpm build` | 生产构建 |
| `pnpm gen-api` | 从openapi.json生成API类型 |
| `pnpm lint --fix` | ESLint自动修复 |

---

## 后端规范 (Python / FastAPI)

### 导入顺序

```python
# 1. 标准库导入 (按字母排序)
import os
import sys
from typing import Optional

# 2. 第三方库导入 (按字母排序)
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

# 3. 本地模块导入 (相对路径优先)
from db import get_db
from models.user import User
from schemas.user import UserResponse
from services.auth_service import AuthService
from utils.auth import get_password_hash
```

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 变量/函数 | snake_case | `get_user_by_id`, `user_name` |
| 类名 | PascalCase | `UserService`, `ProjectValidator` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT`, `DEFAULT_PAGE_SIZE` |
| 私有方法/变量 | 前置下划线 | `_validate_input()`, `_cache_data` |
| 路由命名 | kebab-case | `/api/v1/users`, `/auth/login` |
| 数据库字段 | snake_case | `created_at`, `updated_at` |

### 类型提示

- 所有函数参数和返回值必须使用类型注解
- 使用 `Optional[T]` 而非 `Union[T, None]`
- 复杂类型使用 Pydantic Model 定义

```python
from typing import Optional
from pydantic import BaseModel

class UserCreate(BaseModel):
    username: str
    email: str
    password: str

async def create_user(
    user_data: UserCreate,
    db: Session = Depends(get_db)
) -> UserResponse:
    ...
```

### 异常处理

- 使用 `ProfoException` 处理业务逻辑异常 (定义在 `exceptions.py`)
- 使用 `HTTPException` 处理HTTP层异常
- 全局异常处理器已注册在 `error_handlers.py`

```python
from exceptions import ProfoException
from error_handlers import profo_exception_handler

# 抛出业务异常
if not user:
    raise ProfoException(
        code="USER_NOT_FOUND",
        message="用户不存在",
        status_code=404
    )
```

### 代码风格

- **行宽**: 100字符
- **引号**: 使用双引号 `"`
- **空行**: 函数定义后2空行，方法定义后1空行
- **docstring**: 使用中文，三引号包裹
- **单文件限制**: 新文件不超过200行，必要时拆分

---

## 前端规范 (TypeScript / Next.js)

### 导入顺序

```typescript
// 1. React 相关
import { useState, useEffect } from "react";
import { Suspense } from "react";

// 2. 第三方库 (按字母排序)
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

// 3. shadcn/ui 组件
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// 4. 路径别名导入 (按 @/* 后的路径排序)
import { fetchClient } from "@/lib/api-server";
import { cn } from "@/lib/utils";

// 5. 相对路径导入
import { ProjectStats } from "./_components/project-stats";
import { ProjectView } from "./_components/project-view";
```

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件 | PascalCase | `ProjectCard`, `UserTable` |
| 变量/函数 | camelCase | `userList`, `handleSubmit` |
| 常量 | UPPER_SNAKE_CASE | `MAX_PAGE_SIZE`, `DEFAULT_TIMEOUT` |
| 私有变量/函数 | 前置下划线 | `_formatDate()`, `_cachedData` |
| CSS类名 | kebab-case | `bg-slate-50`, `text-primary` |
| 文件名 | kebab-case | `project-card.tsx`, `user-dialog.tsx` |

### 类型定义

- 使用 TypeScript 严格模式
- 优先使用接口定义对象类型
- 避免使用 `any`，使用 `unknown` 配合类型守卫
- API 类型从 `src/lib/api-types.d.ts` 导入 (由 `pnpm gen-api` 生成)

```typescript
interface Project {
  id: number;
  name: string;
  status: "draft" | "active" | "completed";
  created_at: string;
}

interface ProjectListResponse {
  items: Project[];
  total: number;
  page: number;
  page_size: number;
}
```

### 组件模式

- 使用 shadcn/ui 基础组件 + CVA 变体
- 组件文件不超过150行，超出则拆分子组件
- 使用 `use client` 标记客户端组件
- 页面组件使用 `fetchClient` (服务端) 或 `openapi-fetch` (客户端)

```typescript
// Button 组件使用示例
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";

// 变体用法
<Button variant="destructive" size="sm">
  删除
</Button>
```

### 代码风格

- **引号**: 使用单引号 `'`
- **分号**: 必须使用
- **空行**: 逻辑块之间1空行
- **组件属性**: 多属性换行对齐
- **单文件限制**: 新文件不超过200行，拆分规则：

| 场景 | 拆分方式 |
|------|----------|
| 组件>150行 | `_components/` 子组件 |
| 复杂页面 | 按功能区域拆分组件 |
| 复用逻辑 | `hooks/` 或 `utils/` |

---

## Clean Code 通用准则

### 函数原则

- **单一职责**: 每个函数只做一件事
- **短小精悍**: 建议不超过20行
- **参数数量**: 最多3个，多则封装为对象
- **避免嵌套**: 嵌套层级不超过2层

### 命名原则

- **见名知意**: `getActiveUserList` 而非 `getData`
- **避免缩写**: `userPassword` 而非 `pwd`
- **一致性**: 同类命名保持相同模式

### 代码结构

```
新文件必须遵循:
├── 导入区 (严格排序)
├── 类型/常量定义
├── 主逻辑/组件
└── 导出 (如需要)
```

---

## 开发流程

1. **后端开发**: 在 `backend/` 编写路由、服务、模型
2. **前端开发**: 在 `frontend/src/` 编写页面和组件
3. **API变更**: 更新后端后运行 `pnpm gen-api` 生成类型
4. **测试**: 后端使用pytest，前端暂无单元测试要求
5. **提交**: 确保 `pnpm lint` 和 `uv run pytest` 通过

---

## 参考资源

- 后端接口文档: `openapi.json`
- 后端入口: `backend/main.py`
- 前端入口: `frontend/src/app/`
- 现有组件: `frontend/src/components/ui/`
