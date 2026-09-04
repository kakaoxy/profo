"""文书签收管理模块单元测试.

覆盖 spec iter3-document-signoff 的 AC-2 / AC-3 / AC-4 / AC-5 关键场景：
- 模型与常量（AC-1）
- Service 层 CRUD / 初始化 / 同步（AC-3 / AC-4 / AC-5）
- Router 层 HTTP 端点（AC-3 / AC-5）
- Creator 集成：项目创建自动初始化（AC-2）
- Updater 集成：业务形式变更同步（AC-4）
"""

import uuid
from collections.abc import Generator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from constants.documents import (
    AGENT_DOCUMENTS,
    WHOLESALE_DOCUMENTS,
    get_documents_for_business_form,
)
from db import get_db
from main import app
from models import Project, ProjectDocument
from models.common import BusinessForm, DocumentSignoffStatus
from schemas.project import ProjectCreate
from schemas.project.document import DocumentCreate, DocumentUpdate
from services.projects.internal import documents as documents_service
from services.projects.internal.creator import ProjectCreator
from services.projects.internal.updater import ProjectUpdater
from utils.auth import AUDIENCE_ADMIN, create_access_token


# --------------------------------------------------------------------------- #
# 本地 fixture
# --------------------------------------------------------------------------- #
@pytest.fixture
def authed_client(seeded_db: dict[str, Any]) -> Generator[TestClient, None, None]:
    """已认证管理员客户端（token 携带 admin 受众，可通过后台接口鉴权）.

    conftest.admin_client 创建 token 时未设置 audience，会被 validate_token
    的受众校验拒绝，因此这里重建一个携带 AUDIENCE_ADMIN 的客户端。
    """
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
    # CSRF 中间件要求纯 Cookie 认证的不安全方法请求携带 X-Requested-With 头
    client.headers["X-Requested-With"] = "XMLHttpRequest"
    yield client
    app.dependency_overrides.clear()


@pytest.fixture
def project(db_session: Session) -> Project:
    """提供一个未设置业务形式的测试项目（service 层测试用）."""
    proj = Project(
        id=str(uuid.uuid4()),
        name="测试项目",
        community_name="测试小区",
        address="测试地址1号",
        is_deleted=False,
    )
    db_session.add(proj)
    db_session.commit()
    return proj


@pytest.fixture
def seeded_project(seeded_db: dict[str, Any]) -> Project:
    """提供一个 agent 业务形式的测试项目（router 层测试用，与 authed_client 共享 session）."""
    session = seeded_db["session"]
    proj = Project(
        id=str(uuid.uuid4()),
        name="测试项目",
        community_name="测试小区",
        address="测试地址1号",
        business_form=BusinessForm.AGENT,
        is_deleted=False,
    )
    session.add(proj)
    session.commit()
    return proj


def _make_project_create(business_form: BusinessForm | None, contract_no: str = "MFB-TEST-001") -> ProjectCreate:
    """构造最小可用的 ProjectCreate."""
    return ProjectCreate(
        community_name="测试小区",
        address="测试地址1号",
        contract_no=contract_no,
        business_form=business_form,
    )


# --------------------------------------------------------------------------- #
# 1. 模型与常量测试
# --------------------------------------------------------------------------- #
def test_document_signoff_status_enum() -> None:
    """DocumentSignoffStatus 枚举值应为 unsigned/signed/archived."""
    assert DocumentSignoffStatus.UNSIGNED.value == "unsigned"
    assert DocumentSignoffStatus.SIGNED.value == "signed"
    assert DocumentSignoffStatus.ARCHIVED.value == "archived"
    assert len(list(DocumentSignoffStatus)) == 3


def test_agent_documents_count() -> None:
    """AGENT_DOCUMENTS 含 12 项，首项「签约合同」，末项「其他」."""
    assert len(AGENT_DOCUMENTS) == 12
    assert AGENT_DOCUMENTS[0].document_name == "签约合同"
    assert AGENT_DOCUMENTS[11].document_name == "其他"
    # display_order 连续 1-12
    assert [tpl.display_order for tpl in AGENT_DOCUMENTS] == list(range(1, 13))
    assert AGENT_DOCUMENTS[0].category == "contract_agreement"
    assert AGENT_DOCUMENTS[11].category == "other"


