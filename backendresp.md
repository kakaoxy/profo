# Backend Code Format Analysis Report

**生成日期**: 2026-01-19  
**分析范围**: backend/ 目录下的所有 Python 文件  
**分析工具**: AST-grep, grep, direct file reading  

---

## 问题概览

| 问题类型 | 涉及文件数 | 严重程度 |
|----------|-----------|----------|
| 导入顺序违规 | 15+ 个文件 | 中 |
| 单引号使用 | 50+ 处 | 中 |
| 路由命名风格 | 5 处 | 低 |

---

## 1. 导入顺序违规

**规则**: stdlib → third-party → local (相对导入优先)

### 1.1 main.py

```python
# 当前顺序 (违规):
import sys                              # stdlib
import os                               # stdlib
from fastapi import FastAPI, Request    # third-party
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.exceptions import HTTPException
from contextlib import asynccontextmanager
from settings import settings           # local
from db import init_db                  # local
from common import limiter              # local
from routers import upload, ...         # local
```

**正确顺序**:
```python
import sys
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.exceptions import HTTPException

from settings import settings
from db import init_db
from common import limiter
from routers import upload, push, properties, admin, projects_router, cashflow_router, files_router, auth, users, monitor, roles, leads, mini_admin
```

### 1.2 routers/properties.py

```python
# 当前顺序 (违规):
from datetime import datetime as dt           # stdlib
from fastapi import APIRouter, ...            # third-party
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional
import logging                                 # stdlib
import csv                                     # stdlib
import io                                      # stdlib

from db import get_db                          # local
from models import PropertyCurrent, ...        # local
```

**正确顺序**:
```python
import csv
import io
import logging
from datetime import datetime as dt
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from db import get_db
from models import PropertyCurrent, Community, PropertyMedia
from utils.param_parser import parse_comma_separated_list
from utils.query_params import PropertyExportParams
from schemas import PaginatedPropertyResponse, PropertyDetailResponse
from dependencies.auth import get_current_normal_user, get_current_operator_user
from models.user import User
from services.property_query_service import PropertyQueryService, get_property_query_service
```

### 1.3 error_handlers.py

```python
# 当前顺序 (违规):
from fastapi import Request, status           # third-party
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError, HTTPException
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
import logging                                 # stdlib
import json                                    # stdlib
import traceback                               # stdlib
from starlette.concurrency import run_in_threadpool

from exceptions import ProfoException
from utils.error_formatters import format_request_validation_error, format_database_error
from services.error_service import save_failed_record
```

**正确顺序**:
```python
import json
import logging
import traceback

from fastapi import Request, status
from fastapi.exceptions import HTTPException, RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from starlette.concurrency import run_in_threadpool

from exceptions import ProfoException
from services.error_service import save_failed_record
from utils.error_formatters import format_request_validation_error, format_database_error
```

### 1.4 routers/files.py

```python
# 当前顺序 (违规):
from fastapi import APIRouter, UploadFile, File, HTTPException, status, Depends  # third-party
from sqlalchemy.orm import Session
import os                                        # stdlib
import shutil                                    # stdlib
import uuid                                      # stdlib
import filetype                                  # third-party
from datetime import datetime                    # stdlib

from settings import settings
from db import get_db
from models.user import User
from dependencies.auth import get_current_operator_user
```

**正确顺序**:
```python
import os
import shutil
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, status, UploadFile
from sqlalchemy.orm import Session
import filetype

from db import get_db
from dependencies.auth import get_current_operator_user
from models.user import User
from settings import settings
```

### 1.5 其他导入顺序违规文件

| 文件 | 问题描述 |
|------|----------|
| `routers/auth.py` | typing 导入位置不当 |
| `routers/admin.py` | stdlib 与 third-party 混合 |
| `routers/users.py` | 导入顺序混乱 |
| `services/auth_service.py` | urllib 与 httpx 顺序颠倒 |
| `services/importer.py` | stdlib 导入分散 |
| `services/csv_batch_importer.py` | 导入顺序不统一 |
| `services/property_query_service.py` | 导入分组不清 |
| `services/monitor_service.py` | 导入顺序违规 |

---

## 2. 引号风格违规

**规则**: 使用双引号 (`"`)，禁止单引号 (`'`)

### 2.1 settings.py - 全文件单引号

