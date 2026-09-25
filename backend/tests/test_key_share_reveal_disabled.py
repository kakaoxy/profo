"""钥匙分享失效态「不可查看密码」回归测试.

缺陷（修复前实测复现）：员工停用某普通密码组后，持分享链接的经纪人仍可
``POST /public/key-shares/{token}/keys/{key_id}/reveal`` 取回明文——分享条目 JSONB
仍指向该组，而 reveal 仅校验「条目归属」，未校验密码组状态，与员工端提示
「停用后经纪人端立即失效」、管理端「停用后该组密码不再可用」相悖。

口径（2026-09-25 更新）：回收 / 过期 / 删除 / 停用四种失效态一律不可查看明文；
过期与回收可分别通过「延长有效期」「重新分享」恢复/替代（设计稿原「过期软提示不阻断」口径作废）。

覆盖四面：
- 有效组：公开页不标失效 + reveal 可取回明文（防过度拦截）；
- 停用组：公开页标失效 + reveal 拒绝（422）且不写查看记录；
- 员工分享详情：停用组同口径标失效；
- 过期组：公开页 is_expired=True + reveal 拒绝（422）且不写查看记录；延长有效期后恢复可取回。
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
from models import (
    KeyShare,
    KeyShareView,
    KeyStatus,
    Project,
    ProjectNormalKey,
    ProjectStatus,
    Role,
    User,
    UserRole,
)
from schemas.keys import KeyShareCreateItem, KeyShareCreateRequest, NormalKeyUpdateRequest
from services.projects.key_access import local_today, utc_now
from services.projects.key_shares import KeyShareService
from services.projects.keys import KeyService
from utils.auth import AUDIENCE_C, create_access_token, get_password_hash

# 测试密码明文（断言 reveal 返回值用，非真实账号口令）
_PASSWORD = "123456"


def _make_customer_user(session: Session, *, username: str, nickname: str) -> User:
    """创建持 customer 角色的 C 端用户（员工端/经纪人端令牌体系入口）."""
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
def key_share_env(seeded_db: dict[str, Any]) -> Generator[dict[str, Any], None, None]:
    """构造「员工 + 房源 + 有效普通密码组 + 进行中分享」环境与三端客户端.

    - employee_client：员工（customer 主角色 + admin 附加角色），可调 /keys/* 与 /projects/* ；
    - agent_client：经纪人（customer 角色），仅用于公开分享页 reveal；
    - anon_client：免登录客户端（公开页 GET）。
    """
    session: Session = seeded_db["session"]

    staff = _make_customer_user(session, username=f"keys-staff-{uuid.uuid4().hex[:8]}", nickname="钥匙员工")
    agent = _make_customer_user(session, username=f"keys-agent-{uuid.uuid4().hex[:8]}", nickname="经纪人张三")
    admin_role = session.query(Role).filter(Role.code == "admin").one()
    session.add(UserRole(user_id=staff.id, role_id=admin_role.id))
    session.flush()

    project = Project(
        id=uuid.uuid4(),
        name="停用分享测试房源 - 测试路 1 号 101 室",
        community_name="测试小区",
        address="测试路 1 号 101 室",
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

    share = KeyShareService(session).create_share(
        staff,
        KeyShareCreateRequest(items=[KeyShareCreateItem(project_id=project.id, key_id=key.id)], expires_in_days=1),
    )

    previous_overrides = dict(app.dependency_overrides)

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    csrf_headers = {"X-Requested-With": "XMLHttpRequest"}
    employee_client = TestClient(app, cookies={"c_access_token": _c_token(staff)}, headers=csrf_headers)
    agent_client = TestClient(app, cookies={"c_access_token": _c_token(agent)}, headers=csrf_headers)
    anon_client = TestClient(app)
    try:
        yield {
            "session": session,
            "staff": staff,
            "project_id": project.id,
            "key_id": key.id,
            "share_id": share.id,
            "token": share.token,
            "employee_client": employee_client,
            "agent_client": agent_client,
            "anon_client": anon_client,
        }
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)


def _reveal_url(token: str, key_id: uuid.UUID) -> str:
    return f"/api/v1/public/key-shares/{token}/keys/{key_id}/reveal"


class TestKeyShareRevealDisabled:
    """停用密码组后经纪人不得再取回明文."""

    def test_active_key_reveal_still_works(self, key_share_env: dict[str, Any]) -> None:
        """有效组：公开页不标失效，reveal 返回明文（防「一律拦截」的过度修复）."""
        token = key_share_env["token"]
        key_id = key_share_env["key_id"]

        share_resp = key_share_env["anon_client"].get(f"/api/v1/public/key-shares/{token}")
        assert share_resp.status_code == 200, share_resp.text
        assert share_resp.json()["items"][0]["key_deleted"] is False

        reveal_resp = key_share_env["agent_client"].post(_reveal_url(token, key_id))
        assert reveal_resp.status_code == 200, reveal_resp.text
        assert reveal_resp.json()["password"] == _PASSWORD

    def test_disabled_key_reveal_blocked(self, key_share_env: dict[str, Any]) -> None:
        """停用组：公开页标失效 + reveal 422 拒绝 + 不写查看记录 + 员工详情同口径."""
        session: Session = key_share_env["session"]
        token = key_share_env["token"]
        key_id = key_share_env["key_id"]
        share_id = key_share_env["share_id"]

        # 员工停用该组（与员工端/后台同一条写路径）
        KeyService(session).update_normal(
            key_share_env["project_id"],
            key_id,
            key_share_env["staff"],
            NormalKeyUpdateRequest(status="disabled"),
        )

        views_before = session.query(KeyShareView).filter(KeyShareView.share_id == share_id).count()
        reveal_resp = key_share_env["agent_client"].post(_reveal_url(token, key_id))
        assert reveal_resp.status_code == 422, reveal_resp.text
        body = reveal_resp.json()
        assert "密码已失效" in body["message"], body
        assert "password" not in body
        views_after = session.query(KeyShareView).filter(KeyShareView.share_id == share_id).count()
        assert views_after == views_before, "被拒的 reveal 不应写入查看记录"

        share_resp = key_share_env["anon_client"].get(f"/api/v1/public/key-shares/{token}")
        assert share_resp.status_code == 200, share_resp.text
        assert share_resp.json()["items"][0]["key_deleted"] is True

        detail_resp = key_share_env["employee_client"].get(f"/api/v1/keys/shares/{share_id}")
        assert detail_resp.status_code == 200, detail_resp.text
        assert detail_resp.json()["items"][0]["key_deleted"] is True

    def test_expired_share_blocked_then_extend_restores(self, key_share_env: dict[str, Any]) -> None:
        """过期组：is_expired=True + reveal 拒绝且不写记录；延长有效期后恢复可取回."""
        session: Session = key_share_env["session"]
        token = key_share_env["token"]
        key_id = key_share_env["key_id"]
        share_id = key_share_env["share_id"]

        # 直接令分享过期（单条已存在分享，避免为了测试放宽 create 的未来时间校验）
        share = session.get(KeyShare, share_id)
        assert share is not None
        share.expires_at = utc_now() - timedelta(minutes=5)
        session.commit()

        share_resp = key_share_env["anon_client"].get(f"/api/v1/public/key-shares/{token}")
        assert share_resp.status_code == 200, share_resp.text
        expired_body = share_resp.json()
        assert expired_body["status"] == "active"
        assert expired_body["is_expired"] is True

        views_before = session.query(KeyShareView).filter(KeyShareView.share_id == share_id).count()
        reveal_resp = key_share_env["agent_client"].post(_reveal_url(token, key_id))
        assert reveal_resp.status_code == 422, reveal_resp.text
        body = reveal_resp.json()
        assert "过期" in body["message"], body
        assert "不可查看" in body["message"], body
        assert "password" not in body
        views_after = session.query(KeyShareView).filter(KeyShareView.share_id == share_id).count()
        assert views_after == views_before, "过期被拒的 reveal 不应写入查看记录"

        # 员工延长有效期 → 恢复可取回（证明拦截取自实时派生态而非一次性标记）
        extend_resp = key_share_env["employee_client"].post(
            f"/api/v1/keys/shares/{share_id}/extend", json={"expires_in_days": 1}
        )
        assert extend_resp.status_code == 200, extend_resp.text

        refreshed = key_share_env["anon_client"].get(f"/api/v1/public/key-shares/{token}")
        assert refreshed.status_code == 200, refreshed.text
        assert refreshed.json()["is_expired"] is False

        reveal_after = key_share_env["agent_client"].post(_reveal_url(token, key_id))
        assert reveal_after.status_code == 200, reveal_after.text
        assert reveal_after.json()["password"] == _PASSWORD
