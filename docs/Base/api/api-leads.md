# ProFo 线索管理模块 API 文档

> 版本：v1 | 最后更新：2026-05-25

## 概述

线索管理模块提供房源线索的全生命周期管理能力，包括线索 CRUD、跟进记录、价格历史和漏斗统计。

| 项目 | 说明 |
|------|------|
| API 基础路径 | `/api/v1` |
| 路由前缀 | `/api/v1/leads` |
| 认证方式 | Bearer Token（内部用户 `CurrentInternalUserDep`） |
| 响应格式 | JSON |

## 认证

所有接口均需在请求头中携带内部用户 Token：

```
Authorization: Bearer <token>
```

## 枚举类型

### LeadStatus — 线索状态

| 值 | 说明 |
|----|------|
| `pending_assessment` | 待评估 |
| `pending_visit` | 待看房 |
| `rejected` | 已驳回 |
| `visited` | 已看房 |
| `signed` | 已签约 |

### FollowUpMethod — 跟进方式

| 值 | 说明 |
|----|------|
| `phone` | 电话 |
| `wechat` | 微信 |
| `face` | 面谈 |
| `visit` | 实地带看 |

---

## 1. 核心 CRUD

### 1.1 获取线索列表

获取线索分页列表，支持多条件筛选与搜索。

```
GET /api/v1/leads/
```

#### 请求参数（Query）

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `page` | `int` | 否 | `1` | 页码，≥1 |
| `page_size` | `int` | 否 | `20` | 每页数量，1~200 |
| `search` | `string` | 否 | — | 小区名称模糊搜索 |
| `statuses` | `list[LeadStatus]` | 否 | — | 状态筛选，可传多个（如 `statuses=pending_assessment&statuses=visited`） |
| `district` | `string` | 否 | — | 行政区筛选 |
| `creator_id` | `string` | 否 | — | 创建人 ID 筛选 |
| `layout` | `string` | 否 | — | 户型筛选 |
| `floor` | `string` | 否 | — | 楼层筛选 |

#### 响应数据

**HTTP 200** — `PaginatedLeadListResponse`

```json
{
  "items": [
    {
      "id": "a1b2c3d4-...",
      "community_name": "万科城市花园",
      "community_id": "community-001",
      "is_hot": 1,
      "layout": "3室2厅",
      "orientation": "南北通透",
      "floor_info": "中楼层/18层",
      "area": 89.5,
      "total_price": 320.0,
      "unit_price": 3.58,
      "eval_price": 310.0,
      "status": "pending_visit",
      "audit_reason": null,
      "auditor_id": null,
      "audit_time": null,
      "images": ["https://example.com/img1.jpg"],
      "district": "浦东新区",
      "business_area": "陆家嘴",
      "remarks": "业主诚心出售",
      "creator_id": "user-001",
      "creator_name": "张三",
      "source_property_id": 42,
      "last_follow_up_at": "2026-05-20T10:30:00Z",
      "created_at": "2026-05-15T08:00:00Z",
      "updated_at": "2026-05-20T10:30:00Z"
    }
  ],
  "total": 156,
  "page": 1,
  "page_size": 20
}
```

#### 响应字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `items` | `list[LeadListItem]` | 线索列表 |
| `total` | `int` | 符合条件的总记录数 |
| `page` | `int` | 当前页码 |
| `page_size` | `int` | 每页数量 |

**LeadListItem 字段**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 线索唯一标识（UUID） |
| `community_name` | `string` | 小区名称 |
| `community_id` | `string \| null` | 小区 ID |
| `is_hot` | `int` | 是否热门线索（0=否，1=是） |
| `layout` | `string \| null` | 户型（如"3室2厅"） |
| `orientation` | `string \| null` | 朝向 |
| `floor_info` | `string \| null` | 楼层信息 |
| `area` | `float \| null` | 面积（㎡） |
| `total_price` | `float \| null` | 总价（万元） |
| `unit_price` | `float \| null` | 单价（万元/㎡） |
| `eval_price` | `float \| null` | 评估价（万元） |
| `status` | `LeadStatus` | 线索状态 |
| `audit_reason` | `string \| null` | 审核原因/驳回理由 |
| `auditor_id` | `string \| null` | 审核人 ID |
| `audit_time` | `datetime \| null` | 审核时间 |
| `images` | `list[string]` | 图片 URL 列表 |
| `district` | `string \| null` | 行政区 |
| `business_area` | `string \| null` | 商圈 |
| `remarks` | `string \| null` | 备注 |
| `creator_id` | `string \| null` | 创建人 ID |
| `creator_name` | `string \| null` | 创建人姓名 |
| `source_property_id` | `int \| null` | 关联房源 ID（软引用） |
| `last_follow_up_at` | `datetime \| null` | 最后跟进时间 |
| `created_at` | `datetime` | 创建时间 |
| `updated_at` | `datetime` | 更新时间 |

