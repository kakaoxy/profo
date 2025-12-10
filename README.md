# Profo 房产数据中心

轻量级、本地化、高性能的房产数据仓库系统。

## 功能特性

### 核心功能
- 📊 **CSV 文件批量导入房源数据** - 支持大文件上传，自动编码检测，批量处理
- 🔌 **JSON API 接口推送数据** - 支持批量房源数据推送，实时验证和导入
- 🔍 **多维度房源查询与筛选** - 支持状态、小区、价格、面积、户型等多条件组合查询
- 📤 **数据导出功能** - 支持按筛选条件导出 CSV 文件
- 🏘️ **小区数据治理** - 智能合并重复小区，自动创建别名映射
- 📈 **历史数据追踪** - 完整记录房源状态变更历史
- ⚡ **高性能展示** - 虚拟滚动技术支持万条数据流畅展示

### 项目管理功能（新增）
- 🏗️ **项目生命周期管理** - 支持签约、改造、在售、已售四个阶段管理
- 💰 **现金流管理** - 项目收支记录，自动计算 ROI 和投资回报率
- 📸 **改造阶段跟踪** - 支持上传各阶段照片，记录改造进度
- 🤝 **销售过程管理** - 带看、出价、面谈记录管理
- 📊 **项目报告生成** - 自动生成项目完整报告

### 用户管理功能（新增）
- 🔐 **完整的认证体系** - JWT 令牌认证，支持访问令牌和刷新令牌
- 👥 **用户角色管理** - 管理员、运营人员、普通用户三级权限
- 🔑 **密码策略管理** - 强制密码强度验证，首次登录修改密码
- 📱 **微信登录集成** - 支持微信公众号和小程序登录

## 技术栈

**后端:**
- **Python 3.10+** - 现代 Python 版本，支持类型提示和异步编程
- **UV** - 高性能 Python 包管理器
- **FastAPI** - 现代高性能 Web 框架，自动生成 API 文档
- **SQLAlchemy 2.0** - 强大的 ORM 框架，支持异步操作
- **SQLite** - 轻量级嵌入式数据库，适合本地化部署
- **Pydantic** - 数据验证和序列化
- **Python-JOSE** - JWT 令牌处理
- **python-multipart** - 文件上传处理
- **python-dotenv** - 环境变量管理

**前端:**
- **Vue 3** - 渐进式 JavaScript 框架
- **TypeScript** - 类型安全的 JavaScript 超集
- **Vite** - 下一代前端构建工具
- **Pinia** - Vue 状态管理库
- **TailwindCSS** - 实用优先的 CSS 框架
- **@tanstack/vue-virtual** - 虚拟滚动库，支持大数据量展示
- **Axios** - HTTP 客户端
- **Vue Router** - Vue.js 官方路由管理器

**开发工具:**
- **Alembic** - 数据库迁移工具
- **pytest** - Python 测试框架
- **Vitest** - Vite 原生测试框架
- **ESLint** - JavaScript/TypeScript 代码检查

## 环境准备

### 1. 安装 Python 3.10+

确保系统已安装 Python 3.10 或更高版本：

```bash
python --version
```

### 2. 安装 UV (Python 包管理器)

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows (PowerShell)
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```

### 3. 安装 Node.js 18+

从 [nodejs.org](https://nodejs.org/) 下载安装，或使用包管理器：

```bash
# macOS (Homebrew)
brew install node

# Windows (Chocolatey)
choco install nodejs
```

### 4. 安装 pnpm

```bash
npm install -g pnpm
```

## 快速开始

### 安装依赖

**后端依赖:**
```bash
cd backend
uv sync
```

**前端依赖:**
```bash
cd frontend
pnpm install
```

### 初始化数据库

在首次使用前，需要初始化数据库以创建所有必要的表结构：

```bash
cd backend
uv run python init_db.py
```

该脚本将创建以下 6 个表：
- `communities` - 小区字典
- `community_aliases` - 小区别名映射
- `property_current` - 房源当前状态
- `property_history` - 房源历史快照
- `property_media` - 房源媒体资源
- `failed_records` - 失败记录收容所

初始化成功后，数据库文件将保存在 `backend/data.db`。

**注意:** 如果数据库文件已存在，该脚本不会删除现有数据，只会确保表结构存在。

### 启动服务

**方式一：使用一键启动脚本（推荐）**

macOS/Linux:
```bash
chmod +x start.sh
./start.sh
```

Windows (CMD):
```bash
start.bat
```

Windows (PowerShell - 推荐):
```powershell
.\start.ps1
```

> **注意:** Windows 用户推荐使用 PowerShell 脚本 (`start.ps1`)，它提供更好的进程管理和 Ctrl+C 优雅关闭支持。如果使用 `start.bat`，它会自动调用 PowerShell 脚本。

**方式二：手动启动**

后端（终端 1）:
```bash
cd backend
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

前端（终端 2）:
```bash
cd frontend
pnpm dev
```

### 访问应用

- 前端界面: http://localhost:3000
- 后端 API: http://localhost:8000
- API 文档: http://localhost:8000/docs

## 项目结构

