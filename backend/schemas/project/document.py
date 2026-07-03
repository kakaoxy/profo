"""项目文书签收相关Schema."""

from datetime import datetime
from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class DocumentCreate(BaseModel):
    """创建文书请求."""

    document_name: str = Field(..., max_length=200, description="文书名称")
    display_order: int | None = Field(None, description="显示顺序（默认追加末尾）")


class DocumentUpdate(BaseModel):
    """更新文书请求."""

    document_name: str | None = Field(
        None,
        validation_alias=AliasChoices("document_name", "documentName"),
        max_length=200,
        description="文书名称",
    )
    signoff_status: str | None = Field(
        None,
        validation_alias=AliasChoices("signoff_status", "signoffStatus"),
        description="签收状态: unsigned/signed/archived",
    )
    archive_date: str | None = Field(
        None,
        validation_alias=AliasChoices("archive_date", "archiveDate"),
        max_length=10,
        description="归档日期 YYYY-MM-DD",
    )

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class DocumentResponse(BaseModel):
    """文书响应."""

    id: str = Field(description="文书ID")
    project_id: str = Field(description="项目ID")
    document_name: str = Field(description="文书名称")
    signoff_status: str = Field(description="签收状态")
    archive_date: str | None = Field(None, description="归档日期")
    display_order: int = Field(description="显示顺序")
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DocumentInitializeResponse(BaseModel):
    """初始化文书清单响应."""

    initialized_count: int = Field(description="新增文书数量")
