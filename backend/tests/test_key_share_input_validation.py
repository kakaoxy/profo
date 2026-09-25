"""钥匙分享 / 普通密码录入入参边界回归测试（HTTP 层）.

修复前实测的两个入参缺口，均表现为写接口直接 500（未处理异常），而非可读的 4xx：

1. ``POST /api/v1/keys/shares`` 与 ``POST /api/v1/keys/shares/{id}/extend`` 的
   ``expires_at`` 接受无时区输入；服务层以 tz-aware 的 ``utc_now()`` 与之比较
   → ``TypeError: can't compare offset-naive and offset-aware datetimes``
   → 500「服务器内部错误，请稍后重试」。仓库既有口径（``schemas/project/sales.py``）
   为「无时区输入按东八区解析，显式带时区原样保留」，本模块应同口径。

2. ``POST /api/v1/projects/{id}/keys/normal/batch`` 的 ``passwords`` 未限制单条明文长度，
   而 ORM 字段为 ``EncryptedString(50)``：超长明文在绑定期抛 ``ValueError``
   → 500「数据库错误」。同模块的单条录入（``ManagerKeyPutRequest``）与修改
   （``NormalKeyUpdateRequest``）均已限制 50，批量路径应一致。

覆盖：naive 创建/延长按东八区解析；显式偏移原样保留（不二次偏移）；
naive 过去时间给业务错误而非 500；批量录入 51 字符 422、50 字符边界通过。
"""

import uuid
from collections.abc import Generator
from datetime import datetime, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from main import app
from models import KeyShare, KeyStatus, Project, ProjectNormalKey, ProjectStatus, Role, User, UserRole
from services.projects.key_access import local_today, utc_now
from utils.auth import AUDIENCE_ADMIN, AUDIENCE_C, create_access_token, get_password_hash

# 测试密码明文（非真实账号口令）
_PASSWORD = "123456"


def _parse_ts(value: str) -> datetime:
    """解析响应中的 ISO 时间（兼容 'Z' 后缀）为 tz-aware datetime."""
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _make_customer_user(session: Session, *, username: str, nickname: str) -> User:
    """创建持 customer 角色的 C 端用户（员工端令牌体系入口）."""
    customer_role = session.query(Role).filter(Role.code == "customer").one()
    user = User(
        id=str(uuid.uuid4()),
        username=username,
        password=get_password_hash(f"pw-{uuid.uuid4().hex}"),
        nickname=nickname,
        role_id=customer_role.id,
        status="active",
    )
    session.add(user)
    session.flush()
    return user


def _c_token(user: User) -> str:
    """签发 C 端令牌（aud=c；员工侧端点再复核 admin/operator 附加角色）."""
    return create_access_token(
        data={"sub": user.id, "role": "customer", "ver": user.token_version},
        audience=AUDIENCE_C,
    )


@pytest.fixture
def key_input_env(seeded_db: dict[str, Any]) -> Generator[dict[str, Any], None, None]:
    """构造「员工 + 房源 + 有效普通密码组 + 进行中分享」环境与三端客户端.

    - employee_client：员工（customer 主角色 + admin 附加角色），走 /keys/* 与 /projects/*；
    - admin_client：后台管理员令牌（aud=admin），走 /projects/{id}/keys/*；
    - anon_client：免登录客户端（公开页 GET）。
    """
    session: Session = seeded_db["session"]

    staff = _make_customer_user(session, username=f"keys-input-{uuid.uuid4().hex[:8]}", nickname="入参员工")
    admin_role = session.query(Role).filter(Role.code == "admin").one()
    session.add(UserRole(user_id=staff.id, role_id=admin_role.id))
    session.flush()

    project = Project(
        id=uuid.uuid4(),
        name="入参校验测试房源",
        community_name="测试小区",
        address="测试路 2 号 202 室",
        status=ProjectStatus.SELLING,
    )
    session.add(project)
    session.flush()

    key = ProjectNormalKey(
        project_id=project.id,
        seq=1,
        password_encrypted=_PASSWORD,
        status=KeyStatus.ACTIVE,
        effective_date=local_today(),
        confirmed_at=utc_now(),
        created_by=staff.id,
    )
    session.add(key)
    session.flush()

    admin_user = seeded_db["users"]["admin"]
    admin_token = create_access_token(
        data={"sub": admin_user.id, "role": "admin", "ver": admin_user.token_version},
        audience=AUDIENCE_ADMIN,
    )

    previous_overrides = dict(app.dependency_overrides)

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    csrf_headers = {"X-Requested-With": "XMLHttpRequest"}
    employee_client = TestClient(
        app, cookies={"c_access_token": _c_token(staff)}, headers=csrf_headers, raise_server_exceptions=False
    )
    admin_client = TestClient(
        app, cookies={"access_token": admin_token}, headers=csrf_headers, raise_server_exceptions=False
    )
    anon_client = TestClient(app, raise_server_exceptions=False)
    try:
        yield {
            "session": session,
            "staff": staff,
            "project_id": project.id,
            "key_id": key.id,
            "employee_client": employee_client,
            "admin_client": admin_client,
            "anon_client": anon_client,
        }
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)


