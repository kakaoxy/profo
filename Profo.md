
**版本**: 2.0
**日期**: 2025-11-15
**状态**: ✅ **最终版，可直接开发 (Final, Ready for Engineer)**
**面向**: 全栈工程师 (无项目前期背景)

---

### **1. 项目概述**

#### **1.1 项目定位**

**“个人房产数据仓库”**。

本项目旨在构建一个轻量级、本地化、高性能的房产数据中心。它允许用户通过标准化的 CSV 文件或 API 接口，将来自不同渠道的房源数据（包括在售与成交）汇集到统一的本地数据库中。系统提供数据清洗、校验、查询、筛选和导出的全流程功能。

#### **1.2 核心目标**

1.  **快速部署**: 工程师在 10 分钟内完成本地环境搭建与一键启动。
2.  **数据健壮性**: 建立严格的数据接收契约，保证入库数据的干净与完整，任何不合规数据都将被隔离记录，确保“零丢失”。
3.  **高性能查询**: 前端列表支持对海量数据（万条级别）进行流畅的虚拟滚动、多维度筛选和排序。
4.  **数据治理**: 提供后台工具，允许用户对来自多渠道的重复小区数据进行手动合并，持续提升数据质量。

#### **1.3 技术栈**

| 类别 | 技术 | 版本/工具 | 职责 |
| :--- | :--- | :--- | :--- |
| **后端** | Python | 3.10+ | 主要开发语言 |
| | FastAPI | ≥0.104 | Web 框架，提供 API 接口 |
| | SQLAlchemy | 2.0+ | ORM，与数据库交互 |
| | Pydantic | 2.5+ | 数据校验与模型定义 |
| | UV | - | Python 包管理器，替代 pip 和 venv |
| **前端** | Vue.js | 3.x | 核心框架 |
| | Vite | 5.x | 构建工具 |
| | TypeScript | 5.x | 提供类型安全 |
| | Pinia | 2.x | 状态管理 |
| | TailwindCSS | 3.x | UI 样式 |
| | pnpm | - | Node.js 包管理器 |
| **数据库**| SQLite | - | 本地文件数据库，无需额外安装服务 |

---

### **2. 系统架构与数据流**

#### **2.1 整体架构图**

本系统采用经典的前后端分离架构，职责清晰，易于维护。

```text
+------------------+          HTTP API 请求             +--------------------+
|                  | (GET /properties, POST /upload)     |                    |
|   前端 (Frontend)  +-----------------------------------> |  后端 (Backend)    |
| (Vue3, 运行于:3000)| <----------------------------------- | (FastAPI, 运行于:8000)|
|                  |    (JSON 数据 / CSV 文件流)           |                    |
+------------------+                                     +--------------------+
         ^                                                          |
         | 用户交互 (筛选、上传等)                                  | SQLAlchemy ORM
         |                                                          | (数据库操作)
+--------+---------+                                     +---------V----------+
|  用户的浏览器    |                                     | 数据库 (Database)  |
+------------------+                                     | (SQLite: data.db)  |
                                                         +--------------------+
```

#### **2.2 最终项目目录结构**

这是您将要开发的完整代码库结构。

