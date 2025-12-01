# API 推送文档

## 注意事项
- 标有<span style="color:red">*</span>的字段为必填项（仅用于文档标识，实际推送请勿包含星号或注释）
- 未提供必填字段时返回 `VALIDATION_ERROR`，`error.details` 会列出缺失字段
- 格式与验证规则：
  - `面积` > 0；`挂牌价`/`成交价` > 0（单位：万）
  - 时间字段为 ISO 格式：`YYYY-MM-DDTHH:MM:SS`
  - 在售必须提供 `挂牌价` 与 `上架时间`；成交必须提供 `成交价` 与 `成交时间`

## 接口概览

### 房源管理接口
- 路径：`POST /api/push`
- 功能：批量推送房源 JSON 数据，支持在售与成交两类状态
- 请求体：JSON 数组，每个元素为一条房源记录（支持中文字段别名）
- 响应：统计结果与错误详情

### 项目管理接口（新增）
- 基础路径：`/api/v1/projects`
- 功能：完整的项目生命周期管理，包括签约、改造、在售、已售四个阶段
- 支持功能：项目创建、状态流转、现金流管理、改造阶段跟踪、销售记录管理等

## 请求格式
- 内容类型：`application/json`
- 价格单位：`万`（例如 `挂牌价: 500.0` 表示 500 万）
- 必填字段（按状态动态要求）：
  - 在售（`状态: "在售"`）必须包含 `挂牌价`、`上架时间`
  - 成交（`状态: "成交"`）必须包含 `成交价`、`成交时间`

### 房源字段列表（全部支持字段）

| 参数 | 说明 | 必填 |
|---|---|---|
| 数据源 | 数据来源平台 | 是 |
| 房源ID | 来源平台房源ID | 是 |
| 状态 | 在售/成交 | 是 |
| 小区名 | 小区名称 | 是 |
| 室 | 室数量 | 是 |
| 厅 | 厅数量 | 否 |
| 卫 | 卫生间数量 | 否 |
| 朝向 | 房屋朝向 | 是 |
| 楼层 | 原始楼层字符串 | 是 |
| 面积 | 建筑面积(㎡) | 是 |
| 套内面积 | 套内面积(㎡) | 否 |
| 挂牌价 | 在售：挂牌价(万) | 是(在售) |
| 上架时间 | 在售：上架时间 | 是(在售) |
| 成交价 | 成交：成交价(万) | 是(成交) |
| 成交时间 | 成交：成交时间 | 是(成交) |
| 物业类型 | 物业类型 | 否 |
| 建筑年代 | 建筑年代 | 否 |
| 建筑结构 | 建筑结构 | 否 |
| 装修情况 | 装修情况 | 否 |
| 电梯 | 是否有电梯 | 否 |
| 产权性质 | 产权性质 | 否 |
| 产权年限 | 产权年限 | 否 |
| 上次交易 | 上次交易信息 | 否 |
| 供暖方式 | 供暖方式 | 否 |
| 房源描述 | 房源描述 | 否 |
| 城市ID | 城市ID | 否 |
| 行政区 | 行政区 | 否 |
| 商圈 | 商圈 | 否 |
| 图片链接 | 房源图片URL列表 | 否 |

### 项目管理接口字段（新增）

#### 项目主状态
- `signing`（签约阶段）
- `renovating`（改造阶段）
- `selling`（在售阶段）
- `sold`（已售阶段）

#### 改造子阶段
- `拆除`、`设计`、`水电`、`木瓦`、`油漆`、`安装`、`交付`

#### 现金流类型
- `income`（收入）
- `expense`（支出）

#### 现金流分类
- **支出类**：`履约保证金`、`中介佣金`、`装修费`、`营销费`、`其他支出`、`税费`、`运营杂费`
- **收入类**：`回收保证金`、`溢价款`、`服务费`、`其他收入`、`售房款`

说明：后端支持中文别名与英文字段名（已启用别名映射）。
- `图片链接` 字段支持字符串（逗号分隔）或字符串数组格式
- 所有图片统一存储，不区分户型图/室内图等类型
- 前端负责从图片列表中选择展示方式

## 推送示例