```
profo-real-estate/
├── backend/                 # 后端服务
│   ├── pyproject.toml      # Python 依赖配置
│   ├── main.py             # FastAPI 应用入口
│   ├── settings.py         # 应用配置
│   ├── db.py               # 数据库连接
│   ├── init_db.py          # 数据库初始化脚本
│   ├── alembic.ini         # 数据库迁移配置
│   ├── routers/            # API 路由模块
│   │   ├── __init__.py     # 路由聚合
│   │   ├── push.py         # JSON 数据推送接口
│   │   ├── upload.py       # CSV 文件上传接口
│   │   ├── properties.py   # 房源查询接口
│   │   ├── admin.py        # 小区管理接口
│   │   ├── projects_simple.py  # 项目管理接口（简化版）
│   │   ├── cashflow_simple.py  # 现金流管理接口
│   │   ├── files.py        # 文件上传接口
│   │   ├── auth.py         # 认证相关接口
│   │   └── users.py        # 用户管理接口
│   ├── models/             # 数据库模型
│   │   ├── __init__.py
│   │   ├── base.py         # 基础模型
│   │   ├── property.py     # 房源相关模型
│   │   ├── community.py    # 小区相关模型
│   │   ├── project.py      # 项目相关模型
│   │   ├── user.py         # 用户相关模型
│   │   ├── media.py        # 媒体资源模型
│   │   └── error.py        # 错误记录模型
│   ├── schemas/            # Pydantic 验证模型
│   │   ├── __init__.py
│   │   ├── property.py     # 房源相关验证模型
│   │   ├── community.py    # 小区相关验证模型
│   │   ├── project.py      # 项目相关验证模型
│   │   ├── user.py         # 用户相关验证模型
│   │   ├── upload.py       # 上传相关验证模型
│   │   ├── common.py       # 通用验证模型
│   │   └── enums.py        # 枚举定义
│   ├── services/           # 业务逻辑服务
│   │   ├── __init__.py
│   │   ├── importer.py     # 数据导入服务
│   │   ├── merger.py       # 小区合并服务
│   │   ├── project_service.py  # 项目管理服务
│   │   ├── cashflow_service.py # 现金流服务
│   │   └── parser.py       # 数据解析服务
│   ├── utils/              # 工具函数
│   │   ├── __init__.py
│   │   ├── auth.py         # 认证工具
│   │   ├── jwt_validator.py    # JWT 验证
│   │   ├── param_parser.py     # 参数解析
│   │   ├── query_params.py     # 查询参数处理
│   │   ├── permission.py       # 权限管理
│   │   └── dateUtils.ts      # 日期工具（前端）
│   ├── dependencies/       # 依赖注入
│   │   ├── __init__.py
│   │   └── auth.py         # 认证依赖
│   ├── exceptions/         # 自定义异常
│   │   ├── __init__.py
│   │   └── exceptions.py   # 异常定义
│   ├── error_handlers/     # 错误处理
│   │   ├── __init__.py
│   │   └── error_handlers.py   # 错误处理器
│   ├── alembic/            # 数据库迁移
│   │   ├── env.py
│   │   ├── versions/       # 迁移版本
│   │ └── script.py.mako
│   ├── static/             # 静态文件
│   │   └── uploads/        # 上传文件存储
│   └── tests/              # 测试文件
│       ├── __init__.py
│       └── test_*.py       # 各类测试
├── frontend/               # 前端应用
│   ├── package.json        # Node.js 依赖配置
│   ├── vite.config.ts      # Vite 配置
│   ├── tsconfig.json       # TypeScript 配置
│   ├── tailwind.config.js  # TailwindCSS 配置
│   ├── src/
│   │   ├── main.ts         # 应用入口
│   │   ├── App.vue         # 根组件
│   │   ├── env.d.ts        # 环境类型定义
│   │   ├── router/         # 路由配置
│   │   ├── stores/         # Pinia 状态管理
│   │   ├── pages/          # 页面组件
│   │   ├── components/     # 可复用组件
│   │   ├── api/            # API 客户端
│   │   ├── composables/    # Vue 组合式函数
│   │   ├── utils/          # 工具函数
│   │   ├── styles/         # 样式文件
│   │   └── tests/          # 前端测试
│   └── index.html
├── start.sh                # 启动脚本 (macOS/Linux)
├── start.bat               # 启动脚本 (Windows)
├── start.ps1               # 启动脚本 (Windows PowerShell)
├── API_PUSH.md            # API 推送文档
├── README.md              # 项目说明文档
└── .gitignore             # Git 忽略文件
```

## 使用说明

### 1. 数据导入

#### CSV 文件上传
访问上传页面，拖拽或选择 CSV 文件进行批量导入。系统支持：
- 自动编码检测（UTF-8、GBK、GB2312 等）
- 智能日期格式解析
- 批量处理，支持大文件
- 失败记录自动保存，可下载查看

CSV 文件应包含以下核心列：
- `数据源` - 数据来源平台
- `房源ID` - 来源平台房源ID
- `状态` - 在售/成交
- `小区名` - 小区名称
- `室`、`厅`、`卫` - 户型信息
- `朝向` - 房屋朝向
- `楼层` - 原始楼层字符串
- `面积` - 建筑面积(㎡)
- `挂牌价(万)` / `成交价(万)` - 价格信息
- `上架时间` / `成交时间` - 时间信息

