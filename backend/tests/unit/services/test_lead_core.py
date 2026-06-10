"""LeadService 单元测试."""

import pytest
from fastapi import HTTPException

from models import Lead, LeadPriceHistory, Role, User
from schemas.lead import LeadCreate, LeadUpdate
from services.leads.core import LeadService
from utils.auth import get_password_hash


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_user(session) -> User:
    """创建角色和用户，返回用户对象."""
    role = Role(id="test-role", name="测试角色", code="test", permissions=[])
    session.add(role)
    session.commit()
    user = User(
        id="test-user",
        username="testuser",
        password=get_password_hash("Test123!"),
        nickname="测试用户",
        role_id="test-role",
        status="active",
    )
    session.add(user)
    session.commit()
    return user


def _make_lead_data(**overrides) -> LeadCreate:
    """构造 LeadCreate，支持字段覆盖."""
    defaults = {
        "community_name": "阳光花园",
        "total_price": 200.0,
        "layout": "2室1厅",
        "district": "浦东",
        "area": 89.5,
    }
    defaults.update(overrides)
    return LeadCreate(**defaults)


# ---------------------------------------------------------------------------
# create_lead
# ---------------------------------------------------------------------------


class TestCreateLead:
    """create_lead 测试."""

    def test_success(self, db_session) -> None:
        """创建线索应返回正确的 Lead 对象."""
        user = _seed_user(db_session)
        svc = LeadService(db_session)
        data = _make_lead_data()
        lead = svc.create_lead(data, creator_id=user.id)

        assert lead.id is not None
        assert lead.community_name == "阳光花园"
        assert float(lead.total_price) == 200.0
        assert lead.layout == "2室1厅"
        assert lead.creator_id == user.id
        assert lead.status is not None

    def test_creates_initial_price_history(self, db_session) -> None:
        """创建线索时应自动记录初始价格历史."""
        user = _seed_user(db_session)
        svc = LeadService(db_session)
        data = _make_lead_data(total_price=300.0)
        lead = svc.create_lead(data, creator_id=user.id)

        records = db_session.query(LeadPriceHistory).filter(LeadPriceHistory.lead_id == lead.id).all()
        assert len(records) == 1
        assert float(records[0].price) == 300.0
        assert records[0].created_by_id == user.id

    def test_no_price_history_when_price_none(self, db_session) -> None:
        """总价为 None 时不记录价格历史."""
        user = _seed_user(db_session)
        svc = LeadService(db_session)
        data = _make_lead_data(total_price=None)
        lead = svc.create_lead(data, creator_id=user.id)

        records = db_session.query(LeadPriceHistory).filter(LeadPriceHistory.lead_id == lead.id).all()
        assert len(records) == 0


# ---------------------------------------------------------------------------
# get_lead
# ---------------------------------------------------------------------------


class TestGetLead:
    """get_lead 测试."""

    def test_existing_returns_lead(self, db_session) -> None:
        """存在的线索ID应返回 Lead 对象."""
        user = _seed_user(db_session)
        svc = LeadService(db_session)
        created = svc.create_lead(_make_lead_data(), creator_id=user.id)

        found = svc.get_lead(created.id)
        assert found is not None
        assert found.id == created.id
        assert found.community_name == "阳光花园"

    def test_non_existent_returns_none(self, db_session) -> None:
        """不存在的线索ID应返回 None."""
        _seed_user(db_session)
        svc = LeadService(db_session)
        assert svc.get_lead("non-existent-id") is None


# ---------------------------------------------------------------------------
# get_lead_or_404
# ---------------------------------------------------------------------------


class TestGetLeadOr404:
    """get_lead_or_404 测试."""

    def test_existing_returns_lead(self, db_session) -> None:
        """存在的线索ID应返回 Lead 对象."""
        user = _seed_user(db_session)
        svc = LeadService(db_session)
        created = svc.create_lead(_make_lead_data(), creator_id=user.id)

        found = svc.get_lead_or_404(created.id)
        assert found.id == created.id

    def test_non_existent_raises_404(self, db_session) -> None:
        """不存在的线索ID应抛出 HTTPException(404)."""
        _seed_user(db_session)
        svc = LeadService(db_session)
        with pytest.raises(HTTPException) as exc_info:
            svc.get_lead_or_404("non-existent-id")
        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Lead not found"


# ---------------------------------------------------------------------------
# get_leads
# ---------------------------------------------------------------------------