### 在售房源示例
```jsonc
[
  {
    "数据源": "api_partner", // <span style="color:red">*</span>
    "房源ID": "A001", // <span style="color:red">*</span>
    "状态": "在售", // <span style="color:red">*</span>
    "小区名": "示例小区", // <span style="color:red">*</span>
    "室": 3, // <span style="color:red">*</span>
    "厅": 2,
    "卫": 2,
    "朝向": "南", // <span style="color:red">*</span>
    "楼层": "15/28", // <span style="color:red">*</span>
    "面积": 120.5, // <span style="color:red">*</span>
    "挂牌价": 500.0, // <span style="color:red">*</span> 在售必填
    "上架时间": "2024-01-15T10:00:00" // <span style="color:red">*</span> 在售必填
  }
]
```
- 标注说明：标有<span style="color:red">*</span>的字段为必填项；示例中的注释仅用于文档说明，实际推送请勿包含注释或星号。

验证失败示例响应（缺少在售必填字段）：
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数验证失败",
    "details": "缺少必填字段: 挂牌价; 缺少必填字段: 上架时间"
  }
}
```

### 成交房源示例
```jsonc
[
  {
    "数据源": "api_partner", // <span style="color:red">*</span>
    "房源ID": "S003", // <span style="color:red">*</span>
    "状态": "成交", // <span style="color:red">*</span>
    "小区名": "示例小区", // <span style="color:red">*</span>
    "室": 3, // <span style="color:red">*</span>
    "厅": 2,
    "卫": 2,
    "朝向": "南北", // <span style="color:red">*</span>
    "楼层": "高楼层/25", // <span style="color:red">*</span>
    "面积": 110.0, // <span style="color:red">*</span>
    "成交价": 480.0, // <span style="color:red">*</span> 成交必填
    "成交时间": "2024-02-15T14:30:00" // <span style="color:red">*</span> 成交必填
  }
]
```
验证失败示例响应（缺少成交必填字段）：
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数验证失败",
    "details": "缺少必填字段: 成交价; 缺少必填字段: 成交时间"
  }
}
```

### 在售房源完整示例
```json
[
  {
    "数据源": "api_partner",
    "房源ID": "A1001",
    "状态": "在售",
    "小区名": "万科城市花园",
    "城市ID": 310000,
    "行政区": "闵行",
    "商圈": "莘庄",
    "室": 3,
    "厅": 2,
    "卫": 2,
    "朝向": "南",
    "楼层": "15/28",
    "面积": 120.5,
    "套内面积": 98.0,
    "挂牌价": 800.0,
    "上架时间": "2024-01-15T10:00:00",
    "物业类型": "普通住宅",
    "建筑年代": 2015,
    "建筑结构": "框架结构",
    "装修情况": "精装",
    "电梯": true,
    "产权性质": "商品房",
    "产权年限": 70,
    "上次交易": "2020-06-01",
    "供暖方式": "集中供暖",
    "房源描述": "满五唯一，采光好，无遮挡",
    "图片链接": [
      "https://example.com/images/living-room.jpg",
      "https://example.com/images/bedroom.jpg",
      "https://example.com/images/floor-plan.jpg"
    ]
  }
]
```

### 成交房源完整示例
```json
[
  {
    "数据源": "api_partner",
    "房源ID": "S2001",
    "状态": "成交",
    "小区名": "保利香槟",
    "城市ID": 310000,
    "行政区": "浦东",
    "商圈": "张江",
    "室": 2,
    "厅": 1,
    "卫": 1,
    "朝向": "东南",
    "楼层": "高楼层/33",
    "面积": 89.0,
    "套内面积": 76.0,
    "成交价": 520.0,
    "成交时间": "2024-03-15T14:30:00",
    "上架时间": "2024-01-20T09:00:00",
    "物业类型": "公寓",
    "建筑年代": 2018,
    "建筑结构": "剪力墙",
    "装修情况": "简装",
    "电梯": true,
    "产权性质": "商品房",
    "产权年限": 70,
    "上次交易": "2021-09-12",
    "供暖方式": "自供暖",
    "房源描述": "学区房，交通便利",
    "图片链接": "https://example.com/images/exterior.jpg,https://example.com/images/kitchen.jpg"
  }
]
```

### 带图片链接的推送示例
```json
[
  {
    "数据源": "api_partner",
    "房源ID": "A1002",
    "状态": "在售",
    "小区名": "示例小区",
    "室": 3,
    "厅": 2,
    "卫": 2,
    "朝向": "南",
    "楼层": "15/28",
    "面积": 120.5,
    "挂牌价": 500.0,
    "上架时间": "2024-01-15T10:00:00",
    "图片链接": [
      "https://cdn.example.com/property/123/living-room.jpg",
      "https://cdn.example.com/property/123/bedroom-1.jpg",
      "https://cdn.example.com/property/123/bedroom-2.jpg",
      "https://cdn.example.com/property/123/floor-plan.jpg"
    ]
  }
]
```
- 图片链接字段为可选，不影响无图房源的正常导入
- 支持数组格式（推荐）或逗号分隔的字符串格式
- 所有图片按传入顺序存储，前端可自由选择展示方式