```text
profo-real-estate/
├─ backend/                     # 后端代码
│  ├─ routers/                  # API 路由层
│  │  ├─ properties.py         # 房源查询与导出 API
│  │  ├─ upload.py             # CSV 上传 API
│  │  ├─ push.py               # JSON 推送 API
│  │  └─ admin.py              # 【新增】小区管理 API
│  ├─ services/                 # 业务逻辑服务层
│  │  ├─ importer.py           # 数据导入与处理核心逻辑
│  │  ├─ parser.py             # 楼层解析等工具函数
│  │  └─ merger.py             # 【新增】小区合并服务
│  ├─ main.py                   # FastAPI 应用入口
│  ├─ models.py                 # SQLAlchemy 数据表模型
│  ├─ schemas.py                # Pydantic 数据校验模型 (数据契约)
│  ├─ db.py                     # 数据库连接与初始化
│  ├─ settings.py               # 应用配置
│  ├─ pyproject.toml            # UV 依赖管理
│  └─ requirements.lock
├─ frontend/                    # 前端代码
│  ├─ src/
│  │  ├─ api/
│  │  │  └─ client.ts           # Axios API 客户端
│  │  ├─ components/
│  │  │  ├─ FileUpload.vue      # 文件上传组件
│  │  │  ├─ PropertyList.vue    # 房源虚拟滚动列表
│  │  │  ├─ ExportBtn.vue       # 导出按钮
│  │  │  ├─ PropertyDetailModal.vue # 【新增】房源详情弹窗
│  │  │  └─ CommunityMergeConsole.vue # 【新增】小区合并操作台
│  │  ├─ pages/ (或 views/)     # 页面级组件
│  │  │  ├─ HomeView.vue        # 主页
│  │  │  ├─ UploadView.vue      # 上传页
│  │  │  └─ AdminMergeView.vue    # 【新增】小区数据治理页
│  │  ├─ stores/
│  │  │  └─ property.ts         # Pinia 状态管理 (筛选、排序等)
│  │  ├─ router/
│  │  │  └─ index.ts            # Vue-Router 路由定义
│  │  ├─ main.ts                 # Vue 应用入口
│  │  └─ style.css
│  ├─ package.json              # pnpm 依赖管理
│  ├─ pnpm-lock.yaml
│  ├─ vite.config.ts
│  └─ tsconfig.json
├─ start.bat                     # Windows 一键启动脚本
├─ start.sh                      # macOS / Linux 一键启动脚本
└─ README.md                     # 简明安装运行说明
```

---

### **3. 核心业务流程**

#### **3.1 业务流程一：数据接收与入库**

此流程是系统的数据入口，确保所有进入的数据都经过标准化处理。

```mermaid
graph TD
    subgraph "数据来源"
        A[用户上传CSV文件] --> C{POST /api/upload/csv};
        B[外部系统推送JSON] --> D{POST /api/push};
    end

    subgraph "后端处理逻辑"
        C & D --> E[1. 使用 Pydantic 模型进行字段映射与严格校验];
        E --"校验失败"--> F[将原始数据行与错误原因写入 `failed_records` 表];
        E --"校验成功"--> G[2. 根据数据中的`小区名`查询 `communities` 表];
        
        G --"小区不存在"--> H[在 `communities` 表中创建新小区记录];
        H --> I[获取新生成的小区 community_id];
        G --"小区已存在"--> I[获取已有的小区 community_id];

        I --> J{3. 使用 (data_source, source_property_id) 查询 `property_current` 表};

        J --"房源已存在"--> K[a. 将数据库中当前房源的完整信息复制到 `property_history` 表作为快照];
        K --> L[b. 使用新数据更新 `property_current` 表中的价格、状态等动态字段];

        J --"房源不存在"--> M[a. 调用服务解析楼层字符串];
        M --> N[b. 计算智能楼层级别 (高/中/低)];
        N --> O[c. 使用新数据和获取的 community_id 在 `property_current` 表中创建一条全新记录];
    end

    subgraph "响应"
       F & L & O --> P[处理完成，向上游返回处理结果统计];
    end
```

#### **3.2 业务流程二：数据查询与导出**

此流程是系统的核心用户场景，提供强大的数据检索和导出功能。

```mermaid
graph TD
    subgraph "前端用户操作"
        A[用户在筛选区操作] --> B[切换状态(在售/成交)、拖动价格滑块等];
        B --> C[筛选条件更新到 Pinia store];
        C --"状态变更"--> D[useQuery 自动使用新条件请求 API];
    end

    subgraph "后端 API 响应"
        D --"GET /api/properties?params..."--> E[后端接口接收请求];
        E --> F[根据参数构建 SQLAlchemy 查询语句];
        F --> G[从数据库查询数据];
        G --> H[在返回前计算附加字段 (如单价、状态名)];
        H --> I[返回分页后的 JSON 数据];
    end
    
    subgraph "前端页面渲染"
         I --> J[PropertyList 组件使用虚拟滚动高效渲染列表];
    end

    subgraph "导出流程"
        K[用户点击 '导出' 按钮] --> L[从 Pinia 获取当前所有筛选和排序参数];
        L --"GET /api/properties/export?params..."--> M[调用导出 API，参数与查询完全一致];
        M --> N[后端复用查询逻辑，生成 CSV 文件流];
        N --> O[浏览器触发文件下载];
    end
```

