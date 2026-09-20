"""RenovationService.update_contract 软装明细附件的物理文件清理测试.

回归需求：admin 装修合同的「软装明细附件」由手填链接改为文件上传后，
「移除 / 替换」附件时必须同时删除存储中的旧文件，避免孤儿文件堆积（方案 A：保存时删除）。

覆盖 9 类分支：
1. 旧 URL → 空串（移除）→ 删旧文件
2. 旧 URL → 新 URL（替换）→ 删旧文件，新文件保留
3. 未传 soft_detail_attachment → 不动文件
4. 传 null → 视为未修改，不删文件
5. 删除失败（storage 抛异常）→ 保存仍成功，字段已更新
6. 无法反解的外部域名 URL → 跳过删除且不报错
7. 旧 URL 仍被项目附件库（signing_materials dict 格式）引用 → 跳过物理删除
8. signing_materials 历史纯 URL 字符串格式同样识别引用 → 跳过物理删除
9. 旧 URL 被**另一项目**附件库引用 → 同样跳过物理删除（跨项目防护）
"""

import uuid
from collections.abc import Generator
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy.orm import Session

from models import Project, ProjectContract, ProjectRenovation
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


def _make_contract(session: Session, *, project_id: uuid.UUID, signing_materials: list | None) -> None:
    """创建并持久化带附件库（signing_materials）的签约合同记录."""
    session.add(
        ProjectContract(
            id=uuid.uuid4(),
            project_id=project_id,
            signing_materials=signing_materials,
            contract_status="生效",
            is_deleted=False,
        )
    )
    session.commit()


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

    def test_shared_attachment_referenced_by_signing_materials_kept(
        self, seeded_db: dict[str, Any], tmp_path: Path
    ) -> None:
        """旧附件 URL 同时存在于项目附件库 → 跳过物理删除（防共享文件被误删）.

        回归：本字段曾是手填链接，运营可能粘贴附件库中已上传文件的 URL；
        替换/移除时直接删物理文件会连带弄坏附件库条目（404）。
        """
        session = seeded_db["session"]
        old_key = "20260920_shared.pdf"
        (tmp_path / old_key).write_bytes(b"shared content")
        project = _make_project(session, project_id="proj-attach-shared")
        _make_contract(
            session,
            project_id=project.id,
            signing_materials=[
                {
                    "filename": "软装明细.pdf",
                    "url": f"/static/uploads/{old_key}",
                    "category": "other",
                    "fileType": "pdf",
                    "size": 14,
                }
            ],
        )
        _make_renovation(session, project_id=project.id, attachment=f"/static/uploads/{old_key}")

        RenovationService(db=session).update_contract(
            project.id,
            RenovationContractUpdate(soft_detail_attachment=""),
        )

        assert _attachment_of(session, project.id) == ""
        # 附件库仍引用该文件 → 物理文件必须保留
        assert (tmp_path / old_key).exists()

    def test_legacy_string_signing_materials_also_blocks_deletion(
        self, seeded_db: dict[str, Any], tmp_path: Path
    ) -> None:
        """signing_materials 为历史纯 URL 字符串格式时同样能识别引用."""
        session = seeded_db["session"]
        old_key = "20260920_legacyref.pdf"
        (tmp_path / old_key).write_bytes(b"legacy ref")
        project = _make_project(session, project_id="proj-attach-legacy-str")
        _make_contract(
            session,
            project_id=project.id,
            signing_materials=[f"/static/uploads/{old_key}", "https://example.com/other.pdf"],
        )
        _make_renovation(session, project_id=project.id, attachment=f"/static/uploads/{old_key}")

        RenovationService(db=session).update_contract(
            project.id,
            RenovationContractUpdate(soft_detail_attachment=""),
        )

        assert _attachment_of(session, project.id) == ""
        assert (tmp_path / old_key).exists()

    def test_cross_project_reference_blocks_deletion(self, seeded_db: dict[str, Any], tmp_path: Path) -> None:
        """旧附件 URL 被另一项目的附件库引用 → 同样跳过物理删除（跨项目防护）.

        场景：运营把 B 项目附件库中文件的 URL 手填进 A 项目的软装明细附件，
        替换/移除时不能删掉 B 项目仍引用的共享文件。
        """
        session = seeded_db["session"]
        old_key = "20260920_crossproj.pdf"
        (tmp_path / old_key).write_bytes(b"cross project")
        project_a = _make_project(session, project_id="proj-attach-a")
        project_b = _make_project(session, project_id="proj-attach-b")
        # 引用只存在于 B 项目的附件库，A 项目无 ProjectContract
        _make_contract(
            session,
            project_id=project_b.id,
            signing_materials=[{"filename": "共享.pdf", "url": f"/static/uploads/{old_key}"}],
        )
        _make_renovation(session, project_id=project_a.id, attachment=f"/static/uploads/{old_key}")

        RenovationService(db=session).update_contract(
            project_a.id,
            RenovationContractUpdate(soft_detail_attachment=""),
        )

        assert _attachment_of(session, project_a.id) == ""
        # B 项目附件库仍引用该文件 → 物理文件必须保留
        assert (tmp_path / old_key).exists()
