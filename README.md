
---
### **房源信息管理后台项目 - 需求规格说明书 (PRD)**

- **文档版本**: 1.0
- **创建日期**: 2025年6月24日
- **目标读者**: 全栈开发者

---

### 1. 项目引言

#### 1.1 项目背景

当前，在房产市场调研过程中，信息来源多样化，包括但不限于：城市级的每日交易公告、各大中介平台的挂牌与成交数据、线下中介提供的小区数据、以及个人实地看房的笔记。这些数据分散、格式不一，难以进行统一的管理、关联和分析。为了解决这一痛痛点，特开发此项目。

#### 1.2 项目目标

本项目旨在打造一个个人专属的房源信息管理后台，实现以下核心目标：

- **数据集中化**: 将来自API、CSV、手动输入等多种渠道的房产数据统一存储和管理。
- **数据结构化**: 将非结构化的信息（如个人笔记）转化为结构化数据，便于查询和分析。
- **可视化分析**: 通过图表和看板，直观展示市场趋势、小区热度及个人看房组合。
- **高效管理**: 提供便捷的界面，对海量房源数据进行高效的增、删、改、查操作。
- **辅助决策**: 通过对数据的关联和分析，为个人房产投资或购买决策提供数据支持。

#### 1.3 目标用户

对房产市场有深度研究需求、希望通过数据分析进行决策的个人用户（项目发起人本人）。

#### 1.4 技术栈

- **后端**: Python + FastAPI
- **前端**: Vue.js (v3) + Tailwind CSS
- **数据库**: PostgreSQL
- **核心依赖建议**:
    - 后端: SQLAlchemy (ORM), Alembic (数据库迁移), Pydantic (数据校验), Pandas (CSV处理), Celery (可选, 用于异步任务)。
    - 前端: Vite (构建工具), Pinia (状态管理), Vue Router (路由), Axios (HTTP请求), ECharts/Chart.js (图表库)。

---

### 2. 功能性需求 (Functional Requirements)

#### 2.1 模块一：数据看板 (Dashboard)

作为系统的首页，提供关键信息概览。

- **FR-1.1**: **核心指标展示**: 在页面顶部以卡片形式展示“昨日上海新房成交套数”、“昨日上海二手房成交套数”等关键宏观指标。
- **FR-1.2**: **交易趋势图**: 以折线图形式展示最近30天内，上海新房与二手房的每日成交套数走势。
- **FR-1.3**: **近期动态**: 展示最近新增的5条房源记录和5条个人看房笔记的快捷入口。

#### 2.2 模块二：数据导入 (Data Import)

提供统一的页面，支持多种数据源的导入。

- **FR-2.1**: **CSV导入**:
    - 提供文件上传组件，允许用户上传房源信息CSV文件。
    - 提供CSV模板下载链接，规范用户上传的格式。
    - 后端使用Pandas解析文件，进行数据校验后批量入库。
    - 导入后向前端反馈结果，如“成功导入98条，失败2条（附失败原因）”。
- **FR-2.2**: **API同步**:
    - 提供一个“同步外部数据”按钮。
    - 点击后，后端执行预设的API调用脚本（建议使用后台任务），从外部接口拉取数据（如每日成交数据）。
    - 前端显示“同步中...”状态，任务完成后提示“同步完成”。
- **FR-2.3**: **手动录入**: 提供一个表单，用于手动录入单条房源信息或小区统计数据。

#### 2.3 模块三：房源管理 (Property Management)

系统的核心功能，以强大的数据表格形式展示所有房源。

- **FR-3.1**: **列表展示**: 分页展示`properties`表中的所有房源，默认按更新时间倒序。表格列应清晰展示关键信息（小区、户型、面积、总价、状态等）。
- **FR-3.2**: **复合搜索与筛选**: 提供搜索框和筛选条件，支持：
    - 按小区名称模糊搜索。
    - 按房源状态（在售、已成交、个人记录）筛选。
    - 按价格区间、面积区间进行筛选。
- **FR-3.3**: **CRUD操作**:
    - **Create**: “新增房源”按钮，弹出表单模态框进行添加。
    - **Read**: 点击某一行可跳转至房源详情页或展开显示更多信息。
    - **Update**: 每行提供“编辑”按钮，弹出与新增一致的表单进行修改。
    - **Delete**: 每行提供“删除”按钮，二次确认后删除。

#### 2.4 模块四：小区分析 (Community Analysis)

用于展示和对比不同小区的统计数据。

- **FR-4.1**: **小区列表**: 以表格形式展示`community_stats`表的数据，包含小区名称、均价、近期带看、近期成交等。
- **FR-4.2**: **历史趋势**: 点击某个小区，可进入详情页，以图表形式展示该小区统计指标（如均价、带看量）的历史变化趋势。

