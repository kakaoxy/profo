"""工作台 widget 注册表（迭代二 SPEC §8.3 / §6.4）.

**span 归属**（K14）：由前端注册表决定栅格宽度，后端 ``default_span`` 仅用于
管理端预览展示（设计稿布局页要显示「满宽 / N 栏」）。布局 JSON 只存
``key / order / enabled``，不存 span —— 避免布局数据破坏栅格。

**可见性判定 = permission 与 roles 的「与」关系**：
- ``permission``：用户须持有该权限码（K15 权限硬门控）；
- ``roles``：该 widget 只在这些角色的视角出现（设计稿 widget 矩阵的三列）。

为什么两者都要：``user`` 角色恰好持有 ``ledger:read``（``migrations/_seeds.py``），
若只看权限码，业务员视角会出现「资金概览」，与设计稿矩阵「finance_summary 仅 admin」
冲突，且违反验收 A8「布局不能授予权限」的意图。``roles`` 是布局层的兜底，
不是替代权限校验——两者任一不满足即剔除。
"""

from dataclasses import dataclass, field

# 角色默认布局的代码兜底（K11 第三级：system_configs 缺行/损坏时使用）
# 与 SPEC §8.3 表完全一致：admin 10 / operator 8 / user 3
WORKBENCH_ROLE_DEFAULTS: dict[str, tuple[str, ...]] = {
    "admin": (
        "project_overview",
        "leads_funnel",
        "alert_card",
        "todo_board_summary",
        "growth_overview",
        "finance_summary",
        "audit_summary",
        "monitor_projects",
        "leads_table",
        "quick_entry",
    ),
    "operator": (
        "project_overview",
        "leads_funnel",
        "alert_card",
        "todo_board_summary",
        "growth_overview",
        "monitor_projects",
        "leads_table",
        "quick_entry",
    ),
    "user": ("quick_entry", "my_projects", "my_todos"),
}

# 常用角色集合（避免重复字面量）
_ALL_ROLES = frozenset({"admin", "operator", "user"})
_STAFF_ROLES = frozenset({"admin", "operator"})


@dataclass(frozen=True, slots=True)
class WidgetSpec:
    """单个 widget 的注册信息."""

    key: str
    label: str
    description: str
    permission: str | None
    default_span: int
    roles: frozenset[str] = field(default=_ALL_ROLES)


# 12 个 widget（顺序与 SPEC §8.3 表一致；roles 严格按设计稿矩阵）
WORKBENCH_WIDGETS: dict[str, WidgetSpec] = {
    "project_overview": WidgetSpec(
        key="project_overview",
        label="项目总览",
        description="签约/装修/在售/已成交计数",
        permission="project:read",
        default_span=3,
        roles=_STAFF_ROLES,
    ),
    "leads_funnel": WidgetSpec(
        key="leads_funnel",
        label="线索漏斗",
        description="总线索→评估→看房→签约",
        permission="lead:read",
        default_span=3,
        roles=_STAFF_ROLES,
    ),
    "alert_card": WidgetSpec(
        key="alert_card",
        label="待评估提醒",
        description="待评估线索数与最久等待",
        permission="lead:write",
        default_span=3,
        roles=_STAFF_ROLES,
    ),
    "todo_board_summary": WidgetSpec(
        key="todo_board_summary",
        label="项目待办",
        description="待办项目数/待办总数/P0/最深逾期",
        permission="project:read",
        default_span=3,
        roles=_STAFF_ROLES,
    ),
    "growth_overview": WidgetSpec(
        key="growth_overview",
        label="获客总览",
        description="新增线索 + 转化率 + 分享带来 + 14 日趋势",
        permission="recruit:read",
        default_span=6,
        roles=_STAFF_ROLES,
    ),
    "finance_summary": WidgetSpec(
        key="finance_summary",
        label="资金概览",
        description="净现金流 / 在投 / 本月回款",
        permission="ledger:read",
        default_span=6,
        roles=frozenset({"admin"}),
    ),
    "audit_summary": WidgetSpec(
        key="audit_summary",
        label="审计概览",
        description="今日操作数/敏感访问/登录失败 + 动作分布",
        permission="operation_log:read",
        default_span=6,
        roles=frozenset({"admin"}),
    ),
    "monitor_projects": WidgetSpec(
        key="monitor_projects",
        label="重点监控项目",
        description="横向项目卡（现状逻辑）",
        permission="project:read",
        default_span=12,
        roles=_STAFF_ROLES,
    ),
    "leads_table": WidgetSpec(
        key="leads_table",
        label="最近线索",
        description="最近 5 条线索表格",
        permission="lead:read",
        default_span=12,
        roles=_STAFF_ROLES,
    ),
    "quick_entry": WidgetSpec(
        key="quick_entry",
        label="快捷入口",
        description="常用操作入口，子项各自鉴权",
        permission=None,
        default_span=12,
        roles=_ALL_ROLES,
    ),
    "my_projects": WidgetSpec(
        key="my_projects",
        label="我负责的项目",
        description="按业务身份返回负责的项目",
        permission=None,
        default_span=12,
        roles=frozenset({"user"}),
    ),
    "my_todos": WidgetSpec(
        key="my_todos",
        label="我的待办",
        description="mine 范围的项目待办",
        permission=None,
        default_span=12,
        roles=frozenset({"user"}),
    ),
}


__all__ = [
    "WORKBENCH_ROLE_DEFAULTS",
    "WORKBENCH_WIDGETS",
    "WidgetSpec",
]
