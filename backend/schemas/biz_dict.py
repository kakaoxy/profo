"""业务字典 Pydantic Schema.

严格与 SQLAlchemy 模型分离（AGENTS.md §2）：
- ``BizDictItemCreate`` / ``BizDictItemUpdate``：写路径（管理端，仅 admin）
- ``BizDictItemResponse`` / ``BizDictGroupResponse``：管理端读路径
- ``PublicDictItemResponse`` / ``PublicDictListResponse``：公开只读（C 端/小程序）
- ``BizDictReorderRequest``：触发动作类（批量排序），非实体 CRUD 故用 *Request 后缀
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class BizDictItemCreate(BaseModel):
    """新增字典条目请求."""

    code: str = Field(min_length=1, max_length=50, description="条目编码（组内唯一）")
    label: str = Field(min_length=1, max_length=100, description="展示名")
    business_form: str | None = Field(default=None, max_length=20, description="业务形式（仅文书模板）")
    category: str | None = Field(default=None, max_length=50, description="文书分类（仅文书模板）")
    sort_order: int | None = Field(default=None, ge=0, description="排序值（缺省追加到末尾）")
    remark: str | None = Field(default=None, max_length=200, description="备注")


class BizDictItemUpdate(BaseModel):
    """修改字典条目请求（字段全部可选，仅更新传入项）."""

    label: str | None = Field(default=None, min_length=1, max_length=100, description="展示名")
    sort_order: int | None = Field(default=None, ge=0, description="排序值")
    enabled: bool | None = Field(default=None, description="启用标记（false=停用不删）")
    business_form: str | None = Field(default=None, max_length=20, description="业务形式（仅文书模板）")
    category: str | None = Field(default=None, max_length=50, description="文书分类（仅文书模板）")
    remark: str | None = Field(default=None, max_length=200, description="备注")


class BizDictReorderRequest(BaseModel):
    """批量排序请求（按 item_ids 顺序重排 sort_order）."""

    item_ids: list[str] = Field(min_length=1, max_length=200, description="条目ID列表（顺序即新排序）")


class BizDictItemResponse(BaseModel):
    """字典条目响应（管理端，含停用项与预置标记）."""

    model_config = ConfigDict(from_attributes=True)

    id: str = Field(description="条目ID")
    dict_code: str = Field(description="字典组编码")
    code: str = Field(description="条目编码")
    label: str = Field(description="展示名")
    business_form: str | None = Field(description="业务形式（仅文书模板）")
    category: str | None = Field(description="文书分类（仅文书模板）")
    sort_order: int = Field(description="排序值")
    enabled: bool = Field(description="启用标记")
    is_builtin: bool = Field(description="是否种子预置")
    remark: str | None = Field(description="备注")
    updated_at: datetime | None = Field(default=None, description="更新时间")


class BizDictGroupResponse(BaseModel):
    """字典组概览（管理页左侧分组列表）."""

    dict_code: str = Field(description="字典组编码")
    name: str = Field(description="字典组中文名")
    description: str = Field(description="字典组用途说明")
    item_count: int = Field(description="条目总数（含停用）")
    enabled_count: int = Field(description="启用条目数")


class BizDictUnmanagedValue(BaseModel):
    """字典外的存量渠道值（宽松校验落库后未纳管的值）."""

    value: str = Field(description="原始值")
    count: int = Field(description="出现次数")


class BizDictUnmanagedResponse(BaseModel):
    """未纳管渠道值列表."""

    dict_code: str = Field(description="字典组编码")
    items: list[BizDictUnmanagedValue] = Field(description="字典外值（按出现次数降序）")


class PublicDictItemResponse(BaseModel):
    """公开字典条目（仅启用项；C 端/小程序渲染用）."""

    code: str = Field(description="条目编码（= 落库值）")
    label: str = Field(description="展示名")
    sort_order: int = Field(description="排序值")


class PublicDictListResponse(BaseModel):
    """公开字典组响应."""

    dict_code: str = Field(description="字典组编码")
    items: list[PublicDictItemResponse] = Field(description="启用项（按 sort_order 升序）")


__all__ = [
    "BizDictGroupResponse",
    "BizDictItemCreate",
    "BizDictItemResponse",
    "BizDictItemUpdate",
    "BizDictReorderRequest",
    "BizDictUnmanagedResponse",
    "BizDictUnmanagedValue",
    "PublicDictItemResponse",
    "PublicDictListResponse",
]
