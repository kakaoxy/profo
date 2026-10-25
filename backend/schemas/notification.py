"""通知中心 Schema（迭代二 SPEC §6.1）.

成功响应裸返回 Pydantic 模型；错误响应统一 ``{"code":≠0,"message":"..."}``
（由 ``error_handlers.py`` 既有处理器产出）。
"""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# 渠道与状态字面量（与 models.notification 常量保持一致）
DeliveryStatus = Literal["success", "skipped", "failed"]
NotificationPriority = Literal["low", "normal", "high", "urgent"]
NotificationCategory = Literal[
    "lead",
    "growth",
    "project",
    "key",
    "marketing",
    "finance",
    "system",
    "security",
]


class NotificationDeliveryInfo(BaseModel):
    """最新一次微信投递结果（读 recipients.delivery_status 快照，不查日志表）."""

    status: DeliveryStatus = Field(description="投递状态：success/skipped/failed")
    error_code: str | None = Field(None, description="错误码：TEMPLATE_MISSING/NO_OPENID/WECHAT_ERROR")


class NotificationDeliverySnapshot(BaseModel):
    """投递状态快照外层结构（recipients.delivery_status 列的原样形状）."""

    wechat: NotificationDeliveryInfo | None = Field(None, description="微信渠道结果")


class NotificationListItem(BaseModel):
    """通知列表项."""

    id: uuid.UUID = Field(description="通知ID")
    category: str = Field(description="分类")
    type: str = Field(description="事件类型")
    title: str = Field(description="标题")
    body: str | None = Field(None, description="正文摘要")
    action_type: str | None = Field(None, description="点击行为：route/miniapp/none")
    action_url: str | None = Field(None, description="点击跳转地址")
    priority: NotificationPriority = Field(description="优先级")
    read_at: datetime | None = Field(None, description="已读时间（NULL=未读）")
    created_at: datetime = Field(description="创建时间")
    payload: dict[str, Any] | None = Field(None, description="结构化附加数据")
    delivery: NotificationDeliverySnapshot | None = Field(
        None, description="最新微信投递结果（设计稿消息行右侧状态点）"
    )
    model_config = ConfigDict(from_attributes=True)


class NotificationListResponse(BaseModel):
    """通知列表响应."""

    items: list[NotificationListItem] = Field(description="当前页数据")
    total: int = Field(description="筛选后总数")
    page: int = Field(description="页码")
    page_size: int = Field(description="每页数量")
    unread_total: int = Field(description="当前用户全量未读数（不随筛选变化）")
    unread_in_filter: int = Field(description="当前筛选条件下的未读数（tabs 角标）")


class UnreadCountResponse(BaseModel):
    """未读统计响应."""

    total: int = Field(description="未读总数")
    by_category: dict[str, int] = Field(default_factory=dict, description="按分类的未读数")
    total_by_category: dict[str, int] = Field(
        default_factory=dict, description="按分类的总数（抽屉 tabs 在未读为 0 时显示）"
    )


class NotificationReadResponse(BaseModel):
    """单条已读响应（幂等：重复调用返回同一 read_at）."""

    id: uuid.UUID = Field(description="通知ID")
    read_at: datetime = Field(description="已读时间")


class MarkAllReadRequest(BaseModel):
    """全部已读请求（可按分类收敛）."""

    category: NotificationCategory | None = Field(None, description="仅该分类；省略=全部")


class MarkAllReadResponse(BaseModel):
    """全部已读响应."""

    affected: int = Field(description="实际更新条数")


class PreferenceCategory(BaseModel):
    """单个分类的偏好与可用性."""

    label: str = Field(description="中文名")
    description: str = Field(description="说明文案")
    in_app: bool = Field(description="站内信开关")
    wechat: bool = Field(description="微信开关")
    in_app_locked: bool = Field(description="站内信是否锁定（system/security 恒 True）")
    wechat_only: bool = Field(description="是否仅微信（marketing 为 True，站内信开关置灰）")
    wechat_template_missing: bool = Field(description="该分类的微信模板是否未配置（True 时置灰）")
    model_config = ConfigDict(from_attributes=True)


class NotificationPreferencesResponse(BaseModel):
    """偏好读取/保存响应."""

    categories: dict[str, PreferenceCategory] = Field(description="8 个分类的完整配置")
    wechat_available: bool = Field(description="微信渠道整体是否可用（未绑定微信则为 False）")
    template_missing_count: int = Field(description="5 个订阅模板中未配置的个数（横幅文案）")


class NotificationPreferencesUpdateRequest(BaseModel):
    """偏好保存请求（分类 × 渠道全量提交；未列出的分类保持默认全开）."""

    categories: dict[str, dict[str, bool]] = Field(description='形如 {"lead": {"in_app": true, "wechat": false}}')


__all__ = [
    "MarkAllReadRequest",
    "MarkAllReadResponse",
    "NotificationCategory",
    "NotificationDeliveryInfo",
    "NotificationDeliverySnapshot",
    "NotificationListItem",
    "NotificationListResponse",
    "NotificationPreferencesResponse",
    "NotificationPreferencesUpdateRequest",
    "NotificationPriority",
    "NotificationReadResponse",
    "PreferenceCategory",
    "UnreadCountResponse",
]
