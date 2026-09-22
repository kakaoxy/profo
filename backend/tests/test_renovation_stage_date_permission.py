"""装修阶段完成时间修改端点权限测试（HTTP 层）.

锁定 PATCH /projects/{project_id}/renovation/stages/{stage} 的双通道权限行为：
1. admin → 200
2. 自定义角色持 project:write → 200（回归用例：修复前 Router 硬编码 admin 角色 → 403）
3. user-role（默认种子无任何 project 权限）→ 403
4. 装修对接负责人（业务身份、无权限码）→ 200
5. operator 调 DELETE /projects/{id} → 403（project:delete 权限码仅 admin 持有，
   与前端删除按钮按 project:delete 显隐的口径对齐）

测试在 HTTP 层（TestClient）执行，直接操作 role_permissions 关联表 +
签发 token（ver 取当前 token_version），不走 set_role_permissions 以避免
token_version 递增；权限计算每次查库，直接写关联即生效。
"""

import uuid
from collections.abc import Generator
from typing import Any
from urllib.parse import quote

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from main import app
from models import Permission, Project, ProjectRenovation, Role, User, role_permissions
from models.common import ProjectStatus
from utils.auth import AUDIENCE_ADMIN, create_access_token, get_password_hash


def _make_db_override(session: Session) -> type[Generator[Session, None, None]]:
    """创建生成器函数作为 get_db 覆盖（FastAPI 需要生成器函数而非返回生成器的普通函数）."""

    def _override() -> Generator[Session, None, None]:
        yield session

    return _override


def _make_client(token: str) -> TestClient:
    """创建带 access_token cookie 与 CSRF 防护头的 TestClient."""
    client = TestClient(app, cookies={"access_token": token})
    client.headers["X-Requested-With"] = "XMLHttpRequest"
    return client


def _make_token(user: User, role_code: str) -> str:
    """为用户签发后台受众 access_token."""
    return create_access_token(
        data={"sub": user.id, "role": role_code, "ver": user.token_version},
        audience=AUDIENCE_ADMIN,
    )