def _create_share(client: TestClient, project_id: uuid.UUID, key_id: uuid.UUID, **extra: Any) -> Any:
    payload: dict[str, Any] = {"items": [{"project_id": str(project_id), "key_id": str(key_id)}]}
    payload.update(extra)
    return client.post("/api/v1/keys/shares", json=payload)


class TestKeyShareExpiresAtTz:
    """expires_at 无时区输入按东八区解析（修复前：TypeError → 500）."""

    def test_create_share_naive_expires_at_parsed_as_cst(self, key_input_env: dict[str, Any]) -> None:
        """naive「2027-01-01 18:00」= 东八区 18:00 → UTC 10:00."""
        resp = _create_share(
            key_input_env["employee_client"],
            key_input_env["project_id"],
            key_input_env["key_id"],
            expires_at="2027-01-01T18:00:00",
        )
        assert resp.status_code == 200, resp.text
        assert _parse_ts(resp.json()["expires_at"]) == datetime(2027, 1, 1, 10, 0, tzinfo=timezone.utc)

    def test_extend_share_naive_expires_at_parsed_as_cst(self, key_input_env: dict[str, Any]) -> None:
        """延长有效期同样按东八区解析（修复前同一处 500）."""
        created = _create_share(
            key_input_env["employee_client"], key_input_env["project_id"], key_input_env["key_id"], expires_in_days=1
        )
        assert created.status_code == 200, created.text
        share_id = created.json()["id"]

        resp = key_input_env["employee_client"].post(
            f"/api/v1/keys/shares/{share_id}/extend", json={"expires_at": "2027-01-01T18:00:00"}
        )
        assert resp.status_code == 200, resp.text
        assert _parse_ts(resp.json()["expires_at"]) == datetime(2027, 1, 1, 10, 0, tzinfo=timezone.utc)

    def test_aware_expires_at_preserved(self, key_input_env: dict[str, Any]) -> None:
        """显式带偏移「+09:00」原样保留：同一时刻，不做二次偏移."""
        resp = _create_share(
            key_input_env["employee_client"],
            key_input_env["project_id"],
            key_input_env["key_id"],
            expires_at="2027-01-01T00:00:00+09:00",
        )
        assert resp.status_code == 200, resp.text
        assert _parse_ts(resp.json()["expires_at"]) == datetime(2026, 12, 31, 15, 0, tzinfo=timezone.utc)

    def test_naive_past_expires_at_rejected_as_business_error(self, key_input_env: dict[str, Any]) -> None:
        """无时区过去时间 → 可读业务错误（400），而非 500."""
        resp = _create_share(
            key_input_env["employee_client"],
            key_input_env["project_id"],
            key_input_env["key_id"],
            expires_at="2020-01-01T00:00:00",
        )
        assert resp.status_code == 400, resp.text
        assert "失效时间必须晚于当前时间" in resp.json()["message"]

    def test_aware_past_expires_at_rejected_as_business_error(self, key_input_env: dict[str, Any]) -> None:
        """带时区的过去时间同样给业务错误（口径一致，未过度拦截未来时间）."""
        resp = _create_share(
            key_input_env["employee_client"],
            key_input_env["project_id"],
            key_input_env["key_id"],
            expires_at="2020-01-01T00:00:00+08:00",
        )
        assert resp.status_code == 400, resp.text
        assert "失效时间必须晚于当前时间" in resp.json()["message"]


class TestNormalKeyPasswordLengthGuard:
    """批量录入单条明文长度上限 50（修复前超长 → 500「数据库错误」）."""

    def _batch_url(self, project_id: uuid.UUID) -> str:
        return f"/api/v1/projects/{project_id}/keys/normal/batch"

    def test_overlong_password_rejected_as_validation_error(self, key_input_env: dict[str, Any]) -> None:
        resp = key_input_env["admin_client"].post(
            self._batch_url(key_input_env["project_id"]), json={"passwords": ["9" * 51]}
        )
        assert resp.status_code == 422, resp.text
        assert "超过最大长度限制" in resp.json()["message"]

    def test_boundary_length_password_accepted(self, key_input_env: dict[str, Any]) -> None:
        """边界 50 字符仍可录入（防过度拦截）."""
        resp = key_input_env["admin_client"].post(
            self._batch_url(key_input_env["project_id"]), json={"passwords": ["8" * 50]}
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["counts"]["active"] == 2

    def test_public_share_reveal_after_overlong_attempt(self, key_input_env: dict[str, Any]) -> None:
        """超长录入被拒后，既有分享与明文取回不受影响（无脏事务残留）."""
        session: Session = key_input_env["session"]
        share = KeyShare(
            token=f"tok-{uuid.uuid4().hex}",
            sharer_id=str(key_input_env["staff"].id),
            items=[{"project_id": str(key_input_env["project_id"]), "key_id": str(key_input_env["key_id"])}],
            expires_at=utc_now(),
        )
        session.add(share)
        session.commit()

        rejected = key_input_env["admin_client"].post(
            self._batch_url(key_input_env["project_id"]), json={"passwords": ["9" * 51]}
        )
        assert rejected.status_code == 422, rejected.text

        page = key_input_env["anon_client"].get(f"/api/v1/public/key-shares/{share.token}")
        assert page.status_code == 200, page.text
        assert page.json()["items"][0]["key_deleted"] is False