#### **3.3 业务流程三：小区数据治理**

此流程是后台管理功能，用于提升数据质量。

1.  **查找**: 管理员在治理页面搜索相似的小区名（如 "XX小区", "XX家园"）。
2.  **选择**: 在搜索结果中，勾选多个疑似重复的小区记录。
3.  **指定主记录**: 在选中的记录中，指定一个作为标准名称（主记录）。
4.  **确认合并**: 系统弹窗提示操作后果（多少套房源将被影响等），管理员确认。
5.  **后端执行**:
    *   将被合并的小区名，作为别名存入 `community_aliases` 表，并关联到主记录。
    *   将被合并小区关联的所有房源，其 `community_id` 全部更新为主记录的 ID。
    *   软删除被合并的小区记录。

---

### **4. 前端详细设计**

#### **4.1 页面布局线框图**

**主页 (`/`) - 房源列表、筛选与导出**
```text
+----------------------------------------------------------------------------------------------------------+
| Profo 房产数据中心                                                 [ 主页 ] [ 上传 ] [ 数据治理 ]          |
+----------------------------------------------------------------------------------------------------------+
| [ 筛选区 Filters ]                                                                                       |
|                                                                                                          |
|  状态:   [[ 全部 ]]  [ 在售 ]  [ 成交 ]  (Pinia 状态驱动，点击后列表自动刷新)                                 |
|  小区名: [ "阳光都市"________________ ]                                                                    |
|  总价 (万):  0 o-------------------o 20000 (双滑块范围选择)                                                 |
|  面积 (㎡):  0 o-------------o 300                                                                         |
|  户型:  [ ✓ 2室, ✓ 3室, 4室, 5室+ ▼] (多选下拉框)                                                         |
|                                                                          +-----------------------------+ |
|                                                                          | [ 📥 导出当前视图为 CSV ]   | |
|                                                                          +-----------------------------+ |
+----------------------------------------------------------------------------------------------------------+
| [ 房源列表 PropertyList.vue - 由 @tanstack/vue-virtual 驱动 ]                                            |
+----------------------------------------------------------------------------------------------------------+
| | 状态 | 小区名     | 户型   | 朝向 | 楼层      | 面积(㎡)| 总价(万) | 单价(万/㎡) | 成交周期 | 详情     |   |
| +------+------------+--------+------+-----------+---------+----------+-------------+----------+----------+ |
| | 成交 | 理想国际   | 3室2厅 | 南北 | 高楼层/18 | 121.0   | 1080     | 8.93        | 56天     | [ 查看 ] | |
| | 在售 | 阳光都市   | 2室1厅 | 南   | 中楼层/28 | 89.5    | 750      | 8.38        | -        | [ 查看 ] | |
| | ...  | ...        | ...    | ...  | ...       | ...     | ...      | ...         | ...      | [ 查看 ] | |
| |      <------------------------- 这是一个虚拟滚动区域，可流畅展示万条数据 -------------------------->   | |
+------+------------+--------+------+-----------+---------+----------+-------------+----------+----------+ |
+----------------------------------------------------------------------------------------------------------+
| 页码: [ 1 ] 2 3 ... 150  |  共 7500 条记录                                                                |
+----------------------------------------------------------------------------------------------------------+
```