class TestGetLeads:
    """get_leads 测试."""

    def test_returns_pagination_structure(self, db_session) -> None:
        """应返回包含 items/total/page/page_size 的分页结构."""
        user = _seed_user(db_session)
        svc = LeadService(db_session)
        svc.create_lead(_make_lead_data(community_name="小区A"), creator_id=user.id)
        svc.create_lead(_make_lead_data(community_name="小区B"), creator_id=user.id)

        result = svc.get_leads(page=1, page_size=10)
        assert "items" in result
        assert "total" in result
        assert "page" in result
        assert "page_size" in result
        assert result["total"] == 2
        assert result["page"] == 1
        assert result["page_size"] == 10
        assert len(result["items"]) == 2

    def test_pagination_page_size(self, db_session) -> None:
        """分页参数应正确限制返回数量."""
        user = _seed_user(db_session)
        svc = LeadService(db_session)
        for i in range(5):
            svc.create_lead(_make_lead_data(community_name=f"小区{i}"), creator_id=user.id)

        result = svc.get_leads(page=1, page_size=2)
        assert result["total"] == 5
        assert len(result["items"]) == 2

        result2 = svc.get_leads(page=2, page_size=2)
        assert result2["total"] == 5
        assert len(result2["items"]) == 2

    def test_empty_result(self, db_session) -> None:
        """无数据时应返回空列表和 total=0."""
        _seed_user(db_session)
        svc = LeadService(db_session)
        result = svc.get_leads()
        assert result["total"] == 0
        assert result["items"] == []


# ---------------------------------------------------------------------------
# update_lead
# ---------------------------------------------------------------------------


class TestUpdateLead:
    """update_lead 测试."""

    def test_success(self, db_session) -> None:
        """更新线索应返回更新后的对象."""
        user = _seed_user(db_session)
        svc = LeadService(db_session)
        created = svc.create_lead(_make_lead_data(), creator_id=user.id)

        updated = svc.update_lead(created.id, LeadUpdate(community_name="新花园"), updater_id=user.id)
        assert updated.community_name == "新花园"
        assert updated.id == created.id

    def test_non_existent_raises_404(self, db_session) -> None:
        """更新不存在的线索应抛出 HTTPException(404)."""
        user = _seed_user(db_session)
        svc = LeadService(db_session)
        with pytest.raises(HTTPException) as exc_info:
            svc.update_lead("non-existent-id", LeadUpdate(community_name="x"), updater_id=user.id)
        assert exc_info.value.status_code == 404

    def test_price_change_records_history(self, db_session) -> None:
        """价格变更时应记录价格历史."""
        user = _seed_user(db_session)
        svc = LeadService(db_session)
        created = svc.create_lead(_make_lead_data(total_price=200.0), creator_id=user.id)

        # 初始创建时有一条价格记录
        records_before = db_session.query(LeadPriceHistory).filter(LeadPriceHistory.lead_id == created.id).all()
        assert len(records_before) == 1

        # 更新价格
        updated = svc.update_lead(created.id, LeadUpdate(total_price=250.0), updater_id=user.id)
        assert float(updated.total_price) == 250.0

        records_after = db_session.query(LeadPriceHistory).filter(LeadPriceHistory.lead_id == created.id).all()
        assert len(records_after) == 2

    def test_same_price_no_new_history(self, db_session) -> None:
        """价格未变时不应新增价格历史记录."""
        user = _seed_user(db_session)
        svc = LeadService(db_session)
        created = svc.create_lead(_make_lead_data(total_price=200.0), creator_id=user.id)

        records_before = db_session.query(LeadPriceHistory).filter(LeadPriceHistory.lead_id == created.id).all()
        assert len(records_before) == 1

        svc.update_lead(created.id, LeadUpdate(total_price=200.0), updater_id=user.id)

        records_after = db_session.query(LeadPriceHistory).filter(LeadPriceHistory.lead_id == created.id).all()
        assert len(records_after) == 1


# ---------------------------------------------------------------------------
# delete_lead
# ---------------------------------------------------------------------------


class TestDeleteLead:
    """delete_lead 测试."""

    def test_success(self, db_session) -> None:
        """删除线索后应无法再查询到."""
        user = _seed_user(db_session)
        svc = LeadService(db_session)
        created = svc.create_lead(_make_lead_data(), creator_id=user.id)

        svc.delete_lead(created.id)
        assert svc.get_lead(created.id) is None

    def test_non_existent_raises_404(self, db_session) -> None:
        """删除不存在的线索应抛出 HTTPException(404)."""
        _seed_user(db_session)
        svc = LeadService(db_session)
        with pytest.raises(HTTPException) as exc_info:
            svc.delete_lead("non-existent-id")
        assert exc_info.value.status_code == 404