#### 2.5 模块五：个人看房管理 (My Viewings)

管理所有个人看房笔记。

- **FR-5.1**: **笔记列表**: 以卡片或列表形式，展示`my_viewings`表中的所有记录，突出显示小区、户型、看房日期、我的评分和预期价格。
- **FR-5.2**: **新增/编辑笔记**: 提供表单用于创建或修改看房笔记。表单中：
    - “关联房源”字段应能搜索并选择`properties`表中的房源。
    - “带看经纪人”字段应能搜索并选择`agents`表中的经纪人。
    - 包含看房时间、评分、预期价格、优缺点等所有笔记字段。

#### 2.6 模块六：基础数据管理 (Admin)

用于管理系统中的一些基础实体，优先级可稍后。

- **FR-6.1**: 提供简单的CRUD界面，用于管理`cities`, `agencies`, `agents`表中的数据。

---

#### 2.7 模块7：用户认证 (User Authentication)

- **FR-7.1: 账号密码注册与登录**:
    
    - 提供注册页面，用户可以通过“用户名 + 密码”创建账户。
    - 提供登录页面，用户可以使用“用户名 + 密码”登录系统。
    - 后端在接收到密码后，**必须**进行哈希加密（例如使用`passlib`库）后才能存入数据库，**严禁明文存储密码**。
    - 登录成功后，后端应返回一个JWT (JSON Web Token)给前端，前端在后续的API请求中携带此Token进行身份验证。
- **FR-7.2: 微信小程序登录**:
    
    - **登录流程**:
        1. 小程序端调用`wx.login()`获取临时`code`。
        2. 小程序将`code`发送给后端API。
        3. 后端接收到`code`后，调用微信`auth.code2Session`接口，换取用户的`openid`和`unionid`。
        4. 后端根据`unionid`（优先）或`openid`查询`users`表。
        5. **若用户存在**：登录成功，生成并返回JWT。
        6. **若用户不存在**：此为新用户，后端在`users`表中自动创建一个新用户记录，保存`openid`和`unionid`，然后生成并返回JWT。
    - **目的**: 实现用户无感知的静默登录。

### 3. 非功能性需求 (Non-Functional Requirements)

- **NF-1**: **性能**: API接口响应时间应在200ms以内，页面加载迅速，大数据量表格操作流畅。
- **NF-2**: **易用性**: 界面设计简洁、直观，交互逻辑符合常规后台系统操作习惯。
- **NF-3**: **安全性**: 系统应有基础的用户登录认证机制，保护数据隐私。
- **NF-4**: **可靠性**: 数据导入和更新操作应有事务支持，保证数据的一致性和准确性。

---

### 4. 数据模型与数据库设计 (V3.0)

这是整个项目的核心基石，所有开发都应严格遵循此设计。

- **`cities` (城市表)**: `id`, `name`
- **`agencies` (中介公司表)**: `id`, `name`
- **`agents` (经纪人表)**: `id`, `agency_id`, `name`, `phone`
- **`communities` (小区表)**: `id`, `city_id`, `name`, `district`, `business_circle`, `address`
- **`daily_city_stats` (城市每日成交统计表)**: `id`, `city_id`, `record_date`, `new_deal_units`, `new_deal_area`, `secondhand_deal_units`, `secondhand_deal_area`, `secondhand_deal_total_price`
- **`community_stats` (小区周期统计表)**: `id`, `community_id`, `record_date`, `avg_price_per_sqm`, `active_listings_count`, `deals_in_last_90_days`, `showings_in_last_30_days`, `source_agency_id`
- **`properties` (房源主表)**: `id`, `community_id`, `status`, `source_property_id`, `layout_bedrooms`, `layout_living_rooms`, `layout_bathrooms`, `area_sqm`, `orientation`, `floor_level`, `total_floors`, `build_year`, `listing_price_wan`, `listing_date`, `deal_price_wan`, `deal_date`, `deal_cycle_days`, `source_url`, `image_url`, `mortgage_info`, `tags`, `details_json`
- **`my_viewings` (我的看房笔记表)**: `id`, `property_id`, `agent_id`, `viewing_date`, `expected_purchase_price_wan`, `rating`, `notes_general`, `notes_pros`, `notes_cons`

_(详细字段说明请参考我们之前的讨论记录)_

---

### 5. 开发与部署建议

- **开发流程**:
    1. 严格遵循“数据库优先”原则。首先使用SQLAlchemy和Alembic完成所有数据模型的代码定义和数据库的首次迁移。
    2. 基于数据模型，定义好所有Pydantic Schemas，作为前后端的“接口契约”。
    3. 后端优先开发API接口，并利用FastAPI自带的Swagger文档进行充分测试。
    4. 前端根据API契约进行页面开发，初期可使用mock数据，待后端接口完成后进行联调。
