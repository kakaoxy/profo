"""获客中心员工身份过滤.

员工维度统计（TOP 榜 / 员工漏斗下钻）的统一口径：仅统计具备后台身份的
用户（主角色或附加角色命中 BACKEND_ROLE_CODES，与
AuthService.has_backend_identity 同口径）。C 端用户（customer）的
分享/归因记录不计入员工维度统计。
"""

from sqlalchemy.orm import Session

from constants.role_codes import BACKEND_ROLE_CODES
from models import Role, User, user_roles


def resolve_backend_employee_ids(db: Session, employee_ids: list[str]) -> set[str]:
    """批量解析具备后台身份的用户ID集合.

    Args:
        db: 数据库会话
        employee_ids: 待过滤的用户ID列表

    Returns:
        命中后台身份的用户ID集合；入参为空时返回空集合

    """
    if not employee_ids:
        return set()
    # 主角色命中
    primary_ids = {
        row[0]
        for row in (
            db.query(User.id)
            .join(Role, User.role_id == Role.id)
            .filter(User.id.in_(employee_ids), Role.code.in_(BACKEND_ROLE_CODES))
            .all()
        )
    }
    remaining = [eid for eid in employee_ids if eid not in primary_ids]
    if not remaining:
        return primary_ids
    # 附加角色命中
    additional_ids = {
        row[0]
        for row in (
            db.query(User.id)
            .join(user_roles, user_roles.c.user_id == User.id)
            .join(Role, user_roles.c.role_id == Role.id)
            .filter(User.id.in_(remaining), Role.code.in_(BACKEND_ROLE_CODES))
            .all()
        )
    }
    return primary_ids | additional_ids
