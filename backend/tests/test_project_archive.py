"""项目归档状态测试（SPEC-project-archive）.

先列失败路径再写码（AGENTS.md 测试策略）：本文件同时锁定：
1. 仅 sold / ended 可归档，其余状态 400；
2. 归档后全部写路径 400（PUT 更新 / 状态流转 / 文书 / 装修 / 销售 / 删除）且 DB 无变更；
3. 反归档恢复可写，归档字段清空；
4. 必填字段缺失 422；
5. 重复归档 / 未归档反归档 400；
6. 列表归档筛选三态；
7. sold 项目归档前合同字段 / 业主列表 / 签约材料可正常写入（白名单已移除）；
8. 归档/反归档审计日志与主变更同事务写入，日志写入失败整体回滚并显式报错。
"""

import uuid
from collections.abc import Generator
from datetime import date, datetime, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from db import get_db
from main import app
from models import Project
from models.common import BusinessForm, ProjectStatus
from models.property.community import Community
from models.system import OperationLog
from schemas.building_dict import DictionaryLinkRequest
from schemas.project import ProjectStatusUpdate, ProjectUpdate
from schemas.project.archive import ProjectArchiveRequest, ProjectUnarchiveRequest
from schemas.project.document import DocumentCreate
from schemas.project.renovation import RenovationUpdate
from schemas.project.sales import SalesRecordCreate, SalesRolesUpdate
from services.projects.archive import ProjectArchiveService, assert_project_not_archived
from services.projects.facade import ProjectService
from services.projects.internal import documents as documents_service
from services.property.dictionary_link_service import get_dictionary_link_service
from services.system.exceptions import ValidationError
from utils.auth import AUDIENCE_ADMIN, create_access_token

BASE = "/api/v1/projects"


@pytest.fixture
def authed_client(seeded_db: dict[str, Any]) -> Generator[TestClient, None, None]:
    """已认证管理员客户端（携带 AUDIENCE_ADMIN 与 CSRF 头，可通过后台鉴权）."""
    session = seeded_db["session"]
    admin_user = seeded_db["users"]["admin"]
    token = create_access_token(
        data={"sub": admin_user.id, "role": "admin", "ver": admin_user.token_version},
        audience=AUDIENCE_ADMIN,
    )

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[get_db] = _override_get_db
    client = TestClient(app, cookies={"access_token": token})
    client.headers["X-Requested-With"] = "XMLHttpRequest"
    yield client
    app.dependency_overrides.clear()


