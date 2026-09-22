"""装修管理审计日志测试.

覆盖 RenovationService 写操作的审计埋点（resource_type=project_renovation）：
- update_stage（更新改造阶段）→ action=update（before/after 含阶段完成时间）
- update_stage_date（修改/清空阶段完成时间）→ action=update（before/after 含阶段与完成时间）
- add_photo（上传装修照片）→ action=create（after 含照片 URL/kind）
- delete_photo（删除装修照片）→ action=delete（before 含照片信息）
- update_contract（更新装修合同）→ action=update（before/after 含 soft_detail_attachment 变化）
"""

import uuid
from collections.abc import Generator
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy.orm import Session

from models import Project, ProjectRenovation
from models.common import ProjectStatus, RenovationStage
from models.system import OperationLog
from schemas.project.renovation import RenovationContractUpdate, RenovationUpdate
from services.projects.renovation import RenovationService
from utils import storage as storage_module


@pytest.fixture(autouse=True)
def _local_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[None, None, None]:
    """强制 local 存储 + 临时 upload_dir（同 test_renovation_contract_attachment，避免依赖 OSS 凭据）."""
    storage_module._storage_backend = None
    monkeypatch.setattr(storage_module.settings, "storage_backend", "local")
    monkeypatch.setattr(storage_module.settings, "upload_dir", str(tmp_path))
    yield
    storage_module._storage_backend = None


