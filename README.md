# ProFo 房地产翻新与销售管理系统

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.1.7-black?style=flat-square&logo=next.js" />
  <img src="https://img.shields.io/badge/React-19.2.1-61DAFB?style=flat-square&logo=react" />
  <img src="https://img.shields.io/badge/FastAPI-0.104+-009688?style=flat-square&logo=fastapi" />
  <img src="https://img.shields.io/badge/Python-3.13-3776AB?style=flat-square&logo=python" />
  <img src="https://img.shields.io/badge/TailwindCSS-4.3+-38B2AC?style=flat-square&logo=tailwind-css" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql" />
  <img src="https://img.shields.io/badge/Docker_Compose-2-2496ED?style=flat-square&logo=docker" />
</p>

<p align="center">
  <b>轻量级、本地化、高性能的房产数据中心</b><br/>
  <sub>四层领域架构 · B端ERP + C端营销 · JWT + API Key 双认证 · PostgreSQL + Docker 一键部署</sub>
</p>

---

## 📋 目录

1. [项目概述](#-项目概述)
2. [技术架构](#-技术架构)
3. [快速开始（Docker）](#-快速开始docker)
4. [本地开发](#-本地开发)
5. [配置说明](#-配置说明)
6. [API 接口](#-api-接口)
7. [数据库设计](#-数据库设计)
8. [核心业务流程](#-核心业务流程)
9. [部署指南](#-部署指南)
10. [数据迁移](#-数据迁移)
11. [开发规范](#-开发规范)
12. [常见问题](#-常见问题)
13. [项目结构](#-项目结构)

---

## 🏠 项目概述

### 项目背景

ProFo 是一个面向房地产翻新与销售业务的全流程管理系统，采用 **四层业务领域架构**，覆盖从市场情报采集到 C 端营销展示的全链路数据管理。系统同时提供 B 端运营后台和 C 端公开站点。

### 核心功能

| 模块 | 功能描述 | 业务层级 |
|------|---------|---------|
| **L1 市场情报层** | 小区信息管理、房源市场数据、价格变动记录、CSV/JSON 批量导入 | 数据基准 |
| **L2 线索管理层** | 卖房估价线索创建、跟进、评估、价格历史 | 漏斗瓶颈 |
| **L3 项目管理层** | 合同管理、装修管控、销售跟进、财务现金流、状态机 | 核心 ERP |
| **L4 营销层** | 营销房源 CMS、照片拖拽排序、媒体库、预览发布 | 门面展示 |
| **市场监控** | 竞品对比、小区雷达、趋势定位、市场情绪、AI 策略 | 决策辅助 |
| **C 端公开站点** | 房源浏览、估价提交、用户注册/登录、个人中心 | 客户触达 |
| **系统管理** | 用户、角色、API Key、文件上传、数据导入任务 | 基础设施 |

### 技术亮点

- 🚀 **Next.js 16 + React 19** — App Router、React Compiler、Server Actions
- ⚡ **FastAPI + SQLAlchemy 2.0** — 异步 Python 后端，分层架构（Router → Service → Model）
- 🎨 **TailwindCSS v4 + Radix UI / shadcn** — 现代化 UI 组件库
- 🔐 **JWT + API Key 双认证** — httpOnly Cookie 存 Token，`X-API-Key` 头用于服务间调用
- 🔒 **Fernet 对称加密** — 身份证 / 手机号 / 微信会话密钥等敏感字段加密存储
- 📊 **四层领域架构** — 清晰的业务边界，层间写时复制（CoW）
- 🐘 **PostgreSQL 16** — `TIMESTAMP WITH TIME ZONE` 解决时区问题，`psycopg` 高性能驱动
- 🐳 **Docker Compose 一键部署** — db / backend / frontend 三服务编排，由宿主 nginx 反代，开发与生产同构
- 🖱️ **dnd-kit 拖拽排序** — 营销照片虚拟列表 + 拖拽排序 + 性能监控
- 🛡️ **slowapi 速率限制** — 接口级防滥用
- ⚙️ **统一异常处理** — Service 层 `ServiceException`，全局 handler 统一捕获

---

## 🏗️ 技术架构

### 系统整体架构

```mermaid
graph TB
    subgraph "宿主机"
        NX[宿主 Nginx :80/443]
    end
    subgraph "Docker Compose 编排"
        subgraph "前端层 Frontend"
            A[Next.js 16 App Router]
            B[React 19 + React Compiler]
            C[TailwindCSS v4 + shadcn]
            D[SWR + nuqs + RHF/Zod]
        end
        subgraph "API 网关层 Backend"
            F[FastAPI]
            G[JWT + API Key Auth]
            H[slowapi Rate Limiter]
            I[CORS Middleware]
        end
        subgraph "业务逻辑层"
            J[Routers 按领域分模块]
            K[Services 按领域分模块]
            L[Models 按领域分模块]
            M[Schemas 按领域分模块]
        end
        subgraph "数据存储层"
            N[(PostgreSQL 16)]
            O[uploads volume]
        end
    end

    NX -->|/api/*| F
    NX -->|/static/uploads/*| O
    NX -->|/| A
    A --> F
    F --> G
    F --> H
    G --> J
    J --> K
    K --> L
    L --> N
    F --> O
```

### Docker 服务编排

```mermaid
graph LR
    Browser[浏览器 :80/443] --> NX[宿主 Nginx]
    NX -->|http://127.0.0.1:8000/api/*| BE[Backend 容器]
    NX -->|http://127.0.0.1:3000/| FE[Frontend 容器]
    NX -->|/static/uploads/*| UP[(uploads volume)]
    BE -->|postgres:5432| DB[(PostgreSQL 容器)]
    BE -.->|挂载| UP
    DB -.->|持久化| PG[(pgdata volume)]
    FE -->|Server Action 直连 backend:8000| BE

    style DB fill:#4169E1,color:#fff
    style PG fill:#4169E1,color:#fff
    style UP fill:#f59e0b,color:#fff
```

- **db**: `postgres:16-alpine` + `pgdata` 卷持久化
- **backend**: FastAPI + uvicorn，挂载 `uploads` 卷
- **frontend**: Next.js standalone 模式，Server Action 通过 `http://backend:8000` 直连后端容器
- **nginx**: 反代 + 静态资源缓存，挂载 `uploads` 卷直服上传文件

### 四层业务领域架构

```mermaid
graph TB
    subgraph "L4 市场营销层"
        L4[l4_marketing_projects - CMS]
        L4F[营销房源展示 / 媒体库 / 拖拽排序]
    end
    subgraph "L3 项目管理层"
        L3[projects - 核心 ERP]
        L3F[合同 / 装修 / 销售 / 财务 / 状态机]
    end
    subgraph "L2 线索管理层"
        L2[leads - 筛选器]
        L2F[线索创建 / 跟进 / 评估 / 价格历史]
    end
    subgraph "L1 市场情报层"
        L1[property_current - 参考基准]
        L1F[小区 / 房源 / 价格变动 / 批量导入]
    end

    L1 -.->|写时复制| L2
    L2 -.->|写时复制| L3
    L3 -.->|写时复制| L4
```

### 前端架构

#### 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js | 16.1.7 | React 框架，App Router、Server Actions（standalone 输出） |
| React | 19.2.1 | UI 库，React Compiler 优化 |
| TypeScript | 5.9.3 | 类型安全 |
| TailwindCSS | 4.3 | 原子化 CSS |
| Radix UI / shadcn | 1.4.3 | 无障碍 UI 组件 |
| SWR | 2.4.1 | 服务端状态获取与缓存 |
| nuqs | 2.8.6 | URL 查询参数状态 |
| React Hook Form + Zod | 7.71 / 4.3 | 表单状态与校验 |
| dnd-kit | 6.3 / 10.0 | 拖拽排序 |
| Recharts | 3.7 | 图表可视化 |
| openapi-fetch + openapi-typescript | 0.15 / 7.10 | 类型安全 API 客户端 |
| Vitest + Playwright | 3.2 / 1.59 | 单元测试 + E2E 测试 |

#### 双路由组设计

```mermaid
graph LR
    subgraph "(main) 受保护路由组"
        M1[Dashboard]
        M2[Projects]
        M3[Leads]
        M4[L4 Marketing]
        M5[Properties]
        M6[Users/Roles]
        M7[Settings/API Key]
    end
    subgraph "(c) C端公开路由组"
        C1[首页/房源]
        C2[估价]
        C3[登录/注册]
        C4[个人中心]
        C5[关于/联系]
    end
    M1 --> M2
    M1 --> M3
    M1 --> M4
```

- **`(main)/layout.tsx`** — 调用 `GET /api/v1/auth/me` 鉴权，未登录跳转 `/login`，标记 `force-dynamic` 以访问 Cookie
- **`(c)/layout.tsx`** — C 端公开站点布局，无需登录

#### 双 API 客户端

| 客户端 | 文件 | 使用场景 | 特性 |
|--------|------|---------|------|
| `fetchClient()` | `lib/api-server.ts` | Server Components / Server Actions | 直接读 Cookie，401 自动刷新 |
| `client` | `lib/api-client.ts` | Client Components | `credentials: "include"`，401 跳 `/login` |

> **Docker 部署关键点**：Server Action 在 frontend 容器内运行，`http://127.0.0.1:8000` 会指向容器自身。需通过 `SERVER_API_URL=http://backend:8000` 环境变量让 Server Action 直连 backend 容器（已在 `docker-compose.yml` 中配置）。

开发环境通过 `next.config.ts` 的 `rewrites` 将 `/api/*` 代理到 `http://127.0.0.1:8000/api/*`，使前后端同域以正常发送 Cookie。

### 后端架构

#### 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| FastAPI | ≥ 0.104 | 高性能 Web 框架 |
| SQLAlchemy | ≥ 2.0 | ORM |
| Pydantic | v2 | 数据模型与校验 |
| pydantic-settings | ≥ 2.0 | 环境变量配置 |
| slowapi | ≥ 0.1.9 | 速率限制 |
| python-jose | ≥ 3.3 | JWT |
| passlib + bcrypt | ≥ 1.7 / <4.0 | 密码哈希 |
| cryptography (Fernet) | - | 敏感字段加密 |
| pandas | ≥ 2.1 | 数据处理 |
| alembic | ≥ 1.17 | 数据库迁移（可选） |
| psycopg[binary] | ≥ 3.1 | PostgreSQL 高性能驱动 |
| httpx | ≥ 0.25 | HTTP 客户端 |
| uv | - | 包管理器（替代 pip/venv） |

#### 服务分层（Router → Service → Model）

```
backend/
├── routers/                    # API 路由层（薄，仅参数校验/依赖注入）
│   ├── common/                 # 通用路由（files / push / upload）
│   ├── market/                 # 市场情报（properties / communities）
│   ├── leads/                  # 线索（core / followups / prices）
│   ├── projects/               # 项目（core / renovation / sales / cashflow）
│   ├── marketing/              # 营销（projects / import_）
│   ├── monitor/                # 市场监控
│   ├── public/                 # C 端公开接口（auth / users / projects / leads / communities）
│   └── system/                 # 系统（auth / users / roles）
├── services/                   # 业务逻辑层（按领域模块化）
│   ├── market/                 # 房源查询 / 导入 / 小区合并 / CSV 解析 / 导入任务
│   ├── leads/                  # 线索核心 / 跟进 / 价格（internal/）
│   ├── projects/               # Facade + core / renovation / sales / finance（internal/）
│   ├── marketing/              # 营销项目 / 媒体 / 导入 / 公开
│   ├── monitor/                # 监控服务
│   ├── system/                 # auth / user / role / api_key / error / init / exceptions
│   └── utils/                  # 日期解析等工具
├── models/                     # 数据模型层（按领域模块化）
│   ├── common/                 # Base / BaseModel / 枚举 / encrypted 字段
│   ├── property/               # Community / PropertyCurrent / PropertyHistory / PropertyMedia
│   ├── lead/                   # Lead / LeadFollowUp / LeadPriceHistory
│   ├── project/                # Project 及 8 个子模型（合同/业主/销售/跟进/互动/财务/状态日志/装修）
│   ├── marketing/              # L4MarketingProject / L4MarketingMedia
│   ├── system/                 # FailedRecord / PropertyImportTask
│   └── user/                   # User / Role / ApiKey
├── schemas/                    # Pydantic Schema（按领域分模块）
├── dependencies/               # FastAPI 依赖注入（auth / common / projects）
├── utils/                      # auth / crypto / csv_exporter / file_security / formatters / jwt_validator / param_parser / query_params / security_logger
├── migrations/                 # 启动时数据迁移（幂等，列变更/明文加密等）
├── scripts/                    # 一次性脚本
├── main.py                     # 应用入口
├── db.py                       # SQLAlchemy 引擎 + 会话工厂 + init_db()
├── settings.py                 # Pydantic Settings
├── error_handlers.py           # 全局异常处理器
├── exceptions.py               # 通用异常
└── init_admin.py               # 初始化角色与管理员脚本（首次部署手动执行）
```

#### 关键设计模式

- **依赖注入**：`DbSessionDep = Annotated[Session, Depends(get_db)]`，`CurrentUserDep`、`CurrentAdminUserDep`、`CurrentInternalUserDep` 等预定义鉴权依赖
- **服务异常**：Service 层抛出 `ServiceException` / `AuthenticationError` / `ResourceNotFoundError` 等（`services/system/exceptions.py`），由全局 handler 捕获。**禁止在 Service 层抛 `HTTPException`**
- **响应格式**：直接返回 Pydantic 模型；分页用 `PaginatedResponse[T]`；列表查询带过滤+排序
- **逻辑外键**：关联用 `user_id: int` 等软外键，级联由 Service 控制
- **加密字段**：通过 `models/common/encrypted.py` 的 `EncryptedString` 类型自动加密身份证 / 手机号 / 微信会话密钥
- **时区处理**：所有 `DateTime` 列使用 `DateTime(timezone=True)`，PostgreSQL 存储 `TIMESTAMP WITH TIME ZONE`

#### 统一入口导入

```python
from services import (
    PropertyQueryService, PropertyImporter, CommunityMerger,
    ProjectService, ProjectCoreService, RenovationService, SalesService, FinanceService,
    MarketingProjectService, MarketingImportService,
    AuthService, UserService, RoleService, ApiKeyService,
    MonitorService,
)
# 或按子模块导入
from services.market import PropertyQueryService
from services.projects import ProjectService
```

---

## 🚀 快速开始（Docker）

### 前置条件

- 已安装 **Docker Engine** 与 **Docker Compose v2**（`docker --version` 与 `docker compose version` 都能正常输出）
- 不需要本机安装 Node.js / Python / pnpm / uv —— 所有运行时由容器提供

### 一键启动

```bash
# 1. 生成密钥并初始化 .env（自动从 .env.docker.example 创建并填入随机密钥）
./init-env.sh
#    会自动生成并写入：
#    - POSTGRES_PASSWORD  数据库强密码（24 位字母数字）
#    - JWT_SECRET_KEY     JWT 签名密钥（64 位 hex）
#    - ENCRYPTION_KEY     Fernet 加密密钥
#    - DATABASE_URL       自动同步新密码
# 查看完整密钥: ./init-env.sh --show
# 强制重新生成所有密钥: ./init-env.sh --force

# 2. 构建并启动全部服务
docker compose up -d --build
```

启动后访问 `http://localhost/` 即可看到前端页面，API 走 `http://localhost/api/...`。
> 注：当前架构使用宿主 nginx 反代到 `127.0.0.1:8000/3000`，不再在 compose 内启动 nginx 容器。

### 首次部署：初始化数据库与管理员账号

```bash
# 一键初始化：建表 + 创建角色 + 创建管理员（自动生成临时密码）
./setup.sh --docker
```

`setup.sh --docker` 会在 backend 容器内执行 `init_db.py` 与 `init_admin.py`，并打印管理员账号与临时密码。首次登录强制修改密码。

> 默认管理员用户名：`admin`，临时密码由脚本随机生成并打印，首次登录强制修改。

### 验证部署

```bash
# 健康检查（应返回 {"status":"healthy","database":"connected"}）
# 注意：compose 不含 nginx 容器，backend 直接暴露在 127.0.0.1:8000
# 如已配置宿主 nginx 反代到 80 端口，也可用 curl http://localhost/health
curl http://127.0.0.1:8000/health

# 查看服务状态
docker compose ps
```

### 启停命令

| 命令 | 作用 |
|------|------|
| `docker compose up -d` | 启动（后台，复用已有镜像） |
| `docker compose stop` | 停止（保留容器与数据卷） |
| `docker compose restart` | 重启 |
| `docker compose logs -f` | 跟踪全部服务日志 |
| `docker compose ps` | 查看服务状态 |
| `docker compose down` | 停止并删除容器（**保留** `pgdata` volume） |
| `docker compose up -d --build` | 重新构建镜像并启动（代码变更后使用） |

### 持久化

- **PostgreSQL 数据**：`pgdata` volume（数据库文件）
- **上传文件**：`./uploads` 目录通过 bind mount 挂载到 backend `/app/static/uploads`

```bash
docker compose down          # 停止服务，保留 volume 数据
docker compose down -v       # 同时删除 volume（谨慎！数据会丢失）
```

### 查看日志

```bash
docker compose logs -f backend    # 后端日志
docker compose logs -f frontend   # 前端日志
docker compose logs -f db         # 数据库日志
# Nginx 日志在宿主机查看（不在 compose 内）：tail -f /var/log/nginx/access.log
```

### 重建单个服务

修改了某个服务的代码后，单独重建并重启：

```bash
docker compose up -d --build backend   # 仅重建后端
docker compose up -d --build frontend  # 仅重建前端
```

---

## 🛠️ 本地开发

如需在容器外进行本地开发（保留热重载与单步调试），仍可使用原始 Node + Python 工具链。

### 开发环境要求

| 环境 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | ≥ 20 | 前端运行环境 |
| pnpm | ≥ 9 | 前端包管理器 |
| Python | ≥ 3.13 | 后端运行环境（与 Docker 镜像一致） |
| uv | 最新 | 后端包管理器（替代 pip/venv） |
| PostgreSQL | ≥ 14 | 本地数据库（或通过 `docker compose up db` 启动单服务） |

### 仅启动数据库容器（推荐）

开发时前端/后端跑在本机，仅用 Docker 提供 PostgreSQL。`docker-compose.dev.yml` 已将 db 端口映射到宿主 5432：

```bash
# 方式一：用 dev-start.sh（推荐，自动处理 .env 变量与软链）
./dev-start.sh db

# 方式二：手动启动
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
# DATABASE_URL 由 dev-start.sh 或 setup.sh 自动覆盖为 127.0.0.1:5432
```

### 前端依赖安装

```bash
cd frontend
pnpm install
cp .env.example .env.local    # 默认值可直接用（NEXT_PUBLIC_API_URL=http://127.0.0.1:8000）
cd ..                         # 返回项目根目录
```

### 后端依赖安装

```bash
cd backend

# 安装 uv
curl -LsSf https://astral.sh/uv/install.sh | sh        # macOS/Linux
# powershell -c "irm https://astral.sh/uv/install.ps1 | iex"  # Windows

# 创建虚拟环境并安装依赖
uv venv
uv sync
cd ..                         # 返回项目根目录
```

### 一键初始化（推荐）

在项目根目录执行，完成密钥生成、数据库建表、管理员创建：

```bash
# 1. 生成 .env 密钥（首次运行自动从模板创建 .env）
./init-env.sh

# 2. 初始化数据库 + 管理员（自动启动 PostgreSQL、建表、创建 admin 用户）
./setup.sh
#    - 首次运行会自动生成管理员临时密码并打印
#    - 支持参数：
#      ./setup.sh --admin-password 'P@ssw0rd'   # 使用指定密码
#      ./setup.sh --reset-admin                 # 重置管理员密码
#      ./setup.sh --skip-db                     # 跳过 DB 启动（已在别处启动时使用）
#      ./setup.sh --help                        # 查看帮助
```

### 启动开发环境

```bash
# 方式一：一键启动（推荐）
# 自动启动 DB + 后端(uvicorn --reload) + 前端(next dev)
./dev-start.sh

# 方式二：手动分别启动（需开两个终端）
cd backend && uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
cd frontend && pnpm dev
# API:   http://127.0.0.1:8000
# 文档:  http://127.0.0.1:8000/docs
# 前端:  http://localhost:3000
```

> `dev-start.sh` 支持的子命令：`up`（默认，启动全部）、`db`（仅启动数据库）、`stop`（停止 db 容器）、`status`（查看状态）、`logs`（查看 db 日志）、`down`（删除容器，保留数据卷）。

### 开发命令

```bash
# 后端
cd backend
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000   # 开发服务器
uv run pytest                                                   # 运行测试（带覆盖率）
uv run pytest tests/test_foo.py -v                              # 运行单个测试

# 前端
cd frontend
pnpm dev                # 开发服务器（端口 3000）
pnpm build              # 生产构建
pnpm lint               # ESLint（max-warnings 0）
pnpm test               # Vitest 单元测试
pnpm test:e2e           # Playwright E2E 测试
pnpm gen-api            # 从后端 /openapi.json 重新生成类型（需后端运行）
```

> **接口变更流程**：启动后端 → `curl http://127.0.0.1:8000/openapi.json` 验证 → `pnpm gen-api` → 提交 `src/lib/api-types.d.ts`

---

## ⚙️ 配置说明

### Docker 部署环境变量（项目根目录 `.env`）

由 `docker-compose.yml` 通过 `env_file: .env` 注入 backend 容器，模板见 [`.env.docker.example`](.env.docker.example)。

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `POSTGRES_USER` | ✅ | `profo` | PostgreSQL 用户名 |
| `POSTGRES_PASSWORD` | ✅ | - | PostgreSQL 强密码（**生产环境务必使用强密码**） |
| `POSTGRES_DB` | ✅ | `profo` | PostgreSQL 数据库名 |
| `DATABASE_URL` | - | 见 `.env.docker.example` | 数据库连接串；compose 会用 `${POSTGRES_*}` 重新拼装覆盖指向 `db:5432`，此处仅占位 |
| `JWT_SECRET_KEY` | ✅ | - | JWT 签名密钥，`openssl rand -hex 32` 生成 |
| `ENCRYPTION_KEY` | ✅ | - | Fernet 对称加密密钥，`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` 生成 |
| `WECHAT_APPID` | ✅ | - | 微信 AppID（不使用微信登录也需填占位符） |
| `WECHAT_SECRET` | ✅ | - | 微信 AppSecret |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | - | `30` | 访问令牌过期时间 |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | - | `7` | 刷新令牌过期时间 |
| `JWT_KEY_ROTATION_ENABLED` | - | `false` | 是否启用密钥轮换 |
| `JWT_SECRET_KEY_OLD` | - | - | 旧密钥（轮换过渡期） |
| `CORS_ORIGINS` | - | `[]` | 允许的跨域来源（同域部署留空即可） |
| `API_PREFIX` | - | `/api` | API 前缀 |
| `UPLOAD_DIR` | - | `/app/static/uploads` | 上传目录（容器内路径，勿改） |
| `MAX_UPLOAD_SIZE` | - | `104857600` | 上传大小上限（100 MB） |
| `DEBUG` | - | `false` | 调试模式 |

> **Docker 专有环境变量**（仅在 `docker-compose.yml` 中显式设置，不在 `.env` 中）：
> - `frontend.environment.SERVER_API_URL=http://backend:8000` — Server Action / Server Component 在容器内运行时直连 backend 容器（不设此项会回退到 `http://127.0.0.1:8000`，指向 frontend 自己，导致登录"网络错误"）

### 前端环境变量（`frontend/.env.local`，仅本地开发）

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_API_URL` | 浏览器可访问的后端地址（开发环境 `http://127.0.0.1:8000`） |
| `SERVER_API_URL` | 服务端内部直连地址（生产环境通过 Nginx，无需设置；Docker 部署由 compose 注入） |

---

## 🔌 API 接口

所有接口前缀：`/api/v1`，文档地址：`http://localhost/docs`（Docker 部署）或 `http://127.0.0.1:8000/docs`（本地开发）

### 认证方式

| 方式 | 头部 | 场景 |
|------|------|------|
| JWT | `Authorization: Bearer <token>` 或 httpOnly Cookie | Web 前端用户 |
| API Key | `X-API-Key: <key>` | 服务间调用 / 第三方集成 |

### 主要端点

| 模块 | 路径 | 方法 | 说明 |
|------|------|------|------|
| **认证** | `/auth/login` | POST | 用户登录（返回 access + refresh token） |
| | `/auth/refresh` | POST | 刷新 Token |
| | `/auth/me` | GET | 获取当前用户 |
| | `/auth/logout` | POST | 登出 |
| **项目** | `/projects` | GET/POST | 列表 / 创建 |
| | `/projects/{id}` | GET/PUT/DELETE | 详情 / 更新 / 删除 |
| | `/projects/contract-no/next` | GET | 生成合同编号（格式 `MFB-YYYYMM-XXXX`） |
| | `/projects/{id}/cashflow` | GET/POST | 现金流查询 / 创建 |
| | `/projects/{id}/renovation` | GET/PUT | 装修信息 |
| | `/projects/{id}/sales` | GET/PUT | 销售信息 |
| **线索** | `/leads` | GET/POST | 列表 / 创建 |
| | `/leads/{id}` | GET/PUT/DELETE | 详情 / 更新 / 删除 |
| | `/leads/{id}/follow-ups` | GET/POST | 跟进记录 |
| | `/leads/{id}/prices` | GET/POST | 价格历史 |
| **市场情报** | `/properties` | GET | 房源列表（导出 CSV） |
| | `/communities` | GET/POST | 小区管理 |
| | `/communities/merge` | POST | 小区合并 |
| **营销 L4** | `/admin/l4-marketing/projects` | GET/POST | 营销项目 |
| | `/admin/l4-marketing/projects/{id}` | GET/PUT/DELETE | 营销项目 CRUD |
| | `/admin/l4-marketing/projects/{id}/media` | GET/POST | 媒体管理 |
| | `/admin/l4-marketing/import` | POST | 从 L3 项目导入 |
| **监控** | `/monitor/...` | GET | 竞品 / 雷达 / 趋势 / 情绪 / AI 策略 |
| **C 端公开** | `/public/projects` | GET | 已发布房源列表（无需登录） |
| | `/public/projects/{id}` | GET | 房源详情 |
| | `/public/leads` | POST | 提交估价线索 |
| | `/public/auth/*` | POST | 注册 / 登录 / 微信登录 |
| **系统** | `/users` | GET/POST | 用户管理 |
| | `/roles` | GET/POST | 角色管理 |
| | `/upload` | POST | 文件上传 |
| | `/files` | GET | 文件管理 |
| | `/push` | POST | JSON 数据推送 |

### 速率限制

通过 `slowapi` 实现，默认 200/天、50/小时。关键端点单独配置（如 `@limiter.limit("5/minute")`）。超限返回 `429` + `Retry-After` 头。

### 响应格式

成功响应直接返回 Pydantic 模型；分页响应：

```json
{
  "items": [...],
  "total": 100,
  "page": 1,
  "size": 50
}
```

错误响应（由全局异常 handler 统一封装）：

```json
{
  "code": 404,
  "message": "资源不存在",
  "detail": "Project not found: xxx"
}
```

---

## 🗄️ 数据库设计

### 配置

- **引擎**：PostgreSQL 16（Docker 镜像 `postgres:16-alpine`）
- **驱动**：`psycopg[binary]`（SQLAlchemy 方言 `postgresql+psycopg://`）
- **连接池**：`QueuePool`（`pool_size=10`，`max_overflow=20`，`pool_pre_ping=True`，`pool_recycle=3600`）
- **时区**：所有 `DateTime` 列使用 `DateTime(timezone=True)`，PG 存储为 `TIMESTAMP WITH TIME ZONE`
- **编译缓存**：`execution_options={"compiled_cache": {}}`
- **建表**：通过 `Base.metadata.create_all` 自动建表（应用启动时执行 `init_db()`）
- **数据迁移**：`backend/migrations/` 目录下的幂等启动迁移（列变更、明文加密等），应用启动时自动执行；schema 变更通过 Alembic 管理（如需）

### ER 概览

```mermaid
erDiagram
    USER ||--o{ PROJECT : "manages"
    USER }|--|| ROLE : "has"
    USER ||--o{ API_KEY : "owns"
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
    PROPERTY_CURRENT ||--o{ PROPERTY_HISTORY : "snapshots"
    PROPERTY_CURRENT ||--o{ PROPERTY_MEDIA : "has"
    PROPERTY_CURRENT }o--|| COMMUNITY : "belongs_to"
    COMMUNITY ||--o{ COMMUNITY_ALIAS : "has"
    COMMUNITY ||--o{ COMMUNITY_COMPETITOR : "competes_with"
    PROPERTY_IMPORT_TASK ||--o{ FAILED_RECORD : "logs"
```

### 核心表

| 表 | 模块 | 说明 |
|----|------|------|
| `users` | user | 用户（含微信字段、加密手机号、`must_change_password` 标记） |
| `roles` | user | 角色（admin / operator / user / customer） |
| `api_keys` | user | API Key（哈希存储，过期时间，最后使用时间） |
| `communities` | property | 小区（含别名、竞品关联） |
| `property_current` | property | 房源当前数据 |
| `property_history` | property | 房源历史快照 |
| `property_media` | property | 房源媒体 |
| `leads` | lead | 线索（含评估价、状态、来源 property_id） |
| `lead_followups` | lead | 线索跟进 |
| `lead_price_history` | lead | 线索价格历史 |
| `projects` | project | 项目主表（status: signing/renovating/selling/sold/deleted） |
| `project_contracts` | project | 合同（合同号唯一，自动生成 `MFB-YYYYMM-XXXX`） |
| `project_owners` | project | 业主（身份证加密） |
| `project_sales` | project | 销售信息 |
| `project_renovations` | project | 装修（含硬装合同 / 软装 / 设计费 / 拆除费等） |
| `renovation_photos` | project | 装修照片（按阶段） |
| `project_follow_ups` | project | 项目跟进 |
| `project_interactions` | project | 带看 / 出价等互动 |
| `project_evaluations` | project | 评估记录 |
| `finance_records` | project | 财务流水（income/expense） |
| `project_status_logs` | project | 状态变更日志 |
| `l4_marketing_projects` | marketing | 营销项目 |
| `l4_marketing_media` | marketing | 营销媒体 |
| `property_import_tasks` | system | 导入任务（CSV/JSON 批量） |
| `failed_records` | system | 导入失败记录 |

### 索引策略

- 高频筛选字段（`status`、`is_deleted`）建索引
- 外键字段建索引（`project_id`、`user_id`、`community_id`）
- 唯一约束建唯一索引（`username`、`phone`、`contract_no`）
- 复合索引优化多条件查询（如 `(project_id, record_date)`）

---

## 🔄 核心业务流程

### 项目生命周期

```mermaid
stateDiagram-v2
    [*] --> signing: 创建项目
    signing --> renovating: 进入装修
    renovating --> selling: 装修完成上架
    selling --> sold: 成交
    sold --> [*]
    signing --> deleted: 删除
    renovating --> deleted: 删除
    selling --> deleted: 删除
```

各阶段在 `project_detail/views/` 下有独立视图：
- `default/` — 基础信息 + 附件 + 交付
- `renovation/` — 装修时间线 + 合同 + 成本汇总 + 阶段照片
- `selling/` — 活动 / 团队 / KPI / 成交对话框
- `sold/` — 财务生命周期 + 视觉旅程 + 总结报告

### 线索转化

```mermaid
sequenceDiagram
    participant U as 用户
    participant L2 as L2 线索层
    participant L3 as L3 项目层
    participant DB as 数据库

    U->>L2: 创建线索
    L2->>DB: 保存
    loop 跟进评估
        U->>L2: 添加跟进 / 价格历史
        L2->>DB: 保存
    end
    alt 通过评估
        U->>L2: 状态 → approved
        L2->>L3: 写时复制创建项目
        L3->>DB: 创建项目数据
        L3-->>U: 返回项目 ID
    else 驳回
        U->>L2: 状态 → rejected
        L2->>DB: 更新状态
    end
```

### 数据导入流程

```mermaid
flowchart TD
    A[CSV/JSON 文件] --> B[创建 PropertyImportTask]
    B --> C[文件格式校验]
    C -->|失败| D[记录 FailedRecord]
    C -->|通过| E[解析数据]
    E --> F[字段验证]
    F -->|失败| D
    F -->|通过| G[批量插入]
    G --> H{部分失败?}
    H -->|是| D
    H -->|否| I[任务完成]
    D --> I
```

### 四层数据流转

```mermaid
graph TB
    L1[(property_current)]
    L2[(leads)]
    L3[(projects)]
    L4[(l4_marketing_projects)]

    L1 -.->|写时复制| L2
    L2 -.->|写时复制| L3
    L3 -.->|写时复制| L4
```

---

## 🌐 部署指南

### 部署架构

```
浏览器 → 宿主 Nginx (:80/443) ─┬─→ frontend 容器 (127.0.0.1:3000, Next.js standalone)
                                ├─→ backend 容器 (127.0.0.1:8000, FastAPI + uvicorn)
                                │     └─→ db 容器 (5432, PostgreSQL 16)
                                └─→ uploads volume (/static/uploads/)
```

### 涉及文件

| 文件 | 作用 |
|------|------|
| [`docker-compose.yml`](docker-compose.yml) | 编排 db / backend / frontend 三个服务，backend/frontend 仅暴露到 `127.0.0.1`，由宿主 nginx 反代 |
| [`backend/Dockerfile`](backend/Dockerfile) | 后端多阶段构建：builder（uv sync）→ runner（uvicorn） |
| [`frontend/Dockerfile`](frontend/Dockerfile) | 前端三阶段构建：deps（pnpm install）→ builder（next build standalone）→ runner |
| [`.env.docker.example`](.env.docker.example) | 环境变量模板（由 `init-env.sh` 自动复制并填充密钥） |
| [`init-env.sh`](init-env.sh) | 一键生成 PostgreSQL/JWT/Fernet 密钥并初始化 `.env` |
| [`setup.sh`](setup.sh) | 一键初始化数据库表与管理员账号（支持 `--docker` 生产模式） |
| [`deploy-server.sh`](deploy-server.sh) | 服务器端部署脚本：加载镜像、启动 compose、健康检查 |
| [`deploy-local.sh`](deploy-local.sh) | 本地构建并推送镜像到服务器，触发服务器端部署 |

### 快速部署流程

```bash
# 1. 克隆代码
git clone <repo-url> profo && cd profo

# 2. 生成密钥并初始化 .env（自动从模板创建并填入随机密钥）
./init-env.sh

# 3. 构建并启动
docker compose up -d --build

# 4. 初始化数据库 + 管理员（首次部署）
./setup.sh --docker
# 会打印临时密码，首次登录强制修改

# 5. 验证
curl http://127.0.0.1:8000/health
# {"status":"healthy","database":"connected"}
```

### 生产环境注意事项

1. **HTTPS**：当前 compose 内不运行 nginx，生产环境需在宿主机器配置 nginx/Caddy/Traefik 等反代，并终止 HTTPS。宿主反代目标为 `127.0.0.1:3000`（前端）与 `127.0.0.1:8000`（后端 API/静态资源），示例配置可参考 `docs/server-conf/`。
2. **密钥管理**：`.env` 中的 `JWT_SECRET_KEY` / `ENCRYPTION_KEY` / `POSTGRES_PASSWORD` 务必使用强随机值，**严禁提交到 Git**（`.env` 已在 `.gitignore` 中）。
3. **数据库备份**：定期备份 `pgdata` volume，或使用 `pg_dump`：
   ```bash
   docker compose exec db pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup_$(date +%F).sql
   ```
4. **日志**：`docker compose logs -f` 跟踪日志；如需持久化，建议配置外部日志驱动。
5. **资源限制**：低配服务器可在 `docker-compose.yml` 中添加 `mem_limit` / `cpus` 限制单个容器资源。
6. **密码安全**：`POSTGRES_PASSWORD` 避免包含 `#`、`@`、`:`、`/` 等 URL 保留字符，防止 `DATABASE_URL` 解析失败。如必须使用，需对密码做 URL 编码。

### 升级流程

```bash
# 拉取最新代码
git pull

# 重新构建并启动（保留数据）
docker compose up -d --build

# 如有 schema 变更，应用会通过 migrations/ 自动执行幂等迁移
```

---

## 🔄 数据迁移

### 启动时数据迁移（自动）

`backend/migrations/` 目录下的迁移在应用启动时由 `main.py` 的 `lifespan` 调用 `run_startup_migrations(engine)` 自动执行，幂等设计：
- 列变更（`ALTER TABLE ADD COLUMN`）
- 明文手机号加密
- 图片 URL 路径修正（绝对 URL → 相对路径）

无需手动执行。

---

## 📐 开发规范

详见 [AGENTS.md](AGENTS.md)。核心要点：

### 通用

- **不准猜**：需求歧义列出选项再问；困惑立刻停手描述
- **全栈归位**：业务逻辑/持久化 → 后端；交互/计算 → 前端
- **最简代码**：不写非必需功能；单次使用不抽 util/hook
- **精准修改**：只改需求相关，不动相邻代码；清理孤儿 import/变量

### 前端

- 默认 Server Component，仅 `'use client'` 当需浏览器 API / 客户端状态
- shadcn/ui：不修改 `ui/` 源码，样式用 `cn()` 覆盖，逻辑封装到 `custom/`
- 类型：API 消费用 `pnpm gen-api` 生成，禁手写
- 表单 Zod schema 需与后端 Pydantic 语义对齐

### 后端

- 严格分层 Router → Service → Model，Router 禁 SQL 查询
- 关联用逻辑外键，级联由 Service 处理
- Service 层抛 `ServiceException`，**禁止抛 `HTTPException`**
- 所有函数完整类型注解；Pydantic 分 `*Create/*Update/*Response/*Filter`
- 文件 >250 行需注释说明不拆理由
- Schema 变更通过 Alembic 迁移管理；启动时 `migrations/` 会执行幂等兼容迁移

### 提交前

- `pytest` 全绿，`tsc --noEmit` 零错，`pnpm lint` 通过
- 接口变更：启后端 → `pnpm gen-api` → 提交生成的类型
- 账号密码从环境变量读取，**严禁硬编码提交**

### Conventional Commits

```
<type>(<scope>): <subject>

类型: feat | fix | docs | style | refactor | test | chore
```

---

## ❓ 常见问题

### Q1: 后端启动报 `JWT_SECRET_KEY not set` / `ENCRYPTION_KEY not set`

`.env` 缺少必填环境变量。最简单的方式是运行 `./init-env.sh` 自动生成所有密钥：

```bash
./init-env.sh        # 生成并写入 POSTGRES_PASSWORD / JWT_SECRET_KEY / ENCRYPTION_KEY
./init-env.sh --show # 查看完整密钥（默认打码）
```

或手动生成单个密钥：

```bash
openssl rand -hex 32          # JWT_SECRET_KEY
openssl rand -base64 32       # ENCRYPTION_KEY (Fernet)
# 或
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### Q2: Docker 部署后管理后台登录显示"网络错误，请连接后端服务"

**根因**：frontend 容器内的 Server Action 默认通过 `http://127.0.0.1:8000` 调后端，但容器内该地址指向 frontend 自身。

**修复**：`docker-compose.yml` 的 frontend 服务已配置 `SERVER_API_URL: http://backend:8000`，让 Server Action 直连 backend 容器。如仍报错，检查：

```bash
docker compose exec frontend wget -qO- http://backend:8000/health
# 应返回 {"status":"healthy","database":"connected"}
```

### Q3: 启动报 `POSTGRES_PASSWORD` URL 解析失败

**根因**：`.env` 中 `POSTGRES_PASSWORD` 包含 `#`、`@`、`:`、`/` 等 URL 保留字符，被 `DATABASE_URL` 解析器误判。

**修复**：改用纯字母数字密码，或对密码做 URL 编码（`python -c "import urllib.parse; print(urllib.parse.quote('你的密码'))"`）。

### Q4: 忘记管理员密码

使用 `setup.sh --reset-admin` 重置（自动生成新临时密码）：

```bash
# Docker 部署环境
./setup.sh --docker --reset-admin

# 本地开发环境
./setup.sh --reset-admin
```

或指定新密码：

```bash
./setup.sh --docker --admin-password 'YourNew!Pass1'
```

> 密码需满足强度策略：≥8 位，含大小写字母、数字、特殊字符。

### Q5: 前端类型错误 `Property 'xxx' does not exist`

后端接口变更后未同步类型：

```bash
# 1. 启动后端
docker compose up -d backend

# 2. 重新生成类型
cd frontend && pnpm gen-api
```

### Q6: API 返回 401

检查清单：
1. 请求头包含 `Authorization: Bearer <token>` 或通过 httpOnly Cookie
2. Token 未过期（默认 30 分钟，可用 refresh token 刷新）
3. 用户状态为 `active`
4. 用户具有相应权限（admin / operator / user / customer）

### Q7: 文件上传失败

- 大小不超过 100 MB
- 类型在允许列表：`.jpg .jpeg .png .pdf .xlsx .xls .csv .doc .docx .md`
- `uploads` volume 挂载正常：`docker compose exec backend ls /app/static/uploads`
- `Content-Type: multipart/form-data`

### Q8: 前端启动报 `Module not found`

```bash
cd frontend
rm -rf node_modules pnpm-lock.yaml .next
pnpm install
```

### Q9: 如何重置整个环境（清空数据）

```bash
docker compose down              # 停止并删除容器
docker compose down -v           # 同时删除 pgdata volume（数据丢失！）
docker compose up -d --build     # 重新启动
./setup.sh --docker              # 重新初始化数据库 + 管理员
```

---

## 📁 项目结构

```
ProFo/
├── README.md                      # 本文件
├── AGENTS.md                      # 编码规范（必读）
├── CLAUDE.md                      # Claude Code 指引
├── DESIGN.md                      # 设计风格参考
│
├── docker-compose.yml             # Docker Compose 编排（db / backend / frontend）
├── docker-compose.dev.yml         # 开发环境 override（映射 db 端口到本地）
├── .env.docker.example            # Docker 部署环境变量模板
├── init-env.sh                    # 一键生成密钥并初始化 .env
├── setup.sh                       # 一键初始化数据库与管理员账号
├── dev-start.sh                   # 本地开发一键启停（db + backend + frontend）
├── deploy-local.sh                # 本地构建镜像并推送到服务器
├── deploy-server.sh               # 服务器端加载镜像并启动 compose
│
├── frontend/                      # 前端（Next.js 16，standalone 输出）
│   ├── src/
│   │   ├── app/
│   │   │   ├── (main)/            # B 端受保护路由组
│   │   │   │   ├── admin/         # 仪表盘 + 市场数据
│   │   │   │   ├── projects/      # 项目管理（cashflow / monitor / detail views）
│   │   │   │   ├── leads/         # 线索管理（含监控仪表盘）
│   │   │   │   ├── l4-marketing/  # 营销 CMS（照片 DnD + 预览）
│   │   │   │   ├── properties/    # 房源（列表 / 上传 / 治理合并）
│   │   │   │   ├── users/         # 用户 + 角色管理
│   │   │   │   ├── settings/api-key/  # API Key 管理
│   │   │   │   └── layout.tsx     # 鉴权布局
│   │   │   ├── (c)/               # C 端公开路由组
│   │   │   │   ├── projects/      # 房源浏览
│   │   │   │   ├── valuation/     # 估价提交
│   │   │   │   ├── login/ register/ my/ profile/
│   │   │   │   └── about/ contact/
│   │   │   ├── login/             # B 端登录
│   │   │   └── api/auth/refresh/  # Next.js API 路由（Token 刷新）
│   │   ├── components/ui/         # shadcn/ui 组件
│   │   ├── lib/                   # api-server / api-client / api-types / config / formatters / utils
│   │   └── hooks/
│   ├── public/
│   ├── next.config.ts             # React Compiler + rewrites 代理
│   ├── Dockerfile                 # 多阶段构建（deps → builder → runner）
│   ├── playwright.config.ts       # E2E 测试
│   └── package.json
│
├── backend/                       # 后端（FastAPI）
│   ├── routers/                   # 按领域分模块（见上文）
│   ├── services/                  # 按领域分模块
│   ├── models/                    # 按领域分模块
│   ├── schemas/                   # 按领域分模块
│   ├── dependencies/              # auth / common / projects
│   ├── utils/                     # auth / crypto / csv_exporter / file_security / formatters / jwt_validator / param_parser / query_params / security_logger
│   ├── migrations/                # 启动时幂等迁移（列变更 / 明文加密 / URL 修正）
│   ├── scripts/                   # 一次性脚本
│   ├── main.py                    # 应用入口
│   ├── db.py                      # SQLAlchemy 引擎 + 会话（PostgreSQL）
│   ├── settings.py                # Pydantic Settings
│   ├── error_handlers.py          # 全局异常 handler
│   ├── exceptions.py              # 通用异常
│   ├── init_db.py                 # 建表脚本
│   ├── init_admin.py              # 初始化角色和管理员
│   ├── conftest.py                # pytest 配置（PostgreSQL + SAVEPOINT 隔离）
│   ├── Dockerfile                 # 多阶段构建（builder → runner）
│   ├── pyproject.toml             # 依赖与工具配置
│   └── uv.lock
│
├── .github/workflows/lint.yml     # GitHub Actions Lint
└── .gitignore
```

---

## 📚 相关链接

- [FastAPI 官方文档](https://fastapi.tiangolo.com/)
- [Next.js 官方文档](https://nextjs.org/docs)
- [TailwindCSS 官方文档](https://tailwindcss.com/docs)
- [SQLAlchemy 官方文档](https://docs.sqlalchemy.org/)
- [PostgreSQL 官方文档](https://www.postgresql.org/docs/)
- [Docker Compose 官方文档](https://docs.docker.com/compose/)
- [shadcn/ui](https://ui.shadcn.com/)
- [uv 包管理器](https://docs.astral.sh/uv/)

---

<p align="center">
  <b>ProFo — 让房地产翻新与销售管理更简单</b>
</p>
