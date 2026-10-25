"""通知事件字典（迭代二 SPEC §5.1）.

12 条事件 = 站内信有 UI 的 5 条 + 触发点延后的 3 条 + 仅审计的 3 条 + 系统告警 1 条。
字典是**唯一事实源**：新增事件必须先在此登记，否则 ``NotificationService.emit`` 抛
``ValueError``（Fail Loud，不静默丢事件）。
"""

from dataclasses import dataclass
from enum import StrEnum
from typing import Literal

# 通知分类（与前端偏好页 8 分类、消息中心 tabs 一一对应）
Category = Literal[
    "lead",
    "growth",
    "project",
    "key",
    "marketing",
    "finance",
    "system",
    "security",
]

# 优先级
Priority = Literal["low", "normal", "high", "urgent"]

# 点击行为
ActionType = Literal["route", "miniapp", "none"]


class EventType(StrEnum):
    """事件类型（值即站内信 ``notifications.type`` 列）."""

    LEAD_ASSIGNED = "lead.assigned"
    LEAD_STATUS_CHANGED = "lead.status_changed"
    CUSTOMER_NEW = "customer.new"
    CUSTOMER_STATUS_CHANGED = "customer.status_changed"
    RECRUIT_NEW_LEAD = "recruit.new_lead"
    PROJECT_TODO_DUE = "project.todo_due"
    PROJECT_STATUS_CHANGED = "project.status_changed"
    KEY_SHARE_VIEWED = "key.share_viewed"
    SYSTEM_ALERT = "system.alert"
    MARKETING_PUBLISHED = "marketing.published"
    MARKETING_PRICE_CHANGED = "marketing.price_changed"
    LEAD_EVAL_PRICE_CHANGED = "lead.eval_price_changed"


@dataclass(frozen=True, slots=True)
class EventSpec:
    """单个事件的投递规格.

    Attributes:
        type: 事件类型
        category: 分类（偏好页按此聚合开关）
        priority: 优先级
        in_app: 是否建站内信（K6：C 端事件为 False）
        wechat: 是否尝试微信渠道
        dedupe_template: 去重键模板，占位符由 ``dedupe_fields`` 填充
        title_template: 标题模板，占位符由 ``fields`` 填充
        body_template: 正文模板（None 表示无正文）
        action_type: 点击行为
        action_template: 跳转地址模板（None 表示不可点击）
        closeable: 用户是否可关闭该类站内信（system/security 恒 False，K5）

    """

    type: EventType
    category: Category
    priority: Priority
    in_app: bool
    wechat: bool
    dedupe_template: str
    title_template: str
    body_template: str | None
    action_type: ActionType
    action_template: str | None
    closeable: bool