- **部署方案**:
    - 强烈建议使用 **Docker** 和 **Docker Compose** 进行部署。
    - 创建一个`docker-compose.yml`文件，编排三个服务：
        1. **`frontend`**: 基于Node环境构建Vue应用，并由Nginx提供服务。
        2. **`backend`**: 基于Python环境运行FastAPI应用。
        3. **`db`**: 直接使用官方的PostgreSQL镜像，并配置数据卷进行持久化存储。
    - 通过此方案，整个项目可以实现一键启动和部署，极大简化了环境配置的复杂性。


---

### **6. 数据模型与数据库设计 (V3.1 - 详细字段版)**

本章节详细定义了项目所需的所有数据表的结构。开发者应严格按照此设计创建SQLAlchemy模型及Alembic数据库迁移脚本。

**通用约定**:

- 所有表建议使用`InnoDB`引擎（如使用MySQL）并采用`utf8mb4`字符集。
- 为便于追踪，大部分表都添加了`created_at`和`updated_at`字段，用于记录创建和最后更新时间。

---

#### **表1: `cities` (城市表)**

**用途**: 存储城市基本信息。

|   |   |   |   |
|---|---|---|---|
|**字段名**|**数据类型**|**示例**|**说明**|
|`id`|`SERIAL PRIMARY KEY`|`1`|唯一主键，自增。|
|`name`|`VARCHAR(100)`|`'上海'`|城市名称，需建立唯一索引。|

---

#### **表2: `agencies` (中介公司表)**

**用途**: 存储中介公司信息。

|   |   |   |   |
|---|---|---|---|
|**字段名**|**数据类型**|**示例**|**说明**|
|`id`|`SERIAL PRIMARY KEY`|`1`|唯一主键，自增。|
|`name`|`VARCHAR(255)`|`'链家'`|公司名称，需建立唯一索引。|

---

#### **表3: `agents` (经纪人表)**

**用途**: 存储带看经纪人的核心信息。

|   |   |   |   |
|---|---|---|---|
|**字段名**|**数据类型**|**示例**|**说明**|
|`id`|`SERIAL PRIMARY KEY`|`1`|经纪人唯一ID，自增。|
|`agency_id`|`INTEGER`|`1`|外键，关联到`agencies.id`，表示所属公司。|
|`name`|`VARCHAR(100)`|`'张三'`|经纪人姓名。|
|`phone`|`VARCHAR(50)`|`'13812345678'`|联系电话，可为空。|
|`created_at`|`TIMESTAMPTZ`|`NOW()`|记录创建时间。|
|`updated_at`|`TIMESTAMPTZ`|`NOW()`|记录最后更新时间。|

---

#### **表4: `communities` (小区表)**

**用途**: 存储小区的静态、核心信息。

|   |   |   |   |
|---|---|---|---|
|**字段名**|**数据类型**|**示例**|**说明**|
|`id`|`SERIAL PRIMARY KEY`|`1`|小区唯一ID，自增。|
|`city_id`|`INTEGER`|`1`|外键，关联到`cities.id`。|
|`name`|`VARCHAR(255)`|`'汇成一村'`|小区名称。建议对`(city_id, name)`建立联合唯一索引。|
|`district`|`VARCHAR(100)`|`'徐汇'`|所在行政区。|
|`business_circle`|`VARCHAR(100)`|`'上海南站'`|所属商圈。|
|`address`|`VARCHAR(500)`|`'漕东路123弄'`|详细地址，可为空。|
|`created_at`|`TIMESTAMPTZ`|`NOW()`|记录创建时间。|
|`updated_at`|`TIMESTAMPTZ`|`NOW()`|记录最后更新时间。|

---

#### **表5: `daily_city_stats` (城市每日成交统计表)**

**用途**: 存储【城市】级别的每日成交数据。

|   |   |   |   |
|---|---|---|---|
|**字段名**|**数据类型**|**示例**|**说明**|
|`id`|`SERIAL PRIMARY KEY`|`1`|唯一主键，自增。|
|`city_id`|`INTEGER`|`1`|外键，关联到`cities.id`。|
|`record_date`|`DATE`|`'2025-06-24'`|统计日期。需对`(city_id, record_date)`建立联合唯一索引。|
|`new_deal_units`|`INTEGER`|`412`|新房成交套数。|
|`new_deal_area`|`DECIMAL(12, 2)`|`33832.80`|新房成交面积(平方米)。|
|`secondhand_deal_units`|`INTEGER`|`497`|二手房成交套数。|
|`secondhand_deal_area`|`DECIMAL(12, 2)`|`42742.74`|二手房成交面积(平方米)。|
|`secondhand_deal_total_price`|`DECIMAL(20, 2)`|`1624890868.00`|二手房成交总价(元)，可为空。|
|`created_at`|`TIMESTAMPTZ`|`NOW()`|记录创建时间。|

