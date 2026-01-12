# Profo 房产改造小程序项目推进计划 (v2.0)

## 背景说明

当前系统分为两部分：
1. **中后台管理系统**：FastAPI 后端，包含完整的项目管理、房源管理、线索管理等功能
2. **C端小程序**：uni-app 开发的小程序，目前使用 mock 数据

**技术栈**：
- 前端：Next.js 16 + TypeScript + Shadcn/UI + Tailwind CSS
- 后端：FastAPI + Python 3.12
- 数据库：SQLite
- 状态管理：nuqs 2.8.5
- 拖拽排序：@dnd-kit
- 表单库：React Hook Form + Zod

**核心概念区分**：
- **项目(Project)**：改造项目的整体，记录装修进度、财务数据等业务信息
- **房源(Property)**：市场观测数据，用于分析房价走势，采集自各房产平台
- **小程序项目(MiniProject)**：C端展示用的项目数据，独立于主项目表

**核心问题**：小程序中的"房源"对应的是中后台系统中的"项目"（改造项目），而非"房源"（市场数据）。当前后端接口是为中后台设计，不适合直接暴露给 C 端小程序使用。

---

## 一、业务流程设计

### 1.1 数据同步策略 (双模式)

我们设计两种同步操作，应对不同场景：

| 模式 | 按钮名称 | 触发场景 | 逻辑说明 |
| --- | --- | --- | --- |
| **增量同步** | `同步新项目` | 有新签下的房源需要上线时 | 1. 扫描 `Projects` 表。<br>2. 检查 `project_id` 是否已存在于 `MiniProjects`。<br>3. 仅为**不存在**的项目创建新记录。<br>4. 默认 `is_published=False`。 |
| **字段重置** | `刷新基础信息` | 内部测绘面积修正、户型变更、签约价调整时 | 1. 针对**单个**小程序项目操作。<br>2. **强制覆盖**：地址、面积、户型、参考价、朝向。<br>3. **保留不变**：营销标题、封面图、分享文案、营销标签、已选照片。 |

### 1.2 照片管理流程 (精选+上传)

解决"工地照片太丑/隐私"与"手动上传太累"的矛盾：

1. **数据源接口**：后台新增接口，根据 `project_id` 拉取主系统中该项目的全部原始照片（带阶段标记）。
2. **筛选器组件**：
   - 左侧：**主项目图库** (按阶段分类，支持多选)。
   - 右侧：**小程序展示图** (支持拖拽排序)。
   - 操作：点击左侧图片 -> 标记 `origin_photo_id` 到右侧 -> 写入 `mini_project_photos` 表。
3. **补充上传**：右侧支持直接上传本地美化过的图片（如效果图）。
4. **混用支持**：同一项目可同时包含标记的照片和上传的照片。

**照片来源逻辑**：
| 项目类型 | 照片来源 | `origin_photo_id` |
|---------|---------|------------------|
| 关联主项目 | 从主项目标记 | `非空`（记录来源照片 ID） |
| 独立创建项目 | 用户上传 | `空`（直接存储上传的 URL） |
| 混用场景 | 两者都有 | 分别记录 |

### 1.3 小程序项目管理列表操作

| 操作 | 说明 |
|-----|------|
| **完善信息** | 点击进入详情页，将主项目数据带过来进行编辑 |
| **上架/下架** | 切换 `is_published` 状态，控制是否在小程序展示 |
| **删除** | 软删除小程序项目，不影响主项目 |
| **刷新基础信息** | 将主项目的硬字段强制覆盖到小程序项目 |
| **获取素材库** | 拉取主项目的所有照片，供筛选标记 |

### 1.4 顾问管理流程

* **一次录入，多次复用**。
* 在后台"顾问管理"菜单维护人员信息。
* 在"项目编辑"页，通过下拉框选择该项目的专属顾问。
* 普通运营可修改顾问信息。
* 当顾问状态设为 `is_active=False` 时，C 端详情页显示公司通用客服。

### 1.5 独立新建项目

支持不关联主项目，直接在小程序管理中新建项目：
- 用于推广尚未签约但准备上线的项目
- 所有字段独立填写
- 照片需手动上传（无原项目照片可选）
- 创建后可关联到主项目（后期扩展）

---

## 二、字段映射与调整

### 2.1 后端项目(Project)字段 → 小程序字段对应关系

根据 OpenAPI 文档，后端 Project 主要字段：

