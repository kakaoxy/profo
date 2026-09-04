"""sync_owners 多业主编辑 diff 同步回归测试.

覆盖场景：
1. 编辑新增业主时保留原业主（不被误软删）
2. 编辑修改已有业主字段
3. 编辑删除 payload 缺失的业主

回归 Bug：existing_map 曾用 uuid.UUID 作为 key，而 payload item.id 为 str，
导致 existing_map.get(str_id) 查找失败，已有业主被误判为「payload 缺失」而软删。
"""

import uuid
from typing import Any

from sqlalchemy.orm import Session

from models import Project, ProjectOwner
from models.common import ProjectStatus
from schemas.project.owner import OwnerInlineCreate, OwnerInlineUpdate
from services.projects.internal.owners import list_owners, sync_owners


def _make_project(session: Session) -> Project:
    """创建并持久化项目."""
    project = Project(
        id=uuid.uuid4(),
        name="业主同步测试项目",
        community_name="测试小区",
        address="测试地址",
        status=ProjectStatus.SIGNING,
        is_deleted=False,
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


def _make_owner(
    session: Session,
    project_id: uuid.UUID,
    *,
    owner_name: str,
    owner_phone: str | None = None,
) -> ProjectOwner:
    """创建并持久化业主记录（EncryptedString 字段由 ORM 自动加密）."""
    owner = ProjectOwner(
        id=uuid.uuid4(),
        project_id=project_id,
        owner_name=owner_name,
        owner_phone=owner_phone,
        relation_type="业主",
        is_deleted=False,
    )
    session.add(owner)
    session.commit()
    session.refresh(owner)
    return owner


class TestSyncOwners:
    """sync_owners diff 同步回归测试."""

    def test_sync_owners_add_new_keeps_existing(self, seeded_db: dict[str, Any]) -> None:
        """编辑新增业主时保留原业主.

        项目已有业主 A，sync_owners 传入 [A(含 str id), B(无 id)]：
        - A 未被软删（is_deleted False）
        - B 被新增
        - list_owners 返回 2 条
        """
        session = seeded_db["session"]
        project = _make_project(session)
        owner_a = _make_owner(session, project.id, owner_name="业主A", owner_phone="13800000001")

        sync_owners(
            session,
            project.id,
            [
                OwnerInlineUpdate(
                    id=str(owner_a.id),
                    owner_name="业主A",
                    owner_phone="13800000001",
                ),
                OwnerInlineCreate(
                    owner_name="业主B",
                    owner_phone="13800000002",
                ),
            ],
        )
        session.flush()
        session.refresh(owner_a)

        # A 未被软删
        assert owner_a.is_deleted is False, "原业主 A 不应被软删"
        # list_owners 返回 2 条未删除业主
        owners = list_owners(session, project.id)
        assert len(owners) == 2, f"应有 2 条业主，实际 {len(owners)}"
        owner_names = {o.owner_name for o in owners}
        assert owner_names == {"业主A", "业主B"}

    def test_sync_owners_update_existing_field(self, seeded_db: dict[str, Any]) -> None:
        """编辑修改已有业主字段.

        项目已有业主 A，sync_owners 传入 [A(含 str id, 改电话)]：
        - A 的 owner_phone 已更新
        - 未新增业主
        - list_owners 返回 1 条
        """
        session = seeded_db["session"]
        project = _make_project(session)
        owner_a = _make_owner(session, project.id, owner_name="业主A", owner_phone="13800000001")

        sync_owners(
            session,
            project.id,
            [
                OwnerInlineUpdate(
                    id=str(owner_a.id),
                    owner_phone="13900000099",
                ),
            ],
        )
        session.flush()
        session.refresh(owner_a)

        assert owner_a.owner_phone == "13900000099", "业主 A 电话应已更新"
        owners = list_owners(session, project.id)
        assert len(owners) == 1, f"应有 1 条业主，实际 {len(owners)}"
        assert owners[0].id == owner_a.id

    def test_sync_owners_delete_missing(self, seeded_db: dict[str, Any]) -> None:
        """编辑删除 payload 缺失的业主.

        项目已有业主 A、B，sync_owners 传入 [A(含 str id)]：
        - A 的 is_deleted 为 False
        - B 的 is_deleted 为 True
        - list_owners 返回 1 条（A）
        """
        session = seeded_db["session"]
        project = _make_project(session)
        owner_a = _make_owner(session, project.id, owner_name="业主A", owner_phone="13800000001")
        owner_b = _make_owner(session, project.id, owner_name="业主B", owner_phone="13800000002")

        sync_owners(
            session,
            project.id,
            [
                OwnerInlineUpdate(id=str(owner_a.id)),
            ],
        )
        session.flush()
        session.refresh(owner_a)
        session.refresh(owner_b)

        assert owner_a.is_deleted is False, "业主 A 不应被软删"
        assert owner_b.is_deleted is True, "业主 B 应被软删"
        owners = list_owners(session, project.id)
        assert len(owners) == 1, f"应有 1 条业主，实际 {len(owners)}"
        assert owners[0].id == owner_a.id
