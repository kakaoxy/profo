"""系统模块.

包含系统级别的功能，如错误处理、导入任务.
"""

from .error import FailedRecord
from .import_task import ImportTaskStatus, PropertyImportTask

__all__ = ["FailedRecord", "ImportTaskStatus", "PropertyImportTask"]