| 后端字段 | 类型 | 小程序字段 | 说明 |
|---------|------|-----------|------|
| `id` | string | `project_id` | 主项目 ID（关联用） |
| `name` | string | `title` | 项目名称，可独立编辑 |
| `community_name` | string | - | 复用，拼接地址 |
| `address` | string | `address` | 完整物业地址 |
| `area` | number | `area` | 产证面积 (m²) |
| `signing_price` | number | `price` | 签约价格/预估售价 (万) |
| `list_price` | number | - | 挂牌价，可复用 |
| `manager` | string | - | 负责人，内部使用 |
| `signing_date` | datetime | - | 签约日期 |
| `tags` | string[] | `tags` | 项目标签 |
| `status` | enum | - | 项目状态，不直接展示 |

### 2.2 后端房源(Property)字段 → 小程序字段对应关系

小程序可关联房源表获取户型信息：

| 后端字段 | 类型 | 小程序字段 | 说明 |
|---------|------|-----------|------|
| `rooms` | int | `rooms` | 室 |
| `halls` | int | - | 厅 |
| `baths` | int | `bathrooms` | 卫 |
| `layout_display` | string | `layout` | 户型展示，如"3室2厅2卫" |
| `orientation` | string | `orientation` | 朝向 |
| `floor_display` | string | `floor` | 楼层信息 |
| `picture_links` | string[] | `images` | 房源图片 |

### 2.3 改造阶段(Renovation)字段映射

后端 `RenovationStage` 枚举值：
`拆除`, `设计`, `水电`, `木瓦`, `油漆`, `安装`, `交付`, `已完成`

| 后端字段 | 类型 | 小程序字段 | 说明 |
|---------|------|-----------|------|
| `renovation_stage` | enum | `stage` | 阶段标识 |
| `stage_completed_at` | datetime | `completed_at` | 阶段完成时间 |
| `photo_id` | - | `image_url` | 阶段照片 |

### 2.4 小程序当前字段 → 后端字段映射

| 小程序字段 | 后端来源 | 调整建议 |
|-----------|---------|---------|
| `title` | mock | 映射自 `name` |
| `cover` | mock | 需后端新增 `cover_image` |
| `address` | mock | 映射自 `community_name + address` |
| `price` | mock | 映射自 `signing_price` |
| `area` | mock | 映射自 `area` |
| `rooms` | mock | 映射自 `rooms` (房源表) |
| `bathrooms` | mock | 映射自 `baths` (房源表) |
| `layout` | mock | 映射自 `layout_display` (房源表) |
| `style` | mock | 需独立字段 |
| `orientation` | mock | 映射自 `orientation` (房源表) |
| `tags` | mock | 映射自 `tags` |
| `images` | mock | 映射自 `picture_links` (房源表) |

---

## 三、数据库设计

### 3.1 独立表：顾问库

```sql
CREATE TABLE consultants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    role VARCHAR(100),              -- 职位，如 "资深大管家"
    phone VARCHAR(20),              -- 联系电话
    wx_qr_code TEXT,                -- 微信二维码 (可选)
    intro TEXT,                     -- 个人简介
    rating DECIMAL(2, 1) DEFAULT 5.0,
    completed_projects INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE, -- 离职/在职状态
    created_at DATETIME DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_consultants_active ON consultants(is_active);
```

### 3.2 主表：小程序项目展示配置

```sql
CREATE TABLE mini_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID,                -- 关联主项目 (可为空，支持纯手动创建)
    consultant_id UUID,             -- 关联顾问表

    -- 营销信息 (运营维护，同步不覆盖)
    title VARCHAR(200) NOT NULL,    -- 营销标题
    cover_image TEXT,
    style VARCHAR(50),
    description TEXT,
    marketing_tags JSONB,           -- 独立营销标签 ["地铁口", "满五"]

    -- SEO 与分享 (运营维护，同步不覆盖)
    share_title VARCHAR(100),       -- 微信分享标题
    share_image TEXT,               -- 微信分享图 (5:4)
    view_count INT DEFAULT 0,       -- 虚拟浏览量

    -- 硬字段 (来自主项目，刷新时覆盖)
    address VARCHAR(500),
    area DECIMAL(10, 2),
    price DECIMAL(15, 2),           -- 预估售价
    layout VARCHAR(50),
    orientation VARCHAR(20),
    floor_info VARCHAR(100),

    -- 状态控制
    sort_order INT DEFAULT 0,
    is_published BOOLEAN DEFAULT FALSE,
    published_at DATETIME,

    created_at DATETIME DEFAULT NOW(),
    updated_at DATETIME DEFAULT NOW(),

    CONSTRAINT fk_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    CONSTRAINT fk_consultant FOREIGN KEY (consultant_id) REFERENCES consultants(id)
);

-- 索引
CREATE INDEX idx_mini_projects_published ON mini_projects(is_published, sort_order DESC);
CREATE INDEX idx_mini_projects_project ON mini_projects(project_id);
CREATE INDEX idx_mini_projects_consultant ON mini_projects(consultant_id);
```