**详情查看模态框 (点击 `[ 查看 ]` 按钮后弹出)**
```text
+--------------------------------------------------------------------------+
|                      房源详情: 理想国际 - 3室2厅                       [X] |
|--------------------------------------------------------------------------|
|                                                                          |
|  [ 基础信息 ]                                                            |
|    数据来源: lianjia                  上游房源ID: BJ_HD_12345            |
|    物业类型: 住宅                     建筑年代: 2008                     |
|    建筑面积: 121.0 ㎡                 套内面积: 98.5 ㎡                  |
|    原始楼层: 高楼层/共18层              装修: 精装                         |
|                                                                          |
|  [ 价格与时间 ]                                                          |
|    状态:     成交                     成交总价: 1080 万                  |
|    挂牌总价: 1100 万                  成交日期: 2025-10-20               |
|    成交周期: 56 天                                                       |
|                                                                          |
|  ... (此处展示该房源的所有非空字段)                                      |
|                                                                          |
+--------------------------------------------------------------------------+
```

**上传页 (`/upload`)**
```text
+--------------------------------------------------------------------------------------------------+
| Profo 房产数据中心                                                 [ 主页 ] [ 上传 ] [ 数据治理 ]          |
+--------------------------------------------------------------------------------------------------+
| [ 文件上传 FileUpload.vue ]                                                                      |
|                           +----------------------------------------------+                       |
|                           |                                              |                       |
|                           |   将 CSV 文件拖拽至此区域                      |                       |
|                           |   或                                         |                       |
|                           |   [ 点击选择文件 ]                           |                       |
|                           |                                              |                       |
|                           +----------------------------------------------+                       |
|                                                                                                  |
|   <!-- 上传中 -->                                                                                |
|   上传 `my_data.csv`... [========================>      ] 75%                                   |
|                                                                                                  |
|   <!-- 上传完成 -->                                                                              |
|   ✔︎ 上传完成. 总计: 1000, 成功: 998, 失败: 2. [ 下载失败记录.csv ]                             |
|                                                                                                  |
+--------------------------------------------------------------------------------------------------+
```
**小区数据治理页 (`/admin/community-merge`)**
```text
+----------------------------------------------------------------------------------------------------------+
| Profo 房产数据中心                                                 [ 主页 ] [ 上传 ] [ 数据治理 ]          |
+----------------------------------------------------------------------------------------------------------+
| [ 小区数据治理 ]                                                                                         |
+----------------------------------------------------------------------------------------------------------+
| [ 左侧: 待合并小区列表 ]                                 | [ 右侧: 合并操作台 ]                                |
|----------------------------------------------------------|--------------------------------------------------|
| 搜索小区名: [ "理想国际"_______________ ] [ 🔍 搜索 ]     | 请从左侧列表选择 2 个或以上的小区进行合并。        |
|                                                          |                                                  |
| |   | 小区名 (ID)         | 房源数 |                   | [ 已选择的小区 (等待指定主记录) ]                |
| +---+---------------------+--------+                   |                                                  |
| | ✓ | 理想国际 (ID: 15)   | 120    |                   | +------------------------------------------------+ |
| |   | 阳光都市 (ID: 21)   | 98     |                   | | (*) 理想国际 (ID: 15) - 120套房源            | |
| | ✓ | 理想国际大厦 (ID:88)| 8      |                   | | ( ) 理想国际大厦 (ID: 88) - 8套房源          | |
| |   | 世纪嘉园 (ID: 33)   | 75     |                   | +------------------------------------------------+ |
|                                                          |   (*) 代表将作为主记录保留                       |
|                                                          |                                                  |
|                                                          |  [ ⚠️ 确认合并 ] (选择主记录后激活)             |
+----------------------------------------------------------------------------------------------------------+
```

---

### **5. 后端详细设计**

#### **5.1 核心数据契约：统一输入模型**

这是系统数据质量的守门员。所有入口数据都必须通过此 Pydantic 模型的校验。

