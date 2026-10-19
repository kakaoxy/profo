"""项目归档状态相关 Schema.

归档 / 反归档为触发动作类接口，按 AGENTS.md 规范使用 ``*Request`` 后缀。
"""

from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class ProjectArchiveRequest(BaseModel):
    """项目归档请求（sold/ended → 已归档）."""

    archived_at: date = Field(description="归档日期（业务口径，弹窗必填，默认今天）")
    archived_note: str | None = Field(None, max_length=500, description="归档说明（选填）")

    model_config = ConfigDict(from_attributes=True)


class ProjectUnarchiveRequest(BaseModel):
    """项目反归档请求（已归档 → 未归档）."""

    reason: str = Field(min_length=1, max_length=500, description="反归档原因（必填）")

    model_config = ConfigDict(from_attributes=True)
