# Profo Backend - 房源信息管理后台API服务

## 项目概述

本项目是根据README.md文档需求实现的房源信息管理后台API服务，采用FastAPI框架开发，使用SQLite作为开发阶段数据库。

## 技术栈

- **框架**: FastAPI 0.104+
- **数据库**: SQLite (开发阶段) / SQLAlchemy 2.0 + SQLModel
- **认证**: JWT + 密码登录 + 微信小程序登录
- **测试**: pytest + pytest-asyncio + pytest-cov
- **API文档**: 自动生成的OpenAPI/Swagger文档

## 项目结构

```
backend/
├── app/                          # 应用主目录
│   ├── api/                      # API路由
│   │   ├── deps.py              # 依赖注入
│   │   └── v1/                  # API v1版本
│   │       ├── api.py           # 路由配置
│   │       └── endpoints/       # API端点
│   │           ├── auth.py      # 认证相关
│   │           ├── cities.py    # 城市管理
│   │           ├── agencies.py  # 中介公司管理
│   │           ├── agents.py    # 经纪人管理
│   │           ├── communities.py # 小区管理
│   │           ├── properties.py # 房源管理
│   │           ├── my_viewings.py # 个人看房管理
│   │           ├── dashboard.py # 数据看板
│   │           ├── data_import.py # 数据导入
│   │           └── stats.py     # 统计数据管理
│   ├── core/                    # 核心模块
│   │   ├── config.py           # 配置管理
│   │   ├── database.py         # 数据库配置
│   │   └── security.py         # 安全相关
│   ├── models/                  # 数据模型
│   │   ├── user.py             # 用户模型
│   │   ├── city.py             # 城市模型
│   │   ├── agency.py           # 中介公司模型
│   │   ├── agent.py            # 经纪人模型
│   │   ├── community.py        # 小区模型
│   │   ├── property.py         # 房源模型
│   │   ├── my_viewing.py       # 个人看房模型
│   │   ├── daily_city_stats.py # 城市每日统计模型
│   │   └── community_stats.py  # 小区周期统计模型
│   └── schemas/                 # Pydantic模式
│       ├── user.py             # 用户相关模式
│       ├── city.py             # 城市相关模式
│       ├── agency.py           # 中介公司相关模式
│       ├── agent.py            # 经纪人相关模式
│       ├── community.py        # 小区相关模式
│       ├── property.py         # 房源相关模式
│       ├── my_viewing.py       # 个人看房相关模式
│       ├── daily_city_stats.py # 城市每日统计相关模式
│       └── community_stats.py  # 小区周期统计相关模式
├── tests/                       # 测试目录
│   ├── api/                    # API测试
│   ├── models/                 # 模型测试
│   ├── services/               # 服务测试
│   └── conftest.py             # 测试配置
├── main.py                     # 应用入口
├── pyproject.toml              # 项目配置
├── .env                        # 环境变量
└── run_tests.py                # 测试运行脚本
```

## 已实现功能

### 1. 数据模型 (9个表)
- ✅ `users` - 用户表 (支持密码和微信登录)
- ✅ `cities` - 城市表
- ✅ `agencies` - 中介公司表
- ✅ `agents` - 经纪人表
- ✅ `communities` - 小区表
- ✅ `properties` - 房源主表
- ✅ `my_viewings` - 个人看房笔记表
- ✅ `daily_city_stats` - 城市每日成交统计表
- ✅ `community_stats` - 小区周期统计表

### 2. 认证系统
- ✅ 用户注册/登录 (用户名+密码)
- ✅ JWT令牌认证
- ✅ 微信小程序登录接口 (需配置微信参数)
- ✅ 权限控制和用户状态管理

### 3. 核心API端点

#### 认证相关 (`/api/v1/auth/`)
- `POST /register` - 用户注册
- `POST /login` - 用户登录
- `POST /wechat-login` - 微信登录