#### 请求示例

```bash
# 基础查询
curl -X GET "http://localhost:8000/api/v1/leads/?page=1&page_size=10" \
  -H "Authorization: Bearer <token>"

# 带筛选条件
curl -X GET "http://localhost:8000/api/v1/leads/?search=万科&statuses=pending_visit&district=浦东新区" \
  -H "Authorization: Bearer <token>"
```

---

### 1.2 创建线索

创建一条新的房源线索。若传入 `total_price`，系统将自动创建初始价格历史记录。

```
POST /api/v1/leads/
```

#### 请求参数（Body — `LeadCreate`）

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `community_name` | `string` | **是** | — | 小区名称 |
| `community_id` | `string` | 否 | `null` | 小区 ID |
| `is_hot` | `int` | 否 | `0` | 是否热门（0=否，1=是） |
| `layout` | `string` | 否 | `null` | 户型 |
| `orientation` | `string` | 否 | `null` | 朝向 |
| `floor_info` | `string` | 否 | `null` | 楼层信息 |
| `area` | `float` | 否 | `null` | 面积（㎡） |
| `total_price` | `float` | 否 | `null` | 总价（万元） |
| `unit_price` | `float` | 否 | `null` | 单价（万元/㎡） |
| `eval_price` | `float` | 否 | `null` | 评估价（万元） |
| `district` | `string` | 否 | `null` | 行政区 |
| `business_area` | `string` | 否 | `null` | 商圈 |
| `remarks` | `string` | 否 | `null` | 备注 |
| `source_property_id` | `int` | 否 | `null` | 关联房源 ID |
| `status` | `LeadStatus` | 否 | `pending_assessment` | 初始状态 |
| `images` | `list[string]` | 否 | `[]` | 图片 URL 列表 |

#### 响应数据

**HTTP 200** — `LeadResponse`

```json
{
  "community_name": "万科城市花园",
  "community_id": null,
  "is_hot": 0,
  "layout": "3室2厅",
  "orientation": "南北通透",
  "floor_info": "中楼层/18层",
  "area": 89.5,
  "total_price": 320.0,
  "unit_price": 3.58,
  "eval_price": null,
  "district": "浦东新区",
  "business_area": "陆家嘴",
  "remarks": "业主诚心出售",
  "source_property_id": null,
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "pending_assessment",
  "audit_reason": null,
  "auditor_id": null,
  "audit_time": null,
  "images": [],
  "creator_id": "user-001",
  "creator_name": "张三",
  "last_follow_up_at": null,
  "created_at": "2026-05-25T08:00:00Z",
  "updated_at": "2026-05-25T08:00:00Z"
}
```

**LeadResponse 字段说明**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 线索唯一标识（UUID） |
| `community_name` | `string` | 小区名称 |
| `community_id` | `string \| null` | 小区 ID |
| `is_hot` | `int` | 是否热门线索 |
| `layout` | `string \| null` | 户型 |
| `orientation` | `string \| null` | 朝向 |
| `floor_info` | `string \| null` | 楼层信息 |
| `area` | `float \| null` | 面积（㎡） |
| `total_price` | `float \| null` | 总价（万元） |
| `unit_price` | `float \| null` | 单价（万元/㎡） |
| `eval_price` | `float \| null` | 评估价（万元） |
| `district` | `string \| null` | 行政区 |
| `business_area` | `string \| null` | 商圈 |
| `remarks` | `string \| null` | 备注 |
| `source_property_id` | `int \| null` | 关联房源 ID |
| `status` | `LeadStatus` | 线索状态 |
| `audit_reason` | `string \| null` | 审核原因 |
| `auditor_id` | `string \| null` | 审核人 ID |
| `audit_time` | `datetime \| null` | 审核时间 |
| `images` | `list[string]` | 图片 URL 列表 |
| `creator_id` | `string \| null` | 创建人 ID |
| `creator_name` | `string \| null` | 创建人姓名 |
| `last_follow_up_at` | `datetime \| null` | 最后跟进时间 |
| `created_at` | `datetime` | 创建时间 |
| `updated_at` | `datetime` | 更新时间 |