def test_wholesale_documents_count() -> None:
    """WHOLESALE_DOCUMENTS 含 18 项，首项「定金协议」，末项「其他」."""
    assert len(WHOLESALE_DOCUMENTS) == 18
    assert WHOLESALE_DOCUMENTS[0].document_name == "定金协议"
    assert WHOLESALE_DOCUMENTS[17].document_name == "其他"
    assert [tpl.display_order for tpl in WHOLESALE_DOCUMENTS] == list(range(1, 19))
    assert WHOLESALE_DOCUMENTS[0].category == "contract_agreement"
    assert WHOLESALE_DOCUMENTS[17].category == "other"


def test_get_documents_for_business_form() -> None:
    """get_documents_for_business_form：None 返回空，AGENT 12 项，WHOLESALE 18 项."""
    assert get_documents_for_business_form(None) == []
    assert len(get_documents_for_business_form(BusinessForm.AGENT)) == 12
    assert len(get_documents_for_business_form(BusinessForm.WHOLESALE)) == 18
    # 返回副本，修改不影响原常量
    agent_list = get_documents_for_business_form(BusinessForm.AGENT)
    agent_list.clear()
    assert len(AGENT_DOCUMENTS) == 12


# --------------------------------------------------------------------------- #
# 2. Service 层测试
# --------------------------------------------------------------------------- #
def test_create_document(db_session: Session, project: Project) -> None:
    """新增文书成功，display_order 默认追加为 1."""
    doc = documents_service.create_document(db_session, project.id, DocumentCreate(document_name="补充协议"))
    assert doc.id is not None
    assert doc.project_id == project.id
    assert doc.document_name == "补充协议"
    assert doc.signoff_status == DocumentSignoffStatus.UNSIGNED.value
    assert doc.archive_date is None
    assert doc.display_order == 1
    assert doc.is_deleted is False
    assert doc.category == "other"


def test_create_document_display_order_appends(db_session: Session, project: Project) -> None:
    """连续新增文书时 display_order 依次追加."""
    d1 = documents_service.create_document(db_session, project.id, DocumentCreate(document_name="文书A"))
    d2 = documents_service.create_document(db_session, project.id, DocumentCreate(document_name="文书B"))
    assert d1.display_order == 1
    assert d2.display_order == 2


def test_list_documents_sorted_and_filtered(db_session: Session, project: Project) -> None:
    """list_documents 按 display_order 升序，过滤 is_deleted."""
    # 直接插入模型以构造乱序与已删除记录
    for name, order, deleted in [("C", 3, False), ("A", 1, False), ("B", 2, False), ("D", 4, True)]:
        db_session.add(
            ProjectDocument(
                id=str(uuid.uuid4()),
                project_id=project.id,
                document_name=name,
                signoff_status=DocumentSignoffStatus.UNSIGNED.value,
                display_order=order,
                is_deleted=deleted,
            )
        )
    db_session.commit()

    docs = documents_service.list_documents(db_session, project.id)
    assert [d.document_name for d in docs] == ["A", "B", "C"]
    assert all(not d.is_deleted for d in docs)


def test_update_document_status_archived(db_session: Session, project: Project) -> None:
    """状态改 archived 时 archive_date 写入."""
    doc = documents_service.create_document(db_session, project.id, DocumentCreate(document_name="装修合同"))
    updated = documents_service.update_document(
        db_session,
        project.id,
        doc.id,
        DocumentUpdate(signoff_status="archived", archive_date="2025-05-18"),
    )
    assert updated is not None
    assert updated.signoff_status == "archived"
    assert updated.archive_date == "2025-05-18"


def test_update_document_status_archived_without_archive_date_defaults_today(
    db_session: Session, project: Project
) -> None:
    """状态改 archived 但未提供 archive_date 时自动填今天（与前端语义一致）."""
    from datetime import datetime, timezone

    doc = documents_service.create_document(db_session, project.id, DocumentCreate(document_name="装修合同"))
    updated = documents_service.update_document(
        db_session,
        project.id,
        doc.id,
        DocumentUpdate(signoff_status="archived"),
    )
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    assert updated is not None
    assert updated.signoff_status == "archived"
    assert updated.archive_date == today


