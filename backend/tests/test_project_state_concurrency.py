"""测试项目状态更新的并发安全性.

验证 with_for_update() + populate_existing() 能正确刷新 identity map，
防止基于陈旧状态的状态流转校验通过。
"""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from models import Project
from models.common import ProjectStatus
from schemas.project import ProjectStatusUpdate
from services.projects.internal import ProjectQueryService, ProjectStateManager
from services.system.exceptions import ValidationError


@pytest.fixture
def test_project(db_session: Session) -> Project:
    """创建一个状态为 selling 的测试项目."""
    project = Project(
        id=str(uuid.uuid4()),
        name="测试小区 - 测试地址",
        community_name="测试小区",
        address="测试地址",
        status=ProjectStatus.SELLING,
    )
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)
    return project


def test_update_status_rejects_stale_read_after_concurrent_change(db_session: Session, test_project: Project) -> None:
    """with_for_update 必须刷新 identity map，防止陈旧状态通过校验.

    场景：
    1. 请求 A 加载项目（status=selling），放入 identity map
    2. 请求 B（并发）将项目状态改为 renovating 并提交
    3. 请求 A 调用 update_status → "sold"
       - 只有 selling/sold 能转到 sold
       - renovating → sold 应被拒绝

    如果 with_for_update 不刷新 identity map，locked_project.status 仍为
    selling（陈旧），校验通过，导致非法状态流转。

    注意：不能用 db_session.commit() 来提交原生 SQL 修改，因为 commit 会
    expire 所有 identity map 对象，从而掩盖陈旧读问题。改用不提交的原生
    SQL UPDATE——在同一事务内 DB 已看到新值，但 ORM identity map 仍保留
    旧值，准确模拟了"另一事务已提交、本事务 identity map 陈旧"的场景。

    """
    query_service = ProjectQueryService(db_session)
    state_manager = ProjectStateManager(db_session)

    # Step 1: 加载项目到 identity map（模拟请求 A 的初始读取）
    project = query_service.get_by_id(test_project.id, include_all=False)
    assert project.status == ProjectStatus.SELLING

    # Step 2: 模拟并发修改——用原生 SQL 绕过 ORM，不 commit 以保持 identity map 陈旧
    db_session.execute(
        text("UPDATE projects SET status = :status WHERE id = :pid"),
        {"status": ProjectStatus.RENOVATING.value, "pid": test_project.id},
    )
    # 不 commit：DB 层已更新（同一事务可见），identity map 中的 project.status 仍为 selling

    # Step 3: 尝试将状态改为 sold
    # renovating → sold 是非法流转，应被拒绝
    status_update = ProjectStatusUpdate(status=ProjectStatus.SOLD)

    with pytest.raises(ValidationError, match="只有在售或已售状态才能切换到已售状态"):
        state_manager.update_status(project, status_update)