def _make_project(session: Session) -> Project:
    """创建装修中状态的项目."""
    project = Project(
        id=uuid.uuid4(),
        name=f"测试项目-{uuid.uuid4().hex[:8]}",
        community_name="测试小区",
        address="测试地址",
        status=ProjectStatus.RENOVATING.value,
        is_deleted=False,
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


def _make_renovation(
    session: Session,
    *,
    project_id: uuid.UUID,
    contact_person_id: str | None = None,
) -> ProjectRenovation:
    """创建装修记录（默认水电阶段已完成，便于修改完成时间）."""
    renovation = ProjectRenovation(
        id=uuid.uuid4(),
        project_id=project_id,
        contact_person_id=contact_person_id,
        stage_completed_dates={"水电": "2026-01-15"},
        is_deleted=False,
    )
    session.add(renovation)
    session.commit()
    session.refresh(renovation)
    return renovation


def _make_user(session: Session, *, username: str, role: Role) -> User:
    """创建指定角色的用户."""
    user = User(
        id=f"user-{uuid.uuid4().hex[:12]}",
        username=username,
        password=get_password_hash("Test123!"),
        nickname=username,
        role_id=role.id,
        status="active",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _grant_permission(session: Session, role: Role, code: str) -> None:
    """直接向角色授予权限码（写 role_permissions 关联表）."""
    perm = session.query(Permission).filter(Permission.code == code).first()
    assert perm is not None, f"权限码 {code} 应已由种子数据创建"
    existing = session.execute(
        role_permissions.select().where(
            role_permissions.c.role_id == role.id,
            role_permissions.c.permission_id == perm.id,
        )
    ).first()
    if existing is None:
        session.execute(
            role_permissions.insert().values(role_id=role.id, permission_id=perm.id),
        )
        session.commit()


def _patch_stage_date(client: TestClient, project_id: uuid.UUID, stage: str = "水电"):
    """调用修改阶段完成时间接口（水电 → 2026-02-01）."""
    return client.patch(
        f"/api/v1/projects/{project_id}/renovation/stages/{quote(stage)}",
        json={"stage_completed_at": "2026-02-01T00:00:00Z"},
    )


class TestRenovationStageDatePermission:
    """PATCH /projects/{id}/renovation/stages/{stage} 双通道权限测试."""

    def test_admin_can_update_stage_date(self, seeded_db: dict[str, Any]) -> None:
        """Admin 调用 → 200."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        project = _make_project(session)
        _make_renovation(session, project_id=project.id)

        app.dependency_overrides[db.get_db] = _make_db_override(session)
        try:
            client = _make_client(_make_token(admin, "admin"))
            resp = _patch_stage_date(client, project.id)
            assert resp.status_code == 200, f"admin 修改阶段时间应返回 200，实际 {resp.status_code}: {resp.text}"
        finally:
            app.dependency_overrides.clear()

    def test_custom_role_with_project_write_can_update_stage_date(self, seeded_db: dict[str, Any]) -> None:
        """自定义角色持 project:write → 200（核心回归用例：修复前 403）."""
        session = seeded_db["session"]

        custom_role = Role(
            id=f"role-{uuid.uuid4().hex[:12]}",
            name="自定义编辑角色",
            code=f"custom-writer-{uuid.uuid4().hex[:8]}",
            permissions=None,
        )
        session.add(custom_role)
        session.commit()
        _grant_permission(session, custom_role, "project:write")

        user = _make_user(session, username=f"writer-{uuid.uuid4().hex[:8]}", role=custom_role)
        project = _make_project(session)
        _make_renovation(session, project_id=project.id)

        app.dependency_overrides[db.get_db] = _make_db_override(session)
        try:
            client = _make_client(_make_token(user, custom_role.code))
            resp = _patch_stage_date(client, project.id)
            assert resp.status_code == 200, (
                f"持 project:write 的自定义角色修改阶段时间应返回 200，实际 {resp.status_code}: {resp.text}"
            )
        finally:
            app.dependency_overrides.clear()

    def test_user_role_without_project_permission_rejected(self, seeded_db: dict[str, Any]) -> None:
        """user-role（默认种子无任何 project 权限）→ 403."""
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]
        project = _make_project(session)
        _make_renovation(session, project_id=project.id)

        app.dependency_overrides[db.get_db] = _make_db_override(session)
        try:
            client = _make_client(_make_token(normal, "user"))
            resp = _patch_stage_date(client, project.id)
            assert resp.status_code == 403, f"无 project 权限用户应返回 403，实际 {resp.status_code}"
        finally:
            app.dependency_overrides.clear()

    def test_renovation_contact_person_can_update_stage_date(self, seeded_db: dict[str, Any]) -> None:
        """装修对接负责人（业务身份、无权限码）→ 200."""
        session = seeded_db["session"]

        user_role = session.query(Role).filter(Role.code == "user").first()
        contact = _make_user(session, username=f"contact-{uuid.uuid4().hex[:8]}", role=user_role)
        project = _make_project(session)
        _make_renovation(session, project_id=project.id, contact_person_id=str(contact.id))

        app.dependency_overrides[db.get_db] = _make_db_override(session)
        try:
            client = _make_client(_make_token(contact, "user"))
            resp = _patch_stage_date(client, project.id)
            assert resp.status_code == 200, (
                f"装修对接负责人修改阶段时间应返回 200，实际 {resp.status_code}: {resp.text}"
            )
        finally:
            app.dependency_overrides.clear()

    def test_operator_cannot_delete_project(self, seeded_db: dict[str, Any]) -> None:
        """Operator 调 DELETE /projects/{id} → 403（project:delete 仅 admin 持有）."""
        session = seeded_db["session"]

        operator_role = session.query(Role).filter(Role.code == "operator").first()
        operator = _make_user(session, username=f"operator-{uuid.uuid4().hex[:8]}", role=operator_role)

        app.dependency_overrides[db.get_db] = _make_db_override(session)
        try:
            client = _make_client(_make_token(operator, "operator"))
            resp = client.delete(f"/api/v1/projects/{uuid.uuid4()}")
            assert resp.status_code == 403, f"operator 删除项目应返回 403，实际 {resp.status_code}"
        finally:
            app.dependency_overrides.clear()


class TestStageDateSideEffect:
    """修改成功后的数据联动校验."""

    def test_update_stage_date_persists(self, seeded_db: dict[str, Any]) -> None:
        """Admin 修改水电阶段完成时间 → stage_completed_dates 更新为 2026-02-01."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        project = _make_project(session)
        renovation = _make_renovation(session, project_id=project.id)

        app.dependency_overrides[db.get_db] = _make_db_override(session)
        try:
            client = _make_client(_make_token(admin, "admin"))
            resp = _patch_stage_date(client, project.id)
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

        session.refresh(renovation)
        assert renovation.stage_completed_dates is not None
        assert renovation.stage_completed_dates.get("水电") == "2026-02-01"
        # 未传 renovation_stage → 主阶段不流转（仍为装修中项目）
        session.refresh(project)
        assert project.renovation_stage is None
