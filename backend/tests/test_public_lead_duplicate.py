"""V06 REQ-M08-005：估价代填按楼盘字典地址查重与二次确认."""

import uuid
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models import BdBuilding, BdRoom, Community, Lead

_PUBLIC_LEADS = "/api/v1/public/leads"


def test_duplicate_dictionary_address_requires_confirmation(
    c_end_client: TestClient,
    seeded_db: dict[str, Any],
) -> None:
    """同户室二次提交 → 409 提示重复；确认后允许再次创建；不强制客户手机号."""
    session: Session = seeded_db["session"]
    community = Community(
        id=str(uuid.uuid4()),
        name="重复地址小区",
        district="浦东",
        business_circle="金杨",
        source="admin",
        is_active=True,
    )
    session.add(community)
    session.flush()
    building = BdBuilding(community_id=community.id, building_no="01", room_count=0)
    session.add(building)
    session.flush()
    room = BdRoom(building_id=building.id, room_no="0101", floor=1)
    session.add(room)
    session.flush()

    payload = {
        "community_name": community.name,
        "community_id": community.id,
        "building_id": building.id,
        "room_id": room.id,
        "floor_info": "1/6层",
        "area": 100.0,
        "expected_price": 300.0,
    }

    first = c_end_client.post(_PUBLIC_LEADS, json=payload)
    assert first.status_code == 201, first.text

    second = c_end_client.post(_PUBLIC_LEADS, json=payload)
    assert second.status_code == 409, second.text
    assert "重复线索" in second.json()["message"]

    confirmed = c_end_client.post(_PUBLIC_LEADS, json={**payload, "confirm_duplicate": True})
    assert confirmed.status_code == 201, confirmed.text

    rows = session.query(Lead).filter(Lead.room_id == room.id, Lead.is_deleted.is_(False)).all()
    assert len(rows) == 2


def test_client_request_id_makes_submission_idempotent(
    c_end_client: TestClient,
    seeded_db: dict[str, Any],
) -> None:
    """REQ-M08-004 分支 5：同一创建人同一 client_request_id 重复提交只落一条线索."""
    session: Session = seeded_db["session"]
    payload = {
        "community_name": "幂等提交小区",
        "floor_info": "3/6层",
        "area": 88.0,
        "expected_price": 260.0,
        "client_request_id": "lead-idem-key-001",
    }

    first = c_end_client.post(_PUBLIC_LEADS, json=payload)
    assert first.status_code == 201, first.text
    second = c_end_client.post(_PUBLIC_LEADS, json=payload)
    assert second.status_code == 201, second.text
    assert second.json()["id"] == first.json()["id"]

    rows = session.query(Lead).filter(Lead.client_request_id == "lead-idem-key-001", Lead.is_deleted.is_(False)).all()
    assert len(rows) == 1

    other = c_end_client.post(_PUBLIC_LEADS, json={**payload, "client_request_id": "lead-idem-key-002"})
    assert other.status_code == 201, other.text
    assert other.json()["id"] != first.json()["id"]
