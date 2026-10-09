"""钥匙管理「普通员工（user 主角色 + customer 附加角色）」访问口径回归测试.

缺陷（修复前实测复现，详见 docs/2026-10-09-小程序钥匙管理-普通员工403结论报告.md）：
``/keys/*`` 6 端点复用评估工作台的 ``CurrentCInternalUserDep``（C 端令牌 +
admin/operator 角色复核），``/projects/{id}/keys*`` 挂 ``CurrentInternalUserDep``
（同口径），导致真实世界员工（user 主角色 + customer 附加角色）全模块 403
「仅管理员/运营人员可访问员工工作台」——与服务层 key_access 的权限设计
（admin 全量 / 其他用户按相关人五字段匹配）自相矛盾，相关人匹配成死代码。

修复口径（2026-10-09 产品决议）：钥匙管理对所有有权限的人开放（admin 全量 +
相关人员，不限于管理员）；路由层仅复核后台身份（admin/operator/user 任一），
细粒度过滤在 Service 层；``/auth/me`` 下发 ``keys_accessible`` 供小程序隐藏入口。

既有钥匙 E2E（test_key_share_reveal_disabled.py 等）构造的是「customer 主角色 +
admin 附加角色」的测试专用组合，真实员工组合从未被覆盖——本文件补齐。

覆盖五面：
- 相关人员工（user+customer，ProjectSale.channel_manager_id 匹配）：
  C 端令牌 /keys/properties 200 且仅返回关联房源；创建分享 200；
- 无关员工（user+customer，无任何相关人匹配）：
  /keys/properties 200 空列表；对他人房源创建分享 403（ensure_key_access）；
- 相关人员工后台令牌 GET /projects/{id}/keys 200（修复前 403，锁住路由放宽）；
  无关员工 403；
- /auth/me 的 keys_accessible：admin true / 相关人 true / 无关 user false。
"""

import uuid
from collections.abc import Generator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from main import app
from models import (
    KeyStatus,
    Project,
    ProjectNormalKey,
    ProjectSale,
    ProjectStatus,
    Role,
    User,
    UserRole,
)
from schemas.keys import KeyShareCreateItem, KeyShareCreateRequest
from services.projects.key_access import local_today, utc_now
from utils.auth import (
    AUDIENCE_ADMIN,
    AUDIENCE_C,
    create_access_token,
    get_password_hash,
)

# 测试密码明文（断言 share 前置数据用，非真实账号口令）
_PASSWORD = "123456"

CSRF_HEADERS = {"X-Requested-With": "XMLHttpRequest"}


def _make_employee(session: Session, *, username: str, nickname: str) -> User:
    """创建「user 主角色 + customer 附加角色」的真实员工组合（修复前被路由层 403）."""
    user_role = session.query(Role).filter(Role.code == "user").one()
    customer_role = session.query(Role).filter(Role.code == "customer").one()
    user = User(
        id=str(uuid.uuid4()),
        username=username,
        password=get_password_hash(f"pw-{uuid.uuid4().hex}"),
        nickname=nickname,
        role_id=user_role.id,
        status="active",
    )
    session.add(user)
    session.flush()
    session.add(UserRole(user_id=user.id, role_id=customer_role.id))
    session.flush()
    return user


def _c_token(user: User) -> str:
    """签发 C 端令牌（aud=c，role_claim=customer，与小程序登录内部员工分支同口径）."""
    return create_access_token(
        data={"sub": user.id, "role": "customer", "ver": user.token_version},
        audience=AUDIENCE_C,
    )


def _admin_token(user: User, role_claim: str) -> str:
    """签发后台令牌（aud=admin；小程序内部员工主令牌 / 后台登录同口径）."""
    return create_access_token(
        data={"sub": user.id, "role": role_claim, "ver": user.token_version},
        audience=AUDIENCE_ADMIN,
    )


