"""通用功能模块路由.

包含：文件管理、文件上传、数据推送等功能.
"""

from .files import router as files_router
from .push import router as push_router
from .upload import router as upload_router

__all__ = [
    "files_router",
    "push_router",
    "upload_router",
]
