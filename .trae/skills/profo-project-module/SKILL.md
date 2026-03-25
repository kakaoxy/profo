---
name: "profo-project-module"
description: "ProFo项目模块开发规范与最佳实践指南。Invoke when developing new business modules to ensure consistency with project architecture, coding standards, and design patterns established in the project module."
---

# ProFo Project Module 开发规范与最佳实践

本文档基于 Project 模块的开发实践，提炼出一套可复用的技术方案、编码规范和架构设计原则，为项目中其他模块的开发提供标准化指导。

## 一、架构设计原则

### 1.1 分层架构模式

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端层 (Next.js 16)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Server    │  │   Client    │  │   Server    │             │
│  │ Components  │  │ Components  │  │   Actions   │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        路由层 (Routers)                          │
│  - 参数校验、权限检查、依赖注入                                   │
│  - 禁止编写业务逻辑                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        服务层 (Services)                         │
│  - 核心业务逻辑实现                                               │
│  - 数据组装、事务管理                                             │
│  - 禁止进行权限校验                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        数据层 (Models/Schemas)                   │
│  - SQLAlchemy 模型定义                                            │
│  - Pydantic Schema 验证                                           │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 核心设计原则

| 原则 | 说明 | 示例 |
|-----|------|-----|
| **路由层只负责HTTP** | 路由层只做参数校验、权限检查、调用服务层 | `router.post()` 中直接调用 `service.create()` |
| **服务层处理业务** | 所有业务逻辑统一放在 services 目录 | `project_core.py` 中的 `create_project()` |
| **权限在路由层校验** | 通过 FastAPI Depends 注入权限检查 | `get_current_user` 依赖 |
| **禁止跨层JOIN** | 同层级表允许JOIN，跨层级必须软引用单独查询 | `channel_manager_id` 软引用 `users.id` |
| **逻辑删除** | 所有核心业务数据使用 `is_deleted` 字段 | `Project.is_deleted = Column(Boolean, default=False)` |

## 二、后端开发规范

### 2.1 项目目录结构

```
backend/
├── main.py                    # 应用入口
├── models/                    # 数据模型层
│   ├── base.py               # 基础模型、枚举定义
│   ├── project.py            # 项目相关模型
│   └── user.py               # 用户模型
├── schemas/                   # Pydantic Schema 层
│   ├── common.py             # 通用响应模型
│   ├── project_core.py       # 核心 Schema
│   ├── project_renovation.py # 装修 Schema
│   └── project_sales.py      # 销售 Schema
├── routers/                   # 路由层
│   ├── projects_simple.py    # 项目主路由
│   ├── projects_renovation.py
│   └── projects_sales.py
├── services/                  # 服务层
│   ├── project_core.py       # 核心服务
│   ├── project_renovation.py
│   └── project_sales.py
└── dependencies/              # 依赖注入
    └── projects.py
```

### 2.2 模型定义规范

#### 2.2.1 基础模型 (base.py)

```python
from sqlalchemy.orm import declarative_base
import enum
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime
import uuid

Base = declarative_base()

class BaseModel(Base):
    """基础模型，包含公共字段"""
    __abstract__ = True

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), 
                        onupdate=lambda: datetime.now(timezone.utc), nullable=False)
```

#### 2.2.2 枚举定义规范

```python
class ProjectStatus(str, enum.Enum):
    """项目主状态枚举 - 使用字符串而非整数"""
    SIGNING = "signing"      # 签约阶段
    RENOVATING = "renovating"  # 改造阶段
    SELLING = "selling"      # 在售阶段
    SOLD = "sold"           # 已售阶段
    DELETED = "deleted"     # 已删除
```

**规范要点：**
- ❌ 严禁使用整数存储状态字段
- ✅ 所有状态必须使用字符串枚举
- ✅ 枚举值使用小写 snake_case
- ✅ 添加中文注释说明业务含义

#### 2.2.3 模型字段定义

