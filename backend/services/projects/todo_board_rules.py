"""项目待办规则引擎（纯函数）.

输入项目数据快照（ProjectFacts）+ 规则配置（TodoBoardRules）→ 输出待办草稿列表。
不访问 db、不依赖请求上下文，规则可独立验证。
规则口径：docs/2026-10-01-项目待办看板-spec.md §2.3；
配置化口径：docs/2026-10-02-待办看板规则配置-spec.md。
"""

import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Literal

from constants.project_todo import (
    BASIC_INFO_FIELD_NAMES,
    CORE_DOCUMENT_NAMES,
    MILESTONE_STAGES,
    R2_HINT_MAX_NAMES,
    R4_HINT_MAX_NAMES,
)

Priority = Literal["p0", "p1", "p2"]
Anchor = Literal["overview", "documents", "renovation_contract", "renovation_progress"]

_STATUS_SIGNING = "signing"
_STATUS_RENOVATING = "renovating"

FieldLevel = Literal["core", "minor", "off"]


@dataclass(frozen=True)
class TodoBoardRules:
    """待办规则阈值配置（system_configs 键 todo_board_rules 的结构化形态）."""

    milestone_days: dict[str, int]  # {工序: 交房后 N 天内须完成}
    milestone_p0_overdue_days: int  # 里程碑逾期超 N 天 P1→P0
    basic_info_grace_days: int  # R2：签约后 N 天仍缺基础信息才提示
    basic_info_fields: dict[str, FieldLevel]  # {字段: core|minor|off}
    company_grace_days: int  # R6：进入装修后未安排施工方宽限
    start_grace_days: int  # R7：进入装修后未实际开工宽限
    archive_overdue_days: int  # R4：签署后超 N 天未归档升 P1
    commission_near_days: int  # R10：委托期结束前 N 天进入临近窗口
    delivery_total_days: int  # 详情页 KPI 交付倒计时：交房日 + N 天 = 交付截止
    delivery_near_days: int  # 交付倒计时剩余 ≤ N 天橙色提示
    delivery_urgent_days: int  # 交付倒计时剩余 < N 天红色脉冲（判断优先于橙色）

    @classmethod
    def defaults(cls) -> "TodoBoardRules":
        """代码内默认值（= 设计稿 ARTBOARD 00-A 默认列；system_configs 缺行时回退）.

        木瓦/油漆/交付为占位值，随配置化交由业务在弹窗内校准。
        """
        milestone_defaults = dict(zip(MILESTONE_STAGES, (7, 3, 14, 30, 45, 60), strict=True))
        field_defaults = dict.fromkeys(BASIC_INFO_FIELD_NAMES[:4], "core") | dict.fromkeys(
            BASIC_INFO_FIELD_NAMES[4:], "minor"
        )
        return cls(
            milestone_days=milestone_defaults,
            milestone_p0_overdue_days=7,
            basic_info_grace_days=7,
            basic_info_fields=field_defaults,
            company_grace_days=7,
            start_grace_days=15,
            archive_overdue_days=30,
            commission_near_days=30,
            delivery_total_days=65,
            delivery_near_days=30,
            delivery_urgent_days=10,
        )


@dataclass(frozen=True)
class DocumentFact:
    """文书快照（R3/R4 判定输入）."""

    document_name: str
    signoff_status: str  # unsigned / signed / archived
    archive_date: str | None  # YYYY-MM-DD 字符串（模型即此类型，仅判空）
    updated_at: date | None  # 签署时间近似（无 signed_at 字段，见 spec §8 风险）