### 3.3 关联表：项目展示照片

照片使用"标记"机制，非物理复制。支持混用：标记原项目照片 + 直接上传照片。

```sql
CREATE TABLE mini_project_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mini_project_id UUID NOT NULL REFERENCES mini_projects(id) ON DELETE CASCADE,

    renovation_stage VARCHAR(50),   -- 阶段: 拆除/水电/泥木/竣工...

    -- 来源 A：关联主项目照片（标记机制，URL 实时查询）
    origin_photo_id UUID,

    -- 来源 B：独立上传照片（直接存储 URL）
    image_url TEXT,

    description TEXT,
    sort_order INT DEFAULT 0,
    created_at DATETIME DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_photos_mini_project ON mini_project_photos(mini_project_id, renovation_stage);
CREATE INDEX idx_photos_origin ON mini_project_photos(origin_photo_id);
```

**照片获取逻辑（C端接口）**：
```python
async def get_project_photos(mini_project_id: str):
    photos = await get_photos(mini_project_id)
    result = []
    for photo in photos:
        if photo.image_url:
            # 上传的照片优先显示
            result.append({...photo.dict(), 'image_url': photo.image_url})
        elif photo.origin_photo_id:
            # 关联项目的照片，实时查询原图 URL
            original_url = await get_original_photo_url(photo.origin_photo_id)
            result.append({...photo.dict(), 'image_url': original_url})
        else:
            result.append({...photo.dict(), 'image_url': None})
    return result
```

### 3.4 数据复用策略

| 字段 | 复用主项目 | 复用房源表 | 独立字段 | 说明 |
|-----|-----------|-----------|---------|------|
| 项目名称 | ✓ | - | `title` | 优先用独立字段 |
| 小区名称 | ✓ | ✓ | - | 从 projects 或 properties 关联 |
| 地址 | ✓ | ✓ | `address` | 拼接或独立 |
| 面积 | ✓ | ✓ | `area` | 优先用 projects.area |
| 价格 | ✓ | - | `price` | 优先用 projects.signing_price |
| 户型 | - | ✓ | `layout` | 从 properties 关联 |
| 朝向 | - | ✓ | `orientation` | 从 properties 关联 |
| 封面图 | - | - | `cover_image` | 独立字段 |
| 装修风格 | - | - | `style` | 独立字段 |
| 营销标签 | - | - | `marketing_tags` | 完全独立 |
| 顾问信息 | - | - | `consultant_id` | 关联 consultants 表 |
| 阶段照片 | - | - | `mini_project_photos` | 支持标记+上传混用 |

---

## 四、接口定义

### 4.1 C端接口 (Mini API)

所有接口使用 `/api/v1/mini/` 前缀，与中后台接口区分。

| 方法 | 路径 | 说明 | 变更点 |
| --- | --- | --- | --- |
| `GET` | `/mini/projects` | 项目列表 | 返回 `marketing_tags`, `view_count` |
| `GET` | `/mini/projects/{id}` | 项目详情 | 返回 `consultant` 完整信息, `share_info` |
| `GET` | `/mini/projects/{id}/renovation` | 改造进度 | 返回 `mini_project_photos` 中的筛选图（通过 origin_photo_id 实时查询） |
| `POST` | `/mini/consultation` | 提交线索 | 记录 `consultant_id` 以便分发 |

#### 4.1.1 项目列表接口

```
GET /api/v1/mini/projects
```

**Query Parameters**:
| 参数 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| `status` | string | 否 | 项目状态筛选 (renovating/selling) |
| `page` | int | 否 | 页码，默认1 |
| `page_size` | int | 否 | 每页数量，默认20 |

**Response Schema**:
```json
{
  "total": "int",
  "items": [{
    "id": "string",
    "project_id": "string",
    "title": "string",
    "cover": "string",
    "address": "string",
    "area": "number",
    "price": "number",
    "layout": "string",
    "style": "string",
    "marketing_tags": ["string"],
    "view_count": "int",
    "rooms": "int",
    "bathrooms": "int",
    "tags": [{"text": "string", "type": "string"}],
    "published_at": "string"
  }]
}
```

#### 4.1.2 项目详情接口

```
GET /api/v1/mini/projects/{id}
```

**Response Schema**:
```json
{
  "id": "string",
  "project_id": "string",
  "title": "string",
  "price": "number",
  "area": "number",
  "layout": "string",
  "style": "string",
  "orientation": "string",
  "address": "string",
  "floor_info": "string",
  "description": "string",
  "marketing_tags": ["string"],
  "share_info": {
    "title": "string",
    "image": "string"
  },
  "tags": [{"text": "string", "type": "string"}],
  "images": ["string"],
  "consultant": {
    "name": "string",
    "role": "string",
    "avatar": "string",
    "rating": "string",
    "completed_projects": "int",
    "phone": "string",
    "wx_qr_code": "string"
  }
}
```