---

#### **表6: `community_stats` (小区周期统计表)**

**用途**: 存储【小区】级别的周期性统计数据。

|   |   |   |   |
|---|---|---|---|
|**字段名**|**数据类型**|**示例**|**说明**|
|`id`|`SERIAL PRIMARY KEY`|`1`|唯一主键，自增。|
|`community_id`|`INTEGER`|`1`|外键，关联到`communities.id`。|
|`record_date`|`DATE`|`'2025-06-24'`|数据获取日期。需对`(community_id, record_date)`建立联合唯一索引。|
|`avg_price_per_sqm`|`INTEGER`|`56669`|小区均价(元/平方米)。|
|`active_listings_count`|`INTEGER`|`13`|当时二手房源(套)。|
|`deals_in_last_90_days`|`INTEGER`|`8`|近90天成交(套)。|
|`showings_in_last_30_days`|`INTEGER`|`85`|近30天带看(次)。|
|`source_agency_id`|`INTEGER`|`1`|数据来源的中介，外键关联到`agencies.id`，可为空。|
|`created_at`|`TIMESTAMPTZ`|`NOW()`|记录创建时间。|

---

#### **表7: `properties` (房源主表)**

**用途**: 系统的核心，统一存储所有房源的详细信息。

|   |   |   |   |
|---|---|---|---|
|**字段名**|**数据类型**|**示例**|**说明**|
|`id`|`SERIAL PRIMARY KEY`|`1`|房源唯一ID，自增。|
|`community_id`|`INTEGER`|`1`|外键，关联到`communities.id`。|
|`status`|`VARCHAR(50)`|`'在售'`|房源状态，枚举值：'在售', '已成交', '个人记录', '已下架'。|
|`source_property_id`|`VARCHAR(255)`|`'107111735298'`|来源平台的房源ID，可为空，但建议建立索引用于快速查找。|
|`layout_bedrooms`|`SMALLINT`|`2`|户型：室。|
|`layout_living_rooms`|`SMALLINT`|`1`|户型：厅。|
|`layout_bathrooms`|`SMALLINT`|`1`|户型：卫。|
|`area_sqm`|`DECIMAL(10, 2)`|`55.00`|建筑面积(平方米)。|
|`orientation`|`VARCHAR(100)`|`'双南'`|房屋朝向。|
|`floor_level`|`VARCHAR(100)`|`'中楼层'`|所在楼层描述。|
|`total_floors`|`SMALLINT`|`6`|总楼层。|
|`build_year`|`SMALLINT`|`1993`|建筑年代。|
|`listing_price_wan`|`DECIMAL(10, 2)`|`240.00`|挂牌总价(万元)。|
|`listing_date`|`DATE`|`'2024-12-31'`|挂牌时间。|
|`deal_price_wan`|`DECIMAL(10, 2)`|`246.00`|成交总价(万元)，可为空。|
|`deal_date`|`DATE`|`'2025-06-03'`|成交时间，可为空。|
|`deal_cycle_days`|`INTEGER`|`59`|成交周期(天)，可为空。|
|`source_url`|`TEXT`|`'https://...'`|原始房源链接，可为空。|
|`image_url`|`TEXT`|`'https://...'`|户型图或封面图链接，可为空。|
|`mortgage_info`|`TEXT`|`'有抵押...'`|抵押信息，可为空。|
|`tags`|`TEXT`|`'房屋满五年,精装'`|标签，多个标签建议用逗号分隔，可为空。|
|`details_json`|`JSONB`|`{'装修':'简装'}`|JSON格式，用于存储其他未规范化的信息，便于扩展。|
|`created_at`|`TIMESTAMPTZ`|`NOW()`|记录创建时间。|
|`updated_at`|`TIMESTAMPTZ`|`NOW()`|记录最后更新时间。|

---

#### **表8: `my_viewings` (我的看房笔记表)**

**用途**: 存储个人看房后的主观记录和评价。

