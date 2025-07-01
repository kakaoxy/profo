# Profo Backend - 房源信息管理后台API服务

## 快速开始

### 1. 安装依赖
```bash
pip install -e .
```

### 2. 启动服务器
```bash
# 方式1: 使用快速启动脚本
python start_server.py

# 方式2: 直接启动
python main.py
```

### 3. 访问API文档
- 服务地址: http://localhost:8000
- API文档: http://localhost:8000/docs
- 健康检查: http://localhost:8000/health

### 4. 运行测试
```bash
# 运行所有测试
python run_tests.py

# 运行特定测试
python run_tests.py tests/api/test_auth.py
```

## 项目特性

✅ **完整的数据模型** - 严格按照README需求实现9个表的数据模型
✅ **用户认证系统** - 支持密码登录和微信小程序登录
✅ **房源管理** - 完整的CRUD操作，支持筛选和分页
✅ **个人看房管理** - 看房笔记的创建、编辑和统计
✅ **数据看板** - 概览数据、趋势分析、最近动态
✅ **数据导入** - CSV文件导入和外部API同步
✅ **统计数据管理** - 城市成交统计和小区分析
✅ **全面测试覆盖** - 单元测试、API测试、集成测试
✅ **自动API文档** - Swagger/OpenAPI文档自动生成

## API端点概览

### 认证相关
- `POST /api/v1/auth/register` - 用户注册
- `POST /api/v1/auth/login` - 用户登录
- `POST /api/v1/auth/wechat-login` - 微信登录

### 基础数据管理
- `/api/v1/cities/` - 城市管理
- `/api/v1/agencies/` - 中介公司管理
- `/api/v1/agents/` - 经纪人管理
- `/api/v1/communities/` - 小区管理

### 核心功能
- `/api/v1/properties/` - 房源管理
- `/api/v1/my-viewings/` - 个人看房管理
- `/api/v1/dashboard/` - 数据看板
- `/api/v1/data-import/` - 数据导入
- `/api/v1/stats/` - 统计数据管理

## 技术栈

- **框架**: FastAPI 0.104+
- **数据库**: SQLite (开发) / SQLAlchemy 2.0 + SQLModel
- **认证**: JWT + bcrypt密码哈希
- **测试**: pytest + pytest-asyncio + pytest-cov
- **文档**: 自动生成的OpenAPI/Swagger文档

详细信息请查看 [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)