def test_update_document_archived_with_explicit_archive_date_not_overwritten(
    db_session: Session, project: Project
) -> None:
    """显式传 archive_date=None 配合 archived 状态：archive_date 保持原值，不会被自动值覆盖也不会被 None 覆盖.

    验证 Issue1 描述的"自动设置的值被 for 循环用 None 覆盖"不存在：
    - elseif 条件 "archive_date not in updates" 为 False（archive_date 在 updates 中），不设 today
    - for 循环 "updates[archive_date] is not None" 为 False，不 setattr
    - 结果：archive_date 保持 doc 原值（此处为 None）

    """
    doc = documents_service.create_document(db_session, project.id, DocumentCreate(document_name="装修合同"))
    # 文书刚创建，archive_date 为 None
    assert doc.archive_date is None
    # 显式传 archive_date=None
    updated = documents_service.update_document(
        db_session,
        project.id,
        doc.id,
        DocumentUpdate(signoff_status="archived", archive_date=None),
    )
    assert updated is not None
    assert updated.signoff_status == "archived"
    # archive_date 保持原值 None（未被自动填今天，也未被"覆盖为 None"——它本来就是 None）
    assert updated.archive_date is None


def test_update_document_archived_with_explicit_none_does_not_clear_existing_date(
    db_session: Session, project: Project
) -> None:
    """已有 archive_date 的文书，传 archived + archive_date=None：保持原日期，不被 None 覆盖.

    进一步验证 Issue1 不存在：即使 updates 含 archive_date=None，for 循环的 is not None 守卫
    会阻止将 None 写入，原日期得以保留。

    """
    doc = documents_service.create_document(db_session, project.id, DocumentCreate(document_name="装修合同"))
    # 先归档写入日期
    documents_service.update_document(
        db_session,
        project.id,
        doc.id,
        DocumentUpdate(signoff_status="archived", archive_date="2025-05-18"),
    )
    # 再传 archived + archive_date=None
    updated = documents_service.update_document(
        db_session,
        project.id,
        doc.id,
        DocumentUpdate(signoff_status="archived", archive_date=None),
    )
    assert updated is not None
    assert updated.signoff_status == "archived"
    # 原日期 2025-05-18 保留，未被 None 覆盖
    assert updated.archive_date == "2025-05-18"


def test_update_document_status_unsigned_clears_archive_date(db_session: Session, project: Project) -> None:
    """状态回退 unsigned 时 archive_date 清空."""
    doc = documents_service.create_document(db_session, project.id, DocumentCreate(document_name="装修合同"))
    documents_service.update_document(
        db_session,
        project.id,
        doc.id,
        DocumentUpdate(signoff_status="archived", archive_date="2025-05-18"),
    )
    reset = documents_service.update_document(
        db_session,
        project.id,
        doc.id,
        DocumentUpdate(signoff_status="unsigned"),
    )
    assert reset is not None
    assert reset.signoff_status == "unsigned"
    assert reset.archive_date is None


def test_update_document_status_signed_keeps_archive_date(db_session: Session, project: Project) -> None:
    """状态改 signed 时 archive_date 保持不变."""
    doc = documents_service.create_document(db_session, project.id, DocumentCreate(document_name="装修合同"))
    documents_service.update_document(
        db_session,
        project.id,
        doc.id,
        DocumentUpdate(signoff_status="archived", archive_date="2025-05-18"),
    )
    signed = documents_service.update_document(
        db_session,
        project.id,
        doc.id,
        DocumentUpdate(signoff_status="signed"),
    )
    assert signed is not None
    assert signed.signoff_status == "signed"
    assert signed.archive_date == "2025-05-18"


def test_update_document_name(db_session: Session, project: Project) -> None:
    """修改文书名称成功."""
    doc = documents_service.create_document(db_session, project.id, DocumentCreate(document_name="其他资料"))
    updated = documents_service.update_document(
        db_session,
        project.id,
        doc.id,
        DocumentUpdate(document_name="其他补充资料"),
    )
    assert updated is not None
    assert updated.document_name == "其他补充资料"


def test_update_document_not_found(db_session: Session, project: Project) -> None:
    """不存在的 document_id 返回 None."""
    result = documents_service.update_document(
        db_session,
        project.id,
        str(uuid.uuid4()),
        DocumentUpdate(signoff_status="signed"),
    )
    assert result is None