def _make_project(session: Session) -> Project:
    """创建并持久化处于装修中的项目."""
    project = Project(
        id=uuid.uuid4(),
        name="装修审计测试项目",
        community_name="测试小区",
        address="测试地址",
        status=ProjectStatus.RENOVATING,
        is_deleted=False,
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


def _make_renovation(session: Session, *, project_id: uuid.UUID, **kwargs: Any) -> ProjectRenovation:
    """创建并持久化装修记录."""
    renovation = ProjectRenovation(
        id=uuid.uuid4(),
        project_id=project_id,
        is_deleted=False,
        **kwargs,
    )
    session.add(renovation)
    session.commit()
    session.refresh(renovation)
    return renovation


def _renovation_logs(session: Session) -> list[OperationLog]:
    """查询本次测试产生的装修域审计日志（SAVEPOINT 隔离下仅含当前用例数据）."""
    return (
        session.query(OperationLog)
        .filter(OperationLog.resource_type == "project_renovation")
        .order_by(OperationLog.created_at.asc(), OperationLog.id.asc())
        .all()
    )


def test_update_stage_logs_update(db_session: Session) -> None:
    """更新改造阶段落一条 update 审计日志，before/after 含阶段完成时间."""
    project = _make_project(db_session)
    _make_renovation(db_session, project_id=project.id)

    RenovationService(db=db_session).update_stage(
        project.id,
        RenovationUpdate(
            completed_stage=RenovationStage.PLUMBING, stage_completed_at=datetime(2026, 1, 15, tzinfo=timezone.utc)
        ),
        operator_id="renovation-operator-1",
    )

    logs = _renovation_logs(db_session)
    assert len(logs) == 1
    log = logs[0]
    assert log.action == "update"
    assert log.user_id == "renovation-operator-1"
    assert log.resource_type == "project_renovation"
    assert log.before is not None
    assert log.after is not None
    # 变更前无完成记录，变更后记录了「水电」完成时间
    assert log.before["stage_completed_dates"] is None
    assert log.after["stage_completed_dates"] == {"水电": "2026-01-15"}


def test_update_stage_date_logs_update(db_session: Session) -> None:
    """修改阶段完成时间落一条 update 审计日志，before/after 含阶段与完成时间."""
    project = _make_project(db_session)
    _make_renovation(db_session, project_id=project.id)
    service = RenovationService(db=db_session)

    service.update_stage_date(
        project.id,
        RenovationStage.PAINTING,
        datetime(2026, 3, 1, tzinfo=timezone.utc),
        operator_id="renovation-operator-2",
    )

    logs = _renovation_logs(db_session)
    assert len(logs) == 1
    log = logs[0]
    assert log.action == "update"
    assert log.user_id == "renovation-operator-2"
    assert log.resource_type == "project_renovation"
    assert log.before is not None
    assert log.after is not None
    assert log.before["stage"] == "油漆"
    assert log.before["stage_completed_date"] is None
    assert log.after["stage"] == "油漆"
    assert log.after["stage_completed_date"] == "2026-03-01"


def test_add_photo_logs_create(db_session: Session) -> None:
    """上传装修照片落一条 create 审计日志，after 含照片 URL 与媒体种类."""
    project = _make_project(db_session)
    _make_renovation(db_session, project_id=project.id)

    photo = RenovationService(db=db_session).add_photo(
        project.id,
        "水电",
        "/static/uploads/audit-photo.jpg",
        filename="audit-photo.jpg",
        media_type="image",
        operator_id="renovation-operator-3",
    )

    logs = _renovation_logs(db_session)
    assert len(logs) == 1
    log = logs[0]
    assert log.action == "create"
    assert log.user_id == "renovation-operator-3"
    assert log.resource_type == "project_renovation"
    assert log.resource_id == str(photo.id)
    assert log.before is None
    assert log.after is not None
    assert log.after["url"] == "/static/uploads/audit-photo.jpg"
    assert log.after["media_type"] == "image"
    assert log.after["stage"] == "水电"


def test_delete_photo_logs_delete(db_session: Session) -> None:
    """删除装修照片落一条 delete 审计日志，before 含照片信息、after 为空."""
    project = _make_project(db_session)
    _make_renovation(db_session, project_id=project.id)
    service = RenovationService(db=db_session)
    photo = service.add_photo(
        project.id,
        "油漆",
        "/static/uploads/audit-del.jpg",
        filename="audit-del.jpg",
        operator_id="renovation-operator-4",
    )

    service.delete_photo(project.id, str(photo.id), operator_id="renovation-operator-4")

    delete_logs = [log for log in _renovation_logs(db_session) if log.action == "delete"]
    assert len(delete_logs) == 1
    log = delete_logs[0]
    assert log.user_id == "renovation-operator-4"
    assert log.resource_type == "project_renovation"
    assert log.resource_id == str(photo.id)
    assert log.before is not None
    assert log.before["url"] == "/static/uploads/audit-del.jpg"
    assert log.after is None


def test_update_contract_logs_update_with_attachment(db_session: Session) -> None:
    """更新装修合同落一条 update 审计日志，before/after 含 soft_detail_attachment 变化."""
    project = _make_project(db_session)
    _make_renovation(
        db_session,
        project_id=project.id,
        soft_detail_attachment="/static/uploads/old-detail.pdf",
    )

    RenovationService(db=db_session).update_contract(
        project.id,
        RenovationContractUpdate(
            renovation_company="某某装修公司",
            soft_detail_attachment="/static/uploads/new-detail.pdf",
        ),
        operator_id="renovation-operator-5",
    )

    logs = _renovation_logs(db_session)
    assert len(logs) == 1
    log = logs[0]
    assert log.action == "update"
    assert log.user_id == "renovation-operator-5"
    assert log.resource_type == "project_renovation"
    assert log.before is not None
    assert log.after is not None
    assert log.before["soft_detail_attachment"] == "/static/uploads/old-detail.pdf"
    assert log.after["soft_detail_attachment"] == "/static/uploads/new-detail.pdf"
    assert log.before["renovation_company"] is None
    assert log.after["renovation_company"] == "某某装修公司"


def test_update_contract_snapshot_json_safe_for_decimal_and_datetime(db_session: Session) -> None:
    """合同快照中的 Decimal/datetime 字段被序列化为字符串，审计日志写入成功."""
    project = _make_project(db_session)
    _make_renovation(
        db_session,
        project_id=project.id,
        hard_contract_amount=Decimal("100000.00"),
        contract_start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )

    renovation = RenovationService(db=db_session).update_contract(
        project.id,
        RenovationContractUpdate(hard_contract_amount=Decimal("200000.00")),
        operator_id="renovation-operator-6",
    )
    assert renovation is not None

    logs = _renovation_logs(db_session)
    assert len(logs) == 1
    entry = logs[0]
    assert entry.before is not None
    assert entry.after is not None
    # Decimal 经 _snapshot_value 转为字符串，JSON 列可正常序列化
    assert isinstance(entry.before["hard_contract_amount"], str)
    assert entry.after["hard_contract_amount"] == "200000.00"
    assert isinstance(entry.before["contract_start_date"], str)