@dataclass(frozen=True)
class ProjectFacts:
    """规则引擎输入快照（Service 层从 ORM 对象抽取，日期统一为本地 date）."""

    project_id: uuid.UUID
    status: str  # signing / renovating
    community_name: str
    contract_no: str | None
    business_form: str | None  # agent / wholesale / None
    renovation_stage: str | None  # 中文枚举值；签约阶段为 None

    # 合同（project_contracts）
    contract_status: str | None
    signing_date: date | None
    signing_period: int | None
    extension_period: int | None
    signing_price: Decimal | None
    planned_handover_date: date | None

    # R2 基础信息字段集
    area: Decimal | None
    layout: str | None
    orientation: str | None
    floor_info: str | None
    electricity_account: str | None
    water_account: str | None
    gas_account: str | None
    has_owner_contact: bool  # 任一未删除业主 姓名+电话 齐全

    # 文书
    documents: tuple[DocumentFact, ...]

    # 装修（project_renovations）
    renovation_company: str | None
    contract_start_date: date | None
    contract_end_date: date | None
    actual_start_date: date | None
    actual_end_date: date | None
    stage_completed_dates: dict[str, str]  # {工序: "YYYY-MM-DD"}
    entering_renovating_at: date | None  # 最新 new_status=renovating 的 operate_at；无日志为 None


@dataclass(frozen=True)
class TodoDraft:
    """规则产出的一条待办（组装层负责排序与截断）."""

    rule_code: str
    priority: Priority
    title: str
    hint: str | None
    items: list[str]
    days_label: str | None
    days_hot: bool
    overdue_days: int | None
    anchor: Anchor


_PRIORITY_ORDER: dict[str, int] = {"p0": 0, "p1": 1, "p2": 2}


def sort_todos(todos: list[TodoDraft]) -> list[TodoDraft]:
    """卡片内排序：P0→P1→P2；同级逾期天数降序（null 靠后）；再按规则编号。"""
    return sorted(
        todos,
        key=lambda t: (
            _PRIORITY_ORDER[t.priority],
            t.overdue_days is None,
            -(t.overdue_days or 0),
            t.rule_code,
        ),
    )


def card_sort_key(p0_count: int, p1_count: int, max_overdue_days: int | None, contract_no: str | None) -> tuple:
    """卡片间排序键：P0 多 → P1 多 → 最深滞后长 → 合同号升序兜底。"""
    return (
        -p0_count,
        -p1_count,
        max_overdue_days is None,
        -(max_overdue_days or 0),
        contract_no or "",
    )


def build_project_todos(facts: ProjectFacts, today: date, rules: TodoBoardRules) -> list[TodoDraft]:
    """对单个项目跑全部规则，返回命中待办（未排序）。阈值由 rules 注入。"""
    drafts: list[TodoDraft] = []
    if facts.status == _STATUS_SIGNING:
        signing_todos = (_rule_r1(facts), _rule_r2(facts, today, rules), _rule_r5(facts, today))
        drafts += [todo for todo in signing_todos if todo is not None]
    elif facts.status == _STATUS_RENOVATING:
        drafts += [
            todo
            for todo in (
                _rule_r6(facts, today, rules),
                _rule_r7(facts, today, rules),
                *_rule_r8(facts, today, rules),
                _rule_r9(facts, today),
            )
            if todo is not None
        ]
    # 通用规则（签约+装修都可能出现）：R3 / R3a / R4 / R10
    drafts += [
        todo
        for todo in (
            _rule_r3(facts),
            _rule_r3a(facts),
            _rule_r4(facts, today, rules),
            _rule_r10(facts, today, rules),
        )
        if todo is not None
    ]
    return drafts


# ── R1 合同未生效（签约） ──────────────────────────────────────────────


def _rule_r1(facts: ProjectFacts) -> TodoDraft | None:
    if facts.contract_status != "未生效":
        return None
    return TodoDraft(
        rule_code="R1",
        priority="p1",
        title="合同未生效",
        hint="签约日期未录入",
        items=["签约日期：未录入", "合同状态：未生效（随签约日期自动联动）"],
        days_label=None,
        days_hot=False,
        overdue_days=None,
        anchor="overview",
    )


# ── R2 基础信息缺 N 项（签约，聚合一条；签约日期缺失只归 R1 就高不重复） ──

