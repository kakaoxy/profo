"""项目待办看板规则配置服务.

存储：system_configs KV 表单键 ``todo_board_rules``（value = JSON 全量）。
读取容忍缺行/JSON 损坏/部分键缺失 → 逐字段回退代码默认（TodoBoardRules.defaults()）；
保存为全量 upsert 并写 updated_by_id 审计。见 docs/2026-10-02-待办看板规则配置-spec.md。
"""

import json
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import SystemConfig, User
from schemas.project import TodoBoardRulesData, TodoBoardRulesResponse, TodoBoardRulesUpdateRequest
from services.projects.todo_board_rules import TodoBoardRules

# system_configs 配置键（value = JSON 全量）
TODO_BOARD_RULES_CONFIG_KEY = "todo_board_rules"


def _data_to_dict(rules: TodoBoardRules) -> dict[str, Any]:
    """TodoBoardRules dataclass → 可 JSON 序列化的 dict（键序 = dataclass 字段序）."""
    return {
        "milestone_days": rules.milestone_days,
        "milestone_p0_overdue_days": rules.milestone_p0_overdue_days,
        "basic_info_grace_days": rules.basic_info_grace_days,
        "basic_info_fields": rules.basic_info_fields,
        "company_grace_days": rules.company_grace_days,
        "start_grace_days": rules.start_grace_days,
        "archive_overdue_days": rules.archive_overdue_days,
        "commission_near_days": rules.commission_near_days,
        "delivery_total_days": rules.delivery_total_days,
        "delivery_near_days": rules.delivery_near_days,
        "delivery_urgent_days": rules.delivery_urgent_days,
    }


def _merge_with_defaults(raw: Any) -> dict[str, Any]:
    """原始 JSON 值逐字段并入默认值（类型不符/缺键的字段回退默认）.

    数值字段容忍 JSON float（90.0 → 90，小数截断）；bool 虽为 int 子类但不作数值；
    dict 字段内的数值同样收敛为 int。
    """
    default_dict = _data_to_dict(TodoBoardRules.defaults())
    if not isinstance(raw, dict):
        return default_dict
    merged = dict(default_dict)
    for name, default in default_dict.items():
        value = raw.get(name)
        if isinstance(default, dict):
            if isinstance(value, dict):
                merged[name] = {
                    k: int(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else default.get(k, v)
                    for k, v in value.items()
                }
        elif isinstance(value, bool):
            continue
        elif isinstance(value, (int, float)):
            merged[name] = int(value)
    return merged


def _user_display_name(db: Session, user_id: str | None) -> str | None:
    """修改人显示名（nickname 回退 username；用户不存在为 None）。"""
    if not user_id:
        return None
    user = db.query(User).filter(User.id == user_id).first()
    return (user.nickname or user.username) if user else None


def _row_to_response(db: Session, row: SystemConfig | None) -> TodoBoardRulesResponse:
    """system_configs 行 → 响应（value 解析失败按缺行处理，updated_* 置 null）."""
    updated_at = row.updated_at if row is not None else None
    updated_by_name = _user_display_name(db, row.updated_by_id if row is not None else None)
    return TodoBoardRulesResponse(
        **_merge_with_defaults(json.loads(row.value) if row is not None and row.value else None),
        updated_at=updated_at,
        updated_by_name=updated_by_name,
        defaults=TodoBoardRulesData(**_data_to_dict(TodoBoardRules.defaults())),
    )


def rules_data_to_dataclass(data: TodoBoardRulesData) -> TodoBoardRules:
    """校验后的 Schema → 规则引擎 dataclass（Service 层转换点）."""
    return TodoBoardRules(
        milestone_days=dict(data.milestone_days),
        milestone_p0_overdue_days=data.milestone_p0_overdue_days,
        basic_info_grace_days=data.basic_info_grace_days,
        basic_info_fields=dict(data.basic_info_fields),
        company_grace_days=data.company_grace_days,
        start_grace_days=data.start_grace_days,
        archive_overdue_days=data.archive_overdue_days,
        commission_near_days=data.commission_near_days,
        delivery_total_days=data.delivery_total_days,
        delivery_near_days=data.delivery_near_days,
        delivery_urgent_days=data.delivery_urgent_days,
    )


def load_rules(db: Session) -> TodoBoardRules:
    """读取当前生效规则（看板取数路径；缺行/损坏逐字段回退默认）."""
    row = db.query(SystemConfig.value).filter(SystemConfig.key == TODO_BOARD_RULES_CONFIG_KEY).scalar()
    try:
        raw = json.loads(row) if row else None
    except (TypeError, ValueError):
        raw = None
    merged = _merge_with_defaults(raw)
    return TodoBoardRules(
        milestone_days=dict(merged["milestone_days"]),
        milestone_p0_overdue_days=int(merged["milestone_p0_overdue_days"]),
        basic_info_grace_days=int(merged["basic_info_grace_days"]),
        basic_info_fields=dict(merged["basic_info_fields"]),
        company_grace_days=int(merged["company_grace_days"]),
        start_grace_days=int(merged["start_grace_days"]),
        archive_overdue_days=int(merged["archive_overdue_days"]),
        commission_near_days=int(merged["commission_near_days"]),
        delivery_total_days=int(merged["delivery_total_days"]),
        delivery_near_days=int(merged["delivery_near_days"]),
        delivery_urgent_days=int(merged["delivery_urgent_days"]),
    )


def get_rules_config(db: Session) -> TodoBoardRulesResponse:
    """GET /todo-board/config：当前生效值 + 元信息 + 出厂默认值."""
    row = db.query(SystemConfig).filter(SystemConfig.key == TODO_BOARD_RULES_CONFIG_KEY).first()
    return _row_to_response(db, row)


def save_rules_config(db: Session, req: TodoBoardRulesUpdateRequest, operator_id: str) -> TodoBoardRulesResponse:
    """PUT /todo-board/config：全量 upsert（并发保存经 flush 撞唯一索引回退，不 500）."""
    payload = json.dumps(_data_to_dict(rules_data_to_dataclass(req)), ensure_ascii=False)

    row = db.query(SystemConfig).filter(SystemConfig.key == TODO_BOARD_RULES_CONFIG_KEY).with_for_update().first()
    if row is None:
        # 首次创建路径无行可锁：依赖 flush 撞唯一索引 uq_system_configs_key 后的
        # IntegrityError 回退 + 加锁重查（与 services/growth_center/admin_flow.py 同口径）
        db.add(SystemConfig(key=TODO_BOARD_RULES_CONFIG_KEY, value=payload, updated_by_id=operator_id))
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
        row = db.query(SystemConfig).filter(SystemConfig.key == TODO_BOARD_RULES_CONFIG_KEY).with_for_update().first()
    if row is None:
        # 理论不可达：唯一索引冲突必然意味着并发事务已提交该行
        msg = "待办规则配置写入失败"
        raise RuntimeError(msg)
    row.value = payload
    row.updated_by_id = operator_id
    db.commit()
    db.refresh(row)
    return _row_to_response(db, row)