```python
class Project(BaseModel):
    """项目主表 - 仅保留核心基础信息"""
    __tablename__ = "projects"

    # 基本信息
    name = Column(String(700), nullable=False, comment="项目名称(自动生成:小区名称+地址)")
    community_name = Column(String(200), nullable=False, comment="小区名称")
    address = Column(String(500), nullable=False, comment="物业地址")

    # 状态字段 - 使用 values_callable 确保存储枚举值
    status = Column(
        SQLEnum(ProjectStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=ProjectStatus.SIGNING,
        comment="项目状态"
    )

    # 逻辑删除
    is_deleted = Column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    # 索引定义
    __table_args__ = (
        Index("idx_project_status", "status"),
        Index("idx_project_deleted", "is_deleted"),
    )
```

**规范要点：**
- ✅ 所有字段必须添加 `comment` 注释
- ✅ 字符串字段必须指定长度 `String(length)`
- ✅ 金额使用 `Numeric(15, 2)` 保证精度
- ✅ 跨层级关联使用软引用，不设置强制外键
- ✅ 合理创建索引，避免过多冗余索引

### 2.3 Schema 定义规范

#### 2.3.1 分层 Schema 设计

```python
# schemas/project_core.py
from pydantic import BaseModel, Field, ConfigDict
from decimal import Decimal

class ProjectBase(BaseModel):
    """项目基础字段"""
    community_name: Optional[str] = Field(None, max_length=200)
    address: Optional[str] = Field(None, max_length=500)
    area: Optional[Decimal] = Field(None, description="产证面积(m²)")
    
    model_config = ConfigDict(from_attributes=True)

class ProjectCreate(BaseModel):
    """创建项目请求模型"""
    # 基础信息 (projects 表)
    community_name: str = Field(..., max_length=200)
    address: str = Field(..., max_length=500)
    
    # 签约相关（会创建到 project_contracts 表）
    contract_no: str = Field(..., max_length=100)
    signing_price: Optional[Decimal] = Field(None)
    
    model_config = ConfigDict(from_attributes=True)

class ProjectUpdate(BaseModel):
    """更新项目请求模型 - 所有字段可选"""
    community_name: Optional[str] = Field(None, max_length=200)
    address: Optional[str] = Field(None, max_length=500)
    
    model_config = ConfigDict(from_attributes=True)

class ProjectResponse(BaseModel):
    """项目完整响应模型"""
    id: str
    name: Optional[str]
    status: str
    community_name: Optional[str]
    # ... 其他字段
    
    model_config = ConfigDict(from_attributes=True)
```

#### 2.3.2 Schema 聚合入口

```python
# schemas/project.py
"""项目管理相关Schema (聚合入口)"""

# 从子模块导入并重新导出
from .project_core import (
    ProjectBase, ProjectCreate, ProjectUpdate, ProjectResponse
)
from .project_renovation import (
    RenovationUpdate, RenovationPhotoResponse
)
from .project_sales import (
    SalesRecordCreate, SalesRecordResponse
)
```

### 2.4 路由层规范

```python
# routers/projects_simple.py
from fastapi import APIRouter, Depends, HTTPException, status
from services import ProjectService
from dependencies.projects import get_project_service
from schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse
from schemas.common import PaginatedResponse

router = APIRouter(prefix="/projects", tags=["projects"])

@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    project_data: ProjectCreate,
    service: ProjectService = Depends(get_project_service)
):
    """创建项目 - 直接返回 Pydantic 模型，不使用包装器"""
    project = service.create_project(project_data)
    return project

@router.get("", response_model=PaginatedResponse[ProjectResponse])
def get_projects(
    status: Optional[str] = Query(None, description="项目状态筛选"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    service: ProjectService = Depends(get_project_service)
):
    """获取项目列表 - 统一分页格式"""
    result = service.get_projects(status_filter=status, page=page, page_size=page_size)
    return PaginatedResponse(
        items=result["items"],
        total=result["total"],
        page=page,
        size=page_size
    )

@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: str = Path(..., description="项目ID"),
    service: ProjectService = Depends(get_project_service)
):
    """获取项目详情"""
    project = service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: str = Path(..., description="项目ID"),
    update_data: ProjectUpdate = ...,
    service: ProjectService = Depends(get_project_service)
):
    """更新项目信息"""
    project = service.update_project(project_id, update_data)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: str = Path(..., description="项目ID"),
    service: ProjectService = Depends(get_project_service)
):
    """删除项目"""
    service.delete_project(project_id)
    return None
```