#### 请求示例

```bash
curl -X POST "http://localhost:8000/api/v1/leads/" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "community_name": "万科城市花园",
    "layout": "3室2厅",
    "orientation": "南北通透",
    "floor_info": "中楼层/18层",
    "area": 89.5,
    "total_price": 320.0,
    "unit_price": 3.58,
    "district": "浦东新区",
    "business_area": "陆家嘴",
    "remarks": "业主诚心出售"
  }'
```

---

### 1.3 获取单个线索详情

根据线索 ID 获取详细信息。

```
GET /api/v1/leads/{lead_id}
```

#### 请求参数（Path）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `lead_id` | `string` | 是 | 线索 ID |

#### 响应数据

**HTTP 200** — `LeadResponse`（结构同 [1.2 创建线索响应](#12-创建线索)）

#### 错误响应

| HTTP 状态码 | 说明 |
|-------------|------|
| 404 | 线索不存在 |

```json
{
  "detail": "Lead not found"
}
```

#### 请求示例

```bash
curl -X GET "http://localhost:8000/api/v1/leads/a1b2c3d4-e5f6-7890-abcd-ef1234567890" \
  -H "Authorization: Bearer <token>"
```

---

### 1.4 更新线索

更新指定线索的信息。仅传入需要更新的字段（部分更新）。若 `total_price` 发生变化，系统将自动创建价格历史记录。

```
PUT /api/v1/leads/{lead_id}
```

**速率限制：100 次/小时**

#### 请求参数

**Path**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `lead_id` | `string` | 是 | 线索 ID |

**Body — `LeadUpdate`**（所有字段均为可选，仅传入需要更新的字段）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `community_name` | `string` | 否 | 小区名称 |
| `community_id` | `string` | 否 | 小区 ID |
| `is_hot` | `int` | 否 | 是否热门 |
| `layout` | `string` | 否 | 户型 |
| `orientation` | `string` | 否 | 朝向 |
| `floor_info` | `string` | 否 | 楼层信息 |
| `area` | `float` | 否 | 面积（㎡） |
| `total_price` | `float` | 否 | 总价（万元） |
| `unit_price` | `float` | 否 | 单价（万元/㎡） |
| `eval_price` | `float` | 否 | 评估价（万元） |
| `status` | `LeadStatus` | 否 | 线索状态 |
| `audit_reason` | `string` | 否 | 审核原因/驳回理由 |
| `images` | `list[string]` | 否 | 图片 URL 列表（整体替换） |
| `district` | `string` | 否 | 行政区 |
| `business_area` | `string` | 否 | 商圈 |
| `remarks` | `string` | 否 | 备注 |
| `last_follow_up_at` | `datetime` | 否 | 最后跟进时间 |

#### 响应数据

**HTTP 200** — `LeadResponse`（结构同 [1.2 创建线索响应](#12-创建线索)）

#### 错误响应

| HTTP 状态码 | 说明 |
|-------------|------|
| 404 | 线索不存在 |
| 429 | 请求频率超限 |

```json
{
  "detail": "Lead not found"
}
```

#### 请求示例

```bash
# 更新状态为"已看房"并填写审核原因
curl -X PUT "http://localhost:8000/api/v1/leads/a1b2c3d4-e5f6-7890-abcd-ef1234567890" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "visited",
    "audit_reason": "实地看房完成，业主报价合理"
  }'

# 更新总价（会自动生成价格历史记录）
curl -X PUT "http://localhost:8000/api/v1/leads/a1b2c3d4-e5f6-7890-abcd-ef1234567890" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "total_price": 305.0
  }'
```

---

### 1.5 删除线索

永久删除指定线索及其关联的跟进记录和价格历史。

```
DELETE /api/v1/leads/{lead_id}
```

**速率限制：20 次/小时**

#### 请求参数（Path）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `lead_id` | `string` | 是 | 线索 ID |

#### 响应数据

**HTTP 204** — 无响应体

#### 错误响应

| HTTP 状态码 | 说明 |
|-------------|------|
| 404 | 线索不存在 |
| 429 | 请求频率超限 |

#### 请求示例

```bash
curl -X DELETE "http://localhost:8000/api/v1/leads/a1b2c3d4-e5f6-7890-abcd-ef1234567890" \
  -H "Authorization: Bearer <token>"
```

---

### 1.6 获取线索漏斗统计

获取各状态线索的数量统计，用于漏斗图展示。

```
GET /api/v1/leads/stats/funnel
```

#### 请求参数

无

#### 响应数据

**HTTP 200** — `LeadFunnelResponse`

```json
{
  "total": 156,
  "evaluating": 42,
  "rejected": 18,
  "visiting": 65,
  "signed": 31
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `total` | `int` | 线索总数 |
| `evaluating` | `int` | 评估中数量（`pending_assessment` + `pending_visit`） |
| `rejected` | `int` | 已驳回数量 |
| `visiting` | `int` | 带看中数量（`visited`） |
| `signed` | `int` | 已签约数量 |

#### 请求示例

```bash
curl -X GET "http://localhost:8000/api/v1/leads/stats/funnel" \
  -H "Authorization: Bearer <token>"
```

---

## 2. 跟进记录

### 2.1 添加跟进记录

为指定线索添加一条跟进记录。添加成功后，系统将自动更新线索的 `last_follow_up_at` 字段。

```
POST /api/v1/leads/{lead_id}/follow-ups
```

#### 请求参数

**Path**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `lead_id` | `string` | 是 | 线索 ID |

**Body — `FollowUpCreate`**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `method` | `FollowUpMethod` | 是 | 跟进方式（`phone`/`wechat`/`face`/`visit`） |
| `content` | `string` | 是 | 跟进内容 |

#### 响应数据

**HTTP 200** — `FollowUpResponse`

```json
{
  "method": "phone",
  "content": "电话沟通，业主表示价格可谈",
  "id": "f1e2d3c4-b5a6-7890-abcd-ef1234567890",
  "lead_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "followed_at": "2026-05-25T14:30:00Z",
  "created_by_id": "user-001",
  "created_by_name": "张三"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 跟进记录 ID（UUID） |
| `lead_id` | `string` | 所属线索 ID |
| `method` | `FollowUpMethod` | 跟进方式 |
| `content` | `string` | 跟进内容 |
| `followed_at` | `datetime` | 跟进时间 |
| `created_by_id` | `string` | 跟进人 ID |
| `created_by_name` | `string \| null` | 跟进人姓名 |

#### 错误响应

| HTTP 状态码 | 说明 |
|-------------|------|
| 404 | 线索不存在 |
| 422 | 请求参数校验失败 |

#### 请求示例

```bash
curl -X POST "http://localhost:8000/api/v1/leads/a1b2c3d4-e5f6-7890-abcd-ef1234567890/follow-ups" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "phone",
    "content": "电话沟通，业主表示价格可谈"
  }'
```

---

### 2.2 获取跟进记录列表

获取指定线索的所有跟进记录，按跟进时间倒序排列。

```
GET /api/v1/leads/{lead_id}/follow-ups
```

#### 请求参数（Path）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `lead_id` | `string` | 是 | 线索 ID |

#### 响应数据

**HTTP 200** — `list[FollowUpResponse]`

```json
[
  {
    "method": "visit",
    "content": "实地看房，房屋状况良好",
    "id": "f1e2d3c4-b5a6-7890-abcd-ef1234567891",
    "lead_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "followed_at": "2026-05-24T10:00:00Z",
    "created_by_id": "user-002",
    "created_by_name": "李四"
  },
  {
    "method": "phone",
    "content": "电话沟通，业主表示价格可谈",
    "id": "f1e2d3c4-b5a6-7890-abcd-ef1234567890",
    "lead_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "followed_at": "2026-05-23T14:30:00Z",
    "created_by_id": "user-001",
    "created_by_name": "张三"
  }
]
```

#### 请求示例

```bash
curl -X GET "http://localhost:8000/api/v1/leads/a1b2c3d4-e5f6-7890-abcd-ef1234567890/follow-ups" \
  -H "Authorization: Bearer <token>"
```

---

## 3. 价格历史

### 3.1 获取价格历史

获取指定线索的价格变更历史，按记录时间倒序排列。

```
GET /api/v1/leads/{lead_id}/prices
```

#### 请求参数（Path）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `lead_id` | `string` | 是 | 线索 ID |

#### 响应数据

**HTTP 200** — `list[PriceHistoryResponse]`

```json
[
  {
    "price": 305.0,
    "remark": "二次授权降价",
    "id": "p1e2d3c4-b5a6-7890-abcd-ef1234567891",
    "lead_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "recorded_at": "2026-05-22T16:00:00Z",
    "created_by_id": "user-001",
    "created_by_name": "张三"
  },
  {
    "price": 320.0,
    "remark": "Initial Creation",
    "id": "p1e2d3c4-b5a6-7890-abcd-ef1234567890",
    "lead_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "recorded_at": "2026-05-15T08:00:00Z",
    "created_by_id": "user-001",
    "created_by_name": "张三"
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 价格记录 ID（UUID） |
| `lead_id` | `string` | 所属线索 ID |
| `price` | `float` | 授权价格（万元） |
| `remark` | `string \| null` | 调整备注/原因 |
| `recorded_at` | `datetime` | 记录时间 |
| `created_by_id` | `string` | 记录人 ID |
| `created_by_name` | `string \| null` | 记录人姓名 |

#### 请求示例

```bash
curl -X GET "http://localhost:8000/api/v1/leads/a1b2c3d4-e5f6-7890-abcd-ef1234567890/prices" \
  -H "Authorization: Bearer <token>"
```

---

### 3.2 添加价格记录

为指定线索添加价格记录（如二次授权调价）。添加成功后，系统将自动更新线索的 `total_price` 为新价格。

```
POST /api/v1/leads/{lead_id}/prices
```

#### 请求参数

**Path**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `lead_id` | `string` | 是 | 线索 ID |

**Body — `PriceHistoryCreate`**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `price` | `float` | 是 | 授权价格（万元） |
| `remark` | `string` | 否 | 调整备注/原因 |

#### 响应数据

**HTTP 200** — `PriceHistoryResponse`

```json
{
  "price": 305.0,
  "remark": "二次授权降价",
  "id": "p1e2d3c4-b5a6-7890-abcd-ef1234567891",
  "lead_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "recorded_at": "2026-05-22T16:00:00Z",
  "created_by_id": "user-001",
  "created_by_name": "张三"
}
```

#### 错误响应

| HTTP 状态码 | 说明 |
|-------------|------|
| 404 | 线索不存在 |
| 422 | 请求参数校验失败 |

#### 请求示例

```bash
curl -X POST "http://localhost:8000/api/v1/leads/a1b2c3d4-e5f6-7890-abcd-ef1234567890/prices" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "price": 305.0,
    "remark": "二次授权降价"
  }'
```

---

## 错误码汇总

| HTTP 状态码 | 错误场景 | 说明 |
|-------------|----------|------|
| 200 | 成功 | 请求成功处理 |
| 204 | 删除成功 | 线索删除成功，无响应体 |
| 401 | 未认证 | 缺少或无效的 Authorization 头 |
| 403 | 无权限 | 无权访问该资源 |
| 404 | 资源不存在 | 线索/跟进记录不存在 |
| 422 | 参数校验失败 | 请求参数不符合 Schema 定义 |
| 429 | 请求频率超限 | 超出速率限制，请稍后重试 |
| 500 | 服务器内部错误 | 服务端异常 |

## 速率限制汇总

| 接口 | 限制 | 说明 |
|------|------|------|
| `PUT /leads/{lead_id}` | 100 次/小时 | 更新线索 |
| `DELETE /leads/{lead_id}` | 20 次/小时 | 删除线索 |
| 其他接口 | 无特殊限制 | 建议合理控制请求频率 |

## 业务规则说明

1. **自动价格历史**：创建线索时若传入 `total_price`，系统自动创建一条 `remark` 为 `"Initial Creation"` 的初始价格历史记录。
2. **价格变更追踪**：更新线索的 `total_price` 时，若新价格与原价格不同，系统自动创建价格历史记录。
3. **添加价格记录联动**：通过价格历史接口添加记录时，线索的 `total_price` 会同步更新为新价格。
4. **跟进时间自动更新**：添加跟进记录时，线索的 `last_follow_up_at` 自动更新为当前时间。
5. **级联删除**：删除线索时，其关联的跟进记录和价格历史记录将被级联删除。
6. **列表性能优化**：线索列表接口使用专用的 `LeadListItem` Schema 进行手动序列化，避免 ORM 关系遍历导致的性能问题。
