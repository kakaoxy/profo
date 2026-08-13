# 房源数据推送接口文档

> **版本**: v0.9.0 | **更新日期**: 2026-05-13 | **适用于**: M2M（机器对机器）API 调用场景

***

## 目录

1. [接口概述](#1-接口概述)
2. [快速开始](#2-快速开始)
3. [请求详解](#3-请求详解)
4. [响应详解](#4-响应详解)
5. [完整请求/响应示例](#5-完整请求响应示例)
6. [字段定义参考](#6-字段定义参考)
7. [错误处理指南](#7-错误处理指南)
8. [性能限制与最佳实践](#8-性能限制与最佳实践)
9. [安全要求](#9-安全要求)
10. [附录：内部处理流程](#10-附录内部处理流程)

***

## 1. 接口概述

房源数据推送接口（`push`）接收 **JSON 数组**，批量导入房源数据到 ProFo 房产数据中心。接口专为 **机器对机器（M2M）** 集成设计，不依赖用户 JWT Token，仅通过 API Key 认证。

### 核心特性

| 特性               | 说明                                          |
| ---------------- | ------------------------------------------- |
| **请求方式**         | `POST`                                      |
| **URL路径**        | `/api/v1/push`                              |
| **Content-Type** | `application/json`                          |
| **授权方式**         | `X-API-Key` Header（API Key 认证）              |
| **单次上限**         | **10,000 条**记录                              |
| **事务保证**         | 批次级别原子提交——全部成功提交或全部回滚                       |
| **去重策略**         | 基于 `(数据源, 房源ID)` 唯一索引：已存在→更新（追加历史快照），不存在→创建 |
| **线程池处理**        | 同步数据库操作在线程池中执行，不阻塞异步事件循环                    |
| **并发安全**         | SQLite WAL 模式 + 多次重试写锁                      |

### 与其他导入方式的对比

| 方式               | 接口                        | 场景          |
| ---------------- | ------------------------- | ----------- |
| **JSON 推送**（本文档） | `POST /api/v1/push`       | 程序化批量推送，M2M |
| CSV 上传           | `POST /api/v1/upload/csv` | 用户手动上传文件    |
| 异步导入任务           | `POST /api/v1/upload/csv` | 超大 CSV 后台处理 |

***

## 2. 快速开始

### 2.1 前置条件

1. 已获取有效的 API Key（联系管理员生成）
2. 后端服务已启动（默认 `http://localhost:8000`）

### 2.2 最小可用示例（curl）

```bash
curl -X POST "http://localhost:8000/api/v1/push" \
  -H "X-API-Key: profo_xxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "数据源": "贝壳找房",
      "房源ID": "BJ20240001",
      "状态": "在售",
      "小区名": "朝阳花园",
      "室": 3,
      "厅": 2,
      "卫": 1,
      "朝向": "南北",
      "楼层": "中楼层/共18层",
      "面积": 120.5,
      "挂牌价": 850,
      "上架时间": "2026-01-15"
    }
  ]'
```

### 2.3 Python SDK 示例

```python
import requests
from datetime import datetime

BASE_URL = "http://localhost:8000"
API_KEY = "profo_xxxxxxxxxxxxx"

def push_properties(records: list[dict]) -> dict:
    """推送房源数据到 ProFo"""
    headers = {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json",
    }
    resp = requests.post(f"{BASE_URL}/api/v1/push", json=records, headers=headers, timeout=120)

    if resp.status_code == 200:
        return resp.json()
    else:
        raise Exception(f"推送失败 [{resp.status_code}]: {resp.json().get('detail', '未知错误')}")

# 示例：推送两条房源
result = push_properties([
    {
        "数据源": "贝壳找房",
        "房源ID": "BJ20240001",
        "状态": "在售",
        "小区名": "朝阳花园",
        "室": 3, "厅": 2, "卫": 1,
        "朝向": "南北",
        "楼层": "中楼层/共18层",
        "面积": 120.5,
        "挂牌价": 850,
        "上架时间": "2026-01-15T10:00:00"
    },
    {
        "数据源": "贝壳找房",
        "房源ID": "BJ20240002",
        "状态": "在售",
        "小区名": "海淀新村",
        "室": 2, "厅": 1, "卫": 1,
        "朝向": "南北",
        "楼层": "高楼层/共10层",
        "面积": 87.3,
        "挂牌价": 520,
        "上架时间": "2026-02-01T14:00:00"
    }
])

print(f"成功: {result['success']}, 失败: {result['failed']}")
```

***

## 3. 请求详解

### 3.1 基本信息

| 项目               | 值                  |
| ---------------- | ------------------ |
| **方法**           | `POST`             |
| **路径**           | `/api/v1/push`     |
| **Content-Type** | `application/json` |

### 3.2 请求头 (Headers)

| 参数名            | 类型     | 必填    | 说明                                   |
| -------------- | ------ | ----- | ------------------------------------ |
| `X-API-Key`    | string | **是** | API Key，格式 `profo_<prefix>_<random>` |
| `Content-Type` | string | **是** | 固定值 `application/json`               |

> **注意**: 该接口**仅接受 API Key 认证**，JWT Bearer Token 或 Cookie 认证在此接口无效。认证失败统一返回 `401`。

### 3.3 请求体 (Request Body)

请求体为 **JSON 数组**，每个元素是一个房源数据对象。

**约束条件**:

| 约束    | 值                                  |
| ----- | ---------------------------------- |
| 最小记录数 | 1（不允许空数组）                          |
| 最大记录数 | **10,000**                         |
| 超出上限  | 返回 `400`，错误信息 "单次推送最多支持 10000 条记录" |

### 3.4 数据字段总览

字段分为三组：**必填字段**、**状态条件字段**、**可选字段**。

#### 3.4.1 必填字段（始终需要）

| 字段名（JSON Key） | 中文别名                 | 类型               | 约束                     | 说明                                      |
| ------------- | -------------------- | ---------------- | ---------------------- | --------------------------------------- |
| `数据源`         | `data_source`        | `string`         | 非空，自动 trim             | 数据来源平台名称，如"贝壳找房""链家"                    |
| `房源ID`        | `source_property_id` | `string`         | 非空，自动 trim             | 来源平台的房源唯一标识                             |
| `状态`          | `status`             | `"在售"` \| `"成交"` | 枚举，严格匹配                | 房源当前状态                                  |
| `小区名`         | `community_name`     | `string`         | `min_length=1`，自动 trim | 小区名称                                    |
| `室`           | `rooms`              | `int`            | `≥0`                   | 室数量                                     |
| `朝向`          | `orientation`        | `string`         | 非空，自动 trim             | 房屋朝向，如"南北""东南"                          |
| `楼层`          | `floor_original`     | `string`         | 非空                     | 原始楼层字符串，如"中楼层/共18层"（系统自动解析楼层数/总楼层/楼层等级） |
| `面积`          | `build_area`         | `float`          | `>0`                   | 建筑面积，单位 ㎡                               |

#### 3.4.2 状态条件字段（按状态动态必填）

| 字段名    | 中文别名               | 类型               | 约束   | 当状态为       |
| ------ | ------------------ | ---------------- | ---- | ---------- |
| `挂牌价`  | `listed_price_wan` | `float\|null`    | `>0` | **在售** 时必填 |
| `上架时间` | `listed_date`      | `datetime\|null` | —    | **在售** 时必填 |
| `成交价`  | `sold_price_wan`   | `float\|null`    | `>0` | **成交** 时必填 |
| `成交时间` | `sold_date`        | `datetime\|null` | —    | **成交** 时必填 |

> 时间格式建议使用 ISO 8601：`"2026-01-15T10:00:00"` 或 `"2026-01-15"`。

#### 3.4.3 可选字段

| 字段名    | 中文别名                 | 类型                   | 约束              |
| ------ | -------------------- | -------------------- | --------------- |
| `厅`    | `halls`              | `int`                | `≥0`，默认 `0`     |
| `卫`    | `baths`              | `int`                | `≥0`，默认 `0`     |
| `套内面积` | `inner_area`         | `float\|null`        | `>0`            |
| `物业类型` | `property_type`      | `string\|null`       | —               |
| `建筑年代` | `build_year`         | `int\|null`          | `1900~2100`     |
| `建筑结构` | `building_structure` | `string\|null`       | —               |
| `装修情况` | `decoration`         | `string\|null`       | —               |
| `电梯`   | `elevator`           | `bool\|null`         | 支持中文"是"/"否"自动解析 |
| `产权性质` | `ownership_type`     | `string\|null`       | —               |
| `产权年限` | `ownership_years`    | `int\|null`          | `>0`            |
| `上次交易` | `last_transaction`   | `string\|null`       | —               |
| `供暖方式` | `heating_method`     | `string\|null`       | —               |
| `房源描述` | `listing_remarks`    | `string\|null`       | —               |
| `图片链接` | `image_urls`         | `list[string]\|null` | 支持逗号分隔字符串或列表    |
| `城市ID` | `city_id`            | `int\|null`          | —               |
| `行政区`  | `district`           | `string\|null`       | —               |
| `商圈`   | `business_circle`    | `string\|null`       | —               |

#### 3.4.4 特殊字段处理

| 字段        | 处理逻辑                                                                                          |
| --------- | --------------------------------------------------------------------------------------------- |
| **楼层**    | `FloorParser` 自动从原始字符串解析出 `楼层数`、`总楼层`、`楼层等级`（低/中/高）。无法解析时不影响导入，仅不填充结构化楼层数据。                   |
| **电梯**    | 自动解析中文（是/否/有/无）和英文（yes/no/true/false/1/0）。非标准值→`None`。                                        |
| **图片链接**  | 字符串按逗号分割 → 转为列表 → 去重 → 写入 `property_media` 表。图片保存失败不影响主数据导入。                                  |
| **字符串字段** | 自动去除首尾空白（`data_source`、`source_property_id`、`community_name`、`orientation`、`floor_original`）。 |

***

## 4. 响应详解

### 4.1 成功响应

**HTTP Status Code**: `200 OK`

**Content-Type**: `application/json`

**响应格式**（与项目统一格式 `{"code": 0, "message": "success", "data": {...}}` 略有不同，直接返回结果对象）：

```json
{
  "total": 2,
  "success": 1,
  "failed": 1,
  "errors": [
    {
      "index": 1,
      "source_property_id": "SH20240005",
      "reason": "在售房源必须提供有效的挂牌价(万)"
    }
  ]
}
```

#### 4.1.1 返回字段说明

| 字段                            | 类型           | 说明                                        |
| ----------------------------- | ------------ | ----------------------------------------- |
| `total`                       | `int`        | 本次推送的总记录数                                 |
| `success`                     | `int`        | 成功导入/更新的记录数（含新建和覆盖更新）                     |
| `failed`                      | `int`        | 失败记录数                                     |
| `errors`                      | `List[dict]` | 失败详情数组，每项包含：                              |
| `errors[].index`              | `int`        | 失败记录在原数组中的索引（从 0 开始）                      |
| `errors[].source_property_id` | `string`     | 来源平台的房源 ID（`房源ID` 字段值；读取失败则为 `"unknown"`） |
| `errors[].reason`             | `string`     | 失败原因描述                                    |

### 4.2 错误状态码

| HTTP 状态码 | 错误类型                     | `detail` 示例            | 场景                              |
| -------- | ------------------------ | ---------------------- | ------------------------------- |
| `400`    | `ValidationError`        | `"请求体不能为空"`            | 请求体为空数组 `[]`                    |
| `400`    | `ValidationError`        | `"单次推送最多支持 10000 条记录"` | 超过 10,000 条上限                   |
| `400`    | `ServiceException`       | —                      | 服务层抛出的其他验证异常                    |
| `401`    | `HTTPException`          | `"需要提供有效的 API Key"`    | 未传 `X-API-Key` 或 Key 无效/过期/用户禁用 |
| `422`    | `BusinessLogicError`     | `"推送处理失败: <原因>"`       | 业务逻辑处理异常                        |
| `422`    | `RequestValidationError` | `"请求参数验证失败: <详情>"`     | 请求体格式错误（如直接传对象而非数组）             |
| `429`    | `RateLimitExceeded`      | `"请求过于频繁，请稍后重试"`       | 触发速率限制                          |
| `500`    | `Exception`              | `"服务器内部错误，请稍后重试"`      | 未预期的服务器内部错误                     |

> **注意**: 项目统一错误格式为 `{"detail": "..."}`（映射自 FastAPI HTTPException），符合 AGENTS.md 规范。

### 4.3 事务保证机制

本接口采用 **批次级原子提交**：

```
正常流程：逐条处理 → 统一 db.commit()
异常流程：逐条处理过程中任意异常 → 统一 db.rollback()
```

**含义**: 整个批次的提交是原子的。若批次中某条记录的处理导致**不可恢复的数据库异常**（如数据库文件损坏），整个批次回滚。但**逐条验证失败（Pydantic ValidationError）不会导致回滚**——仅单独记录该条为失败，继续处理下一条。

***

## 5. 完整请求/响应示例

### 5.1 在售房源批量推送

**请求**:

```http
POST /api/v1/push HTTP/1.1
Host: localhost:8000
X-API-Key: profo_xxxxxxxxxxxxx
Content-Type: application/json

[
  {
    "数据源": "贝壳找房",
    "房源ID": "BJ20240001",
    "状态": "在售",
    "小区名": "朝阳花园",
    "室": 3, "厅": 2, "卫": 1,
    "朝向": "南北",
    "楼层": "中楼层/共18层",
    "面积": 120.5,
    "挂牌价": 850,
    "上架时间": "2026-01-15T10:00:00",
    "物业类型": "住宅",
    "建筑年代": 2015,
    "装修情况": "精装",
    "电梯": "有",
    "行政区": "朝阳区",
    "商圈": "CBD"
  },
  {
    "数据源": "贝壳找房",
    "房源ID": "BJ20240002",
    "状态": "在售",
    "小区名": "海淀新村",
    "室": 2, "厅": 1, "卫": 1,
    "朝向": "南北",
    "楼层": "高楼层/共10层",
    "面积": 87.3,
    "挂牌价": 520,
    "上架时间": "2026-02-01T14:00:00",
    "物业类型": "住宅",
    "建筑年代": 2010,
    "装修情况": "简装"
  }
]
```

**响应**:

```json
{
  "total": 2,
  "success": 2,
  "failed": 0,
  "errors": []
}
```

### 5.2 混合状态 + 部分失败

**请求**:

```http
POST /api/v1/push HTTP/1.1
Host: localhost:8000
X-API-Key: profo_xxxxxxxxxxxxx
Content-Type: application/json

[
  {
    "数据源": "贝壳找房",
    "房源ID": "BJ20240003",
    "状态": "在售",
    "小区名": "朝阳花园",
    "室": 3, "厅": 2, "卫": 1,
    "朝向": "南北",
    "楼层": "低楼层/共18层",
    "面积": 140.0,
    "挂牌价": 920,
    "上架时间": "2026-03-01",
    "物业类型": "住宅",
    "图片链接": [
      "https://cdn.example.com/props/BJ20240003/1.jpg",
      "https://cdn.example.com/props/BJ20240003/2.jpg",
      "https://cdn.example.com/props/BJ20240003/3.jpg"
    ]
  },
  {
    "数据源": "贝壳找房",
    "房源ID": "BJ20240004",
    "状态": "在售",
    "小区名": "西城名苑",
    "室": 2, "厅": 1, "卫": 1,
    "朝向": "东",
    "楼层": "高楼层/共25层",
    "面积": 75.0
  },
  {
    "数据源": "贝壳找房",
    "房源ID": "BJ20240005",
    "状态": "成交",
    "小区名": "海淀新村",
    "室": 2, "厅": 1, "卫": 1,
    "朝向": "南北",
    "楼层": "中楼层/共10层",
    "面积": 87.3,
    "成交价": 480,
    "成交时间": "2026-02-15T16:00:00",
    "物业类型": "住宅"
  }
]
```

**响应**:

```json
{
  "total": 3,
  "success": 2,
  "failed": 1,
  "errors": [
    {
      "index": 1,
      "source_property_id": "BJ20240004",
      "reason": "在售房源必须提供有效的挂牌价(万)"
    }
  ]
}
```

### 5.3 全量失败

**请求** (JSON数组但格式无法解析):

```json
{
  "数据源": "贝壳找房"
}
```

**响应**:

```http
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/json

{
  "detail": "请求参数验证失败: Body must be a JSON array, got object"
}
```

***

## 6. 字段定义参考

### 6.1 自动处理和转换

| 字段 (JSON Key)    | 处理行为                                                   |
| ---------------- | ------------------------------------------------------ |
| 所有 `string` 核心字段 | 自动去除首尾空格（`strip()`）                                    |
| `电梯`             | `"是"/"有"/"true"→True`；`"否"/"无"/"false"→False`；空→`None` |
| `图片链接`           | 逗号分隔字符串 → 列表；URL 去重                                    |
| `楼层`             | 自动解析结构化楼层信息（解析失败不阻塞）                                   |

### 6.2 完整字段映射表

| JSON Key（外部） | 内部字段名                | 类型                | 必填   | 来源描述       |
| ------------ | -------------------- | ----------------- | ---- | ---------- |
| `数据源`        | `data_source`        | `str`             | ✅    | 数据来源平台     |
| `房源ID`       | `source_property_id` | `str`             | ✅    | 来源平台唯一ID   |
| `状态`         | `status`             | `"在售"\|"成交"`      | ✅    | 房源状态       |
| `小区名`        | `community_name`     | `str`             | ✅    | 小区名称       |
| `室`          | `rooms`              | `int`             | ✅    | 室数量        |
| `朝向`         | `orientation`        | `str`             | ✅    | 朝向         |
| `楼层`         | `floor_original`     | `str`             | ✅    | 原始楼层       |
| `面积`         | `build_area`         | `float`           | ✅    | 建筑面积       |
| `挂牌价`        | `listed_price_wan`   | `float\|null`     | 在售必填 | 挂牌价（万）     |
| `上架时间`       | `listed_date`        | `datetime\|null`  | 在售必填 | 上架时间       |
| `成交价`        | `sold_price_wan`     | `float\|null`     | 成交必填 | 成交价（万）     |
| `成交时间`       | `sold_date`          | `datetime\|null`  | 成交必填 | 成交时间       |
| `厅`          | `halls`              | `int`             | 否    | 默认 0       |
| `卫`          | `baths`              | `int`             | 否    | 默认 0       |
| `套内面积`       | `inner_area`         | `float\|null`     | 否    | 套内面积       |
| `物业类型`       | `property_type`      | `str\|null`       | 否    | 物业类型       |
| `建筑年代`       | `build_year`         | `int\|null`       | 否    | 1900\~2100 |
| `建筑结构`       | `building_structure` | `str\|null`       | 否    | —          |
| `装修情况`       | `decoration`         | `str\|null`       | 否    | —          |
| `电梯`         | `elevator`           | `bool\|null`      | 否    | 自动解析       |
| `产权性质`       | `ownership_type`     | `str\|null`       | 否    | —          |
| `产权年限`       | `ownership_years`    | `int\|null`       | 否    | —          |
| `上次交易`       | `last_transaction`   | `str\|null`       | 否    | —          |
| `供暖方式`       | `heating_method`     | `str\|null`       | 否    | —          |
| `房源描述`       | `listing_remarks`    | `str\|null`       | 否    | —          |
| `图片链接`       | `image_urls`         | `list[str]\|null` | 否    | 逗号分隔或数组    |
| `城市ID`       | `city_id`            | `int\|null`       | 否    | —          |
| `行政区`        | `district`           | `str\|null`       | 否    | —          |
| `商圈`         | `business_circle`    | `str\|null`       | 否    | —          |

***

## 7. 错误处理指南

### 7.1 错误分类和处理策略

#### 认证错误 (401)

```
症状: {"detail": "需要提供有效的 API Key"}
原因: X-API-Key 缺失/无效/过期/用户被禁用
处理: 检查 API Key 有效性和用户状态
```

#### 请求格式错误 (422)

```
症状: {"detail": "请求参数验证失败: ..."}
原因: 请求体不是合法 JSON 数组
处理: 确保请求体是 JSON 数组格式，每个元素是房源对象
```

#### 请求约束违规 (400)

```
症状1: {"detail": "请求体不能为空"}
处理: 确保 JSON 数组至少包含 1 条记录

症状2: {"detail": "单次推送最多支持 10000 条记录"}
处理: 拆分批次，每批 ≤ 10000 条
```

#### 部分记录失败 (200)

即使 HTTP 状态码为 `200`，响应中的 `failed > 0` 也需关注。检查 `errors` 数组定位失败原因：

常见原因：

- Pydantic 验证失败（必填字段缺失、类型错误、约束违反）
- 业务逻辑处理异常（`ImportResult.success = False`）
- 逐条处理时未预期的 Python 异常

#### 批次回滚 (200 with failed=total)

当逐条处理过程中触发不可恢复的数据库异常时，批次整体回滚，所有记录标记为失败。errors 中包含统一的批次失败原因。

### 7.2 重试策略

| 状态码                | 建议策略                             |
| ------------------ | -------------------------------- |
| `200` + `failed>0` | 提取 `errors`，修正后重新提交失败记录          |
| `400`              | 修正请求参数再提交，**不重试原请求**             |
| `401`              | 确认认证配置，更换有效 API Key              |
| `429`              | 读取 `Retry-After` 头，等待后重试         |
| `500`              | 退避重试（exponential backoff），最多 3 次 |

***

## 8. 性能限制与最佳实践

### 8.1 已知限制

| 限制项       | 数值         | 说明               |
| --------- | ---------- | ---------------- |
| 单次最大记录数   | **10,000** | 接口层硬限制           |
| 处理模型      | 逐条同步处理     | 在线程池中执行          |
| 事务范围      | 整批         | 单次推送=单次事务        |
| SQLite 并发 | 单写者        | 写操作串行，高并发推送可能触发锁 |

### 8.2 推荐使用模式

#### 大批量数据 (>10,000 条)

将数据拆分为多个 ≤10,000 条的批次，顺序提交：

```python
def push_in_batches(records: list[dict], batch_size: int = 5_000) -> list[dict]:
    results = []
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        result = push_properties(batch)
        results.append(result)
        print(f"批次 {i // batch_size + 1}: 成功 {result['success']}, 失败 {result['failed']}")
    return results
```

#### 失败重试

仅提取失败记录重试，避免重复处理已成功的数据：

```python
def push_with_retry(records: list[dict], max_retries: int = 3) -> dict:
    retries = max_retries
    pending = records[:]
    final_result = {"total": len(records), "success": 0, "failed": 0, "errors": []}

    while pending and retries > 0:
        result = push_properties(pending)
        final_result["success"] += result["success"]
        final_result["failed"] += result["failed"]
        final_result["errors"].extend(result["errors"])

        # 仅保留失败的原因（用于日志），下次仅提交可修正的记录
        if result["failed"] == len(pending):
            break  # 全部失败，不再重试

        pending = []  # 简化：不再自动重试，由调用方根据 errors 修正后重新提交
        retries -= 1

    return final_result
```

### 8.3 数据去重

本接口基于 `(data_source, source_property_id)` 唯一性判别：

- **存在** → **更新**（自动创建历史快照记录变更；价格变化→`PRICE_CHANGE`，状态变化→`STATUS_CHANGE`，其他→`INFO_CHANGE`）
- **不存在** → **创建**（新建 `PropertyCurrent` 记录，`owner_id` 设为推送用户 ID）

> 这意味着同一房源多次推送不会产生重复记录，而是更新现有记录。

### 8.4 建议

1. **批量发送**: 攒够一批后集中推送，减少 HTTP 请求数
2. **幂等性**: 重复推送同一房源自动去重，天然支持幂等
3. **错误日志**: `errors` 数组提供完整的逐条失败信息，保存到日志系统便于排查
4. **超时设置**: 大批量推送时客户端超时建议设为 `120s+`
5. **速率限制**: 避免短时间内大量并发请求触发 `429`

***

## 9. 安全要求

### 9.1 认证

- **必须** 在请求头携带 `X-API-Key`
- API Key 在数据库中存储为哈希（bcrypt），不可逆
- 格式校验：Key 必须以 `profo_` 开头
- 过期检查：服务端验证 Key 是否在有效期内
- 用户状态检查：关联用户必须状态为 `active`

### 9.2 API Key 获取

联系系统管理员（`admin` 角色）在后台为用户生成 API Key。每个用户可拥有多个 API Key，支持轮换和撤销。

### 9.3 最佳安全实践

- ✅ API Key 存储在服务端环境变量或密钥管理服务中
- ✅ 使用 HTTPS 生产环境（当前默认 HTTP，仅内网）
- ✅ 定期轮换 API Key
- ❌ **禁止**将 API Key 硬编码在客户端代码仓库中
- ❌ **禁止**将 API Key 通过 URL 参数传递
- ❌ **禁止**在日志中输出完整 API Key

### 9.4 敏感数据保护

服务端日志记录已实施安全脱敏：

- `safe_log_request_body()` — 请求体脱敏后入库
- `safe_log_dict()` — 字典数据脱敏

***

## 10. 附录：内部处理流程

```
客户端 POST /api/v1/push
                    │
                    ▼
        ┌─────────────────────┐
        │  push_properties()  │  ← routers/common/push.py
        │  • 空数组检查       │
        │  • 10000条上限检查  │
        └─────────┬───────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │ require_api_key()   │  ← dependencies/auth.py
        │  • X-API-Key提取    │
        │  • ApiKeyService     │
        │  • 返回User对象     │
        └─────────┬───────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │ JSONBatchImporter   │  ← services/market/json_batch_importer.py
        │ batch_import_json() │
        │  逐条:              │
        │  ① Pydantic验证    │
        │  ② PropertyImporter │
        │  ③ 收集错误详情     │
        │  ↓ 成功→commit      │
        │  ↓ 失败→rollback    │
        └─────────┬───────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │  PushResult 返回    │
        │  { total, success,  │
        │    failed, errors } │
        └─────────────────────┘
```

### 10.1 PropertyImporter 逐条处理逻辑

1. **查找/创建小区** (`find_or_create_community`): 名称精确匹配 → 别名匹配 → 创建新记录
2. **判断创建/更新**: `(data_source, source_property_id)` 查 `PropertyCurrent`
   - 不存在 → `_handle_creation`: 新建 + 图片保存
   - 已存在 → `_handle_update`: 历史快照 + 更新 + 图片替换
3. **图片处理** (`_save_property_media`): 先删旧图片记录，URL 去重后批量插入
4. **失败记录保存** (`save_failed_record`): 所有失败记录保存到 `failed_records` 表

### 10.2 异常处理链路

```
Pydantic ValidationError (逐条) → 记录失败 + 继续下一条
Service ValidationError (接口层) → HTTP 400
Service BusinessLogicError (接口层) → HTTP 422
SQLAlchemyError → 全局 handler → HTTP 409/400/500
未预期 Exception (逐条) → 记录失败 + 继续下一条
未预期 Exception (批次) → 全部标记失败 + rollback
```

***

> **文档维护**：本文档基于 `routers/common/push.py`、`services/market/json_batch_importer.py`、`services/market/importer.py`、`schemas/property/core.py`、`dependencies/auth.py`、`services/system/exceptions.py`、`error_handlers.py` 源码分析生成。如接口实现变更，请同步更新本文档。

