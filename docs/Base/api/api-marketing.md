# L4 市场营销模块接口文档

> **版本**: v1.0.0 | **更新日期**: 2026-05-25 | **模块**: L4-Marketing

***

## 目录

1. [接口概述](#1-接口概述)
2. [认证与权限](#2-认证与权限)
3. [枚举定义](#3-枚举定义)
4. [营销项目管理](#4-营销项目管理)
   - 4.1 [获取营销项目列表](#41-获取营销项目列表)
   - 4.2 [创建独立营销项目](#42-创建独立营销项目)
   - 4.3 [获取营销项目详情](#43-获取营销项目详情)
   - 4.4 [更新营销项目](#44-更新营销项目)
   - 4.5 [删除营销项目](#45-删除营销项目)
5. [媒体资源管理](#5-媒体资源管理)
   - 5.1 [获取媒体列表](#51-获取媒体列表)
   - 5.2 [添加媒体](#52-添加媒体)
   - 5.3 [更新媒体](#53-更新媒体)
   - 5.4 [删除媒体](#54-删除媒体)
   - 5.5 [批量更新媒体排序](#55-批量更新媒体排序)
6. [L3项目导入](#6-l3项目导入)
   - 6.1 [获取可关联的L3项目列表](#61-获取可关联的l3项目列表)
   - 6.2 [获取L3项目详情](#62-获取l3项目详情)
   - 6.3 [从L3项目导入数据](#63-从l3项目导入数据)
7. [Schema 定义](#7-schema-定义)
8. [错误码表](#8-错误码表)

***

## 1. 接口概述

L4 市场营销模块负责房源的营销展示与历史案例管理。提供营销项目的 CRUD 操作、媒体资源管理、以及从 L3 项目层导入数据的能力。

### 核心特性

| 特性 | 说明 |
| --- | --- |
| **API 基础路径** | `/api/v1` |
| **路由前缀** | `/api/v1/admin/l4-marketing` |
| **认证方式** | JWT Bearer Token（需 admin 或 operator 角色） |
| **数据模型** | 写时复制（CoW），L4 独立存储数据 |
| **删除策略** | 逻辑删除（`is_deleted` 标记） |
| **分页格式** | 统一 `items/total/page/page_size` 结构 |

***

## 2. 认证与权限

所有 L4 Marketing 接口均需认证，请求头须携带：

```
Authorization: Bearer <jwt_token>
```

**角色要求**：`admin` 或 `operator`

| 角色 | 读取 | 创建 | 更新 | 删除 | 导入 |
| --- | --- | --- | --- | --- | --- |
| `admin` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `operator` | ✅ | ✅ | ✅ | ✅ | ✅ |

未认证或角色不足时返回 `403 Forbidden`。

***

## 3. 枚举定义

### PublishStatus — 发布状态

| 枚举值 | 中文 | 说明 |
| --- | --- | --- |
| `DRAFT` | 草稿 | 默认状态，仅后台可见 |
| `PUBLISHED` | 发布 | 前台公开可见 |

### MarketingProjectStatus — 营销项目状态

| 枚举值 | 中文 | 说明 |
| --- | --- | --- |
| `IN_PROGRESS` | 在途 | 项目进行中，尚未挂牌 |
| `FOR_SALE` | 在售 | 已挂牌销售 |
| `SOLD` | 已售 | 已成交 |

### MediaType — 媒体类型

| 枚举值 | 说明 |
| --- | --- |
| `image` | 图片 |
| `video` | 视频 |

### PhotoCategory — 照片分类

| 枚举值 | 说明 |
| --- | --- |
| `marketing` | 营销照片 |
| `renovation` | 改造照片 |

***

## 4. 营销项目管理

### 4.1 获取营销项目列表

获取营销项目分页列表，包含摘要统计信息。

```
GET /api/v1/admin/l4-marketing/projects
```

**查询参数**

| 参数 | 类型 | 必填 | 约束 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `page` | int | 否 | ≥1 | 1 | 页码 |
| `page_size` | int | 否 | 1~200 | 20 | 每页大小 |
| `publish_status` | string | 否 | 草稿/发布 | — | 发布状态筛选 |
| `project_status` | string | 否 | 在途/在售/已售 | — | 项目状态筛选 |
| `consultant_id` | string | 否 | UUID | — | 顾问ID筛选 |
| `community_id` | string | 否 | UUID | — | 小区ID筛选 |

**请求示例**

```http
GET /api/v1/admin/l4-marketing/projects?page=1&page_size=20&project_status=在售
Authorization: Bearer <jwt_token>
```

**响应示例** — `200 OK`

```json
{
  "items": [
    {
      "id": 1,
      "community_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "community_name": "朝阳花园",
      "layout": "三室两厅",
      "orientation": "南北通透",
      "floor_info": "15/28层",
      "area": "120.50",
      "total_price": "850.00",
      "unit_price": "7.05",
      "title": "朝阳花园精装三居 南北通透",
      "images": [
        "https://cdn.example.com/marketing/1/01.jpg",
        "https://cdn.example.com/marketing/1/02.jpg"
      ],
      "sort_order": 0,
      "tags": ["精装", "南北通透", "地铁旁"],
      "decoration_style": "现代简约",
      "publish_status": "发布",
      "project_status": "在售",
      "project_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "consultant_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
      "is_deleted": false,
      "created_at": "2026-05-20T10:30:00",
      "updated_at": "2026-05-22T14:20:00",
      "media_files": [
        {
          "id": 1,
          "marketing_project_id": 1,
          "origin_media_id": null,
          "media_type": "image",
          "photo_category": "marketing",
          "renovation_stage": null,
          "description": "客厅实景",
          "sort_order": 0,
          "file_url": "https://cdn.example.com/marketing/1/01.jpg",
          "thumbnail_url": "https://cdn.example.com/marketing/1/01_thumb.jpg",
          "is_deleted": false,
          "created_at": "2026-05-20T10:30:00",
          "updated_at": "2026-05-20T10:30:00"
        }
      ]
    }
  ],
  "total": 56,
  "page": 1,
  "page_size": 20,
  "summary": {
    "total": 56,
    "published": 32,
    "draft": 24,
    "for_sale": 18,
    "sold": 8,
    "in_progress": 30
  }
}
```

> **说明**：`summary` 基于当前筛选条件的全量统计，不受分页影响。`area`、`total_price`、`unit_price` 为 `Decimal` 类型，以字符串形式传输。

---

### 4.2 创建独立营销项目

创建一个独立的营销项目，可同时上传媒体文件。

```
POST /api/v1/admin/l4-marketing/projects
```

**速率限制**：100次/小时

**请求体** — `L4MarketingProjectCreate`

| 字段 | 类型 | 必填 | 约束 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `community_id` | string | ✅ | 1~36字符 | — | 关联小区ID（UUID字符串） |
| `community_name` | string | 否 | ≤200字符 | null | 小区名称（冗余存储） |
| `layout` | string | ✅ | 1~100字符 | — | 户型，如：三室两厅 |
| `orientation` | string | ✅ | 1~50字符 | — | 朝向，如：南北通透 |
| `floor_info` | string | ✅ | 1~100字符 | — | 楼层信息，如：15/28层 |
| `area` | Decimal | ✅ | >0，2位小数 | — | 面积（m²） |
| `total_price` | Decimal | ✅ | >0，2位小数 | — | 总价（万元） |
| `title` | string | ✅ | 1~255字符 | — | 标题 |
| `images` | list[string] | 否 | — | [] | 图片URL列表 |
| `sort_order` | int | 否 | ≥0 | 0 | 排序权重 |
| `tags` | list[string] | 否 | — | [] | 标签列表 |
| `decoration_style` | string | 否 | ≤100字符 | null | 装修风格 |
| `publish_status` | PublishStatus | 否 | 枚举 | DRAFT | 发布状态 |
| `project_status` | MarketingProjectStatus | 否 | 枚举 | IN_PROGRESS | 项目状态 |
| `project_id` | string | 否 | 1~36字符 | null | 关联L3项目ID（软引用） |
| `consultant_id` | string | 否 | 1~36字符 | null | 关联顾问ID（软引用） |
| `media_files` | list[L4MarketingMediaCreate] | 否 | — | null | 媒体文件列表 |

**请求示例**

```http
POST /api/v1/admin/l4-marketing/projects
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "community_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "community_name": "朝阳花园",
  "layout": "三室两厅",
  "orientation": "南北通透",
  "floor_info": "15/28层",
  "area": "120.50",
  "total_price": "850.00",
  "title": "朝阳花园精装三居 南北通透",
  "images": [
    "https://cdn.example.com/marketing/1/01.jpg"
  ],
  "tags": ["精装", "南北通透", "地铁旁"],
  "decoration_style": "现代简约",
  "publish_status": "草稿",
  "project_status": "在途",
  "consultant_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "media_files": [
    {
      "media_type": "image",
      "photo_category": "marketing",
      "description": "客厅实景",
      "sort_order": 0,
      "file_url": "https://cdn.example.com/marketing/1/01.jpg",
      "thumbnail_url": "https://cdn.example.com/marketing/1/01_thumb.jpg"
    }
  ]
}
```

**响应示例** — `201 Created`

```json
{
  "id": 2,
  "community_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "community_name": "朝阳花园",
  "layout": "三室两厅",
  "orientation": "南北通透",
  "floor_info": "15/28层",
  "area": "120.50",
  "total_price": "850.00",
  "unit_price": "7.05",
  "title": "朝阳花园精装三居 南北通透",
  "images": [
    "https://cdn.example.com/marketing/1/01.jpg"
  ],
  "sort_order": 0,
  "tags": ["精装", "南北通透", "地铁旁"],
  "decoration_style": "现代简约",
  "publish_status": "草稿",
  "project_status": "在途",
  "project_id": null,
  "consultant_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "is_deleted": false,
  "created_at": "2026-05-25T08:00:00",
  "updated_at": "2026-05-25T08:00:00",
  "media_files": [
    {
      "id": 5,
      "marketing_project_id": 2,
      "origin_media_id": null,
      "media_type": "image",
      "photo_category": "marketing",
      "renovation_stage": null,
      "description": "客厅实景",
      "sort_order": 0,
      "file_url": "https://cdn.example.com/marketing/1/01.jpg",
      "thumbnail_url": "https://cdn.example.com/marketing/1/01_thumb.jpg",
      "is_deleted": false,
      "created_at": "2026-05-25T08:00:00",
      "updated_at": "2026-05-25T08:00:00"
    }
  ]
}
```

> **说明**：`unit_price` 由后端自动计算（`total_price / area`），无需前端传入。

---

### 4.3 获取营销项目详情

根据项目ID获取单个营销项目的完整信息。

```
GET /api/v1/admin/l4-marketing/projects/{project_id}
```

**路径参数**

| 参数 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `project_id` | int | ≥1 | 营销项目ID |

**请求示例**

```http
GET /api/v1/admin/l4-marketing/projects/1
Authorization: Bearer <jwt_token>
```

**响应示例** — `200 OK`

```json
{
  "id": 1,
  "community_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "community_name": "朝阳花园",
  "layout": "三室两厅",
  "orientation": "南北通透",
  "floor_info": "15/28层",
  "area": "120.50",
  "total_price": "850.00",
  "unit_price": "7.05",
  "title": "朝阳花园精装三居 南北通透",
  "images": [
    "https://cdn.example.com/marketing/1/01.jpg",
    "https://cdn.example.com/marketing/1/02.jpg"
  ],
  "sort_order": 0,
  "tags": ["精装", "南北通透", "地铁旁"],
  "decoration_style": "现代简约",
  "publish_status": "发布",
  "project_status": "在售",
  "project_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "consultant_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "is_deleted": false,
  "created_at": "2026-05-20T10:30:00",
  "updated_at": "2026-05-22T14:20:00",
  "media_files": [
    {
      "id": 1,
      "marketing_project_id": 1,
      "origin_media_id": null,
      "media_type": "image",
      "photo_category": "marketing",
      "renovation_stage": null,
      "description": "客厅实景",
      "sort_order": 0,
      "file_url": "https://cdn.example.com/marketing/1/01.jpg",
      "thumbnail_url": "https://cdn.example.com/marketing/1/01_thumb.jpg",
      "is_deleted": false,
      "created_at": "2026-05-20T10:30:00",
      "updated_at": "2026-05-20T10:30:00"
    },
    {
      "id": 2,
      "marketing_project_id": 1,
      "origin_media_id": 42,
      "media_type": "image",
      "photo_category": "renovation",
      "renovation_stage": "水电",
      "description": "水电改造前",
      "sort_order": 1,
      "file_url": "https://cdn.example.com/marketing/1/renovation/01.jpg",
      "thumbnail_url": "https://cdn.example.com/marketing/1/renovation/01_thumb.jpg",
      "is_deleted": false,
      "created_at": "2026-05-21T09:00:00",
      "updated_at": "2026-05-21T09:00:00"
    }
  ]
}
```

---

### 4.4 更新营销项目

更新指定营销项目，所有字段均为可选（仅更新传入的字段）。

```
PUT /api/v1/admin/l4-marketing/projects/{project_id}
```

**速率限制**：100次/小时

**路径参数**

| 参数 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `project_id` | int | ≥1 | 营销项目ID |

**请求体** — `L4MarketingProjectUpdate`（所有字段可选）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `community_id` | string | 1~36字符 | 关联小区ID |
| `community_name` | string | ≤200字符 | 小区名称 |
| `layout` | string | 1~100字符 | 户型 |
| `orientation` | string | 1~50字符 | 朝向 |
| `floor_info` | string | 1~100字符 | 楼层信息 |
| `area` | Decimal | >0，2位小数 | 面积（m²） |
| `total_price` | Decimal | >0，2位小数 | 总价（万元） |
| `title` | string | 1~255字符 | 标题 |
| `images` | list[string] | — | 图片URL列表 |
| `sort_order` | int | ≥0 | 排序权重 |
| `tags` | list[string] | — | 标签列表 |
| `decoration_style` | string | ≤100字符 | 装修风格 |
| `publish_status` | PublishStatus | 枚举 | 发布状态 |
| `project_status` | MarketingProjectStatus | 枚举 | 项目状态 |
| `project_id` | string | 1~36字符 | 关联L3项目ID |
| `consultant_id` | string | 1~36字符 | 关联顾问ID |

> **说明**：`images` 和 `tags` 字段支持传入 JSON 字符串或列表。未传入的字段不会被更新。

**请求示例**

```http
PUT /api/v1/admin/l4-marketing/projects/1
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "title": "朝阳花园精装三居 南北通透 急售",
  "total_price": "820.00",
  "project_status": "在售",
  "publish_status": "发布"
}
```

**响应示例** — `200 OK`

```json
{
  "id": 1,
  "community_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "community_name": "朝阳花园",
  "layout": "三室两厅",
  "orientation": "南北通透",
  "floor_info": "15/28层",
  "area": "120.50",
  "total_price": "820.00",
  "unit_price": "6.80",
  "title": "朝阳花园精装三居 南北通透 急售",
  "images": [
    "https://cdn.example.com/marketing/1/01.jpg",
    "https://cdn.example.com/marketing/1/02.jpg"
  ],
  "sort_order": 0,
  "tags": ["精装", "南北通透", "地铁旁"],
  "decoration_style": "现代简约",
  "publish_status": "发布",
  "project_status": "在售",
  "project_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "consultant_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "is_deleted": false,
  "created_at": "2026-05-20T10:30:00",
  "updated_at": "2026-05-25T09:15:00",
  "media_files": []
}
```

---

### 4.5 删除营销项目

逻辑删除营销项目（设置 `is_deleted = true`），非物理删除。

```
DELETE /api/v1/admin/l4-marketing/projects/{project_id}
```

**速率限制**：20次/小时

**路径参数**

| 参数 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `project_id` | int | ≥1 | 营销项目ID |

**请求示例**

```http
DELETE /api/v1/admin/l4-marketing/projects/1
Authorization: Bearer <jwt_token>
```

**响应** — `204 No Content`（无响应体）

***

## 5. 媒体资源管理

### 5.1 获取媒体列表

获取指定营销项目的媒体资源分页列表。

```
GET /api/v1/admin/l4-marketing/projects/{project_id}/media
```

**路径参数**

| 参数 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `project_id` | int | ≥1 | 营销项目ID |

**查询参数**

| 参数 | 类型 | 必填 | 约束 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `page` | int | 否 | ≥1 | 1 | 页码 |
| `page_size` | int | 否 | 1~200 | 100 | 每页大小 |

**请求示例**

```http
GET /api/v1/admin/l4-marketing/projects/1/media?page=1&page_size=100
Authorization: Bearer <jwt_token>
```

**响应示例** — `200 OK`

```json
{
  "items": [
    {
      "id": 1,
      "marketing_project_id": 1,
      "origin_media_id": null,
      "media_type": "image",
      "photo_category": "marketing",
      "renovation_stage": null,
      "description": "客厅实景",
      "sort_order": 0,
      "file_url": "https://cdn.example.com/marketing/1/01.jpg",
      "thumbnail_url": "https://cdn.example.com/marketing/1/01_thumb.jpg",
      "is_deleted": false,
      "created_at": "2026-05-20T10:30:00",
      "updated_at": "2026-05-20T10:30:00"
    },
    {
      "id": 2,
      "marketing_project_id": 1,
      "origin_media_id": 42,
      "media_type": "image",
      "photo_category": "renovation",
      "renovation_stage": "水电",
      "description": "水电改造前",
      "sort_order": 1,
      "file_url": "https://cdn.example.com/marketing/1/renovation/01.jpg",
      "thumbnail_url": "https://cdn.example.com/marketing/1/renovation/01_thumb.jpg",
      "is_deleted": false,
      "created_at": "2026-05-21T09:00:00",
      "updated_at": "2026-05-21T09:00:00"
    }
  ],
  "total": 2,
  "page": 1,
  "page_size": 100
}
```

---

### 5.2 添加媒体

为指定营销项目添加媒体资源。

```
POST /api/v1/admin/l4-marketing/projects/{project_id}/media
```

**路径参数**

| 参数 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `project_id` | int | ≥1 | 营销项目ID |

**请求体** — `L4MarketingMediaCreate`

| 字段 | 类型 | 必填 | 约束 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `media_type` | MediaType | 否 | 枚举 | image | 媒体类型 |
| `photo_category` | PhotoCategory | 否 | 枚举 | marketing | 照片分类 |
| `renovation_stage` | string | 否 | ≤50字符 | null | 装修阶段（仅改造照片） |
| `description` | string | 否 | — | null | 描述 |
| `sort_order` | int | 否 | ≥0 | 0 | 排序 |
| `origin_media_id` | int | 否 | — | null | 来源媒体ID（L3层） |
| `file_url` | string | ✅ | ≥1字符 | — | 文件URL |
| `thumbnail_url` | string | 否 | — | null | 缩略图URL |

**请求示例**

```http
POST /api/v1/admin/l4-marketing/projects/1/media
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "media_type": "image",
  "photo_category": "renovation",
  "renovation_stage": "油漆",
  "description": "油漆完工效果",
  "sort_order": 3,
  "file_url": "https://cdn.example.com/marketing/1/renovation/03.jpg",
  "thumbnail_url": "https://cdn.example.com/marketing/1/renovation/03_thumb.jpg"
}
```

**响应示例** — `201 Created`

```json
{
  "id": 3,
  "marketing_project_id": 1,
  "origin_media_id": null,
  "media_type": "image",
  "photo_category": "renovation",
  "renovation_stage": "油漆",
  "description": "油漆完工效果",
  "sort_order": 3,
  "file_url": "https://cdn.example.com/marketing/1/renovation/03.jpg",
  "thumbnail_url": "https://cdn.example.com/marketing/1/renovation/03_thumb.jpg",
  "is_deleted": false,
  "created_at": "2026-05-25T10:00:00",
  "updated_at": "2026-05-25T10:00:00"
}
```

---

### 5.3 更新媒体

更新指定媒体资源信息，所有字段均为可选。

```
PUT /api/v1/admin/l4-marketing/media/{media_id}
```

**速率限制**：100次/小时

**路径参数**

| 参数 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `media_id` | int | ≥1 | 媒体ID |

**请求体** — `L4MarketingMediaUpdate`（所有字段可选）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `photo_category` | PhotoCategory | 枚举 | 照片分类 |
| `renovation_stage` | string | ≤50字符 | 装修阶段 |
| `description` | string | — | 描述 |
| `sort_order` | int | ≥0 | 排序 |
| `thumbnail_url` | string | — | 缩略图URL |

**请求示例**

```http
PUT /api/v1/admin/l4-marketing/media/3
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "description": "油漆完工效果 - 客厅",
  "sort_order": 2
}
```

**响应示例** — `200 OK`

```json
{
  "id": 3,
  "marketing_project_id": 1,
  "origin_media_id": null,
  "media_type": "image",
  "photo_category": "renovation",
  "renovation_stage": "油漆",
  "description": "油漆完工效果 - 客厅",
  "sort_order": 2,
  "file_url": "https://cdn.example.com/marketing/1/renovation/03.jpg",
  "thumbnail_url": "https://cdn.example.com/marketing/1/renovation/03_thumb.jpg",
  "is_deleted": false,
  "created_at": "2026-05-25T10:00:00",
  "updated_at": "2026-05-25T10:30:00"
}
```

---

### 5.4 删除媒体

逻辑删除媒体资源（设置 `is_deleted = true`）。

```
DELETE /api/v1/admin/l4-marketing/media/{media_id}
```

**速率限制**：20次/小时

**路径参数**

| 参数 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `media_id` | int | ≥1 | 媒体ID |

**请求示例**

```http
DELETE /api/v1/admin/l4-marketing/media/3
Authorization: Bearer <jwt_token>
```

**响应** — `204 No Content`（无响应体）

---

### 5.5 批量更新媒体排序

批量更新指定营销项目下多个媒体的排序值。

```
PUT /api/v1/admin/l4-marketing/projects/{project_id}/media/sort-order
```

**速率限制**：100次/小时

**路径参数**

| 参数 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `project_id` | int | ≥1 | 营销项目ID |

**请求体** — `list[MediaSortOrderUpdate]`

| 字段 | 类型 | 必填 | 约束 | 说明 |
| --- | --- | --- | --- | --- |
| `media_id` | int | ✅ | — | 媒体ID |
| `sort_order` | int | ✅ | ≥0 | 排序值 |

**请求示例**

```http
PUT /api/v1/admin/l4-marketing/projects/1/media/sort-order
Authorization: Bearer <jwt_token>
Content-Type: application/json

[
  { "media_id": 1, "sort_order": 2 },
  { "media_id": 2, "sort_order": 0 },
  { "media_id": 3, "sort_order": 1 }
]
```

**响应示例** — `200 OK`

```json
{
  "total_synced": 3
}
```

***

## 6. L3项目导入

### 6.1 获取可关联的L3项目列表

获取可用于关联/导入的 L3 项目列表，用于创建营销房源时选择关联项目。

```
GET /api/v1/admin/l4-marketing/available-projects
```

**查询参数**

| 参数 | 类型 | 必填 | 约束 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `community_name` | string | 否 | — | — | 小区名称筛选 |
| `status` | string | 否 | — | — | 项目状态筛选 |
| `page` | int | 否 | ≥1 | 1 | 页码 |
| `page_size` | int | 否 | 1~200 | 20 | 每页大小 |

**请求示例**

```http
GET /api/v1/admin/l4-marketing/available-projects?community_name=朝阳&page=1&page_size=20
Authorization: Bearer <jwt_token>
```

**响应示例** — `200 OK`

```json
{
  "items": [
    {
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "name": "朝阳花园3号楼改造项目",
      "community_name": "朝阳花园",
      "address": "北京市朝阳区建国路88号",
      "area": "120.50",
      "layout": "三室两厅",
      "orientation": "南北通透",
      "status": "进行中"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 20
}
```

---

### 6.2 获取L3项目详情

获取单个 L3 项目的精简信息，用于项目选择器中预览。

```
GET /api/v1/admin/l4-marketing/available-projects/{project_id}
```

**路径参数**

| 参数 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `project_id` | string | — | L3项目ID（UUID字符串） |

**请求示例**

```http
GET /api/v1/admin/l4-marketing/available-projects/b2c3d4e5-f6a7-8901-bcde-f12345678901
Authorization: Bearer <jwt_token>
```

**响应示例** — `200 OK`

```json
{
  "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "name": "朝阳花园3号楼改造项目",
  "community_name": "朝阳花园",
  "address": "北京市朝阳区建国路88号",
  "area": "120.50",
  "layout": "三室两厅",
  "orientation": "南北通透",
  "status": "进行中"
}
```

---

### 6.3 从L3项目导入数据

根据 L3 项目 ID 获取可导入的数据，采用写时复制（CoW）模式，L4 独立存储数据。

```
POST /api/v1/admin/l4-marketing/projects/import-from-l3/{project_id}
```

**路径参数**

| 参数 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `project_id` | string | — | L3项目ID（UUID字符串） |

**请求示例**

```http
POST /api/v1/admin/l4-marketing/projects/import-from-l3/b2c3d4e5-f6a7-8901-bcde-f12345678901
Authorization: Bearer <jwt_token>
```

**响应示例** — `200 OK`

```json
{
  "project_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "community_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "community_name": "朝阳花园",
  "layout": "三室两厅",
  "orientation": "南北通透",
  "floor_info": "15/28层",
  "area": "120.50",
  "total_price": "850.00",
  "unit_price": "7.05",
  "title": "朝阳花园3号楼改造项目",
  "tags": "精装,南北通透",
  "decoration_style": "现代简约",
  "status": "进行中",
  "available_media": [
    {
      "id": "m1n2o3p4-q5r6-7890-stuv-wxyz12345678",
      "file_url": "https://cdn.example.com/l3/project/01.jpg",
      "thumbnail_url": "https://cdn.example.com/l3/project/01_thumb.jpg",
      "photo_category": "marketing",
      "renovation_stage": null,
      "description": "项目外观",
      "sort_order": 0
    },
    {
      "id": "n2o3p4q5-r6s7-8901-tuvw-xyz123456789",
      "file_url": "https://cdn.example.com/l3/project/renovation/01.jpg",
      "thumbnail_url": "https://cdn.example.com/l3/project/renovation/01_thumb.jpg",
      "photo_category": "renovation",
      "renovation_stage": "拆除",
      "description": "拆除阶段",
      "sort_order": 1
    }
  ]
}
```

> **说明**：此接口返回导入预览数据，前端可据此展示可导入内容，用户确认后再调用创建接口完成导入。`available_media` 中的 `id` 可作为 `L4MarketingMediaCreate.origin_media_id` 使用。

***

## 7. Schema 定义

### L4MarketingProjectCreate

```json
{
  "community_id": "string (1~36字符, 必填)",
  "community_name": "string | null (≤200字符)",
  "layout": "string (1~100字符, 必填)",
  "orientation": "string (1~50字符, 必填)",
  "floor_info": "string (1~100字符, 必填)",
  "area": "Decimal (>0, 2位小数, 必填)",
  "total_price": "Decimal (>0, 2位小数, 必填)",
  "title": "string (1~255字符, 必填)",
  "images": ["string"],
  "sort_order": "int (≥0, 默认0)",
  "tags": ["string"],
  "decoration_style": "string | null (≤100字符)",
  "publish_status": "PublishStatus (默认DRAFT)",
  "project_status": "MarketingProjectStatus (默认IN_PROGRESS)",
  "project_id": "string | null (1~36字符)",
  "consultant_id": "string | null (1~36字符)",
  "media_files": ["L4MarketingMediaCreate | null"]
}
```

### L4MarketingProjectUpdate

所有字段可选，仅传入的字段会被更新。

```json
{
  "community_id": "string | null",
  "community_name": "string | null",
  "layout": "string | null",
  "orientation": "string | null",
  "floor_info": "string | null",
  "area": "Decimal | null",
  "total_price": "Decimal | null",
  "title": "string | null",
  "images": ["string"] | null,
  "sort_order": "int | null",
  "tags": ["string"] | null,
  "decoration_style": "string | null",
  "publish_status": "PublishStatus | null",
  "project_status": "MarketingProjectStatus | null",
  "project_id": "string | null",
  "consultant_id": "string | null"
}
```

> `images` 和 `tags` 字段支持传入 JSON 字符串或列表格式。

### L4MarketingProjectResponse

```json
{
  "id": "int",
  "community_id": "string",
  "community_name": "string | null",
  "layout": "string",
  "orientation": "string",
  "floor_info": "string",
  "area": "Decimal",
  "total_price": "Decimal",
  "unit_price": "Decimal",
  "title": "string",
  "images": ["string"],
  "sort_order": "int",
  "tags": ["string"],
  "decoration_style": "string | null",
  "publish_status": "PublishStatus",
  "project_status": "MarketingProjectStatus",
  "project_id": "string | null",
  "consultant_id": "string | null",
  "is_deleted": "bool",
  "created_at": "datetime",
  "updated_at": "datetime",
  "media_files": ["L4MarketingMediaResponse"]
}
```

### L4MarketingProjectListResponse

```json
{
  "items": ["L4MarketingProjectResponse"],
  "total": "int",
  "page": "int",
  "page_size": "int",
  "summary": {
    "total": "int",
    "published": "int",
    "draft": "int",
    "for_sale": "int",
    "sold": "int",
    "in_progress": "int"
  }
}
```

### L4MarketingProjectSummary

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `total` | int | 项目总数 |
| `published` | int | 已发布项目数 |
| `draft` | int | 草稿项目数 |
| `for_sale` | int | 在售项目数 |
| `sold` | int | 已售项目数 |
| `in_progress` | int | 在途项目数 |

### L4MarketingMediaCreate

```json
{
  "media_type": "MediaType (默认image)",
  "photo_category": "PhotoCategory (默认marketing)",
  "renovation_stage": "string | null (≤50字符)",
  "description": "string | null",
  "sort_order": "int (≥0, 默认0)",
  "origin_media_id": "int | null",
  "file_url": "string (≥1字符, 必填)",
  "thumbnail_url": "string | null"
}
```

### L4MarketingMediaUpdate

所有字段可选。

```json
{
  "photo_category": "PhotoCategory | null",
  "renovation_stage": "string | null (≤50字符)",
  "description": "string | null",
  "sort_order": "int | null (≥0)",
  "thumbnail_url": "string | null"
}
```

### L4MarketingMediaResponse

```json
{
  "id": "int",
  "marketing_project_id": "int",
  "origin_media_id": "int | null",
  "media_type": "MediaType",
  "photo_category": "PhotoCategory",
  "renovation_stage": "string | null",
  "description": "string | null",
  "sort_order": "int",
  "file_url": "string",
  "thumbnail_url": "string | null",
  "is_deleted": "bool",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### L4MarketingMediaListResponse

```json
{
  "items": ["L4MarketingMediaResponse"],
  "total": "int",
  "page": "int",
  "page_size": "int"
}
```

### MediaSortOrderUpdate

```json
{
  "media_id": "int (必填)",
  "sort_order": "int (≥0, 必填)"
}
```

### L4SyncResponse

```json
{
  "total_synced": "int (≥0)"
}
```

### L3ProjectBriefResponse

```json
{
  "id": "string",
  "name": "string",
  "community_name": "string",
  "address": "string",
  "area": "Decimal | null",
  "layout": "string | null",
  "orientation": "string | null",
  "status": "string"
}
```

### L3ProjectListResponse

```json
{
  "items": ["L3ProjectBriefResponse"],
  "total": "int",
  "page": "int",
  "page_size": "int"
}
```

### L3ProjectImportResponse

```json
{
  "project_id": "string",
  "community_id": "string | null",
  "community_name": "string",
  "layout": "string | null",
  "orientation": "string | null",
  "floor_info": "string | null",
  "area": "Decimal | null",
  "total_price": "Decimal | null",
  "unit_price": "Decimal | null",
  "title": "string",
  "tags": "string | null",
  "decoration_style": "string | null",
  "status": "string | null",
  "available_media": ["ImportableMediaResponse"]
}
```

### ImportableMediaResponse

```json
{
  "id": "string",
  "file_url": "string",
  "thumbnail_url": "string | null",
  "photo_category": "string",
  "renovation_stage": "string | null",
  "description": "string | null",
  "sort_order": "int"
}
```

***

## 8. 错误码表

### HTTP 状态码

| HTTP 状态码 | 错误类型 | `detail` 示例 | 场景 |
| --- | --- | --- | --- |
| `400` | ValidationError | 字段验证失败 | 请求参数不符合约束 |
| `401` | HTTPException | 未认证 | 缺少或无效的 JWT Token |
| `403` | HTTPException | 权限不足 | 非 admin/operator 角色 |
| `404` | HTTPException | `"项目不存在"` | 营销项目ID不存在或已删除 |
| `404` | HTTPException | `"媒体不存在"` | 媒体ID不存在或已删除 |
| `404` | HTTPException | `"项目不存在或已删除"` | L3项目ID不存在 |
| `422` | RequestValidationError | 请求参数验证失败 | 请求体格式错误、必填字段缺失 |
| `429` | RateLimitExceeded | 请求过于频繁 | 触发速率限制 |
| `500` | HTTPException | `"导入数据失败"` | L3项目导入处理异常 |

### 速率限制汇总

| 操作 | 限制 | 对应端点 |
| --- | --- | --- |
| 创建营销项目 | 100次/小时 | `POST /projects` |
| 更新营销项目 | 100次/小时 | `PUT /projects/{id}` |
| 删除营销项目 | 20次/小时 | `DELETE /projects/{id}` |
| 更新媒体 | 100次/小时 | `PUT /media/{id}` |
| 删除媒体 | 20次/小时 | `DELETE /media/{id}` |
| 批量更新媒体排序 | 100次/小时 | `PUT /projects/{id}/media/sort-order` |

### 常见错误示例

**参数验证失败** — `422 Unprocessable Entity`

```json
{
  "detail": [
    {
      "type": "greater_than",
      "loc": ["body", "area"],
      "msg": "Input should be greater than 0",
      "input": -10
    }
  ]
}
```

**资源不存在** — `404 Not Found`

```json
{
  "detail": "项目不存在"
}
```

**权限不足** — `403 Forbidden`

```json
{
  "detail": "权限不足"
}
```

**速率限制** — `429 Too Many Requests`

```json
{
  "detail": "请求过于频繁，请稍后重试"
}
```

***

> **文档维护**：本文档基于 `routers/marketing/projects.py`、`routers/marketing/import_.py`、`schemas/l4_marketing/`、`models/marketing/l4_marketing.py`、`services/marketing/` 源码分析生成。如接口实现变更，请同步更新本文档。
