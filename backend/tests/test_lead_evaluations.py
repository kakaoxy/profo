"""线索评估历史接口测试.

覆盖 LeadEvalService 与 /api/v1/leads/{lead_id}/evaluations 端点：
- 创建评估记录（同步更新 Lead.eval_price）
- 线索不存在 / 已软删除时 404
- 获取评估历史（按时间倒序）
- 输入校验（eval_price <= 0 → 422）
"""

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy.orm import Session

from models.common import LeadStatus
from models.lead import Lead, LeadEvalHistory
from services.leads.internal.evaluation import LeadEvalService
from services.system.exceptions import ResourceNotFoundError

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_lead(db: Session, *, is_deleted: bool = False) -> Lead:
    """创建并持久化一条线索."""
    lead = Lead(
        id=str(uuid.uuid4()),
        community_name="测试小区",
        status=LeadStatus.PENDING_VISIT,
        is_deleted=is_deleted,
    )
    db.add(lead)
    db.flush()
    return lead


# ---------------------------------------------------------------------------
# Service-level tests
# ---------------------------------------------------------------------------


class TestLeadEvalServiceCreate:
    """LeadEvalService.create_evaluation 测试."""

    def test_creates_record_and_updates_lead_eval_price(self, db_session: Session) -> None:
        """创建评估记录后，Lead.eval_price 应同步更新."""
        lead = _make_lead(db_session)
        db_session.commit()

        svc = LeadEvalService(db_session)
        rec = svc.create_evaluation(
            lead_id=lead.id,
            eval_price=350.5,
            remark="首次评估",
            evaluator_id="evaluator-1",
        )

        assert rec.lead_id == lead.id
        assert float(rec.eval_price) == 350.5
        assert rec.remark == "首次评估"
        assert rec.evaluator_id == "evaluator-1"

        db_session.refresh(lead)
        assert float(lead.eval_price) == 350.5  # type: ignore[arg-type]

    def test_raises_not_found_for_nonexistent_lead(self, db_session: Session) -> None:
        """线索不存在时应抛出 ResourceNotFoundError."""
        svc = LeadEvalService(db_session)
        with pytest.raises(ResourceNotFoundError):
            svc.create_evaluation(
                lead_id="nonexistent-id",
                eval_price=100.0,
                remark=None,
                evaluator_id="evaluator-1",
            )

    def test_raises_not_found_for_soft_deleted_lead(self, db_session: Session) -> None:
        """已软删除的线索应视为不存在."""
        lead = _make_lead(db_session, is_deleted=True)
        db_session.commit()

        svc = LeadEvalService(db_session)
        with pytest.raises(ResourceNotFoundError):
            svc.create_evaluation(
                lead_id=lead.id,
                eval_price=200.0,
                remark=None,
                evaluator_id="evaluator-1",
            )

    def test_multiple_evaluations_update_eval_price(self, db_session: Session) -> None:
        """多次评估后 Lead.eval_price 应为最新值."""
        lead = _make_lead(db_session)
        db_session.commit()

        svc = LeadEvalService(db_session)
        svc.create_evaluation(lead_id=lead.id, eval_price=300.0, remark=None, evaluator_id="e1")
        svc.create_evaluation(lead_id=lead.id, eval_price=320.0, remark="调价", evaluator_id="e2")

        db_session.refresh(lead)
        assert float(lead.eval_price) == 320.0  # type: ignore[arg-type]


class TestLeadEvalServiceGet:
    """LeadEvalService.get_evaluations 测试."""

    def test_returns_empty_list_when_no_evaluations(self, db_session: Session) -> None:
        """无评估记录时返回空列表."""
        lead = _make_lead(db_session)
        db_session.commit()

        svc = LeadEvalService(db_session)
        result = svc.get_evaluations(lead.id)
        assert result == []

    def test_returns_records_ordered_by_evaluated_at_desc(self, db_session: Session) -> None:
        """评估记录应按 evaluated_at 倒序返回."""
        lead = _make_lead(db_session)
        db_session.commit()

        # 直接插入记录以控制时间顺序
        older = LeadEvalHistory(
            id=str(uuid.uuid4()),
            lead_id=lead.id,
            eval_price=300,
            evaluator_id="e1",
            evaluated_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
        )
        newer = LeadEvalHistory(
            id=str(uuid.uuid4()),
            lead_id=lead.id,
            eval_price=350,
            evaluator_id="e2",
            evaluated_at=datetime(2025, 6, 1, tzinfo=timezone.utc),
        )
        db_session.add_all([older, newer])
        db_session.commit()

        svc = LeadEvalService(db_session)
        result = svc.get_evaluations(lead.id)

        assert len(result) == 2
        assert result[0].id == newer.id
        assert result[1].id == older.id


# ---------------------------------------------------------------------------
# Endpoint-level tests
# ---------------------------------------------------------------------------


class TestEvaluationEndpoints:
    """/api/v1/leads/{lead_id}/evaluations 端点测试."""

    def test_create_evaluation_returns_201(self, backend_client, seeded_db) -> None:
        """POST 创建评估记录应返回 201 与完整响应体."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session)
        session.commit()

        resp = backend_client.post(
            f"/api/v1/leads/{lead.id}/evaluations",
            json={"eval_price": 420.0, "remark": "端点测试"},
        )

        assert resp.status_code == 201
        body = resp.json()
        assert body["lead_id"] == lead.id
        assert body["eval_price"] == 420.0
        assert body["remark"] == "端点测试"
        assert "id" in body
        assert "evaluated_at" in body

    def test_create_evaluation_404_for_missing_lead(self, backend_client, seeded_db) -> None:
        """线索不存在时 POST 应返回 404."""
        resp = backend_client.post(
            "/api/v1/leads/nonexistent-id/evaluations",
            json={"eval_price": 100.0},
        )
        assert resp.status_code == 404

    def test_create_evaluation_422_for_invalid_price(self, backend_client, seeded_db) -> None:
        """eval_price <= 0 时应返回 422 校验错误."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session)
        session.commit()

        resp = backend_client.post(
            f"/api/v1/leads/{lead.id}/evaluations",
            json={"eval_price": -10},
        )
        assert resp.status_code == 422

    def test_get_evaluations_returns_list(self, backend_client, seeded_db) -> None:
        """GET 应返回评估历史列表."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session)
        session.commit()

        # 先创建一条评估记录
        backend_client.post(
            f"/api/v1/leads/{lead.id}/evaluations",
            json={"eval_price": 500.0, "remark": "初始"},
        )

        resp = backend_client.get(f"/api/v1/leads/{lead.id}/evaluations")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["eval_price"] == 500.0

    def test_get_evaluations_empty_for_new_lead(self, backend_client, seeded_db) -> None:
        """无线索评估记录时 GET 应返回空列表."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session)
        session.commit()

        resp = backend_client.get(f"/api/v1/leads/{lead.id}/evaluations")
        assert resp.status_code == 200
        assert resp.json() == []
