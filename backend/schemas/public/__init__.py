"""
C端公开接口 Pydantic Schema
"""
from typing import Optional, List, Literal
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class PublicRegisterRequest(BaseModel):
    username: str = Field(
        min_length=4, max_length=30,
        pattern=r"^[a-zA-Z0-9_]+$",
        description="用户名(4-30位字母/数字/下划线)"
    )
    password: str = Field(
        min_length=8, max_length=255,
        pattern=r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$",
        description="密码(≥8位，需含大小写字母和数字)"
    )
    nickname: Optional[str] = Field(None, max_length=100, description="昵称")
    phone: Optional[str] = Field(None, max_length=20, pattern=r"^1[3-9]\d{9}$", description="手机号")


class PublicUserInfo(BaseModel):
    id: str = Field(description="用户ID")
    username: str = Field(description="用户名")
    nickname: Optional[str] = Field(None, description="昵称")
    phone: Optional[str] = Field(None, description="手机号(脱敏)")
    avatar: Optional[str] = Field(None, description="头像")
    status: str = Field(description="用户状态")
    created_at: datetime = Field(description="创建时间")

    model_config = ConfigDict(from_attributes=True)


class PublicRegisterResponse(BaseModel):
    access_token: str = Field(description="访问令牌")
    refresh_token: str = Field(description="刷新令牌")
    token_type: str = Field(default="bearer", description="令牌类型")
    expires_in: int = Field(description="访问令牌过期时间(秒)")
    user: PublicUserInfo = Field(description="用户信息")


class PublicLogoutResponse(BaseModel):
    message: str = Field(description="提示信息")


class PublicProfileUpdate(BaseModel):
    nickname: str = Field(min_length=1, max_length=100, description="昵称")


class PublicUserProfileResponse(PublicUserInfo):
    updated_at: datetime = Field(description="更新时间")


class PublicPhoneUpdate(BaseModel):
    phone: str = Field(max_length=20, pattern=r"^1[3-9]\d{9}$", description="新手机号")
    password: str = Field(description="当前密码确认身份")


class PublicPhoneResponse(BaseModel):
    phone: str = Field(description="手机号(脱敏)")


class PublicProjectListItem(BaseModel):
    id: int = Field(description="项目ID")
    community_name: Optional[str] = Field(None, description="小区名称")
    layout: str = Field(description="户型")
    orientation: str = Field(description="朝向")
    floor_info: str = Field(description="楼层信息")
    area: float = Field(description="面积(m²)")
    total_price: float = Field(description="总价(万元)")
    unit_price: float = Field(description="单价(万元/m²)")
    title: str = Field(description="标题")
    cover_image: Optional[str] = Field(None, description="封面图URL")
    tags: List[str] = Field(default_factory=list, description="标签列表")
    project_status: str = Field(description="项目状态")
    decoration_style: Optional[str] = Field(None, description="装修风格")

    model_config = ConfigDict(from_attributes=True)


class PublicProjectListResponse(BaseModel):
    items: List[PublicProjectListItem] = Field(description="项目列表")
    total: int = Field(description="总记录数")
    page: int = Field(description="当前页码")
    page_size: int = Field(description="每页数量")


class PublicMediaItem(BaseModel):
    id: int = Field(description="媒体ID")
    file_url: str = Field(description="文件URL")
    thumbnail_url: Optional[str] = Field(None, description="缩略图URL")
    media_type: str = Field(description="媒体类型")
    photo_category: str = Field(description="照片分类")
    renovation_stage: Optional[str] = Field(None, description="装修阶段")
    description: Optional[str] = Field(None, description="描述")
    sort_order: int = Field(description="排序")

    model_config = ConfigDict(from_attributes=True)


class PublicRenovationStage(BaseModel):
    stage: str = Field(description="阶段名称")
    photo_count: int = Field(description="照片数量")


class PublicConsultantInfo(BaseModel):
    nickname: Optional[str] = Field(None, description="顾问昵称")
    phone: Optional[str] = Field(None, description="顾问手机号(脱敏)")


class PublicProjectDetail(BaseModel):
    id: int = Field(description="项目ID")
    community_name: Optional[str] = Field(None, description="小区名称")
    layout: str = Field(description="户型")
    orientation: str = Field(description="朝向")
    floor_info: str = Field(description="楼层信息")
    area: float = Field(description="面积(m²)")
    total_price: float = Field(description="总价(万元)")
    unit_price: float = Field(description="单价(万元/m²)")
    title: str = Field(description="标题")
    images: List[str] = Field(default_factory=list, description="图片URL列表")
    tags: List[str] = Field(default_factory=list, description="标签列表")
    project_status: str = Field(description="项目状态")
    decoration_style: Optional[str] = Field(None, description="装修风格")
    description: Optional[str] = Field(None, description="描述")
    media: List[PublicMediaItem] = Field(default_factory=list, description="媒体列表")
    renovation_stages: List[PublicRenovationStage] = Field(default_factory=list, description="改造阶段")
    consultant: Optional[PublicConsultantInfo] = Field(None, description="顾问信息")
    created_at: datetime = Field(description="创建时间")
    updated_at: datetime = Field(description="更新时间")

    model_config = ConfigDict(from_attributes=True)


class PublicConsultantContact(BaseModel):
    phone: str = Field(description="手机号(脱敏)")
    wechat_number: str = Field(description="微信号")
    nickname: str = Field(description="昵称")


