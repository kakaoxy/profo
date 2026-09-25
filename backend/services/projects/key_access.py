"""钥匙管理公共助手：权限校验、可访问房源、审计留痕、过期判定.

权限口径（spec「钥匙权限」）：
- role_code=admin：全量房源
- 其他用户：按房屋相关人五字段匹配（project.project_manager_id、
  project_renovation.contact_person_id、project_sale.channel_manager_id/
  property_agent_id/negotiator_id），仅见关联房源
- 无关人员：403（单房源操作）/ 过滤（列表聚合）
"""

import secrets
import uuid
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import case, or_
from sqlalchemy.orm import Session

from models import (
    KeyActorType,
    KeyAuditLog,
    KeyShare,
    KeyShareStatus,
    Project,
    ProjectNormalKey,
    ProjectRenovation,
    ProjectSale,
    ProjectStatus,
    User,
)
from services.system.exceptions import PermissionDeniedError, ResourceNotFoundError

# 钥匙房源列表状态优先级：在售 → 装修 → 签约 → 已售 → 下架；其余（deleted/None）兜底排最后.
_STATUS_ORDER = case(
    (Project.status == ProjectStatus.SELLING, 0),
    (Project.status == ProjectStatus.RENOVATING, 1),
    (Project.status == ProjectStatus.SIGNING, 2),
    (Project.status == ProjectStatus.SOLD, 3),
    (Project.status == ProjectStatus.ENDED, 4),
    else_=5,
)


def is_admin_user(user: User) -> bool:
    """判断用户是否具备 admin 角色（主角色或附加角色）."""
    codes: set[str] = set()
    if user.role and user.role.code:
        codes.add(user.role.code)
    for r in user.roles or []:
        if r and r.code:
            codes.add(r.code)
    return "admin" in codes


def user_display_name(user: User) -> str:
    """用户展示名快照（昵称优先，退回用户名）."""
    return user.nickname or user.username


def user_names_map(db: Session, user_ids: set[str]) -> dict[str, str]:
    """批量查询用户展示名快照（id → 昵称/用户名）."""
    ids = {uid for uid in user_ids if uid}
    if not ids:
        return {}
    rows = db.query(User).filter(User.id.in_(ids)).all()
    return {str(u.id): (u.nickname or u.username) for u in rows}


def get_project_or_404(db: Session, project_id: uuid.UUID) -> Project:
    """获取未删除项目，不存在抛 404."""
    project = db.get(Project, project_id)
    if project is None or project.is_deleted:
        msg = "房源不存在"
        raise ResourceNotFoundError(msg)
    return project


def ensure_key_access(db: Session, user: User, project_id: uuid.UUID) -> Project:
    """校验用户对目标房源的钥匙权限（写操作前必须调用）.

    admin 全量放行；其余用户按相关人五字段匹配；无关人员 403。
    """
    project = get_project_or_404(db, project_id)
    if is_admin_user(user):
        return project
    uid = str(user.id)
    if project.project_manager_id == uid:
        return project

    renovation = (
        db.query(ProjectRenovation)
        .filter(
            ProjectRenovation.project_id == project_id,
            ProjectRenovation.is_deleted.is_(False),
        )
        .first()
    )
    if renovation is not None and renovation.contact_person_id == uid:
        return project

    sale = (
        db.query(ProjectSale)
        .filter(
            ProjectSale.project_id == project_id,
            ProjectSale.is_deleted.is_(False),
        )
        .first()
    )
    if sale is not None and uid in {
        sale.channel_manager_id,
        sale.property_agent_id,
        sale.negotiator_id,
    }:
        return project

    msg = "无该房源钥匙管理权限"
    raise PermissionDeniedError(msg)


def list_accessible_projects(db: Session, user: User) -> list[Project]:
    """列出用户可见的全部房源（admin 全量；相关人仅关联房源）."""
    if is_admin_user(user):
        return (
            db.query(Project)
            .filter(Project.is_deleted.is_(False))
            .order_by(_STATUS_ORDER, Project.created_at.desc())
            .all()
        )

    uid = str(user.id)
    ids: set[uuid.UUID] = set()
    manager_rows = db.query(Project.id).filter(Project.is_deleted.is_(False), Project.project_manager_id == uid).all()
    ids.update(row[0] for row in manager_rows)
    renovation_rows = (
        db.query(ProjectRenovation.project_id)
        .filter(ProjectRenovation.is_deleted.is_(False), ProjectRenovation.contact_person_id == uid)
        .all()
    )
    ids.update(row[0] for row in renovation_rows)
    sale_rows = (
        db.query(ProjectSale.project_id)
        .filter(
            ProjectSale.is_deleted.is_(False),
            or_(
                ProjectSale.channel_manager_id == uid,
                ProjectSale.property_agent_id == uid,
                ProjectSale.negotiator_id == uid,
            ),
        )
        .all()
    )
    ids.update(row[0] for row in sale_rows)
    if not ids:
        return []
    return (
        db.query(Project)
        .filter(Project.id.in_(ids), Project.is_deleted.is_(False))
        .order_by(_STATUS_ORDER, Project.created_at.desc())
        .all()
    )


