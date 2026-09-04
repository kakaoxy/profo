"""Lead 单价自动计算测试.

回归缺陷：unit_price 历史上从未被自动计算，C 端 /public/leads 不传单价、
admin 录入依赖前端计算后提交，导致大量线索 unit_price 为 NULL，admin 单价列显示为空。
修复后 LeadService.create_lead / update_lead / LeadPriceService.add_price_record
在 total_price 与 area 有效时自动计算 unit_price = total_price / area（万/㎡，2 位小数）。
"""

import uuid
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.common import LeadStatus
from models.lead import Lead
from schemas.lead import LeadCreate, LeadUpdate
from services.leads import LeadService
from services.leads.internal import LeadPriceService, compute_unit_price


def _make_lead_row(
    session: Session,
    *,
    total_price: float | None = None,
    area: float | None = None,
    unit_price: float | None = None,
) -> Lead:
    """直接 ORM 插入一条线索（绕过 service，用于 update/price 场景的前置数据）."""
    lead = Lead(
        id=str(uuid.uuid4()),
        community_name="测试小区",
        floor_info="1/6层",
        area=area,
        total_price=total_price,
        unit_price=unit_price,
        status=LeadStatus.PENDING_ASSESSMENT,
        creator_id="admin-user",
    )
    session.add(lead)
    session.commit()
    session.refresh(lead)
    return lead


# ---------------------------------------------------------------------------
# compute_unit_price 单元测试
# ---------------------------------------------------------------------------


class TestComputeUnitPrice:
    """compute_unit_price 模块函数测试."""

    def test_computes_price_per_sqm(self) -> None:
        """总价 300 万 / 面积 100 ㎡ = 3.00 万/㎡."""
        assert float(compute_unit_price(300.0, 100.0)) == 3.0  # type: ignore[arg-type]

    def test_rounds_to_two_decimals(self) -> None:
        """总价 350 万 / 面积 120 ㎡ = 2.9166... → 2.92（四舍五入）."""
        assert float(compute_unit_price(350.0, 120.0)) == 2.92  # type: ignore[arg-type]

    def test_returns_none_when_total_price_none(self) -> None:
        """total_price 为 None → None."""
        assert compute_unit_price(None, 100.0) is None

    def test_returns_none_when_area_none(self) -> None:
        """Area 为 None → None."""
        assert compute_unit_price(300.0, None) is None

    def test_returns_none_when_area_zero(self) -> None:
        """Area 为 0 → None（避免除零）."""
        assert compute_unit_price(300.0, 0) is None

    def test_returns_none_when_total_price_zero(self) -> None:
        """total_price 为 0 → None（无意义单价）."""
        assert compute_unit_price(0, 100.0) is None


# ---------------------------------------------------------------------------
# LeadService.create_lead
# ---------------------------------------------------------------------------


class TestCreateLeadUnitPrice:
    """create_lead 自动计算单价."""

    def test_computes_unit_price_when_not_provided(self, seeded_db: dict[str, Any]) -> None:
        """未传 unit_price 但有 total_price + area → 自动计算."""
        session: Session = seeded_db["session"]
        svc = LeadService(session)
        lead = svc.create_lead(
            LeadCreate(
                community_name="测试小区",
                floor_info="1/6层",
                area=100.0,
                total_price=300.0,
            ),
            creator_id="admin-user",
        )
        assert float(lead.unit_price) == 3.0  # type: ignore[arg-type]

    def test_respects_explicit_unit_price(self, seeded_db: dict[str, Any]) -> None:
        """显式提供 unit_price → 不覆盖."""
        session: Session = seeded_db["session"]
        svc = LeadService(session)
        lead = svc.create_lead(
            LeadCreate(
                community_name="测试小区",
                floor_info="1/6层",
                area=100.0,
                total_price=300.0,
                unit_price=5.0,
            ),
            creator_id="admin-user",
        )
        assert float(lead.unit_price) == 5.0  # type: ignore[arg-type]

    def test_unit_price_none_when_area_missing(self, seeded_db: dict[str, Any]) -> None:
        """无 area → unit_price 为 None."""
        session: Session = seeded_db["session"]
        svc = LeadService(session)
        lead = svc.create_lead(
            LeadCreate(
                community_name="测试小区",
                floor_info="1/6层",
                total_price=300.0,
            ),
            creator_id="admin-user",
        )
        assert lead.unit_price is None


# ---------------------------------------------------------------------------
# LeadService.update_lead
# ---------------------------------------------------------------------------