```python
# 文件位置: backend/schemas.py
import enum
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, root_validator

class IngestionStatus(str, enum.Enum):
    FOR_SALE = "在售"
    SOLD = "成交"

class PropertyIngestionModel(BaseModel):
    # --- 核心唯一标识 (始终必填) ---
    data_source: str = Field(..., alias="数据源")
    source_property_id: str = Field(..., alias="房源ID")

    # --- 核心业务字段 (始终必填) ---
    status: IngestionStatus = Field(..., alias="状态")
    community_name: str = Field(..., alias="小区名")
    rooms: int = Field(..., ge=0, alias="室")
    orientation: str = Field(..., alias="朝向")
    floor_original: str = Field(..., alias="楼层")
    build_area: float = Field(..., gt=0, alias="面积")

    # --- 动态必填字段 (根据 'status' 决定) ---
    listed_price_wan: Optional[float] = Field(None, gt=0, alias="挂牌价(万)")
    sold_price_wan: Optional[float] = Field(None, gt=0, alias="成交价(万)")
    listed_date: Optional[datetime] = Field(None, alias="上架时间")
    sold_date: Optional[datetime] = Field(None, alias="成交时间")

    # --- 其他沿用的非必填字段 ---
    halls: int = Field(0, ge=0, alias="厅")
    baths: int = Field(0, ge=0, alias="卫")
    # ... 其他可选字段

    # --- 核心校验逻辑：动态验证 ---
    @root_validator
    def validate_fields_based_on_status(cls, values):
        status = values.get('status')
        if not status:
            return values

        if status == IngestionStatus.FOR_SALE:
            if values.get('listed_price_wan') is None:
                raise ValueError("当状态为'在售'时, '挂牌价(万)' 不能为空")
            if values.get('listed_date') is None:
                raise ValueError("当状态为'在售'时, '上架时间' 不能为空")
        elif status == IngestionStatus.SOLD:
            if values.get('sold_price_wan') is None:
                raise ValueError("当状态为'成交'时, '成交价(万)' 不能为空")
            if values.get('sold_date') is None:
                raise ValueError("当状态为'成交'时, '成交时间' 不能为空")
        return values

class Config:
    anystr_strip_whitespace = True # 自动去除字符串两端空格
```

#### **5.2 数据库模型**

数据库表结构定义在 `backend/models.py` 中，**请直接使用原始 PRD v4.0 中提供的完整代码**。核心表包括：`Community`, `CommunityAlias`, `Property`, `PropertyHistory`, `PropertyMedia`, `FailedRecord`。

