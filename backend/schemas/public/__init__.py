"""C端公开接口 Pydantic Schema."""

import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from models.common import FollowUpMethod, RenovationStage
from models.marketing.l4_marketing import MarketingProjectStatus, PhotoCategory


class PublicProjectFilter(BaseModel):
    """C端项目筛选参数."""

    project_status: MarketingProjectStatus | None = Field(None, description="项目状态筛选")
    community_name: str | None = Field(None, description="小区名称搜索")
    layout: str | None = Field(None, description="户型筛选")
    min_price: float | None = Field(None, description="最低总价(万)")
    max_price: float | None = Field(None, description="最高总价(万)")
    min_area: float | None = Field(None, description="最小面积(m²)")
    max_area: float | None = Field(None, description="最大面积(m²)")
    sort_by: str = Field("created_at", description="排序字段")
    sort_order: str = Field("desc", description="排序方向 asc/desc")

    model_config = ConfigDict(from_attributes=True)


class PublicRegisterRequest(BaseModel):
    """C端用户注册请求."""

    username: str = Field(
        min_length=4,
        max_length=30,
        pattern=r"^[a-zA-Z0-9_]+$",
        description="用户名(4-30位字母/数字/下划线)",
    )
    password: str = Field(
        min_length=8,
        max_length=255,
        description="密码(≥8位，需含大小写字母、数字和特殊字符)",
    )
    nickname: str | None = Field(None, max_length=100, description="昵称")
    phone: str | None = Field(None, max_length=20, pattern=r"^1[3-9]\d{9}$", description="手机号")

    @field_validator("password")
    @classmethod
    def validate_password_complexity(cls, v: str) -> str:
        """校验密码复杂度（与后台 validate_password_strength 保持一致）."""
        if not re.search(r"[a-z]", v):
            msg = "密码必须包含至少一个小写字母"
            raise ValueError(msg)
        if not re.search(r"[A-Z]", v):
            msg = "密码必须包含至少一个大写字母"
            raise ValueError(msg)
        if not re.search(r"\d", v):
            msg = "密码必须包含至少一个数字"
            raise ValueError(msg)
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", v):
            msg = '密码必须包含至少一个特殊字符 (!@#$%^&*(),.?":{}|<>)'
            raise ValueError(msg)
        return v


class PublicUserInfo(BaseModel):
    """C端用户信息."""

    id: str = Field(description="用户ID")
    username: str = Field(description="用户名")
    nickname: str | None = Field(None, description="昵称")
    phone: str | None = Field(None, description="手机号(脱敏)")
    avatar: str | None = Field(None, description="头像")
    status: str = Field(description="用户状态")
    created_at: datetime = Field(description="创建时间")

    model_config = ConfigDict(from_attributes=True)


class PublicRegisterResponse(BaseModel):
    """C端注册响应."""

    access_token: str = Field(description="访问令牌")
    refresh_token: str = Field(description="刷新令牌")
    token_type: str = Field(default="bearer", description="令牌类型")
    expires_in: int = Field(description="访问令牌过期时间(秒)")
    user: PublicUserInfo = Field(description="用户信息")


class PublicLoginResponse(BaseModel):
    """C端登录响应."""

    access_token: str = Field(description="访问令牌")
    refresh_token: str = Field(description="刷新令牌")
    token_type: str = Field(default="bearer", description="令牌类型")
    expires_in: int = Field(description="访问令牌过期时间(秒)")
    user: PublicUserInfo | None = Field(None, description="用户信息")


class PublicRefreshTokenRequest(BaseModel):
    """C端刷新令牌请求."""

    refresh_token: str = Field(description="刷新令牌")


class PublicLogoutResponse(BaseModel):
    """C端登出响应."""

    message: str = Field(description="提示信息")


class PublicProfileUpdate(BaseModel):
    """C端个人信息更新请求."""

    nickname: str = Field(min_length=1, max_length=100, description="昵称")


class PublicUserProfileResponse(PublicUserInfo):
    """C端用户个人资料响应."""

    updated_at: datetime = Field(description="更新时间")


class PublicPhoneCreate(BaseModel):
    """C端首次设置手机号请求（仅当用户尚未绑定手机号时可用）."""

    phone: str = Field(max_length=20, pattern=r"^1[3-9]\d{9}$", description="手机号")


class PublicPhoneUpdate(BaseModel):
    """C端手机号更新请求."""

    phone: str = Field(max_length=20, pattern=r"^1[3-9]\d{9}$", description="新手机号")
    password: str = Field(description="当前密码确认身份")


class PublicPhoneResponse(BaseModel):
    """C端手机号响应."""

    phone: str = Field(description="手机号(脱敏)")


