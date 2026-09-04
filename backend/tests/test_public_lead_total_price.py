"""POST /public/leads 总价写入回归测试.

回归缺陷：C 端提交「心理预期价」(expected_price) historically 仅写入
Lead.expected_price，未写入 total_price，导致 admin 总价列对小程序/Web C 端
提交的线索显示为空。修复后 expected_price 应同步写入 total_price，并生成一条
Initial Creation 价格历史；expected_price 为 None 时 total_price 仍为 None。
"""

from types import SimpleNamespace
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.common import LeadStatus
from models.lead import Lead, LeadPriceHistory
from routers.public.leads import _effective_expected_price

_PUBLIC_LEADS = "/api/v1/public/leads"


class TestPublicLeadCreateTotalPrice:
    """POST /public/leads 总价写入测试."""

    def test_expected_price_is_written_to_total_price_and_creates_price_history(
        self,
        c_end_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """提交 expected_price → total_price 同步写入并生成 Initial Creation 价格历史."""
        session: Session = seeded_db["session"]

        resp = c_end_client.post(
            _PUBLIC_LEADS,
            json={
                "community_name": "测试小区",
                "floor_info": "1/6层",
                "area": 100.0,
                "expected_price": 300.0,
            },
        )
        assert resp.status_code == 201, f"提交应返回 201，实际 {resp.status_code}: {resp.text}"
        body = resp.json()
        lead_id = body["id"]

        # 响应字段：total_price 与 expected_price 均等于提交值
        assert body["total_price"] == 300.0
        assert body["expected_price"] == 300.0

        # DB：Lead.total_price 已写入
        lead = session.query(Lead).filter(Lead.id == lead_id).first()
        assert lead is not None
        assert float(lead.total_price) == 300.0  # type: ignore[arg-type]
        assert float(lead.expected_price) == 300.0  # type: ignore[arg-type]

        # 价格历史：生成一条 Initial Creation 记录
        histories = session.query(LeadPriceHistory).filter(LeadPriceHistory.lead_id == lead_id).all()
        assert len(histories) == 1
        assert float(histories[0].price) == 300.0
        assert histories[0].remark == "Initial Creation"

    def test_missing_expected_price_leaves_total_price_null(
        self,
        c_end_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """未提交 expected_price → total_price 为 None，且不生成价格历史."""
        session: Session = seeded_db["session"]

        resp = c_end_client.post(
            _PUBLIC_LEADS,
            json={
                "community_name": "测试小区",
                "floor_info": "1/6层",
            },
        )
        assert resp.status_code == 201, f"提交应返回 201，实际 {resp.status_code}: {resp.text}"
        body = resp.json()
        lead_id = body["id"]

        # 响应字段：total_price / expected_price 均为 None
        assert body["total_price"] is None
        assert body["expected_price"] is None

        # DB：Lead.total_price 为 NULL
        lead = session.query(Lead).filter(Lead.id == lead_id).first()
        assert lead is not None
        assert lead.total_price is None
        assert lead.expected_price is None

        # 不生成价格历史
        histories = session.query(LeadPriceHistory).filter(LeadPriceHistory.lead_id == lead_id).all()
        assert histories == []


class TestEffectiveExpectedPrice:
    """业主心理预期价回退逻辑：expected_price 缺失时用 total_price（与 admin 总价列一致）."""

    def test_prefers_expected_price(self) -> None:
        lead = SimpleNamespace(expected_price=300.0, total_price=350.0)
        assert _effective_expected_price(lead) == 300.0

    def test_falls_back_to_total_price(self) -> None:
        lead = SimpleNamespace(expected_price=None, total_price=350.0)
        assert _effective_expected_price(lead) == 350.0

    def test_none_when_both_missing(self) -> None:
        lead = SimpleNamespace(expected_price=None, total_price=None)
        assert _effective_expected_price(lead) is None


class TestPublicLeadDetailEvalMerged:
    """C 端估价详情 follow_ups 应并入出评估价的意见摘要."""

    def test_eval_remark_merged_into_follow_ups(
        self,
        c_end_client: TestClient,
        backend_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """出评估价后，/public/leads/{id} 的 follow_ups 出现 method=evaluation 的合成跟进项."""
        session: Session = seeded_db["session"]
        # 创建归属 C 端用户（customer-user）自己的线索
        lead = Lead(
            id="main-content-lead",
            community_name="回迁小区",
            floor_info="3/6层",
            creator_id="customer-user",
            status=LeadStatus.PENDING_VISIT,
        )
        session.add(lead)
        session.commit()

        # 后台出评估价，写入意见摘要
        r = backend_client.post(
            f"/api/v1/leads/{lead.id}/evaluations",
            json={"eval_price": 420.0, "remark": "溢价偏高，建议以评估价挂牌"},
        )
        assert r.status_code == 201

        resp = c_end_client.get(f"/api/v1/public/leads/{lead.id}")
        assert resp.status_code == 200
        follow_ups = resp.json()["follow_ups"]
        assert any(
            fu["method"] == "evaluation" and "评估价 420" in fu["content"] and "溢价偏高" in fu["content"]
            for fu in follow_ups
        )
