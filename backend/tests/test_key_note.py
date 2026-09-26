"""带看注意事项（projects.key_note）HTTP 层回归测试.

覆盖房源级备注的完整链路：
- 录入/修改：PUT /api/v1/projects/{id}/keys/note → 详情/概要同步可见；
- 边界：201 字 422、200 字通过、空串/纯空白清空（存 NULL）；
- 经纪人分享页实时展示：GET /api/v1/public/key-shares/{token} 条目携带 key_note，
  编辑后立即生效（无快照）；
- 越权：无 admin 角色（operator）且与房源无关的用户 → 403。
"""

import uuid
from collections.abc import Generator
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from main import app
from models import KeyShare, KeyStatus, Project, ProjectNormalKey, ProjectStatus, Role, User
from services.projects.key_access import local_today, utc_now
from utils.auth import AUDIENCE_ADMIN, create_access_token, get_password_hash


def _make_user(session: Session, *, role_code: str, username: str, nickname: str) -> User:
    """按角色码创建用户（admin-audience 令牌可用的内部角色）."""
    role = session.query(Role).filter(Role.code == role_code).one()
    user = User(
        id=str(uuid.uuid4()),
        username=username,
        password=get_password_hash(f"pw-{uuid.uuid4().hex}"),
        nickname=nickname,
        role_id=role.id,
        status="active",
    )
    session.add(user)
    session.flush()
    return user


def _admin_token(user: User) -> str:
    """签发后台令牌（aud=admin）."""
    return create_access_token(
        data={"sub": user.id, "role": user.role.code if user.role else "user", "ver": user.token_version},
        audience=AUDIENCE_ADMIN,
    )


@pytest.fixture
def key_note_env(seeded_db: dict[str, Any]) -> Generator[dict[str, Any], None, None]:
    """构造「admin + 无关 operator + 房源 + 有效普通密码组」环境与客户端."""
    session: Session = seeded_db["session"]

    admin_user = seeded_db["users"]["admin"]
    operator = _make_user(
        session, role_code="operator", username=f"key-note-op-{uuid.uuid4().hex[:8]}", nickname="无关操作员"
    )

    project = Project(
        id=uuid.uuid4(),
        name="注意事项测试房源",
        community_name="测试小区",
        address="测试路 3 号 303 室",
        status=ProjectStatus.SELLING,
    )
    session.add(project)
    session.flush()

    key = ProjectNormalKey(
        project_id=project.id,
        seq=1,
        password_encrypted="123456",
        status=KeyStatus.ACTIVE,
        effective_date=local_today(),
        confirmed_at=utc_now(),
        created_by=str(admin_user.id),
    )
    session.add(key)
    session.flush()

    previous_overrides = dict(app.dependency_overrides)

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    csrf_headers = {"X-Requested-With": "XMLHttpRequest"}
    admin_client = TestClient(
        app, cookies={"access_token": _admin_token(admin_user)}, headers=csrf_headers, raise_server_exceptions=False
    )
    operator_client = TestClient(
        app, cookies={"access_token": _admin_token(operator)}, headers=csrf_headers, raise_server_exceptions=False
    )
    anon_client = TestClient(app, raise_server_exceptions=False)
    try:
        yield {
            "session": session,
            "admin": admin_user,
            "project_id": project.id,
            "key_id": key.id,
            "admin_client": admin_client,
            "operator_client": operator_client,
            "anon_client": anon_client,
        }
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)


def _put_note(client: TestClient, project_id: uuid.UUID, note: str) -> Any:
    return client.put(f"/api/v1/projects/{project_id}/keys/note", json={"note": note})


class TestKeyNoteCrud:
    """备注录入/修改/清空与边界."""

    def test_put_note_visible_in_detail_and_summary(self, key_note_env: dict[str, Any]) -> None:
        pid = key_note_env["project_id"]
        resp = _put_note(key_note_env["admin_client"], pid, "门锁在左手边柜后")
        assert resp.status_code == 200, resp.text
        assert resp.json()["key_note"] == "门锁在左手边柜后"

        detail = key_note_env["admin_client"].get(f"/api/v1/projects/{pid}/keys")
        assert detail.status_code == 200, detail.text
        assert detail.json()["key_note"] == "门锁在左手边柜后"

        summary = key_note_env["admin_client"].get(f"/api/v1/projects/{pid}/keys/summary")
        assert summary.status_code == 200, summary.text
        assert summary.json()["key_note"] == "门锁在左手边柜后"

    def test_whitespace_only_note_cleared(self, key_note_env: dict[str, Any]) -> None:
        """空串与纯空白均清空（存 NULL，分享页卡片隐藏）."""
        pid = key_note_env["project_id"]
        assert _put_note(key_note_env["admin_client"], pid, "临时备注").status_code == 200
        resp = _put_note(key_note_env["admin_client"], pid, "   ")
        assert resp.status_code == 200, resp.text
        assert resp.json()["key_note"] is None

    def test_overlong_note_rejected_422(self, key_note_env: dict[str, Any]) -> None:
        resp = _put_note(key_note_env["admin_client"], key_note_env["project_id"], "长" * 201)
        assert resp.status_code == 422, resp.text
        assert "超过最大长度限制" in resp.json()["message"]

    def test_boundary_200_chars_accepted(self, key_note_env: dict[str, Any]) -> None:
        resp = _put_note(key_note_env["admin_client"], key_note_env["project_id"], "界" * 200)
        assert resp.status_code == 200, resp.text
        assert len(resp.json()["key_note"]) == 200

    def test_unrelated_operator_forbidden(self, key_note_env: dict[str, Any]) -> None:
        """Operator 通过内部角色鉴权，但与房源无关 → 403."""
        resp = _put_note(key_note_env["operator_client"], key_note_env["project_id"], "越权备注")
        assert resp.status_code == 403, resp.text


class TestKeyNoteOnPublicShare:
    """经纪人分享页实时展示（无快照）."""

    def _create_share(self, env: dict[str, Any]) -> str:
        session: Session = env["session"]
        share = KeyShare(
            token=f"tok-{uuid.uuid4().hex}",
            sharer_id=str(env["admin"].id),
            items=[{"project_id": str(env["project_id"]), "key_id": str(env["key_id"])}],
            expires_at=utc_now() + timedelta(days=1),
        )
        session.add(share)
        session.commit()
        return share.token

    def test_note_visible_and_live_on_public_share(self, key_note_env: dict[str, Any]) -> None:
        token = self._create_share(key_note_env)
        anon_client = key_note_env["anon_client"]

        assert _put_note(key_note_env["admin_client"], key_note_env["project_id"], "第一版注意事项").status_code == 200
        page = anon_client.get(f"/api/v1/public/key-shares/{token}")
        assert page.status_code == 200, page.text
        assert page.json()["items"][0]["key_note"] == "第一版注意事项"

        # 实时生效：编辑后无需重新分享，同一 token 立即返回新值
        assert _put_note(key_note_env["admin_client"], key_note_env["project_id"], "第二版注意事项").status_code == 200
        page = anon_client.get(f"/api/v1/public/key-shares/{token}")
        assert page.status_code == 200, page.text
        assert page.json()["items"][0]["key_note"] == "第二版注意事项"
