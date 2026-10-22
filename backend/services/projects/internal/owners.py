"""项目业主同步服务模块.

负责项目业主列表的 diff 同步：新增、更新、逻辑删除。
updater/creator 通过调用本模块完成业主列表同步，不内联 diff 逻辑。
"""

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from models.project._project_base import Project
from models.project._project_owner import ProjectOwner
from schemas.project.owner import OwnerInlineCreate, OwnerInlineUpdate

logger = logging.getLogger(__name__)

# 业主不存在/已删除/所属项目已软删的哨兵返回值（区别于「存在但无卡」的 None）
_OWNER_NOT_FOUND = object()


def is_owner_not_found(value: object) -> bool:
    """判断 get_bank_card_number 的返回值是否为「业主不存在」哨兵.

    供 Router 层等外部消费方使用，避免直接导入模块私有名。

    Args:
        value: get_bank_card_number 的返回值

    Returns:
        业主不存在时 True

    """
    return value is _OWNER_NOT_FOUND


_OWNER_FIELDS: tuple[str, ...] = (
    "owner_name",
    "owner_phone",
    "owner_id_card",
    "bank_name",
    "bank_card_number",
    "relation_type",
    "owner_info",
)


def sync_owners(
    db: Session,
    project_id: uuid.UUID,
    payload_owners: list[OwnerInlineCreate | OwnerInlineUpdate] | None,
) -> None:
    """同步项目业主列表（diff 逻辑）.

    规则：
    - payload_owners 为 None：不操作（保持现状）
    - payload_owners 为 []：将 DB 中现有非删除业主全部 is_deleted=True
    - payload_owners 中含 id 的项：更新对应 ProjectOwner
    - payload_owners 中不含 id 的项：新增 ProjectOwner
    - DB 中存在但 payload 缺失的项：is_deleted=True（逻辑删除）

    Args:
        db: SQLAlchemy 数据库会话
        project_id: 项目ID
        payload_owners: 内联业主列表，None 表示不操作

    """
    if payload_owners is None:
        return

    now = datetime.now(timezone.utc)

    existing_owners = (
        db.query(ProjectOwner)
        .filter(
            ProjectOwner.project_id == project_id,
            ProjectOwner.is_deleted.is_(False),
        )
        .all()
    )
    existing_map: dict[str, ProjectOwner] = {str(o.id): o for o in existing_owners}

    payload_ids: set[str] = set()
    for item in payload_owners:
        item_id: str | None = getattr(item, "id", None)
        if item_id is not None:
            payload_ids.add(item_id)
            owner = existing_map.get(item_id)
            if owner is not None:
                updates = item.model_dump(exclude_unset=True, exclude={"id"})
                # ⚠️ 防脱敏值回写：响应下发的 phone/id_card/bank_card 为脱敏值（含 *），
                # 编辑表单未改动时原样提交会覆盖明文；真实明文不可能包含星号，跳过
                for field in ("owner_phone", "owner_id_card", "bank_card_number"):
                    value = updates.get(field)
                    if isinstance(value, str) and "*" in value:
                        del updates[field]
                for field, value in updates.items():
                    if field in _OWNER_FIELDS:
                        setattr(owner, field, value)
                owner.updated_at = now
        else:
            new_owner = ProjectOwner(
                id=uuid.uuid4(),
                project_id=project_id,
                owner_name=item.owner_name,
                owner_phone=item.owner_phone,
                owner_id_card=item.owner_id_card,
                bank_name=item.bank_name,
                bank_card_number=item.bank_card_number,
                relation_type=item.relation_type or "业主",
                owner_info=item.owner_info,
                is_deleted=False,
                created_at=now,
                updated_at=now,
            )
            db.add(new_owner)

    for owner_id, owner in existing_map.items():
        if owner_id not in payload_ids:
            owner.is_deleted = True
            owner.updated_at = now


def list_owners(db: Session, project_id: uuid.UUID) -> list[ProjectOwner]:
    """列出项目下未删除的业主，按 created_at 升序.

    Args:
        db: SQLAlchemy 数据库会话
        project_id: 项目ID

    Returns:
        未删除的业主列表（按创建时间升序）

    """
    return (
        db.query(ProjectOwner)
        .filter(
            ProjectOwner.project_id == project_id,
            ProjectOwner.is_deleted.is_(False),
        )
        .order_by(ProjectOwner.created_at.asc())
        .all()
    )


def get_bank_card_number(
    db: Session,
    owner_id: str,
    operator_id: str | None = None,  # noqa: ARG001 - 保留签名以兼容 facade 透传（审计在 Router 层落）
) -> str | None:
    """获取业主未脱敏银行卡号.

    安全检查：
    - 校验 owner 所属 project 未被软删除，避免越权访问已归档数据
    - 审计日志统一由 Router 层 OperationLog 记录（本函数不再重复写 logger）

    Args:
        db: SQLAlchemy 数据库会话
        owner_id: 业主ID
        operator_id: 调用方用户ID（透传给 Router 审计上下文，本函数不落日志）

    Returns:
        未脱敏银行卡号；业主存在但未登记卡号时返回 None；
        业主不存在/已删除/所属项目已软删时返回哨兵值 _OWNER_NOT_FOUND
        （调用方据此区分「无卡」与「查无此人」，Fail Loud）。

    """
    # join Project 校验项目未软删，防止越权访问已归档项目的业主敏感数据
    row = (
        db.query(ProjectOwner.bank_card_number)
        .join(Project, ProjectOwner.project_id == Project.id)
        .filter(
            ProjectOwner.id == owner_id,
            ProjectOwner.is_deleted.is_(False),
            Project.is_deleted.is_(False),
        )
        .first()
    )
    if row is None:
        return _OWNER_NOT_FOUND

    return row[0]