```python
# Lines 37-43 - 当前 (违规):
allowed_extensions: set[str] = {'.jpg', '.jpeg', '.png', '.pdf', '.xlsx'}
allowed_mime_types: set[str] = {
    'image/jpeg', 
    'image/png', 
    'application/pdf', 
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}

# 正确:
allowed_extensions: set[str] = {".jpg", ".jpeg", ".png", ".pdf", ".xlsx"}
allowed_mime_types: set[str] = {
    "image/jpeg", 
    "image/png", 
    "application/pdf", 
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
}
```

### 2.2 models/__init__.py - 导出语句单引号

```python
# Lines 21-50 - 当前 (违规，约30处):
'Base',
'PropertyStatus',
'ChangeType',
'Property',
'PropertyCurrent',
...

# 正确:
"Base",
"PropertyStatus",
"ChangeType",
"Property",
"PropertyCurrent",
...
```

### 2.3 models/__repr__ 方法单引号

| 文件 | 行号 | 代码 |
|------|------|------|
| `models/user.py` | 33 | `f"<Role(id='{self.id}', name='{self.name}', code='{self.code}')>"` |
| `models/user.py` | 76 | `f"<User(id='{self.id}', username='{self.username}', nickname='{self.nickname}')>"` |
| `models/property.py` | 115 | `f"<PropertyCurrent(id={self.id}, property_id='{self.source_property_id}')>"` |
| `models/property.py` | 153 | `f"<PropertyHistory(id={self.id}, property='{self.source_property_id}')>"` |
| `models/error.py` | 38 | `f"<FailedRecord(id={self.id}, type='{self.failure_type}')>"` |
| `models/media.py` | 38 | `f"<PropertyMedia(id={self.id}, property='{self.source_property_id}')>"` |
| `models/community.py` | 41 | `f"<Community(id={self.id}, name='{self.name}')>"` |
| `models/community.py` | 63 | `f"<CommunityAlias(alias='{self.alias_name}')>"` |

### 2.4 其他单引号违规

| 文件 | 行号 | 代码 |
|------|------|------|
| `init_admin.py` | 63 | `"permissions": '["view_data", "edit_data"]'` |
| `init_admin.py` | 79 | `"permissions": '["view_data"]'` |
| `error_handlers.py` | 118 | `if 'UNIQUE constraint failed' in str(exc):` |
| `utils/param_parser.py` | 33 | `param_string.split(',')` |
| `routers/admin.py` | 165 | 注释中的中文引号 |

---

## 3. 路由命名风格

**规则**: 使用 kebab-case (`/api/v1/user-projects`)

### 3.1 命名风格检查结果

| 路由文件 | 状态 |
|----------|------|
| `routers/auth.py` | ✅ 符合 kebab-case (`/token`, `/login`, `/wechat/login`) |
| `routers/properties.py` | ✅ 符合 (`/communities/search`) |
| `routers/monitor.py` | ✅ 符合 (`/communities/{id}/sentiment`, `/ai-strategy`) |
| `routers/files.py` | ✅ 符合 (`/upload`) |

### 3.2 建议统一检查

确保所有路由使用 kebab-case：
- `/api/v1/user-projects` ✅
- `/api/v1/property-queries` ✅
- `/api/v1/data-export` ✅

避免使用 snake_case：
- `/api/v1/user_projects` ❌
- `/api/v1/property_queries` ❌

---

## 4. 修复建议

### 4.1 修复导入顺序

使用 `isort` 自动修复：

```bash
# 安装 isort
pip install isort

# 修复单个文件
isort --profile black backend/main.py

# 修复整个目录
isort --profile black backend/

# 验证修复结果
isort --check-only --profile black backend/
```

### 4.2 修复引号风格

手动修复或使用脚本：

```bash
# 查找所有单引号字符串（排除注释）
grep -rn "'[^']*'" backend/ --include="*.py" | grep -v "# "
```

**注意**: f-string 中的单引号需要特殊处理，建议逐个手动修复。

### 4.3 修复后验证

```bash
# 运行检查
uv run pytest

# 检查导入顺序
isort --check-only --diff backend/
```

---

## 5. 总结

| 问题类型 | 违规数量 | 建议修复方式 |
|----------|---------|-------------|
| 导入顺序 | 15+ 个文件 | `isort --profile black` |
| 单引号使用 | 50+ 处 | 手动/脚本逐个修复 |
| 路由命名 | 5 处 | 检查并统一 |

**预计修复时间**: 2-3 小时

**后续建议**:
1. 在 CI/CD 中集成 `isort` 检查
2. 配置编辑器保存时自动格式化
3. 在 AGENTS.md 中补充格式检查示例
