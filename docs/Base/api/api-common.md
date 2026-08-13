# ProFo 通用功能模块 API 文档

API 基础路径前缀：`/api/v1`

---

## 目录

- [1. 文件上传](#1-文件上传)
  - [POST /api/v1/files/upload](#post-apiv1filesupload)
- [2. CSV 文件上传/导入](#2-csv-文件上传导入)
  - [POST /api/v1/upload/csv](#post-apiv1uploadcsv)
  - [GET /api/v1/upload/tasks/{task_id}](#get-apiv1uploadtaskstask_id)
  - [GET /api/v1/upload/tasks](#get-apiv1uploadtasks)
  - [POST /api/v1/upload/tasks/{task_id}/cancel](#post-apiv1uploadtaskstask_idcancel)
  - [GET /api/v1/upload/download/{filename}](#get-apiv1uploaddownloadfilename)
- [3. JSON 数据推送](#3-json-数据推送)
  - [POST /api/v1/push](#post-apiv1push)
- [4. Schema 定义](#4-schema-定义)
- [5. 错误码表](#5-错误码表)

---

## 1. 文件上传

路由文件：`routers/common/files.py`

挂载路径：`/api/v1/files`

认证方式：Bearer Token（JWT），需要 `admin` 或 `operator` 角色

---

### POST /api/v1/files/upload

上传文件到服务器，返回文件访问 URL。

- **速率限制**：50 次/小时
- **Content-Type**：`multipart/form-data`

#### 请求参数

| 参数 | 类型 | 位置 | 必填 | 说明 |
|------|------|------|------|------|
| `file` | UploadFile | Body (form-data) | 是 | 要上传的文件 |

#### 文件校验规则

| 校验项 | 规则 |
|--------|------|
| 扩展名白名单 | `.jpg`, `.jpeg`, `.png`, `.pdf`, `.xlsx`, `.xls`, `.csv`, `.doc`, `.docx`, `.md` |
| 文件大小限制 | 最大 100MB（104,857,600 bytes） |
| MIME 类型白名单 | `image/jpeg`, `image/png`, `application/pdf`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/vnd.ms-excel`, `text/csv`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/msword`, `text/markdown` |

> 文件名经过 `sanitize_filename` 清洗，存储路径经过 `get_safe_file_path` 安全校验，防止路径遍历攻击。
> MIME 类型通过读取文件头前 2KB 进行检测（`filetype` 库），不依赖客户端声明的 Content-Type。

#### 请求示例

```http
POST /api/v1/files/upload HTTP/1.1
Authorization: Bearer <access_token>
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW

------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="file"; filename="report.pdf"
Content-Type: application/pdf

<文件二进制内容>
------WebKitFormBoundary7MA4YWxkTrZu0gW--
```

#### 响应示例

**200 OK**

```json
{
  "url": "http://localhost:8000/static/uploads/20260525_a1b2c3d4.pdf",
  "filename": "20260525_a1b2c3d4.pdf"
}
```

**400 Bad Request** - 不支持的文件扩展名

```json
{
  "detail": "不支持的文件扩展名。允许的扩展名: .jpg, .jpeg, .png, .pdf, .xlsx, .xls, .csv, .doc, .docx, .md"
}
```

**400 Bad Request** - 文件大小超限

```json
{
  "detail": "文件大小超过限制。最大允许: 104857600 bytes"
}
```

**400 Bad Request** - 无法识别的文件类型

```json
{
  "detail": "无法识别的文件类型"
}
```

**400 Bad Request** - 不支持的 MIME 类型

```json
{
  "detail": "不支持的文件类型。检测到的MIME类型: application/x-executable"
}
```

**500 Internal Server Error** - 上传失败

```json
{
  "detail": "文件上传失败，请稍后重试"
}
```

---

## 2. CSV 文件上传/导入

路由文件：`routers/common/upload.py`

挂载路径：`/api/v1/upload`

认证方式：Bearer Token（JWT），需要 `admin` 或 `operator` 角色（内部用户）

---

### POST /api/v1/upload/csv

上传 CSV 文件并创建异步导入任务。接口立即返回任务 ID，前端可通过轮询 `GET /api/v1/upload/tasks/{task_id}` 查询进度（建议每 2-3 秒查询一次）。

- **速率限制**：30 次/小时
- **Content-Type**：`multipart/form-data`

#### 请求参数

| 参数 | 类型 | 位置 | 必填 | 说明 |
|------|------|------|------|------|
| `file` | UploadFile | Body (form-data) | 是 | CSV 文件，必须以 `.csv` 为后缀 |

#### 请求示例

```http
POST /api/v1/upload/csv HTTP/1.1
Authorization: Bearer <access_token>
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW

------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="file"; filename="properties.csv"
Content-Type: text/csv

<CSV文件二进制内容>
------WebKitFormBoundary7MA4YWxkTrZu0gW--
```

#### 响应示例

**200 OK**

```json
{
  "task_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "status": "pending",
  "message": "导入任务已创建，正在后台处理中"
}
```

**400 Bad Request** - 非 CSV 文件

```json
{
  "detail": "只支持 CSV 文件格式"
}
```

**500 Internal Server Error** - 后台任务启动失败

```json
{
  "detail": "导入任务启动失败，请稍后重试"
}
```

---

### GET /api/v1/upload/tasks/{task_id}

查询指定导入任务的状态和进度。

#### 请求参数

| 参数 | 类型 | 位置 | 必填 | 说明 |
|------|------|------|------|------|
| `task_id` | string | Path | 是 | 任务 ID |

#### 请求示例

```http
GET /api/v1/upload/tasks/f47ac10b-58cc-4372-a567-0e02b2c3d479 HTTP/1.1
Authorization: Bearer <access_token>
```

#### 响应示例

**200 OK**

```json
{
  "task_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "status": "processing",
  "filename": "properties.csv",
  "total_records": 500,
  "processed_records": 320,
  "success_count": 315,
  "failed_count": 5,
  "progress_percent": 64.0,
  "failed_file_url": null,
  "error_message": null,
  "created_at": "2026-05-25T10:30:00Z",
  "started_at": "2026-05-25T10:30:01Z",
  "completed_at": null,
  "processing_duration": null
}
```

**200 OK** - 任务已完成（含失败记录）

```json
{
  "task_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "status": "completed",
  "filename": "properties.csv",
  "total_records": 500,
  "processed_records": 500,
  "success_count": 487,
  "failed_count": 13,
  "progress_percent": 100.0,
  "failed_file_url": "/api/v1/upload/download/failed_f47ac10b.csv",
  "error_message": null,
  "created_at": "2026-05-25T10:30:00Z",
  "started_at": "2026-05-25T10:30:01Z",
  "completed_at": "2026-05-25T10:30:45Z",
  "processing_duration": 44.2
}
```

**404 Not Found** - 任务不存在

```json
{
  "detail": "任务不存在"
}
```

**403 Forbidden** - 无权查看此任务

```json
{
  "detail": "无权查看此任务"
}
```

---

### GET /api/v1/upload/tasks

获取当前用户的导入任务列表，按创建时间倒序排列。

#### 请求参数

| 参数 | 类型 | 位置 | 必填 | 默认值 | 说明 |
|------|------|------|------|--------|------|
| `status` | string | Query | 否 | `null` | 按状态筛选，可选值：`pending` / `processing` / `completed` / `failed` / `cancelled` |
| `limit` | integer | Query | 否 | `10` | 返回数量限制，范围 1-50 |

#### 请求示例

```http
GET /api/v1/upload/tasks?status=completed&limit=5 HTTP/1.1
Authorization: Bearer <access_token>
```

#### 响应示例

**200 OK**

```json
[
  {
    "task_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "status": "completed",
    "filename": "properties_batch1.csv",
    "total_records": 200,
    "processed_records": 200,
    "success_count": 198,
    "failed_count": 2,
    "progress_percent": 100.0,
    "failed_file_url": "/api/v1/upload/download/failed_f47ac10b.csv",
    "error_message": null,
    "created_at": "2026-05-25T10:30:00Z",
    "started_at": "2026-05-25T10:30:01Z",
    "completed_at": "2026-05-25T10:30:30Z",
    "processing_duration": 29.5
  },
  {
    "task_id": "a1b2c3d4-5678-9012-abcd-ef0123456789",
    "status": "completed",
    "filename": "properties_batch2.csv",
    "total_records": 150,
    "processed_records": 150,
    "success_count": 150,
    "failed_count": 0,
    "progress_percent": 100.0,
    "failed_file_url": null,
    "error_message": null,
    "created_at": "2026-05-24T15:20:00Z",
    "started_at": "2026-05-24T15:20:01Z",
    "completed_at": "2026-05-24T15:20:20Z",
    "processing_duration": 19.0
  }
]
```

---

### POST /api/v1/upload/tasks/{task_id}/cancel

取消导入任务。只能取消 `pending` 或 `processing` 状态的任务。

#### 请求参数

| 参数 | 类型 | 位置 | 必填 | 说明 |
|------|------|------|------|------|
| `task_id` | string | Path | 是 | 任务 ID |

#### 请求示例

```http
POST /api/v1/upload/tasks/f47ac10b-58cc-4372-a567-0e02b2c3d479/cancel HTTP/1.1
Authorization: Bearer <access_token>
```

#### 响应示例

**200 OK**

```json
{
  "message": "任务已取消",
  "task_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

**400 Bad Request** - 任务不存在或无法取消

```json
{
  "detail": "任务不存在或无法取消（只能取消待处理或处理中的任务）"
}
```

---

### GET /api/v1/upload/download/{filename}

下载导入任务的失败记录文件。

- **安全措施**：使用 `get_safe_file_path` 和 `is_safe_path` 双重校验，防止目录遍历攻击。

#### 请求参数

| 参数 | 类型 | 位置 | 必填 | 说明 |
|------|------|------|------|------|
| `filename` | string | Path | 是 | 失败记录文件名 |

#### 请求示例

```http
GET /api/v1/upload/download/failed_f47ac10b.csv HTTP/1.1
Authorization: Bearer <access_token>
```

#### 响应示例

**200 OK**

- **Content-Type**：`text/csv`
- **Content-Disposition**：`attachment; filename="failed_f47ac10b.csv"`
- **Body**：CSV 文件内容

**400 Bad Request** - 非法文件名

```json
{
  "detail": "无效的文件名"
}
```

**403 Forbidden** - 路径安全检查失败

```json
{
  "detail": "访问被拒绝"
}
```

**404 Not Found** - 文件不存在或已过期

```json
{
  "detail": "文件不存在或已过期"
}
```

---

## 3. JSON 数据推送

路由文件：`routers/common/push.py`

挂载路径：`/api/v1/push`

认证方式：API Key（通过 `X-API-Key` 请求头）

---

### POST /api/v1/push

接收 JSON 数组，批量导入房源数据。

- **认证方式**：`X-API-Key` 请求头（非 JWT Bearer Token）
- **最大记录数**：10,000 条/次

#### 请求参数

| 参数 | 类型 | 位置 | 必填 | 说明 |
|------|------|------|------|------|
| `X-API-Key` | string | Header | 是 | API 密钥 |
| Body | `list[dict]` | Body (JSON) | 是 | 房源数据数组，最多 10,000 条 |

#### 请求示例

```http
POST /api/v1/push HTTP/1.1
X-API-Key: your-api-key-here
Content-Type: application/json

[
  {
    "community_name": "阳光花园",
    "address": "上海市浦东新区XX路100号",
    "area": 89.5,
    "price": 3500000
  },
  {
    "community_name": "翠湖天地",
    "address": "上海市黄浦区XX路200号",
    "area": 120.0,
    "price": 8000000
  }
]
```

#### 响应示例

**200 OK**

```json
{
  "total": 2,
  "success": 1,
  "failed": 1,
  "errors": [
    {
      "index": 1,
      "error": "小区名称已存在: 翠湖天地"
    }
  ]
}
```

**400 Bad Request** - 空请求体

```json
{
  "detail": "请求体不能为空"
}
```

**400 Bad Request** - 超过记录数限制

```json
{
  "detail": "单次推送最多支持 10000 条记录"
}
```

**401 Unauthorized** - API Key 无效或缺失

```json
{
  "detail": "无效的 API Key"
}
```

**500 Internal Server Error** - 推送处理失败

```json
{
  "detail": "推送处理失败: <具体错误信息>"
}
```

---

## 4. Schema 定义

### FileUploadResponse

文件上传响应。

| 字段 | 类型 | 说明 |
|------|------|------|
| `url` | string | 文件访问 URL |
| `filename` | string | 存储文件名（含日期前缀和随机后缀，如 `20260525_a1b2c3d4.pdf`） |

### ImportTaskCreateResponse

导入任务创建响应。

| 字段 | 类型 | 说明 |
|------|------|------|
| `task_id` | string | 任务 ID（UUID） |
| `status` | string | 任务状态，创建时为 `pending` |
| `message` | string | 提示信息，默认 `"导入任务已创建"` |

### ImportTaskStatusResponse

导入任务状态响应，由 `PropertyImportTask` 模型验证生成。

| 字段 | 类型 | 说明 |
|------|------|------|
| `task_id` | string | 任务 ID |
| `status` | string | 任务状态：`pending` / `processing` / `completed` / `failed` / `cancelled` |
| `filename` | string | 原始文件名 |
| `total_records` | integer | 总记录数，默认 `0` |
| `processed_records` | integer | 已处理记录数，默认 `0` |
| `success_count` | integer | 成功导入数，默认 `0` |
| `failed_count` | integer | 失败记录数，默认 `0` |
| `progress_percent` | float | 进度百分比（0-100），默认 `0.0` |
| `failed_file_url` | string \| null | 失败记录文件 URL |
| `error_message` | string \| null | 错误信息（失败时） |
| `created_at` | datetime | 创建时间 |
| `started_at` | datetime \| null | 开始处理时间 |
| `completed_at` | datetime \| null | 完成时间 |
| `processing_duration` | float \| null | 处理时长（秒） |

### CancelTaskResponse

取消任务响应。

| 字段 | 类型 | 说明 |
|------|------|------|
| `message` | string | 提示信息，如 `"任务已取消"` |
| `task_id` | string | 任务 ID |

### PushResult

JSON 推送结果。

| 字段 | 类型 | 说明 |
|------|------|------|
| `total` | integer | 总记录数 |
| `success` | integer | 成功导入数 |
| `failed` | integer | 失败记录数 |
| `errors` | list[dict] | 错误详情列表，每项包含失败记录的索引和错误信息 |

---

## 5. 错误码表

### 通用错误

| HTTP 状态码 | 错误场景 | detail 示例 |
|-------------|----------|-------------|
| 401 | 未认证 / Token 无效 / API Key 无效 | `"无效的 API Key"` |
| 403 | 权限不足 / 无权访问资源 | `"无权查看此任务"` / `"访问被拒绝"` |

### 文件上传模块 (`/api/v1/files`)

| HTTP 状态码 | 错误场景 | detail 示例 |
|-------------|----------|-------------|
| 400 | 不支持的文件扩展名 | `"不支持的文件扩展名。允许的扩展名: .jpg, .jpeg, ..."` |
| 400 | 文件大小超限 | `"文件大小超过限制。最大允许: 104857600 bytes"` |
| 400 | 无法识别文件类型 | `"无法识别的文件类型"` |
| 400 | 不支持的 MIME 类型 | `"不支持的文件类型。检测到的MIME类型: application/x-executable"` |
| 500 | 上传过程异常 | `"文件上传失败，请稍后重试"` |

### CSV 导入模块 (`/api/v1/upload`)

| HTTP 状态码 | 错误场景 | detail 示例 |
|-------------|----------|-------------|
| 400 | 非 CSV 文件 | `"只支持 CSV 文件格式"` |
| 400 | 任务不存在或无法取消 | `"任务不存在或无法取消（只能取消待处理或处理中的任务）"` |
| 400 | 非法文件名（目录遍历） | `"无效的文件名"` |
| 403 | 查看他人任务 | `"无权查看此任务"` |
| 403 | 路径安全检查失败 | `"访问被拒绝"` |
| 404 | 任务不存在 | `"任务不存在"` |
| 404 | 下载文件不存在 | `"文件不存在或已过期"` |
| 500 | 后台任务启动失败 | `"导入任务启动失败，请稍后重试"` |

### JSON 推送模块 (`/api/v1/push`)

| HTTP 状态码 | 错误场景 | detail 示例 |
|-------------|----------|-------------|
| 400 | 空请求体 | `"请求体不能为空"` |
| 400 | 超过记录数限制 | `"单次推送最多支持 10000 条记录"` |
| 500 | 推送处理失败 | `"推送处理失败: <具体错误信息>"` |

### 导入任务状态枚举

| 状态值 | 说明 |
|--------|------|
| `pending` | 待处理 |
| `processing` | 处理中 |
| `completed` | 已完成 |
| `failed` | 已失败 |
| `cancelled` | 已取消 |
