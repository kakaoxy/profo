"""项目列表 keyword 模糊搜索 + contract_sort 合同编号排序测试.

覆盖：
- keyword 匹配小区名称（大小写不敏感）
- keyword 匹配合同编号（join contract 路径）
- LIKE 通配符按字面匹配（escape_like 防注入语义）
- contract_sort 合同编号降序、无合同项目排末尾
- join contract 后 total 计数不因一对一 join 重复
"""

from datetime import datetime, timezone

import pytest
from sqlalchemy.orm import Session

from models import Project, ProjectContract
from models.common import BusinessForm, ProjectStatus
from services.projects import ProjectQueryService


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _make_project(
    db_session: Session,
    *,
    name: str,
    community_name: str,
    created_at: datetime | None = None,
) -> Project:
    """创建并持久化一个最小可用项目."""
    project = Project(
        name=name,
        community_name=community_name,
        address="测试地址",
        status=ProjectStatus.SIGNING.value,
        business_form=BusinessForm.AGENT,
        is_deleted=False,
        created_at=created_at or _now(),
        updated_at=_now(),
    )
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)
    return project


def _make_contract(db_session: Session, project: Project, *, contract_no: str) -> ProjectContract:
    """为项目关联一条合同记录."""
    contract = ProjectContract(
        project_id=project.id,
        contract_no=contract_no,
        is_deleted=False,
        created_at=_now(),
        updated_at=_now(),
    )
    db_session.add(contract)
    db_session.commit()
    db_session.refresh(contract)
    return contract


def test_keyword_matches_community_name(db_session: Session) -> None:
    """Keyword 命中小区名称（大小写不敏感）."""
    hit = _make_project(db_session, name="项目A", community_name="阳光花园")
    _make_project(db_session, name="项目B", community_name="翡翠湾")

    result = ProjectQueryService(db_session).get_by_status(keyword="阳光花园")

    assert result["total"] == 1
    assert [p.id for p in result["items"]] == [hit.id]


def test_keyword_matches_contract_no(db_session: Session) -> None:
    """Keyword 命中合同编号（需 outerjoin contract 路径生效）."""
    matched = _make_project(db_session, name="项目A", community_name="阳光花园")
    _make_project(db_session, name="项目B", community_name="翡翠湾")
    _make_contract(db_session, matched, contract_no="SH0001-DL")

    result = ProjectQueryService(db_session).get_by_status(keyword="SH0001")

    assert result["total"] == 1
    assert [p.id for p in result["items"]] == [matched.id]


def test_keyword_community_match_not_filtered_by_unmatched_contract(db_session: Session) -> None:
    """仅小区名称命中的项目不因存在编号不匹配的合同而被过滤.

    回归防护：keyword 匹配合同编号若在 WHERE 中直接引用 outerjoin 右表列，
    会把 LEFT JOIN 收紧成隐式 INNER JOIN；须用 exists 子查询。
    """
    hit = _make_project(db_session, name="项目A", community_name="阳光花园")
    _make_contract(db_session, hit, contract_no="SH0001-DL")
    _make_project(db_session, name="项目B", community_name="翡翠湾")

    result = ProjectQueryService(db_session).get_by_status(keyword="阳光花园")

    assert result["total"] == 1
    assert [p.id for p in result["items"]] == [hit.id]


def test_keyword_like_wildcards_matched_literally(db_session: Session) -> None:
    """Keyword 含 % / _ 时按字面匹配，不作为 LIKE 通配符展开.

    若 % 未被转义，"10%" 会以通配符命中「100X小区」，导致误匹配。
    """
    literal = _make_project(db_session, name="项目A", community_name="10%小区")
    other = _make_project(db_session, name="项目B", community_name="100X小区")

    result = ProjectQueryService(db_session).get_by_status(keyword="10%")

    ids = [p.id for p in result["items"]]
    assert literal.id in ids
    assert other.id not in ids

    underscore_hit = _make_project(db_session, name="项目C", community_name="A_B小区")
    plain = _make_project(db_session, name="项目D", community_name="AXB小区")
    result_u = ProjectQueryService(db_session).get_by_status(keyword="A_B")
    ids_u = [p.id for p in result_u["items"]]
    assert underscore_hit.id in ids_u
    assert plain.id not in ids_u


def test_contract_sort_descending_with_missing_last(db_session: Session) -> None:
    """contract_sort：合同编号降序在前，无合同项目 nulls_last 排末尾."""
    newest = _make_project(db_session, name="最新", community_name="小区一")
    oldest = _make_project(db_session, name="最早", community_name="小区二")
    no_contract = _make_project(db_session, name="无合同", community_name="小区三")
    _make_contract(db_session, oldest, contract_no="SH0001-DL")
    _make_contract(db_session, newest, contract_no="SH0099-SG")

    result = ProjectQueryService(db_session).get_by_status(contract_sort=True)

    assert [p.id for p in result["items"]] == [newest.id, oldest.id, no_contract.id]


def test_contract_filter_join_does_not_duplicate_total(db_session: Session) -> None:
    """keyword/contract_sort 触发 outerjoin 后，一对一关系不应放大 total 计数."""
    project = _make_project(db_session, name="唯一", community_name="小区一")
    _make_contract(db_session, project, contract_no="SH0007-DL")
    service = ProjectQueryService(db_session)

    by_keyword = service.get_by_status(keyword="SH0007")
    by_sort = service.get_by_status(contract_sort=True)

    assert by_keyword["total"] == 1
    assert len(by_keyword["items"]) == 1
    assert by_sort["total"] == 1
    assert len(by_sort["items"]) == 1


@pytest.mark.parametrize("bad_keyword", ["\\", "%_", "a%b_c\\d"])
def test_keyword_with_special_chars_does_not_raise(db_session: Session, bad_keyword: str) -> None:
    """纯特殊字符 keyword 经 escape_like 转义后可安全执行，不抛异常."""
    _make_project(db_session, name="项目A", community_name="普通小区")

    result = ProjectQueryService(db_session).get_by_status(keyword=bad_keyword)

    assert result["total"] == 0