|   |   |   |   |
|---|---|---|---|
|**字段名**|**数据类型**|**示例**|**说明**|
|`id`|`SERIAL PRIMARY KEY`|`1`|笔记唯一ID。|
|**`user_id`**|**`INTEGER`**|**`1`**|**(新增)** 外键，关联到`users.id`，指明该笔记的拥有者。|
|`property_id`|`INTEGER`|`1`|外键，关联到`properties.id`。|
|`agent_id`|`INTEGER`|`1`|外键，关联到`agents.id`，可为空。|
|`viewing_date`|`DATE`|`'2025-06-20'`|我实际看房的日期。|
|`expected_purchase_price_wan`|`DECIMAL(10, 2)`|`235.00`|我的预期购买价(万元)，可为空。|
|`rating`|`SMALLINT`|`4`|我的主观评分 (1-5)，可为空。|
|`notes_general`|`TEXT`|`'...'`|综合笔记，可为空。|
|`notes_pros`|`TEXT`|`'...'`|我认为的优点，可为空。|
|`notes_cons`|`TEXT`|`'...'`|我认为的缺点，可为空。|
|`created_at`|`TIMESTAMPTZ`|`NOW()`|记录创建时间。|
|`updated_at`|`TIMESTAMPTZ`|`NOW()`|记录最后更新时间。|

---

#### **表9: ：`users` (用户表)**

为了兼容两种登录方式，`users`表的设计如下：

|   |   |   |   |
|---|---|---|---|
|**字段名**|**数据类型**|**示例**|**说明**|
|`id`|`SERIAL PRIMARY KEY`|`1`|用户唯一ID，自增。|
|`username`|`VARCHAR(150)`|`'sh_investor'`|传统登录用户名，可为空，需建立唯一索引。|
|`hashed_password`|`VARCHAR(255)`|`'bcrypt_hash...'`|哈希加密后的密码，对于微信用户可为空。|
|`nickname`|`VARCHAR(150)`|`'房产观察员'`|用户的昵称，可以是微信昵称。|
|`avatar_url`|`TEXT`|`'https://...'`|用户头像链接，可以是微信头像，可为空。|
|`phone`|`VARCHAR(50)`|`'138...'`|手机号，可为空，未来可用于绑定或验证。|
|`wx_openid`|`VARCHAR(255)`|`'o6_bm5...'`|微信小程序用户的OpenID，唯一，可为空。|
|`wx_unionid`|`VARCHAR(255)`|`'oT_b4t...'`|微信UnionID，跨应用唯一，**推荐作为微信用户的主要标识**，可为空。|
|`is_active`|`BOOLEAN`|`true`|账户是否激活，默认为`true`。|
|`is_superuser`|`BOOLEAN`|`false`|是否为超级管理员，默认为`false`。|
|`created_at`|`TIMESTAMPTZ`|`NOW()`|记录创建时间。|
|`updated_at`|`TIMESTAMPTZ`|`NOW()`|记录最后更新时间。|

---

博府 profo
"Property/Professional" 和 "Portfolio" 的核心词根


## 前端UI设计需求文档
---

### **“Profo / 博府”项目 - 前端UI界面需求文档**

- **文档版本**: 1.0
- **创建日期**: 2025年6月25日
- **目标读者**: UI/UX设计师、前端开发者
- 

---

### 1. 设计理念与总体风格

**核心理念**: 专业、清晰、高效、数据驱动。

**总体风格**:

- **现代简约**: 界面应采用现代、扁平化的设计风格，避免不必要的装饰和复杂的视觉效果。整体感觉类似于高端的金融分析工具或SaaS后台（如Stripe、Vercel的Dashboard）。
- **信息优先**: UI设计的首要目标是清晰地呈现数据和信息。通过合理的布局、间距和对比度，引导用户快速找到并理解关键内容。
- **沉浸专注**: 使用中性、冷静的色调作为背景，让彩色作为功能性和视觉焦点，帮助用户专注于数据本身。
- **呼吸感**: 大量使用留白（White Space），避免元素堆砌，创造一个干净、不压抑的视觉环境。

### 2. 视觉体系 (Visual System)

这部分定义了构成UI的所有基础视觉元素，应在`tailwind.config.js`中进行统一配置。

#### 2.1 色彩规范 (Color Palette)

- **主色 (Primary)**: 用于关键操作、高亮和品牌标识。建议使用沉稳而专业的蓝色系。
    
    - `primary-500`: `#4f46e5` (Indigo 500) - 主要按钮、链接、激活状态。
    - `primary-600`: `#4338ca` (Indigo 600) - 鼠标悬停（Hover）状态。
    - `primary-100`: `#e0e7ff` (Indigo 100) - 轻度背景、提示信息背景。
- **中性色 (Neutral/Gray)**: 构成界面的基础，用于背景、边框、文字。
    
    - `gray-50`: `#f9fafb` - 页面最底层背景。
    - `gray-100`: `#f3f4f6` - 卡片、输入框等元素的背景。
    - `gray-300`: `#d1d5db` - 主要边框颜色。
    - `gray-500`: `#6b7280` - 次要文字、图标颜色。
    - `gray-700`: `#374151` - 主要正文文字颜色。
    - `gray-900`: `#111827` - 标题、重要信息文字颜色。
    - `white`: `#ffffff` - 卡片、模态框等元素的背景。
