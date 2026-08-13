# 市场情报模块 API 文档

> 基础路径前缀：`/api/v1`
>
> 所有接口均需认证，需在请求头中携带 `Authorization: Bearer <token>`

---

## 目录

- [1. 小区管理](#1-小区管理)
  - [1.1 查询小区列表](#11-查询小区列表)
  - [1.2 查询字典列表](#12-查询字典列表)
  - [1.3 合并小区](#13-合并小区)
  - [1.4 创建小区](#14-创建小区)
- [2. 房源查询](#2-房源查询)
  - [2.1 搜索小区](#21-搜索小区)
  - [2.2 查询房源列表](#22-查询房源列表)
  - [2.3 导出房源 CSV](#23-导出房源-csv)
  - [2.4 获取房源详情](#24-获取房源详情)
- [3. Schema 定义](#3-schema-定义)
- [4. 错误码表](#4-错误码表)

---

## 1. 小区管理

路由文件：`communities.py`，挂载路径 `/api/v1/admin/`

认证要求：operator 及以上角色

### 1.1 查询小区列表

获取小区分页列表，支持名称模糊搜索。

```
GET /api/v1/admin/communities
```

**Query 参数**

| 参数 | 类型 | 必填 | 约束 | 默认值 | 说明 |
|------|------|------|------|--------|------|
| search | string | 否 | - | - | 小区名称模糊匹配 |
| page | integer | 否 | ≥ 1 | 1 | 页码 |
| page_size | integer | 否 | 1–200 | 50 | 每页数量 |

**请求示例**

```http
GET /api/v1/admin/communities?search=万科&page=1&page_size=10
Authorization: Bearer <token>
```

**响应示例**

```json
{
  "total": 128,
  "items": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "万科城市花园",
      "city_id": 1,
      "district": "徐汇",
      "business_circle": "田林",
      "avg_price_wan": 8.5,
      "total_properties": 42,
      "created_at": "2025-03-15T08:30:00Z"
    }
  ]
}
```

**响应 Schema**：[CommunityListResponse](#communitylistresponse)

---

### 1.2 查询字典列表

返回行政区或商圈的去重列表，用于前端筛选下拉框。

```
GET /api/v1/admin/dictionaries
```

**Query 参数**

| 参数 | 类型 | 必填 | 约束 | 默认值 | 说明 |
|------|------|------|------|--------|------|
| dict_type | string | 是 | `district` \| `business_circle` | - | 字典类型 |
| search | string | 否 | - | - | 模糊搜索关键词 |
| limit | integer | 否 | 1–500 | 50 | 返回数量上限 |

**请求示例**

```http
GET /api/v1/admin/dictionaries?dict_type=district&search=徐&limit=10
Authorization: Bearer <token>
```

**响应示例**

```json
{
  "type": "district",
  "items": ["徐汇", "徐泾"]
}
```

**响应 Schema**：[DictionaryResponse](#dictionaryresponse)

**错误响应**

| HTTP 状态码 | 场景 | 示例 |
|-------------|------|------|
| 400 | 不支持的 dict_type 参数 | `{"detail": "不支持的字典类型: xxx"}` |

---

### 1.3 合并小区

将多个小区合并到主小区，合并后待合并小区的房源将关联到主小区。

```
POST /api/v1/admin/communities/merge
```

**认证要求**：admin 角色

**速率限制**：20 次/小时

**请求体**

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| primary_id | string | 是 | UUID | 主小区 ID（合并目标） |
| merge_ids | array\<string\> | 是 | ≥ 1 项，UUID | 待合并小区 ID 列表 |

> **校验规则**：
> - `primary_id` 不能出现在 `merge_ids` 中
> - `merge_ids` 中不能有重复 ID

**请求示例**

```http
POST /api/v1/admin/communities/merge
Authorization: Bearer <token>
Content-Type: application/json

{
  "primary_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "merge_ids": [
    "f0e1d2c3-b4a5-6789-0abc-def123456789",
    "11111111-2222-3333-4444-555555555555"
  ]
}
```

**响应示例**

```json
{
  "success": true,
  "affected_properties": 36,
  "message": "成功合并 2 个小区到 万科城市花园，影响 36 条房源"
}
```

**响应 Schema**：[CommunityMergeResponse](#communitymergeresponse)

**错误响应**

| HTTP 状态码 | 场景 | 示例 |
|-------------|------|------|
| 400 | 业务校验失败（ID 重复、主小区在合并列表中等） | `{"detail": "主小区ID不能出现在合并列表中"}` |
| 500 | 数据库错误或未知错误 | `{"detail": "合并操作失败，请联系管理员"}` |

---

### 1.4 创建小区

创建新小区。若同名小区已存在，则直接返回已有小区信息（幂等）。

```
POST /api/v1/admin/communities
```

**速率限制**：100 次/小时

**请求体**

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| name | string | 是 | 1–200 字符 | 小区名称 |
| district | string | 否 | 最多 100 字符 | 行政区 |
| business_circle | string | 否 | 最多 100 字符 | 商圈 |

**请求示例**

```http
POST /api/v1/admin/communities
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "绿地海珀",
  "district": "浦东",
  "business_circle": "陆家嘴"
}
```

**响应示例**

```json
{
  "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "name": "绿地海珀",
  "city_id": null,
  "district": "浦东",
  "business_circle": "陆家嘴",
  "avg_price_wan": null,
  "total_properties": 0,
  "created_at": "2025-06-01T10:00:00Z"
}
```

**响应 Schema**：[CommunityResponse](#communityresponse)

**错误响应**

| HTTP 状态码 | 场景 | 示例 |
|-------------|------|------|
| 500 | 数据库错误或未知错误 | `{"detail": "创建小区失败"}` |

---

## 2. 房源查询

路由文件：`properties.py`，挂载路径 `/api/v1/properties`

认证要求：内部用户（Internal User）

### 2.1 搜索小区

根据关键词搜索小区，返回精简信息，用于房源表单的小区选择器。

```
GET /api/v1/properties/communities/search
```

**Query 参数**

| 参数 | 类型 | 必填 | 约束 | 默认值 | 说明 |
|------|------|------|------|--------|------|
| q | string | 是 | min_length=1 | - | 搜索关键词 |

**请求示例**

```http
GET /api/v1/properties/communities/search?q=万科
Authorization: Bearer <token>
```

**响应示例**

```json
[
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "万科城市花园",
    "district": "徐汇",
    "business_circle": "田林"
  },
  {
    "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
    "name": "万科翡翠公园",
    "district": "闵行",
    "business_circle": "莘庄"
  }
]
```

**响应 Schema**：`list[`[CommunitySearchResponse](#communitysearchresponse)`]`

---

### 2.2 查询房源列表

多维度筛选、排序和分页查询房源数据。

```
GET /api/v1/properties
```

**Query 参数**

| 参数 | 类型 | 必填 | 约束 | 默认值 | 说明 |
|------|------|------|------|--------|------|
| status | string | 否 | `在售` \| `成交` | - | 房源状态 |
| community_name | string | 否 | - | - | 小区名称（模糊搜索） |
| districts | string | 否 | 逗号分隔 | - | 行政区筛选，如 `徐汇,静安` |
| business_circles | string | 否 | 逗号分隔 | - | 商圈筛选，如 `五角场,中关村` |
| orientations | string | 否 | 逗号分隔 | - | 朝向关键词，如 `南,东南` |
| floor_levels | string | 否 | 逗号分隔 | - | 楼层级别，如 `低楼层,中楼层,高楼层` |
| min_price | float | 否 | ≥ 0 | - | 最低价格（万） |
| max_price | float | 否 | ≥ 0 | - | 最高价格（万） |
| min_area | float | 否 | ≥ 0 | - | 最小面积（㎡） |
| max_area | float | 否 | ≥ 0 | - | 最大面积（㎡） |
| rooms | string | 否 | 逗号分隔整数 | - | 室数量，如 `1,2,3` |
| rooms_gte | integer | 否 | ≥ 0 | - | 最少室数量（如 5 表示 5 室及以上） |
| sort_by | string | 否 | - | `updated_at` | 排序字段 |
| sort_order | string | 否 | `asc` \| `desc` | `desc` | 排序方向 |
| page | integer | 否 | ≥ 1 | 1 | 页码 |
| page_size | integer | 否 | 1–200 | 50 | 每页数量 |

**请求示例**

```http
GET /api/v1/properties?status=在售&districts=徐汇,静安&min_price=300&max_price=800&rooms=2,3&sort_by=total_price&sort_order=asc&page=1&page_size=20
Authorization: Bearer <token>
```

**响应示例**

```json
{
  "items": [
    {
      "id": 1001,
      "data_source": "lianjia",
      "source_property_id": "SH202501001",
      "status": "在售",
      "community_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "community_name": "万科城市花园",
      "district": "徐汇",
      "business_circle": "田林",
      "rooms": 2,
      "halls": 1,
      "baths": 1,
      "layout_display": "2室1厅1卫",
      "orientation": "南",
      "floor_display": "6/18层",
      "floor_level": "中楼层",
      "build_area": 89.5,
      "inner_area": 72.3,
      "total_price": 650.0,
      "unit_price": 72625.7,
      "listed_date": "2025-04-20T00:00:00Z",
      "sold_date": null,
      "transaction_duration_days": null,
      "property_type": "住宅",
      "build_year": 2010,
      "decoration": "精装",
      "elevator": true,
      "picture_links": [
        "https://img.example.com/1.jpg",
        "https://img.example.com/2.jpg"
      ],
      "created_at": "2025-04-20T08:00:00Z",
      "updated_at": "2025-05-10T12:30:00Z"
    }
  ],
  "total": 256,
  "page": 1,
  "page_size": 20
}
```

**响应 Schema**：[PaginatedPropertyResponse](#paginatedpropertyresponse)

> **说明**：
> - `status` 在响应中可能为 `在售`、`成交` 或 `过期`（在售但超过 30 天未更新）
> - `total_price` 为计算字段：在售取 `listed_price_wan`，成交取 `sold_price_wan`
> - `unit_price` 为计算字段：`total_price × 10000 ÷ build_area`，保留 2 位小数
> - `layout_display` 为计算字段：有完整户型时显示 `X室X厅X卫`，否则显示 `X室`
> - `floor_display` 为计算字段：有有效楼层信息时显示 `X/Y层`，否则显示原始楼层文本或 `暂无数据`
> - `transaction_duration_days` 仅成交房源有值，为成交日期与挂牌日期之差（天）

---

### 2.3 导出房源 CSV

使用与查询接口相同的筛选和排序参数，导出所有匹配记录为 CSV 文件。

```
GET /api/v1/properties/export
```

**速率限制**：10 次/小时

**Query 参数**

与 [2.2 查询房源列表](#22-查询房源列表) 相同，但不含 `page` 和 `page_size` 分页参数。

| 参数 | 类型 | 必填 | 约束 | 默认值 | 说明 |
|------|------|------|------|--------|------|
| status | string | 否 | `在售` \| `成交` | - | 房源状态 |
| community_name | string | 否 | - | - | 小区名称（模糊搜索） |
| districts | string | 否 | 逗号分隔 | - | 行政区筛选 |
| business_circles | string | 否 | 逗号分隔 | - | 商圈筛选 |
| orientations | string | 否 | 逗号分隔 | - | 朝向关键词 |
| floor_levels | string | 否 | 逗号分隔 | - | 楼层级别 |
| min_price | float | 否 | ≥ 0 | - | 最低价格（万） |
| max_price | float | 否 | ≥ 0 | - | 最高价格（万） |
| min_area | float | 否 | ≥ 0 | - | 最小面积（㎡） |
| max_area | float | 否 | ≥ 0 | - | 最大面积（㎡） |
| rooms | string | 否 | 逗号分隔整数 | - | 室数量 |
| rooms_gte | integer | 否 | ≥ 0 | - | 最少室数量 |
| sort_by | string | 否 | - | `updated_at` | 排序字段 |
| sort_order | string | 否 | `asc` \| `desc` | `desc` | 排序方向 |

**请求示例**

```http
GET /api/v1/properties/export?status=成交&districts=徐汇&sort_by=sold_date&sort_order=desc
Authorization: Bearer <token>
```

**响应**

- Content-Type：`text/csv; charset=utf-8`
- Content-Disposition：`attachment; filename=properties_export_YYYYMMDD_HHMMSS.csv`
- 编码：UTF-8 with BOM（`utf-8-sig`）

**CSV 列定义**

| 列名 | 说明 |
|------|------|
| 数据源 | 数据来源平台 |
| 房源ID | 源平台房源编号 |
| 状态 | 在售/成交 |
| 小区名 | 所属小区名称 |
| 室 | 室数 |
| 厅 | 厅数 |
| 卫 | 卫数 |
| 朝向 | 朝向，无数据时显示 `未知` |
| 楼层 | 原始楼层文本 |
| 面积 | 建筑面积（㎡） |
| 套内面积 | 套内面积（㎡） |
| 挂牌价 | 挂牌价格（万） |
| 上架时间 | 挂牌日期 |
| 成交价 | 成交价格（万） |
| 成交时间 | 成交日期 |
| 物业类型 | 住宅/公寓等 |
| 建筑年代 | 建成年份 |
| 建筑结构 | 钢混/砖混等 |
| 装修情况 | 精装/简装/毛坯等 |
| 电梯 | TRUE/FALSE |
| 产权性质 | 商品房/经济适用房等 |
| 产权年限 | 70/50/40 等 |
| 上次交易 | 上次交易时间 |
| 供暖方式 | 集中供暖/自采暖等 |
| 房源描述 | 房源备注信息 |
| 图片链接 | 逗号分隔的图片 URL |
| 城市ID | 城市编号 |
| 行政区 | 行政区名称 |
| 商圈 | 商圈名称 |

---

### 2.4 获取房源详情

获取单个房源的完整信息，包含详情页专有字段。

```
GET /api/v1/properties/{property_id}
```

**Path 参数**

| 参数 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| property_id | integer | 是 | ≥ 1 | 房源 ID |

**请求示例**

```http
GET /api/v1/properties/1001
Authorization: Bearer <token>
```

**响应示例**

```json
{
  "id": 1001,
  "data_source": "lianjia",
  "source_property_id": "SH202501001",
  "status": "成交",
  "community_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "community_name": "万科城市花园",
  "district": "徐汇",
  "business_circle": "田林",
  "rooms": 2,
  "halls": 1,
  "baths": 1,
  "layout_display": "2室1厅1卫",
  "orientation": "南",
  "floor_original": "中楼层/18层",
  "floor_display": "6/18层",
  "floor_number": 6,
  "total_floors": 18,
  "floor_level": "中楼层",
  "build_area": 89.5,
  "inner_area": 72.3,
  "listed_price_wan": 680.0,
  "sold_price_wan": 650.0,
  "unit_price": 72625.7,
  "transaction_duration_display": "45天",
  "discount_rate_display": "4.41%",
  "listed_date": "2025-01-15T00:00:00Z",
  "sold_date": "2025-03-01T00:00:00Z",
  "transaction_duration_days": 45,
  "property_type": "住宅",
  "build_year": 2010,
  "building_structure": "钢混",
  "decoration": "精装",
  "elevator": true,
  "ownership_type": "商品房",
  "ownership_years": 70,
  "last_transaction": "2018-06-01",
  "heating_method": "集中供暖",
  "listing_remarks": "满五唯一，学区房",
  "picture_links": [
    "https://img.example.com/1.jpg",
    "https://img.example.com/2.jpg"
  ],
  "created_at": "2025-01-15T08:00:00Z",
  "updated_at": "2025-03-01T10:00:00Z"
}
```

**响应 Schema**：[PropertyDetailResponse](#propertydetailresponse)

> **说明**：
> - `discount_rate_display`：折扣率 = (挂牌价 - 成交价) / 挂牌价 × 100%，仅成交房源且有有效价格数据时显示
> - `transaction_duration_display`：成交周期显示，如 `45天`
> - `floor_original`：原始楼层文本，如 `中楼层/18层`

**错误响应**

| HTTP 状态码 | 场景 | 示例 |
|-------------|------|------|
| 404 | 房源不存在 | `{"detail": "房源不存在"}` |

---

## 3. Schema 定义

### CommunityResponse

小区基础信息响应模型。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 小区 ID（UUID） |
| name | string | 小区名称 |
| city_id | integer \| null | 城市 ID |
| district | string \| null | 行政区 |
| business_circle | string \| null | 商圈 |
| avg_price_wan | float \| null | 均价（万/㎡） |
| total_properties | integer | 关联房源总数 |
| created_at | datetime | 创建时间 |

### CommunityListResponse

小区分页列表响应。

| 字段 | 类型 | 说明 |
|------|------|------|
| total | integer | 总记录数 |
| items | list[[CommunityResponse](#communityresponse)] | 小区列表 |

### CommunityMergeRequest

小区合并请求体。

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| primary_id | string | 是 | UUID | 主小区 ID（合并目标） |
| merge_ids | list\<string\> | 是 | ≥ 1 项，无重复，不含 primary_id | 待合并小区 ID 列表 |

### CommunityMergeResponse

小区合并响应。

| 字段 | 类型 | 说明 |
|------|------|------|
| success | boolean | 是否合并成功 |
| affected_properties | integer | 受影响的房源数量 |
| message | string | 操作结果描述 |

### CommunityCreateRequest

创建小区请求体。

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|
| name | string | 是 | 1–200 字符 | 小区名称 |
| district | string \| null | 否 | 最多 100 字符 | 行政区 |
| business_circle | string \| null | 否 | 最多 100 字符 | 商圈 |

### DictionaryResponse

字典响应模型。

| 字段 | 类型 | 说明 |
|------|------|------|
| type | string | 字典类型（`district` 或 `business_circle`） |
| items | list\<string\> | 去重后的值列表 |

### CommunitySearchResponse

小区搜索响应模型，精简字段用于搜索建议。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 小区 ID（UUID） |
| name | string | 小区名称 |
| district | string \| null | 行政区 |
| business_circle | string \| null | 商圈 |

### PropertyResponse

房源列表响应模型，包含计算字段。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 房源 ID |
| data_source | string | 数据来源 |
| source_property_id | string | 源平台房源编号 |
| status | string | 状态（`在售` / `成交` / `过期`） |
| community_id | string | 所属小区 ID |
| community_name | string | 所属小区名称 |
| district | string \| null | 行政区 |
| business_circle | string \| null | 商圈 |
| rooms | integer | 室数 |
| halls | integer | 厅数 |
| baths | integer | 卫数 |
| layout_display | string | 户型展示（如 `2室1厅1卫`） |
| orientation | string | 朝向 |
| floor_display | string | 楼层展示（如 `6/18层`） |
| floor_level | string \| null | 楼层级别（低/中/高楼层） |
| build_area | float | 建筑面积（㎡） |
| inner_area | float \| null | 套内面积（㎡） |
| total_price | float | 总价（万），在售取挂牌价，成交取成交价 |
| unit_price | float | 单价（元/㎡），保留 2 位小数 |
| listed_date | datetime \| null | 挂牌日期 |
| sold_date | datetime \| null | 成交日期 |
| transaction_duration_days | integer \| null | 成交周期（天），仅成交房源 |
| property_type | string \| null | 物业类型 |
| build_year | integer \| null | 建筑年代 |
| decoration | string \| null | 装修情况 |
| elevator | boolean \| null | 是否有电梯 |
| picture_links | list\<string\> \| null | 图片链接列表 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### PropertyDetailResponse

房源详情响应模型，在 PropertyResponse 基础上增加以下字段：

| 额外字段 | 类型 | 说明 |
|----------|------|------|
| floor_original | string | 原始楼层文本 |
| floor_number | integer \| null | 楼层号 |
| total_floors | integer \| null | 总楼层数 |
| listed_price_wan | float \| null | 挂牌价（万） |
| sold_price_wan | float \| null | 成交价（万） |
| transaction_duration_display | string \| null | 成交周期展示（如 `45天`） |
| discount_rate_display | string \| null | 折扣率展示（如 `4.41%`） |
| building_structure | string \| null | 建筑结构 |
| ownership_type | string \| null | 产权性质 |
| ownership_years | integer \| null | 产权年限 |
| last_transaction | string \| null | 上次交易时间 |
| heating_method | string \| null | 供暖方式 |
| listing_remarks | string \| null | 房源描述/备注 |

> 详情响应中不包含 `total_price` 字段，而是分别提供 `listed_price_wan` 和 `sold_price_wan`。

### PaginatedPropertyResponse

分页房源列表响应。

| 字段 | 类型 | 说明 |
|------|------|------|
| items | list[[PropertyResponse](#propertyresponse)] | 房源列表 |
| total | integer | 总记录数 |
| page | integer | 当前页码 |
| page_size | integer | 每页数量 |

---

## 4. 错误码表

### 通用错误

| HTTP 状态码 | code | 说明 |
|-------------|------|------|
| 401 | - | 未认证或 Token 无效/过期 |
| 403 | - | 权限不足（如 operator 角色访问 admin 接口） |
| 422 | - | 请求参数校验失败（类型/约束不满足） |
| 429 | - | 请求频率超过速率限制 |

### 小区管理模块错误

| HTTP 状态码 | 场景 | detail 示例 |
|-------------|------|-------------|
| 400 | 不支持的字典类型 | `不支持的字典类型: xxx` |
| 400 | 合并校验失败：主小区 ID 在合并列表中 | `主小区ID不能出现在合并列表中` |
| 400 | 合并校验失败：合并列表有重复 ID | `合并列表中存在重复的小区ID` |
| 400 | 合并业务校验失败（小区不存在等） | `小区 xxx 不存在` |
| 500 | 合并数据库错误 | `合并操作失败，请联系管理员` |
| 500 | 创建小区数据库错误 | `创建小区失败` |

### 房源查询模块错误

| HTTP 状态码 | 场景 | detail 示例 |
|-------------|------|-------------|
| 404 | 房源不存在 | `房源不存在` |

### 速率限制汇总

| 接口 | 限制 |
|------|------|
| POST /api/v1/admin/communities/merge | 20 次/小时 |
| POST /api/v1/admin/communities | 100 次/小时 |
| GET /api/v1/properties/export | 10 次/小时 |