def _create_project(db: Session, *, status: ProjectStatus, name: str | None = None) -> Project:
    """创建指定状态的测试项目（附带业务形式，便于文书同步路径可用）."""
    suffix = uuid.uuid4().hex[:8]
    project = Project(
        id=uuid.uuid4(),
        name=name or f"归档测试小区-{suffix}",
        community_name=f"归档测试小区-{suffix}",
        address=f"归档测试地址-{suffix}",
        status=status,
        business_form=BusinessForm.AGENT,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def _reload(db: Session, project: Project) -> Project:
    db.refresh(project)
    return project


# --------------------------------------------------------------------------- #
# 1. 归档前置条件
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("status", [ProjectStatus.SIGNING, ProjectStatus.RENOVATING, ProjectStatus.SELLING])
def test_archive_rejects_non_sold_or_ended(db_session: Session, status: ProjectStatus) -> None:
    """signing/renovating/selling 归档必须 400（仅 sold/ended 可归档）."""
    project = _create_project(db_session, status=status)
    service = ProjectArchiveService(db_session)

    with pytest.raises(ValidationError) as exc:
        service.archive_project(project.id, ProjectArchiveRequest(archived_at=date(2026, 11, 25)))
    assert "仅已售或已下架项目可归档" in str(exc.value)

    assert _reload(db_session, project).is_archived is False


@pytest.mark.parametrize("status", [ProjectStatus.SOLD, ProjectStatus.ENDED])
def test_archive_accepts_sold_and_ended(db_session: Session, status: ProjectStatus) -> None:
    """sold/ended 可归档，归档日期与说明落库."""
    project = _create_project(db_session, status=status)
    service = ProjectArchiveService(db_session)

    resp = service.archive_project(
        project.id,
        ProjectArchiveRequest(archived_at=date(2026, 11, 25), archived_note="补录签约材料"),
    )

    assert resp.is_archived is True
    assert resp.archived_at == date(2026, 11, 25)
    assert resp.archived_note == "补录签约材料"

    db_session.refresh(project)
    assert project.is_archived is True
    assert project.archived_at == date(2026, 11, 25)
    assert project.archived_note == "补录签约材料"


def test_archive_twice_rejected(db_session: Session) -> None:
    """已归档项目重复归档 → 400."""
    project = _create_project(db_session, status=ProjectStatus.SOLD)
    service = ProjectArchiveService(db_session)
    service.archive_project(project.id, ProjectArchiveRequest(archived_at=date(2026, 11, 25)))

    with pytest.raises(ValidationError) as exc:
        service.archive_project(project.id, ProjectArchiveRequest(archived_at=date(2026, 11, 26)))
    assert "项目已归档，无需重复归档" in str(exc.value)


def test_unarchive_unarchived_project_rejected(db_session: Session) -> None:
    """未归档项目反归档 → 400."""
    project = _create_project(db_session, status=ProjectStatus.SOLD)
    service = ProjectArchiveService(db_session)

    with pytest.raises(ValidationError) as exc:
        service.unarchive_project(project.id, ProjectUnarchiveRequest(reason="误操作"))
    assert "项目未归档，无需反归档" in str(exc.value)


def test_archive_missing_project_404(db_session: Session) -> None:
    """项目不存在 → 404."""
    from services.system.exceptions import ResourceNotFoundError

    service = ProjectArchiveService(db_session)
    with pytest.raises(ResourceNotFoundError):
        service.archive_project(uuid.uuid4(), ProjectArchiveRequest(archived_at=date(2026, 11, 25)))


# --------------------------------------------------------------------------- #
# 2. 归档写锁矩阵（DB 无变更）
# --------------------------------------------------------------------------- #
def test_archived_project_rejects_update(db_session: Session) -> None:
    """归档后 PUT 全量更新 400，且数据不发生变更."""
    project = _create_project(db_session, status=ProjectStatus.SOLD)
    service = ProjectService(db_session)
    service.archive_project(project.id, ProjectArchiveRequest(archived_at=date(2026, 11, 25)))

    with pytest.raises(ValidationError) as exc:
        service.update_project(project.id, ProjectUpdate(address="不应写入的地址"))
    assert "项目已归档，请先反归档后再操作" in str(exc.value)

    db_session.refresh(project)
    assert project.address != "不应写入的地址"


def test_update_rejects_stale_read_after_concurrent_archive(db_session: Session) -> None:
    """TOCTOU：并发事务已提交归档、本会话 identity map 仍为未归档时，PUT 必须 400.

    回归背景：``ProjectUpdater.update`` 旧实现只对入参 ``project.is_archived`` 做判断，
    而 SQLAlchemy identity map 不会自动刷新——先读到项目、后被并发归档的请求仍
    能通过校验并写入（实测可改 address），与 SPEC-project-archive G2「归档后全量
    锁定写操作」冲突。现在写入前 ``refresh(project, ["is_archived"])`` 重读最新值。
    """
    project = _create_project(db_session, status=ProjectStatus.SOLD)
    assert project.is_archived is False

    # 用原生 SQL 提交归档后不 commit：DB 已看到 true，identity map 仍保留 False，
    # 精确复刻「另一事务已提交归档、本事务对象陈旧」的窗口
    db_session.execute(
        text("UPDATE projects SET is_archived = true WHERE id = :pid"),
        {"pid": project.id},
    )
    assert project.is_archived is False, "identity map 应保持陈旧值以复刻竞态"

    with pytest.raises(ValidationError) as exc:
        ProjectService(db_session).update_project(
            project.id,
            ProjectUpdate(address="并发归档后的写入"),
        )
    assert "项目已归档" in str(exc.value)

    written = db_session.execute(
        text("SELECT address FROM projects WHERE id = :pid"),
        {"pid": project.id},
    ).scalar()
    assert written != "并发归档后的写入"


def test_archived_project_rejects_status_transition(db_session: Session) -> None:
    """归档后状态流转 400，状态保持不变."""
    project = _create_project(db_session, status=ProjectStatus.SOLD)
    service = ProjectService(db_session)
    service.archive_project(project.id, ProjectArchiveRequest(archived_at=date(2026, 11, 25)))

    with pytest.raises(ValidationError):
        service.update_status(project.id, ProjectStatusUpdate(status=ProjectStatus.DELETED))

    db_session.refresh(project)
    assert project.status == ProjectStatus.SOLD


def test_archived_project_rejects_documents_write(db_session: Session) -> None:
    """归档后文书增删改/初始化 400."""
    project = _create_project(db_session, status=ProjectStatus.SOLD)
    service = ProjectService(db_session)
    service.archive_project(project.id, ProjectArchiveRequest(archived_at=date(2026, 11, 25)))

    with pytest.raises(ValidationError):
        documents_service.create_document(db_session, project.id, DocumentCreate(document_name="不应新增"))
    with pytest.raises(ValidationError):
        documents_service.update_document(db_session, project.id, str(uuid.uuid4()), payload=None)  # type: ignore[arg-type]
    with pytest.raises(ValidationError):
        documents_service.delete_document(db_session, project.id, str(uuid.uuid4()))
    with pytest.raises(ValidationError):
        documents_service.initialize_documents(db_session, project.id, BusinessForm.AGENT)

    count = db_session.execute(
        text("SELECT count(*) FROM project_documents WHERE project_id = :pid"),
        {"pid": project.id},
    ).scalar()
    assert count == 0


def test_archived_project_rejects_renovation_write(db_session: Session, seeded_db: dict[str, Any]) -> None:
    """归档后装修进度/照片/装修合同写入 400."""
    project = _create_project(db_session, status=ProjectStatus.SOLD)
    service = ProjectService(db_session)
    service.archive_project(project.id, ProjectArchiveRequest(archived_at=date(2026, 11, 25)))
    admin_user = seeded_db["users"]["admin"]

    with pytest.raises(ValidationError):
        service.update_renovation_stage(
            project.id,
            RenovationUpdate(renovation_stage="水电"),
            current_user=admin_user,
        )
    with pytest.raises(ValidationError):
        service.add_renovation_photo(project.id, "拆除", "http://example.com/a.jpg")
    with pytest.raises(ValidationError):
        service.delete_renovation_photo(project.id, str(uuid.uuid4()))


def test_archived_project_rejects_sales_write(db_session: Session, seeded_db: dict[str, Any]) -> None:
    """归档后销售角色/带看记录写入 400."""
    project = _create_project(db_session, status=ProjectStatus.SOLD)
    service = ProjectService(db_session)
    service.archive_project(project.id, ProjectArchiveRequest(archived_at=date(2026, 11, 25)))
    admin_user = seeded_db["users"]["admin"]

    with pytest.raises(ValidationError):
        service.update_sales_roles(project.id, SalesRolesUpdate(negotiator_id=None), current_user=admin_user)
    with pytest.raises(ValidationError):
        service.create_sales_record(
            project.id,
            SalesRecordCreate(
                record_type="viewing",
                customer_name="客户",
                record_date=datetime.now(timezone.utc),
            ),
            current_user=admin_user,
        )
    with pytest.raises(ValidationError):
        service.delete_sales_record(project.id, str(uuid.uuid4()))


def test_archived_project_rejects_delete(db_session: Session) -> None:
    """归档后删除项目 400（需先反归档），项目未软删除."""
    project = _create_project(db_session, status=ProjectStatus.SOLD)
    service = ProjectService(db_session)
    service.archive_project(project.id, ProjectArchiveRequest(archived_at=date(2026, 11, 25)))

    with pytest.raises(ValidationError) as exc:
        service.delete_project(project.id)
    assert "已归档项目不可删除" in str(exc.value)

    db_session.refresh(project)
    assert project.is_deleted is False
    assert project.status == ProjectStatus.SOLD


# --------------------------------------------------------------------------- #
# 3. 反归档恢复可写
# --------------------------------------------------------------------------- #
def test_unarchive_restores_writes_and_clears_fields(db_session: Session) -> None:
    """反归档后恢复可写，archived_at / archived_note 清空."""
    project = _create_project(db_session, status=ProjectStatus.SOLD)
    service = ProjectService(db_session)
    service.archive_project(
        project.id,
        ProjectArchiveRequest(archived_at=date(2026, 11, 25), archived_note="归档说明"),
    )

    resp = service.unarchive_project(project.id, ProjectUnarchiveRequest(reason="需补录附件"))
    assert resp.is_archived is False
    assert resp.archived_at is None
    assert resp.archived_note is None

    resp = service.update_project(project.id, ProjectUpdate(address="反归档后新地址"))
    assert resp.address == "反归档后新地址"
    assert _reload(db_session, project).is_archived is False


# --------------------------------------------------------------------------- #
# 4. HTTP 层：必填校验（422）与写锁（400）
# --------------------------------------------------------------------------- #
def test_http_archive_requires_date(authed_client: TestClient, db_session: Session) -> None:
    """归档必填日期缺失 → 422."""
    project = _create_project(db_session, status=ProjectStatus.SOLD)
    res = authed_client.post(f"{BASE}/{project.id}/archive", json={"archived_note": "无日期"})
    assert res.status_code == 422


def test_http_unarchive_requires_reason(authed_client: TestClient, db_session: Session) -> None:
    """反归档原因缺失 / 空串 → 422."""
    project = _create_project(db_session, status=ProjectStatus.SOLD)
    ProjectArchiveService(db_session).archive_project(
        project.id,
        ProjectArchiveRequest(archived_at=date(2026, 11, 25)),
    )

    assert authed_client.post(f"{BASE}/{project.id}/unarchive", json={}).status_code == 422
    assert authed_client.post(f"{BASE}/{project.id}/unarchive", json={"reason": ""}).status_code == 422


def test_http_archive_then_update_rejected(authed_client: TestClient, db_session: Session) -> None:
    """HTTP：归档成功 200 → PUT 更新 400 且 message 含「已归档」."""
    project = _create_project(db_session, status=ProjectStatus.SOLD)

    res = authed_client.post(
        f"{BASE}/{project.id}/archive",
        json={"archived_at": "2026-11-25", "archived_note": "补录完成"},
    )
    assert res.status_code == 200
    assert res.json()["is_archived"] is True

    put_res = authed_client.put(f"{BASE}/{project.id}", json={"address": "不应写入"})
    assert put_res.status_code == 400
    assert "已归档" in put_res.json()["message"]


def test_http_archive_non_sold_rejected(authed_client: TestClient, db_session: Session) -> None:
    """HTTP：非 sold/ended 归档 → 400."""
    project = _create_project(db_session, status=ProjectStatus.SELLING)
    res = authed_client.post(f"{BASE}/{project.id}/archive", json={"archived_at": "2026-11-25"})
    assert res.status_code == 400


# --------------------------------------------------------------------------- #
# 5. 列表归档筛选三态
# --------------------------------------------------------------------------- #
def test_list_filter_is_archived_three_states(db_session: Session) -> None:
    """is_archived=true/false/None 三态筛选正确."""
    archive_service = ProjectArchiveService(db_session)
    archived = _create_project(db_session, status=ProjectStatus.SOLD)
    archive_service.archive_project(archived.id, ProjectArchiveRequest(archived_at=date(2026, 11, 25)))
    active = _create_project(db_session, status=ProjectStatus.SOLD)

    service = ProjectService(db_session)

    def ids(is_archived: bool | None) -> set[str]:
        result = service.get_projects(is_archived=is_archived, page=1, page_size=200)
        return {str(item.id) for item in result["items"]}

    archived_ids = ids(is_archived=True)
    active_ids = ids(is_archived=False)
    all_ids = ids(is_archived=None)

    assert str(archived.id) in archived_ids
    assert str(active.id) not in archived_ids
    assert str(active.id) in active_ids
    assert str(archived.id) not in active_ids
    assert {str(archived.id), str(active.id)} <= all_ids


# --------------------------------------------------------------------------- #
# 6. G1：sold 项目归档前可写（白名单移除后语义）
# --------------------------------------------------------------------------- #
def test_sold_project_contract_and_owners_writable_before_archive(db_session: Session) -> None:
    """Sold 项目归档前合同字段 / 业主列表 / 签约材料均可写入（原白名单场景）."""
    project = _create_project(db_session, status=ProjectStatus.SOLD)
    contract_no = f"SH{uuid.uuid4().hex[:8].upper()}-DL"
    service = ProjectService(db_session)

    service.update_project(
        project.id,
        ProjectUpdate(
            contract_no=contract_no,
            owners=[
                {"owner_name": "张归档", "owner_phone": "13800000000", "relation_type": "业主"},
                {"owner_name": "李共有人", "owner_phone": "13900000000", "relation_type": "共有人"},
            ],
            signing_materials=[
                {
                    "filename": "签约合同.pdf",
                    "url": "http://example.com/contract.pdf",
                    "category": "contract_agreement",
                    "fileType": "pdf",
                    "size": 1024,
                },
            ],
        ),
    )

    contract_row = db_session.execute(
        text(
            "SELECT contract_no, signing_materials FROM project_contracts "
            "WHERE project_id = :pid AND is_deleted = false",
        ),
        {"pid": project.id},
    ).fetchone()
    assert contract_row is not None
    assert contract_row[0] == contract_no
    assert "contract.pdf" in str(contract_row[1])

    owner_names = {
        r[0]
        for r in db_session.execute(
            text("SELECT owner_name FROM project_owners WHERE project_id = :pid AND is_deleted = false"),
            {"pid": project.id},
        ).fetchall()
    }
    assert {"张归档", "李共有人"} <= owner_names


def test_assert_project_not_archived_helper(db_session: Session) -> None:
    """写锁 helper：归档抛 ValidationError，未归档放行."""
    project = _create_project(db_session, status=ProjectStatus.SOLD)
    assert_project_not_archived(project)

    project.is_archived = True
    db_session.commit()
    with pytest.raises(ValidationError):
        assert_project_not_archived(project)


def test_archived_project_rejects_dictionary_link_write(db_session: Session) -> None:
    """归档后字典绑定/解绑必须 400，且 projects 关联字段不被改写.

    回归背景：``DictionaryLinkService.link/unlink`` 直接改写 projects 的
    community_id / building_id / room_id / dict_status 并 commit，属项目写操作；
    旧实现未接归档锁，归档项目仍可经
    ``PUT|DELETE /api/v1/admin/projects/{id}/dictionary-link`` 改动字典关联。
    """
    suffix = uuid.uuid4().hex[:8]
    community = Community(id=str(uuid.uuid4()), name=f"归档字典小区-{suffix}")
    db_session.add(community)
    project = _create_project(db_session, status=ProjectStatus.SOLD)
    ProjectArchiveService(db_session).archive_project(
        project.id,
        ProjectArchiveRequest(archived_at=date(2026, 11, 25)),
    )
    db_session.refresh(project)
    assert project.community_id is None

    link_service = get_dictionary_link_service()
    with pytest.raises(ValidationError) as exc:
        link_service.link(
            db_session,
            biz_type="project",
            biz_id=str(project.id),
            body=DictionaryLinkRequest(community_id=community.id),
        )
    assert "项目已归档" in str(exc.value)

    db_session.refresh(project)
    assert project.community_id is None
    assert project.dict_status is None

    # 解绑方向同样被拦截（归档项目字典字段本不应被前期写入，此处构造脏值验证拦截）
    project.community_id = community.id
    project.dict_status = "linked"
    db_session.commit()

    with pytest.raises(ValidationError) as unlink_exc:
        link_service.unlink(db_session, biz_type="project", biz_id=str(project.id))
    assert "项目已归档" in str(unlink_exc.value)

    db_session.refresh(project)
    assert project.community_id == community.id
    assert project.dict_status == "linked"


def test_dictionary_link_rejects_stale_read_after_concurrent_archive(db_session: Session) -> None:
    """TOCTOU：并发事务已提交归档、本会话 identity map 仍为未归档时，字典绑定必须 400.

    回归背景：``check_project_not_archived`` 旧实现直接读入参对象的 ``is_archived``；
    ``_get_record`` 命中的是请求早期已加载的 identity map 实例，SQLAlchemy 不会自动刷新，
    并发归档提交后它仍为 ``False`` → 写锁被绕过（实测 community_id/dict_status 被改写）。
    现在判定前 ``db.refresh(record, ["is_archived"])`` 重读最新值。
    """
    suffix = uuid.uuid4().hex[:8]
    community = Community(id=str(uuid.uuid4()), name=f"并发字典小区-{suffix}")
    db_session.add(community)
    project = _create_project(db_session, status=ProjectStatus.SOLD)
    db_session.commit()

    # 先把项目读进 identity map（模拟请求早期读取），此时未归档
    loaded = db_session.query(Project).filter(Project.id == project.id).first()
    assert loaded.is_archived is False

    # 模拟并发：另一事务已提交归档，但本会话对象陈旧（原生 SQL 不 commit 以保留陈旧值）
    db_session.execute(
        text("UPDATE projects SET is_archived = true WHERE id = :pid"),
        {"pid": project.id},
    )
    assert loaded.is_archived is False, "identity map 应保持陈旧值以复刻竞态"

    with pytest.raises(ValidationError) as exc:
        get_dictionary_link_service().link(
            db_session,
            biz_type="project",
            biz_id=str(project.id),
            body=DictionaryLinkRequest(community_id=community.id),
        )
    assert "项目已归档" in str(exc.value)

    row = db_session.execute(
        text("SELECT community_id, dict_status FROM projects WHERE id = :pid"),
        {"pid": project.id},
    ).fetchone()
    assert row[0] is None
    assert row[1] is None


# --------------------------------------------------------------------------- #
# 7. 审计日志同事务写入（归档/反归档与日志原子提交）
# --------------------------------------------------------------------------- #
def _query_project_logs(db: Session, project_id: uuid.UUID) -> list[OperationLog]:
    """查询指定项目的归档/反归档审计日志."""
    return (
        db.query(OperationLog)
        .filter(
            OperationLog.resource_type == "project",
            OperationLog.resource_id == str(project_id),
            OperationLog.action == "update",
        )
        .all()
    )


def test_archive_writes_operation_log(db_session: Session) -> None:
    """归档与审计日志同一事务：归档成功后 operation_logs 必有对应记录."""
    project = _create_project(db_session, status=ProjectStatus.SOLD)
    service = ProjectArchiveService(db_session)

    service.archive_project(
        project.id,
        ProjectArchiveRequest(archived_at=date(2026, 11, 25), archived_note="归档说明"),
    )

    rows = _query_project_logs(db_session, project.id)
    assert len(rows) == 1
    assert rows[0].after["archived"] is True
    assert rows[0].after["archived_note"] == "归档说明"


def test_unarchive_writes_operation_log(db_session: Session) -> None:
    """反归档与审计日志同一事务：反归档成功后 operation_logs 记录原因."""
    project = _create_project(db_session, status=ProjectStatus.SOLD)
    service = ProjectArchiveService(db_session)
    service.archive_project(project.id, ProjectArchiveRequest(archived_at=date(2026, 11, 25)))

    service.unarchive_project(project.id, ProjectUnarchiveRequest(reason="需补录附件"))

    afters = [row.after for row in _query_project_logs(db_session, project.id)]
    assert len(afters) == 2
    assert any(a.get("archived") is True for a in afters)
    assert any(a == {"archived": False, "reason": "需补录附件"} for a in afters)


def test_archive_log_failure_rolls_back(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    """审计日志写入失败 → ServiceException 且归档变更一并回滚（同一事务）."""
    from services.system import operation_log as operation_log_module
    from services.system.exceptions import ServiceException

    class _BrokenOperationLog:
        """实例化即抛错的替身，模拟审计日志写入失败."""

        def __init__(self, *_args: object, **_kwargs: object) -> None:
            msg = "模拟审计日志写入失败"
            raise RuntimeError(msg)

    monkeypatch.setattr(operation_log_module, "OperationLog", _BrokenOperationLog)

    project = _create_project(db_session, status=ProjectStatus.SOLD)
    service = ProjectArchiveService(db_session)

    with pytest.raises(ServiceException) as exc:
        service.archive_project(project.id, ProjectArchiveRequest(archived_at=date(2026, 11, 25)))
    assert "审计日志写入失败" in str(exc.value)

    db_session.refresh(project)
    assert project.is_archived is False


def test_unarchive_log_failure_rolls_back(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    """反归档审计日志写入失败 → ServiceException 且反归档变更一并回滚."""
    project = _create_project(db_session, status=ProjectStatus.SOLD)
    service = ProjectArchiveService(db_session)
    # 先正常归档（日志写入正常），再模拟反归档时日志写入失败
    service.archive_project(project.id, ProjectArchiveRequest(archived_at=date(2026, 11, 25)))

    from services.system import operation_log as operation_log_module
    from services.system.exceptions import ServiceException

    class _BrokenOperationLog:
        """实例化即抛错的替身，模拟审计日志写入失败."""

        def __init__(self, *_args: object, **_kwargs: object) -> None:
            msg = "模拟审计日志写入失败"
            raise RuntimeError(msg)

    monkeypatch.setattr(operation_log_module, "OperationLog", _BrokenOperationLog)

    with pytest.raises(ServiceException) as exc:
        service.unarchive_project(project.id, ProjectUnarchiveRequest(reason="需补录附件"))
    assert "审计日志写入失败" in str(exc.value)

    db_session.refresh(project)
    assert project.is_archived is True
    assert project.archived_at == date(2026, 11, 25)


# --------------------------------------------------------------------------- #
# 8. 持久化不依赖「日志旁路提交」：autoflush=False 会话下必须显式 commit
# --------------------------------------------------------------------------- #
def _production_like_session(db: Session) -> Session:
    """构造与生产 ``SessionLocal(autoflush=False)`` 语义一致的会话.

    测试夹具默认 ``autoflush=True``，会让任意查询顺带 flush 脏对象，
    掩盖「从未 commit」的缺陷；此处显式关闭 autoflush 复刻生产行为，
    共享同一连接与 SAVEPOINT 隔离（不破坏 conftest 的回滚清理）。

    Args:
        db: 测试主会话（仅用于取底层连接）

    Returns:
        生产语义会话（调用方负责 close）

    """
    return Session(
        bind=db.get_bind(),
        autoflush=False,
        join_transaction_mode="create_savepoint",
    )


def _read_project_row_in_peer_session(db: Session, project_id: uuid.UUID) -> tuple[Any, Any, Any]:
    """用独立 Session（独立 identity map / 工作单元）读取项目归档列.

    独立 Session 只能看到**已 flush 到连接**的数据：若服务层仅修改 ORM 对象而从未
    commit（例如误依赖某个旁路写库顺带提交），本读取会拿到库中旧值 → 用例失败。

    Args:
        db: 测试主会话（仅用于取底层连接）
        project_id: 项目ID

    Returns:
        (is_archived, archived_at, archived_note) 三元组

    """
    peer = Session(bind=db.get_bind(), join_transaction_mode="create_savepoint")
    try:
        return peer.execute(
            text("SELECT is_archived, archived_at, archived_note FROM projects WHERE id = :pid"),
            {"pid": project_id},
        ).fetchone()
    finally:
        peer.close()


def test_archive_persists_outside_unit_of_work(db_session: Session) -> None:
    """归档结果必须已入库（独立工作单元可见），而非停留在当前会话的脏对象."""
    session = _production_like_session(db_session)
    try:
        project = _create_project(session, status=ProjectStatus.SOLD)

        ProjectArchiveService(session).archive_project(
            project.id,
            ProjectArchiveRequest(archived_at=date(2026, 11, 25), archived_note="跨工作单元可见"),
        )

        is_archived, archived_at, archived_note = _read_project_row_in_peer_session(db_session, project.id)
        assert is_archived is True, "归档变更未落库（缺少 commit）"
        assert archived_at == date(2026, 11, 25)
        assert archived_note == "跨工作单元可见"
    finally:
        session.close()


def test_unarchive_persists_outside_unit_of_work(db_session: Session) -> None:
    """反归档结果必须已入库（独立工作单元可见），归档字段清空同样持久化."""
    session = _production_like_session(db_session)
    try:
        project = _create_project(session, status=ProjectStatus.SOLD)
        service = ProjectArchiveService(session)
        service.archive_project(
            project.id,
            ProjectArchiveRequest(archived_at=date(2026, 11, 25), archived_note="归档说明"),
        )

        service.unarchive_project(project.id, ProjectUnarchiveRequest(reason="需补录附件"))

        is_archived, archived_at, archived_note = _read_project_row_in_peer_session(db_session, project.id)
        assert is_archived is False, "反归档变更未落库（缺少 commit）"
        assert archived_at is None
        assert archived_note is None
    finally:
        session.close()


def _log_action_in_separate_session(db: Session, **kwargs: Any) -> OperationLog:
    """替身：审计日志用独立 Session 提交（不回带调用方会话的脏对象）.

    模拟「日后把 log_action 改成独立会话/事务」的演进——此时主变更只能靠
    归档服务自身的显式 commit 落库。

    Args:
        db: 调用方会话（仅用于取底层连接）
        **kwargs: log_action 同名字段

    Returns:
        写入的审计日志行

    """
    peer = Session(bind=db.get_bind(), join_transaction_mode="create_savepoint")
    try:
        entry = OperationLog(
            user_id=kwargs.get("user_id"),
            action=kwargs["action"],
            resource_type=kwargs["resource_type"],
            resource_id=kwargs.get("resource_id"),
            before=kwargs.get("before"),
            after=kwargs.get("after"),
        )
        peer.add(entry)
        peer.commit()
        return entry
    finally:
        peer.close()


def test_archive_persists_when_audit_log_commits_in_separate_session(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """审计日志改走独立会话时，归档/反归档变更仍必须落库.

    反证守卫：删掉 ``ProjectArchiveService`` 中的显式 ``self.db.commit()`` 后本用例
    必然失败（主变更只留在会话脏对象里，独立工作单元读不到）。
    """
    from services.system import operation_log as operation_log_module

    monkeypatch.setattr(
        operation_log_module.operation_log_service,
        "log_action",
        _log_action_in_separate_session,
    )

    session = _production_like_session(db_session)
    try:
        project = _create_project(session, status=ProjectStatus.SOLD)
        service = ProjectArchiveService(session)

        service.archive_project(
            project.id,
            ProjectArchiveRequest(archived_at=date(2026, 11, 25), archived_note="独立会话日志"),
        )
        is_archived, archived_at, archived_note = _read_project_row_in_peer_session(db_session, project.id)
        assert is_archived is True, "归档变更未落库：持久化依赖了 log_action 的内部 commit"
        assert archived_at == date(2026, 11, 25)
        assert archived_note == "独立会话日志"

        service.unarchive_project(project.id, ProjectUnarchiveRequest(reason="独立会话日志-反归档"))
        is_archived, archived_at, archived_note = _read_project_row_in_peer_session(db_session, project.id)
        assert is_archived is False, "反归档变更未落库：持久化依赖了 log_action 的内部 commit"
        assert archived_at is None
        assert archived_note is None
    finally:
        session.close()
