"""DELETE /api/v1/files/upload 孤儿文件清理端点测试.

回归需求：软装明细附件改为「上传即落盘」后，上传成功但取消/未保存会产生孤儿文件。
删除端点供前端清理，但必须防误删：
1. 未认证 → 401
2. 外部域名 URL → 400（无法反解存储键，不可能是本系统上传的孤儿）
3. URL 仍被项目附件库（signing_materials）引用 → 422 拒绝删除
4. 正常孤儿 URL → 200 + 物理文件删除
5. 文件不存在（幂等）→ 200
"""

import uuid
from collections.abc import Generator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from models import Project, ProjectContract
from models.common import ProjectStatus
from utils import storage as storage_module
from utils.auth import AUDIENCE_ADMIN, create_access_token


@pytest.fixture(autouse=True)
def _local_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[None, None]:
    """强制 local 存储 + 临时 upload_dir（.env 默认 OSS，需要真实凭据）."""
    storage_module._storage_backend = None
    monkeypatch.setattr(storage_module.settings, "storage_backend", "local")
    monkeypatch.setattr(storage_module.settings, "upload_dir", str(tmp_path))
    yield
    storage_module._storage_backend = None


def _make_client(seeded_db: dict[str, Any], *, authenticated: bool) -> TestClient:
    """构造后台 TestClient（覆盖 get_db；Cookie 认证须携带 CSRF 头）."""
    from main import app

    if authenticated:
        admin_user = seeded_db["users"]["admin"]
        token = create_access_token(
            data={"sub": admin_user.id, "role": "admin", "ver": admin_user.token_version},
            audience=AUDIENCE_ADMIN,
        )
        client = TestClient(
            app,
            cookies={"access_token": token},
            headers={"X-Requested-With": "XMLHttpRequest"},
        )
    else:
        client = TestClient(app, headers={"X-Requested-With": "XMLHttpRequest"})

    session: Session = seeded_db["session"]

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    return client


def _make_contract_referencing(session: Session, url: str) -> None:
    """创建一个附件库（signing_materials）引用给定 URL 的项目."""
    project = Project(
        id=uuid.uuid4(),
        name=f"测试项目-{url[-16:-4]}",
        community_name="测试小区",
        address="测试地址",
        status=ProjectStatus.RENOVATING,
        is_deleted=False,
    )
    session.add(project)
    session.add(
        ProjectContract(
            id=uuid.uuid4(),
            project_id=project.id,
            signing_materials=[{"filename": "共享文件.pdf", "url": url, "category": "other"}],
            contract_status="生效",
            is_deleted=False,
        )
    )
    session.commit()


class TestDeleteUploadedFile:
    """DELETE /api/v1/files/upload 孤儿文件清理."""

    def test_unauthenticated_returns_401(self, seeded_db: dict[str, Any]) -> None:
        client = _make_client(seeded_db, authenticated=False)
        resp = client.delete("/api/v1/files/upload", params={"url": "/static/uploads/a.pdf"})
        assert resp.status_code == 401

    def test_external_url_rejected(self, seeded_db: dict[str, Any]) -> None:
        """外部域名 URL 无法反解为本存储键 → 400 拒绝（防止删任意路径）."""
        client = _make_client(seeded_db, authenticated=True)
        resp = client.delete("/api/v1/files/upload", params={"url": "https://example.com/evil.pdf"})
        assert resp.status_code == 400
        assert resp.json()["code"] != 0

    def test_url_referenced_by_signing_materials_rejected(self, seeded_db: dict[str, Any], tmp_path: Path) -> None:
        """URL 仍被项目附件库引用 → 422 拒绝删除，物理文件保留."""
        session = seeded_db["session"]
        key = "20260921_shared.pdf"
        (tmp_path / key).write_bytes(b"shared")
        url = f"/static/uploads/{key}"
        _make_contract_referencing(session, url)

        client = _make_client(seeded_db, authenticated=True)
        resp = client.delete("/api/v1/files/upload", params={"url": url})

        assert resp.status_code == 422
        assert resp.json()["code"] != 0
        assert (tmp_path / key).exists()

    def test_orphan_url_deletes_file(self, seeded_db: dict[str, Any], tmp_path: Path) -> None:
        """无引用的孤儿 URL → 200 + 物理文件删除."""
        key = "20260921_orphan.pdf"
        (tmp_path / key).write_bytes(b"orphan content")

        client = _make_client(seeded_db, authenticated=True)
        resp = client.delete("/api/v1/files/upload", params={"url": f"/static/uploads/{key}"})

        assert resp.status_code == 200
        assert resp.json() == {"deleted": True}
        assert not (tmp_path / key).exists()

    def test_missing_file_is_idempotent(self, seeded_db: dict[str, Any]) -> None:
        """文件不存在 → 仍返回 200（幂等，重复清理无害）."""
        client = _make_client(seeded_db, authenticated=True)
        resp = client.delete("/api/v1/files/upload", params={"url": "/static/uploads/never_existed.pdf"})
        assert resp.status_code == 200
        assert resp.json() == {"deleted": True}