# 字段名 → ProjectFacts 判空映射（配置中的字段名经此解释；未知字段名静默忽略）
_BASIC_INFO_FIELD_CHECKS = {
    "签约价": lambda f: f.signing_price is None,
    "业务形式": lambda f: f.business_form is None,
    "交房时间": lambda f: f.planned_handover_date is None,
    "业主联系方式": lambda f: not f.has_owner_contact,
    "面积": lambda f: f.area is None,
    "户型": lambda f: f.layout is None,
    "朝向": lambda f: f.orientation is None,
    "楼层信息": lambda f: f.floor_info is None,
    "水电户号": lambda f: f.electricity_account is None,
    "水表户号": lambda f: f.water_account is None,
    "燃气户号": lambda f: f.gas_account is None,
}


def _rule_r2(facts: ProjectFacts, today: date, rules: TodoBoardRules) -> TodoDraft | None:
    """触发 = 签约日 + 宽限已过 且 检查字段仍有缺失；核心缺 → P1、仅次要缺 → P2.

    签约日期缺失静默跳过（R1 合同未生效兜底）；off 状态字段不检查。
    """
    if facts.signing_date is None:
        return None
    if (today - facts.signing_date).days <= rules.basic_info_grace_days:
        return None

    core: list[str] = []
    minor: list[str] = []
    for name, level in rules.basic_info_fields.items():
        check = _BASIC_INFO_FIELD_CHECKS.get(name)
        if check is None or level == "off":
            continue
        if check(facts):
            (core if level == "core" else minor).append(name)

    missing = core + minor
    if not missing:
        return None

    hint = "、".join(missing[:R2_HINT_MAX_NAMES]) + ("等" if len(missing) > R2_HINT_MAX_NAMES else "")
    return TodoDraft(
        rule_code="R2",
        priority="p1" if core else "p2",
        title=f"基础信息缺 {len(missing)} 项",
        hint=hint,
        items=missing,
        days_label=None,
        days_hot=False,
        overdue_days=None,
        anchor="overview",
    )


# ── R3 文书未签署（通用；核心文书未签 → P0） ──────────────────────────


def _rule_r3(facts: ProjectFacts) -> TodoDraft | None:
    unsigned = [d for d in facts.documents if d.signoff_status == "unsigned"]
    if not unsigned:
        return None
    core_unsigned = [d for d in unsigned if d.document_name in CORE_DOCUMENT_NAMES]
    rest = [d for d in unsigned if d.document_name not in CORE_DOCUMENT_NAMES]

    items = [f"{d.document_name}（核心文书）" for d in core_unsigned]
    items += [d.document_name for d in rest]
    if core_unsigned:
        items.append("处理建议：逐份催签，核心文书优先")

    hint = f"{core_unsigned[0].document_name}未签" if core_unsigned else f"{len(unsigned)} 份未签"
    return TodoDraft(
        rule_code="R3",
        priority="p0" if core_unsigned else "p1",
        title="文书未签署",
        hint=hint,
        items=items,
        days_label=f"{len(unsigned)} 份",
        days_hot=False,
        overdue_days=None,
        anchor="documents",
    )


# ── R3a 文书清单未初始化（通用；business_form 为空的根因兜底） ─────────


def _rule_r3a(facts: ProjectFacts) -> TodoDraft | None:
    if facts.business_form is not None:
        return None
    return TodoDraft(
        rule_code="R3a",
        priority="p1",
        title="文书清单未初始化",
        hint="先补录业务形式",
        items=[
            "业务形式：未设置",
            "文书模板：未生成（补录后按形式生成代理 12 项 / 收购 18 项）",
            "处理建议：先在概览补录业务形式，再初始化文书清单",
        ],
        days_label=None,
        days_hot=False,
        overdue_days=None,
        anchor="overview",
    )


# ── R4 已签署未归档（通用；签署超阈值 → 升 P1） ───────────────────────