@pytest.fixture
def keys_access_env(seeded_db: dict[str, Any]) -> Generator[dict[str, Any], None, None]:
    """构造「相关人员工 + 无关员工 + 两套房源 + 有效密码组」环境与四类客户端.

    - employee：user 主角色 + customer 附加角色，ProjectSale.channel_manager_id 关联房源 A；
    - outsider：user 主角色 + customer 附加角色，与 A/B 均无相关人匹配；
    - 各客户端按令牌受众区分（c_access_token → /keys/*；access_token → /projects/*/keys、/auth/me）。
    """
    session: Session = seeded_db["session"]

    employee = _make_employee(session, username=f"keys-emp-{uuid.uuid4().hex[:8]}", nickname="相关人员工")
    outsider = _make_employee(session, username=f"keys-out-{uuid.uuid4().hex[:8]}", nickname="无关员工")

    related_project = Project(
        id=uuid.uuid4(),
        name="钥匙权限-相关人房源 - 关联路 1 号 101 室",
        community_name="关联小区",
        address="关联路 1 号 101 室",
        status=ProjectStatus.SELLING,
    )
    unrelated_project = Project(
        id=uuid.uuid4(),
        name="钥匙权限-无关房源 - 无关路 2 号 201 室",
        community_name="无关小区",
        address="无关路 2 号 201 室",
        status=ProjectStatus.SELLING,
    )
    session.add_all([related_project, unrelated_project])
    session.flush()

    # 员工是房源 A 的渠道负责人（相关人五字段之一）
    session.add(ProjectSale(project_id=related_project.id, channel_manager_id=employee.id))
    # 房源 A 配一把有效普通密码组（创建分享的前置数据）
    key = ProjectNormalKey(
        project_id=related_project.id,
        seq=1,
        password_encrypted=_PASSWORD,
        status=KeyStatus.ACTIVE,
        effective_date=local_today(),
        confirmed_at=utc_now(),
        created_by=employee.id,
    )
    session.add(key)
    session.commit()

    previous_overrides = dict(app.dependency_overrides)

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    try:
        yield {
            "session": session,
            "employee": employee,
            "outsider": outsider,
            "related_project_id": related_project.id,
            "unrelated_project_id": unrelated_project.id,
            "key_id": key.id,
            "employee_c_client": TestClient(app, cookies={"c_access_token": _c_token(employee)}, headers=CSRF_HEADERS),
            "outsider_c_client": TestClient(app, cookies={"c_access_token": _c_token(outsider)}, headers=CSRF_HEADERS),
            "employee_admin_client": TestClient(
                app, cookies={"access_token": _admin_token(employee, "user")}, headers=CSRF_HEADERS
            ),
            "outsider_admin_client": TestClient(
                app, cookies={"access_token": _admin_token(outsider, "user")}, headers=CSRF_HEADERS
            ),
            "admin_admin_client": TestClient(
                app, cookies={"access_token": _admin_token(seeded_db["users"]["admin"], "admin")}, headers=CSRF_HEADERS
            ),
        }
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)


class TestKeysEmployeeAccess:
    """user 主角色 + customer 附加角色的员工钥匙访问口径（方案 A）."""

    def test_related_employee_properties_only_related(self, keys_access_env: dict[str, Any]) -> None:
        """相关人员工：/keys/properties 200 且仅返回关联房源（修复前 403）."""
        resp = keys_access_env["employee_c_client"].get("/api/v1/keys/properties")
        assert resp.status_code == 200, resp.text
        items = resp.json()["items"]
        assert {item["project_id"] for item in items} == {str(keys_access_env["related_project_id"])}

    def test_unrelated_employee_properties_empty(self, keys_access_env: dict[str, Any]) -> None:
        """无关员工：/keys/properties 200 空列表（Service 层过滤，非 403）."""
        resp = keys_access_env["outsider_c_client"].get("/api/v1/keys/properties")
        assert resp.status_code == 200, resp.text
        assert resp.json()["items"] == []

    def test_related_employee_create_share_ok(self, keys_access_env: dict[str, Any]) -> None:
        """相关人员工：对关联房源创建分享 200."""
        resp = keys_access_env["employee_c_client"].post(
            "/api/v1/keys/shares",
            json=KeyShareCreateRequest(
                items=[
                    KeyShareCreateItem(
                        project_id=keys_access_env["related_project_id"], key_id=keys_access_env["key_id"]
                    )
                ],
                expires_in_days=1,
            ).model_dump(mode="json"),
        )
        assert resp.status_code == 200, resp.text

    def test_unrelated_employee_create_share_forbidden(self, keys_access_env: dict[str, Any]) -> None:
        """无关员工：对他人房源创建分享 403（ensure_key_access 细粒度拦截）."""
        resp = keys_access_env["outsider_c_client"].post(
            "/api/v1/keys/shares",
            json=KeyShareCreateRequest(
                items=[
                    KeyShareCreateItem(
                        project_id=keys_access_env["related_project_id"], key_id=keys_access_env["key_id"]
                    )
                ],
                expires_in_days=1,
            ).model_dump(mode="json"),
        )
        assert resp.status_code == 403, resp.text

    def test_related_employee_project_keys_detail_ok(self, keys_access_env: dict[str, Any]) -> None:
        """相关人员工（后台令牌）：GET /projects/{id}/keys 200（修复前 CurrentInternalUserDep 403）."""
        resp = keys_access_env["employee_admin_client"].get(
            f"/api/v1/projects/{keys_access_env['related_project_id']}/keys"
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert isinstance(body["normal_keys"], list)

    def test_unrelated_employee_project_keys_detail_forbidden(self, keys_access_env: dict[str, Any]) -> None:
        """无关员工（后台令牌）：GET /projects/{id}/keys 403（ensure_key_access）."""
        resp = keys_access_env["outsider_admin_client"].get(
            f"/api/v1/projects/{keys_access_env['related_project_id']}/keys"
        )
        assert resp.status_code == 403, resp.text

    def test_auth_me_keys_accessible(self, keys_access_env: dict[str, Any]) -> None:
        """/auth/me 下发 keys_accessible：admin 恒 true / 相关人 true / 无关 user false."""
        admin_body = keys_access_env["admin_admin_client"].get("/api/v1/auth/me").json()
        assert admin_body["keys_accessible"] is True

        employee_body = keys_access_env["employee_admin_client"].get("/api/v1/auth/me").json()
        assert employee_body["keys_accessible"] is True

        outsider_body = keys_access_env["outsider_admin_client"].get("/api/v1/auth/me").json()
        assert outsider_body["keys_accessible"] is False
