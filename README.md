# Profo 房产数据中心

轻量级、本地化、高性能的房产数据仓库系统。

## 功能特性

- 📊 CSV 文件批量导入房源数据
- 🔌 JSON API 接口推送数据
- 🔍 多维度房源查询与筛选
- 📤 数据导出功能
- 🏘️ 小区数据治理（合并重复小区）
- 📈 历史数据追踪
- ⚡ 虚拟滚动支持万条数据流畅展示

## 技术栈

**后端:**
- Python 3.10+ with UV
- FastAPI
- SQLAlchemy 2.0
- SQLite

**前端:**
- Vue 3 + TypeScript
- Vite
- Pinia
- TailwindCSS
- @tanstack/vue-virtual

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
│   ├── models.py           # 数据库模型
│   ├── schemas.py          # Pydantic 验证模型
│   ├── db.py               # 数据库连接
│   ├── routers/            # API 路由
│   ├── services/           # 业务逻辑
│   └── init_db.py          # 数据库初始化脚本
├── frontend/               # 前端应用
│   ├── package.json        # Node.js 依赖配置
│   ├── vite.config.ts      # Vite 配置
│   ├── src/
│   │   ├── main.ts         # 应用入口
│   │   ├── App.vue         # 根组件
│   │   ├── router/         # 路由配置
│   │   ├── stores/         # Pinia 状态管理
│   │   ├── pages/          # 页面组件
│   │   ├── components/     # 可复用组件
│   │   └── api/            # API 客户端
│   └── index.html
├── start.sh                # 启动脚本 (macOS/Linux)
├── start.bat               # 启动脚本 (Windows)
└── README.md
```

## 使用说明

### 1. 上传 CSV 文件

访问上传页面，拖拽或选择 CSV 文件进行批量导入。CSV 文件应包含以下列：

- 数据源
- 房源ID
- 状态（在售/成交）
- 小区名
- 室、厅、卫
- 朝向
- 楼层
- 面积
- 挂牌价(万) / 成交价(万)
- 上架时间 / 成交时间

### 2. 查询与筛选

在主页使用筛选面板：
- 按状态筛选（全部/在售/成交）
- 按小区名搜索
- 按价格范围筛选
- 按面积范围筛选
- 按户型筛选

### 3. 导出数据

点击导出按钮，系统将根据当前筛选条件生成 CSV 文件下载。

### 4. 小区合并

访问数据治理页面：
1. 搜索并选择需要合并的小区（至少 2 个）
2. 指定主记录
3. 确认合并操作

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