def _rule_r4(facts: ProjectFacts, today: date, rules: TodoBoardRules) -> TodoDraft | None:
    pending = [d for d in facts.documents if d.signoff_status == "signed" and not d.archive_date]
    if not pending:
        return None

    overdue_days = [
        (today - d.updated_at).days
        for d in pending
        if d.updated_at is not None and (today - d.updated_at).days > rules.archive_overdue_days
    ]
    max_days = max(overdue_days) if overdue_days else None

    names = [d.document_name for d in pending]
    hint = "、".join(names) if len(names) <= R4_HINT_MAX_NAMES else "、".join(names[:2]) + "等"

    items = names
    if max_days is not None:
        items = [*items, f"签署至今 {max_days} 天，超 {rules.archive_overdue_days} 天阈值"]
    items = [*items, "处理建议：回收原件后在文书清单标记归档"]

    return TodoDraft(
        rule_code="R4",
        priority="p1" if max_days is not None else "p2",
        title="已签署未归档",
        hint=hint,
        items=items,
        days_label=f"超 {max_days} 天" if max_days is not None else None,
        days_hot=max_days is not None,
        overdue_days=max_days,
        anchor="documents",
    )


# ── R5 交房逾期未确认（签约） ─────────────────────────────────────────


def _rule_r5(facts: ProjectFacts, today: date) -> TodoDraft | None:
    planned = facts.planned_handover_date
    if planned is None or planned >= today:
        return None
    days = (today - planned).days
    return TodoDraft(
        rule_code="R5",
        priority="p0",
        title="交房逾期未确认",
        hint=f"约定 {planned:%m-%d} 交房",
        items=[
            f"业主交房时间：{planned:%Y-%m-%d}",
            f"项目状态：签约阶段 · 已逾期 {days} 天",
            "处理建议：联系业主确认交房，或更新约定时间",
        ],
        days_label=f"逾期 {days} 天",
        days_hot=True,
        overdue_days=days,
        anchor="overview",
    )


# ── R6 未安排施工方（装修；状态日志缺失静默跳过） ─────────────────────


def _rule_r6(facts: ProjectFacts, today: date, rules: TodoBoardRules) -> TodoDraft | None:
    if facts.renovation_company:
        return None
    entered = facts.entering_renovating_at
    if entered is None:
        return None
    days = (today - entered).days
    if days <= rules.company_grace_days:
        return None
    return TodoDraft(
        rule_code="R6",
        priority="p0",
        title="未安排施工方",
        hint="装修合同信息为空",
        items=[
            "施工方（装修公司）：空",
            f"进入装修阶段：{days} 天（取自状态流转日志）",
            "处理建议：尽快确定施工方并录入装修合同信息",
        ],
        days_label=f"停滞 {days} 天",
        days_hot=True,
        overdue_days=days,
        anchor="renovation_contract",
    )


# ── R7 未实际开工（装修；合同进场日已过 → P0） ────────────────────────


def _rule_r7(facts: ProjectFacts, today: date, rules: TodoBoardRules) -> TodoDraft | None:
    if not facts.renovation_company or facts.actual_start_date is not None:
        return None
    entered = facts.entering_renovating_at
    if entered is None:
        return None
    days = (today - entered).days
    if days <= rules.start_grace_days:
        return None

    contract_start_passed = facts.contract_start_date is not None and facts.contract_start_date < today
    items = [
        f"施工方：{facts.renovation_company}（已填）",
        "实际开工：未记录",
        f"进入装修阶段：{days} 天（超 {rules.start_grace_days} 天宽限期）",
    ]
    if contract_start_passed and facts.contract_start_date is not None:
        items.append(f"合同约定进场：{facts.contract_start_date:%Y-%m-%d} 已过")
    return TodoDraft(
        rule_code="R7",
        priority="p0" if contract_start_passed else "p1",
        title="未实际开工",
        hint="无开工记录",
        items=items,
        days_label=f"停滞 {days} 天",
        days_hot=True,
        overdue_days=days,
        anchor="renovation_progress",
    )


# ── R8 工序节点逾期（装修；里程碑制，多节点独立判定；锚点缺失静默跳过） ──