#### 4.1.3 项目改造进度接口

```
GET /api/v1/mini/projects/{id}/renovation
```

**Response Schema**:
```json
{
  "project_id": "string",
  "stages": [{
    "stage": "string",
    "title": "string",
    "completed": "boolean",
    "completed_at": "string",
    "description": "string",
    "images": ["string"]
  }],
  "progress": "number"
}
```

**说明**：images 数组通过 `origin_photo_id` 实时查询原项目照片表获取 URL。

#### 4.1.4 顾问咨询接口

```
POST /api/v1/mini/consultation
```

**Request Body**:
```json
{
  "project_id": "string",
  "consultant_id": "string",
  "user_name": "string",
  "user_phone": "string",
  "message": "string"
}
```

### 4.2 管理端接口 (Admin API)

#### 4.2.1 顾问管理

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/admin/consultants` | 顾问列表 |
| `POST` | `/admin/consultants` | 新增顾问 |
| `PUT` | `/admin/consultants/{id}` | 修改顾问 |
| `DELETE` | `/admin/consultants/{id}` | 删除顾问（软删除） |

#### 4.2.2 小程序项目管理

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/admin/mini-projects` | 项目列表（含未发布） |
| `POST` | `/admin/mini-projects` | 独立新建项目 |
| `GET` | `/admin/mini-projects/{id}` | 项目详情 |
| `PUT` | `/admin/mini-projects/{id}` | 更新项目信息 |
| `POST` | `/admin/mini-projects/sync` | **增量同步**（只创建新的） |
| `PUT` | `/admin/mini-projects/{id}/refresh` | **刷新硬字段**（重置面积/价格/地址等） |
| `PUT` | `/admin/mini-projects/{id}/publish` | 发布项目 |
| `PUT` | `/admin/mini-projects/{id}/unpublish` | 下架项目 |
| `DELETE` | `/admin/mini-projects/{id}` | 删除项目 |
| `GET` | `/admin/mini-projects/stats/sync` | 同步统计 |
| `GET` | `/admin/mini-projects/{id}/source-photos` | **获取素材库**（获取主项目所有照片） |
| `POST` | `/admin/mini-projects/{id}/photos` | 上传照片（独立项目直接存储，关联项目也可补充上传） |

---

## 五、后端改造计划

### 5.1 新增 C 端接口模块

```python
# routers/mini.py
from fastapi import APIRouter
from . import schemas, services

router = APIRouter(prefix="/mini", tags=["mini"])

@router.get("/projects", response_model=schemas.MiniProjectListResponse)
async def list_projects(status: str = None, page: int = 1, page_size: int = 20):
    """获取小程序项目列表（仅已发布项目）"""
    pass

@router.get("/projects/{project_id}", response_model=schemas.MiniProjectDetailResponse)
async def get_project_detail(project_id: str):
    """获取项目详情"""
    pass

@router.get("/projects/{project_id}/renovation", response_model=schemas.MiniRenovationResponse)
async def get_renovation_progress(project_id: str):
    """获取改造进度（照片通过 origin_photo_id 实时查询）"""
    pass

@router.post("/consultation", response_model=schemas.ConsultationResponse)
async def request_consultation(data: schemas.ConsultationRequest):
    """咨询顾问"""
    pass
```

### 5.2 新增后台小程序管理模块