**规范要点：**
- ✅ 成功响应直接返回 Pydantic 模型，不使用 `code`/`msg`/`data` 包装
- ✅ 错误响应使用 FastAPI 标准 HTTPException，格式为 `{"detail": "错误信息"}`
- ✅ 列表接口统一返回 `items`/`total`/`page`/`size` 结构
- ✅ 状态码规范：GET/PUT 成功返回 200，POST 成功返回 201，DELETE 成功返回 204
- ❌ 严禁在路由层编写业务逻辑

### 2.5 服务层规范

```python
# services/project_core.py
from sqlalchemy.orm import Session, selectinload
from fastapi import HTTPException, status

class ProjectCoreService:
    def __init__(self, db: Session):
        self.db = db

    def create_project(self, project_data: ProjectCreate) -> ProjectResponse:
        """创建项目，同时创建关联的子表记录"""
        project_id = str(uuid.uuid4())
        now = datetime.utcnow()

        # 1. 创建项目基础记录
        project = Project(
            id=project_id,
            community_name=project_data.community_name,
            address=project_data.address,
            status=ProjectStatus.SIGNING.value,
            is_deleted=False,
            created_at=now,
            updated_at=now,
        )
        project.name = project.generate_name()
        self.db.add(project)

        # 2. 创建合同记录
        contract = ProjectContract(
            id=str(uuid.uuid4()),
            project_id=project_id,
            contract_no=project_data.contract_no,
            is_deleted=False,
            created_at=now,
            updated_at=now,
        )
        self.db.add(contract)

        self.db.commit()
        self.db.refresh(project)

        return ProjectResponse.model_validate(self._build_project_response(project))

    def _build_project_response(self, project: Project) -> Dict[str, Any]:
        """将项目及其关联数据组合成响应字典"""
        response = {
            "id": project.id,
            "name": project.name,
            "status": project.status,
            # ... 基础字段
        }

        # 查询关联表数据
        contract = self.db.query(ProjectContract).filter(
            ProjectContract.project_id == project.id,
            ProjectContract.is_deleted == False
        ).first()
        if contract:
            response.update({
                "contract_no": contract.contract_no,
                "signing_price": float(contract.signing_price) if contract.signing_price else None,
            })

        return response
```

**规范要点：**
- ✅ 服务层处理所有业务逻辑
- ✅ 使用 `selectinload` 进行关联数据预加载
- ✅ 复杂查询拆分为多个简单查询，避免跨层JOIN
- ✅ 使用事务保证数据一致性
- ❌ 严禁在服务层进行权限校验

### 2.6 依赖注入规范

```python
# dependencies/projects.py
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from db import get_db

async def get_project_service(db: Session = Depends(get_db)) -> ProjectService:
    """获取项目服务实例"""
    return ProjectService(db)

async def get_current_project(
    project_id: str,
    db: Session = Depends(get_db)
) -> Project:
    """获取当前项目并验证存在性"""
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.is_deleted == False
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="项目不存在"
        )
    return project
```

## 三、前端开发规范

### 3.1 项目目录结构

```
frontend/src/app/(main)/projects/
├── page.tsx                          # 项目列表页 (Server Component)
├── actions/                          # Server Actions
│   ├── core.ts                       # 核心操作（CRUD）
│   ├── sales.ts                      # 销售相关操作
│   └── renovation.ts                 # 装修相关操作
├── types/                            # 类型定义
│   └── project.ts                    # 项目核心类型
├── _components/                      # 组件目录
│   ├── project-view.tsx              # 项目视图容器
│   ├── columns.tsx                   # 表格列定义
│   ├── create-project/               # 创建项目对话框
│   │   ├── index.tsx                 # 主组件
│   │   ├── schema.ts                 # 表单验证 Schema
│   │   └── tabs/                     # Tab 组件
│   └── project-detail/               # 项目详情
│       ├── index.tsx                 # 详情 Sheet
│       └── views/                    # 不同状态视图
└── [projectId]/                      # 动态路由
    └── cashflow/                     # 现金流管理
```

### 3.2 Server Actions 规范