class TestUpdateLeadUnitPrice:
    """update_lead 在 total_price/area 变更时重算单价."""

    def test_recomputes_on_total_price_change(self, seeded_db: dict[str, Any]) -> None:
        """改 total_price（未显式传 unit_price）→ 重算单价."""
        session: Session = seeded_db["session"]
        lead = _make_lead_row(session, total_price=300.0, area=100.0, unit_price=3.0)
        svc = LeadService(session)
        updated = svc.update_lead(lead.id, LeadUpdate(total_price=400.0), updater_id="admin-user")
        assert float(updated.total_price) == 400.0  # type: ignore[arg-type]
        assert float(updated.unit_price) == 4.0  # type: ignore[arg-type]

    def test_recomputes_on_area_change(self, seeded_db: dict[str, Any]) -> None:
        """改 area（未显式传 unit_price）→ 重算单价."""
        session: Session = seeded_db["session"]
        lead = _make_lead_row(session, total_price=300.0, area=100.0, unit_price=3.0)
        svc = LeadService(session)
        updated = svc.update_lead(lead.id, LeadUpdate(area=150.0), updater_id="admin-user")
        assert float(updated.unit_price) == 2.0  # type: ignore[arg-type]

    def test_respects_explicit_unit_price_on_update(self, seeded_db: dict[str, Any]) -> None:
        """显式传 unit_price → 不重算（用传入值）."""
        session: Session = seeded_db["session"]
        lead = _make_lead_row(session, total_price=300.0, area=100.0, unit_price=3.0)
        svc = LeadService(session)
        updated = svc.update_lead(
            lead.id,
            LeadUpdate(total_price=400.0, unit_price=9.9),
            updater_id="admin-user",
        )
        assert float(updated.unit_price) == 9.9  # type: ignore[arg-type]

    def test_no_recompute_when_price_area_unchanged(self, seeded_db: dict[str, Any]) -> None:
        """仅改其他字段 → 单价不变."""
        session: Session = seeded_db["session"]
        lead = _make_lead_row(session, total_price=300.0, area=100.0, unit_price=3.0)
        svc = LeadService(session)
        updated = svc.update_lead(
            lead.id,
            LeadUpdate(layout="3室2厅"),
            updater_id="admin-user",
        )
        assert float(updated.unit_price) == 3.0  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# LeadPriceService.add_price_record
# ---------------------------------------------------------------------------


class TestAddPriceRecordUnitPrice:
    """add_price_record 更新 total_price 后重算单价."""

    def test_recomputes_unit_price_on_price_record(self, seeded_db: dict[str, Any]) -> None:
        """添加价格记录（改 total_price）→ 重算单价."""
        session: Session = seeded_db["session"]
        lead = _make_lead_row(session, total_price=300.0, area=100.0, unit_price=3.0)
        svc = LeadPriceService(session)
        svc.add_price_record(
            lead_id=lead.id,
            price=500.0,
            remark="二次授权",
            created_by_id="admin-user",
        )
        session.refresh(lead)
        assert float(lead.total_price) == 500.0  # type: ignore[arg-type]
        assert float(lead.unit_price) == 5.0  # type: ignore[arg-type]

    def test_unit_price_unchanged_when_area_none(self, seeded_db: dict[str, Any]) -> None:
        """面积缺失时改 total_price → 单价保持 None."""
        session: Session = seeded_db["session"]
        lead = _make_lead_row(session, total_price=300.0, area=None, unit_price=None)
        svc = LeadPriceService(session)
        svc.add_price_record(
            lead_id=lead.id,
            price=500.0,
            remark=None,
            created_by_id="admin-user",
        )
        session.refresh(lead)
        assert lead.unit_price is None


# ---------------------------------------------------------------------------
# HTTP 层：C 端 /public/leads 提交后响应含 unit_price
# ---------------------------------------------------------------------------


class TestPublicLeadCreateUnitPrice:
    """/public/leads 提交后响应与 DB 中 unit_price 自动计算."""

    def test_response_includes_computed_unit_price(
        self,
        c_end_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """C 端提交 expected_price + area → 响应 unit_price = total_price / area."""
        session: Session = seeded_db["session"]
        resp = c_end_client.post(
            "/api/v1/public/leads",
            json={
                "community_name": "测试小区",
                "floor_info": "1/6层",
                "area": 120.0,
                "expected_price": 360.0,
            },
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["total_price"] == 360.0
        assert body["unit_price"] == 3.0

        lead = session.query(Lead).filter(Lead.id == body["id"]).first()
        assert lead is not None
        assert float(lead.unit_price) == 3.0  # type: ignore[arg-type]
