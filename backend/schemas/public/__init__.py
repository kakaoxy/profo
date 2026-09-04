"""C端公开接口 Pydantic Schema."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from models.common import RenovationStage
from models.marketing.l4_marketing import MarketingProjectStatus, PhotoCategory
from schemas.reports.market import (
    DistributionResponse,
    KpiData,
    PriceDistributionResponse,
    TrendDataPoint,
)
from utils.auth.password import validate_password_strength

_MAX_IMAGE_URL_LENGTH = 500


class PublicProjectFilter(BaseModel):
    """C端项目筛选参数."""

    project_status: MarketingProjectStatus | None = Field(None, description="项目状态筛选")
    keyword: str | None = Field(None, description="搜索关键词(模糊匹配小区名或商圈)")
    layout: str | None = Field(None, description="户型筛选(前缀模糊匹配)")
    min_price: float | None = Field(None, description="最低总价(万)")
    max_price: float | None = Field(None, description="最高总价(万)")
    min_area: float | None = Field(None, description="最小面积(m²)")
    max_area: float | None = Field(None, description="最大面积(m²)")
    min_floor: int | None = Field(None, ge=1, description="最小所在楼层")
    max_floor: int | None = Field(None, ge=1, description="最大所在楼层")
    sort_by: str = Field("sort_order", description="排序字段(默认权重 sort_order)")
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
        """校验密码复杂度（复用 utils.auth.password.validate_password_strength）."""
        ok, msg = validate_password_strength(v)
        if not ok:
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
    # 用户有效权限集（主角色 + 附加角色权限并集），从 role_permissions 关联表派生，
    # 非 ORM User 字段，需在路由层通过 permission_service 填充；默认空列表以保持
    # register/login 响应向后兼容
    permissions: list[str] = Field(
        default_factory=list,
        description="用户有效权限代码列表（主角色+附加角色权限并集）",
    )

    model_config = ConfigDict(from_attributes=True)


class PublicRegisterResponse(BaseModel):
    """C端注册响应."""

    access_token: str = Field(description="访问令牌")
    refresh_token: str = Field(description="刷新令牌")
    token_type: str = Field(default="bearer", description="令牌类型")
    expires_in: int = Field(description="访问令牌过期时间(秒)")
    user: PublicUserInfo = Field(description="用户信息")


class PublicLoginResponse(BaseModel):
    """C端登录响应.

    内部员工合并账号后需同时持有 admin 与 C 端令牌：
    - admin 令牌存于 access_token/refresh_token（供后台接口使用）
    - C 端令牌存于 c_access_token/c_refresh_token（供 /public/* 接口使用）
    外部用户仅签发 C 端令牌（存于 access_token/refresh_token），c_* 字段为 None。
    """

    access_token: str = Field(description="访问令牌")
    refresh_token: str = Field(description="刷新令牌")
    token_type: str = Field(default="bearer", description="令牌类型")
    expires_in: int = Field(description="访问令牌过期时间(秒)")
    user: PublicUserInfo | None = Field(None, description="用户信息")
    c_access_token: str | None = Field(None, description="C端访问令牌（仅内部员工合并后返回）")
    c_refresh_token: str | None = Field(None, description="C端刷新令牌（仅内部员工合并后返回）")


class PublicRefreshTokenRequest(BaseModel):
    """C端刷新令牌请求."""

    refresh_token: str = Field(max_length=2048, description="刷新令牌")


class PublicLogoutResponse(BaseModel):
    """C端登出响应."""

    message: str = Field(description="提示信息")


class PublicProfileUpdate(BaseModel):
    """C端个人信息更新请求."""

    nickname: str = Field(min_length=1, max_length=100, description="昵称")


class WechatProfileUpdateRequest(BaseModel):
    """微信小程序用户完善资料请求（头像和/或昵称）.

    用户通过 <button open-type="chooseAvatar"> 与 <input type="nickname">
    主动授权后调用。nickname 与 avatar_url 均为可选，但至少一个非空：
    - 仅传 nickname：派生 username 并更新 nickname（用于昵称独立授权）
    - 仅传 avatar_url：仅更新 avatar（用于头像独立授权）
    - 同时传：两者都更新

    username 由后端根据 nickname 派生，不暴露给前端。
    """

    nickname: str | None = Field(
        None, min_length=1, max_length=100, description="微信昵称（可选，与 avatar_url 至少一个非空）"
    )
    avatar_url: str | None = Field(
        None,
        min_length=1,
        max_length=500,
        description="已上传到 /public/files/upload 的图片访问 URL（可选，与 nickname 至少一个非空）",
    )

    @model_validator(mode="after")
    def _at_least_one_field(self) -> "WechatProfileUpdateRequest":
        """至少一个字段非空，否则 422."""
        if not self.nickname and not self.avatar_url:
            msg = "nickname 与 avatar_url 至少一个非空"
            raise ValueError(msg)
        return self


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
    cover_thumbnail_url: str | None = Field(None, description="封面缩略图URL")
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
    completed_date: str | None = Field(default=None, description="阶段完成日期 YYYY-MM-DD")


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
    """C端顾问联系方式.

    该端点专供 C 端客户直接联系顾问（拨打/复制），返回真实手机号，
    不做脱敏；名称中的「脱敏」仅适用于列表/详情里的 PublicConsultantInfo。
    """

    phone: str = Field(description="顾问手机号(真实，供客户拨打联系)")
    wechat_number: str = Field(description="微信号(当前复用顾问手机号)")
    nickname: str = Field(description="昵称")
    avatar: str | None = Field(None, description="头像URL")
    is_referrer: bool = Field(default=False, description="是否命中内部分享人(角色标签：True=分享人，False=房源顾问)")


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
    cover_thumbnail_url: str | None = Field(None, description="封面缩略图URL")
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
    total_sold: int = Field(description="累计成交数")


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
    community_id: str | None = Field(None, max_length=36, description="关联小区ID")
    district: str | None = Field(None, max_length=50, description="行政区")
    business_area: str | None = Field(None, max_length=50, description="商圈")
    layout: str | None = Field(None, description="户型")
    area: float | None = Field(None, gt=0, description="面积(m²)")
    floor_info: str = Field(min_length=1, max_length=50, description="楼层信息")
    orientation: str | None = Field(None, description="朝向")
    remarks: str | None = Field(None, description="备注")
    expected_price: float | None = Field(None, gt=0, description="业主心理预期价(万)，选填")
    images: list[str] = Field(default_factory=list, max_length=6, description="户型图URL列表")
    referrer: str | None = Field(None, max_length=36, description="分享归属员工ID")

    @field_validator("images")
    @classmethod
    def validate_images(cls, v: list[str]) -> list[str]:
        """校验户型图 URL：允许相对路径（/开头，上传接口返回格式）或 http(s) URL，过滤脏数据."""
        for url in v:
            if not url.strip():
                msg = "图片 URL 不能为空"
                raise ValueError(msg)
            if url.startswith("/"):
                if len(url) > _MAX_IMAGE_URL_LENGTH:
                    msg = "图片 URL 过长"
                    raise ValueError(msg)
            elif not url.startswith(("http://", "https://")):
                msg = f"无效的图片 URL: {url}"
                raise ValueError(msg)
        return v


LeadStatusType = Literal[
    "pending_assessment",
    "pending_visit",
    "rejected",
    "visited",
    "signed",
    "lost_to_competitor",
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
    expected_price: float | None = Field(None, description="业主心理预期价(万)")
    status: LeadStatusType = Field(description="状态")
    remarks: str | None = Field(None, description="备注")
    images: list[str] = Field(default_factory=list, description="户型图URL列表")
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
    expected_price: float | None = Field(None, description="业主心理预期价(万)")
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


class PublicLeadCountResponse(BaseModel):
    """C端线索总数响应."""

    total: int = Field(description="未删除线索总条数")


class PublicAcquiredLeadListItem(BaseModel):
    """C端员工获客线索列表项."""

    id: str = Field(description="线索ID")
    community_name: str = Field(description="小区名称")
    layout: str | None = Field(None, description="户型")
    area: float | None = Field(None, description="面积(m²)")
    expected_price: float | None = Field(None, description="业主心理预期价(万)")
    status: LeadStatusType = Field(description="状态代码")
    status_display: str = Field(description="状态显示名称")
    status_color: str = Field(description="状态颜色")
    source: Literal["customer_share", "employee_entry"] = Field(description="来源：分享归因/员工直接录入")
    phone_masked: str | None = Field(None, description="客户手机号(脱敏)，仅分享归因且客户有手机号时返回")
    created_at: datetime = Field(description="创建时间")

    model_config = ConfigDict(from_attributes=True)


class PublicAcquiredLeadListResponse(BaseModel):
    """C端员工获客线索列表响应."""

    items: list[PublicAcquiredLeadListItem] = Field(description="线索列表")
    total: int = Field(description="总记录数")
    page: int = Field(description="当前页码")
    page_size: int = Field(description="每页数量")


class PublicAcquiredLeadStatsResponse(BaseModel):
    """C端员工获客线索状态统计响应."""

    total: int = Field(description="获客线索总数")
    pending_assessment: int = Field(description="待评估数量")
    pending_visit: int = Field(description="待看房数量")
    visited: int = Field(description="已看房数量")
    signed: int = Field(description="已签约数量")
    rejected: int = Field(description="已放弃数量")
    lost_to_competitor: int = Field(description="他司已成交数量")


class PublicAcquiredLeadPhoneResponse(BaseModel):
    """C端员工获客线索客户手机号响应."""

    phone: str | None = Field(None, description="客户真实手机号（直接录入或非分享归因线索为 null）")


class PublicFollowupItem(BaseModel):
    """C端跟进记录项."""

    id: str = Field(description="跟进记录ID")
    method: str = Field(description="跟进方式（含合成类型 evaluation=出评估价）")
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
    expected_price: float | None = Field(None, description="业主心理预期价(万)")
    status: LeadStatusType = Field(description="状态代码")
    status_display: str = Field(description="状态显示名称")
    status_color: str = Field(description="状态颜色")
    remarks: str | None = Field(None, description="备注")
    images: list[str] = Field(default_factory=list, description="户型图URL列表")
    image_thumbnails: list[str] | None = Field(None, description="户型图缩略图URL列表")
    follow_ups: list[PublicFollowupItem] = Field(default_factory=list, description="跟进记录")
    created_at: datetime = Field(description="创建时间")
    updated_at: datetime = Field(description="更新时间")

    model_config = ConfigDict(from_attributes=True)


class PublicProjectBookingCreate(BaseModel):
    """C端房源预约创建请求.

    visitor_id 为可选归因键：前端生成并缓存于 storage 的匿名访客 ID，
    用于回查该访客最近一次带 referrer 的 project_visits 埋点完成分享归因；
    未提供或无匹配埋点时 referrer_user_id 为空。
    """

    marketing_project_id: int = Field(description="房源ID")
    visitor_id: str | None = Field(None, max_length=64, description="匿名访客ID(分享归因用，可选)")


class PublicProjectBookingItem(BaseModel):
    """C端房源预约列表项（含房源快照字段）."""

    id: int = Field(description="预约ID")
    marketing_project_id: int = Field(description="房源ID")
    project_title: str = Field(description="房源标题")
    community_name: str | None = Field(None, description="小区名称")
    cover_image: str | None = Field(None, description="封面图URL")
    layout: str = Field(description="户型")
    total_price: float = Field(description="总价(万元)")
    created_at: datetime = Field(description="预约时间")


class PublicProjectBookingResponse(BaseModel):
    """C端房源预约创建响应.

    组合式而非平铺：is_new 是「本次请求是否新建」的操作元信息而非记录字段，
    嵌套 booking 与 PublicLoginResponse 嵌套 user 的风格一致，
    同时保持 PublicProjectBookingItem 可复用于列表响应。
    """

    booking: PublicProjectBookingItem = Field(description="预约记录(含房源快照)")
    is_new: bool = Field(description="本次请求是否新建预约（幂等命中既有记录时为 false）")


class PublicCustomerBookingItem(BaseModel):
    """C端「归属我的预约客户」列表项（房源分享归因，员工侧我的客户）."""

    id: int = Field(description="预约ID")
    marketing_project_id: int = Field(description="房源ID")
    project_title: str = Field(description="房源标题")
    community_name: str | None = Field(None, description="小区名称")
    cover_image: str | None = Field(None, description="封面图URL")
    layout: str | None = Field(None, description="户型")
    total_price: float | None = Field(None, description="总价(万元)")
    customer_phone_masked: str = Field(description="客户手机号(脱敏，前3后4，中间****；无手机号时空串)")
    created_at: datetime = Field(description="预约时间")


class PublicVisitEventRequest(BaseModel):
    """C端访问埋点上报请求（免登录，房源/评估共用）.

    visitor_id 为前端生成并缓存于 storage 的匿名访客 ID（UV 去重键）；
    referrer 非空即原样落库（与招募 visit 口径一致，不做内部用户校验）。
    """

    visitor_id: str = Field(min_length=1, max_length=64, description="匿名访客ID(UV去重键，前端生成)")
    referrer: str | None = Field(None, max_length=36, description="来源员工ID(分享参数透传)")
    source: str | None = Field(None, max_length=20, description="进入渠道")


class PublicShareEventRequest(BaseModel):
    """C端分享事件上报请求（需登录，房源/评估共用）."""

    share_type: Literal["card", "timeline"] = Field(description="分享方式：card(转发)/timeline(朋友圈)")


class PublicTrackingEventResponse(BaseModel):
    """C端埋点事件写入响应（访问/分享共用）."""

    id: int = Field(description="事件记录ID")


class PublicShareStatsResponse(BaseModel):
    """C端「我的分享统计」响应（房源/评估共用，今日 + 累计）."""

    share_count: int = Field(description="分享次数(累计)")
    pv: int = Field(description="经我分享的打开次数 PV(累计)")
    uv: int = Field(description="经我分享的打开人数 UV(visitor_id 去重，累计)")
    lead_count: int = Field(description="留资数(累计；房源=归属我的预约，评估=分享归因我的线索)")
    today_share_count: int = Field(description="今日分享次数(Asia/Shanghai 自然日)")
    today_pv: int = Field(description="今日打开次数 PV")
    today_uv: int = Field(description="今日打开人数 UV")
    today_lead_count: int = Field(description="今日留资数")


class PublicValuationSubscribeTemplateResponse(BaseModel):
    """C端估价订阅消息模板下发响应（授权价变更提醒）."""

    subscribe_template_id: str | None = Field(
        description="订阅消息模板 ID（后端未配置时为 null，前端据此隐藏授权入口）",
    )


class PublicCommunityBrief(BaseModel):
    """C端小区分析响应中的小区基本信息."""

    community_id: str = Field(description="小区ID")
    community_name: str = Field(description="小区名称")
    business_circle: str = Field(description="商圈")
    district: str = Field(description="行政区")

    model_config = ConfigDict(from_attributes=True)


class PublicCommunityAnalysisResponse(BaseModel):
    """C端小区成交分析响应."""

    community: PublicCommunityBrief = Field(
        description="小区基本信息（community_id/community_name/business_circle/district）",
    )
    kpi: KpiData = Field(description="KPI 卡片聚合")
    trend: list[TrendDataPoint] = Field(description="成交趋势")
    price_distribution: PriceDistributionResponse = Field(description="价格分布")
    rooms_distribution: DistributionResponse = Field(description="户型分布")
    floor_distribution: DistributionResponse = Field(description="楼层分布")
    main_layout: str | None = Field(None, description="主力户型（近 12 月成交占比最高）")

    model_config = ConfigDict(from_attributes=True)


__all__ = [
    "LeadStatusType",
    "PublicAcquiredLeadListItem",
    "PublicAcquiredLeadListResponse",
    "PublicAcquiredLeadPhoneResponse",
    "PublicAcquiredLeadStatsResponse",
    "PublicCommunityAnalysisResponse",
    "PublicCommunityBrief",
    "PublicCommunitySearchItem",
    "PublicConsultantContact",
    "PublicConsultantInfo",
    "PublicCustomerBookingItem",
    "PublicFollowupItem",
    "PublicLeadCountResponse",
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
    "PublicProjectBookingCreate",
    "PublicProjectBookingItem",
    "PublicProjectBookingResponse",
    "PublicProjectDetail",
    "PublicProjectFilter",
    "PublicProjectListItem",
    "PublicProjectListResponse",
    "PublicRefreshTokenRequest",
    "PublicRegisterRequest",
    "PublicRegisterResponse",
    "PublicRenovationStage",
    "PublicShareEventRequest",
    "PublicShareStatsResponse",
    "PublicSoldProjectItem",
    "PublicSoldProjectListResponse",
    "PublicTrackingEventResponse",
    "PublicUserInfo",
    "PublicUserProfileResponse",
    "PublicVisitEventRequest",
    "WechatProfileUpdateRequest",
]