```python

# backend/models.py

from sqlalchemy import (

    Column, Integer, String, Float, DateTime, Text, Boolean, UniqueConstraint, Index, ForeignKey

)

from sqlalchemy.orm import declarative_base, sessionmaker

from pathlib import Path

import enum

  

Base = declarative_base()

  

# 通用枚举

class BusinessType(str, enum.Enum):

    buy = "buy"

    # rent = "rent"  # 预留

  

class Status(str, enum.Enum):

    active = "active"

    inactive = "inactive"

  

class ChangeType(str, enum.Enum):

    price_change = "price_change"

    status_change = "status_change"

    info_change = "info_change"

  

class MediaType(str, enum.Enum):

    layout = "layout"

    indoor = "indoor"

  

# ---------------- 1. 小区字典 ----------------

class Community(Base):

    """communities 小区字典"""

    __tablename__ = "communities"

    id = Column(Integer, primary_key=True, autoincrement=True,

                comment="小区标准ID（系统自增，唯一标识）")

    city_id = Column(Integer, nullable=False,

                     comment="城市ID（关联城市字典表，用于城市级统计）")

    name = Column(String, nullable=False, unique=True,

                  comment="标准化小区名（统一命名，消除别名差异）")

    district = Column(String, nullable=False,

                      comment="行政区（如\"海淀区\"，统计用）")

    business_circle = Column(String,

                             comment="商圈（如\"中关村\"，精准定位板块）")

    address = Column(String,

                     comment="详细地址（原始地址，用于展示）")

    latitude = Column(Float,

                      comment="纬度（地图组件用，可为NULL）")

    longitude = Column(Float,

                       comment="经度（地图组件用，可为NULL）")

    total_buildings = Column(Integer, default=0,

                             comment="楼栋总数（自动统计或人工维护）")

    total_households = Column(Integer, default=0,

                              comment="总户数（自动统计或人工维护）")

    property_company = Column(String,

                                comment="物业公司名称（展示用）")

    green_rate = Column(Float,

                        comment="绿化率（0-1，如0.35表示35%）")

    avg_price_wan = Column(Float,

                           comment="小区均价（万元/平，计算逻辑待定）")

    total_properties = Column(Integer, default=0,

                              comment="当前在售房源数（实时统计）")

    status = Column(String, default=Status.active,

                    comment="active（正常）/inactive（已禁用）")

    created_at = Column(DateTime, server_default="now()",

                        comment="小区首次入库时间")

    updated_at = Column(DateTime, server_default="now()",

                        comment="最后更新时间")

    created_by = Column(Integer,

                        comment="创建人ID（现在为NULL，后期填user_id）")

  

# ---------------- 2. 小区别名映射 ----------------

class CommunityAlias(Base):

    """community_aliases 小区别名映射"""

    __tablename__ = "community_aliases"

    id = Column(Integer, primary_key=True, autoincrement=True,

                comment="别名记录ID")

    community_id = Column(Integer, ForeignKey("communities.id"), nullable=False,

                          comment="关联的标准小区ID（外键）")

    alias_name = Column(String, nullable=False,

                        comment="别名（如\"中关村大街住宅小区\"）")

    data_source = Column(String, nullable=False,

                         comment="该别名来自哪个平台（beike/lianjia）")

    created_at = Column(DateTime, server_default="now()",

                        comment="别名首次出现时间")

    __table_args__ = (UniqueConstraint("alias_name", "data_source"), )

  

# ---------------- 3. 房源当前状态 ----------------

class Property(Base):

    """property_current 房源当前状态（买卖核心）"""

    __tablename__ = "property_current"

    id = Column(Integer, primary_key=True, autoincrement=True,

                comment="房源内部ID（自增）")

    source_property_id = Column(String, nullable=False,

                                comment="上游房源ID（平台内唯一，如\"BJ_HD_12345\"）")

    data_source = Column(String, nullable=False,

                         comment="数据来源平台（beike/lianjia/58）")

    business_type = Column(String, default=BusinessType.buy, nullable=False,

                           comment="业务类型（buy=买卖，预留rent=租赁）")

    community_id = Column(Integer, ForeignKey("communities.id"),

                          comment="所属小区ID（关联communities表）")

    source_id = Column(Integer,

                       comment="平台内部ID（备用字段）")

    rooms = Column(Integer, default=0, nullable=False,

                   comment="室数量（0表示开间，用于筛选）")

    halls = Column(Integer, default=0, nullable=False,

                   comment="厅数量（0表示无厅）")

    baths = Column(Integer, default=0, nullable=False,

                   comment="卫数量（0表示无卫）")

    build_area = Column(Float, nullable=False,

                        comment="建筑面积（平米，核心筛选条件）")

    usable_area = Column(Float,

                         comment="套内面积（平米，可选，用于得房率计算）")

    orientation = Column(String,

                         comment="朝向（南/北/东/西/南北，影响采光估值）")

    floor_original = Column(String,

                            comment="原始楼层字符串（保留上游原始值，用于展示）")

    floor_number = Column(Integer,

                          comment="解析出的楼层数字（如15层，用于计算floor_level）")

    total_floors = Column(Integer,

                          comment="总层高（如28层，用于计算floor_level）")

    floor_level = Column(String,

                         comment="智能级别（低楼层/中楼层/高楼层，自动计算）")

    build_year = Column(Integer,

                        comment="建筑年代（如2005，房龄=当前年份-build_year）")

    property_type = Column(String, default="住宅",

                           comment="物业类型（住宅/公寓/别墅/商铺，影响贷款政策）")

    renovation_status = Column(String,

                               comment="装修状态（毛坯/简装/精装/豪装，影响议价空间）")

    listed_price_wan = Column(Float,

                              comment="挂牌总价（万元，核心指标，精确到小数点后2位）")

    listed_date = Column(DateTime,

                         comment="挂牌时间（计算成交周期的起点）")

    sold_price_wan = Column(Float,

                            comment="成交总价（万元，成交后回填）")

    sold_date = Column(DateTime,

                       comment="成交时间（成交后回填）")

    transaction_duration_days = Column(Integer,

                                       comment="成交周期（天，=sold_date - listed_date）")

    online_signed_price_wan = Column(Float,

                                     comment="网签价（万元，用于税费计算）")

    transaction_type = Column(String,

                              comment="交易类型（全款/商贷/公积金/组合贷，影响首付比例）")

    rent_price_monthly = Column(Float,

                                comment="月租金（元，可选，用于计算租售比）")

    url = Column(String,

                 comment="房源链接（原始链接，用于跳转验证）")

    layout_url = Column(String,

                        comment="户型图链接（短期过渡字段，后期迁移到property_media）")

    tags = Column(String,

                  comment="房源标签（逗号分隔，如\"满五唯一,近地铁,急售\"）")

    mortgage_info = Column(String,

                           comment="抵押信息（如有抵押，用于风险提示）")

    extra_info = Column(String,

                        comment="JSON字符串（存储平台特有字段，如\"梯户比\":\"2梯4户\"）")

    created_at = Column(DateTime, server_default="now()",

                        comment="房源首次入库时间")

    updated_at = Column(DateTime, server_default="now()",

                        comment="最后更新时间（价格变化或状态变化时刷新）")

    owner_id = Column(Integer,

                      comment="数据归属用户ID（现在为NULL，后期登录后填充）")

    visibility = Column(String, default="public",

                        comment="可见性（public=公开/private=私有/team=团队共享）")

    is_active = Column(Boolean, default=True,

                       comment="软删除标记（True=有效/False=已删除，物理不删除）")

    __table_args__ = (UniqueConstraint("data_source", "source_property_id"),

                      Index("idx_community_price", "community_id", "listed_price_wan"),

                      Index("idx_owner_visibility", "owner_id", "visibility"), )

  

# ---------------- 4. 房源历史快照 ----------------

class PropertyHistory(Base):

    """property_history 历史快照（价格与状态变更）"""

    __tablename__ = "property_history"

    id = Column(Integer, primary_key=True, autoincrement=True,

                comment="历史记录ID")

    source_property_id = Column(String, nullable=False,

                                comment="上游房源ID（关联property_current）")

    data_source = Column(String, nullable=False,

                         comment="数据来源平台")

    business_type = Column(String, default=BusinessType.buy, nullable=False,

                           comment="业务类型（当前仅buy）")

    change_type = Column(String, nullable=False,

                         comment="变更类型（price_change=价格变/status_change=状态变/info_change=信息变）")

    listed_price_wan = Column(Float,

                              comment="当时的挂牌价")

    sold_price_wan = Column(Float,

                            comment="当时的成交价（如已成交）")

    status = Column(String,

                    comment="当时的状态（for_sale/sold/withdrawn）")

    captured_at = Column(DateTime, nullable=False,

                         comment="快照生成时间（精确到秒）")

    change_reason = Column(String,

                           comment="变更原因（用户调价/自动下架/成交）")

    __table_args__ = (Index("idx_history_lookup", "data_source", "source_property_id", "captured_at DESC"), )

  

# ---------------- 5. 媒体资源 ----------------

class PropertyMedia(Base):

    """property_media 房源媒体资源"""

    __tablename__ = "property_media"

    id = Column(Integer, primary_key=True, autoincrement=True,

                comment="媒体资源ID")

    source_property_id = Column(String, nullable=False,

                                comment="上游房源ID")

    data_source = Column(String, nullable=False,

                         comment="数据来源平台")

    media_type = Column(String, nullable=False,

                        comment="媒体类型（layout=户型图/indoor=室内图）")

    url = Column(String, nullable=False,

                 comment="图片URL（原始链接）")

    sort_order = Column(Integer, default=0,

                        comment="排序权重（越小越靠前）")

    created_at = Column(DateTime, server_default="now()",

                        comment="入库时间")

    __table_args__ = (UniqueConstraint("data_source", "source_property_id", "url"),

                      Index("idx_property_media", "source_property_id", "data_source", "media_type"), )

  

# ---------------- 6. 失败收容所 ----------------

class FailedRecord(Base):

    """failed_records 失败收容所（零丢失保障）"""

    __tablename__ = "failed_records"

    id = Column(Integer, primary_key=True, autoincrement=True,

                comment="失败记录ID")

    data_source = Column(String,

                         comment="数据来源（便于归类）")

    payload = Column(Text, nullable=False,

                     comment="原始数据全文（JSON或CSV行，用于人工复盘）")

    failure_type = Column(String, nullable=False,

                          comment="失败类型（validation_error=验证失败/parse_error=解析失败/db_error=数据库错误）")

    failure_reason = Column(String, nullable=False,

                            comment="详细错误信息（如\"必填字段缺失: build_area\"）")

    occurred_at = Column(DateTime, nullable=False,

                         comment="失败发生时间")

    is_handled = Column(Boolean, default=False,

                        comment="是否已人工处理（False=待处理/True=已处理）")

    __table_args__ = (Index("idx_unhandled", "data_source", "is_handled", "occurred_at"), )

  
  

# ============== 数据库初始化 ==============

def create_all():

    from sqlalchemy import create_engine

    DB_FILE = Path(__file__).parent / "data.db"

    engine = create_engine(f"sqlite:///{DB_FILE}?check_same_thread=False", echo=False)

    Base.metadata.create_all(bind=engine)

    return engine

```

  