def log_key_action(
    db: Session,
    *,
    project_id: uuid.UUID | None,
    action: str,
    actor_type: KeyActorType,
    actor: User | None = None,
    actor_name: str | None = None,
    detail: dict | None = None,
) -> None:
    """写入钥匙审计日志.

    actor 为 User 时自动取 id 与展示名快照；system/匿名场景传 actor_name。
    """
    resolved_actor_id: str | None = None
    resolved_actor_name = actor_name
    if actor is not None:
        resolved_actor_id = str(actor.id)
        resolved_actor_name = user_display_name(actor)
    entry = KeyAuditLog(
        project_id=project_id,
        action=action,
        actor_type=actor_type,
        actor_id=resolved_actor_id,
        actor_name=resolved_actor_name,
        detail=detail,
    )
    db.add(entry)


def utc_now() -> datetime:
    """当前 UTC 时间（时区感知）."""
    return datetime.now(timezone.utc)


_TZ_SHANGHAI = ZoneInfo("Asia/Shanghai")


def local_today() -> date:
    """业务「今日」（按东八区取日期，避免 UTC 跨日偏差）."""
    return datetime.now(_TZ_SHANGHAI).date()


def generate_six_digit() -> str:
    """生成 6 位随机数字密码（系统生成路径，含前导零）."""
    return f"{secrets.randbelow(1000000):06d}"


def load_active_shares(db: Session) -> list[KeyShare]:
    """进行中的分享列表（未回收且未过期）."""
    now = utc_now()
    shares = db.query(KeyShare).filter(KeyShare.status == KeyShareStatus.ACTIVE).all()
    return [s for s in shares if s.expires_at > now]


def is_share_expired(share: KeyShare, now: datetime | None = None) -> bool:
    """派生过期判定：active && expires_at < now."""
    if share.status != KeyShareStatus.ACTIVE:
        return False
    reference = now or utc_now()
    return share.expires_at <= reference


def parse_share_items(share: KeyShare) -> list[tuple[uuid.UUID, uuid.UUID]]:
    """解析分享条目 JSONB → [(project_id, key_id)]（跳过脏数据）."""

    def _parse(item: object) -> tuple[uuid.UUID, uuid.UUID] | None:
        if not isinstance(item, dict):
            return None
        try:
            return uuid.UUID(str(item["project_id"])), uuid.UUID(str(item["key_id"]))
        except (KeyError, ValueError, TypeError):
            return None

    pairs: list[tuple[uuid.UUID, uuid.UUID]] = []
    for item in share.items or []:
        parsed = _parse(item)
        if parsed is not None:
            pairs.append(parsed)
    return pairs


def active_share_key_refs(shares: list[KeyShare]) -> dict[uuid.UUID, set[uuid.UUID]]:
    """进行中分享条目 → {project_id: {key_id}}（用于徽章/删除提示聚合）."""
    refs: dict[uuid.UUID, set[uuid.UUID]] = {}
    for share in shares:
        for project_id, key_id in parse_share_items(share):
            refs.setdefault(project_id, set()).add(key_id)
    return refs


def load_existing_normal_key_ids(db: Session, project_ids: set[uuid.UUID]) -> set[uuid.UUID]:
    """项目集合内存量密码组 id（用于过滤分享条目中密码组已被删除的引用）.

    密码组删除为物理删除且不级联改 KeyShare，分享条目 JSONB 中会残留
    已删除的 key_id；徽章/计数聚合时需过滤，否则出现"密码已删仍显示分享中"。
    """
    if not project_ids:
        return set()
    rows = db.query(ProjectNormalKey.id).filter(ProjectNormalKey.project_id.in_(project_ids)).all()
    return {row[0] for row in rows}