def test_update_document_cross_project(db_session: Session, project: Project) -> None:
    """跨项目 document_id 返回 None."""
    doc = documents_service.create_document(db_session, project.id, DocumentCreate(document_name="文书"))
    # 另一个项目
    other = Project(
        id=str(uuid.uuid4()),
        name="其他项目",
        community_name="其他小区",
        address="其他地址",
        is_deleted=False,
    )
    db_session.add(other)
    db_session.commit()
    result = documents_service.update_document(
        db_session,
        other.id,
        doc.id,
        DocumentUpdate(signoff_status="signed"),
    )
    assert result is None


def test_delete_document(db_session: Session, project: Project) -> None:
    """逻辑删除成功，列表不再显示."""
    doc = documents_service.create_document(db_session, project.id, DocumentCreate(document_name="文书"))
    assert documents_service.delete_document(db_session, project.id, doc.id) is True
    # 列表不再包含
    docs = documents_service.list_documents(db_session, project.id)
    assert doc.id not in [d.id for d in docs]
    # 再次删除返回 False
    assert documents_service.delete_document(db_session, project.id, doc.id) is False


def test_delete_document_not_found(db_session: Session, project: Project) -> None:
    """不存在的 document_id 返回 False."""
    assert documents_service.delete_document(db_session, project.id, str(uuid.uuid4())) is False


def test_initialize_documents_agent(db_session: Session, project: Project) -> None:
    """Agent 初始化 12 条，状态 unsigned，display_order 1-12."""
    count = documents_service.initialize_documents(db_session, project.id, BusinessForm.AGENT)
    assert count == 12
    docs = documents_service.list_documents(db_session, project.id)
    assert len(docs) == 12
    assert [d.display_order for d in docs] == list(range(1, 13))
    assert all(d.signoff_status == DocumentSignoffStatus.UNSIGNED.value for d in docs)
    assert docs[0].document_name == "签约合同"
    assert all(d.category for d in docs)


def test_initialize_documents_wholesale(db_session: Session, project: Project) -> None:
    """Wholesale 初始化 18 条."""
    count = documents_service.initialize_documents(db_session, project.id, BusinessForm.WHOLESALE)
    assert count == 18
    docs = documents_service.list_documents(db_session, project.id)
    assert len(docs) == 18
    assert docs[0].document_name == "定金协议"


def test_initialize_documents_none_business_form_raises(db_session: Session, project: Project) -> None:
    """business_form=None 抛 ValueError."""
    with pytest.raises(ValueError, match="business_form is None"):
        documents_service.initialize_documents(db_session, project.id, None)


def test_initialize_documents_idempotent(db_session: Session, project: Project) -> None:
    """再次初始化不重复创建，返回 0."""
    assert documents_service.initialize_documents(db_session, project.id, BusinessForm.AGENT) == 12
    assert documents_service.initialize_documents(db_session, project.id, BusinessForm.AGENT) == 0
    docs = documents_service.list_documents(db_session, project.id)
    assert len(docs) == 12


def test_sync_documents_agent_to_wholesale(db_session: Session, project: Project) -> None:
    """agent→wholesale 追加 wholesale 独有文书，原 agent 文书保留."""
    documents_service.initialize_documents(db_session, project.id, BusinessForm.AGENT)
    assert len(documents_service.list_documents(db_session, project.id)) == 12

    documents_service.sync_documents_on_business_form_change(
        db_session,
        project.id,
        BusinessForm.AGENT,
        BusinessForm.WHOLESALE,
    )
    docs = documents_service.list_documents(db_session, project.id)
    # 3 个 common（收款收据/房屋交接书/其他），wholesale 18 - 3 = 15 追加 → 12 + 15 = 27
    assert len(docs) == 27
    names = {d.document_name for d in docs}
    assert "定金协议" in names
    # 原 agent 独有文书保留
    assert "业主身份证" in names


def test_sync_documents_no_change_when_same_form(db_session: Session, project: Project) -> None:
    """old==new 时不操作."""
    documents_service.initialize_documents(db_session, project.id, BusinessForm.AGENT)
    documents_service.sync_documents_on_business_form_change(
        db_session,
        project.id,
        BusinessForm.AGENT,
        BusinessForm.AGENT,
    )
    assert len(documents_service.list_documents(db_session, project.id)) == 12


def test_sync_documents_new_form_none_no_op(db_session: Session, project: Project) -> None:
    """new_form=None 时不操作."""
    documents_service.initialize_documents(db_session, project.id, BusinessForm.AGENT)
    documents_service.sync_documents_on_business_form_change(
        db_session,
        project.id,
        BusinessForm.AGENT,
        None,
    )
    assert len(documents_service.list_documents(db_session, project.id)) == 12


