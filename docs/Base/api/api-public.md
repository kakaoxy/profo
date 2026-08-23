# ProFo C端公开接口（Public）接口文档

> 模块层级：C端 - 公开接口
> API 基础路径：`/api/v1`
> 认证方式：Bearer Token（C端用户 CurrentCustomerUserDep），部分接口无需登录

---

## 目录

- [1. 概述](#1-概述)
- [2. 枚举定义](#2-枚举定义)
- [3. C端认证接口](#3-c端认证接口)
  - [3.1 用户注册](#31-用户注册)
  - [3.2 退出登录](#32-退出登录)
- [4. C端小区搜索接口](#4-c端小区搜索接口)
  - [4.1 搜索小区](#41-搜索小区)
- [5. C端线索/卖房估价接口](#5-c端线索卖房估价接口)
  - [5.1 提交卖房估价](#51-提交卖房估价)
  - [5.2 获取我的估价列表](#52-获取我的估价列表)
  - [5.3 获取估价详情](#53-获取估价详情)
- [6. C端房源展示接口](#6-c端房源展示接口)
  - [6.1 获取房源列表](#61-获取房源列表)
  - [6.2 获取成交案例列表](#62-获取成交案例列表)
  - [6.3 获取房源详情](#63-获取房源详情)
  - [6.4 获取顾问联系方式](#64-获取顾问联系方式)
  - [6.5 获取平台统计数据](#65-获取平台统计数据)
  - [6.6 上报房源访问埋点](#66-上报房源访问埋点)
  - [6.7 上报房源分享事件](#67-上报房源分享事件)
  - [6.8 获取我的房源分享统计](#68-获取我的房源分享统计)
  - [6.9 获取归属我的预约客户列表](#69-获取归属我的预约客户列表)
- [7. C端房源预约接口](#7-c端房源预约接口)
  - [7.1 预约看房](#71-预约看房)
  - [7.2 获取我的预约列表](#72-获取我的预约列表)
- [8. C端估价页分享埋点接口](#8-c端估价页分享埋点接口)
  - [8.1 上报估价页访问埋点](#81-上报估价页访问埋点)
  - [8.2 上报估价页分享事件](#82-上报估价页分享事件)
  - [8.3 获取我的估价分享统计](#83-获取我的估价分享统计)
- [9. C端用户接口](#9-c端用户接口)
  - [9.1 修改用户资料](#91-修改用户资料)
  - [9.2 修改手机号](#92-修改手机号)
- [10. Schema定义](#10-schema定义)
- [11. 错误码表](#11-错误码表)

---

## 1. 概述

Public 模块是 ProFo 系统面向 C端用户的公开接口模块，提供用户注册、房源浏览、卖房估价提交等功能。模块分为五个子模块：

| 子模块 | 路由文件 | 前缀 | 需要认证 | 功能 |
|--------|----------|------|----------|------|
| C端认证 | `auth.py` | `/public/auth` | 部分需要 | 注册、退出登录 |
| C端小区搜索 | `communities.py` | `/public/communities` | 否 | 小区关键词搜索 |
| C端线索/卖房估价 | `leads.py` | `/public/leads` | 是 | 提交估价、估价列表、估价详情 |
| C端房源展示 | `projects.py` | `/public` | 部分 | 房源列表、详情、成交案例、顾问联系、平台统计；访问埋点免登录，分享埋点与员工侧查询需登录 |
| C端房源预约 | `bookings.py` | `/public/bookings` | 是 | 预约看房（幂等）、我的预约列表 |
| C端估价页分享埋点 | `valuations.py` | `/public/valuations` | 部分 | 访问埋点免登录，分享埋点与我的分享统计需登录 |
| C端用户 | `users.py` | `/public/users` | 是 | 修改资料、修改手机号 |

**认证说明：**

- 需要认证的接口使用 `CurrentCustomerUserDep`，即 C端用户（customer 角色）的 Bearer Token
- 无需登录的接口在描述中标注「无需登录」

**通用请求头（需要认证的接口）：**

| Header | 值 | 说明 |
|--------|-----|------|
| `Authorization` | `Bearer <token>` | 必填，C端用户认证令牌 |
| `Content-Type` | `application/json` | 请求体为 JSON 时必填 |

---

## 2. 枚举定义

### LeadStatusType - 线索状态

| 值 | 显示名称 | 颜色 | 说明 |
|----|----------|------|------|
| `pending_assessment` | 待评估 | `#FFA500` | 已提交，等待评估 |
| `pending_visit` | 待看房 | `#2196F3` | 评估完成，等待看房 |
| `rejected` | 已驳回 | `#F44336` | 线索被驳回 |
| `visited` | 已看房 | `#4CAF50` | 已完成看房 |
| `signed` | 已签约 | `#9C27B0` | 已签约成交 |

---

## 3. C端认证接口

路由前缀：`/api/v1/public/auth`

### 3.1 用户注册

注册C端用户账号，自动分配 customer 角色。

```
POST /api/v1/public/auth/register
```

**无需登录**

**速率限制：** 10次/小时

**请求体（PublicRegisterRequest）：**

```json
{
  "username": "zhangsan_01",
  "password": "Abc12345",
  "nickname": "张三",
  "phone": "13800138000"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `username` | string | **是** | 用户名，4-30位，仅允许字母、数字、下划线（`^[a-zA-Z0-9_]+$`） |
| `password` | string | **是** | 密码，≥8位，需包含大写字母、小写字母和数字 |
| `nickname` | string \| null | 否 | 昵称，最多100字符；不填则默认使用 username |
| `phone` | string \| null | 否 | 手机号，格式 `^1[3-9]\d{9}$`；填写时不可与已有账号重复 |

**响应（201 Created，PublicRegisterResponse）：**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 1800,
  "user": {
    "id": "user-uuid-001",
    "username": "zhangsan_01",
    "nickname": "张三",
    "phone": "138****8000",
    "avatar": null,
    "status": "active",
    "created_at": "2026-05-25T10:30:00Z"
  }
}
```

> `phone` 字段脱敏显示，中间4位用 `****` 替代。

---

### 3.2 退出登录

C端用户退出登录。当前JWT为无状态机制，服务端不撤销token，客户端应删除本地存储的token。

```
POST /api/v1/public/auth/logout
```

**需要认证：** CurrentCustomerUserDep

**速率限制：** 60次/分钟

**请求体：** 无

**响应（PublicLogoutResponse）：**

```json
{
  "message": "退出登录成功"
}
```

---

## 4. C端小区搜索接口

路由前缀：`/api/v1/public/communities`

### 4.1 搜索小区

根据关键词搜索小区，无需登录。

```
GET /api/v1/public/communities/search
```

**无需登录**

**速率限制：** 60次/分钟

**查询参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `q` | string | **是** | - | 搜索关键词，最少1个字符 |
| `limit` | integer | 否 | 20 | 返回条数限制，1-100 |

**请求示例：**

```
GET /api/v1/public/communities/search?q=阳光&limit=10
```

**响应（list[PublicCommunitySearchItem]）：**

```json
[
  {
    "id": "community-uuid-001",
    "name": "阳光花园",
    "district": "浦东新区",
    "business_circle": "张江"
  },
  {
    "id": "community-uuid-002",
    "name": "阳光城",
    "district": "徐汇区",
    "business_circle": "徐家汇"
  }
]
```

---

## 5. C端线索/卖房估价接口

路由前缀：`/api/v1/public/leads`

> 本模块所有接口需要认证：CurrentCustomerUserDep

### 5.1 提交卖房估价

C端用户提交卖房估价线索。

```
POST /api/v1/public/leads
```

**需要认证：** CurrentCustomerUserDep

**速率限制：** 10次/小时

**请求体（PublicLeadCreate）：**

```json
{
  "community_name": "阳光花园",
  "layout": "2室1厅",
  "area": 89.5,
  "floor_info": "中楼层/共18层",
  "orientation": "南",
  "remarks": "精装修，南北通透"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `community_name` | string | **是** | 小区名称，1-200字符 |
| `layout` | string \| null | 否 | 户型 |
| `area` | float \| null | 否 | 面积(m²) |
| `floor_info` | string \| null | 否 | 楼层信息 |
| `orientation` | string \| null | 否 | 朝向 |
| `remarks` | string \| null | 否 | 备注 |

**响应（201 Created，PublicLeadResponse）：**

```json
{
  "id": "lead-uuid-001",
  "community_name": "阳光花园",
  "layout": "2室1厅",
  "area": 89.5,
  "floor_info": "中楼层/共18层",
  "orientation": "南",
  "total_price": null,
  "unit_price": null,
  "eval_price": null,
  "status": "pending_assessment",
  "remarks": "精装修，南北通透",
  "created_at": "2026-05-25T10:30:00Z",
  "updated_at": "2026-05-25T10:30:00Z"
}
```

> 新创建的线索 `total_price`、`unit_price`、`eval_price` 均为 `null`，待后台评估后回填。

---

### 5.2 获取我的估价列表

获取当前用户创建的线索列表。

```
GET /api/v1/public/leads/mine
```

**需要认证：** CurrentCustomerUserDep

**速率限制：** 60次/分钟

**查询参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `page` | integer | 否 | 1 | 页码，≥1 |
| `page_size` | integer | 否 | 20 | 每页数量，1-100 |

**请求示例：**

```
GET /api/v1/public/leads/mine?page=1&page_size=10
```

**响应（PublicLeadListResponse）：**

```json
{
  "items": [
    {
      "id": "lead-uuid-001",
      "community_name": "阳光花园",
      "layout": "2室1厅",
      "area": 89.5,
      "total_price": 350.0,
      "status": "pending_visit",
      "status_display": "待看房",
      "status_color": "#2196F3",
      "created_at": "2026-05-25T10:30:00Z",
      "updated_at": "2026-05-26T14:00:00Z"
    },
    {
      "id": "lead-uuid-002",
      "community_name": "翠湖天地",
      "layout": "3室2厅",
      "area": 120.0,
      "total_price": null,
      "status": "pending_assessment",
      "status_display": "待评估",
      "status_color": "#FFA500",
      "created_at": "2026-05-24T09:00:00Z",
      "updated_at": "2026-05-24T09:00:00Z"
    }
  ],
  "total": 2,
  "page": 1,
  "page_size": 10
}
```

> 列表按 `created_at` 降序排列。`status_display` 和 `status_color` 为前端展示用的状态映射，见[枚举定义](#2-枚举定义)。

---

### 5.3 获取估价详情

获取指定线索的详细信息，仅能查看自己创建的线索。

```
GET /api/v1/public/leads/{lead_id}
```

**需要认证：** CurrentCustomerUserDep

**速率限制：** 60次/分钟

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `lead_id` | string | 线索ID |

**请求示例：**

```
GET /api/v1/public/leads/lead-uuid-001
```

**响应（PublicLeadDetail）：**

```json
{
  "id": "lead-uuid-001",
  "community_name": "阳光花园",
  "layout": "2室1厅",
  "area": 89.5,
  "floor_info": "中楼层/共18层",
  "orientation": "南",
  "total_price": 350.0,
  "unit_price": 3.91,
  "eval_price": 340.0,
  "status": "pending_visit",
  "status_display": "待看房",
  "status_color": "#2196F3",
  "remarks": "精装修，南北通透",
  "follow_ups": [
    {
      "id": "followup-uuid-001",
      "method": "phone",
      "content": "已与业主电话沟通，约定下周看房",
      "followed_at": "2026-05-26T14:00:00Z"
    },
    {
      "id": "followup-uuid-002",
      "method": "visit",
      "content": "上门实地勘察，房屋状况良好",
      "followed_at": "2026-05-27T10:00:00Z"
    }
  ],
  "created_at": "2026-05-25T10:30:00Z",
  "updated_at": "2026-05-27T10:00:00Z"
}
```

> `follow_ups` 按跟进时间降序排列。

**错误响应：**

- **404** 线索不存在

```json
{
  "detail": "线索不存在"
}
```

- **403** 无权查看该线索

```json
{
  "detail": "无权查看该线索"
}
```

---

## 6. C端房源展示接口

路由前缀：`/api/v1/public`

> 6.1~6.5 无需登录；6.6 访问埋点免登录；6.7 分享埋点与 6.8/6.9 员工侧查询需要认证：CurrentCustomerUserDep

### 6.1 获取房源列表

获取已发布的房源列表，无需登录。仅返回 `publish_status` 为已发布且未删除的房源。

```
GET /api/v1/public/projects
```

**无需登录**

**速率限制：** 60次/分钟

**查询参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `project_status` | string \| null | 否 | - | 项目状态筛选 |
| `community_name` | string \| null | 否 | - | 小区名称搜索（模糊匹配） |
| `layout` | string \| null | 否 | - | 户型筛选（精确匹配） |
| `min_price` | float \| null | 否 | - | 最低总价(万) |
| `max_price` | float \| null | 否 | - | 最高总价(万) |
| `min_area` | float \| null | 否 | - | 最小面积(m²) |
| `max_area` | float \| null | 否 | - | 最大面积(m²) |
| `sort_by` | string \| null | 否 | `created_at` | 排序字段，可选：`created_at`/`total_price`/`unit_price`/`area` |
| `sort_order` | string \| null | 否 | `desc` | 排序方向，`asc` 升序 / `desc` 降序 |
| `page` | integer | 否 | 1 | 页码，≥1 |
| `page_size` | integer | 否 | 20 | 每页数量，1-100 |

**请求示例：**

```
GET /api/v1/public/projects?community_name=阳光&min_price=200&max_price=400&sort_by=total_price&sort_order=asc&page=1&page_size=10
```

**响应（PublicProjectListResponse）：**

```json
{
  "items": [
    {
      "id": 1,
      "community_name": "阳光花园",
      "layout": "2室1厅",
      "orientation": "南",
      "floor_info": "中楼层/共18层",
      "area": 89.5,
      "total_price": 350.0,
      "unit_price": 3.91,
      "title": "阳光花园 精装两房 南北通透",
      "cover_image": "https://cdn.example.com/cover1.jpg",
      "tags": ["精装修", "南北通透", "近地铁"],
      "project_status": "for_sale",
      "decoration_style": "现代简约"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 10
}
```

> `cover_image` 取 `images` 列表的第一张图。`sort_by` 传入不支持的字段时默认按 `created_at` 排序。

---

### 6.2 获取成交案例列表

获取已成交的房源案例列表，无需登录。仅返回 `project_status` 为已售且已发布的房源。

```
GET /api/v1/public/projects/sold
```

**无需登录**

**速率限制：** 60次/分钟

**查询参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `community_name` | string \| null | 否 | - | 小区名称筛选（模糊匹配） |
| `page` | integer | 否 | 1 | 页码，≥1 |
| `page_size` | integer | 否 | 20 | 每页数量，1-100 |

**请求示例：**

```
GET /api/v1/public/projects/sold?community_name=阳光&page=1&page_size=10
```

**响应（PublicSoldProjectListResponse）：**

```json
{
  "items": [
    {
      "id": 5,
      "community_name": "阳光花园",
      "layout": "3室2厅",
      "area": 120.0,
      "total_price": 450.0,
      "unit_price": 3.75,
      "title": "阳光花园 豪装三房 采光充足",
      "cover_image": "https://cdn.example.com/sold1.jpg",
      "sold_days": 45,
      "decoration_style": "北欧风"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 10
}
```

> `sold_days` 为成交天数，计算方式为 `updated_at - created_at` 的天数差。列表按 `created_at` 降序排列。

---

### 6.3 获取房源详情

获取指定房源的详细信息，无需登录。

```
GET /api/v1/public/projects/{project_id}
```

**无需登录**

**速率限制：** 60次/分钟

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | integer | 项目ID |

**请求示例：**

```
GET /api/v1/public/projects/1
```

**响应（PublicProjectDetail）：**

```json
{
  "id": 1,
  "community_name": "阳光花园",
  "layout": "2室1厅",
  "orientation": "南",
  "floor_info": "中楼层/共18层",
  "area": 89.5,
  "total_price": 350.0,
  "unit_price": 3.91,
  "title": "阳光花园 精装两房 南北通透",
  "images": [
    "https://cdn.example.com/img1.jpg",
    "https://cdn.example.com/img2.jpg"
  ],
  "tags": ["精装修", "南北通透", "近地铁"],
  "project_status": "for_sale",
  "decoration_style": "现代简约",
  "description": null,
  "media": [
    {
      "id": 101,
      "file_url": "https://cdn.example.com/media1.jpg",
      "thumbnail_url": "https://cdn.example.com/media1_thumb.jpg",
      "media_type": "image",
      "photo_category": "renovation",
      "renovation_stage": "水电",
      "description": "水电验收照片",
      "sort_order": 1
    }
  ],
  "renovation_stages": [
    {
      "stage": "水电",
      "photo_count": 3
    },
    {
      "stage": "油漆",
      "photo_count": 2
    }
  ],
  "consultant": {
    "nickname": "李顾问",
    "phone": "139****9000"
  },
  "created_at": "2026-04-15T10:30:00Z",
  "updated_at": "2026-05-20T14:00:00Z"
}
```

> `renovation_stages` 根据 `photo_category` 为 `renovation` 且有 `renovation_stage` 的媒体自动聚合。`consultant` 为关联的顾问信息，无顾问时为 `null`。

**错误响应：**

- **404** 项目不存在

```json
{
  "detail": "项目不存在"
}
```

---

### 6.4 获取顾问联系方式

获取指定房源的顾问联系方式，无需登录。若房源未关联顾问，返回系统默认顾问信息。

```
GET /api/v1/public/projects/{project_id}/consultant
```

**无需登录**

**速率限制：** 60次/分钟

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | integer | 项目ID |

**请求示例：**

```
GET /api/v1/public/projects/1/consultant
```

**响应（PublicConsultantContact）：**

```json
{
  "phone": "139****9000",
  "wechat_number": "consultant_wechat",
  "nickname": "李顾问"
}
```

> `phone` 脱敏显示。无关联顾问时返回系统默认配置的顾问联系方式。

**错误响应：**

- **404** 项目不存在

```json
{
  "detail": "项目不存在"
}
```

---

### 6.5 获取平台统计数据

获取平台统计数据，无需登录。

```
GET /api/v1/public/stats/platform
```

**无需登录**

**速率限制：** 60次/分钟

**请求参数：** 无

**响应（PublicPlatformStats）：**

```json
{
  "total_owners": 156,
  "on_sale_count": 42,
  "current_month_sold": 8
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `total_owners` | integer | 业主总数（去重统计已发布房源的 `community_id` 数量） |
| `on_sale_count` | integer | 在售房源数（已发布且状态为 `for_sale` 的房源数量） |
| `current_month_sold` | integer | 本月成交数（本月内状态为 `sold` 的房源数量） |

---

### 6.6 上报房源访问埋点

上报房源详情页访问埋点，无需登录。PV +1，UV 按匿名 `visitor_id` 去重。仅已发布房源可上报。

```
POST /api/v1/public/projects/{project_id}/visit-events
```

**无需登录**

**速率限制：** 120次/分钟

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | integer | 项目ID |

**请求体（PublicVisitEventRequest）：**

```json
{
  "visitor_id": "550e8400-e29b-41d4-a716-446655440000",
  "referrer": "employee-uuid-001",
  "source": "share"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `visitor_id` | string | **是** | 匿名访客ID（UV 去重键），前端生成并本地缓存，1-64字符 |
| `referrer` | string \| null | 否 | 来源员工ID（分享参数透传），最多36字符 |
| `source` | string \| null | 否 | 进入渠道，最多20字符 |

**响应（200，PublicTrackingEventResponse）：**

```json
{
  "id": 1001
}
```

**错误响应：**

- **404** 房源不存在或未发布

---

### 6.7 上报房源分享事件

上报房源分享事件，需要登录。`employee_id` 由服务端取当前登录用户，禁止前端传入。仅已发布房源可上报。

```
POST /api/v1/public/projects/{project_id}/share-events
```

**需要认证：** CurrentCustomerUserDep

**速率限制：** 60次/分钟

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | integer | 项目ID |

**请求体（PublicShareEventRequest）：**

```json
{
  "share_type": "card"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `share_type` | string | **是** | 分享方式：`card`（转发好友）/ `timeline`（朋友圈） |

**响应（200，PublicTrackingEventResponse）：**

```json
{
  "id": 2001
}
```

**错误响应：**

- **404** 房源不存在或未发布

---

### 6.8 获取我的房源分享统计

获取当前员工的房源分享漏斗统计（昨日 + 累计）。

```
GET /api/v1/public/projects/my/share-stats
```

**需要认证：** CurrentCustomerUserDep

**速率限制：** 无（登录态读接口）

**响应（PublicShareStatsResponse）：**

```json
{
  "share_count": 12,
  "pv": 45,
  "uv": 38,
  "lead_count": 3,
  "yesterday_share_count": 2,
  "yesterday_pv": 5,
  "yesterday_uv": 4,
  "yesterday_lead_count": 1
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `share_count` | integer | 分享次数（累计） |
| `pv` | integer | 经我分享的打开次数 PV（累计） |
| `uv` | integer | 经我分享的打开人数 UV（`visitor_id` 去重，累计） |
| `lead_count` | integer | 留资数（累计；归属我的预约数） |
| `yesterday_share_count` | integer | 昨日分享次数（Asia/Shanghai 自然日） |
| `yesterday_pv` | integer | 昨日打开次数 PV |
| `yesterday_uv` | integer | 昨日打开人数 UV |
| `yesterday_lead_count` | integer | 昨日留资数 |

> 口径：分享按 `ProjectShareEvent.employee_id`、PV/UV 按 `ProjectVisit.referrer_employee_id`、留资按 `ProjectBooking.referrer_user_id`。

---

### 6.9 获取归属我的预约客户列表

获取当前员工房源分享归因的预约客户列表，含客户脱敏手机号与房源快照，按预约时间倒序。

```
GET /api/v1/public/projects/my/customers
```

**需要认证：** CurrentCustomerUserDep

**速率限制：** 无（登录态读接口）

**响应（list[PublicCustomerBookingItem]）：**

```json
[
  {
    "id": 101,
    "marketing_project_id": 1,
    "project_title": "阳光花园 精装两房 南北通透",
    "community_name": "阳光花园",
    "cover_image": "https://cdn.example.com/cover1.jpg",
    "layout": "2室1厅",
    "total_price": 350.0,
    "customer_phone_masked": "138****8000",
    "created_at": "2026-08-22T10:30:00Z"
  }
]
```

> 归因规则：预约时携带的匿名 `visitor_id` 命中该访客最近一次带 referrer 的访问埋点，则该预约归属对应员工（跨项目归因为有意设计）。`customer_phone_masked` 为脱敏手机号（前3后4），无手机号时空串。

---

## 7. C端房源预约接口

路由前缀：`/api/v1/public/bookings`

> 本模块所有接口需要认证：CurrentCustomerUserDep

### 7.1 预约看房

创建看房预约。同一用户对同一房源幂等：重复预约返回既有记录（`is_new=false`），新建与命中统一返回 200。

```
POST /api/v1/public/bookings
```

**需要认证：** CurrentCustomerUserDep

**速率限制：** 10次/小时

**请求体（PublicProjectBookingCreate）：**

```json
{
  "marketing_project_id": 1,
  "visitor_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `marketing_project_id` | integer | **是** | 房源ID |
| `visitor_id` | string \| null | 否 | 匿名访客ID（分享归因用），最多64字符 |

**响应（200，PublicProjectBookingResponse）：**

```json
{
  "booking": {
    "id": 101,
    "marketing_project_id": 1,
    "project_title": "阳光花园 精装两房 南北通透",
    "community_name": "阳光花园",
    "cover_image": "https://cdn.example.com/cover1.jpg",
    "layout": "2室1厅",
    "total_price": 350.0,
    "created_at": "2026-08-22T10:30:00Z"
  },
  "is_new": true
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `booking` | PublicProjectBookingItem | 预约记录（含房源快照字段） |
| `is_new` | boolean | 本次请求是否新建预约（幂等命中既有记录时为 `false`） |

> 手机号快照取自用户账号资料，服务端加密存储；仅已发布房源可预约。

**错误响应：**

- **404** 房源不存在或未发布

```json
{
  "detail": "房源不存在或未发布"
}
```

- **409** 用户未绑定手机号

```json
{
  "detail": "请先绑定手机号后再预约看房"
}
```

---

### 7.2 获取我的预约列表

获取当前用户的房源预约列表（含房源快照字段），按预约时间倒序，支持按房源过滤。

```
GET /api/v1/public/bookings/my
```

**需要认证：** CurrentCustomerUserDep

**速率限制：** 60次/分钟

**查询参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `marketing_project_id` | integer \| null | 否 | - | 按房源ID过滤 |

**响应（list[PublicProjectBookingItem]）：**

```json
[
  {
    "id": 101,
    "marketing_project_id": 1,
    "project_title": "阳光花园 精装两房 南北通透",
    "community_name": "阳光花园",
    "cover_image": "https://cdn.example.com/cover1.jpg",
    "layout": "2室1厅",
    "total_price": 350.0,
    "created_at": "2026-08-22T10:30:00Z"
  }
]
```

---

## 8. C端估价页分享埋点接口

路由前缀：`/api/v1/public/valuations`

> 访问埋点免登录；分享埋点与我的分享统计需要认证：CurrentCustomerUserDep

### 8.1 上报估价页访问埋点

上报估价页访问埋点，无需登录。PV +1，UV 按匿名 `visitor_id` 去重（页面级全局埋点，不关联具体线索）。

```
POST /api/v1/public/valuations/visit-events
```

**无需登录**

**速率限制：** 120次/分钟

**请求体（PublicVisitEventRequest）：** 同 [6.6](#66-上报房源访问埋点)。

**响应（200，PublicTrackingEventResponse）：**

```json
{
  "id": 3001
}
```

---

### 8.2 上报估价页分享事件

上报估价页分享事件，需要登录。`employee_id` 由服务端取当前登录用户。

```
POST /api/v1/public/valuations/share-events
```

**需要认证：** CurrentCustomerUserDep

**速率限制：** 60次/分钟

**请求体（PublicShareEventRequest）：** 同 [6.7](#67-上报房源分享事件)。

**响应（200，PublicTrackingEventResponse）：**

```json
{
  "id": 4001
}
```

---

### 8.3 获取我的估价分享统计

获取当前员工的估价页分享漏斗统计（昨日 + 累计）。口径与房源侧一致，留资为分享归因我的线索数。

```
GET /api/v1/public/valuations/my/share-stats
```

**需要认证：** CurrentCustomerUserDep

**速率限制：** 无（登录态读接口）

**响应（PublicShareStatsResponse）：** 同 [6.8](#68-获取我的房源分享统计)，其中 `lead_count` 为分享归因我的线索数（按 `Lead.referrer_id`）。

---

## 9. C端用户接口

路由前缀：`/api/v1/public/users`

> 本模块所有接口需要认证：CurrentCustomerUserDep

### 9.1 修改用户资料

C端用户修改自己的昵称。

```
PUT /api/v1/public/users/profile
```

**需要认证：** CurrentCustomerUserDep

**速率限制：** 20次/分钟

**请求体（PublicProfileUpdate）：**

```json
{
  "nickname": "新昵称"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `nickname` | string | **是** | 昵称，1-100字符 |

**响应（PublicUserProfileResponse）：**

```json
{
  "id": "user-uuid-001",
  "username": "zhangsan_01",
  "nickname": "新昵称",
  "phone": "138****8000",
  "avatar": null,
  "status": "active",
  "created_at": "2026-05-25T10:30:00Z",
  "updated_at": "2026-05-25T15:00:00Z"
}
```

---

### 9.2 修改手机号

C端用户修改手机号，需输入当前密码确认身份。

```
PUT /api/v1/public/users/phone
```

**需要认证：** CurrentCustomerUserDep

**速率限制：** 10次/小时

**请求体（PublicPhoneUpdate）：**

```json
{
  "phone": "13900139000",
  "password": "Abc12345"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `phone` | string | **是** | 新手机号，格式 `^1[3-9]\d{9}$` |
| `password` | string | **是** | 当前密码，用于确认身份 |

**响应（PublicPhoneResponse）：**

```json
{
  "phone": "139****9000"
}
```

**错误响应：**

- **401** 密码错误

```json
{
  "detail": "密码错误"
}
```

- **400** 手机号已被其他账号绑定

```json
{
  "detail": "手机号已被其他账号绑定"
}
```

---

## 10. Schema定义

### PublicRegisterRequest

```json
{
  "username": "zhangsan_01",
  "password": "Abc12345",
  "nickname": "张三",
  "phone": "13800138000"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `username` | string | **是** | 用户名，4-30位，仅字母/数字/下划线 |
| `password` | string | **是** | 密码，≥8位，需含大写字母、小写字母和数字 |
| `nickname` | string \| null | 否 | 昵称，最多100字符 |
| `phone` | string \| null | 否 | 手机号，格式 `^1[3-9]\d{9}$` |

### PublicUserInfo

```json
{
  "id": "user-uuid-001",
  "username": "zhangsan_01",
  "nickname": "张三",
  "phone": "138****8000",
  "avatar": null,
  "status": "active",
  "created_at": "2026-05-25T10:30:00Z"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 用户ID |
| `username` | string | 用户名 |
| `nickname` | string \| null | 昵称 |
| `phone` | string \| null | 手机号（脱敏） |
| `avatar` | string \| null | 头像URL |
| `status` | string | 用户状态 |
| `created_at` | datetime | 创建时间 |

### PublicRegisterResponse

```json
{
  "access_token": "eyJhbGci...",
  "refresh_token": "eyJhbGci...",
  "token_type": "bearer",
  "expires_in": 1800,
  "user": {}
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `access_token` | string | 访问令牌 |
| `refresh_token` | string | 刷新令牌 |
| `token_type` | string | 令牌类型，默认 `bearer` |
| `expires_in` | integer | 访问令牌过期时间（秒） |
| `user` | PublicUserInfo | 用户信息 |

### PublicLogoutResponse

| 字段 | 类型 | 说明 |
|------|------|------|
| `message` | string | 提示信息 |

### PublicCommunitySearchItem

```json
{
  "id": "community-uuid-001",
  "name": "阳光花园",
  "district": "浦东新区",
  "business_circle": "张江"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 小区ID |
| `name` | string | 小区名称 |
| `district` | string \| null | 行政区 |
| `business_circle` | string \| null | 商圈 |

### PublicLeadCreate

```json
{
  "community_name": "阳光花园",
  "layout": "2室1厅",
  "area": 89.5,
  "floor_info": "中楼层/共18层",
  "orientation": "南",
  "remarks": "精装修"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `community_name` | string | **是** | 小区名称，1-200字符 |
| `layout` | string \| null | 否 | 户型 |
| `area` | float \| null | 否 | 面积(m²) |
| `floor_info` | string \| null | 否 | 楼层信息 |
| `orientation` | string \| null | 否 | 朝向 |
| `remarks` | string \| null | 否 | 备注 |

### PublicLeadResponse

```json
{
  "id": "lead-uuid-001",
  "community_name": "阳光花园",
  "layout": "2室1厅",
  "area": 89.5,
  "floor_info": "中楼层/共18层",
  "orientation": "南",
  "total_price": 350.0,
  "unit_price": 3.91,
  "eval_price": 340.0,
  "status": "pending_visit",
  "remarks": "精装修",
  "created_at": "2026-05-25T10:30:00Z",
  "updated_at": "2026-05-26T14:00:00Z"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 线索ID |
| `community_name` | string | 小区名称 |
| `layout` | string \| null | 户型 |
| `area` | float \| null | 面积(m²) |
| `floor_info` | string \| null | 楼层信息 |
| `orientation` | string \| null | 朝向 |
| `total_price` | float \| null | 当前授权总价(万) |
| `unit_price` | float \| null | 单价(万/㎡) |
| `eval_price` | float \| null | 评估价格(万) |
| `status` | LeadStatusType | 状态代码 |
| `remarks` | string \| null | 备注 |
| `created_at` | datetime | 创建时间 |
| `updated_at` | datetime | 更新时间 |

### PublicLeadListItem

```json
{
  "id": "lead-uuid-001",
  "community_name": "阳光花园",
  "layout": "2室1厅",
  "area": 89.5,
  "total_price": 350.0,
  "status": "pending_visit",
  "status_display": "待看房",
  "status_color": "#2196F3",
  "created_at": "2026-05-25T10:30:00Z",
  "updated_at": "2026-05-26T14:00:00Z"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 线索ID |
| `community_name` | string | 小区名称 |
| `layout` | string \| null | 户型 |
| `area` | float \| null | 面积(m²) |
| `total_price` | float \| null | 当前授权总价(万) |
| `status` | LeadStatusType | 状态代码 |
| `status_display` | string | 状态显示名称 |
| `status_color` | string | 状态颜色（十六进制） |
| `created_at` | datetime | 创建时间 |
| `updated_at` | datetime | 更新时间 |

### PublicLeadListResponse

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "page_size": 20
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `items` | list[PublicLeadListItem] | 线索列表 |
| `total` | integer | 总记录数 |
| `page` | integer | 当前页码 |
| `page_size` | integer | 每页数量 |

### PublicFollowupItem

```json
{
  "id": "followup-uuid-001",
  "method": "phone",
  "content": "已与业主电话沟通",
  "followed_at": "2026-05-26T14:00:00Z"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 跟进记录ID |
| `method` | string | 跟进方式 |
| `content` | string | 跟进内容 |
| `followed_at` | datetime | 跟进时间 |

### PublicLeadDetail

继承 PublicLeadResponse 所有字段，额外包含：

```json
{
  "id": "lead-uuid-001",
  "community_name": "阳光花园",
  "layout": "2室1厅",
  "area": 89.5,
  "floor_info": "中楼层/共18层",
  "orientation": "南",
  "total_price": 350.0,
  "unit_price": 3.91,
  "eval_price": 340.0,
  "status": "pending_visit",
  "status_display": "待看房",
  "status_color": "#2196F3",
  "remarks": "精装修",
  "follow_ups": [],
  "created_at": "2026-05-25T10:30:00Z",
  "updated_at": "2026-05-26T14:00:00Z"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| ... | ... | 继承 PublicLeadResponse 所有字段 |
| `status_display` | string | 状态显示名称 |
| `status_color` | string | 状态颜色（十六进制） |
| `follow_ups` | list[PublicFollowupItem] | 跟进记录列表 |

### PublicProjectListItem

```json
{
  "id": 1,
  "community_name": "阳光花园",
  "layout": "2室1厅",
  "orientation": "南",
  "floor_info": "中楼层/共18层",
  "area": 89.5,
  "total_price": 350.0,
  "unit_price": 3.91,
  "title": "阳光花园 精装两房",
  "cover_image": "https://cdn.example.com/cover1.jpg",
  "tags": ["精装修"],
  "project_status": "for_sale",
  "decoration_style": "现代简约"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | integer | 项目ID |
| `community_name` | string \| null | 小区名称 |
| `layout` | string | 户型 |
| `orientation` | string | 朝向 |
| `floor_info` | string | 楼层信息 |
| `area` | float | 面积(m²) |
| `total_price` | float | 总价(万元) |
| `unit_price` | float | 单价(万元/m²) |
| `title` | string | 标题 |
| `cover_image` | string \| null | 封面图URL |
| `tags` | list[string] | 标签列表 |
| `project_status` | string | 项目状态 |
| `decoration_style` | string \| null | 装修风格 |

### PublicProjectListResponse

| 字段 | 类型 | 说明 |
|------|------|------|
| `items` | list[PublicProjectListItem] | 项目列表 |
| `total` | integer | 总记录数 |
| `page` | integer | 当前页码 |
| `page_size` | integer | 每页数量 |

### PublicMediaItem

```json
{
  "id": 101,
  "file_url": "https://cdn.example.com/media1.jpg",
  "thumbnail_url": "https://cdn.example.com/media1_thumb.jpg",
  "media_type": "image",
  "photo_category": "renovation",
  "renovation_stage": "水电",
  "description": "水电验收照片",
  "sort_order": 1
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | integer | 媒体ID |
| `file_url` | string | 文件URL |
| `thumbnail_url` | string \| null | 缩略图URL |
| `media_type` | string | 媒体类型 |
| `photo_category` | string | 照片分类 |
| `renovation_stage` | string \| null | 装修阶段 |
| `description` | string \| null | 描述 |
| `sort_order` | integer | 排序序号 |

### PublicRenovationStage

```json
{
  "stage": "水电",
  "photo_count": 3
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `stage` | string | 阶段名称 |
| `photo_count` | integer | 该阶段照片数量 |

### PublicConsultantInfo

```json
{
  "nickname": "李顾问",
  "phone": "139****9000"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `nickname` | string \| null | 顾问昵称 |
| `phone` | string \| null | 顾问手机号（脱敏） |

### PublicProjectDetail

```json
{
  "id": 1,
  "community_name": "阳光花园",
  "layout": "2室1厅",
  "orientation": "南",
  "floor_info": "中楼层/共18层",
  "area": 89.5,
  "total_price": 350.0,
  "unit_price": 3.91,
  "title": "阳光花园 精装两房",
  "images": ["https://cdn.example.com/img1.jpg"],
  "tags": ["精装修"],
  "project_status": "for_sale",
  "decoration_style": "现代简约",
  "description": null,
  "media": [],
  "renovation_stages": [],
  "consultant": null,
  "created_at": "2026-04-15T10:30:00Z",
  "updated_at": "2026-05-20T14:00:00Z"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | integer | 项目ID |
| `community_name` | string \| null | 小区名称 |
| `layout` | string | 户型 |
| `orientation` | string | 朝向 |
| `floor_info` | string | 楼层信息 |
| `area` | float | 面积(m²) |
| `total_price` | float | 总价(万元) |
| `unit_price` | float | 单价(万元/m²) |
| `title` | string | 标题 |
| `images` | list[string] | 图片URL列表 |
| `tags` | list[string] | 标签列表 |
| `project_status` | string | 项目状态 |
| `decoration_style` | string \| null | 装修风格 |
| `description` | string \| null | 描述 |
| `media` | list[PublicMediaItem] | 媒体列表 |
| `renovation_stages` | list[PublicRenovationStage] | 改造阶段列表 |
| `consultant` | PublicConsultantInfo \| null | 顾问信息 |
| `created_at` | datetime | 创建时间 |
| `updated_at` | datetime | 更新时间 |

### PublicConsultantContact

```json
{
  "phone": "139****9000",
  "wechat_number": "consultant_wechat",
  "nickname": "李顾问"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `phone` | string | 手机号（脱敏） |
| `wechat_number` | string | 微信号 |
| `nickname` | string | 昵称 |

### PublicSoldProjectItem

```json
{
  "id": 5,
  "community_name": "阳光花园",
  "layout": "3室2厅",
  "area": 120.0,
  "total_price": 450.0,
  "unit_price": 3.75,
  "title": "阳光花园 豪装三房",
  "cover_image": "https://cdn.example.com/sold1.jpg",
  "sold_days": 45,
  "decoration_style": "北欧风"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | integer | 项目ID |
| `community_name` | string \| null | 小区名称 |
| `layout` | string | 户型 |
| `area` | float | 面积(m²) |
| `total_price` | float | 总价(万元) |
| `unit_price` | float | 单价(万元/m²) |
| `title` | string | 标题 |
| `cover_image` | string \| null | 封面图URL |
| `sold_days` | integer \| null | 成交天数 |
| `decoration_style` | string \| null | 装修风格 |

### PublicSoldProjectListResponse

| 字段 | 类型 | 说明 |
|------|------|------|
| `items` | list[PublicSoldProjectItem] | 成交案例列表 |
| `total` | integer | 总记录数 |
| `page` | integer | 当前页码 |
| `page_size` | integer | 每页数量 |

### PublicPlatformStats

```json
{
  "total_owners": 156,
  "on_sale_count": 42,
  "current_month_sold": 8
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `total_owners` | integer | 业主总数 |
| `on_sale_count` | integer | 在售房源数 |
| `current_month_sold` | integer | 本月成交数 |

### PublicProfileUpdate

```json
{
  "nickname": "新昵称"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `nickname` | string | **是** | 昵称，1-100字符 |

### PublicUserProfileResponse

继承 PublicUserInfo 所有字段，额外包含：

```json
{
  "id": "user-uuid-001",
  "username": "zhangsan_01",
  "nickname": "新昵称",
  "phone": "138****8000",
  "avatar": null,
  "status": "active",
  "created_at": "2026-05-25T10:30:00Z",
  "updated_at": "2026-05-25T15:00:00Z"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| ... | ... | 继承 PublicUserInfo 所有字段 |
| `updated_at` | datetime | 更新时间 |

### PublicPhoneUpdate

```json
{
  "phone": "13900139000",
  "password": "Abc12345"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `phone` | string | **是** | 新手机号，格式 `^1[3-9]\d{9}$` |
| `password` | string | **是** | 当前密码确认身份 |

### PublicPhoneResponse

```json
{
  "phone": "139****9000"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `phone` | string | 手机号（脱敏） |

### PublicProjectBookingCreate

```json
{
  "marketing_project_id": 1,
  "visitor_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `marketing_project_id` | integer | **是** | 房源ID |
| `visitor_id` | string \| null | 否 | 匿名访客ID（分享归因用），最多64字符 |

### PublicProjectBookingItem

```json
{
  "id": 101,
  "marketing_project_id": 1,
  "project_title": "阳光花园 精装两房 南北通透",
  "community_name": "阳光花园",
  "cover_image": "https://cdn.example.com/cover1.jpg",
  "layout": "2室1厅",
  "total_price": 350.0,
  "created_at": "2026-08-22T10:30:00Z"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | integer | 预约ID |
| `marketing_project_id` | integer | 房源ID |
| `project_title` | string | 房源标题 |
| `community_name` | string \| null | 小区名称 |
| `cover_image` | string \| null | 封面图URL |
| `layout` | string | 户型 |
| `total_price` | float | 总价(万元) |
| `created_at` | datetime | 预约时间 |

### PublicProjectBookingResponse

组合式响应：`is_new` 是「本次请求是否新建」的操作元信息而非记录字段，嵌套 `booking` 保持 Item 可复用于列表。

```json
{
  "booking": {},
  "is_new": true
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `booking` | PublicProjectBookingItem | 预约记录(含房源快照) |
| `is_new` | boolean | 本次请求是否新建预约（幂等命中既有记录时为 false） |

### PublicCustomerBookingItem

```json
{
  "id": 101,
  "marketing_project_id": 1,
  "project_title": "阳光花园 精装两房 南北通透",
  "community_name": "阳光花园",
  "cover_image": "https://cdn.example.com/cover1.jpg",
  "layout": "2室1厅",
  "total_price": 350.0,
  "customer_phone_masked": "138****8000",
  "created_at": "2026-08-22T10:30:00Z"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | integer | 预约ID |
| `marketing_project_id` | integer | 房源ID |
| `project_title` | string | 房源标题 |
| `community_name` | string \| null | 小区名称 |
| `cover_image` | string \| null | 封面图URL |
| `layout` | string \| null | 户型 |
| `total_price` | float \| null | 总价(万元) |
| `customer_phone_masked` | string | 客户手机号(脱敏，前3后4，中间****；无手机号时空串) |
| `created_at` | datetime | 预约时间 |

### PublicVisitEventRequest

```json
{
  "visitor_id": "550e8400-e29b-41d4-a716-446655440000",
  "referrer": "employee-uuid-001",
  "source": "share"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `visitor_id` | string | **是** | 匿名访客ID(UV去重键，前端生成)，1-64字符 |
| `referrer` | string \| null | 否 | 来源员工ID(分享参数透传)，最多36字符 |
| `source` | string \| null | 否 | 进入渠道，最多20字符 |

### PublicShareEventRequest

```json
{
  "share_type": "card"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `share_type` | string | **是** | 分享方式：`card`(转发)/`timeline`(朋友圈) |

### PublicTrackingEventResponse

```json
{
  "id": 1001
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | integer | 事件记录ID |

### PublicShareStatsResponse

```json
{
  "share_count": 12,
  "pv": 45,
  "uv": 38,
  "lead_count": 3,
  "yesterday_share_count": 2,
  "yesterday_pv": 5,
  "yesterday_uv": 4,
  "yesterday_lead_count": 1
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `share_count` | integer | 分享次数(累计) |
| `pv` | integer | 经我分享的打开次数 PV(累计) |
| `uv` | integer | 经我分享的打开人数 UV(visitor_id 去重，累计) |
| `lead_count` | integer | 留资数(累计；房源=归属我的预约，评估=分享归因我的线索) |
| `yesterday_share_count` | integer | 昨日分享次数(Asia/Shanghai 自然日) |
| `yesterday_pv` | integer | 昨日打开次数 PV |
| `yesterday_uv` | integer | 昨日打开人数 UV |
| `yesterday_lead_count` | integer | 昨日留资数 |

---

## 11. 错误码表

### HTTP状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 201 | 创建成功 |
| 400 | 业务错误（用户名已占用、手机号已绑定、密码错误等） |
| 401 | 未认证（Token 缺失或无效） |
| 403 | 无权限（如查看他人线索） |
| 404 | 资源不存在（项目/线索未找到，或房源未发布） |
| 409 | 业务冲突（如未绑定手机号即预约看房） |
| 422 | 请求体验证失败（Pydantic 校验错误） |
| 429 | 请求频率超限（触发速率限制） |
| 500 | 服务器内部错误 |

### 业务错误示例

**400 用户名已被占用：**

```json
{
  "detail": "用户名已被占用"
}
```

**400 手机号已被绑定：**

```json
{
  "detail": "手机号已被绑定"
}
```

**400 手机号已被其他账号绑定：**

```json
{
  "detail": "手机号已被其他账号绑定"
}
```

**401 密码错误：**

```json
{
  "detail": "密码错误"
}
```

**403 无权查看该线索：**

```json
{
  "detail": "无权查看该线索"
}
```

**404 线索不存在：**

```json
{
  "detail": "线索不存在"
}
```

**404 项目不存在：**

```json
{
  "detail": "项目不存在"
}
```

**404 房源不存在或未发布：**

```json
{
  "detail": "房源不存在或未发布"
}
```

**409 请先绑定手机号后再预约看房：**

```json
{
  "detail": "请先绑定手机号后再预约看房"
}
```

**422 参数校验失败：**

```json
{
  "detail": [
    {
      "type": "value_error",
      "loc": ["body", "password"],
      "msg": "密码必须包含至少一个大写字母",
      "input": "abc12345"
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

| 接口 | 限制 | 说明 |
|------|------|------|
| POST /public/auth/register | 10次/小时 | 注册限流防刷 |
| POST /public/auth/logout | 60次/分钟 | 退出登录 |
| GET /public/communities/search | 60次/分钟 | 小区搜索 |
| POST /public/leads | 10次/小时 | 提交估价限流防刷 |
| GET /public/leads/mine | 60次/分钟 | 我的估价列表 |
| GET /public/leads/{lead_id} | 60次/分钟 | 估价详情 |
| GET /public/projects | 60次/分钟 | 房源列表 |
| GET /public/projects/sold | 60次/分钟 | 成交案例列表 |
| GET /public/projects/{project_id} | 60次/分钟 | 房源详情 |
| GET /public/projects/{project_id}/consultant | 60次/分钟 | 顾问联系方式 |
| POST /public/projects/{project_id}/visit-events | 120次/分钟 | 房源访问埋点限流防刷 |
| POST /public/projects/{project_id}/share-events | 60次/分钟 | 房源分享事件限流防刷 |
| GET /public/projects/my/share-stats | - | 我的房源分享统计（需登录，无限流） |
| GET /public/projects/my/customers | - | 归属我的预约客户（需登录，无限流） |
| POST /public/bookings | 10次/小时 | 预约看房限流防刷 |
| GET /public/bookings/my | 60次/分钟 | 我的预约列表 |
| POST /public/valuations/visit-events | 120次/分钟 | 估价页访问埋点限流防刷 |
| POST /public/valuations/share-events | 60次/分钟 | 估价页分享事件限流防刷 |
| GET /public/valuations/my/share-stats | - | 我的估价分享统计（需登录，无限流） |
| GET /public/stats/platform | 60次/分钟 | 平台统计 |
| PUT /public/users/profile | 20次/分钟 | 修改资料 |
| PUT /public/users/phone | 10次/小时 | 修改手机号限流防刷 |