```python
# routers/admin/mini_projects.py
from fastapi import APIRouter, UploadFile, File
from . import schemas, services

router = APIRouter(prefix="/admin/mini-projects", tags=["admin-mini-projects"])

@router.get("/")
async def list_mini_projects(search: str = None, is_published: bool = None, page: int = 1, page_size: int = 20):
    """小程序项目管理列表（包含未发布项目）"""
    pass

@router.post("/")
async def create_mini_project(data: schemas.MiniProjectCreate):
    """独立新建项目"""
    pass

@router.get("/{mini_project_id}")
async def get_mini_project(mini_project_id: str):
    """项目详情"""
    pass

@router.put("/{mini_project_id}")
async def update_mini_project(mini_project_id: str, data: schemas.MiniProjectUpdate):
    """更新项目信息"""
    pass

@router.post("/sync")
async def sync_projects():
    """增量同步：只创建新的，已存在的不操作"""
    result = await services.mini_project_sync.sync_projects_from_main()
    return result

@router.put("/{mini_project_id}/refresh")
async def refresh_project_basics(mini_project_id: str):
    """刷新硬字段：将主项目的硬字段强制覆盖到小程序项目
    可刷新字段：address, area, price, layout, orientation, floor_info
    保留字段：title, cover_image, style, description, marketing_tags, share_info, consultant_id
    """
    result = await services.mini_project_sync.refresh_basics(mini_project_id)
    return result

@router.put("/{mini_project_id}/publish")
async def publish_mini_project(mini_project_id: str):
    """发布项目"""
    pass

@router.put("/{mini_project_id}/unpublish")
async def unpublish_mini_project(mini_project_id: str):
    """下架项目"""
    pass

@router.delete("/{mini_project_id}")
async def delete_mini_project(mini_project_id: str):
    """删除项目"""
    pass

@router.get("/stats/sync")
async def get_sync_stats():
    """同步统计：显示已同步/未同步数量"""
    total_projects = await count_projects()
    synced_projects = await count_synced_projects()
    return {"total_projects": total_projects, "synced": synced_projects, "pending": total_projects - synced_projects}

@router.get("/{mini_project_id}/source-photos")
async def get_source_photos(mini_project_id: str):
    """获取素材库：获取主项目的所有照片（按阶段分类）"""
    mini_project = await get_mini_project(mini_project_id)
    if not mini_project.project_id:
        raise HTTPException(status_code=400, detail="独立项目无原项目照片")
    photos = await services.photo.get_project_photos(mini_project.project_id)
    return photos

@router.post("/{mini_project_id}/photos")
async def upload_photo(mini_project_id: str, file: UploadFile = File(...)):
    """上传照片（独立项目直接存储 URL，关联项目也可补充上传）"""
    image_url = await services.photo.upload_to_storage(file)
    await services.photo.create_photo(mini_project_id, image_url)
    return {"image_url": image_url}
```

### 5.3 手动同步服务

```python
# services/mini_project_sync.py
from sqlalchemy import select
from models import Project, MiniProject

REFRESHABLE_FIELDS = ['address', 'area', 'price', 'layout', 'orientation', 'floor_info']
PROTECTED_FIELDS = ['title', 'cover_image', 'style', 'description', 'marketing_tags', 'share_title', 'share_image', 'consultant_id']

async def sync_projects_from_main():
    """从主项目同步未同步的项目
    规则：只创建新的，已存在的不做任何操作
    """
    all_projects = await get_all_projects()
    existing_ids = await get_existing_project_ids()
    new_projects = [p for p in all_projects if p.id not in existing_ids]
    
    created = []
    for project in new_projects:
        mini_project = await create_mini_project_from_project(project)
        created.append(mini_project)
    
    return {"total": len(all_projects), "existing": len(existing_ids), "created": len(created)}

async def create_mini_project_from_project(project: Project) -> MiniProject:
    """从主项目创建小程序项目"""
    property = await get_property_by_community(project.community_name)
    
    mini_project = MiniProject(
        project_id=project.id,
        title=project.name,
        address=f"{project.community_name} {project.address}" if project.community_name else project.address,
        area=project.area,
        price=project.signing_price,
        layout=property.layout_display if property else None,
        orientation=property.orientation if property else None,
        tags=project.tags or [],
        is_published=False
    )
    
    await save(mini_project)
    return mini_project

async def refresh_basics(mini_id: str):
    """刷新硬字段（字段重置）"""
    mini_project = await get_mini_project(mini_id)
    if not mini_project.project_id:
        return {"message": "无关联主项目，无法刷新", "success": False}
    
    main_project = await get_main_project(mini_project.project_id)
    property_info = await get_property(main_project.community_name)
    
    # 仅更新可刷新字段
    for field in REFRESHABLE_FIELDS:
        if hasattr(main_project, field):
            setattr(mini_project, field, getattr(main_project, field))
        elif field == 'layout' and property_info:
            mini_project.layout = property_info.layout_display
        elif field == 'orientation' and property_info:
            mini_project.orientation = property_info.orientation
    
    mini_project.updated_at = datetime.utcnow()
    await save(mini_project)
    
    return {"message": "刷新成功", "success": True, "refreshed_fields": REFRESHABLE_FIELDS}
```

### 5.4 照片获取服务

```python
# services/photo.py

async def get_project_photos(mini_project_id: str):
    """获取项目照片（混用逻辑）"""
    photos = await get_photos_from_db(mini_project_id)
    result = []
    
    for photo in photos:
        if photo.image_url:
            # 上传的照片直接返回
            result.append({**photo.dict(), 'image_url': photo.image_url, 'source': 'upload'})
        elif photo.origin_photo_id:
            # 标记的照片实时查询原图
            original_url = await get_original_photo_url(photo.origin_photo_id)
            result.append({**photo.dict(), 'image_url': original_url, 'source': 'origin'})
        else:
            result.append({**photo.dict(), 'image_url': None, 'source': 'unknown'})
    
    return result

async def mark_photos(mini_project_id: str, origin_photo_ids: list[str], stage: str):
    """批量标记原项目照片到小程序项目"""
    for oid in origin_photo_ids:
        await create_mini_photo(mini_project_id, origin_photo_id=oid, renovation_stage=stage)

async def upload_and_create(mini_project_id: str, file: UploadFile, stage: str):
    """上传新照片并创建记录"""
    image_url = await upload_to_storage(file)
    await create_mini_photo(mini_project_id, image_url=image_url, renovation_stage=stage)
    return image_url
```