#### JSON API 推送
使用 `POST /api/push` 接口批量推送 JSON 数据：
```bash
curl -X POST "http://localhost:8000/api/push" \
  -H "Content-Type: application/json" \
  -d "[{\"数据源\":\"api_partner\",\"房源ID\":\"A001\",\"状态\":\"在售\",\"小区名\":\"示例小区\",\"室\":3,\"厅\":2,\"卫\":2,\"朝向\":\"南\",\"楼层\":\"15/28\",\"面积\":120.5,\"挂牌价\":500.0,\"上架时间\":\"2024-01-15T10:00:00\"}]"
```

### 2. 房源查询与筛选

在主页使用筛选面板，支持多维度组合查询：

**基础筛选：**
- 按状态筛选（全部/在售/成交）
- 按小区名模糊搜索
- 按价格范围筛选
- 按面积范围筛选
- 按户型筛选（室数量）

**高级筛选：**
- 按行政区筛选（多选）
- 按商圈筛选（多选）
- 按朝向关键词筛选（南、北、东西等）
- 按楼层级别筛选（低楼层、中楼层、高楼层）

**排序功能：**
- 支持按更新时间、创建时间、价格、面积等字段排序
- 支持升序和降序排列

### 3. 数据导出

点击导出按钮，系统将根据当前筛选条件生成 CSV 文件下载：
- 保留所有筛选条件
- 包含完整房源信息
- 自动处理中文编码（UTF-8 with BOM）
- 文件名包含时间戳

### 4. 小区数据治理

访问数据治理页面进行小区管理：

**小区查询：**
- 支持按名称模糊搜索小区
- 显示每个小区的房源数量
- 支持分页浏览

**小区合并：**
1. 搜索并选择需要合并的小区（至少 2 个）
2. 指定主记录（合并后保留的小区）
3. 确认合并操作
4. 系统自动创建别名映射，更新所有关联房源

**字典管理：**
- 获取行政区列表（去重）
- 获取商圈列表（去重）
- 支持模糊搜索过滤

### 5. 项目管理（新增）

完整的项目生命周期管理：

**项目创建：**
- 创建新项目，记录基本信息（名称、小区、地址、业主信息等）
- 项目初始状态为"签约阶段"

**状态流转：**
- 签约阶段 → 改造阶段 → 在售阶段 → 已售阶段
- 每个阶段有特定的操作权限

**改造阶段管理：**
- 更新改造子阶段（拆除、设计、水电、木瓦、油漆、安装、交付）
- 上传各阶段照片
- 记录阶段完成时间

**销售过程管理：**
- 设置销售角色（房源维护人、客源维护人、首看人）
- 记录带看、出价、面谈等销售活动
- 管理客户信息

**现金流管理：**
- 记录项目收支（装修费、营销费、售房款等）
- 自动计算总投资、总收入、净利润、ROI
- 支持按项目查看现金流明细

**项目报告：**
- 生成项目完整报告
- 包含基本信息、时间线、财务数据等

### 6. 用户管理（新增）

**认证与授权：**
- JWT 令牌认证（访问令牌 + 刷新令牌）
- 基于角色的访问控制（RBAC）
- 三级权限：管理员、运营人员、普通用户

**用户管理：**
- 用户列表查询（支持搜索和筛选）
- 创建、更新、删除用户
- 密码强度验证
- 强制首次登录修改密码

**角色管理：**
- 角色列表查询
- 创建、更新、删除角色
- 权限配置（查看数据、编辑数据、用户管理、角色管理）

**微信登录：**
- 微信公众号授权登录
- 微信小程序登录
- 自动创建新用户或更新现有用户

### 7. 系统管理

**数据初始化：**
```bash
cd backend
uv run python init_db.py
```
该脚本将创建所有必要的表结构，数据库文件保存在 `backend/data.db`。

**系统数据初始化：**
首次部署时访问 `POST /api/users/init-data` 接口创建初始数据：
- 创建默认角色（管理员、运营人员、普通用户）
- 创建临时管理员账户（用户名：admin）
- 返回临时密码（仅显示一次，请妥善保存）

**健康检查：**
访问 `GET /health` 检查系统状态

## 常见问题

**Q: 启动时提示端口被占用？**

A: 修改端口配置：
- 后端: 在启动命令中修改 `--port 8000`
- 前端: 修改 `frontend/vite.config.ts` 中的 `server.port`

**Q: CSV 上传失败？**

A: 检查：
1. 文件编码是否为 UTF-8
2. 必填字段是否完整
3. 数据格式是否符合要求

**Q: 数据库文件在哪里？**

A: SQLite 数据库文件位于 `backend/data.db`

## 开发指南

详细的开发文档请参考：
- [需求文档](.kiro/specs/profo-real-estate/requirements.md)
- [设计文档](.kiro/specs/profo-real-estate/design.md)
- [任务列表](.kiro/specs/profo-real-estate/tasks.md)

## License

MIT