### Curl 调用示例（Windows PowerShell）
```powershell
curl -X POST "http://localhost:8000/api/push" `
  -H "Content-Type: application/json" `
  -d "[{\"数据源\":\"api_partner\",\"房源ID\":\"A001\",\"状态\":\"在售\",\"小区名\":\"示例小区\",\"室\":3,\"厅\":2,\"卫\":2,\"朝向\":\"南\",\"楼层\":\"15/28\",\"面积\":120.5,\"挂牌价\":500.0,\"上架时间\":\"2024-01-15T10:00:00\"}]"
```

## 响应格式
```json
{
  "total": 3,
  "success": 2,
  "failed": 1,
  "errors": [
    {
      "index": 1,
      "source_property_id": "API_TEST_005",
      "reason": "缺少必填字段: 挂牌价; 缺少必填字段: 上架时间"
    }
  ]
}
```
- 字段含义：
  - `total`：推送的总记录数
  - `success`：成功导入的记录数
  - `failed`：失败的记录数
  - `errors`：失败详情列表（包含数组索引、房源ID、失败原因）

## 项目管理接口说明（新增）

### 基础接口

#### 1. 项目统计
```bash
GET /api/v1/projects/stats
```
响应：
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "signing": 5,
    "renovating": 3,
    "selling": 2,
    "sold": 1
  }
}
```

#### 2. 创建项目
```bash
POST /api/v1/projects
Content-Type: application/json

{
  "name": "阳光花园 3-201",
  "community_name": "阳光花园",
  "address": "北京市朝阳区阳光街123号",
  "owner_name": "张三",
  "owner_phone": "13800138000",
  "notes": "高品质装修项目"
}
```

#### 3. 获取项目列表
```bash
GET /api/v1/projects?status=renovating&community_name=阳光&page=1&page_size=20
```

#### 4. 获取项目详情
```bash
GET /api/v1/projects/{project_id}
```

#### 5. 更新项目信息（仅签约阶段可修改）
```bash
PUT /api/v1/projects/{project_id}
Content-Type: application/json

{
  "name": "更新后的项目名称",
  "notes": "更新后的备注"
}
```

### 状态流转接口

#### 1. 更新项目状态
```bash
PUT /api/v1/projects/{project_id}/status
Content-Type: application/json

{
  "status": "renovating"
}
```

#### 2. 完成项目（标记为已售）
```bash
POST /api/v1/projects/{project_id}/complete
Content-Type: application/json

{
  "sold_price": 1500000,
  "sold_date": "2024-03-15T14:30:00"
}
```

### 改造阶段管理接口

#### 1. 更新改造阶段
```bash
PUT /api/v1/projects/{project_id}/renovation
Content-Type: application/json

{
  "renovation_stage": "水电",
  "stage_completed_at": "2024-03-15T14:30:00"
}
```

#### 2. 上传改造照片
```bash
POST /api/v1/projects/{project_id}/renovation/photos?stage=水电&url=https://example.com/photo.jpg&filename=photo.jpg&description=水电改造完成
```

#### 3. 获取改造照片
```bash
GET /api/v1/projects/{project_id}/renovation/photos?stage=水电
```

### 销售管理接口

#### 1. 更新销售角色
```bash
PUT /api/v1/projects/{project_id}/selling/roles
Content-Type: application/json

{
  "property_agent": "房源维护人",
  "client_agent": "客源维护人",
  "first_viewer": "首看人"
}
```

#### 2. 创建销售记录
```bash
# 带看记录
POST /api/v1/projects/{project_id}/selling/viewings
Content-Type: application/json

{
  "record_type": "viewing",
  "customer_name": "客户姓名",
  "customer_phone": "13800138001",
  "record_date": "2024-03-15T14:30:00",
  "notes": "客户对户型很满意"
}

# 出价记录
POST /api/v1/projects/{project_id}/selling/offers
Content-Type: application/json

{
  "record_type": "offer",
  "customer_name": "客户姓名",
  "customer_phone": "13800138001",
  "record_date": "2024-03-15T14:30:00",
  "price": 1200000,
  "notes": "客户出价120万"
}

# 面谈记录
POST /api/v1/projects/{project_id}/selling/negotiations
Content-Type: application/json