#### 基础数据管理
- `GET/POST/PUT/DELETE /api/v1/cities/` - 城市管理
- `GET/POST/PUT/DELETE /api/v1/agencies/` - 中介公司管理
- `GET/POST/PUT/DELETE /api/v1/agents/` - 经纪人管理
- `GET/POST/PUT/DELETE /api/v1/communities/` - 小区管理

#### 房源管理 (`/api/v1/properties/`)
- `GET /` - 获取房源列表 (支持筛选和分页)
- `POST /` - 创建房源
- `GET /{id}` - 获取房源详情
- `PUT /{id}` - 更新房源
- `DELETE /{id}` - 删除房源
- `GET /stats/summary` - 房源统计摘要

#### 个人看房管理 (`/api/v1/my-viewings/`)
- `GET /` - 获取个人看房笔记列表
- `POST /` - 创建看房笔记
- `GET /{id}` - 获取看房笔记详情
- `PUT /{id}` - 更新看房笔记
- `DELETE /{id}` - 删除看房笔记
- `GET /stats/summary` - 看房统计摘要

#### 数据看板 (`/api/v1/dashboard/`)
- `GET /stats/overview` - 看板概览数据
- `GET /stats/trend` - 交易趋势数据
- `GET /recent/properties` - 最近房源
- `GET /recent/viewings` - 最近看房笔记

#### 数据导入 (`/api/v1/data-import/`)
- `POST /csv/properties` - CSV文件导入房源
- `GET /csv/template/properties` - 下载CSV模板
- `POST /sync/external-data` - 同步外部数据

#### 统计数据管理 (`/api/v1/stats/`)
- `GET/POST/PUT/DELETE /daily-city` - 城市每日成交统计
- `GET/POST /community` - 小区周期统计
- `GET /community/{id}/trend` - 小区历史趋势

### 4. 测试覆盖
- ✅ 认证API测试 (注册、登录、权限验证)
- ✅ 城市管理API测试 (CRUD操作)
- ✅ 房源管理API测试 (CRUD + 筛选)
- ✅ 个人看房API测试 (CRUD + 统计)
- ✅ 数据看板API测试 (概览、趋势、最近数据)
- ✅ 数据导入API测试 (CSV导入、模板下载)
- ✅ 模型测试 (用户模型)
- ✅ 服务测试 (认证服务)

## 运行指南

### 1. 安装依赖
```bash
cd backend
pip install -e .
```

### 2. 配置环境变量
复制 `.env.example` 到 `.env` 并修改配置：
```bash
cp .env.example .env
```

### 3. 启动服务
```bash
python main.py
```
服务将在 http://localhost:8000 启动

### 4. 查看API文档
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### 5. 运行测试
```bash
# 运行所有测试
python run_tests.py

# 运行特定测试
python run_tests.py tests/api/test_auth.py
```

## API使用示例

### 1. 用户注册
```bash
curl -X POST "http://localhost:8000/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "testpassword123",
    "nickname": "测试用户"
  }'
```

### 2. 用户登录
```bash
curl -X POST "http://localhost:8000/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "testpassword123"
  }'
```

### 3. 创建房源 (需要认证)
```bash
curl -X POST "http://localhost:8000/api/v1/properties/" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "community_id": 1,
    "status": "在售",
    "layout_bedrooms": 2,
    "layout_living_rooms": 1,
    "area_sqm": 55.0,
    "listing_price_wan": 240.0
  }'
```

## 数据库设计

严格按照README文档要求实现了9个表的数据模型，包含所有必需字段和关系约束。

## 安全特性

- JWT令牌认证
- 密码哈希存储 (bcrypt)
- 用户权限控制
- 输入验证和错误处理
- CORS配置

## 开发特性

- 自动API文档生成
- 完整的单元测试覆盖
- 代码覆盖率报告
- 开发环境热重载
- 详细的错误日志

## 下一步计划

1. 完善输入验证和错误处理
2. 添加更多业务逻辑测试
3. 实现数据库迁移脚本
4. 添加API限流和缓存
5. 完善微信登录功能
6. 部署配置和生产环境优化
