"""测试已售状态下项目信息更新的字段白名单行为.

回归背景：`_filter_allowed_fields` 白名单遗漏 `project_manager_id`，导致已售
（sold）状态下通过 PUT /api/v1/projects/{id} 提交的项目负责人被静默丢弃——
接口返回 200 但数据库不更新，前端保存后仍显示"未设置"。本测试锁定：
1. 已售状态下 project_manager_id 必须可更新并持久化（修复项）
2. 已售状态对合同等敏感字段的过滤语义保持不变（防回归）
"""

import uuid
from typing import Any

import pytest
from sqlalchemy.orm import Session

from models import Project
from models.common import ProjectStatus
from schemas.project import ProjectUpdate
from services.projects.facade import ProjectService


@pytest.fixture
def sold_project(db_session: Session) -> Project:
    """创建一个已售状态的测试项目."""
    project = Project(
        id=str(uuid.uuid4()),
        name="测试小区 - 已售地址",
        community_name="测试小区",
        address="已售地址",
        status=ProjectStatus.SOLD,
    )
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)
    return project


@pytest.fixture
def admin_user_id(seeded_db: dict[str, Any]) -> str:
    """返回 seed 的 admin 用户 ID（作为合法的项目负责人）."""
    return str(seeded_db["users"]["admin"].id)


def test_update_sold_project_manager_id_persists(
    db_session: Session,
    sold_project: Project,
    admin_user_id: str,
) -> None:
    """已售状态下更新 project_manager_id 必须持久化并回显.

    修复前：_filter_allowed_fields 白名单无 project_manager_id，字段被静默
    过滤，DB 保持 NULL，响应 project_manager 为 None（保存后界面仍显示
    "没有项目负责人"）。
    """
    service = ProjectService(db_session)
    resp = service.update_project(
        sold_project.id,
        ProjectUpdate(project_manager_id=admin_user_id),
    )

    assert resp.project_manager is not None
    assert resp.project_manager.id == admin_user_id

    # 回读数据库确认已持久化
    db_session.refresh(sold_project)
    assert sold_project.project_manager_id == admin_user_id


def test_update_sold_project_contract_field_still_filtered(
    db_session: Session,
    sold_project: Project,
    admin_user_id: str,
) -> None:
    """已售状态下合同等敏感字段的过滤语义保持不变（防回归）."""
    service = ProjectService(db_session)
    # contract_no 不在白名单内，应被静默过滤（不更新、不报错）
    resp = service.update_project(
        sold_project.id,
        ProjectUpdate(contract_no="SHOULD-NOT-PERSIST", project_manager_id=admin_user_id),
    )

    # 负责人仍应更新（白名单新增字段生效）
    assert resp.project_manager is not None
    assert resp.project_manager.id == admin_user_id

    # 合同编号未被写入（白名单过滤语义保持；contract_no 存于 project_contracts 表）
    from sqlalchemy import text

    rows = db_session.execute(
        text("SELECT contract_no FROM project_contracts WHERE project_id = :pid AND is_deleted = false"),
        {"pid": sold_project.id},
    ).fetchall()
    assert all(r[0] != "SHOULD-NOT-PERSIST" for r in rows)


def test_update_sold_project_top_level_owner_info_persists(
    db_session: Session,
    sold_project: Project,
) -> None:
    """已售状态下顶层 owner_info（业主备注）必须写入 project_owners 表.

    回归背景：白名单新增 owner_info 后，_update_owner_fields 的 owner_fields
    未包含该字段，导致 update_dict 中的 owner_info 落入 _update_remaining_fields，
    而 Project 主表无此列（owner_info 属于 project_owners），被 hasattr 静默丢弃——
    接口返回 200 但备注未保存。
    """
    service = ProjectService(db_session)
    service.update_project(
        sold_project.id,
        ProjectUpdate(owner_info="已售业主备注"),
    )

    from sqlalchemy import text

    rows = db_session.execute(
        text("SELECT owner_info FROM project_owners WHERE project_id = :pid AND is_deleted = false"),
        {"pid": sold_project.id},
    ).fetchall()
    assert any(r[0] == "已售业主备注" for r in rows)


def test_update_sold_project_owners_list_locked(
    db_session: Session,
    sold_project: Project,
) -> None:
    """已售状态下 owners 列表结构（增删业主）必须被锁定.

    回归背景：owners 在 _filter_allowed_fields 过滤前被 pop 出 update_dict，
    白名单（声明锁定 owners 列表）对其不生效——客户端可直接 PUT 增删
    已售项目的业主列表。修复后已售状态丢弃 owners_payload，不触发 sync_owners。
    """
    service = ProjectService(db_session)
    service.update_project(
        sold_project.id,
        ProjectUpdate(
            owners=[
                {
                    "owner_name": "新增业主",
                    "owner_phone": "13800000000",
                    "relation_type": "业主",
                }
            ],
        ),
    )

    from sqlalchemy import text

    rows = db_session.execute(
        text("SELECT owner_name FROM project_owners WHERE project_id = :pid AND is_deleted = false"),
        {"pid": sold_project.id},
    ).fetchall()
    assert all(r[0] != "新增业主" for r in rows)