class PublicProjectListItem(BaseModel):
    """C端项目列表项."""

    id: int = Field(description="项目ID")
    community_name: str | None = Field(None, description="小区名称")
    layout: str = Field(description="户型")
    orientation: str = Field(description="朝向")
    floor_info: str = Field(description="楼层信息")
    area: float = Field(description="面积(m²)")
    total_price: float = Field(description="总价(万元)")
    unit_price: float = Field(description="单价(万元/m²)")
    title: str = Field(description="标题")
    cover_image: str | None = Field(None, description="封面图URL")
    tags: list[str] = Field(default_factory=list, description="标签列表")
    project_status: MarketingProjectStatus = Field(description="项目状态")
    decoration_style: str | None = Field(None, description="装修风格")

    model_config = ConfigDict(from_attributes=True)


class PublicProjectListResponse(BaseModel):
    """C端项目列表响应."""

    items: list[PublicProjectListItem] = Field(description="项目列表")
    total: int = Field(description="总记录数")
    page: int = Field(description="当前页码")
    page_size: int = Field(description="每页数量")


class PublicMediaItem(BaseModel):
    """C端媒体项."""

    id: int = Field(description="媒体ID")
    file_url: str = Field(description="文件URL")
    thumbnail_url: str | None = Field(None, description="缩略图URL")
    media_type: str = Field(description="媒体类型")
    photo_category: PhotoCategory = Field(description="照片分类")
    renovation_stage: RenovationStage | None = Field(None, description="装修阶段")
    description: str | None = Field(None, description="描述")
    sort_order: int = Field(description="排序")

    model_config = ConfigDict(from_attributes=True)


class PublicRenovationStage(BaseModel):
    """C端改造阶段."""

    stage: RenovationStage = Field(description="阶段名称")
    photo_count: int = Field(description="照片数量")


class PublicConsultantInfo(BaseModel):
    """C端顾问信息."""

    nickname: str | None = Field(None, description="顾问昵称")
    phone: str | None = Field(None, description="顾问手机号(脱敏)")


class PublicProjectDetail(BaseModel):
    """C端项目详情."""

    id: int = Field(description="项目ID")
    community_name: str | None = Field(None, description="小区名称")
    layout: str = Field(description="户型")
    orientation: str = Field(description="朝向")
    floor_info: str = Field(description="楼层信息")
    area: float = Field(description="面积(m²)")
    total_price: float = Field(description="总价(万元)")
    unit_price: float = Field(description="单价(万元/m²)")
    title: str = Field(description="标题")
    images: list[str] = Field(default_factory=list, description="图片URL列表")
    tags: list[str] = Field(default_factory=list, description="标签列表")
    project_status: MarketingProjectStatus = Field(description="项目状态")
    decoration_style: str | None = Field(None, description="装修风格")
    description: str | None = Field(None, description="描述")
    media: list[PublicMediaItem] = Field(default_factory=list, description="媒体列表")
    renovation_stages: list[PublicRenovationStage] = Field(default_factory=list, description="改造阶段")
    consultant: PublicConsultantInfo | None = Field(None, description="顾问信息")
    created_at: datetime = Field(description="创建时间")
    updated_at: datetime = Field(description="更新时间")

    model_config = ConfigDict(from_attributes=True)


class PublicConsultantContact(BaseModel):
    """C端顾问联系方式."""

    phone: str = Field(description="手机号(脱敏)")
    wechat_number: str = Field(description="微信号")
    nickname: str = Field(description="昵称")


class PublicSoldProjectItem(BaseModel):
    """C端已售项目项."""

    id: int = Field(description="项目ID")
    community_name: str | None = Field(None, description="小区名称")
    layout: str = Field(description="户型")
    area: float = Field(description="面积(m²)")
    total_price: float = Field(description="总价(万元)")
    unit_price: float = Field(description="单价(万元/m²)")
    title: str = Field(description="标题")
    cover_image: str | None = Field(None, description="封面图URL")
    sold_days: int | None = Field(None, description="成交天数")
    decoration_style: str | None = Field(None, description="装修风格")

    model_config = ConfigDict(from_attributes=True)


class PublicSoldProjectListResponse(BaseModel):
    """C端已售项目列表响应."""

    items: list[PublicSoldProjectItem] = Field(description="成交案例列表")
    total: int = Field(description="总记录数")
    page: int = Field(description="当前页码")
    page_size: int = Field(description="每页数量")


class PublicPlatformStats(BaseModel):
    """C端平台统计."""

    total_owners: int = Field(description="业主总数")
    on_sale_count: int = Field(description="在售房源数")
    current_month_sold: int = Field(description="本月成交数")


class PublicCommunitySearchItem(BaseModel):
    """C端小区搜索项."""

    id: str = Field(description="小区ID")
    name: str = Field(description="小区名称")
    district: str | None = Field(None, description="行政区")
    business_circle: str | None = Field(None, description="商圈")

    model_config = ConfigDict(from_attributes=True)