def _rule_r8(facts: ProjectFacts, today: date, rules: TodoBoardRules) -> list[TodoDraft]:
    """交房后 N 天内未记录工序完成日期即提示（P1），逾期超升 P0 线转 P0.

    锚点：约定交房时间 →（为空）进入装修状态日志日 →（皆无）静默跳过；
    已竣工且 6 工序全部有完成记录才整体跳过——竣工但工序缺记录仍逐工序提示，
    防止「录了竣工日期但工序未完成」的数据矛盾被静默；工序有完成记录即视为完成。
    多节点独立判定：rule_code = "R8·工序名"（保证卡片内 key 唯一）。
    """
    completed = facts.stage_completed_dates or {}
    if facts.actual_end_date is not None and all(stage in completed for stage in rules.milestone_days):
        return []
    anchor = facts.planned_handover_date or facts.entering_renovating_at
    if anchor is None:
        return []

    drafts: list[TodoDraft] = []
    for stage, days in rules.milestone_days.items():
        if stage in completed:
            continue
        deadline = anchor + timedelta(days=days)
        if today <= deadline:
            continue
        overdue = (today - deadline).days
        to_p0 = overdue > rules.milestone_p0_overdue_days
        items = [
            f"工序节点：{stage}",
            f"里程碑：交房后 {days} 天内完成（锚点 {anchor:%m-%d}）",
            f"已逾期 {overdue} 天" + (f"（超 {rules.milestone_p0_overdue_days} 天升 P0 线）" if to_p0 else ""),
            "处理建议：核对工序完成情况并补录完成日期",
        ]
        drafts.append(
            TodoDraft(
                rule_code=f"R8·{stage}",
                priority="p0" if to_p0 else "p1",
                title="工序节点逾期",
                hint=f"{stage} 交房后 {days} 天",
                items=items,
                days_label=f"逾期 {overdue} 天",
                days_hot=True,
                overdue_days=overdue,
                anchor="renovation_progress",
            )
        )
    return drafts


# ── R9 竣工逾期（装修） ───────────────────────────────────────────────


def _rule_r9(facts: ProjectFacts, today: date) -> TodoDraft | None:
    end = facts.contract_end_date
    if end is None or end >= today or facts.actual_end_date is not None:
        return None
    days = (today - end).days
    return TodoDraft(
        rule_code="R9",
        priority="p0",
        title="竣工逾期",
        hint=f"合同约定 {end:%m-%d}",
        items=[
            f"合同约定竣工：{end:%Y-%m-%d}",
            f"实际竣工：未记录 · 已逾期 {days} 天",
            "处理建议：与施工方确认剩余工序与竣工时间",
        ],
        days_label=f"逾期 {days} 天",
        days_hot=True,
        overdue_days=days,
        anchor="renovation_progress",
    )


# ── R10 委托期临近/已超（通用；复用重点监控到期公式，字段缺失静默跳过） ──


def _rule_r10(facts: ProjectFacts, today: date, rules: TodoBoardRules) -> TodoDraft | None:
    if facts.signing_date is None or facts.signing_period is None:
        return None
    total_days = facts.signing_period + (facts.extension_period or 0)
    end = facts.signing_date + timedelta(days=total_days)
    remaining = (end - today).days

    if remaining < 0:
        overdue = -remaining
        return TodoDraft(
            rule_code="R10",
            priority="p0",
            title="委托期已超",
            hint=f"含顺延 {end:%m-%d} 结束",
            items=[
                f"委托期（含顺延）：至 {end:%Y-%m-%d}",
                f"已超期：{overdue} 天",
                "处理建议：与业主办理顺延，或推进收口",
            ],
            days_label=f"已超 {overdue} 天",
            days_hot=True,
            overdue_days=overdue,
            anchor="overview",
        )
    if remaining <= rules.commission_near_days:
        return TodoDraft(
            rule_code="R10",
            priority="p1",
            title="委托期临近",
            hint="注意工期衔接",
            items=[
                f"委托期结束：{end:%Y-%m-%d}",
                f"剩余：{remaining} 天",
                "处理建议：核对剩余工期，必要时提前办理顺延",
            ],
            days_label=f"剩 {remaining} 天",
            days_hot=False,
            overdue_days=None,
            anchor="overview",
        )
    return None
