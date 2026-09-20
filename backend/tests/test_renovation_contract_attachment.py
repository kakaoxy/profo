"""RenovationService.update_contract 软装明细附件的物理文件清理测试.

回归需求：admin 装修合同的「软装明细附件」由手填链接改为文件上传后，
「移除 / 替换」附件时必须同时删除存储中的旧文件，避免孤儿文件堆积（方案 A：保存时删除）。

覆盖 6 类分支：
1. 旧 URL → 空串（移除）→ 删旧文件
2. 旧 URL → 新 URL（替换）→ 删旧文件，新文件保留
3. 未传 soft_detail_attachment → 不动文件
4. 传 null → 视为未修改，不删文件
5. 删除失败（storage 抛异常）→ 保存仍成功，字段已更新
6. 无法反解的外部域名 URL → 跳过删除且不报错
"""

import uuid
from collections.abc import Generator
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy.orm import Session

from models import Project, ProjectRenovation
from models.common import ProjectStatus
from schemas.project.renovation import RenovationContractUpdate
from services.projects.renovation import RenovationService
from utils import storage as storage_module


@pytest.fixture(autouse=True)
def _local_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[None, None, None]:
    """强制 local 存储 + 临时 upload_dir.

    .env 默认 STORAGE_BACKEND=oss，不覆盖会去实例化 OSSStorage（需要真实凭据）；
    测试结束需重置单例，避免泄漏到后续测试。
    """
    storage_module._storage_backend = None
    monkeypatch.setattr(storage_module.settings, "storage_backend", "local")
    monkeypatch.setattr(storage_module.settings, "upload_dir", str(tmp_path))
    yield
    storage_module._storage_backend = None


def _make_project(session: Session, *, project_id: str) -> Project:
    """创建并持久化处于装修中的项目."""
    project = Project(
        id=uuid.uuid4(),
        name=f"测试项目-{project_id}",
        community_name="测试小区",
        address="测试地址",
        status=ProjectStatus.RENOVATING,
        is_deleted=False,
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


def _make_renovation(session: Session, *, project_id: uuid.UUID, attachment: str | None) -> ProjectRenovation:
    """创建并持久化带软装明细附件的装修记录."""
    renovation = ProjectRenovation(
        id=uuid.uuid4(),
        project_id=project_id,
        soft_detail_attachment=attachment,
        is_deleted=False,
    )
    session.add(renovation)
    session.commit()
    session.refresh(renovation)
    return renovation


def _attachment_of(session: Session, project_id: uuid.UUID) -> str | None:
    """读取当前落库的软装明细附件."""
    row = session.query(ProjectRenovation).filter(ProjectRenovation.project_id == project_id).first()
    return row.soft_detail_attachment if row else None


class TestUpdateContractAttachmentCleanup:
    """update_contract 在附件被移除/替换时删除旧物理文件."""

    def test_clear_attachment_deletes_old_file(self, seeded_db: dict[str, Any], tmp_path: Path) -> None:
        """附件由旧 URL 变为空串（移除）→ 删除旧文件."""
        session = seeded_db["session"]
        old_key = "20260920_oldattach.pdf"
        (tmp_path / old_key).write_bytes(b"old content")
        project = _make_project(session, project_id="proj-attach-clear")
        _make_renovation(session, project_id=project.id, attachment=f"/static/uploads/{old_key}")

        RenovationService(db=session).update_contract(
            project.id,
            RenovationContractUpdate(soft_detail_attachment=""),
        )

        assert _attachment_of(session, project.id) == ""
        assert not (tmp_path / old_key).exists()

    def test_replace_attachment_deletes_old_file(self, seeded_db: dict[str, Any], tmp_path: Path) -> None:
        """附件由旧 URL 变为新 URL（替换）→ 删旧文件、保留新文件."""
        session = seeded_db["session"]
        old_key = "20260920_oldattach.pdf"
        new_key = "20260920_newattach.xlsx"
        (tmp_path / old_key).write_bytes(b"old content")
        (tmp_path / new_key).write_bytes(b"new content")
        project = _make_project(session, project_id="proj-attach-replace")
        _make_renovation(session, project_id=project.id, attachment=f"/static/uploads/{old_key}")

        RenovationService(db=session).update_contract(
            project.id,
            RenovationContractUpdate(soft_detail_attachment=f"/static/uploads/{new_key}"),
        )

        assert _attachment_of(session, project.id) == f"/static/uploads/{new_key}"
        assert not (tmp_path / old_key).exists()
        assert (tmp_path / new_key).exists()

    def test_omitted_field_keeps_old_file(self, seeded_db: dict[str, Any], tmp_path: Path) -> None:
        """未传 soft_detail_attachment → 字段与文件都不变."""
        session = seeded_db["session"]
        old_key = "20260920_oldattach.pdf"
        (tmp_path / old_key).write_bytes(b"old content")
        project = _make_project(session, project_id="proj-attach-omitted")
        _make_renovation(session, project_id=project.id, attachment=f"/static/uploads/{old_key}")

        RenovationService(db=session).update_contract(
            project.id,
            RenovationContractUpdate(hard_contract_amount=Decimal(100000)),
        )

        assert _attachment_of(session, project.id) == f"/static/uploads/{old_key}"
        assert (tmp_path / old_key).exists()

    def test_null_attachment_keeps_old_file(self, seeded_db: dict[str, Any], tmp_path: Path) -> None:
        """显式传 null → 被 value is not None 过滤跳过，视为未修改."""
        session = seeded_db["session"]
        old_key = "20260920_oldattach.pdf"
        (tmp_path / old_key).write_bytes(b"old content")
        project = _make_project(session, project_id="proj-attach-null")
        _make_renovation(session, project_id=project.id, attachment=f"/static/uploads/{old_key}")

        RenovationService(db=session).update_contract(
            project.id,
            RenovationContractUpdate(soft_detail_attachment=None),
        )

        assert _attachment_of(session, project.id) == f"/static/uploads/{old_key}"
        assert (tmp_path / old_key).exists()

    def test_delete_failure_does_not_break_save(
        self,
        seeded_db: dict[str, Any],
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """存储删除抛异常 → 保存仍成功，字段已更新（best-effort 清理）."""
        session = seeded_db["session"]
        old_key = "20260920_oldattach.pdf"
        (tmp_path / old_key).write_bytes(b"old content")
        project = _make_project(session, project_id="proj-attach-delete-fail")
        _make_renovation(session, project_id=project.id, attachment=f"/static/uploads/{old_key}")

        def _raise(key: str) -> bool:
            msg = "OSS 删除失败"
            raise OSError(msg)

        failing_storage = type("_S", (), {"delete_file": staticmethod(_raise)})()
        monkeypatch.setattr(
            "services.projects.renovation.get_storage_backend",
            lambda: failing_storage,
        )

        RenovationService(db=session).update_contract(
            project.id,
            RenovationContractUpdate(soft_detail_attachment=""),
        )

        assert _attachment_of(session, project.id) == ""
        assert (tmp_path / old_key).exists()

    def test_unresolvable_url_skips_deletion(self, seeded_db: dict[str, Any]) -> None:
        """附件为外部域名 URL → 无法反解存储键，跳过删除且不报错."""
        session = seeded_db["session"]
        project = _make_project(session, project_id="proj-attach-external")
        _make_renovation(session, project_id=project.id, attachment="https://example.com/old.pdf")

        RenovationService(db=session).update_contract(
            project.id,
            RenovationContractUpdate(soft_detail_attachment=""),
        )

        assert _attachment_of(session, project.id) == ""