class PublicLeadCreate(BaseModel):
    """C端线索创建请求."""

    community_name: str = Field(min_length=1, max_length=200, description="小区名称")
    layout: str | None = Field(None, description="户型")
    area: float | None = Field(None, description="面积(m²)")
    floor_info: str | None = Field(None, description="楼层信息")
    orientation: str | None = Field(None, description="朝向")
    remarks: str | None = Field(None, description="备注")


LeadStatusType = Literal[
    "pending_assessment",
    "pending_visit",
    "rejected",
    "visited",
    "signed",
]


class PublicLeadResponse(BaseModel):
    """C端线索响应."""

    id: str = Field(description="线索ID")
    community_name: str = Field(description="小区名称")
    layout: str | None = Field(None, description="户型")
    area: float | None = Field(None, description="面积(m²)")
    floor_info: str | None = Field(None, description="楼层信息")
    orientation: str | None = Field(None, description="朝向")
    total_price: float | None = Field(None, description="当前授权总价(万)")
    unit_price: float | None = Field(None, description="单价(万/㎡)")
    eval_price: float | None = Field(None, description="评估价格(万)")
    status: LeadStatusType = Field(description="状态")
    remarks: str | None = Field(None, description="备注")
    created_at: datetime = Field(description="创建时间")
    updated_at: datetime = Field(description="更新时间")

    model_config = ConfigDict(from_attributes=True)


class PublicLeadListItem(BaseModel):
    """C端线索列表项."""

    id: str = Field(description="线索ID")
    community_name: str = Field(description="小区名称")
    layout: str | None = Field(None, description="户型")
    area: float | None = Field(None, description="面积(m²)")
    total_price: float | None = Field(None, description="当前授权总价(万)")
    status: LeadStatusType = Field(description="状态代码")
    status_display: str = Field(description="状态显示名称")
    status_color: str = Field(description="状态颜色")
    created_at: datetime = Field(description="创建时间")
    updated_at: datetime = Field(description="更新时间")

    model_config = ConfigDict(from_attributes=True)


class PublicLeadListResponse(BaseModel):
    """C端线索列表响应."""

    items: list[PublicLeadListItem] = Field(description="线索列表")
    total: int = Field(description="总记录数")
    page: int = Field(description="当前页码")
    page_size: int = Field(description="每页数量")


class PublicFollowupItem(BaseModel):
    """C端跟进记录项."""

    id: str = Field(description="跟进记录ID")
    method: FollowUpMethod = Field(description="跟进方式")
    content: str = Field(description="跟进内容")
    followed_at: datetime = Field(description="跟进时间")

    model_config = ConfigDict(from_attributes=True)


class PublicLeadDetail(BaseModel):
    """C端线索详情."""

    id: str = Field(description="线索ID")
    community_name: str = Field(description="小区名称")
    layout: str | None = Field(None, description="户型")
    area: float | None = Field(None, description="面积(m²)")
    floor_info: str | None = Field(None, description="楼层信息")
    orientation: str | None = Field(None, description="朝向")
    total_price: float | None = Field(None, description="当前授权总价(万)")
    unit_price: float | None = Field(None, description="单价(万/㎡)")
    eval_price: float | None = Field(None, description="评估价格(万)")
    status: LeadStatusType = Field(description="状态代码")
    status_display: str = Field(description="状态显示名称")
    status_color: str = Field(description="状态颜色")
    remarks: str | None = Field(None, description="备注")
    follow_ups: list[PublicFollowupItem] = Field(default_factory=list, description="跟进记录")
    created_at: datetime = Field(description="创建时间")
    updated_at: datetime = Field(description="更新时间")

    model_config = ConfigDict(from_attributes=True)


__all__ = [
    "LeadStatusType",
    "PublicCommunitySearchItem",
    "PublicConsultantContact",
    "PublicConsultantInfo",
    "PublicFollowupItem",
    "PublicLeadCreate",
    "PublicLeadDetail",
    "PublicLeadListItem",
    "PublicLeadListResponse",
    "PublicLeadResponse",
    "PublicLoginResponse",
    "PublicLogoutResponse",
    "PublicMediaItem",
    "PublicPhoneCreate",
    "PublicPhoneResponse",
    "PublicPhoneUpdate",
    "PublicPlatformStats",
    "PublicProfileUpdate",
    "PublicProjectDetail",
    "PublicProjectFilter",
    "PublicProjectListItem",
    "PublicProjectListResponse",
    "PublicRefreshTokenRequest",
    "PublicRegisterRequest",
    "PublicRegisterResponse",
    "PublicRenovationStage",
    "PublicSoldProjectItem",
    "PublicSoldProjectListResponse",
    "PublicUserInfo",
    "PublicUserProfileResponse",
]