# 事件字典：顺序与 SPEC §5.1 表一致（便于逐行核对）
EVENT_SPECS: dict[EventType, EventSpec] = {
    EventType.LEAD_ASSIGNED: EventSpec(
        type=EventType.LEAD_ASSIGNED,
        category="lead",
        priority="high",
        in_app=True,
        wechat=False,
        dedupe_template="lead:{module}:{id}:assigned:{user_id}",
        title_template="线索已分配给你：{community}",
        body_template="由 {assigner} 分配 · 状态 {status}",
        action_type="route",
        action_template="/admin/leads",
        closeable=True,
    ),
    EventType.LEAD_STATUS_CHANGED: EventSpec(
        type=EventType.LEAD_STATUS_CHANGED,
        category="lead",
        priority="normal",
        in_app=True,
        wechat=True,
        dedupe_template="lead:{id}:status:{status}",
        title_template="线索状态变更：{community} → {status_label}",
        body_template="由 {operator} 更新",
        action_type="route",
        action_template="/admin/leads",
        closeable=True,
    ),
    EventType.CUSTOMER_NEW: EventSpec(
        type=EventType.CUSTOMER_NEW,
        category="growth",
        priority="normal",
        in_app=True,
        wechat=True,
        dedupe_template="customer:{module}:{id}:new:{user_id}",
        title_template="新客户线索：{module_label} · {community}",
        body_template="分享链接带来新客户",
        action_type="route",
        action_template="/admin/growth-center/leads",
        closeable=True,
    ),
    EventType.CUSTOMER_STATUS_CHANGED: EventSpec(
        type=EventType.CUSTOMER_STATUS_CHANGED,
        category="growth",
        priority="normal",
        in_app=True,
        wechat=True,
        dedupe_template="customer:{module}:{id}:status:{status}",
        title_template="客户状态变更：{community} → {status_label}",
        body_template="模块：{module_label}",
        action_type="route",
        action_template="/admin/growth-center/leads",
        closeable=True,
    ),
    EventType.RECRUIT_NEW_LEAD: EventSpec(
        type=EventType.RECRUIT_NEW_LEAD,
        category="growth",
        priority="high",
        in_app=True,
        wechat=True,
        dedupe_template="recruit:{lead_id}:new:{user_id}",
        title_template="新推荐线索：{summary}",
        body_template="小程序推荐人 · 待确认归属",
        action_type="route",
        action_template="/admin/growth-center/leads",
        closeable=True,
    ),
    EventType.PROJECT_TODO_DUE: EventSpec(
        type=EventType.PROJECT_TODO_DUE,
        category="project",
        priority="normal",
        in_app=True,
        wechat=False,
        dedupe_template="todo:{rule}:{project_id}:{date}:{user_id}",
        title_template="项目待办到期：{community}",
        body_template="{todo_title}",
        action_type="route",
        action_template="/admin/projects/todo-board",
        closeable=True,
    ),
    EventType.PROJECT_STATUS_CHANGED: EventSpec(
        type=EventType.PROJECT_STATUS_CHANGED,
        category="project",
        priority="normal",
        in_app=True,
        wechat=False,
        dedupe_template="project:{id}:status:{status}",
        title_template="项目状态变更：{community} → {status_label}",
        body_template="由 {operator} 操作",
        action_type="route",
        action_template="/admin/projects",
        closeable=True,
    ),
    EventType.KEY_SHARE_VIEWED: EventSpec(
        type=EventType.KEY_SHARE_VIEWED,
        category="key",
        priority="low",
        in_app=True,
        wechat=False,
        dedupe_template="key-share:{share_id}:view:{view_id}",
        title_template="分享被查看：{project_name}",
        body_template="{viewer_name} 查看了密码",
        action_type="route",
        action_template="/admin/projects",
        closeable=True,
    ),
    EventType.SYSTEM_ALERT: EventSpec(
        type=EventType.SYSTEM_ALERT,
        category="security",
        priority="urgent",
        in_app=True,
        wechat=True,
        dedupe_template="alert:{fingerprint}",
        title_template="系统告警：{title}",
        body_template="{detail}",
        action_type="route",
        action_template="/admin/audit-logs",
        closeable=False,
    ),
    # ---- 以下 3 条为 C 端事件：仅写 delivery_logs 审计，不建收件记录（K6）----
    EventType.MARKETING_PUBLISHED: EventSpec(
        type=EventType.MARKETING_PUBLISHED,
        category="marketing",
        priority="normal",
        in_app=False,
        wechat=True,
        dedupe_template="marketing:{id}:published:{user_id}",
        title_template="房源上新：{title}",
        body_template=None,
        action_type="miniapp",
        action_template="pages/project/detail/index?id={id}",
        closeable=True,
    ),
    EventType.MARKETING_PRICE_CHANGED: EventSpec(
        type=EventType.MARKETING_PRICE_CHANGED,
        category="marketing",
        priority="normal",
        in_app=False,
        wechat=True,
        dedupe_template="marketing:{id}:price:{change_id}:{user_id}",
        title_template="房源调价：{title}",
        body_template=None,
        action_type="miniapp",
        action_template="pages/project/detail/index?id={id}",
        closeable=True,
    ),
    EventType.LEAD_EVAL_PRICE_CHANGED: EventSpec(
        type=EventType.LEAD_EVAL_PRICE_CHANGED,
        category="lead",
        priority="normal",
        in_app=False,
        wechat=True,
        dedupe_template="lead:{id}:eval:{eval_price}",
        title_template="评估价已更新：{community}",
        body_template="授权价 {eval_price} 万",
        action_type="miniapp",
        action_template="pages/valuation/detail/index?id={id}",
        closeable=True,
    ),
}


# 偏好页展示的 8 个分类元数据（SPEC §6.1：label/description/wechat_only）
CATEGORY_META: dict[str, dict[str, object]] = {
    "lead": {"label": "线索", "description": "线索分配、状态变更", "wechat_only": False},
    "growth": {"label": "获客", "description": "新客户线索、客户状态变更、招募推荐", "wechat_only": False},
    "project": {"label": "项目", "description": "项目状态流转、待办到期", "wechat_only": False},
    "key": {"label": "房源分享", "description": "分享链接被查看", "wechat_only": False},
    "marketing": {"label": "营销", "description": "C 端订阅通知，仅微信渠道，不产生站内信", "wechat_only": True},
    "finance": {"label": "资金", "description": "资金流水与结算异常", "wechat_only": False},
    "system": {"label": "系统", "description": "站内信不可关闭", "wechat_only": False},
    "security": {"label": "安全", "description": "站内信不可关闭", "wechat_only": False},
}

# 分类 → 与之绑定的微信模板 key（用于判断「该分类微信开关是否可用」，K18）
# None = 该分类没有独立模板（微信开关不可用）
CATEGORY_TEMPLATE_KEY: dict[str, str | None] = {
    "lead": "valuation_price",
    "growth": "customer_lead",
    "project": None,
    "key": None,
    "marketing": "project_new",
    "finance": None,
    "system": None,
    "security": None,
}


def get_spec(event_type: EventType | str) -> EventSpec:
    """按事件类型取规格.

    Args:
        event_type: 事件类型（枚举或字符串）

    Returns:
        事件规格。

    Raises:
        ValueError: 未登记的事件类型（Fail Loud，禁止静默丢弃）。

    """
    try:
        key = EventType(event_type)
    except ValueError as exc:
        msg = f"未登记的通知事件类型：{event_type}"
        raise ValueError(msg) from exc
    spec = EVENT_SPECS.get(key)
    if spec is None:
        msg = f"事件 {event_type} 已在 EventType 中但缺少 EVENT_SPECS 定义"
        raise ValueError(msg)
    return spec


def is_closeable_category(category: str) -> bool:
    """该分类的站内信是否允许用户关闭（K5：system/security 恒不可关）.

    Args:
        category: 通知分类

    Returns:
        True 表示可关闭。

    """
    return category not in ("system", "security")


__all__ = [
    "CATEGORY_META",
    "CATEGORY_TEMPLATE_KEY",
    "EVENT_SPECS",
    "ActionType",
    "Category",
    "EventSpec",
    "EventType",
    "Priority",
    "get_spec",
    "is_closeable_category",
]