class PublicSoldProjectItem(BaseModel):
    id: int = Field(description="项目ID")
    community_name: Optional[str] = Field(None, description="小区名称")
    layout: str = Field(description="户型")
    area: float = Field(description="面积(m²)")
    total_price: float = Field(description="总价(万元)")
    unit_price: float = Field(description="单价(万元/m²)")
    title: str = Field(description="标题")
    cover_image: Optional[str] = Field(None, description="封面图URL")
    sold_days: Optional[int] = Field(None, description="成交天数")
    decoration_style: Optional[str] = Field(None, description="装修风格")

    model_config = ConfigDict(from_attributes=True)


class PublicSoldProjectListResponse(BaseModel):
    items: List[PublicSoldProjectItem] = Field(description="成交案例列表")
    total: int = Field(description="总记录数")
    page: int = Field(description="当前页码")
    page_size: int = Field(description="每页数量")


class PublicPlatformStats(BaseModel):
    total_owners: int = Field(description="业主总数")
    on_sale_count: int = Field(description="在售房源数")
    current_month_sold: int = Field(description="本月成交数")


class PublicCommunitySearchItem(BaseModel):
    id: str = Field(description="小区ID")
    name: str = Field(description="小区名称")
    district: Optional[str] = Field(None, description="行政区")
    business_circle: Optional[str] = Field(None, description="商圈")

    model_config = ConfigDict(from_attributes=True)


class PublicLeadCreate(BaseModel):
    community_name: str = Field(min_length=1, max_length=200, description="小区名称")
    layout: Optional[str] = Field(None, description="户型")
    area: Optional[float] = Field(None, description="面积(m²)")
    floor_info: Optional[str] = Field(None, description="楼层信息")
    orientation: Optional[str] = Field(None, description="朝向")
    remarks: Optional[str] = Field(None, description="备注")


LeadStatusType = Literal[
    "pending_assessment", "pending_visit",
    "rejected", "visited", "signed",
]


class PublicLeadResponse(BaseModel):
    id: str = Field(description="线索ID")
    community_name: str = Field(description="小区名称")
    layout: Optional[str] = Field(None, description="户型")
    area: Optional[float] = Field(None, description="面积(m²)")
    floor_info: Optional[str] = Field(None, description="楼层信息")
    orientation: Optional[str] = Field(None, description="朝向")
    total_price: Optional[float] = Field(None, description="当前授权总价(万)")
    unit_price: Optional[float] = Field(None, description="单价(万/㎡)")
    eval_price: Optional[float] = Field(None, description="评估价格(万)")
    status: LeadStatusType = Field(description="状态")
    remarks: Optional[str] = Field(None, description="备注")
    created_at: datetime = Field(description="创建时间")
    updated_at: datetime = Field(description="更新时间")

    model_config = ConfigDict(from_attributes=True)


class PublicLeadListItem(BaseModel):
    id: str = Field(description="线索ID")
    community_name: str = Field(description="小区名称")
    layout: Optional[str] = Field(None, description="户型")
    area: Optional[float] = Field(None, description="面积(m²)")
    total_price: Optional[float] = Field(None, description="当前授权总价(万)")
    status: LeadStatusType = Field(description="状态代码")
    status_display: str = Field(description="状态显示名称")
    status_color: str = Field(description="状态颜色")
    created_at: datetime = Field(description="创建时间")
    updated_at: datetime = Field(description="更新时间")

    model_config = ConfigDict(from_attributes=True)


class PublicLeadListResponse(BaseModel):
    items: List[PublicLeadListItem] = Field(description="线索列表")
    total: int = Field(description="总记录数")
    page: int = Field(description="当前页码")
    page_size: int = Field(description="每页数量")


class PublicFollowupItem(BaseModel):
    id: str = Field(description="跟进记录ID")
    method: str = Field(description="跟进方式")
    content: str = Field(description="跟进内容")
    followed_at: datetime = Field(description="跟进时间")

    model_config = ConfigDict(from_attributes=True)


class PublicLeadDetail(BaseModel):
    id: str = Field(description="线索ID")
    community_name: str = Field(description="小区名称")
    layout: Optional[str] = Field(None, description="户型")
    area: Optional[float] = Field(None, description="面积(m²)")
    floor_info: Optional[str] = Field(None, description="楼层信息")
    orientation: Optional[str] = Field(None, description="朝向")
    total_price: Optional[float] = Field(None, description="当前授权总价(万)")
    unit_price: Optional[float] = Field(None, description="单价(万/㎡)")
    eval_price: Optional[float] = Field(None, description="评估价格(万)")
    status: LeadStatusType = Field(description="状态代码")
    status_display: str = Field(description="状态显示名称")
    status_color: str = Field(description="状态颜色")
    remarks: Optional[str] = Field(None, description="备注")
    follow_ups: List[PublicFollowupItem] = Field(default_factory=list, description="跟进记录")
    created_at: datetime = Field(description="创建时间")
    updated_at: datetime = Field(description="更新时间")

    model_config = ConfigDict(from_attributes=True)


__all__ = [
    "PublicRegisterRequest",
    "PublicUserInfo",
    "PublicRegisterResponse",
    "PublicLogoutResponse",
    "PublicProfileUpdate",
    "PublicUserProfileResponse",
    "PublicPhoneUpdate",
    "PublicPhoneResponse",
    "PublicProjectListItem",
    "PublicProjectListResponse",
    "PublicMediaItem",
    "PublicRenovationStage",
    "PublicConsultantInfo",
    "PublicProjectDetail",
    "PublicConsultantContact",
    "PublicSoldProjectItem",
    "PublicSoldProjectListResponse",
    "PublicPlatformStats",
    "PublicCommunitySearchItem",
    "PublicLeadCreate",
    "PublicLeadResponse",
    "LeadStatusType",
    "PublicLeadListItem",
    "PublicLeadListResponse",
    "PublicFollowupItem",
    "PublicLeadDetail",
]