```typescript
// actions/core.ts
"use server";

import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { components } from "@/lib/api-types";

type ProjectCreate = components["schemas"]["ProjectCreate"];
type ProjectUpdate = components["schemas"]["ProjectUpdate"];

/**
 * 创建项目
 */
export async function createProjectAction(data: ProjectCreate) {
  try {
    const client = await fetchClient();
    const { error } = await client.POST("/api/v1/projects", {
      body: data,
    });

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "创建项目失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/projects");
    return { success: true, message: "项目创建成功" };
  } catch (e) {
    console.error("创建项目异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 更新项目信息
 */
export async function updateProjectAction(id: string, data: ProjectUpdate) {
  try {
    const client = await fetchClient();
    const { error } = await client.PUT("/api/v1/projects/{project_id}", {
      params: { path: { project_id: id } },
      body: data,
    });

    if (error) {
      const errorMsg = (error as { detail?: string }).detail || "更新项目失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/projects");
    return { success: true, message: "项目更新成功" };
  } catch (e) {
    console.error("更新项目异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
```

**规范要点：**
- ✅ 使用 `"use server"` 标记 Server Actions
- ✅ 操作成功后调用 `revalidatePath()` 刷新缓存
- ✅ 统一返回 `{ success: boolean, message?: string }` 格式
- ✅ 错误处理包含网络错误和业务错误

### 3.3 类型定义规范

```typescript
// types/project.ts
import { components } from "@/lib/api-types";

// 从 openapi.json 自动生成的类型
export type ProjectResponse = components["schemas"]["ProjectResponse"];
export type ProjectCreate = components["schemas"]["ProjectCreate"];
export type ProjectUpdate = components["schemas"]["ProjectUpdate"];

// 前端业务类型
export interface Project {
  id: string;
  name: string;
  status: "signing" | "renovating" | "selling" | "sold";
  community_name?: string;
  address?: string;
  area?: number;
  // ... 其他字段
}

// 状态配置类型
export interface StatusConfig {
  label: string;
  color: string;
  icon: string;
  description: string;
}

export const STATUS_CONFIG: Record<string, StatusConfig> = {
  signing: {
    label: "签约",
    color: "blue",
    icon: "FileSignature",
    description: "与业主签订代理协议",
  },
  renovating: {
    label: "装修",
    color: "orange",
    icon: "Hammer",
    description: "房源改造装修阶段",
  },
  // ...
};
```

**规范要点：**
- ✅ API 类型通过 `openapi.json` 自动生成
- ❌ 严禁手动定义与后端不一致的 API 类型
- ✅ 前端业务类型与 API 类型分离

### 3.4 表单验证规范

```typescript
// _components/create-project/schema.ts
import { z } from "zod";

export const projectCreateSchema = z.object({
  // 基础信息
  community_name: z.string().min(1, "小区名称不能为空").max(200),
  address: z.string().min(1, "物业地址不能为空").max(500),
  area: z.coerce.number().positive("面积必须大于0").optional(),
  layout: z.string().max(50).optional(),
  orientation: z.string().max(50).optional(),

  // 签约信息
  contract_no: z.string().min(1, "合同编号不能为空").max(100),
  signing_price: z.coerce.number().positive().optional(),
  signing_date: z.string().optional(),
  signing_period: z.coerce.number().int().positive().optional(),

  // 业主信息
  owner_name: z.string().max(100).optional(),
  owner_phone: z.string().max(20).optional(),
  owner_id_card: z.string().max(18).optional(),
});

export type ProjectCreateFormData = z.infer<typeof projectCreateSchema>;
```

**规范要点：**
- ✅ 使用 Zod 进行表单验证
- ✅ 验证规则与后端 Pydantic 模型保持一致
- ❌ 严禁前后端表单验证规则不一致

### 3.5 Server Component 数据获取