### 5.5 改造阶段配置

```python
# services/renovation.py

STAGE_CONFIG = {
    "拆除": {"title": "拆除", "description": "拆除原有非承重墙体，剔除老旧墙皮与地坪..."},
    "设计": {"title": "设计", "description": "专业设计团队根据需求定制装修方案..."},
    "水电": {"title": "水电", "description": "全屋水电管线重新铺设..."},
    "木瓦": {"title": "木瓦", "description": "吊顶龙骨精细架设，定制柜体基层制作..."},
    "油漆": {"title": "油漆", "description": "墙面经过多层腻子找平与打磨..."},
    "安装": {"title": "安装", "description": "灯具、开关面板及高端洁具安装调试完毕..."},
    "交付": {"title": "交付", "description": "完美交付，业主验收满意..."}
}

def calculate_progress(completed_stages: List[str]) -> int:
    """计算进度百分比"""
    total = len(STAGE_CONFIG)
    completed = len([s for s in completed_stages if s in STAGE_CONFIG])
    return int(completed / total * 100)
```

---

## 六、小程序改造计划

### 6.1 技术栈说明

| 层级 | 技术 | 版本 |
|-----|------|------|
| 前端框架 | Next.js | 16 |
| UI 组件库 | Shadcn/UI + Tailwind CSS | - |
| 状态管理 | nuqs | 2.8.5 |
| 拖拽排序 | @dnd-kit | latest |
| 表单库 | React Hook Form + Zod | - |
| HTTP 请求 | TanStack Query | latest |

### 6.2 API 层改造

```javascript
// utils/api.ts
import { get, post } from './request'

export const miniApi = {
  // C端接口
  getProjects(params = {}) {
    return get('/mini/projects', params)
  },
  
  getProjectDetail(id) {
    return get(`/mini/projects/${id}`)
  },
  
  getRenovationProgress(id) {
    return get(`/mini/projects/${id}/renovation`)
  },
  
  requestConsultation(data) {
    return post('/mini/consultation', data)
  }
}
```

### 6.3 页面字段映射

#### 6.3.1 首页

```typescript
// 后端返回 → 小程序展示
{
  id: item.id,
  title: item.title,
  cover: item.cover,
  address: item.address,
  area: item.area,
  price: item.price,
  layout: item.layout,
  style: item.style,
  marketing_tags: item.marketing_tags,
  view_count: item.view_count,
  rooms: parseInt(item.layout) || 0,
  bathrooms: parseInt(item.layout.match(/\d卫/)?.[0]) || 0,
  tags: item.tags
}
```

#### 6.3.2 详情页

```typescript
// 后端返回 → 小程序展示
{
  id: detail.id,
  title: detail.title,
  price: detail.price,
  area: detail.area,
  layout: detail.layout,
  style: detail.style,
  orientation: detail.orientation,
  address: detail.address,
  floor_info: detail.floor_info,
  description: detail.description,
  marketing_tags: detail.marketing_tags,
  share_info: detail.share_info,
  tags: detail.tags,
  images: detail.images,
  consultant: detail.consultant
}
```

#### 6.3.3 改造进度时间线

```typescript
// 后端 stages → timelineList
timelineList = response.stages.map(stage => ({
  stage: stage.stage,
  title: stage.title,
  date: formatDate(stage.completed_at),
  description: stage.description,
  completed: stage.completed,
  images: stage.images
}))
```

### 6.4 后台照片筛选器组件（重点）

使用 @dnd-kit 实现拖拽排序，nuqs 管理 URL 状态：