#### **5.3 API 接口清单**

| 路由 | 方法 | 功能描述 |
| :--- | :--- | :--- |
| `/api/upload/csv` | POST | 上传 CSV 文件，异步处理。 |
| `/api/push` | POST | 接收房源 JSON 数组，同步处理。 |
| `/api/properties` | GET | 查询房源列表，支持状态、价格、面积等多维度筛选、排序和分页。 |
| `/api/properties/export` | GET | 导出与查询条件一致的 CSV 文件。 |
| `/api/admin/communities`| GET | 获取小区列表，用于治理页面。 |
| `/api/admin/communities/merge` | POST | **(新增)** 执行小区合并操作。 |

---

### **6. 部署与启动**

#### **6.1 环境准备**

1.  确保已安装 Python 3.10+, Node.js (LTS), และ pnpm。
2.  安装 `uv`：`pip install uv`。
3.  **安装后端依赖**: 在项目根目录执行 `uv sync --python=3.10` (根据你的Python版本)。
4.  **安装前端依赖**: 在项目根目录执行 `pnpm install`。

#### **6.2 一键启动脚本**

项目根目录提供了 `start.bat` (Windows) 和 `start.sh` (macOS/Linux) 脚本。

**`start.sh` 示例:**
```bash
#!/bin/bash
echo "正在启动 Profo 房产数据中心..."
# 捕捉 Ctrl+C 信号，并结束所有后台任务
trap "echo '正在停止所有服务...'; pkill -f 'uv run main.py'; pkill -f 'pnpm dev'; exit 0" INT

echo "[1/2] 正在启动后端服务..."
(cd backend && uv run main.py) &

echo "[2/2] 正在启动前端服务..."
(cd frontend && pnpm dev) &

echo "==========================="
echo "后端 (FastAPI) 运行于 http://localhost:8000"
echo "前端 (Vue)    运行于 http://localhost:3000"
echo "按 Ctrl+C 停止所有服务"
echo "==========================="

# 等待所有后台进程结束
wait
```
双击或在终端运行相应脚本，即可同时启动前后端开发服务器。

---

这份文档是您开发 Profo v4.0 项目的起点和指南。祝您开发顺利！