def test_sync_documents_none_to_agent_initializes(db_session: Session, project: Project) -> None:
    """None→agent 触发 12 条初始化."""
    documents_service.sync_documents_on_business_form_change(
        db_session,
        project.id,
        None,
        BusinessForm.AGENT,
    )
    assert len(documents_service.list_documents(db_session, project.id)) == 12


# --------------------------------------------------------------------------- #
# 3. Router 层测试
# --------------------------------------------------------------------------- #
def test_get_documents_empty(authed_client: TestClient, seeded_project: Project) -> None:
    """新项目（无文书）返回空列表."""
    resp = authed_client.get(f"/api/v1/projects/{seeded_project.id}/documents")
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_document_endpoint(authed_client: TestClient, seeded_project: Project) -> None:
    """POST 创建成功，返回 201，display_order 默认追加."""
    resp = authed_client.post(
        f"/api/v1/projects/{seeded_project.id}/documents",
        json={"document_name": "补充协议"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["document_name"] == "补充协议"
    assert body["signoff_status"] == "unsigned"
    assert body["display_order"] == 1
    assert body["archive_date"] is None
    assert body["category"] == "other"


def test_update_document_endpoint(authed_client: TestClient, seeded_project: Project) -> None:
    """PATCH 更新状态为 archived 并写入 archive_date."""
    created = authed_client.post(
        f"/api/v1/projects/{seeded_project.id}/documents",
        json={"document_name": "装修合同"},
    ).json()
    resp = authed_client.patch(
        f"/api/v1/projects/{seeded_project.id}/documents/{created['id']}",
        json={"signoff_status": "archived", "archive_date": "2025-05-18"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["signoff_status"] == "archived"
    assert body["archive_date"] == "2025-05-18"


def test_delete_document_endpoint(authed_client: TestClient, seeded_project: Project) -> None:
    """DELETE 返回 204，列表不再显示."""
    created = authed_client.post(
        f"/api/v1/projects/{seeded_project.id}/documents",
        json={"document_name": "文书"},
    ).json()
    resp = authed_client.delete(f"/api/v1/projects/{seeded_project.id}/documents/{created['id']}")
    assert resp.status_code == 204
    # 列表为空
    listing = authed_client.get(f"/api/v1/projects/{seeded_project.id}/documents").json()
    assert listing == []


def test_update_document_not_found_endpoint(authed_client: TestClient, seeded_project: Project) -> None:
    """PATCH 不存在的 doc_id 返回 404."""
    resp = authed_client.patch(
        f"/api/v1/projects/{seeded_project.id}/documents/{uuid.uuid4()!s}",
        json={"signoff_status": "signed"},
    )
    assert resp.status_code == 404
    assert resp.json()["message"] == "文书不存在"


def test_delete_document_not_found_endpoint(authed_client: TestClient, seeded_project: Project) -> None:
    """DELETE 不存在的 doc_id 返回 404."""
    resp = authed_client.delete(f"/api/v1/projects/{seeded_project.id}/documents/{uuid.uuid4()!s}")
    assert resp.status_code == 404


def test_initialize_documents_endpoint(authed_client: TestClient, seeded_project: Project) -> None:
    """POST /initialize 成功，返回 initialized_count=12."""
    resp = authed_client.post(f"/api/v1/projects/{seeded_project.id}/documents/initialize")
    assert resp.status_code == 200
    assert resp.json()["initialized_count"] == 12


def test_initialize_documents_idempotent_endpoint(authed_client: TestClient, seeded_project: Project) -> None:
    """再次 initialize 返回 0（幂等）."""
    authed_client.post(f"/api/v1/projects/{seeded_project.id}/documents/initialize")
    resp = authed_client.post(f"/api/v1/projects/{seeded_project.id}/documents/initialize")
    assert resp.status_code == 200
    assert resp.json()["initialized_count"] == 0


def test_initialize_documents_no_business_form_endpoint(
    authed_client: TestClient,
    seeded_db: dict[str, Any],
) -> None:
    """business_form=None 返回 400."""
    session = seeded_db["session"]
    proj = Project(
        id=str(uuid.uuid4()),
        name="无业务形式项目",
        community_name="测试小区",
        address="测试地址",
        business_form=None,
        is_deleted=False,
    )
    session.add(proj)
    session.commit()
    resp = authed_client.post(f"/api/v1/projects/{proj.id}/documents/initialize")
    assert resp.status_code == 400
    assert resp.json()["message"] == "请先设置业务形式"


def test_get_documents_project_not_found(authed_client: TestClient) -> None:
    """不存在的项目返回 404."""
    resp = authed_client.get(f"/api/v1/projects/{uuid.uuid4()!s}/documents")
    assert resp.status_code == 404


# --------------------------------------------------------------------------- #
# 4. Creator 集成测试（AC-2）
# --------------------------------------------------------------------------- #
def test_creator_initializes_documents_agent(db_session: Session) -> None:
    """创建 agent 项目后自动初始化 12 条文书."""
    creator = ProjectCreator(db_session)
    project_obj = creator.create(_make_project_create(BusinessForm.AGENT, contract_no="MFB-CREATE-AGENT"))
    docs = documents_service.list_documents(db_session, project_obj.id)
    assert len(docs) == 12
    assert all(d.signoff_status == DocumentSignoffStatus.UNSIGNED.value for d in docs)
    assert docs[0].document_name == "签约合同"


def test_creator_initializes_documents_wholesale(db_session: Session) -> None:
    """创建 wholesale 项目后自动初始化 18 条文书."""
    creator = ProjectCreator(db_session)
    project_obj = creator.create(_make_project_create(BusinessForm.WHOLESALE, contract_no="MFB-CREATE-WS"))
    docs = documents_service.list_documents(db_session, project_obj.id)
    assert len(docs) == 18
    assert docs[0].document_name == "定金协议"


def test_creator_skips_documents_when_no_business_form(db_session: Session) -> None:
    """business_form=NULL 不创建文书."""
    creator = ProjectCreator(db_session)
    project_obj = creator.create(_make_project_create(None, contract_no="MFB-CREATE-NONE"))
    docs = documents_service.list_documents(db_session, project_obj.id)
    assert docs == []


# --------------------------------------------------------------------------- #
# 5. Updater 集成测试（AC-4）
# --------------------------------------------------------------------------- #
def test_updater_sync_on_business_form_change_none_to_agent(db_session: Session) -> None:
    """None→agent 触发初始化 12 条文书."""
    # 直接建一个无业务形式的项目
    proj = Project(
        id=str(uuid.uuid4()),
        name="更新项目",
        community_name="测试小区",
        address="测试地址",
        business_form=None,
        is_deleted=False,
    )
    db_session.add(proj)
    db_session.commit()
    assert documents_service.list_documents(db_session, proj.id) == []

    updater = ProjectUpdater(db_session)
    updater.update(proj, {"business_form": BusinessForm.AGENT})
    docs = documents_service.list_documents(db_session, proj.id)
    assert len(docs) == 12


def test_updater_no_sync_when_same_business_form(db_session: Session) -> None:
    """相同 business_form 不触发同步，文书数量不变."""
    # 通过 creator 创建 agent 项目（自动初始化 12 条）
    creator = ProjectCreator(db_session)
    proj = creator.create(_make_project_create(BusinessForm.AGENT, contract_no="MFB-UPD-SAME"))
    assert len(documents_service.list_documents(db_session, proj.id)) == 12

    updater = ProjectUpdater(db_session)
    # 再次更新为相同的 agent，不应触发同步
    updater.update(proj, {"business_form": BusinessForm.AGENT})
    assert len(documents_service.list_documents(db_session, proj.id)) == 12


def test_updater_sync_agent_to_wholesale_appends_only(db_session: Session) -> None:
    """agent→wholesale 仅追加 wholesale 独有文书，原记录保留."""
    creator = ProjectCreator(db_session)
    proj = creator.create(_make_project_create(BusinessForm.AGENT, contract_no="MFB-UPD-WS"))
    assert len(documents_service.list_documents(db_session, proj.id)) == 12

    updater = ProjectUpdater(db_session)
    updater.update(proj, {"business_form": BusinessForm.WHOLESALE})
    docs = documents_service.list_documents(db_session, proj.id)
    # 3 个 common，wholesale 18 - 3 = 15 追加 → 12 + 15 = 27
    assert len(docs) == 27
    assert "定金协议" in {d.document_name for d in docs}