```typescript
// PhotoSelector.tsx
interface PhotoSelectorProps {
  miniProjectId: string
  projectId?: string  // 关联主项目 ID
}

export function PhotoSelector({ miniProjectId, projectId }: PhotoSelectorProps) {
  const [selectedPhotos, setSelectedPhotos] = useState<PhotoItem[]>([])
  
  // 左侧：主项目图库（如果有关联项目）
  const { data: sourcePhotos } = useQuery({
    queryKey: ['source-photos', projectId],
    queryFn: () => adminApi.getSourcePhotos(miniProjectId),
    enabled: !!projectId
  })
  
  // 右侧：已选照片（可拖拽排序）
  const { data: selectedPhotos } = useQuery({
    queryKey: ['mini-project-photos', miniProjectId],
    queryFn: () => adminApi.getPhotos(miniProjectId)
  })
  
  // 批量标记
  const handleBatchMark = (originIds: string[], stage: string) => {
    adminApi.markPhotos(miniProjectId, originIds, stage)
    queryClient.invalidateQueries(['mini-project-photos', miniProjectId])
  }
  
  // 拖拽排序（@dnd-kit）
  const handleDragEnd = async (event: DragEndEvent) => {
    // 更新 sort_order
    await adminApi.updatePhotoOrder(miniProjectId, newOrder)
  }
  
  return (
    <div className="photo-selector">
      {/* 左侧：素材库 */}
      <div className="source-gallery">
        {sourcePhotos?.map(photo => (
          <PhotoCard 
            key={photo.id}
            photo={photo}
            onSelect={() => handleBatchMark([photo.id], photo.stage)}
          />
        ))}
      </div>
      
      {/* 右侧：展示区（拖拽排序） */}
      <DndContext onDragEnd={handleDragEnd}>
        <SortableContext items={selectedPhotos}>
          {selectedPhotos?.map(photo => (
            <SortablePhotoCard key={photo.id} photo={photo} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
}
```

---

## 七、实施阶段划分

### 阶段一：数据库与基础服务（5 个工作日）

| 任务 | 工期 | 依赖 |
|-----|-----|-----|
| 建表：consultants, mini_projects v2, mini_project_photos | 1天 | - |
| 实现顾问管理 CRUD 接口 | 1天 | - |
| 实现"增量同步"与"字段刷新"双重逻辑 | 1天 | - |
| 实现 C 端列表与详情接口 | 1天 | - |
| 实现"照片素材库"读取接口（从主项目读取） | 1天 | - |

**交付物**：
- [ ] 数据库迁移脚本
- [ ] C 端接口文档
- [ ] 后台管理接口文档

### 阶段二：后台管理前端（5 个工作日）

| 任务 | 工期 | 依赖 |
|-----|-----|-----|
| 顾问管理页面（CRUD） | 1天 | 阶段一 |
| 项目列表页（同步按钮、发布/下架） | 1天 | 阶段一 |
| 项目编辑页（基础信息、SEO字段） | 1天 | 阶段一 |
| **照片筛选器组件**（左侧选 + 右侧拖拽排序） | 1.5天 | 阶段一 |
| 照片上传功能 | 0.5天 | 阶段一 |

### 阶段三：C 端小程序联调（4 个工作日）

| 任务 | 工期 | 依赖 |
|-----|-----|-----|
| C 端接入真实接口 | 1天 | 阶段一 |
| 调试 SEO 分享信息 | 0.5天 | C 端 |
| 改造进度时间线联调 | 1天 | 阶段一 |
| 咨询顾问功能联调 | 0.5天 | 阶段一 |

### 阶段四：测试与优化（2 个工作日）

| 任务 | 工期 | 依赖 |
|-----|-----|-----|
| 全链路测试 | 1天 | 各阶段 |
| Bug 修复与性能优化 | 1天 | 测试 |

---

## 八、风险与注意事项

### 8.1 安全风险

1. **接口认证**：C 端接口使用独立的认证机制
2. **敏感字段**：项目详情不返回财务数据（`total_income`, `total_expense`, `roi`, `internal_tags`）
3. **频率限制**：C 端接口添加请求频率限制
4. **隐私红线**：确认 C 端接口绝对没有返回主项目表中的敏感字段

### 8.2 数据一致性

1. **同步策略**：手动同步，只创建新的，已存在的不更新
2. **刷新保护**：点击"刷新"按钮时，确认营销标题、封面图等受保护字段不被覆盖
3. **删除保护**：删除小程序项目不影响主项目
4. **空值处理**：老项目可能缺少某些字段，需提供默认值
5. **无关联项目**：独立项目点击刷新时应提示"无关联数据源"

### 8.3 顾问离职处理

当顾问状态设为 `is_active=False` 时，C 端详情页应有兜底显示：
- 显示公司统一客服二维码
- 显示备用联系电话

### 8.4 照片管理

1. **原图删除**：主项目照片删除时检查是否被小程序引用
2. **混用场景**：同一项目支持标记照片和上传照片混用
3. **性能优化**：素材库接口应分页加载，避免一次返回大量照片

### 8.5 兼容性

1. **图片格式**：统一使用 URL 格式，支持 CDN
2. **分页方式**：列表使用 page + page_size 分页
3. **前端兼容**：Next.js 16 + nuqs 2.8.5 + @dnd-kit

