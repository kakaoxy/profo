# ProFo 房地产翻新与销售管理系统

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.1.7-black?style=flat-square&logo=next.js" />
  <img src="https://img.shields.io/badge/React-19.2.1-61DAFB?style=flat-square&logo=react" />
  <img src="https://img.shields.io/badge/FastAPI-0.104+-009688?style=flat-square&logo=fastapi" />
  <img src="https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python" />
  <img src="https://img.shields.io/badge/TailwindCSS-4.1+-38B2AC?style=flat-square&logo=tailwind-css" />
</p>

<p align="center">
  <b>轻量级、本地化、高性能的房产数据仓库系统</b>
</p>

---

## 📋 目录

1. [项目概述](#项目概述)
2. [技术架构全景图](#技术架构全景图)
3. [环境搭建指南](#环境搭建指南)
4. [开发规范](#开发规范)
5. [API接口文档](#API接口文档)
6. [数据库设计说明](#数据库设计说明)
7. [核心业务流程解析](#核心业务流程解析)
8. [常见问题解决方案](#常见问题解决方案)
9. [后续迭代规划](#后续迭代规划)

---

## 🏠 项目概述

### 项目背景

ProFo是一个面向房地产翻新与销售业务的全流程管理系统，采用**四层业务领域架构**设计，实现了从市场情报采集到营销展示的全链路数据管理。

### 核心功能

| 模块 | 功能描述 | 业务层级 |
|------|---------|---------|
| **L1 市场情报层** | 小区信息管理、房源市场数据、价格变动记录 | 数据基准 |
| **L2 线索管理层** | 房源线索创建、跟进、评估与筛选 | 漏斗瓶颈 |
| **L3 项目管理层** | 合同管理、装修管控、销售跟进、财务记录 | 核心ERP |
| **L4 营销层** | 房源营销展示、历史案例作品集 | 门面展示 |

### 技术亮点

- 🚀 **Next.js 16 + React 19** - 最新前端技术栈，支持React Compiler
- ⚡ **FastAPI + SQLAlchemy 2.0** - 高性能异步Python后端
- 🎨 **TailwindCSS v4 + Radix UI** - 现代化UI组件库
- 🔐 **JWT + OAuth2** - 企业级认证授权方案
- 📊 **四层领域架构** - 清晰的业务边界和数据流转
- 🔄 **写时复制(CoW)** - 层级间数据同步机制

---

## 🏗️ 技术架构全景图

### 系统整体架构

```mermaid
graph TB
    subgraph "前端层 Frontend"
        A[Next.js 16 App Router]
        B[React 19 + React Compiler]
        C[TailwindCSS v4]
        D[Radix UI + Shadcn]
        E[SWR Data Fetching]
    end

    subgraph "API网关层"
        F[FastAPI]
        G[JWT Auth]
        H[Rate Limiter]
        I[CORS Middleware]
    end

    subgraph "业务逻辑层 Backend"
        J[Routers]
        K[Services]
        L[Models]
        M[Schemas]
    end

    subgraph "数据存储层"
        N[(SQLite/PostgreSQL)]
        O[Static Files]
    end

    A --> F
    B --> F
    F --> G
    G --> J
    J --> K
    K --> L
    L --> N
    F --> O
```

### 四层业务领域架构

```mermaid
graph TB
    subgraph "L4 市场营销层"
        L4[l4_marketing_projects - CMS]
        L4D[角色: 门面与作品集]
        L4F[职责: 房源营销展示<br/>历史案例作品集]
    end

    subgraph "L3 项目管理层"
        L3[projects - 核心ERP]
        L3D[角色: 工厂]
        L3F[职责: 合同管理<br/>装修管控<br/>销售跟进<br/>财务记录]
    end

    subgraph "L2 线索管理层"
        L2[leads - 筛选器]
        L2D[角色: 漏斗瓶颈]
        L2F[职责: 房源线索创建<br/>跟进、评估与筛选]
    end

    subgraph "L1 市场情报层"
        L1[property_current - 参考基准]
        L1D[角色: 参考基准]
        L1F[职责: 小区信息管理<br/>房源市场数据<br/>价格变动记录]
    end

    L1 -.->|写时复制| L2
    L2 -.->|写时复制| L3
    L3 -.->|写时复制| L4
```

### 前端架构详解

#### 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js | 16.1.7 | React框架，App Router |
| React | 19.2.1 | UI库，React Compiler优化 |
| TypeScript | 5.9.3 | 类型安全 |
| TailwindCSS | 4.1.18 | 原子化CSS框架 |
| Radix UI | 1.4.3 | 无障碍UI组件基础 |
| SWR | 2.4.1 | 数据获取与缓存 |
| Zod | 4.3.6 | 运行时类型校验 |
| React Hook Form | 7.71.1 | 表单状态管理 |

#### 组件架构

```
frontend/src/
├── app/                    # Next.js App Router
│   ├── (main)/            # 主布局路由组
│   │   ├── _components/   # 主布局共享组件
│   │   │   ├── leads-table.tsx
│   │   │   └── stat-card.tsx
│   │   ├── _lib/          # 主布局共享工具
│   │   ├── projects/      # 项目管理模块
│   │   │   ├── [projectId]/  # 项目详情路由
│   │   │   │   └── cashflow/ # 现金流模块
│   │   │   ├── _components/  # 项目共享组件
│   │   │   │   ├── create-project/  # 创建项目组件
│   │   │   │   ├── monitor/        # 监控大屏组件
│   │   │   │   └── project-detail/ # 项目详情组件
│   │   │   ├── actions/     # 项目相关API actions
│   │   │   └── types/       # 项目类型定义
│   │   ├── leads/         # 线索管理模块
│   │   │   ├── _components/  # 线索共享组件
│   │   │   │   ├── add-lead-parts/   # 添加线索组件
│   │   │   │   └── drawer-parts/     # 抽屉组件
│   │   │   ├── actions/    # 线索相关API actions
│   │   │   ├── constants/  # 常量配置
│   │   │   └── hooks/      # 线索模块hooks
│   │   ├── l4-marketing/  # 营销管理模块
│   │   │   ├── projects/
│   │   │   │   ├── [id]/   # 营销项目详情
│   │   │   │   │   ├── _components/  # 详情页组件
│   │   │   │   │   ├── edit/         # 编辑页面
│   │   │   │   │   └── preview/      # 预览页面
│   │   │   │   └── _components/
│   │   │   │       ├── common/       # 通用组件
│   │   │   │       ├── detail/       # 详情组件
│   │   │   │       ├── photo-manager/# 照片管理组件
│   │   │   │       ├── project-form/ # 项目表单组件
│   │   │   │       └── project-selector/ # 项目选择器
│   │   │   └── actions/    # 营销相关API actions
│   │   ├── properties/    # 房源管理模块
│   │   │   ├── _components/  # 房源共享组件
│   │   │   ├── governance/    # 房源治理模块
│   │   │   ├── upload/       # 房源上传模块
│   │   │   └── actions.ts    # 房源API actions
│   │   └── users/         # 用户管理模块
│   │       ├── _components/  # 用户共享组件
│   │       ├── roles/        # 角色管理
│   │       └── actions/      # 用户API actions
│   │   └── layout.tsx     # 主布局
│   ├── api/               # Next.js API路由
│   │   └── auth/          # 认证相关API
│   │       └── refresh/    # Token刷新
│   ├── login/             # 登录页面
│   │   ├── actions.ts     # 登录actions
│   │   └── refresh-action.ts
│   ├── layout.tsx         # 根布局
│   └── globals.css        # 全局样式
├── components/            # 组件目录
│   ├── ui/                # shadcn/ui组件
│   ├── app-sidebar.tsx    # 应用侧边栏
│   ├── error-boundary.tsx # 错误边界
│   └── swr-provider.tsx   # SWR提供者
├── lib/                   # 核心代码
│   ├── api-client.ts      # API客户端（浏览器端）
│   ├── api-server.ts      # API客户端（服务端）
│   ├── api-helpers.ts     # API辅助函数
│   ├── api-upload.ts      # API上传工具
│   ├── api-types.d.ts     # OpenAPI生成类型
│   ├── config.ts          # 应用配置
│   ├── error-utils.ts     # 错误处理工具
│   ├── file-utils.ts      # 文件处理工具
│   ├── formatters.ts      # 格式化工具
│   ├── media-utils.ts     # 媒体处理工具
│   ├── token-refresh-server.ts # Token刷新（服务端）
│   ├── action-result.ts   # Action结果类型
│   └── utils.ts           # 通用工具函数
├── hooks/                 # 自定义Hooks
│   └── use-mobile.ts      # 移动端检测Hook
├── test/                  # 测试目录
│   └── setup.ts           # 测试配置
└── proxy.ts               # Next.js中间件代理
```

#### 状态管理方案

```mermaid
graph LR
    subgraph "状态管理"
        A[Server State<br/>SWR]
        B[Form State<br/>React Hook Form]
        C[UI State<br/>React useState]
        D[URL State<br/>nuqs]
    end

    A --> E[API Data Caching]
    B --> F[Form Validation<br/>Zod Schema]
    C --> G[Local UI State]
    D --> H[Query Parameters]
```

### 后端架构详解

#### 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| FastAPI | 0.104+ | 高性能Web框架 |
| SQLAlchemy | 2.0+ | ORM数据库操作 |
| Pydantic | v2 | 数据模型与校验 |
| Uvicorn | 0.24+ | ASGI服务器 |
| Alembic | 1.17+ | 数据库迁移 |
| Passlib | - | 密码哈希 |
| Python-JOSE | - | JWT实现 |

#### 服务分层架构

服务层按业务领域模块化组织，每个领域（Domain）包含独立的业务逻辑：

```
backend/
├── routers/              # API路由层
│   ├── projects_simple.py      # 项目路由
│   ├── projects_renovation.py # 装修路由
│   ├── projects_sales.py      # 销售路由
│   ├── leads.py               # 线索路由
│   ├── l4_marketing.py        # 营销路由
│   ├── l4_marketing_import.py # 营销导入路由
│   ├── auth.py                # 认证路由
│   ├── users.py               # 用户路由
│   ├── roles.py               # 角色路由
│   ├── files.py               # 文件路由
│   ├── upload.py              # 上传路由
│   ├── cashflow_simple.py     # 现金流路由
│   ├── properties.py          # 房源路由
│   ├── admin.py               # 管理后台路由
│   ├── monitor.py             # 监控路由
│   └── push.py                # 推送路由
├── services/             # 业务逻辑层（按领域模块化）
│   ├── __init__.py           # 服务层统一入口，聚合导出所有服务
│   ├── market/               # 市场情报服务（原L1）
│   │   ├── query.py              # 房源查询服务
│   │   ├── importer.py           # 数据导入服务
│   │   ├── batch_importer.py     # CSV批量导入
│   │   ├── merger.py             # 小区合并服务
│   │   └── parser.py             # 楼层解析工具
│   ├── leads/                # 线索管理服务（原L2，预留）
│   ├── projects/             # 项目管理服务（原L3）
│   │   ├── facade.py             # 外观服务（向后兼容）
│   │   ├── core.py               # 项目核心服务
│   │   ├── renovation.py         # 装修阶段服务
│   │   ├── sales.py              # 销售跟进服务
│   │   ├── finance.py            # 财务管理服务
│   │   └── internal/             # 内部组件
│   │       ├── query.py          # 项目查询逻辑
│   │       ├── builder.py        # 响应构建器
│   │       └── state.py          # 状态管理器
│   ├── marketing/            # 市场营销服务（原L4）
│   │   ├── project.py            # 营销项目管理
│   │   ├── import_service.py     # L3项目导入
│   │   └── query.py              # 营销查询服务
│   ├── monitor/              # 市场监控服务
│   │   └── service.py            # 监控服务
│   ├── system/               # 系统服务
│   │   ├── auth.py               # 认证服务
│   │   ├── user.py               # 用户服务
│   │   ├── role.py               # 角色服务
│   │   └── error.py              # 错误记录服务
│   └── utils/                # 服务工具
│       └── date_parser.py        # 日期解析工具

##### 服务使用方式

```python
# 方式1：统一入口导入（推荐）
from services import (
    # Market 模块
    PropertyQueryService,
    PropertyImporter,
    CommunityMerger,
    FloorParser,
    # Projects 模块
    ProjectService,          # Facade聚合服务
    ProjectCoreService,
    RenovationService,
    SalesService,
    FinanceService,
    CashFlowService,
    # Marketing 模块
    MarketingProjectService,
    MarketingImportService,
    # System 模块
    AuthService,
    UserService,
    RoleService,
    # Monitor 模块
    MonitorService,
)

# 方式2：按需从子模块导入
from services.market import PropertyQueryService, PropertyImporter
from services.projects import ProjectService, ProjectCoreService
from services.marketing import MarketingProjectService
from services.system import AuthService, UserService
from services.monitor import MonitorService
```

##### 服务模块职责说明

| 模块 | 业务层级 | 职责描述 | 主要服务 |
|------|----------|----------|----------|
| `market` | L1 | 市场情报管理 | 房源查询、数据导入、小区合并、楼层解析 |
| `leads` | L2 | 线索管理（预留） | 线索创建、跟进、评估与筛选 |
| `projects` | L3 | 项目核心ERP | 项目管理、装修管控、销售跟进、财务记录 |
| `marketing` | L4 | 营销展示 | 营销项目、媒体管理、作品集展示 |
| `monitor` | - | 市场监控 | 竞品分析、趋势监控 |
| `system` | - | 系统服务 | 认证授权、用户管理、角色权限、错误记录 |

```

├── models/                    # 数据模型层（按业务领域模块化组织）
│   ├── __init__.py            # 模型包统一入口，聚合导出所有模型
│   ├── common/                # 基础模块
│   │   ├── __init__.py        # 基础模块入口，导出Base、枚举类型
│   │   └── base.py            # 基础模型和枚举定义（Base, BaseModel, PropertyStatus等）
│   ├── lead/                  # 线索管理模块（L2）
│   │   ├── __init__.py        # 线索模块入口
│   │   └── lead.py            # 线索模型（Lead, LeadFollowUp, LeadPriceHistory）
│   ├── marketing/             # 市场营销模块（L4）
│   │   ├── __init__.py        # 营销模块入口
│   │   └── l4_marketing.py    # 营销模型（L4MarketingProject, L4MarketingMedia等）
│   ├── project/               # 项目管理模块（L3）
│   │   ├── __init__.py        # 项目模块入口，聚合导出所有项目相关模型
│   │   ├── project.py         # 项目主模型及统一导出
│   │   ├── _project_base.py   # 项目基础模型（Project）
│   │   ├── _project_contract.py   # 项目合同模型（ProjectContract）
│   │   ├── _project_owner.py      # 项目业主模型（ProjectOwner）
│   │   ├── _project_sale.py       # 项目销售模型（ProjectSale）
│   │   ├── _project_followup.py   # 项目跟进模型（ProjectFollowUp）
│   │   ├── _project_interaction.py    # 项目互动模型（ProjectInteraction, ProjectEvaluation）
│   │   ├── _project_finance.py    # 项目财务模型（FinanceRecord）
│   │   ├── _project_status_log.py # 项目状态日志模型（ProjectStatusLog）
│   │   ├── _project_renovation.py # 项目装修模型（ProjectRenovation, RenovationPhoto）
│   ├── property/              # 房源信息模块（L1）
│   │   ├── __init__.py        # 房源模块入口
│   │   ├── community.py       # 小区模型（Community, CommunityAlias, CommunityCompetitor）
│   │   ├── property.py        # 房源模型（PropertyCurrent, PropertyHistory）
│   │   └── media.py           # 房源媒体模型（PropertyMedia）
│   ├── system/                # 系统模块
│   │   ├── __init__.py        # 系统模块入口
│   │   └── error.py           # 错误记录模型（FailedRecord）
│   └── user/                  # 用户权限模块
│       ├── __init__.py        # 用户模块入口
│       └── user.py            # 用户模型（User, Role）
├── schemas/              # Pydantic模型
│   ├── __init__.py            # Schema包入口
│   ├── common.py              # 通用Schema (分页响应、楼层解析等)
│   ├── enums.py               # 枚举定义 (房源状态、媒体类型等)
│   ├── response.py            # 统一API响应模型
│   ├── upload.py              # 上传和导入相关Schema
│   ├── project/               # 项目相关Schema包
│   │   ├── __init__.py        # 聚合导出所有项目Schema
│   │   ├── core.py            # 项目核心CRUD Schema
│   │   ├── contract.py        # 合同Schema
│   │   ├── owner.py           # 业主Schema
│   │   ├── renovation.py      # 装修Schema
│   │   ├── sales.py           # 销售Schema (含互动记录)
│   │   ├── finance.py         # 财务Schema
│   │   ├── followup.py        # 跟进记录Schema
│   │   ├── evaluation.py      # 评估Schema
│   │   └── status_log.py      # 状态日志Schema
│   ├── property/              # 房源相关Schema包
│   │   ├── __init__.py        # 聚合导出所有房源Schema
│   │   ├── core.py            # 房源核心接收模型
│   │   └── response.py        # 房源响应模型
│   ├── lead/                  # 线索相关Schema包
│   │   └── __init__.py        # 线索、跟进、价格历史Schema
│   ├── user/                  # 用户相关Schema包
│   │   └── __init__.py        # 用户、角色、认证Schema
│   ├── community/             # 小区相关Schema包
│   │   └── __init__.py        # 小区响应、合并、字典Schema
│   ├── monitor/               # 监控相关Schema包
│   │   └── __init__.py        # 市场情绪、趋势、竞品、AI策略Schema
│   └── l4_marketing/          # L4市场营销Schema包
│       ├── __init__.py        # 聚合导出所有L4 Schema
│       ├── project.py         # 营销项目Schema
│       ├── media.py           # 营销媒体Schema
│       ├── query.py           # 查询和响应Schema
│       ├── import_schemas.py  # L3项目导入Schema
│       └── enums.py           # L4枚举定义 (发布状态、媒体类型等)
├── dependencies/         # 依赖注入
│   ├── auth.py                # 认证依赖
│   └── projects.py            # 项目依赖
├── utils/                # 工具函数
│   ├── auth.py                # 认证工具
│   ├── permission.py          # 权限工具
│   ├── query_params.py        # 查询参数工具
│   ├── jwt_validator.py       # JWT验证器
│   ├── param_parser.py        # 参数解析器
│   └── error_formatters.py    # 错误格式化
├── scripts/              # 运维脚本
│   └── audit_db.py           # 数据库审计脚本
├── tests/                # 测试目录
│   ├── test_api.py
│   ├── test_auth.py
│   ├── test_projects.py
│   ├── test_leads.py
│   ├── test_l4_marketing.py
│   ├── test_cashflow.py
│   ├── test_detail_response.py
│   ├── test_importer.py
│   ├── test_l4_marketing_import.py
│   ├── test_l4_marketing_service.py
│   ├── test_monitor_api.py
│   ├── test_status_flow.py
│   ├── test_upload.py
│   ├── test_users_refactor.py
│   ├── test_date_normalization.py
│   ├── test_exceptions.py
│   ├── test_param_parser.py
│   ├── test_parser.py
│   ├── test_query_params.py
│   └── test_internal_api_permissions.py
├── common.py             # 通用配置（限流器等）
├── conftest.py           # 测试配置
├── error_handlers.py     # 全局错误处理
├── exceptions.py         # 自定义异常
├── main.py               # 应用入口
├── settings.py           # 配置管理
├── db.py                 # 数据库连接
├── alembic.ini           # Alembic配置
└── pyproject.toml        # 项目配置
```

### 数据库架构详解

#### 数据库配置

```python
# 支持SQLite（开发）和PostgreSQL（生产）
# SQLite配置（默认）
DATABASE_URL = "sqlite:///./data.db"

# PostgreSQL配置（生产环境）
DATABASE_URL = "postgresql://user:password@localhost/profo"
```

#### 连接池优化

```python
engine = create_engine(
    settings.database_url,
    echo=settings.database_echo,
    connect_args={
        "check_same_thread": False,  # SQLite 特定配置
        "timeout": 30,               # 连接超时
    },
    poolclass=StaticPool,            # 使用静态连接池（SQLite多线程支持）
    pool_pre_ping=True,              # 连接有效性检查
    execution_options={
        "compiled_cache": {},        # 启用编译缓存以提高查询性能
    }
)
```

---

## 🚀 环境搭建指南

### 开发环境要求

| 环境 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | >= 20 | 前端运行环境 |
| pnpm | >= 9 | 包管理器 |
| Python | >= 3.10 | 后端运行环境 |
| SQLite | - | 默认数据库 |

### 一键初始化（推荐）

我们提供了跨平台的一键初始化脚本，自动完成环境配置、依赖安装和数据库初始化：

**Windows:**
```powershell
# 使用 PowerShell 或 CMD 执行
.\init.bat
```

**macOS/Linux:**
```bash
# 添加执行权限并运行
chmod +x init.sh
./init.sh
```

**初始化脚本将自动完成以下步骤：**

1. ✅ 检查 Python 版本 (>= 3.10)
2. ✅ 安装/检查 uv 包管理器
3. ✅ 安装/检查 pnpm 包管理器
4. ✅ 创建后端 `.env` 配置文件（自动生成 JWT 密钥）
5. ✅ 创建前端 `.env.local` 配置文件
6. ✅ 安装后端 Python 依赖
7. ✅ 安装前端 Node.js 依赖
8. ✅ 初始化数据库表结构
9. ✅ 创建默认管理员账号

**初始化完成后：**

```bash
# 1. 启动后端服务
cd backend && uv run uvicorn main:app --reload

# 2. 启动前端服务（新终端）
cd frontend && pnpm dev
```

**默认管理员账号：**
- 用户名: `admin`
- 密码: `admin123`
- 角色: 管理员

---

### 手动安装步骤

如果一键初始化不适合你的环境，可以按以下步骤手动安装：

### 前端启动步骤

```bash
# 1. 进入前端目录
cd frontend

# 2. 安装依赖
pnpm install

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 配置 API 地址

# 4. 启动开发服务器
pnpm dev

# 前端访问地址: http://localhost:3000
```

### 后端启动步骤

```bash
# 1. 进入后端目录
cd backend

# 2. 安装uv（如果未安装）
# Windows:
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
# macOS/Linux:
curl -LsSf https://astral.sh/uv/install.sh | sh

# 3. 创建虚拟环境
uv venv

# 4. 激活虚拟环境
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# 5. 安装依赖
uv pip install -e .

# 6. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，设置必要配置：
# - JWT_SECRET_KEY（必填）
# - WECHAT_APPID（必填，微信登录用）
# - WECHAT_SECRET（必填，微信登录用）

# 7. 初始化数据库
uv run python init_db.py

# 8. 初始化系统数据（创建默认管理员）
uv run python init_admin.py

# 9. 启动开发服务器
uv run python main.py

# 后端API地址: http://127.0.0.1:8000
# API文档: http://127.0.0.1:8000/docs
```

### 数据库初始化

```bash
# 初始化数据库表结构
uv run python init_db.py

# 初始化系统数据（默认角色和管理员）
uv run python init_admin.py

# 使用Alembic进行数据库迁移
uv run alembic upgrade head
```

### 测试账号

```
账号: admin
密码: admin123
```

---

## 📐 开发规范

### 代码规范

#### Python代码规范

- 遵循 **PEP 8** 编码规范
- 使用 **Black** 进行代码格式化
- 使用 **Ruff** 进行代码检查
- 函数行数不超过 **250行**
- 使用类型提示（Type Hints）

```python
# 示例：带类型提示的函数
def get_project_by_id(
    db: Session,
    project_id: str
) -> Optional[Project]:
    """通过ID获取项目"""
    return db.query(Project).filter(Project.id == project_id).first()
```

#### TypeScript代码规范

- 使用 **ESLint** 进行代码检查
- 显式声明类型，避免使用 `any`
- 组件文件使用 **PascalCase** 命名
- 工具函数使用 **camelCase** 命名

```typescript
// 示例：类型定义
interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  createdAt: Date;
}

// 示例：组件定义
export function ProjectCard({ project }: { project: Project }) {
  return <div>{project.name}</div>;
}
```

### 提交规范

使用 **Conventional Commits** 规范：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**类型说明：**

| 类型 | 说明 |
|------|------|
| feat | 新功能 |
| fix | Bug修复 |
| docs | 文档更新 |
| style | 代码格式调整 |
| refactor | 代码重构 |
| test | 测试相关 |
| chore | 构建/工具相关 |

**示例：**

```bash
feat(projects): 添加项目导出功能

- 支持CSV格式导出
- 添加导出进度提示
- 支持按状态筛选导出

Closes #123
```

### 分支管理规范

```
main                 # 生产分支
├── develop          # 开发分支
├── feature/xxx      # 功能分支
├── bugfix/xxx       # Bug修复分支
└── hotfix/xxx       # 热修复分支
```

**工作流程：**

1. 从 `develop` 创建功能分支
2. 开发完成后提交PR到 `develop`
3. 代码审查通过后合并
4. 定期从 `develop` 合并到 `main`

### API设计规范

#### RESTful API规范

```
GET    /api/v1/projects          # 列表查询
POST   /api/v1/projects          # 创建资源
GET    /api/v1/projects/{id}     # 详情查询
PUT    /api/v1/projects/{id}     # 更新资源
DELETE /api/v1/projects/{id}     # 删除资源
```

#### 响应格式

**成功响应：**

```json
{
  "id": "uuid",
  "name": "项目名称",
  "created_at": "2024-01-01T00:00:00"
}
```

**错误响应：**

```json
{
  "detail": "错误描述信息"
}
```

#### HTTP状态码

| 状态码 | 使用场景 |
|-------|---------|
| 200 | GET/PUT成功 |
| 201 | POST创建成功 |
| 204 | DELETE删除成功 |
| 400 | 请求参数错误 |
| 401 | 未认证或Token无效 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 422 | 验证失败 |

---

## 🔌 API接口文档

### 认证模块

#### 1. 用户登录

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

**响应：**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 36000,
  "user": {
    "id": "uuid",
    "username": "admin",
    "nickname": "管理员",
    "role": { "code": "admin", "name": "管理员" }
  }
}
```

#### 2. 获取当前用户

```http
GET /api/v1/auth/me
Authorization: Bearer {access_token}
```

### 项目管理模块

#### 1. 获取项目列表

```http
GET /api/v1/projects?page=1&page_size=20&status=signing
Authorization: Bearer {access_token}
```

**响应：**

```json
{
  "items": [
    {
      "id": "uuid",
      "name": "项目名称",
      "status": "signing",
      "community_name": "小区名称",
      "address": "物业地址",
      "area": "100.00",
      "contract_no": "HT2024001",
      "signing_price": "500.00"
    }
  ],
  "total": 100,
  "page": 1,
  "size": 20
}
```

#### 2. 创建项目

```http
POST /api/v1/projects
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "community_name": "小区名称",
  "address": "物业地址",
  "area": "100.50",
  "layout": "三室两厅",
  "contract_no": "HT2024001",
  "signing_price": "500.00",
  "owner_name": "业主姓名"
}
```

#### 3. 更新项目状态

```http
PUT /api/v1/projects/{id}/status
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "status": "selling",
  "list_price": "550.00"
}
```

### 线索管理模块

#### 1. 获取线索列表

```http
GET /api/v1/leads?page=1&page_size=20&status=pending_assessment
Authorization: Bearer {access_token}
```

#### 2. 创建线索

```http
POST /api/v1/leads
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "community_name": "小区名称",
  "layout": "三室两厅",
  "area": 100.5,
  "total_price": 500.0,
  "status": "pending_assessment"
}
```

#### 3. 添加跟进记录

```http
POST /api/v1/leads/{id}/follow-ups
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "method": "phone",
  "content": "跟进内容描述"
}
```

### 营销管理模块 (L4)

#### 1. 获取营销项目列表

```http
GET /api/v1/admin/l4-marketing/projects?page=1&page_size=20
Authorization: Bearer {access_token}
```

#### 2. 创建营销项目

```http
POST /api/v1/admin/l4-marketing/projects
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "community_id": 1,
  "layout": "三室两厅",
  "area": "100.50",
  "total_price": "500.00",
  "title": "营销标题",
  "publish_status": "draft"
}
```

#### 3. 添加媒体文件

```http
POST /api/v1/admin/l4-marketing/projects/{id}/media
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "media_type": "image",
  "file_url": "https://...",
  "description": "图片描述"
}
```

### 完整API端点列表

| 模块 | 端点 | 方法 | 描述 |
|------|------|------|------|
| 认证 | /api/v1/auth/login | POST | 用户登录 |
| 认证 | /api/v1/auth/refresh | POST | 刷新Token |
| 认证 | /api/v1/auth/me | GET | 获取当前用户 |
| 用户 | /api/v1/users | GET/POST | 用户列表/创建 |
| 用户 | /api/v1/users/{id} | GET/PUT/DELETE | 用户详情/更新/删除 |
| 角色 | /api/v1/roles | GET/POST | 角色列表/创建 |
| 项目 | /api/v1/projects | GET/POST | 项目列表/创建 |
| 项目 | /api/v1/projects/{id} | GET/PUT/DELETE | 项目详情/更新/删除 |
| 项目 | /api/v1/projects/{id}/status | PUT | 更新项目状态 |
| 项目 | /api/v1/projects/{id}/cashflow | GET/POST | 现金流查询/创建 |
| 线索 | /api/v1/leads | GET/POST | 线索列表/创建 |
| 线索 | /api/v1/leads/{id} | GET/PUT/DELETE | 线索详情/更新/删除 |
| 线索 | /api/v1/leads/{id}/follow-ups | GET/POST | 跟进记录 |
| 营销 | /api/v1/admin/l4-marketing/projects | GET/POST | 营销项目列表/创建 |
| 营销 | /api/v1/admin/l4-marketing/projects/{id} | GET/PUT/DELETE | 营销项目详情/更新/删除 |
| 文件 | /api/v1/files/upload | POST | 文件上传 |

---

## 🗄️ 数据库设计说明

### ER图

```mermaid
erDiagram
    USER ||--o{ PROJECT : "manages"
    USER }|--|| ROLE : "has"
    PROJECT ||--|| PROJECT_CONTRACT : "has"
    PROJECT ||--o{ PROJECT_OWNER : "has"
    PROJECT ||--|| PROJECT_SALE : "has"
    PROJECT ||--o{ PROJECT_FOLLOW_UP : "has"
    PROJECT ||--o{ PROJECT_EVALUATION : "has"
    PROJECT ||--o{ PROJECT_INTERACTION : "has"
    PROJECT ||--o{ FINANCE_RECORD : "has"
    PROJECT ||--o{ PROJECT_STATUS_LOG : "has"
    PROJECT ||--|| PROJECT_RENOVATION : "has"
    PROJECT_RENOVATION ||--o{ RENOVATION_PHOTO : "has"
    LEAD ||--o{ LEAD_FOLLOWUP : "has"
    LEAD ||--o{ LEAD_PRICE_HISTORY : "has"
    L4_MARKETING_PROJECT ||--o{ L4_MARKETING_MEDIA : "has"
    L4_MARKETING_PROJECT }o--|| PROJECT : "references"
    PROPERTY_CURRENT ||--o{ PROPERTY_HISTORY : "snapshots"
    PROPERTY_CURRENT ||--o{ PROPERTY_MEDIA : "has"
    PROPERTY_CURRENT }o--|| COMMUNITY : "belongs_to"
    COMMUNITY ||--o{ COMMUNITY_ALIAS : "has"
    COMMUNITY ||--o{ COMMUNITY_COMPETITOR : "competes_with"

    USER {
        string id PK
        string username UK
        string password
        string nickname
        string phone UK
        string avatar
        string wechat_openid UK
        string wechat_unionid UK
        string wechat_session_key
        string role_id FK
        string status
        boolean must_change_password
        datetime last_login_at
        datetime created_at
    }

    ROLE {
        string id PK
        string name UK
        string code UK
        text description
        json permissions
        boolean is_active
    }

    PROJECT {
        string id PK
        string name
        string community_name
        string address
        string project_manager_id FK
        decimal area
        string layout
        string orientation
        string status
        string renovation_stage
        boolean is_deleted
        datetime created_at
        datetime updated_at
    }

    PROJECT_CONTRACT {
        string id PK
        string project_id FK
        string contract_no UK
        decimal signing_price
        datetime signing_date
        integer signing_period
        integer extension_period
        decimal extension_rent
        string cost_assumption
        datetime planned_handover_date
        text other_agreements
        json signing_materials
        string contract_status
        boolean is_deleted
    }

    PROJECT_OWNER {
        string id PK
        string project_id FK
        string owner_name
        string owner_phone
        string owner_id_card
        string relation_type
        text owner_info
        boolean is_deleted
    }

    PROJECT_SALE {
        string id PK
        string project_id FK
        datetime listing_date
        decimal list_price
        datetime sold_date
        decimal sold_price
        string channel_manager_id
        string property_agent_id
        string negotiator_id
        string transaction_status
        boolean is_deleted
    }

    PROJECT_FOLLOW_UP {
        string id PK
        string project_id FK
        string follow_up_type
        text content
        datetime follow_up_at
        string follower_id
    }

    PROJECT_EVALUATION {
        string id PK
        string project_id FK
        string evaluation_type
        decimal evaluation_price
        text remark
        string evaluator_id
        datetime evaluation_at
    }

    PROJECT_INTERACTION {
        string id PK
        string project_id FK
        string record_type
        string interaction_target
        text content
        datetime interaction_at
        string operator_id
        decimal price
    }

    FINANCE_RECORD {
        string id PK
        string project_id FK
        string type
        string category
        decimal amount
        datetime record_date
        string operator_id
        text remark
    }

    PROJECT_STATUS_LOG {
        string id PK
        string project_id FK
        string old_status
        string new_status
        string trigger_event
        string operator_id
        datetime operate_at
        text remark
    }

    PROJECT_RENOVATION {
        string id PK
        string project_id FK
        string renovation_company
        datetime contract_start_date
        datetime contract_end_date
        datetime actual_start_date
        datetime actual_end_date
        decimal hard_contract_amount
        json stage_completed_dates
        decimal soft_budget
        decimal soft_actual_cost
        string soft_detail_attachment
        decimal design_fee
        decimal demolition_fee
        decimal garbage_fee
        decimal other_extra_fee
        text other_fee_reason
        boolean is_deleted
    }

    RENOVATION_PHOTO {
        string id PK
        string project_id FK
        string renovation_id FK
        string stage
        string url
        string filename
        text description
        boolean is_deleted
    }

    LEAD {
        string id PK
        string community_name
        integer is_hot
        string layout
        string orientation
        string floor_info
        decimal area
        decimal total_price
        decimal unit_price
        decimal eval_price
        string status
        text audit_reason
        string auditor_id
        datetime audit_time
        json images
        string district
        string business_area
        text remarks
        string creator_id
        integer source_property_id
        datetime last_follow_up_at
        datetime created_at
        datetime updated_at
    }

    LEAD_FOLLOWUP {
        string id PK
        string lead_id FK
        string method
        text content
        datetime followed_at
        string created_by_id
    }

    LEAD_PRICE_HISTORY {
        string id PK
        string lead_id FK
        decimal price
        text remark
        datetime recorded_at
        string created_by_id
    }

    L4_MARKETING_PROJECT {
        integer id PK
        integer community_id FK
        string community_name
        string layout
        string orientation
        string floor_info
        decimal area
        decimal total_price
        decimal unit_price
        string title
        text images
        integer sort_order
        string tags
        string decoration_style
        string publish_status
        string project_status
        string project_id FK
        string consultant_id FK
        boolean is_deleted
        datetime created_at
        datetime updated_at
    }

    L4_MARKETING_MEDIA {
        integer id PK
        integer marketing_project_id FK
        string media_type
        string photo_category
        string renovation_stage
        integer origin_media_id
        text file_url
        text thumbnail_url
        text description
        integer sort_order
        boolean is_deleted
        datetime created_at
        datetime updated_at
    }

    COMMUNITY {
        integer id PK
        string name UK
        integer city_id
        string district
        string business_circle
        float avg_price_wan
        integer total_properties
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    COMMUNITY_ALIAS {
        integer id PK
        integer community_id FK
        string alias_name
        string data_source
        datetime created_at
    }

    COMMUNITY_COMPETITOR {
        integer id PK
        integer community_id FK
        integer competitor_community_id FK
        datetime created_at
    }

    PROPERTY_CURRENT {
        integer id PK
        string data_source
        string source_property_id
        integer community_id FK
        string status
        string property_type
        integer rooms
        integer halls
        integer baths
        string orientation
        string floor_original
        integer floor_number
        integer total_floors
        string floor_level
        decimal build_area
        decimal inner_area
        decimal listed_price_wan
        datetime listed_date
        decimal sold_price_wan
        datetime sold_date
        integer build_year
        string building_structure
        string decoration
        boolean elevator
        string ownership_type
        integer ownership_years
        string last_transaction
        string heating_method
        text listing_remarks
        datetime created_at
        datetime updated_at
    }

    PROPERTY_HISTORY {
        integer id PK
        string data_source
        string source_property_id
        string change_type
        datetime captured_at
        string status
        integer community_id
        integer rooms
        float build_area
        float listed_price_wan
        float sold_price_wan
        datetime listed_date
        datetime sold_date
    }

    PROPERTY_MEDIA {
        integer id PK
        string data_source
        string source_property_id
        string media_type
        string url
        string description
        integer sort_order
        datetime created_at
    }
```

### 核心表说明

#### 1. users - 用户表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String(36) | 主键，UUID |
| username | String(100) | 用户名，唯一 |
| password | String(255) | 密码哈希 |
| nickname | String(100) | 昵称 |
| phone | String(20) | 手机号，唯一 |
| avatar | String(500) | 头像URL |
| wechat_openid | String(100) | 微信OpenID，唯一 |
| wechat_unionid | String(100) | 微信UnionID，唯一 |
| wechat_session_key | String(100) | 微信会话密钥 |
| role_id | String(36) | 角色ID，外键 |
| status | String(20) | 状态: active/inactive/banned |
| must_change_password | Boolean | 是否必须修改密码 |
| last_login_at | DateTime | 最后登录时间 |

**索引：**
- idx_user_status: status
- idx_user_phone: phone
- idx_user_wechat: wechat_openid, wechat_unionid

#### 2. projects - 项目主表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String(36) | 主键，UUID |
| name | String(700) | 项目名称（自动生成） |
| community_name | String(200) | 小区名称 |
| address | String(500) | 物业地址 |
| project_manager_id | String(36) | 项目负责人ID |
| area | Numeric(10,2) | 产证面积(m²) |
| layout | String(50) | 户型 |
| orientation | String(50) | 朝向 |
| status | Enum | 项目状态: signing/renovating/selling/sold/deleted |
| renovation_stage | Enum | 改造子阶段: 拆除/设计/水电/木瓦/油漆/安装/交付/已完成 |
| is_deleted | Boolean | 逻辑删除标记 |

**索引：**
- idx_project_status: status
- idx_project_deleted: is_deleted
- idx_project_manager: project_manager_id

#### 3. project_contracts - 签约合同表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String(36) | 主键 |
| project_id | String(36) | 项目ID，外键，唯一 |
| contract_no | String(100) | 合同编号，唯一 |
| signing_price | Numeric(15,2) | 签约价格(万) |
| signing_date | DateTime | 签约日期 |
| signing_period | Integer | 合同周期(天) |
| extension_period | Integer | 顺延期(天) |
| extension_rent | Numeric(15,2) | 顺延期租金(元/月) |

**索引：**
- idx_contract_project: project_id
- idx_contract_no: contract_no (unique)

#### 4. finance_records - 财务流水表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String(36) | 主键 |
| project_id | String(36) | 项目ID，外键 |
| type | String(20) | 类型: income/expense |
| category | String(50) | 费用类别 |
| amount | Numeric(15,2) | 金额(元) |
| record_date | DateTime | 发生日期 |
| operator_id | String(36) | 经办人ID（软引用） |
| remark | Text | 备注 |

**索引：**
- idx_finance_project_date: project_id, record_date
- idx_finance_type_category: type, category

#### 5. leads - 线索表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String(36) | 主键 |
| community_name | String(200) | 小区名称 |
| layout | String(50) | 户型 |
| area | Numeric(10,2) | 面积(m²) |
| total_price | Numeric(15,2) | 总价(万) |
| unit_price | Numeric(12,2) | 单价(元/m²) |
| eval_price | Numeric(15,2) | 评估价(万) |
| status | Enum | 线索状态: pending_assessment/pending_visit/rejected/visited/signed |
| district | String(50) | 行政区 |
| business_area | String(50) | 商圈 |

### 索引设计策略

#### 索引设计原则

1. **高频查询字段建立索引**
   - status, is_deleted 等筛选字段
   - created_at, updated_at 等排序字段

2. **外键字段建立索引**
   - project_id, user_id 等关联字段

3. **唯一约束字段建立唯一索引**
   - username, phone, contract_no 等

4. **复合索引优化多条件查询**
   - (project_id, record_date) 优化项目流水查询

#### 索引列表

| 表名 | 索引名 | 字段 | 类型 |
|------|--------|------|------|
| users | idx_user_status | status | 普通索引 |
| users | idx_user_phone | phone | 唯一索引 |
| projects | idx_project_status | status | 普通索引 |
| projects | idx_project_manager | project_manager_id | 普通索引 |
| project_contracts | idx_contract_no | contract_no | 唯一索引 |
| finance_records | idx_finance_project_date | project_id, record_date | 复合索引 |

---

## 🔄 核心业务流程解析

### 项目生命周期流程

```mermaid
stateDiagram-v2
    [*] --> 签约阶段: 创建项目
    签约阶段 --> 装修阶段: 状态更新
    装修阶段 --> 在售阶段: 装修完成
    在售阶段 --> 已售阶段: 成交
    已售阶段 --> [*]
    
    签约阶段 --> 已删除: 删除项目
    装修阶段 --> 已删除: 删除项目
    在售阶段 --> 已删除: 删除项目
```

**详细流程：**

1. **签约阶段 (signing)**
   - 创建项目基本信息
   - 录入合同信息 (project_contracts)
   - 录入业主信息 (project_owners)
   - 设置合同周期和顺延期

2. **装修阶段 (renovating)**
   - 创建装修记录 (project_renovations)
   - 记录装修进度和阶段
   - 上传装修照片 (renovation_photos)
   - 记录装修费用支出

3. **在售阶段 (selling)**
   - 设置挂牌价和上架日期
   - 添加带看记录 (project_interactions)
   - 记录出价历史
   - 监控竞品动态

4. **已售阶段 (sold)**
   - 录入成交价和成交日期
   - 计算ROI和现金流
   - 生成项目报告
   - 归档项目数据

### 线索转化流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant L2 as L2线索层
    participant L3 as L3项目层
    participant DB as 数据库

    U->>L2: 创建线索
    L2->>DB: 保存线索数据
    
    loop 跟进评估
        U->>L2: 添加跟进记录
        L2->>DB: 保存跟进记录
        U->>L2: 更新评估价
        L2->>DB: 保存评估记录
    end

    alt 线索通过评估
        U->>L2: 更新状态为approved
        L2->>L3: 写时复制转化为项目
        L3->>DB: 创建项目数据
        L3->>U: 返回项目ID
    else 线索被驳回
        U->>L2: 更新状态为rejected
        L2->>DB: 更新线索状态
    end
```

### 数据导入流程

```mermaid
flowchart TD
    A[CSV/JSON文件] --> B{文件格式校验}
    B -->|校验失败| C[返回错误信息]
    B -->|校验通过| D[解析数据]
    D --> E{数据验证}
    E -->|验证失败| F[记录错误日志]
    F --> G[生成失败文件]
    E -->|验证通过| H[批量插入数据库]
    H --> I{是否有失败}
    I -->|是| F
    I -->|否| J[返回导入结果]
    G --> J
```

### 四层领域数据流转

```mermaid
graph TB
    subgraph "L1 市场情报层"
        L1D[(property_current)]
    end

    subgraph "L2 线索管理层"
        L2D[(leads)]
        L2F[跟进记录]
        L2E[评估记录]
    end

    subgraph "L3 项目管理层"
        L3D[(projects)]
        L3C[合同信息]
        L3O[业主信息]
        L3R[装修信息]
        L3F[财务记录]
    end

    subgraph "L4 营销层"
        L4D[(l4_marketing_projects)]
        L4M[媒体文件]
    end

    L1D -.->|写时复制| L2D
    L2D --> L2F
    L2D --> L2E
    L2D -.->|写时复制| L3D
    L3D --> L3C
    L3D --> L3O
    L3D --> L3R
    L3D --> L3F
    L3D -.->|写时复制| L4D
    L4D --> L4M
```

---

## ❓ 常见问题解决方案

### 环境配置问题

#### Q1: 前端启动时报错 "Module not found"

**解决方案：**

```bash
# 1. 删除node_modules和lock文件
rm -rf node_modules pnpm-lock.yaml

# 2. 重新安装依赖
pnpm install

# 3. 清除Next.js缓存
rm -rf .next
```

#### Q2: 后端启动时报错 "JWT_SECRET_KEY not set"

**解决方案：**

```bash
# 1. 复制环境变量模板
cp .env.example .env

# 2. 生成JWT密钥
python -c "import secrets; print(secrets.token_urlsafe(32))"

# 3. 编辑.env文件，设置JWT_SECRET_KEY
JWT_SECRET_KEY=your-generated-key
```

#### Q3: SQLite数据库锁定错误

**解决方案：**

```python
# 在 db.py 中增加超时时间
connect_args = {
    "check_same_thread": False,
    "timeout": 30,  # 增加超时时间
}
```

### 开发调试问题

#### Q4: API返回401 Unauthorized

**检查清单：**

1. 确认请求头包含 `Authorization: Bearer {token}`
2. 确认Token未过期（默认600分钟）
3. 确认用户状态为 `active`
4. 确认用户具有相应权限

#### Q5: 前端类型错误 "Property 'xxx' does not exist"

**解决方案：**

```bash
# 1. 重新生成API类型
cd frontend
pnpm gen-api

# 2. 确保后端服务正在运行
# 3. 检查网络连接是否正常
```

#### Q6: 文件上传失败

**检查清单：**

1. 确认文件大小不超过限制（默认100MB）
2. 确认文件类型在允许列表中（支持：.jpg, .jpeg, .png, .pdf, .xlsx, .xls, .csv, .doc, .docx）
3. 检查static/uploads目录是否有写入权限
4. 确认Content-Type设置为multipart/form-data

### 部署问题

#### Q7: 生产环境数据库迁移

**解决方案：**

```bash
# 1. 备份现有数据库
sqlite3 data.db ".backup data.db.backup"

# 2. 执行迁移
alembic upgrade head

# 3. 验证迁移结果
alembic current
```

#### Q8: Nginx反向代理配置

**配置示例：**

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # 后端API
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 静态文件
    location /static/ {
        alias /path/to/backend/static/;
    }
}
```

### 性能优化问题

#### Q9: 数据库查询慢

**优化建议：**

1. 为常用查询字段添加索引
2. 使用 `select_related()` 减少N+1查询
3. 分页查询避免大数据量返回
4. 启用SQLAlchemy查询缓存

```python
# 优化前
projects = db.query(Project).all()
for p in projects:
    print(p.contract.contract_no)  # N+1查询

# 优化后
projects = db.query(Project).options(
    joinedload(Project.contract)
).all()
```

#### Q10: 前端页面加载慢

**优化建议：**

1. 使用Next.js Image组件优化图片
2. 启用React Compiler减少重渲染
3. 使用SWR缓存数据
4. 按需加载组件

```typescript
// 动态导入组件
const HeavyComponent = dynamic(
  () => import('@/components/heavy-component'),
  { ssr: false }
);
```



## 📚 附录

### 项目目录结构

```
ProFo/
├── init.sh                      # Linux/macOS 一键初始化脚本
├── init.bat                     # Windows 一键初始化脚本
├── frontend/                    # 前端项目
│   ├── src/
│   │   ├── app/                # Next.js App Router
│   │   │   ├── (main)/         # 主布局路由组
│   │   │   │   ├── projects/   # 项目管理模块
│   │   │   │   ├── leads/      # 线索管理模块
│   │   │   │   ├── l4-marketing/  # 营销管理模块
│   │   │   │   ├── properties/ # 房源管理模块
│   │   │   │   └── users/      # 用户管理模块
│   │   │   ├── api/            # API路由
│   │   │   └── login/          # 登录页面
│   │   ├── lib/                # 工具库
│   │   │   ├── api-server.ts   # API客户端
│   │   │   ├── api-types.d.ts  # OpenAPI类型
│   │   │   └── utils.ts         # 工具函数
│   │   └── hooks/              # 自定义Hooks (分散在各模块)
│   ├── public/                 # 静态资源
│   ├── components.json          # Shadcn UI配置
│   ├── package.json             # 依赖配置
│   ├── next.config.ts          # Next.js配置
│   ├── eslint.config.mjs       # ESLint配置
│   └── postcss.config.mjs       # PostCSS配置
│
├── backend/                     # 后端项目
│   ├── routers/                # API路由层
│   ├── services/               # 业务逻辑层（按领域模块化）
│   │   ├── __init__.py         # 服务层统一入口
│   │   ├── market/             # 市场情报服务（L1）
│   │   ├── leads/              # 线索管理服务（L2，预留）
│   │   ├── projects/           # 项目管理服务（L3）
│   │   ├── marketing/          # 市场营销服务（L4）
│   │   ├── monitor/            # 市场监控服务
│   │   ├── system/             # 系统服务（认证、用户、角色）
│   │   └── utils/              # 服务工具
│   ├── models/                 # 数据模型层
│   ├── schemas/                # Pydantic模型
│   ├── dependencies/           # 依赖注入
│   ├── utils/                  # 工具函数
│   ├── scripts/                # 运维脚本
│   ├── tests/                  # 测试目录
│   ├── static/uploads/         # 上传文件目录
│   ├── main.py                 # 应用入口
│   ├── settings.py             # 配置管理
│   ├── db.py                   # 数据库连接
│   ├── alembic.ini             # Alembic配置
│   └── pyproject.toml          # 项目配置
│
├── deploy/                      # 部署配置
│   ├── docker-compose.yml      # Docker编排
│   ├── deploy.sh               # 部署脚本
│   ├── deploy.bat              # Windows部署脚本
│   ├── ecosystem.config.js     # PM2配置
│   ├── profo-nginx.conf        # Nginx配置
│   ├── setup-server.sh         # 服务器初始化
│   ├── .env.backend.production # 后端生产环境配置
│   └── .env.frontend.production # 前端生产环境配置
│
├── docs/                        # 文档目录
│   └── project.md              # 项目文档
│
├── .github/workflows/          # GitHub Actions
│   └── lint.yml               # Lint工作流
│
├── .gitignore
└── README.md                   # 项目说明文档
```

### 相关链接

- [FastAPI官方文档](https://fastapi.tiangolo.com/)
- [Next.js官方文档](https://nextjs.org/docs)
- [TailwindCSS官方文档](https://tailwindcss.com/docs)
- [SQLAlchemy官方文档](https://docs.sqlalchemy.org/)

### 贡献者

感谢所有为ProFo项目做出贡献的开发者！

### 许可证

[Apache 2.0 License](LICENSE)

---

<p align="center">
  <b>ProFo - 让房地产翻新与销售管理更简单</b>
</p>