```typescript
// page.tsx
import { fetchClient } from "@/lib/api-server";
import type { paths } from "@/lib/api-types";

export const dynamic = "force-dynamic";

type QueryParams = NonNullable<
  paths["/api/v1/projects"]["get"]["parameters"]["query"]
>;

type ProjectListResponse =
  paths["/api/v1/projects"]["get"]["responses"][200]["content"]["application/json"];

export default async function ProjectsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;

  const queryParams: QueryParams = {
    page: page,
    page_size: 20,
  };

  if (params.status && params.status !== "all") {
    queryParams.status = params.status;
  }

  const client = await fetchClient();

  const [statsRes, listRes] = await Promise.all([
    client.GET("/api/v1/projects/stats", {}),
    client.GET("/api/v1/projects", {
      params: { query: queryParams },
    }),
  ]);

  // 类型安全的数据提取
  const listData = listRes.data as ProjectListResponse | undefined;
  const projectData: Project[] = (listData?.items ?? []).map(mapProjectResponse);

  return (
    <div>
      <ProjectStats stats={stats} />
      <ProjectView data={projectData} total={total} />
    </div>
  );
}
```

**规范要点：**
- ✅ 使用 `export const dynamic = "force-dynamic"` 禁用静态生成
- ✅ 并行请求使用 `Promise.all()`
- ✅ 使用类型安全的 API 客户端

## 四、数据库设计规范

### 4.1 表结构设计原则

```sql
-- 项目主表
CREATE TABLE projects (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(700) NOT NULL COMMENT '项目名称',
    community_name VARCHAR(200) NOT NULL COMMENT '小区名称',
    address VARCHAR(500) NOT NULL COMMENT '物业地址',
    area NUMERIC(10,2) COMMENT '产证面积(m²)',
    status VARCHAR(20) NOT NULL COMMENT '项目状态',
    is_deleted BOOLEAN DEFAULT FALSE COMMENT '逻辑删除标记',
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

-- 合同表 - 与项目一对一
CREATE TABLE project_contracts (
    id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) NOT NULL UNIQUE COMMENT '项目ID',
    contract_no VARCHAR(100) COMMENT '合同编号',
    signing_price NUMERIC(15,2) COMMENT '签约价格(万)',
    is_deleted BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (project_id) REFERENCES projects(id)
);
```

**规范要点：**
- ✅ 所有表和字段必须添加注释
- ✅ 核心业务数据使用 `is_deleted` 字段做逻辑删除
- ✅ 金额字段使用 `NUMERIC(15,2)` 保证精度
- ✅ 一对一关系添加 `UNIQUE` 约束
- ❌ 严禁使用 JSON 类型存储结构化、可搜索的数据
- ❌ 严禁跨层级设置强制外键约束

### 4.2 索引设计原则

```python
# 索引定义示例
__table_args__ = (
    # 项目状态查询索引
    Index("idx_project_status", "status"),
    # 逻辑删除索引
    Index("idx_project_deleted", "is_deleted"),
    # 复合索引 - 最常用的查询组合
    Index("idx_project_status_community", "status", "community_name"),
    # 唯一索引
    Index("idx_contract_no", "contract_no", unique=True),
)
```

**规范要点：**
- ✅ 为经常查询的字段创建索引
- ✅ 为外键字段创建索引
- ❌ 严禁在大表上创建过多冗余索引
- ❌ 严禁在低基数字段上创建无效索引

## 五、API 设计规范

### 5.1 RESTful API 规范

| 方法 | 路径 | 功能 | 状态码 |
|-----|------|-----|-------|
| GET | `/api/v1/projects` | 获取项目列表 | 200 |
| POST | `/api/v1/projects` | 创建项目 | 201 |
| GET | `/api/v1/projects/{id}` | 获取项目详情 | 200 |
| PUT | `/api/v1/projects/{id}` | 更新项目 | 200 |
| DELETE | `/api/v1/projects/{id}` | 删除项目 | 204 |
| PUT | `/api/v1/projects/{id}/status` | 更新状态 | 200 |
| GET | `/api/v1/projects/stats` | 获取统计 | 200 |

### 5.2 响应格式规范

**成功响应 (单个对象):**
```json
{
  "id": "uuid-string",
  "name": "项目名称",
  "status": "signing",
  "created_at": "2024-01-15T10:00:00",
  "updated_at": "2024-01-15T10:00:00"
}
```

**成功响应 (列表):**
```json
{
  "items": [...],
  "total": 50,
  "page": 1,
  "size": 20
}
```

**错误响应:**
```json
{
  "detail": "错误信息描述"
}
```

### 5.3 分页参数规范

