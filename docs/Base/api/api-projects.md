# ProFo 项目管理（Projects）接口文档

> 模块层级：L3 - 项目管理
> API 基础路径：`/api/v1`
> 路由前缀：`/api/v1/projects`
> 认证方式：Bearer Token（内部用户 CurrentInternalUserDep）

---

## 目录

- [1. 概述](#1-概述)
- [2. 枚举定义](#2-枚举定义)
- [3. 核心CRUD接口](#3-核心crud接口)
  - [3.1 获取下一个合同编号](#31-获取下一个合同编号)
  - [3.2 创建项目](#32-创建项目)
  - [3.3 获取项目列表](#33-获取项目列表)
  - [3.4 获取项目统计](#34-获取项目统计)
  - [3.5 导出项目CSV](#35-导出项目csv)
  - [3.6 获取项目详情](#36-获取项目详情)
  - [3.7 更新项目](#37-更新项目)
  - [3.8 删除项目](#38-删除项目)
  - [3.9 更新项目状态](#39-更新项目状态)
  - [3.10 完成项目](#310-完成项目)
  - [3.11 获取项目报告](#311-获取项目报告)
- [4. 改造阶段接口](#4-改造阶段接口)
  - [4.1 更新改造阶段](#41-更新改造阶段)
  - [4.2 上传改造照片](#42-上传改造照片)
  - [4.3 获取改造照片](#43-获取改造照片)
  - [4.4 删除改造照片](#44-删除改造照片)
  - [4.5 获取装修合同信息](#45-获取装修合同信息)
  - [4.6 更新装修合同信息](#46-更新装修合同信息)
- [5. 销售管理接口](#5-销售管理接口)
  - [5.1 更新销售角色](#51-更新销售角色)
  - [5.2 创建带看记录](#52-创建带看记录)
  - [5.3 创建出价记录](#53-创建出价记录)
  - [5.4 创建面谈记录](#54-创建面谈记录)
  - [5.5 获取销售记录](#55-获取销售记录)
  - [5.6 删除销售记录](#56-删除销售记录)
- [6. 现金流接口](#6-现金流接口)
  - [6.1 创建现金流记录](#61-创建现金流记录)
  - [6.2 获取项目现金流](#62-获取项目现金流)
  - [6.3 删除现金流记录](#63-删除现金流记录)
- [7. Schema定义](#7-schema定义)
- [8. 错误码表](#8-错误码表)

---

## 1. 概述

Projects 模块是 ProFo 系统的核心业务模块（L3层），管理从签约到售出的完整项目生命周期。模块分为四个子模块：

| 子模块 | 路由文件 | 功能 |
|--------|----------|------|
| 核心CRUD | `core.py` | 项目创建、查询、更新、删除、状态流转、报告 |
| 改造阶段 | `renovation.py` | 装修阶段管理、照片管理、合同信息 |
| 销售管理 | `sales.py` | 销售角色分配、带看/出价/面谈记录 |
| 现金流 | `cashflow.py` | 收支记录、财务摘要 |

**通用请求头：**

| Header | 值 | 说明 |
|--------|-----|------|
| `Authorization` | `Bearer <token>` | 必填，内部用户认证令牌 |
| `Content-Type` | `application/json` | 请求体为 JSON 时必填 |

---

## 2. 枚举定义

### ProjectStatus - 项目主状态

| 值 | 说明 |
|----|------|
| `signing` | 签约阶段 |
| `renovating` | 改造阶段 |
| `selling` | 在售阶段 |
| `sold` | 已售阶段 |
| `deleted` | 已删除 |

### RenovationStage - 改造子阶段

| 值 | 说明 |
|----|------|
| `拆除` | 拆除 |
| `设计` | 设计 |
| `水电` | 水电 |
| `木瓦` | 木瓦 |
| `油漆` | 油漆 |
| `安装` | 安装 |
| `交付` | 交付 |
| `已完成` | 已完成 |

### RecordType - 销售记录类型

| 值 | 说明 |
|----|------|
| `viewing` | 带看记录 |
| `offer` | 出价记录 |
| `negotiation` | 面谈记录 |

### CashFlowType - 现金流类型

| 值 | 说明 |
|----|------|
| `income` | 收入 |
| `expense` | 支出 |

### CashFlowCategory - 现金流分类

| 值 | 类型 | 说明 |
|----|------|------|
| `履约保证金` | 支出 | 履约保证金 |
| `中介佣金` | 支出 | 中介佣金 |
| `装修费` | 支出 | 装修费 |
| `营销费` | 支出 | 营销费 |
| `其他支出` | 支出 | 其他支出 |
| `税费` | 支出 | 税费 |
| `运营费` | 支出 | 运营费 |
| `回收保证金` | 收入 | 回收保证金 |
| `溢价款` | 收入 | 溢价款 |
| `服务费` | 收入 | 服务费 |

---

## 3. 核心CRUD接口

### 3.1 获取下一个合同编号

后端生成保证唯一性，避免前端竞态条件。

```
GET /api/v1/projects/contract-no/next
```

**请求参数：** 无

**响应示例：**

```json
"MFB-202604-0001"
```

> 格式：`MFB-年月-4位自增序号`

---

### 3.2 创建项目

```
POST /api/v1/projects
```

**速率限制：** 100次/小时

**请求体（ProjectCreate）：**

```json
{
  "community_id": "550e8400-e29b-41d4-a716-446655440000",
  "community_name": "阳光花园",
  "address": "上海市浦东新区张杨路500号302室",
  "area": 89.5,
  "layout": "2室1厅",
  "orientation": "南",
  "project_manager_id": "user-uuid-001",
  "contract_no": "MFB-202604-0001",
  "signing_price": 280.0,
  "signing_date": "2026-04-15",
  "signing_period": 365,
  "extension_period": 90,
  "extension_rent": 5000.0,
  "cost_assumption_type": "meifangbao",
  "cost_assumption_other": null,
  "planned_handover_date": "2026-05-01",
  "other_agreements": "含车位一个",
  "signing_materials": [
    { "name": "身份证复印件", "uploaded": true }
  ],
  "owner_name": "张三",
  "owner_phone": "13800138000",
  "owner_id_card": "310101199001011234",
  "owner_info": "业主常驻国外，通过代理人联系",
  "notes": "紧急项目",
  "list_price": 350.0,
  "listing_date": "2026-06-01"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `community_id` | string | 否 | 小区ID，最大36字符 |
| `community_name` | string | **是** | 小区名称，最大200字符 |
| `address` | string | **是** | 物业地址，最大500字符 |
| `area` | Decimal | 否 | 产证面积(m²) |
| `layout` | string | 否 | 户型，最大50字符 |
| `orientation` | string | 否 | 朝向，最大50字符 |
| `project_manager_id` | string | 否 | 项目负责人ID |
| `contract_no` | string | **是** | 合同编号，最大100字符 |
| `signing_price` | Decimal | 否 | 签约价格(万) |
| `signing_date` | string | 否 | 签约日期，YYYY-MM-DD 格式 |
| `signing_period` | integer | 否 | 合同周期(天) |
| `extension_period` | integer | 否 | 顺延期(天) |
| `extension_rent` | Decimal | 否 | 顺延期租金(元/月) |
| `cost_assumption_type` | string | 否 | 税费承担方类型：meifangbao/owner/respective/other，最大20字符 |
| `cost_assumption_other` | string | 否 | 税费承担方其他说明，最大50字符 |
| `planned_handover_date` | string | 否 | 计划交房时间，YYYY-MM-DD 格式 |
| `other_agreements` | string | 否 | 其他约定 |
| `signing_materials` | list | 否 | 签约材料列表 |
| `owner_name` | string | 否 | 业主姓名，最大100字符 |
| `owner_phone` | string | 否 | 业主电话，最大20字符 |
| `owner_id_card` | string | 否 | 业主身份证号，最大18字符 |
| `owner_info` | string | 否 | 业主备注 |
| `notes` | string | 否 | 备注 |
| `list_price` | Decimal | 否 | 挂牌价(万) |
| `listing_date` | string | 否 | 上架日期，YYYY-MM-DD 格式 |

**响应（201 Created）：**

```json
{
  "id": "proj-uuid-001",
  "name": "阳光花园-302",
  "status": "signing",
  "created_at": "2026-04-15T10:30:00Z",
  "updated_at": "2026-04-15T10:30:00Z",
  "community_id": "550e8400-e29b-41d4-a716-446655440000",
  "community_name": "阳光花园",
  "address": "上海市浦东新区张杨路500号302室",
  "area": 89.5,
  "layout": "2室1厅",
  "orientation": "南",
  "is_deleted": false,
  "renovation_stage": null,
  "contract_no": "MFB-202604-0001",
  "signing_price": 280.0,
  "signing_date": "2026-04-15",
  "signing_period": 365,
  "extension_period": 90,
  "extension_rent": 5000.0,
  "cost_assumption_type": "meifangbao",
  "cost_assumption_other": null,
  "planned_handover_date": "2026-05-01",
  "other_agreements": "含车位一个",
  "contract_status": null,
  "owner_name": "张三",
  "owner_phone": "13800138000",
  "owner_id_card": "310101199001011234",
  "owner_info": "业主常驻国外，通过代理人联系",
  "list_price": 350.0,
  "listing_date": "2026-06-01",
  "sold_price": null,
  "sold_date": null,
  "transaction_status": null,
  "channel_manager_id": null,
  "property_agent_id": null,
  "negotiator_id": null,
  "total_income": 0,
  "total_expense": 0,
  "net_cash_flow": 0,
  "roi": 0.0,
  "signing_materials": [
    { "name": "身份证复印件", "uploaded": true }
  ],
  "sales_records": null,
  "renovation_photos": null,
  "renovationStageDates": null,
  "project_manager": null
}
```

---

### 3.3 获取项目列表

```
GET /api/v1/projects
```

**查询参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `status` | string | 否 | - | 项目状态筛选（ProjectStatus枚举值） |
| `community_name` | string | 否 | - | 小区名称筛选（模糊匹配） |
| `page` | integer | 否 | 1 | 页码，≥1 |
| `page_size` | integer | 否 | 50 | 每页数量，1-200 |

**请求示例：**

```
GET /api/v1/projects?status=renovating&page=1&page_size=20
```

**响应（PaginatedResponse[ProjectResponse]）：**

```json
{
  "items": [
    {
      "id": "proj-uuid-001",
      "name": "阳光花园-302",
      "status": "renovating",
      "created_at": "2026-04-15T10:30:00Z",
      "updated_at": "2026-04-20T14:00:00Z",
      "community_id": "550e8400-e29b-41d4-a716-446655440000",
      "community_name": "阳光花园",
      "address": "上海市浦东新区张杨路500号302室",
      "area": 89.5,
      "layout": "2室1厅",
      "orientation": "南",
      "is_deleted": false,
      "renovation_stage": "水电",
      "contract_no": "MFB-202604-0001",
      "signing_price": 280.0,
      "signing_date": "2026-04-15",
      "signing_period": 365,
      "extension_period": 90,
      "extension_rent": 5000.0,
      "cost_assumption_type": "meifangbao",
      "cost_assumption_other": null,
      "planned_handover_date": "2026-05-01",
      "other_agreements": "含车位一个",
      "contract_status": null,
      "owner_name": "张三",
      "owner_phone": "13800138000",
      "owner_id_card": "310101199001011234",
      "owner_info": "业主常驻国外，通过代理人联系",
      "list_price": 350.0,
      "listing_date": "2026-06-01",
      "sold_price": null,
      "sold_date": null,
      "transaction_status": null,
      "channel_manager_id": null,
      "property_agent_id": null,
      "negotiator_id": null,
      "total_income": 0,
      "total_expense": 2800000,
      "net_cash_flow": -2800000,
      "roi": -1.0,
      "signing_materials": null,
      "sales_records": null,
      "renovation_photos": null,
      "renovationStageDates": { "拆除": "2026-04-18" },
      "project_manager": {
        "id": "user-uuid-001",
        "nickname": "李经理",
        "avatar": "https://example.com/avatar.jpg",
        "username": "limanager"
      }
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 20
}
```

---

### 3.4 获取项目统计

```
GET /api/v1/projects/stats
```

**请求参数：** 无

**响应（ProjectStatsResponse）：**

```json
{
  "signing": 5,
  "renovating": 12,
  "selling": 8,
  "sold": 23
}
```

---

### 3.5 导出项目CSV

导出所有匹配记录（无分页限制），支持按状态和小区名称筛选。

```
GET /api/v1/projects/export
```

**速率限制：** 10次/小时

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `status` | string | 否 | 项目状态筛选 |
| `community_name` | string | 否 | 小区名称筛选 |

**请求示例：**

```
GET /api/v1/projects/export?status=selling
```

**响应：**

- Content-Type: `text/csv; charset=utf-8`
- Content-Disposition: `attachment; filename=projects_export_20260415_103000.csv`

CSV 列头：

| 列 | 说明 |
|----|------|
| 项目ID | 项目UUID |
| 项目名称 | 项目名称 |
| 项目状态 | 当前状态 |
| 小区名称 | 所属小区 |
| 物业地址 | 详细地址 |
| 面积(m²) | 产证面积 |
| 户型 | 户型 |
| 朝向 | 朝向 |
| 合同编号 | 合同编号 |
| 签约价格(万) | 签约价格 |
| 签约日期 | 签约日期 |
| 合同周期(天) | 合同周期 |
| 顺延期(天) | 顺延期 |
| 顺延期租金(元/月) | 顺延期租金 |
| 税费承担 | 承担方 |
| 计划交房日期 | 计划交房时间 |
| 业主姓名 | 业主姓名 |
| 业主电话 | 业主电话 |
| 挂牌价(万) | 挂牌价 |
| 上架日期 | 上架日期 |
| 成交价(万) | 成交价 |
| 成交日期 | 成交日期 |
| 总收入(元) | 总收入 |
| 总支出(元) | 总支出 |
| 净现金流(元) | 净现金流 |
| ROI(%) | 投资回报率 |
| 创建时间 | 创建时间 |
| 更新时间 | 更新时间 |

> CSV 文件使用 UTF-8 with BOM 编码，兼容 Excel 直接打开。

---

### 3.6 获取项目详情

```
GET /api/v1/projects/{project_id}
```

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | string | 项目ID |

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `full` | boolean | false | 是否获取完整详情（包含大字段如 signing_materials 等） |

**请求示例：**

```
GET /api/v1/projects/proj-uuid-001?full=true
```

**响应（ProjectResponse）：**

```json
{
  "id": "proj-uuid-001",
  "name": "阳光花园-302",
  "status": "renovating",
  "created_at": "2026-04-15T10:30:00Z",
  "updated_at": "2026-04-20T14:00:00Z",
  "community_id": "550e8400-e29b-41d4-a716-446655440000",
  "community_name": "阳光花园",
  "address": "上海市浦东新区张杨路500号302室",
  "area": 89.5,
  "layout": "2室1厅",
  "orientation": "南",
  "is_deleted": false,
  "renovation_stage": "水电",
  "contract_no": "MFB-202604-0001",
  "signing_price": 280.0,
  "signing_date": "2026-04-15",
  "signing_period": 365,
  "extension_period": 90,
  "extension_rent": 5000.0,
  "cost_assumption_type": "meifangbao",
  "cost_assumption_other": null,
  "planned_handover_date": "2026-05-01",
  "other_agreements": "含车位一个",
  "contract_status": null,
  "owner_name": "张三",
  "owner_phone": "13800138000",
  "owner_id_card": "310101199001011234",
  "owner_info": "业主常驻国外，通过代理人联系",
  "list_price": 350.0,
  "listing_date": "2026-06-01",
  "sold_price": null,
  "sold_date": null,
  "transaction_status": null,
  "channel_manager_id": null,
  "property_agent_id": null,
  "negotiator_id": null,
  "total_income": 0,
  "total_expense": 2800000,
  "net_cash_flow": -2800000,
  "roi": -1.0,
  "signing_materials": [
    { "name": "身份证复印件", "uploaded": true }
  ],
  "sales_records": [],
  "renovation_photos": [],
  "renovationStageDates": { "拆除": "2026-04-18" },
  "project_manager": {
    "id": "user-uuid-001",
    "nickname": "李经理",
    "avatar": "https://example.com/avatar.jpg",
    "username": "limanager"
  }
}
```

> 当 `full=false` 时，`signing_materials`、`sales_records`、`renovation_photos` 等大字段可能为 `null`，以提升列表查询性能。

---

### 3.7 更新项目

```
PUT /api/v1/projects/{project_id}
```

**速率限制：** 100次/小时

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | string | 项目ID |

**请求体（ProjectUpdate）：** 所有字段可选，仅传需要更新的字段。

```json
{
  "community_name": "阳光花园二期",
  "address": "上海市浦东新区张杨路501号302室",
  "area": 92.0,
  "list_price": 360.0,
  "listing_date": "2026-06-15"
}
```

> ProjectUpdate 支持别名映射，前端可使用 camelCase（如 `contractNo`、`extensionPeriod`、`extensionRent`、`costAssumptionType`、`costAssumptionOther`、`otherAgreements`）。

**响应（ProjectResponse）：** 同 3.6 项目详情响应结构。

---

### 3.8 删除项目

```
DELETE /api/v1/projects/{project_id}
```

**速率限制：** 20次/小时

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | string | 项目ID |

**响应：** `204 No Content`，无响应体。

---

### 3.9 更新项目状态

```
PUT /api/v1/projects/{project_id}/status
```

**速率限制：** 100次/小时

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | string | 项目ID |

**请求体（StatusUpdate）：**

```json
{
  "status": "renovating",
  "listing_date": null,
  "list_price": null
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `status` | ProjectStatus | **是** | 目标状态（signing/renovating/selling/sold） |
| `listing_date` | string | 否 | 上架日期，YYYY-MM-DD 格式 |
| `list_price` | Decimal | 否 | 挂牌价(万元) |

**响应（ProjectResponse）：** 同 3.6 项目详情响应结构。

---

### 3.10 完成项目

确认项目成交，将状态变更为 `sold`。

```
POST /api/v1/projects/{project_id}/complete
```

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | string | 项目ID |

**请求体（ProjectCompleteRequest）：**

```json
{
  "sold_price": 365.0,
  "sold_date": "2026-08-20T10:00:00Z"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sold_price` | Decimal | **是** | 成交价(万) |
| `sold_date` | datetime | **是** | 成交时间（ISO 8601 格式） |

> 支持别名：`soldPrice`、`soldDate`。

**响应（201 Created）：** ProjectResponse，`status` 变为 `sold`。

---

### 3.11 获取项目报告

```
GET /api/v1/projects/{project_id}/report
```

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | string | 项目ID |

**响应（ProjectReportResponse）：**

```json
{
  "project_id": "proj-uuid-001",
  "project_name": "阳光花园-302",
  "community_name": "阳光花园",
  "status": "sold",
  "signing_date": "2026-04-15T00:00:00Z",
  "renovation_start_date": "2026-04-18T00:00:00Z",
  "renovation_end_date": "2026-06-30T00:00:00Z",
  "listing_date": "2026-07-01T00:00:00Z",
  "sold_date": "2026-08-20T00:00:00Z",
  "total_investment": 3200000,
  "total_income": 3650000,
  "net_profit": 450000,
  "roi": 14.06,
  "address": "上海市浦东新区张杨路500号302室",
  "sale_price": 365.0,
  "list_price": 350.0,
  "signing_price": 280.0
}
```

---

## 4. 改造阶段接口

### 4.1 更新改造阶段

```
PUT /api/v1/projects/{project_id}/renovation
```

**速率限制：** 100次/小时

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | string | 项目ID |

**请求体（RenovationUpdate）：**

```json
{
  "renovation_stage": "水电",
  "stage_completed_at": "2026-05-10T18:00:00Z"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `renovation_stage` | RenovationStage | **是** | 改造子阶段（见枚举定义） |
| `stage_completed_at` | datetime | 否 | 阶段完成时间 |

**响应（ProjectResponse）：** 同 3.6 项目详情响应结构。

---

### 4.2 上传改造照片

```
POST /api/v1/projects/{project_id}/renovation/photos
```

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | string | 项目ID |

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `stage` | string | **是** | 改造阶段 |
| `url` | string | **是** | 图片URL |
| `filename` | string | 否 | 文件名 |
| `description` | string | 否 | 描述 |

**请求示例：**

```
POST /api/v1/projects/proj-uuid-001/renovation/photos?stage=水电&url=https://cdn.example.com/photo1.jpg&filename=水电验收1.jpg&description=水电验收照片
```

**响应（RenovationPhotoResponse）：**

```json
{
  "id": "photo-uuid-001",
  "project_id": "proj-uuid-001",
  "renovation_id": null,
  "stage": "水电",
  "url": "https://cdn.example.com/photo1.jpg",
  "filename": "水电验收1.jpg",
  "description": "水电验收照片",
  "created_at": "2026-05-10T18:30:00Z",
  "updated_at": null
}
```

---

### 4.3 获取改造照片

```
GET /api/v1/projects/{project_id}/renovation/photos
```

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | string | 项目ID |

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `stage` | string | 否 | 改造阶段筛选 |

**请求示例：**

```
GET /api/v1/projects/proj-uuid-001/renovation/photos?stage=水电
```

**响应（RenovationPhotoListResponse）：**

```json
{
  "items": [
    {
      "id": "photo-uuid-001",
      "project_id": "proj-uuid-001",
      "renovation_id": null,
      "stage": "水电",
      "url": "https://cdn.example.com/photo1.jpg",
      "filename": "水电验收1.jpg",
      "description": "水电验收照片",
      "created_at": "2026-05-10T18:30:00Z",
      "updated_at": null
    },
    {
      "id": "photo-uuid-002",
      "project_id": "proj-uuid-001",
      "renovation_id": null,
      "stage": "水电",
      "url": "https://cdn.example.com/photo2.jpg",
      "filename": "水电验收2.jpg",
      "description": null,
      "created_at": "2026-05-10T18:35:00Z",
      "updated_at": null
    }
  ],
  "total": 2
}
```

---

### 4.4 删除改造照片

```
DELETE /api/v1/projects/{project_id}/renovation/photos/{photo_id}
```

**速率限制：** 20次/小时

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | string | 项目ID |
| `photo_id` | string | 照片ID |

**响应：** `204 No Content`，无响应体。

---

### 4.5 获取装修合同信息

```
GET /api/v1/projects/{project_id}/renovation/contract
```

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | string | 项目ID |

**响应（RenovationContractResponse）：**

```json
{
  "id": "contract-uuid-001",
  "project_id": "proj-uuid-001",
  "renovation_company": "上海美居装饰工程有限公司",
  "contract_start_date": "2026-04-20T00:00:00Z",
  "contract_end_date": "2026-07-20T00:00:00Z",
  "actual_start_date": "2026-04-22T00:00:00Z",
  "actual_end_date": null,
  "hard_contract_amount": 150000.0,
  "payment_node_1": "开工前",
  "payment_ratio_1": 30.0,
  "payment_node_2": "水电验收",
  "payment_ratio_2": 30.0,
  "payment_node_3": "油漆验收",
  "payment_ratio_3": 25.0,
  "payment_node_4": "竣工验收",
  "payment_ratio_4": 15.0,
  "soft_budget": 50000.0,
  "soft_actual_cost": null,
  "soft_detail_attachment": null,
  "design_fee": 8000.0,
  "demolition_fee": 5000.0,
  "garbage_fee": 2000.0,
  "other_extra_fee": null,
  "other_fee_reason": null,
  "created_at": "2026-04-18T09:00:00Z",
  "updated_at": "2026-04-18T09:00:00Z"
}
```

---

### 4.6 更新装修合同信息

```
PUT /api/v1/projects/{project_id}/renovation/contract
```

**速率限制：** 100次/小时

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | string | 项目ID |

**请求体（RenovationContractUpdate）：** 所有字段可选。

```json
{
  "renovation_company": "上海美居装饰工程有限公司",
  "contract_start_date": "2026-04-20T00:00:00Z",
  "contract_end_date": "2026-07-20T00:00:00Z",
  "actual_start_date": "2026-04-22T00:00:00Z",
  "actual_end_date": null,
  "hard_contract_amount": 150000.0,
  "payment_node_1": "开工前",
  "payment_ratio_1": 30.0,
  "payment_node_2": "水电验收",
  "payment_ratio_2": 30.0,
  "payment_node_3": "油漆验收",
  "payment_ratio_3": 25.0,
  "payment_node_4": "竣工验收",
  "payment_ratio_4": 15.0,
  "soft_budget": 50000.0,
  "soft_actual_cost": null,
  "soft_detail_attachment": null,
  "design_fee": 8000.0,
  "demolition_fee": 5000.0,
  "garbage_fee": 2000.0,
  "other_extra_fee": null,
  "other_fee_reason": null
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `renovation_company` | string | 否 | 合作装修公司，最大200字符 |
| `contract_start_date` | datetime | 否 | 合同约定进场时间 |
| `contract_end_date` | datetime | 否 | 合同约定竣工交房时间 |
| `actual_start_date` | datetime | 否 | 实际开工时间 |
| `actual_end_date` | datetime | 否 | 实际竣工时间 |
| `hard_contract_amount` | float | 否 | 硬装合同总金额 |
| `payment_node_1` | string | 否 | 第一笔款项支付节点，最大100字符 |
| `payment_ratio_1` | float | 否 | 第一笔款项支付比例，0-100 |
| `payment_node_2` | string | 否 | 第二笔款项支付节点，最大100字符 |
| `payment_ratio_2` | float | 否 | 第二笔款项支付比例，0-100 |
| `payment_node_3` | string | 否 | 第三笔款项支付节点，最大100字符 |
| `payment_ratio_3` | float | 否 | 第三笔款项支付比例，0-100 |
| `payment_node_4` | string | 否 | 第四笔款项支付节点，最大100字符 |
| `payment_ratio_4` | float | 否 | 第四笔款项支付比例，0-100 |
| `soft_budget` | float | 否 | 软装预算金额 |
| `soft_actual_cost` | float | 否 | 软装实际发生成本 |
| `soft_detail_attachment` | string | 否 | 软装明细附件，最大500字符 |
| `design_fee` | float | 否 | 设计费用 |
| `demolition_fee` | float | 否 | 拆旧费用 |
| `garbage_fee` | float | 否 | 垃圾清运费用 |
| `other_extra_fee` | float | 否 | 其他额外费用 |
| `other_fee_reason` | string | 否 | 其他费用原因 |

**响应（RenovationContractResponse）：** 同 4.5 响应结构。

---

## 5. 销售管理接口

### 5.1 更新销售角色

```
PUT /api/v1/projects/{project_id}/selling/roles
```

**速率限制：** 100次/小时

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | string | 项目ID |

**请求体（SalesRolesUpdate）：**

```json
{
  "channel_manager_id": "user-uuid-002",
  "property_agent_id": "user-uuid-003",
  "negotiator_id": "user-uuid-004"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `channel_manager_id` | string | 否 | 渠道负责人用户ID，最大36字符 |
| `property_agent_id` | string | 否 | 讲房人用户ID（房源维护人），最大36字符 |
| `negotiator_id` | string | 否 | 谈判人用户ID（联卖谈判人），最大36字符 |

> 支持别名：`channelManagerId`/`channelManager`、`propertyAgentId`/`presenter`、`negotiatorId`/`negotiator`。

**响应（ProjectResponse）：** 同 3.6 项目详情响应结构。

---

### 5.2 创建带看记录

```
POST /api/v1/projects/{project_id}/selling/viewings
```

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | string | 项目ID |

**请求体（SalesRecordCreate）：**

```json
{
  "record_type": "viewing",
  "customer_name": "王先生",
  "customer_phone": "13900139000",
  "customer_info": { "source": "线上", "budget": "300-350万" },
  "record_date": "2026-07-15T14:00:00Z",
  "record_time": "14:00",
  "price": null,
  "notes": "客户对户型满意",
  "feedback": "有意向，需要和家人商量",
  "result": "待跟进",
  "related_agent": "user-uuid-003"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `record_type` | RecordType | **是** | 固定为 `viewing` |
| `customer_name` | string | 否 | 客户姓名，最大100字符 |
| `customer_phone` | string | 否 | 客户电话，最大20字符 |
| `customer_info` | dict | 否 | 客户信息（自定义键值对） |
| `record_date` | datetime | **是** | 记录日期 |
| `record_time` | string | 否 | 记录时间 |
| `price` | Decimal | 否 | 出价金额(万) |
| `notes` | string | 否 | 备注 |
| `feedback` | string | 否 | 客户反馈 |
| `result` | string | 否 | 结果 |
| `related_agent` | string | 否 | 关联经纪人 |

**响应（201 Created，SalesRecordResponse）：**

```json
{
  "id": "record-uuid-001",
  "project_id": "proj-uuid-001",
  "record_type": "viewing",
  "customer_name": "王先生",
  "customer_phone": "13900139000",
  "customer_info": { "source": "线上", "budget": "300-350万" },
  "record_date": "2026-07-15T14:00:00Z",
  "record_time": "14:00",
  "price": null,
  "notes": "客户对户型满意",
  "feedback": "有意向，需要和家人商量",
  "result": "待跟进",
  "related_agent": "user-uuid-003",
  "created_at": "2026-07-15T14:05:00Z"
}
```

---

### 5.3 创建出价记录

```
POST /api/v1/projects/{project_id}/selling/offers
```

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | string | 项目ID |

**请求体（SalesRecordCreate）：**

```json
{
  "record_type": "offer",
  "customer_name": "王先生",
  "customer_phone": "13900139000",
  "customer_info": null,
  "record_date": "2026-07-20T10:00:00Z",
  "record_time": "10:00",
  "price": 340.0,
  "notes": "客户出价340万",
  "feedback": "低于预期",
  "result": "未成交",
  "related_agent": "user-uuid-003"
}
```

**响应（201 Created，SalesRecordResponse）：** 同 5.2 响应结构，`record_type` 为 `offer`。

---

### 5.4 创建面谈记录

```
POST /api/v1/projects/{project_id}/selling/negotiations
```

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | string | 项目ID |

**请求体（SalesRecordCreate）：**

```json
{
  "record_type": "negotiation",
  "customer_name": "王先生",
  "customer_phone": "13900139000",
  "customer_info": null,
  "record_date": "2026-08-01T15:00:00Z",
  "record_time": "15:00",
  "price": 355.0,
  "notes": "面谈协商价格",
  "feedback": "双方基本达成一致",
  "result": "待确认",
  "related_agent": "user-uuid-004"
}
```

**响应（201 Created，SalesRecordResponse）：** 同 5.2 响应结构，`record_type` 为 `negotiation`。

---

### 5.5 获取销售记录

```
GET /api/v1/projects/{project_id}/selling/records
```

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | string | 项目ID |

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `record_type` | string | 否 | 记录类型筛选（viewing/offer/negotiation） |

**请求示例：**

```
GET /api/v1/projects/proj-uuid-001/selling/records?record_type=viewing
```

**响应（SalesRecordListResponse）：**

```json
{
  "items": [
    {
      "id": "record-uuid-001",
      "project_id": "proj-uuid-001",
      "record_type": "viewing",
      "customer_name": "王先生",
      "customer_phone": "13900139000",
      "customer_info": { "source": "线上", "budget": "300-350万" },
      "record_date": "2026-07-15T14:00:00Z",
      "record_time": "14:00",
      "price": null,
      "notes": "客户对户型满意",
      "feedback": "有意向，需要和家人商量",
      "result": "待跟进",
      "related_agent": "user-uuid-003",
      "created_at": "2026-07-15T14:05:00Z"
    }
  ],
  "total": 1
}
```

---

### 5.6 删除销售记录

```
DELETE /api/v1/projects/{project_id}/selling/records/{record_id}
```

**速率限制：** 20次/小时

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | string | 项目ID |
| `record_id` | string | 记录ID |

**响应：** `204 No Content`，无响应体。

---

## 6. 现金流接口

### 6.1 创建现金流记录

```
POST /api/v1/projects/{project_id}/cashflow
```

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | string | 项目ID |

**请求体（CashFlowRecordCreate）：**

```json
{
  "type": "expense",
  "category": "装修费",
  "amount": 150000,
  "date": "2026-05-01T00:00:00Z",
  "description": "硬装合同首付款",
  "related_stage": "水电"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | CashFlowType | **是** | 现金流类型（income/expense） |
| `category` | CashFlowCategory | **是** | 现金流分类（见枚举定义） |
| `amount` | Decimal | **是** | 金额(元) |
| `date` | datetime | **是** | 发生日期 |
| `description` | string | 否 | 描述 |
| `related_stage` | string | 否 | 关联阶段 |

**响应（201 Created，CashFlowRecordResponse）：**

```json
{
  "id": "finance-uuid-001",
  "project_id": "proj-uuid-001",
  "type": "expense",
  "category": "装修费",
  "amount": 150000,
  "record_date": "2026-05-01T00:00:00Z",
  "remark": "硬装合同首付款",
  "operator_id": null,
  "created_at": "2026-05-01T10:00:00Z",
  "updated_at": "2026-05-01T10:00:00Z",
  "date": "2026-05-01T00:00:00Z",
  "description": "硬装合同首付款",
  "related_stage": null
}
```

> `date`、`description`、`related_stage` 为兼容旧字段的计算属性。`date` 等于 `record_date`，`description` 等于 `remark`，`related_stage` 始终为 `null`。

---

### 6.2 获取项目现金流

返回项目的现金流明细记录和财务摘要汇总。

```
GET /api/v1/projects/{project_id}/cashflow
```

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | string | 项目ID |

**响应（CashFlowResponse）：**

```json
{
  "records": [
    {
      "id": "finance-uuid-001",
      "project_id": "proj-uuid-001",
      "type": "expense",
      "category": "装修费",
      "amount": 150000,
      "record_date": "2026-05-01T00:00:00Z",
      "remark": "硬装合同首付款",
      "operator_id": null,
      "created_at": "2026-05-01T10:00:00Z",
      "updated_at": "2026-05-01T10:00:00Z",
      "date": "2026-05-01T00:00:00Z",
      "description": "硬装合同首付款",
      "related_stage": null
    },
    {
      "id": "finance-uuid-002",
      "project_id": "proj-uuid-001",
      "type": "expense",
      "category": "履约保证金",
      "amount": 2800000,
      "record_date": "2026-04-15T00:00:00Z",
      "remark": "签约保证金",
      "operator_id": null,
      "created_at": "2026-04-15T10:00:00Z",
      "updated_at": "2026-04-15T10:00:00Z",
      "date": "2026-04-15T00:00:00Z",
      "description": "签约保证金",
      "related_stage": null
    },
    {
      "id": "finance-uuid-003",
      "project_id": "proj-uuid-001",
      "type": "income",
      "category": "溢价款",
      "amount": 3650000,
      "record_date": "2026-08-20T00:00:00Z",
      "remark": "成交收款",
      "operator_id": null,
      "created_at": "2026-08-20T10:00:00Z",
      "updated_at": "2026-08-20T10:00:00Z",
      "date": "2026-08-20T00:00:00Z",
      "description": "成交收款",
      "related_stage": null
    }
  ],
  "summary": {
    "total_income": 3650000,
    "total_expense": 2950000,
    "net_cash_flow": 700000,
    "roi": 23.73,
    "annualized_return": 35.6,
    "holding_days": 127
  }
}
```

---

### 6.3 删除现金流记录

```
DELETE /api/v1/projects/{project_id}/cashflow/{record_id}
```

**速率限制：** 20次/小时

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | string | 项目ID |
| `record_id` | string | 记录ID |

**响应：** `204 No Content`，无响应体。

---

## 7. Schema定义

### UserBrief

```json
{
  "id": "user-uuid-001",
  "nickname": "李经理",
  "avatar": "https://example.com/avatar.jpg",
  "username": "limanager"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 用户ID |
| `nickname` | string \| null | 昵称 |
| `avatar` | string \| null | 头像URL |
| `username` | string \| null | 用户名 |

### PaginatedResponse

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "page_size": 50
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `items` | list[T] | 数据列表 |
| `total` | integer | 总记录数 |
| `page` | integer | 当前页码 |
| `page_size` | integer | 每页数量 |

### CashFlowSummary

```json
{
  "total_income": 3650000,
  "total_expense": 2950000,
  "net_cash_flow": 700000,
  "roi": 23.73,
  "annualized_return": 35.6,
  "holding_days": 127
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `total_income` | Decimal | 总收入(元) |
| `total_expense` | Decimal | 总支出(元) |
| `net_cash_flow` | Decimal | 净现金流(元) |
| `roi` | float | 投资回报率(%) |
| `annualized_return` | float | 年化收益率(%)，默认0.0 |
| `holding_days` | integer | 持有天数，默认0 |

---

## 8. 错误码表

### HTTP状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 201 | 创建成功 |
| 204 | 删除成功（无响应体） |
| 400 | 请求参数错误（字段校验失败） |
| 401 | 未认证（Token 缺失或无效） |
| 404 | 资源不存在（项目/照片/记录未找到） |
| 422 | 请求体验证失败（Pydantic 校验错误） |
| 429 | 请求频率超限（触发速率限制） |
| 500 | 服务器内部错误 |

### 业务错误示例

**404 项目不存在：**

```json
{
  "detail": "Project not found"
}
```

**404 报告不存在：**

```json
{
  "detail": "Report not found"
}
```

**422 参数校验失败：**

```json
{
  "detail": [
    {
      "type": "missing",
      "loc": ["body", "contract_no"],
      "msg": "Field required",
      "input": null
    }
  ]
}
```

**429 速率限制：**

```json
{
  "detail": "Rate limit exceeded"
}
```

### 速率限制汇总

| 接口 | 限制 |
|------|------|
| 创建项目 POST /projects | 100次/小时 |
| 更新项目 PUT /projects/{id} | 100次/小时 |
| 删除项目 DELETE /projects/{id} | 20次/小时 |
| 更新状态 PUT /projects/{id}/status | 100次/小时 |
| 导出CSV GET /projects/export | 10次/小时 |
| 更新改造阶段 PUT /projects/{id}/renovation | 100次/小时 |
| 删除改造照片 DELETE /projects/{id}/renovation/photos/{photo_id} | 20次/小时 |
| 更新装修合同 PUT /projects/{id}/renovation/contract | 100次/小时 |
| 更新销售角色 PUT /projects/{id}/selling/roles | 100次/小时 |
| 删除销售记录 DELETE /projects/{id}/selling/records/{record_id} | 20次/小时 |
| 删除现金流记录 DELETE /projects/{id}/cashflow/{record_id} | 20次/小时 |
