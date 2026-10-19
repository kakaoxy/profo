"""已售（sold）项目字段可写性回归测试.

历史背景：``ProjectUpdater._filter_allowed_fields`` 白名单在 sold 状态下静默丢弃
合同/业主列表等字段（接口仍返回 200），是「成交后无法修改信息、无法上传附件」的
根因。SPEC-project-archive 已**移除该白名单**，写锁语义收口到独立归档标记
（``Project.is_archived`` + ``assert_project_not_archived``）。

本文件锁定新语义（与 test_project_archive.py 互补）：
1. sold 状态下 project_manager_id / contract_no / owner_info / owners 列表全部可写；
2. 归档后同样的写入被拒绝（400），不再静默丢字段；
3. 文件名保留（避免引用断裂），正文语义已按白名单移除重写。
"""

import uuid
from datetime import date
from typing import Any

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from models import Project
from models.common import ProjectStatus
from schemas.project import ProjectUpdate
from schemas.project.archive import ProjectArchiveRequest
from services.projects.facade import ProjectService
from services.system.exceptions import ValidationError


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
    """已售状态下更新 project_manager_id 必须持久化并回显."""
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


def test_update_sold_project_contract_field_persists(
    db_session: Session,
    sold_project: Project,
    admin_user_id: str,
) -> None:
    """已售状态下合同字段（原白名单锁定项）必须持久化.

    白名单移除后语义反转：contract_no / signing_price 不再被静默过滤，
    成交后补录/校正合同信息按业务预期生效。
    """
    service = ProjectService(db_session)
    contract_no = f"SH{uuid.uuid4().hex[:8].upper()}-DL"
    resp = service.update_project(
        sold_project.id,
        ProjectUpdate(
            contract_no=contract_no,
            signing_price=123,
            project_manager_id=admin_user_id,
        ),
    )

    # 负责人仍应更新
    assert resp.project_manager is not None
    assert resp.project_manager.id == admin_user_id

    row = db_session.execute(
        text("SELECT contract_no, signing_price FROM project_contracts WHERE project_id = :pid AND is_deleted = false"),
        {"pid": sold_project.id},
    ).fetchone()
    assert row is not None
    assert row[0] == contract_no
    assert str(row[1]) == "123.00"


def test_update_sold_project_top_level_owner_info_persists(
    db_session: Session,
    sold_project: Project,
) -> None:
    """已售状态下顶层 owner_info（业主备注）必须写入 project_owners 表."""
    service = ProjectService(db_session)
    service.update_project(
        sold_project.id,
        ProjectUpdate(owner_info="已售业主备注"),
    )

    rows = db_session.execute(
        text("SELECT owner_info FROM project_owners WHERE project_id = :pid AND is_deleted = false"),
        {"pid": sold_project.id},
    ).fetchall()
    assert any(r[0] == "已售业主备注" for r in rows)


def test_update_sold_project_owners_list_writable(
    db_session: Session,
    sold_project: Project,
) -> None:
    """已售状态下 owners 列表（增删业主）可写.

    旧白名单语义直接丢弃 owners_payload；归档锁替代后，未归档的 sold 项目
    业主列表同步正常生效（归档后才拒绝）。
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

    rows = db_session.execute(
        text("SELECT owner_name FROM project_owners WHERE project_id = :pid AND is_deleted = false"),
        {"pid": sold_project.id},
    ).fetchall()
    assert any(r[0] == "新增业主" for r in rows)


def test_update_archived_sold_project_rejected(
    db_session: Session,
    sold_project: Project,
    admin_user_id: str,
) -> None:
    """归档后同样的写入被拒绝（400，Fail Loud 不再静默丢字段）."""
    service = ProjectService(db_session)
    service.archive_project(sold_project.id, ProjectArchiveRequest(archived_at=date(2026, 11, 25)))

    with pytest.raises(ValidationError) as exc:
        service.update_project(
            sold_project.id,
            ProjectUpdate(contract_no="SH-ARCHIVED", project_manager_id=admin_user_id),
        )
    assert "项目已归档" in str(exc.value)

    rows = db_session.execute(
        text("SELECT contract_no FROM project_contracts WHERE project_id = :pid AND is_deleted = false"),
        {"pid": sold_project.id},
    ).fetchall()
    assert all(r[0] != "SH-ARCHIVED" for r in rows)