- **功能色 (Functional)**: 用于状态反馈。
    
    - **成功 (Success)**: `#10b981` (Green 500) - 操作成功提示。
    - **警告 (Warning)**: `#f59e0b` (Amber 500) - 警示信息。
    - **危险/错误 (Error)**: `#ef4444` (Red 500) - 错误提示、删除操作。
    - **信息 (Info)**: `#3b82f6` (Blue 500) - 普通信息提示。

#### 2.2 字体排印 (Typography)

- **字体族 (Font Family)**:
    
    - **中文**: `"Noto Sans SC", "PingFang SC", "Microsoft YaHei"`
    - **英文/数字**: `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`
    - **代码**: `"Fira Code", monospace`
    - _建议_: 使用可变字体`Inter`和`Noto Sans SC`以获得最佳的跨平台显示效果。
- **字号体系 (Font Size Scale)**:
    
    - `text-xs` (12px): 超小辅助文本。
    - `text-sm` (14px): 主要正文、表单标签、次要信息。
    - `text-base` (16px): 正文段落、卡片标题。
    - `text-lg` (18px): 区域标题、模态框标题。
    - `text-xl` (20px): 页面副标题。
    - `text-2xl` (24px): 页面主标题。
- **字重 (Font Weight)**:
    
    - `normal` (400): 正文。
    - `medium` (500): 稍作强调的文本。
    - `semibold` (600): 标题、按钮文字。

#### 2.3 间距与圆角

- **间距 (Spacing)**: 严格遵循基于`4px`的网格体系。所有`margin`和`padding`应为`4px`的整数倍，直接使用Tailwind的间距单位（如`p-4` -> 16px, `space-y-2` -> 8px）。
- **圆角 (Border Radius)**: 保持一致性，营造专业感。
    - `rounded-md` (6px): 用于按钮、输入框、卡片等大多数元素。
    - `rounded-lg` (8px): 用于模态框、大尺寸卡片。
    - `rounded-full`: 仅用于头像或特定标签。

#### 2.4 阴影 (Shadows)

- 使用柔和、自然的阴影来营造层次感。
    - `shadow-sm`: 用于按钮等小元素的轻微阴影。
    - `shadow-md`: 用于卡片、输入框的默认阴影。
    - `shadow-lg`: 用于模态框、下拉菜单等浮层元素。

---

### 3. 核心组件 UI 规范

#### 3.1 按钮 (Buttons)

- **主按钮 (Primary)**:
    - **默认**: `primary-500` 背景，白色文字。
    - **悬停**: `primary-600` 背景，阴影加深。
- **次按钮 (Secondary)**:
    - **默认**: 白色背景，`gray-300` 边框，`gray-700` 文字。
    - **悬停**: `gray-50` 背景。
- **文本按钮 (Ghost/Text)**:
    - **默认**: 透明背景，`gray-700` 文字。
    - **悬停**: `gray-100` 背景。
- **禁用状态 (Disabled)**: 所有按钮在禁用时，应使用`gray-300`背景，`gray-500`文字，并移除鼠标指针效果。

#### 3.2 表单 (Forms)

- **输入框 (Input)**:
    - **默认**: `gray-100` 背景，`gray-300` 边框。
    - **聚焦 (Focus)**: 移除默认外边框，显示`primary-500`颜色的辉光效果（`ring-2 ring-primary-500`）。
    - **错误 (Error)**: 边框变为`error-500`颜色，并显示错误信息文本。
- **标签 (Label)**: 位于输入框上方，使用`text-sm`和`semibold`字重。

#### 3.3 表格 (Tables)

- **风格**: 简洁、清晰。不建议使用复杂的斑马条纹，而是用细边框(`gray-200`)分隔行。
- **表头 (Header)**: 背景为`gray-50`，文字为`gray-600`、`semibold`。
- **行 (Row)**: 默认白色背景，鼠标悬停时变为`gray-50`背景。

#### 3.4 标签 (Tags/Badges)

- 用于显示房源状态等信息。
- **UI**: 圆角胶囊形状 (`rounded-full`)，内有少量`padding`，文字为`text-xs`。
- **颜色**:
    - **在售**: 绿色背景 (`green-100`)，绿色文字 (`green-800`)。
    - **已成交**: 蓝色背景 (`blue-100`)，蓝色文字 (`blue-800`)。
    - **个人记录**: 灰色背景 (`gray-100`)，灰色文字 (`gray-800`)。

#### 3.5 模态框 (Modals)

- **背景遮罩**: 半透明黑色 (`#000000` with `75%` opacity)。
- **内容面板**: 白色背景，`rounded-lg`圆角，`shadow-lg`阴影。
- **结构**:
    - **头部**: 包含标题和右上角的关闭图标按钮。
    - **主体**: 表单或内容。
    - **底部**: 通常包含“取消”（次按钮）和“确认”（主按钮），右对齐。