{
  "record_type": "negotiation",
  "customer_name": "客户姓名",
  "customer_phone": "13800138001",
  "record_date": "2024-03-15T14:30:00",
  "notes": "面谈记录"
}
```

#### 3. 获取销售记录
```bash
GET /api/v1/projects/{project_id}/selling/records?record_type=viewing
```

#### 4. 删除销售记录
```bash
DELETE /api/v1/projects/{project_id}/selling/records/{record_id}
```

### 现金流管理接口

#### 1. 获取项目现金流
```bash
GET /api/v1/projects/{project_id}/cashflow
```
响应包含明细列表和汇总信息：
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "records": [...],
    "summary": {
      "total_income": 1500000,
      "total_expense": 200000,
      "net_cash_flow": 1300000,
      "roi": 6.5
    }
  }
}
```

#### 2. 创建现金流记录
```bash
POST /api/v1/projects/{project_id}/cashflow
Content-Type: application/json

{
  "type": "expense",
  "category": "装修费",
  "amount": 50000,
  "date": "2024-03-15T14:30:00",
  "description": "装修费用",
  "related_stage": "改造阶段"
}
```

#### 3. 删除现金流记录
```bash
DELETE /api/v1/cashflow/{record_id}?project_id={project_id}
```

### 项目报告接口

#### 获取项目报告
```bash
GET /api/v1/projects/{project_id}/report
```
响应包含项目完整报告：
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "project_id": "project-id",
    "project_name": "阳光花园改造项目",
    "status": "sold",
    "signing_date": "2024-01-01T00:00:00",
    "renovation_start_date": "2024-01-15T00:00:00",
    "renovation_end_date": "2024-03-01T00:00:00",
    "listing_date": "2024-03-02T00:00:00",
    "sold_date": "2024-03-15T00:00:00",
    "total_investment": 200000,
    "total_income": 1500000,
    "net_profit": 1300000,
    "roi": 6.5,
    "address": "北京市朝阳区阳光街123号",
    "sale_price": 1500000,
    "list_price": null
  }
}
```

## 错误代码含义
- 错误响应统一结构：
```json
{
  "success": false,
  "error": {
    "code": "...",
    "message": "...",
    "details": "...可选..."
  }
}
```

- 常见错误代码与含义：
  - `VALIDATION_ERROR`
    - 说明：请求体为空、超出单次推送上限、参数或字段验证失败
    - HTTP 状态码：`400` 或 `422`
  - `DUPLICATE_RECORD`
    - 说明：房源已存在（数据源与房源ID重复）或其他唯一性约束冲突
    - HTTP 状态码：`409`
  - `RESOURCE_NOT_FOUND`
    - 说明：目标资源不存在
    - HTTP 状态码：`404`
  - `FILE_PROCESSING_ERROR`
    - 说明：文件处理相关错误
    - HTTP 状态码：`400`
  - `BUSINESS_LOGIC_ERROR`
    - 说明：业务逻辑失败（批量处理失败等）
    - HTTP 状态码：`422`
  - `DATABASE_ERROR`
    - 说明：数据库错误（外键不存在、字段缺失、数据格式错误等）
    - HTTP 状态码：`500`，部分完整性错误可能为 `400`/`409`
  - `HTTP_<status>`
    - 说明：转发的 HTTP 异常，如 `HTTP_404`、`HTTP_500`
    - HTTP 状态码：对应的 `<status>`
  - `INTERNAL_SERVER_ERROR`
    - 说明：未捕获的服务器内部错误；`debug` 模式下会返回详细堆栈
    - HTTP 状态码：`500`

## 开发注意事项
- 在售与成交的必填项需按状态提供，否则将被拒收并记录失败原因
- `面积` 为正数；价格单位为 `万`
- 系统对小区名称做标准化与别名匹配，必要时会自动创建小区记录
- 推送数组长度上限：`10000`
- `图片链接` 字段为可选，不影响现有无图数据的正常导入
- 图片URL会存储在 `property_media` 表中，与房源关联

## 项目管理接口注意事项（新增）
- 项目状态流转必须遵循合法路径：签约 → 改造 → 在售 → 已售
- 现金流类型和分类必须严格匹配：支出类型只能使用支出分类，收入类型只能使用收入分类
- 只有在售阶段才能更新销售角色和创建销售记录
- 只有在改造阶段才能更新改造子阶段和上传照片
- 项目基本信息（名称、地址等）只能在签约阶段修改

## 相关端点
- 房源推送：`POST /api/push`
- 房源列表查询：`GET /api/properties`
- 房源导出：`GET /api/properties/export`
- 项目管理：`/api/v1/projects/*`（新增）
- 项目现金流：`/api/v1/projects/{id}/cashflow`（新增）
- 项目销售记录：`/api/v1/projects/{id}/selling/*`（新增）