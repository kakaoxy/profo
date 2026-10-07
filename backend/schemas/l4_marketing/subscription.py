"""房源订阅通知 Schema（C 端订阅模板下发 / 状态查询 / 授权结果上报）.

对齐 routers/public/valuations.py 的 subscribe-template 先例：
模板下发 skipAuth（未配置返回 enabled:false，前端隐藏入口）；
状态查询与上报需 C 端登录态（c_access_token，aud=c）。
"""

from datetime import datetime

from pydantic import BaseModel, Field


class PublicMarketingSubscribeTemplateResponse(BaseModel):
    """订阅模板下发响应（免登录，未配置时 enabled=false）."""

    subscribe_enabled: bool = Field(description="订阅功能是否开启（任一模板已配置）")
    new_listing_template_id: str | None = Field(default=None, description="上新提醒模板ID（未配置为 null）")
    price_change_template_id: str | None = Field(default=None, description="调价提醒模板ID（未配置为 null）")


class PublicMarketingSubscriptionStatusResponse(BaseModel):
    """订阅额度状态响应（当前登录用户）."""

    new_listing_quota: int = Field(default=0, description="上新提醒剩余额度")
    price_change_quota: int = Field(default=0, description="调价提醒剩余额度")
    last_subscribed_at: datetime | None = Field(default=None, description="最近一次订阅授权时间")


class SubscribeReportItem(BaseModel):
    """单条订阅授权结果（对齐 wx.requestSubscribeMessage 返回项）."""

    template_id: str = Field(min_length=1, max_length=64, description="模板ID")
    status: str = Field(description="授权结果: accept/reject/ban/filter")


class PublicMarketingSubscribeReportRequest(BaseModel):
    """订阅授权结果上报请求（仅 accept 计入额度）."""

    results: list[SubscribeReportItem] = Field(min_length=1, max_length=5, description="授权结果列表")


class PublicMarketingSubscribeReportResponse(BaseModel):
    """订阅授权结果上报响应（返回累计后的额度）."""

    new_listing_quota: int = Field(default=0, description="上新提醒剩余额度")
    price_change_quota: int = Field(default=0, description="调价提醒剩余额度")


class PublicMarketingProjectSubscriptionStatusResponse(BaseModel):
    """房源级订阅状态响应（当前登录用户 × 指定房源）."""

    subscribed: bool = Field(description="是否已订阅（存在订阅行）")
    price_change_quota: int = Field(default=0, ge=0, description="房源级调价提醒剩余额度")
    last_subscribed_at: datetime | None = Field(default=None, description="最近一次订阅授权时间")


class PublicMarketingNotifySummary(BaseModel):
    """admin 营销列表通知统计（详情 Sheet 数据源）."""

    new_listing_count: int = Field(default=0, description="上新通知成功送达人数")
    price_change_count: int = Field(default=0, description="调价通知成功送达人数")


class L4MarketingSubscriptionStatsResponse(BaseModel):
    """订阅漏斗全局统计（admin 端点 GET /admin/marketing/subscription-stats）.

    P2-1（房源级订阅）落地后同方法扩展 project_level_subscribers / project_level_watches。
    """

    new_listing_subscribers: int = Field(
        ge=0,
        description="上新频道剩余额度>0人数（可触达）",
    )
    price_change_subscribers: int = Field(
        ge=0,
        description="调价频道剩余额度>0人数（可触达）",
    )
    total_subscribers: int = Field(ge=0, description="任一频道订阅过的人数（总行数）")
    total_new_quota: int = Field(ge=0, description="上新频道额度池总量")
    total_price_quota: int = Field(ge=0, description="调价频道额度池总量")
    project_level_subscribers: int = Field(
        default=0,
        ge=0,
        description="房源级订阅人数（去重 user_id；P2-1 落地后启用）",
    )
    project_level_watches: int = Field(
        default=0,
        ge=0,
        description="房源级订阅关系总数（P2-1 落地后启用）",
    )