```python
page: int = Query(1, ge=1, description="页码")
page_size: int = Query(50, ge=1, le=200, description="每页数量")
```

## 六、性能优化策略

### 6.1 数据库查询优化

```python
# 使用 selectinload 预加载关联数据
from sqlalchemy.orm import selectinload

query = query.options(
    selectinload(Project.contract),
    selectinload(Project.owners),
    selectinload(Project.sale),
)

# 使用 defer 延迟加载大字段
query = query.options(defer(Project.large_content))

# 分页查询
projects = query.order_by(Project.created_at.desc()) \
    .offset((page - 1) * page_size) \
    .limit(page_size) \
    .all()
```

### 6.2 前端性能优化

```typescript
// 使用 React.memo 避免不必要的重渲染
export const ProjectCard = React.memo(function ProjectCard({ project }: Props) {
  // ...
});

// 使用 useMemo 缓存计算结果
const filteredProjects = useMemo(() => {
  return projects.filter(p => p.status === selectedStatus);
}, [projects, selectedStatus]);

// 使用 useCallback 缓存回调函数
const handleUpdate = useCallback(async (data: ProjectUpdate) => {
  await updateProjectAction(project.id, data);
}, [project.id]);
```

## 七、常见问题解决方案

### 7.1 日期处理

```python
# 统一日期解析函数
def parse_date_string(value: Union[str, datetime, None]) -> Optional[datetime]:
    """解析日期字符串为 datetime 对象
    支持格式: YYYY-MM-DD, ISO 格式字符串, 或 datetime 对象
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        # YYYY-MM-DD 格式
        if len(value) == 10 and value.count('-') == 2:
            try:
                year, month, day = map(int, value.split('-'))
                return datetime(year, month, day)
            except ValueError:
                pass
        # ISO 格式
        try:
            return datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError:
            pass
    return None
```

### 7.2 软引用验证

```python
# 在模型中定义验证方法
class ProjectSale(BaseModel):
    channel_manager_id = Column(String(36), nullable=True, comment="渠道负责人ID(软引用)")

    def validate_user_references(self, db) -> None:
        """验证软引用的用户ID是否存在且有效"""
        if self.channel_manager_id:
            user = db.query(User).filter(
                User.id == self.channel_manager_id,
                User.status == "active"
            ).first()
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"无效的渠道负责人ID: {self.channel_manager_id}"
                )
```

### 7.3 状态流转验证

```python
def _validate_status_transition(self, current_status: str, new_status: str) -> None:
    """验证状态流转合法性"""
    # 特殊规则：只限制除了在售状态外，其他状态不能切换到已售状态
    if new_status == ProjectStatus.SOLD.value and \
       current_status != ProjectStatus.SELLING.value and \
       current_status != ProjectStatus.SOLD.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="只有在售或已售状态才能切换到已售状态"
        )
```

## 八、开发检查清单

### 8.1 后端开发检查清单

- [ ] 模型字段是否添加了 comment 注释
- [ ] 状态字段是否使用字符串枚举而非整数
- [ ] 是否使用了逻辑删除而非物理删除
- [ ] 路由层是否只处理 HTTP 相关逻辑
- [ ] 业务逻辑是否统一放在服务层
- [ ] API 响应是否符合规范（无包装器、标准错误格式）
- [ ] 是否使用了正确的 HTTP 状态码
- [ ] 列表接口是否返回统一分页格式
- [ ] 跨层级关联是否使用软引用
- [ ] 文件是否超过 250 行

### 8.2 前端开发检查清单

- [ ] API 类型是否通过 openapi.json 自动生成
- [ ] 表单验证规则是否与后端一致
- [ ] Server Actions 是否使用了 `"use server"`
- [ ] 操作成功后是否调用了 `revalidatePath()`
- [ ] 是否使用了类型安全的 API 客户端
- [ ] 组件是否按功能合理拆分
- [ ] 是否避免了不必要的全局状态管理

## 九、参考文档

- [project.md](/docs/project.md) - Project 模块产品文档
- [AGENTS.md](/AGENTS.md) - 项目开发规范与反模式清单
- [API 文档](http://localhost:8000/docs) - Swagger UI (开发环境)
