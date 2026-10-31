"""商户管理 V01 平台基座测试（权限种子 / 字典注册与删除 / 审计脱敏）."""

import uuid
from collections.abc import Generator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from migrations._seeds import _ROLE_PERMISSIONS_SEED
from models import OperationLog, Role, User
from services.merchant.audit import mask_phone, mask_snapshot
from services.system.biz_dict import MERCHANT_DICT_CODES, SUPPORTED_DICTS
from services.system.permission import permission_service
from utils.auth import AUDIENCE_ADMIN, create_access_token, get_password_hash

MERCHANT_PERMISSION_CODES = {
    "merchant:read",
    "merchant:write",
    "merchant:visit",
    "merchant:broker",
    "merchant:agreement",
    "merchant:map",
}


def _operator_client(seeded_db: dict[str, Any]) -> TestClient:
    """构造 operator 角色的已认证客户端（CSRF 头必需）."""
    from main import app

    session: Session = seeded_db["session"]
    operator_role = session.query(Role).filter(Role.code == "operator").one()
    operator = User(
        id=str(uuid.uuid4()),
        username=f"merchant-operator-{uuid.uuid4().hex[:8]}",
        password=get_password_hash(f"pw-{uuid.uuid4().hex}"),
        nickname="运营",
        role_id=operator_role.id,
        status="active",
    )
    session.add(operator)
    session.commit()

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    token = create_access_token(
        data={"sub": operator.id, "role": "operator", "ver": operator.token_version},
        audience=AUDIENCE_ADMIN,
    )
    return TestClient(
        app,
        cookies={"access_token": token},
        headers={"X-Requested-With": "XMLHttpRequest"},
    )


def test_merchant_permissions_seeded_for_builtin_roles(seeded_db: dict[str, Any]) -> None:
    """6 个商户权限点存在，admin/operator 全量、user 四项."""
    session: Session = seeded_db["session"]
    admin = seeded_db["users"]["admin"]
    normal = seeded_db["users"]["normal"]

    admin_perms = permission_service.get_user_permission_codes(session, admin)
    user_perms = permission_service.get_user_permission_codes(session, normal)

    assert admin_perms >= MERCHANT_PERMISSION_CODES
    assert set(_ROLE_PERMISSIONS_SEED["operator"]) >= MERCHANT_PERMISSION_CODES
    assert user_perms & MERCHANT_PERMISSION_CODES == {
        "merchant:read",
        "merchant:write",
        "merchant:visit",
        "merchant:agreement",
    }


def test_frontend_permission_codes_mirror_backend() -> None:
    """前后端 6 个商户权限编码一致（REQ-M12-001 分支 2）."""
    frontend_file = Path(__file__).resolve().parents[2] / "frontend/src/lib/auth/permissions.ts"
    source = frontend_file.read_text(encoding="utf-8")
    for code in MERCHANT_PERMISSION_CODES:
        assert f'"{code}"' in source, f"前端缺少权限编码 {code}"


def test_merchant_nav_group_registered() -> None:
    """后台导航包含「商户管理」分组及其子菜单（BR-M12-011）."""
    frontend_file = Path(__file__).resolve().parents[2] / "frontend/src/lib/admin-nav-data.ts"
    source = frontend_file.read_text(encoding="utf-8")
    assert "商户管理" in source
    for url in (
        "/admin/merchant/stores",
        "/admin/merchant/map",
        "/admin/merchant/tracks",
        "/admin/merchant/brokers",
        "/admin/merchant/agreements",
        "/admin/merchant/agreement-templates",
    ):
        assert url in source, f"导航缺少 {url}"


def test_merchant_dict_groups_registered() -> None:
    """四个商户字典组在白名单内，且 seed 外部组不可访问."""
    assert set(SUPPORTED_DICTS) >= MERCHANT_DICT_CODES
    assert set(MERCHANT_DICT_CODES) == {
        "merchant_cooperation_status",
        "merchant_store_type",
        "merchant_visit_result",
        "merchant_agreement_status",
    }


def test_normal_user_forbidden_from_dict_admin(normal_user_client: TestClient) -> None:
    """普通 user 即便有 merchant:write 也不得进入字典管理（M13 仅 admin/operator）."""
    resp = normal_user_client.get("/api/v1/admin/dicts")
    assert resp.status_code == 403, resp.text


def test_operator_sees_only_merchant_dict_groups(seeded_db: dict[str, Any]) -> None:
    """Operator 仅看到 4 个商户域字典组，访问平台字典组被拒."""
    client = _operator_client(seeded_db)
    resp = client.get("/api/v1/admin/dicts")
    assert resp.status_code == 200, resp.text
    codes = {group["dict_code"] for group in resp.json()}
    assert codes == MERCHANT_DICT_CODES

    denied = client.get("/api/v1/admin/dicts/document_template/items")
    assert denied.status_code == 403, denied.text


def test_merchant_dict_crud_and_audit(backend_client: TestClient, seeded_db: dict[str, Any]) -> None:
    """新增/修改/删除商户字典项，审计写入 merchant_dict 且动作正确."""
    session: Session = seeded_db["session"]
    code = f"audit_{uuid.uuid4().hex[:8]}"
    create_resp = backend_client.post(
        "/api/v1/admin/dicts/merchant_cooperation_status/items",
        json={"code": code, "label": "审计测试", "sort_order": 999},
    )
    assert create_resp.status_code == 201, create_resp.text
    item = create_resp.json()

    update_resp = backend_client.put(
        f"/api/v1/admin/dicts/merchant_cooperation_status/items/{item['id']}",
        json={"label": "审计测试-改", "enabled": False},
    )
    assert update_resp.status_code == 200, update_resp.text

    delete_resp = backend_client.delete(
        f"/api/v1/admin/dicts/merchant_cooperation_status/items/{item['id']}",
    )
    assert delete_resp.status_code == 200, delete_resp.text
    assert delete_resp.json() == {"deleted": True, "reference_count": 0}

    logs = (
        session.query(OperationLog)
        .filter(
            OperationLog.resource_type == "merchant_dict",
            OperationLog.resource_id == item["id"],
        )
        .order_by(OperationLog.created_at.asc())
        .all()
    )
    actions = [log.action for log in logs]
    assert actions == ["create", "disable", "delete"]
    assert logs[0].before is None
    assert logs[0].after["code"] == code
    assert logs[1].before["enabled"] is True
    assert logs[1].after["enabled"] is False
    assert logs[-1].after is None


def test_merchant_dict_code_immutable(backend_client: TestClient) -> None:
    """Code 创建后不可修改：请求体中的 code 字段不会改变落库编码."""
    create_resp = backend_client.post(
        "/api/v1/admin/dicts/merchant_visit_result/items",
        json={"code": f"immutable_{uuid.uuid4().hex[:8]}", "label": "编码不可改"},
    )
    assert create_resp.status_code == 201, create_resp.text
    item = create_resp.json()

    update_resp = backend_client.put(
        f"/api/v1/admin/dicts/merchant_visit_result/items/{item['id']}",
        json={"code": "changed", "label": "只改展示名"},
    )
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()["code"] == item["code"]


def test_audit_mask_phone_and_snapshot() -> None:
    """手机号中间四位掩码，非 11 位统一 ****."""
    assert mask_phone("13800001111") == "138****1111"
    assert mask_phone("12345") == "****"
    assert mask_phone(None) is None
    assert mask_snapshot({"contact_phone": "13800001111", "phone_hash": "abc"}) == {
        "contact_phone": "138****1111",
        "phone_hash": "abc",
    }


pytestmark = pytest.mark.usefixtures("seeded_db")