---

### 4. 页面布局示例

#### 4.1 仪表盘布局

- 采用响应式12列栅格系统。
- 大尺寸屏幕上（如`>1024px`），“交易趋势图”占据约`2/3`宽度（8列），右侧`1/3`（4列）放置“近期动态”列表。
- “核心指标卡片”在顶部横向排列，每张卡片占据3或4列。

#### 4.2 管理页面布局（房源/小区等）

- **顶部**: 一个`FilterBar`组件，占据页面全部宽度，内部包含搜索框、筛选器和“新增”按钮。
- **主体**: 一个`DataTable`组件，同样占据全部宽度，负责展示数据列表。
- **底部**: 分页组件，居中或右对齐。


## 前端需求文档

---

### **“Profo / 博府”项目 - 前端开发需求文档**

- **文档版本**: 1.0
- **创建日期**: 2025年6月25日
- **目标读者**: 前端开发者

---

### 1. 项目引言

#### 1.1 项目概述

本项目旨在开发一个名为“Profo / 博府”的个人房源信息管理后台。前端的核心任务是提供一个数据驱动、响应迅速、操作直观的单页面应用（SPA），与后端API进行数据交互，实现对各类房产数据的管理、分析与可视化。

#### 1.2 技术栈与环境

- **包管理工具**: **PNPM**
- **构建工具**: **Vite**
- **核心框架**: **Vue 3** (强烈建议全面使用 **Composition API** 以提升代码组织和复用能力)
- **路由**: **Vue Router 4**
- **状态管理**: **Pinia**
- **UI 框架**: **Tailwind CSS v3**
- **HTTP客户端**: **Axios** (用于与后端API通信)
- **图表库**: **ECharts for Vue** 或 **Chart.js** (推荐ECharts，功能更强大)
- **组件库建议**:
    - **Headless UI**: (强烈推荐) 与Tailwind CSS完美集成，提供无样式的、功能完备的组件（如Modal, Dropdown），允许完全自定义样式。
    - **Element Plus / Naive UI**: 如果追求开发速度，可以选择这些完整的组件库，但需要进行一些配置以使其风格与Tailwind CSS协调。

---

### 2. 项目结构建议

建议采用模块化、功能分离的目录结构，便于维护和扩展。

```
/profo-frontend
├── pnpm-lock.yaml
├── package.json
├── vite.config.js
├── tailwind.config.js
├── /src
│   ├── api/          # API请求模块 (e.g., auth.js, properties.js)
│   ├── assets/       # 静态资源 (css, images, fonts)
│   ├── components/   # 全局可复用组件
│   │   ├── common/   # 基础组件 (BaseButton.vue, BaseModal.vue)
│   │   └── layout/   # 布局组件 (Sidebar.vue, Header.vue)
│   ├── composables/  # 可复用的组合式函数 (e.g., useAuth.js)
│   ├── layouts/      # 页面布局 (DefaultLayout.vue, AuthLayout.vue)
│   ├── router/       # Vue Router 路由配置
│   ├── stores/       # Pinia 状态管理模块 (auth.js, property.js)
│   ├── utils/        # 工具函数 (formatDate.js)
│   ├── views/        # 页面级组件 (DashboardView.vue)
│   └── main.js       # 应用入口文件
```

---

### 3. 页面 (视图) 详细设计

#### 3.1 认证页面 (`/views/auth/`)

- **`LoginView.vue`**:
    - **UI**: 包含“用户名”、“密码”输入框，“登录”按钮，以及一个醒目的“使用微信登录”入口。
    - **逻辑**:
        - 表单输入有基本的前端校验（如非空）。
        - 点击“登录”按钮，调用`api/auth.js`中的`login(username, password)`方法。
        - 登录成功后，将后端返回的JWT和用户信息存入`Pinia`的`authStore`，并持久化到`localStorage`。
        - 跳转到仪表盘（`/dashboard`）。
        - 登录失败时，显示明确的错误提示。
- **`RegisterView.vue` (可选)**:
    - **UI**: 包含“用户名”、“密码”、“确认密码”输入框和“注册”按钮。
    - **逻辑**: 调用注册API，成功后可自动登录或引导至登录页。

#### 3.2 主应用布局 (`/layouts/DefaultLayout.vue`)

- **UI**:
    - **侧边栏 (Sidebar)**: 包含导航菜单，链接至“数据看板”、“房源管理”、“小区分析”、“个人看房”、“数据导入”等主要页面。当前激活的菜单项应有高亮状态。
    - **顶部栏 (Header)**: 显示当前登录用户的昵称、头像，并提供一个下拉菜单，内含“退出登录”选项。
    - **主内容区**: 使用`<router-view>`来动态渲染当前路由对应的页面组件。

