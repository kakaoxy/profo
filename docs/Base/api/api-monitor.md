# 市场监控模块 API 文档

> 基础路径前缀：`/api/v1`
>
> Monitor 路由前缀：`/api/v1/monitor`
>
> 所有接口均需认证，需在请求头中携带 `Authorization: Bearer <token>`
>
> 认证要求：内部用户（CurrentInternalUserDep）

---

## 目录

- [1. 市场情绪](#1-市场情绪)
  - [1.1 获取市场情绪数据](#11-获取市场情绪数据)
- [2. 趋势数据](#2-趋势数据)
  - [2.1 获取趋势数据](#21-获取趋势数据)
- [3. AI 策略](#3-ai-策略)
  - [3.1 生成 AI 策略建议](#31-生成-ai-策略建议)
- [4. 周边竞品雷达](#4-周边竞品雷达)
  - [4.1 获取周边竞品雷达数据](#41-获取周边竞品雷达数据)
- [5. 竞品管理](#5-竞品管理)
  - [5.1 获取竞品列表](#51-获取竞品列表)
  - [5.2 添加竞品小区](#52-添加竞品小区)
  - [5.3 删除竞品](#53-删除竞品)
- [6. 小区市场统计](#6-小区市场统计)
  - [6.1 获取小区市场统计数据](#61-获取小区市场统计数据)
- [7. Schema 定义](#7-schema-定义)
- [8. 错误码表](#8-错误码表)

---

## 1. 市场情绪

### 1.1 获取市场情绪数据

获取指定小区的市场情绪数据，包含按楼层级别（高/中/低）统计的挂牌与成交信息，以及库存去化月数。

```
GET /api/v1/monitor/communities/{community_id}/sentiment
```

**Path 参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| community_id | string | 是 | 小区 ID |

**请求示例**

```http
GET /api/v1/monitor/communities/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sentiment
Authorization: Bearer <token>
```

**响应示例**

```json
{
  "floor_stats": [
    {
      "type": "high",
      "deals_count": 12,
      "deal_avg_price": 72625.0,
      "current_count": 8,
      "current_avg_price": 75000.0
    },
    {
      "type": "mid",
      "deals_count": 18,
      "deal_avg_price": 71000.0,
      "current_count": 10,
      "current_avg_price": 73500.0
    },
    {
      "type": "low",
      "deals_count": 6,
      "deal_avg_price": 68000.0,
      "current_count": 5,
      "current_avg_price": 70000.0
    }
  ],
  "inventory_months": 8.2
}
```

**响应 Schema**：[MarketSentimentResponse](#marketsentimentresponse)

> **说明**：
> - `type` 取值为 `high`（高楼层）、`mid`（中楼层）、`low`（低楼层）
> - `deal_avg_price` / `current_avg_price` 单位为元/㎡
> - `deals_count` 统计过去 12 个月的成交数据
> - `inventory_months` = 当前挂牌总量 ÷ 月均成交量，无成交数据时返回 `99.9`
> - 去重逻辑：相同 `build_area` + `floor_level` + `price` 的房源视为同一套房

---

## 2. 趋势数据

### 2.1 获取趋势数据

获取指定小区的挂牌价/成交价/成交量月度趋势数据。

```
GET /api/v1/monitor/communities/{community_id}/trends
```

**Path 参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| community_id | string | 是 | 小区 ID |

**Query 参数**

| 参数 | 类型 | 必填 | 约束 | 默认值 | 说明 |
|------|------|------|------|--------|------|
| months | integer | 否 | 1–24 | 6 | 查询月数 |

**请求示例**

```http
GET /api/v1/monitor/communities/a1b2c3d4-e5f6-7890-abcd-ef1234567890/trends?months=6
Authorization: Bearer <token>
```

**响应示例**

```json
[
  {
    "month": "2025-01",
    "listing_price": 75000.0,
    "deal_price": 72000.0,
    "volume": 5
  },
  {
    "month": "2025-02",
    "listing_price": 74500.0,
    "deal_price": 71500.0,
    "volume": 3
  },
  {
    "month": "2025-03",
    "listing_price": 74800.0,
    "deal_price": 72200.0,
    "volume": 7
  },
  {
    "month": "2025-04",
    "listing_price": 75200.0,
    "deal_price": 72800.0,
    "volume": 6
  },
  {
    "month": "2025-05",
    "listing_price": 74600.0,
    "deal_price": 71800.0,
    "volume": 4
  },
  {
    "month": "2025-06",
    "listing_price": 75000.0,
    "deal_price": 72500.0,
    "volume": 8
  }
]
```

**响应 Schema**：`list[`[TrendData](#trenddata)`]`

> **说明**：
> - `listing_price` / `deal_price` 单位为元/㎡
> - `volume` 为当月成交量
> - 结果按 `month` 升序排列
> - 若某月仅有挂牌无成交（或反之），缺失字段为 `0`

---

## 3. AI 策略

### 3.1 生成 AI 策略建议

基于项目和市场数据，生成 AI 策略分析报告。

```
POST /api/v1/monitor/ai-strategy
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_id | string | 是 | 项目 ID |
| user_context | string | 是 | 用户提供的上下文信息 |

**请求示例**

```http
POST /api/v1/monitor/ai-strategy
Authorization: Bearer <token>
Content-Type: application/json

{
  "project_id": "proj-001",
  "user_context": "该小区近期成交量上升，但挂牌价持续走低，需要制定定价策略"
}
```

**响应示例**

```json
{
  "report_markdown": "### AI Analysis\nBased on current market trends (Mock Data), the property is well positioned...",
  "risk_points": {
    "profit_critical_price": 2000000,
    "daily_cost": 500
  },
  "action_plan": [
    "Suggested listing price: 210W",
    "refresh photos"
  ]
}
```

**响应 Schema**：[AIStrategyResponse](#aistrategyresponse)

> **说明**：
> - `profit_critical_price` 为保本临界价（元）
> - `daily_cost` 为每日持有成本（元）
> - 当前为 Mock 实现，后续将接入真实 AI 模型

---

## 4. 周边竞品雷达

### 4.1 获取周边竞品雷达数据

获取指定小区及其所有竞品小区的挂牌/成交统计，按数据来源（贝壳/我爱我家）分渠道展示，并计算与本案的价差。

```
GET /api/v1/monitor/communities/{community_id}/radar
```

**Path 参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| community_id | string | 是 | 小区 ID（本案小区） |

**请求示例**

```http
GET /api/v1/monitor/communities/a1b2c3d4-e5f6-7890-abcd-ef1234567890/radar
Authorization: Bearer <token>
```

**响应示例**

```json
{
  "items": [
    {
      "community_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
      "community_name": "绿地海珀",
      "is_subject": false,
      "listing_count": 15,
      "listing_beike": 10,
      "listing_iaij": 5,
      "listing_avg_price": 78000.0,
      "deal_count": 8,
      "deal_beike": 5,
      "deal_iaij": 3,
      "deal_avg_price": 76000.0,
      "spread_percent": 5.6,
      "spread_label": "高于本案 5.6%"
    },
    {
      "community_id": "d4e5f6a7-b8c9-0123-def0-234567890123",
      "community_name": "保利天悦",
      "is_subject": false,
      "listing_count": 12,
      "listing_beike": 8,
      "listing_iaij": 4,
      "listing_avg_price": 69000.0,
      "deal_count": 6,
      "deal_beike": 4,
      "deal_iaij": 2,
      "deal_avg_price": 67500.0,
      "spread_percent": -6.3,
      "spread_label": "低于本案 6.3%"
    },
    {
      "community_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "community_name": "万科城市花园 (本案)",
      "is_subject": true,
      "listing_count": 20,
      "listing_beike": 14,
      "listing_iaij": 6,
      "listing_avg_price": 73500.0,
      "deal_count": 10,
      "deal_beike": 7,
      "deal_iaij": 3,
      "deal_avg_price": 72000.0,
      "spread_percent": 0.0,
      "spread_label": "[ 当前位置 ]"
    }
  ]
}
```

**响应 Schema**：[NeighborhoodRadarResponse](#neighborhoodradarresponse)

> **说明**：
> - 本案小区始终包含在结果中，`is_subject` 为 `true`，`community_name` 后缀标注 `(本案)`
> - `listing_beike` / `listing_iaij` 分别为贝壳和我爱我家的挂牌数量
> - `deal_beike` / `deal_iaij` 分别为贝壳和我爱我家的成交数量
> - 成交数据统计范围为过去 12 个月
> - `spread_percent` 为竞品成交均价相对本案成交均价的涨跌百分比，正数表示高于本案
> - 本案排在列表最后，竞品按小区名称排序
> - 若小区不存在，返回空列表 `{"items": []}`

---

## 5. 竞品管理

### 5.1 获取竞品列表

获取指定小区的竞品小区列表，包含实时计算的挂牌均价和在售数量。

```
GET /api/v1/monitor/communities/{community_id}/competitors
```

**Path 参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| community_id | string | 是 | 小区 ID |

**请求示例**

```http
GET /api/v1/monitor/communities/a1b2c3d4-e5f6-7890-abcd-ef1234567890/competitors
Authorization: Bearer <token>
```

**响应示例**

```json
[
  {
    "community_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
    "community_name": "绿地海珀",
    "avg_price": 78000.0,
    "on_sale_count": 15
  },
  {
    "community_id": "d4e5f6a7-b8c9-0123-def0-234567890123",
    "community_name": "保利天悦",
    "avg_price": 69000.0,
    "on_sale_count": 12
  }
]
```

**响应 Schema**：`list[`[CompetitorResponse](#competitorresponse)`]`

> **说明**：
> - `avg_price` 为当前在售房源的挂牌均价（元/㎡），无在售房源时为 `0`
> - `on_sale_count` 为当前在售房源数量
> - 若无竞品记录，返回空数组 `[]`

---

### 5.2 添加竞品小区

为指定小区添加一个竞品小区关联。

```
POST /api/v1/monitor/communities/{community_id}/competitors
```

**Path 参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| community_id | string | 是 | 小区 ID |

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| competitor_community_id | string | 是 | 竞品小区 ID |

**请求示例**

```http
POST /api/v1/monitor/communities/a1b2c3d4-e5f6-7890-abcd-ef1234567890/competitors
Authorization: Bearer <token>
Content-Type: application/json

{
  "competitor_community_id": "c3d4e5f6-a7b8-9012-cdef-123456789012"
}
```

**响应**

- HTTP `201 Created`，无返回体

**错误响应**

| HTTP 状态码 | 场景 | detail |
|-------------|------|--------|
| 409 | 竞品小区已存在 | `竞品小区已存在` |

---

### 5.3 删除竞品

删除指定小区的竞品关联。

```
DELETE /api/v1/monitor/communities/{community_id}/competitors/{competitor_id}
```

**速率限制**：20 次/小时

**Path 参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| community_id | string | 是 | 小区 ID |
| competitor_id | string | 是 | 竞品小区 ID |

**请求示例**

```http
DELETE /api/v1/monitor/communities/a1b2c3d4-e5f6-7890-abcd-ef1234567890/competitors/c3d4e5f6-a7b8-9012-cdef-123456789012
Authorization: Bearer <token>
```

**响应**

- HTTP `204 No Content`，无返回体

**错误响应**

| HTTP 状态码 | 场景 | detail |
|-------------|------|--------|
| 404 | 竞品小区不存在 | `竞品小区不存在` |

---

## 6. 小区市场统计

### 6.1 获取小区市场统计数据

获取指定小区的市场统计摘要数据，用于项目卡片展示。

```
GET /api/v1/monitor/communities/{community_id}/market-stats
```

**Path 参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| community_id | string | 是 | 小区 ID |

**请求示例**

```http
GET /api/v1/monitor/communities/a1b2c3d4-e5f6-7890-abcd-ef1234567890/market-stats
Authorization: Bearer <token>
```

**响应示例**

```json
{
  "on_sale": 20,
  "avg_price": 72000.0,
  "volume_30d": 8,
  "price_trend_30d": 2.35,
  "is_price_up": true
}
```

**响应 Schema**：[CommunityMarketStatsResponse](#communitymarketstatsresponse)

> **说明**：
> - `on_sale`：当前在售房源数量
> - `avg_price`：最近 30 天成交均价（元/㎡），无成交时为 `0`
> - `volume_30d`：最近 30 天成交量
> - `price_trend_30d`：30 日价格趋势百分比（最近 30 天均价 vs 前 30 天均价），正数表示上涨
> - `is_price_up`：价格趋势方向，`true` = 上涨，`false` = 下跌，`null` = 持平/数据不足

---

## 7. Schema 定义

### FloorStats

楼层统计数据模型。

| 字段 | 类型 | 说明 |
|------|------|------|
| type | string | 楼层级别（`high` / `mid` / `low`） |
| deals_count | integer | 成交数量（过去 12 个月） |
| deal_avg_price | float | 成交均价（元/㎡） |
| current_count | integer | 当前挂牌数量 |
| current_avg_price | float | 挂牌均价（元/㎡） |

### MarketSentimentResponse

市场情绪响应。

| 字段 | 类型 | 说明 |
|------|------|------|
| floor_stats | list[[FloorStats](#floorstats)] | 楼层级别统计列表（固定 3 项：high/mid/low） |
| inventory_months | float | 库存去化月数，无成交数据时为 `99.9` |

### TrendData

趋势数据模型。

| 字段 | 类型 | 说明 |
|------|------|------|
| month | string | 月份（格式 `YYYY-MM`） |
| listing_price | float | 挂牌均价（元/㎡） |
| deal_price | float | 成交均价（元/㎡） |
| volume | integer | 成交量 |

### AIStrategyRequest

AI 策略请求。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_id | string | 是 | 项目 ID |
| user_context | string | 是 | 用户提供的上下文信息 |

### RiskPoints

风险点数据。

| 字段 | 类型 | 说明 |
|------|------|------|
| profit_critical_price | float | 保本临界价（元） |
| daily_cost | float | 每日持有成本（元） |

### AIStrategyResponse

AI 策略响应。

| 字段 | 类型 | 说明 |
|------|------|------|
| report_markdown | string | Markdown 格式的分析报告 |
| risk_points | [RiskPoints](#riskpoints) | 风险点数据 |
| action_plan | list\<string\> | 行动计划列表 |

### CompetitorResponse

竞品小区响应。

| 字段 | 类型 | 说明 |
|------|------|------|
| community_id | string | 竞品小区 ID |
| community_name | string | 竞品小区名称 |
| avg_price | float | 在售挂牌均价（元/㎡） |
| on_sale_count | integer | 在售房源数量 |

### AddCompetitorRequest

添加竞品请求。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| competitor_community_id | string | 是 | 竞品小区 ID |

### NeighborhoodRadarItem

周边竞品雷达单项数据。

| 字段 | 类型 | 说明 |
|------|------|------|
| community_id | string | 小区 ID |
| community_name | string | 小区名称（本案后缀标注 `(本案)`） |
| is_subject | boolean | 是否为本案小区 |
| listing_count | integer | 挂牌总量 |
| listing_beike | integer | 贝壳渠道挂牌数量 |
| listing_iaij | integer | 我爱我家渠道挂牌数量 |
| listing_avg_price | float | 挂牌均价（元/㎡） |
| deal_count | integer | 成交总量（过去 12 个月） |
| deal_beike | integer | 贝壳渠道成交数量 |
| deal_iaij | integer | 我爱我家渠道成交数量 |
| deal_avg_price | float | 成交均价（元/㎡） |
| spread_percent | float | 相对本案成交均价的价差百分比，正数 = 高于本案 |
| spread_label | string | 价差标签，如 `高于本案 5.6%`、`低于本案 6.3%`、`[ 当前位置 ]`、`数据不足` |

### NeighborhoodRadarResponse

周边竞品雷达响应。

| 字段 | 类型 | 说明 |
|------|------|------|
| items | list[[NeighborhoodRadarItem](#neighborhoodradaritem)] | 雷达数据列表，本案排在最后 |

### CommunityMarketStatsResponse

小区市场统计数据响应。

| 字段 | 类型 | 说明 |
|------|------|------|
| on_sale | integer | 竞品在售数量 |
| avg_price | float | 成交均价（元/㎡） |
| volume_30d | integer | 30 日成交量 |
| price_trend_30d | float | 30 日价格趋势百分比 |
| is_price_up | boolean \| null | 价格趋势方向：`true` = 上涨，`false` = 下跌，`null` = 持平/数据不足 |

---

## 8. 错误码表

### 通用错误

| HTTP 状态码 | 说明 |
|-------------|------|
| 401 | 未认证或 Token 无效/过期 |
| 403 | 权限不足（非内部用户） |
| 422 | 请求参数校验失败（类型/约束不满足） |
| 429 | 请求频率超过速率限制 |

### 监控模块错误

| HTTP 状态码 | 接口 | 场景 | detail |
|-------------|------|------|--------|
| 409 | POST .../competitors | 竞品小区已存在 | `竞品小区已存在` |
| 404 | DELETE .../competitors/{id} | 竞品小区不存在 | `竞品小区不存在` |

### 速率限制汇总

| 接口 | 限制 |
|------|------|
| DELETE /api/v1/monitor/communities/{community_id}/competitors/{competitor_id} | 20 次/小时 |