---

## 九、验收标准

### 9.1 功能验收

- [ ] 后台手动同步功能正常，可将主项目同步到小程序管理列表
- [ ] 同步时只创建新项目，已存在的不做操作
- [ ] "刷新基础信息"功能正常，营销标题等受保护字段不被覆盖
- [ ] 小程序管理列表可执行完善、上架/下架操作
- [ ] 完善信息时能正确带出主项目数据
- [ ] 顾问管理 CRUD 正常，离职顾问有兜底显示
- [ ] 照片筛选器支持从主项目标记 + 直接上传混用
- [ ] 照片拖拽排序功能正常
- [ ] 小程序首页能正常展示已发布项目列表
- [ ] 点击项目能进入详情页
- [ ] 改造进度时间线正确展示
- [ ] 咨询顾问功能正常

### 9.2 性能验收

- [ ] 列表页面加载时间 < 1s
- [ ] 详情页面加载时间 < 1s
- [ ] 支持 100 并发请求
- [ ] 素材库分页加载正常

### 9.3 数据验收

- [ ] 小程序展示数据与后端一致
- [ ] 字段映射无遗漏、无错误
- [ ] 照片来源正确（标记/上传混用）
- [ ] 顾问信息关联正确

---

## 十、附录

### 10.1 术语对照表

| 术语 | 说明 |
|-----|------|
| Project (主项目) | 改造项目的业务数据表 |
| Property (房源) | 市场观测数据，采集自各平台 |
| MiniProject (小程序项目) | C 端展示用的项目 |
| Consultant (顾问) | 项目顾问，独立管理，可复用 |
| RenovationStage | 改造阶段：拆除/设计/水电/木瓦/油漆/安装/交付 |
| origin_photo_id | 标记来源主项目照片 ID |
| image_url | 直接上传的照片 URL |

### 10.2 接口路径对照表

| 功能 | 后台管理 | C端小程序 |
|-----|---------|----------|
| 项目列表 | /admin/mini-projects | /mini/projects |
| 项目详情 | /admin/mini-projects/{id} | /mini/projects/{id} |
| 独立新建 | /admin/mini-projects (POST) | - |
| 增量同步 | /admin/mini-projects/sync | - |
| 字段刷新 | /admin/mini-projects/{id}/refresh | - |
| 同步统计 | /admin/mini-projects/stats/sync | - |
| 素材库 | /admin/mini-projects/{id}/source-photos | - |
| 照片上传 | /admin/mini-projects/{id}/photos | - |
| 顾问管理 | /admin/consultants | - |
| 发布/下架 | /admin/mini-projects/{id}/publish | - |
| 改造进度 | - | /mini/projects/{id}/renovation |
| 咨询顾问 | - | /mini/consultation |

### 10.3 小程序字段与后端字段对照

| 小程序字段 | 后端字段 | 来源表 |
|-----------|---------|-------|
| id | id | mini_projects |
| project_id | project_id | mini_projects (关联) |
| title | title | mini_projects |
| cover | cover_image | mini_projects |
| address | address | mini_projects / projects |
| price | price | mini_projects / projects |
| area | area | mini_projects / projects |
| layout | layout | mini_projects / properties |
| orientation | orientation | mini_projects / properties |
| style | style | mini_projects |
| marketing_tags | marketing_tags | mini_projects |
| share_title | share_title | mini_projects |
| share_image | share_image | mini_projects |
| view_count | view_count | mini_projects |
| rooms | rooms | properties |
| bathrooms | baths | properties |
| tags | tags | projects |
| images | origin_photo_id / image_url | mini_project_photos |
| consultant | consultant_id | mini_projects → consultants |

### 10.4 前端技术栈速查

| 用途 | 技术 | 版本 |
|-----|------|------|
| 框架 | Next.js | 16 |
| UI 组件 | Shadcn/UI + Tailwind CSS | - |
| 状态管理 | nuqs | 2.8.5 |
| 拖拽排序 | @dnd-kit | latest |
| 表单验证 | React Hook Form + Zod | - |
| 数据请求 | TanStack Query | latest |
| HTTP 客户端 | fetch / axios | - |

### 10.5 刷新字段清单

**可刷新字段（会被主项目覆盖）**：
- `address` - 地址
- `area` - 面积
- `price` - 价格
- `layout` - 户型
- `orientation` - 朝向
- `floor_info` - 楼层信息

**受保护字段（不会被覆盖）**：
- `title` - 营销标题
- `cover_image` - 封面图
- `style` - 装修风格
- `description` - 项目描述
- `marketing_tags` - 营销标签
- `share_title` - 分享标题
- `share_image` - 分享图
- `consultant_id` - 顾问