#### 3.3 数据看板 (`/views/DashboardView.vue`)

- **UI**: 采用栅格布局，由多个卡片（Card）和图表组成。
- **组件**:
    - `StatsCard.vue`: 用于显示单个核心指标（如“昨日成交套数”）。
    - `DataChart.vue`: 可复用的图表组件，用于渲染“交易趋势图”。
    - `RecentList.vue`: 用于显示“近期动态”的列表。
- **逻辑**: 页面加载时，并行发起多个API请求获取看板所需数据，并展示加载状态（Loading Skeletons）。

#### 3.4 房源管理 (`/views/PropertyManagementView.vue`)

- **UI**: 页面的核心是一个功能丰富的数据表格。
- **组件**:
    - `DataTable.vue`: 高度可复用的数据表格组件，支持分页、排序、自定义列渲染。
    - `FilterBar.vue`: 包含小区名称搜索框、状态筛选下拉菜单、价格/面积范围输入框等。
    - `PropertyFormModal.vue`: 用于新增和编辑房源的模态框表单。
- **逻辑**:
    - 筛选条件变化或分页切换时，向后端API (`GET /api/properties`) 发送对应参数（如`page`, `limit`, `status`）请求数据。
    - 表格的“编辑”按钮点击后，应先根据ID获取该条房源的完整数据，然后填充到`PropertyFormModal.vue`中打开。
    - 表单提交时，调用对应的创建 (`POST`) 或更新 (`PUT`) API。

#### 3.5 个人看房管理 (`/views/MyViewingsView.vue`)

- **UI**: 建议使用卡片流布局，每张卡片代表一条看房笔记，比表格更具表现力。
- **组件**:
    - `ViewingNoteCard.vue`: 展示单条笔记的核心信息，包含评分、优缺点、预期价格等。提供编辑/删除按钮。
    - `ViewingNoteFormModal.vue`: 新增/编辑笔记的表单。
- **逻辑**:
    - 表单内的“关联房源”和“带看经纪人”应为**可搜索下拉框**，输入关键词时动态请求API进行模糊查询，以提供良好的选择体验。

#### 3.6 数据导入 (`/views/DataImportView.vue`)

- **UI**: 使用标签页（Tabs）组件切换“CSV导入”和“API同步”功能区。
- **组件**: `FileUpload.vue` 用于处理文件选择和上传。
- **逻辑**:
    - 文件上传时，显示上传进度。上传完成后，根据API返回的成功或失败信息，给用户明确的全局提示（Toast/Notification）。
    - 点击“API同步”按钮后，按钮应变为禁用状态并显示加载中，直到API返回成功或失败结果。

---

### 4. 状态管理 (Pinia)

建议至少建立以下几个Store模块：

- **`auth.js`**:
    - **State**: `user`, `token`。
    - **Actions**: `login()`, `logout()`, `fetchUser()`。
    - **Getters**: `isAuthenticated`。
- **`property.js`**:
    - **State**: `properties` (列表), `pagination` (分页信息), `loading`。
    - **Actions**: `fetchProperties(params)`, `createProperty(data)`, `updateProperty(id, data)`。
- **`ui.js`**:
    - **State**: `isSidebarCollapsed` (侧边栏是否折叠), `globalLoading`。
    - **Actions**: 用于控制全局UI状态。

---

### 5. API 通信层 (`/api/`)

- **`axios.js`**: 创建并配置一个Axios实例。
    - 设置`baseURL`。
    - 配置请求拦截器：在每个请求的Header中自动附加`Authorization: Bearer ${token}`。
    - 配置响应拦截器：统一处理如401未授权等全局错误。
- **功能模块化**: `properties.js`, `stats.js` 等文件分别封装与各模块相关的API调用函数，使业务逻辑更清晰。

---

### 6. 开发流程建议

1. **环境初始化**: `pnpm create vite profo --template vue`，然后按需 `pnpm install` 所有依赖。
2. **配置集成**: 完成 `Tailwind CSS`, `Vue Router`, `Pinia` 的基础配置。
3. **认证先行**: 首先完成登录/注册页面和`authStore`的开发，这是所有后续功能的基础。
4. **布局搭建**: 开发`DefaultLayout.vue`，实现主应用框架。
5. **组件驱动**: 从开发可复用的基础组件开始（如`BaseButton`），然后是复合组件（如`DataTable`），最后是页面级组件。
6. **页面开发**: 按照“数据看板 -> 房源管理 -> 其他页面”的顺序，逐一实现功能，并与后端API进行联调。
7. **持续优化**: 在开发过程中，注意处理加载状态、错误状态和空状态的UI显示，提升用户体验。