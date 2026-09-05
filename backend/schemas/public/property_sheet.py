"""C端房源单（多房源分享）Pydantic Schema.

consultant 与 share-stats 响应复用 PublicConsultantContact / PublicShareStatsResponse（见 schemas/public/__init__.py）.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PropertySheetCreateRequest(BaseModel):
    """C端创建房源单请求."""

    project_ids: list[int] = Field(
        min_length=1,
        max_length=10,
        description="房源ID列表(1~10个，服务端去重保序)",
    )


class PropertySheetItemResponse(BaseModel):
    """C端房源单项（含房源展示字段，与 PublicProjectListItem 同名同类型）."""

    marketing_project_id: int = Field(description="房源ID")
    sort_order: int = Field(description="排序(0起)")
    display_status: str = Field(description="展示状态: 在售/已售")
    title: str = Field(description="标题")
    community_name: str | None = Field(None, description="小区名称")
    cover_image: str | None = Field(None, description="封面图URL")
    cover_thumbnail_url: str | None = Field(None, description="封面缩略图URL")
    layout: str = Field(description="户型")
    orientation: str = Field(description="朝向")
    floor_info: str = Field(description="楼层信息")
    area: float = Field(description="面积(m²)")
    total_price: float = Field(description="总价(万元)")
    unit_price: float = Field(description="单价(万元/m²)")
    tags: list[str] = Field(default_factory=list, description="标签列表")

    model_config = ConfigDict(from_attributes=True)

    @field_validator("tags", mode="before")
    @classmethod
    def _tags_none_to_empty(cls, v: object) -> object:
        """L4MarketingProject.tags 可能为 NULL，统一转为空列表."""
        return [] if v is None else v


class PropertySheetResponse(BaseModel):
    """C端房源单详情响应."""

    id: int = Field(description="房源单ID")
    code: str = Field(description="8位分享短码")
    created_at: datetime = Field(description="创建时间")
    items: list[PropertySheetItemResponse] = Field(
        default_factory=list,
        description="房源明细(按 sort_order 升序，未发布/在途房源已过滤)",
    )

    model_config = ConfigDict(from_attributes=True)


class PropertySheetMineItemResponse(BaseModel):
    """C端我的房源单列表项."""

    id: int = Field(description="房源单ID")
    code: str = Field(description="8位分享短码")
    item_count: int = Field(description="房源明细数")
    created_at: datetime = Field(description="创建时间")


class PropertySheetMineListResponse(BaseModel):
    """C端我的房源单列表响应."""

    items: list[PropertySheetMineItemResponse] = Field(description="房源单列表(创建时间倒序)")


class PropertySheetQRCodeResponse(BaseModel):
    """C端房源单小程序码响应."""

    code: str = Field(description="8位分享短码")
    image_base64: str = Field(description="小程序码图片 base64")


class PropertySheetQRSceneResponse(BaseModel):
    """C端房源单短码解析响应."""

    sheet_id: int = Field(description="房源单ID")
    referrer: str | None = Field(None, description="分享归属员工ID(员工无效时为 null)")


class PropertySheetVisitEventRequest(BaseModel):
    """C端房源单访问埋点上报请求（免登录）.

    referrer 非空即原样落库（与单房源 visit 口径一致，不做内部用户校验）。
    """

    visitor_id: str = Field(min_length=1, max_length=64, description="匿名访客ID(UV去重键，前端生成)")
    referrer: str | None = Field(None, max_length=36, description="来源员工ID(分享参数透传)")
    source: str | None = Field(None, max_length=20, description="进入渠道")


class PropertySheetShareEventRequest(BaseModel):
    """C端房源单分享事件上报请求（需登录，employee_id 服务端取当前用户）."""

    share_type: Literal["poster", "card"] = Field(description="分享方式：poster(保存海报)/card(转发卡片)")


__all__ = [
    "PropertySheetCreateRequest",
    "PropertySheetItemResponse",
    "PropertySheetMineItemResponse",
    "PropertySheetMineListResponse",
    "PropertySheetQRCodeResponse",
    "PropertySheetQRSceneResponse",
    "PropertySheetResponse",
    "PropertySheetShareEventRequest",
    "PropertySheetVisitEventRequest",
]
