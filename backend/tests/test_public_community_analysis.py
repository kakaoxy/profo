"""C端公开小区分析端点集成测试.

覆盖 ``routers/public/communities.py`` 的 ``GET /api/v1/public/communities/{community_id}/analysis``：
- 无 C 端令牌 → 401
- C 端用户未绑定手机号 → 403（服务端强制门槛）
- 无效/停用社区 → 404
- 正常聚合 → 200（含 community/kpi/trend/price_distribution/rooms_distribution/floor_distribution/main_layout）
- range 与 trend_dim 参数生效
- 非法 range → 422（统一错误响应格式）

测试策略：
- 使用 tests/conftest.py 的 ``c_end_phone_client``（c_access_token cookie + aud=c token，已绑手机号）通过 C 端鉴权
- 复用 ``tests.conftest_reports.reports_sample_data``（3 商圈 × 3 小区 × (5 成交 + 2 在售)）
- 本地 autouse fixture 隔离报表缓存（等效 conftest_reports._clear_reports_cache），
  因为后者定义在非 conftest 命名文件（conftest_reports.py）中，autouse 不会自动生效
"""

# ruff: noqa: F811
# 本文件通过参数名注入 pytest fixtures (reports_sample_data / c_end_phone_client 等)。
# 参数名与导入名同名会触发 ruff F811 误报，故文件级抑制。

import uuid
from collections.abc import Generator
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from main import app
from models import Role, User
from models.common import PropertyStatus
from models.property.community import Community
from models.property.property import PropertyCurrent
from tests.conftest_reports import reports_sample_data  # noqa: F401
from utils.auth import AUDIENCE_C, create_access_token, get_password_hash
from utils.crypto import hash_phone

# 公开小区分析端点基础路径
_BASE = "/api/v1/public/communities"


@pytest.fixture(autouse=True)
def _isolate_reports_cache(monkeypatch: pytest.MonkeyPatch) -> Generator[None, None, None]:
    """每个测试用独立内存 Redis 并清空报表缓存，避免跨测试污染."""
    from services.reports.cache import invalidate_reports_cache
    from tests.conftest_reports import _FakeRedis

    fake = _FakeRedis()
    monkeypatch.setattr("services.reports.cache.get_redis_client", lambda: fake)
    invalidate_reports_cache()
    yield
    invalidate_reports_cache()


@pytest.fixture
def public_analysis_noauth_client(seeded_db: dict[str, Any]) -> Generator[TestClient, None, None]:
    """未认证客户端（无 C 端 token cookie），用于 401 测试."""
    session = seeded_db["session"]

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


@pytest.fixture
def customer_no_phone_token(seeded_db: dict[str, Any]) -> str:
    """未绑定手机号的 C 端用户 Token（aud=c）."""
    session = seeded_db["session"]
    customer_role = session.query(Role).filter(Role.code == "customer").first()
    user = User(
        id="customer-user-no-phone",
        username="customer_no_phone",
        password=get_password_hash("Customer1!"),
        nickname="C端未绑定",
        role_id=customer_role.id,
        status="active",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return create_access_token(
        data={"sub": user.id, "role": "customer", "ver": user.token_version},
        audience=AUDIENCE_C,
    )


@pytest.fixture
def c_end_no_phone_client(
    seeded_db: dict[str, Any],
    customer_no_phone_token: str,
) -> Generator[TestClient, None, None]:
    """未绑定手机号用户的 C 端客户端（c_access_token cookie）."""
    session = seeded_db["session"]

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    client = TestClient(app, cookies={"c_access_token": customer_no_phone_token})
    yield client
    app.dependency_overrides.clear()


@pytest.fixture
def c_end_phone_client(
    seeded_db: dict[str, Any],
    customer_user: User,
    c_end_client: TestClient,
) -> Generator[TestClient, None, None]:
    """已绑定手机号用户的 C 端客户端（小区分析接口有手机号门槛，正向用例需先绑定）."""
    session = seeded_db["session"]
    customer_user.phone = "13800138001"
    customer_user.phone_hash = hash_phone("13800138001")
    session.commit()
    return c_end_client


# ─── 鉴权 ────────────────────────────────────────────────────────────────


def test_public_community_analysis_requires_auth(
    public_analysis_noauth_client: TestClient,
    reports_sample_data: dict[str, Any],
) -> None:
    """无 C 端令牌 → 401（auth 依赖在社区校验之前解析）."""
    target = reports_sample_data["communities"][0]
    resp = public_analysis_noauth_client.get(f"{_BASE}/{target.id}/analysis")

    assert resp.status_code == 401, f"期望 401，实际 {resp.status_code} {resp.text}"
    body = resp.json()
    assert body["code"] == 401
    assert "凭据" in body["message"]


def test_public_community_analysis_requires_phone(
    c_end_no_phone_client: TestClient,
    reports_sample_data: dict[str, Any],
) -> None:
    """C 端用户未绑定手机号 → 403（服务端强制门槛）."""
    target = reports_sample_data["communities"][0]
    resp = c_end_no_phone_client.get(f"{_BASE}/{target.id}/analysis")

    assert resp.status_code == 403, f"期望 403，实际 {resp.status_code} {resp.text}"
    body = resp.json()
    assert body["code"] == 403
    assert "手机号" in body["message"]


# ─── 社区校验 ────────────────────────────────────────────────────────────


def test_public_community_analysis_not_found(c_end_phone_client: TestClient) -> None:
    """不存在的社区 ID → 404."""
    resp = c_end_phone_client.get(f"{_BASE}/non-existent-community-id/analysis")

    assert resp.status_code == 404, f"期望 404，实际 {resp.status_code} {resp.text}"
    body = resp.json()
    assert body["code"] == 404
    assert "小区" in body["message"] or "不存在" in body["message"]


def test_public_community_analysis_inactive_community(
    c_end_phone_client: TestClient,
    db_session: Session,
    reports_sample_data: dict[str, Any],
) -> None:
    """停用社区（is_active=False）→ 404."""
    target = reports_sample_data["communities"][0]
    db_session.query(Community).filter(Community.id == target.id).update({"is_active": False})
    db_session.commit()

    resp = c_end_phone_client.get(f"{_BASE}/{target.id}/analysis")

    assert resp.status_code == 404, f"期望 404，实际 {resp.status_code} {resp.text}"
    body = resp.json()
    assert body["code"] == 404


# ─── 正常聚合 ────────────────────────────────────────────────────────────


def test_public_community_analysis_success(
    c_end_phone_client: TestClient,
    reports_sample_data: dict[str, Any],
) -> None:
    """存在的社区 ID 返回完整聚合响应（7 个顶层字段齐全）."""
    target = reports_sample_data["communities"][0]
    resp = c_end_phone_client.get(f"{_BASE}/{target.id}/analysis")

    assert resp.status_code == 200, f"期望 200，实际 {resp.status_code} {resp.text}"
    data = resp.json()

    expected_keys = {
        "community",
        "kpi",
        "trend",
        "price_distribution",
        "rooms_distribution",
        "floor_distribution",
        "main_layout",
    }
    assert set(data.keys()) == expected_keys

    # community 基本信息
    community_info: dict[str, Any] = data["community"]
    assert community_info["community_id"] == target.id
    assert community_info["community_name"] == target.name
    assert community_info["business_circle"] == target.business_circle

    # kpi 4 卡片
    kpi: dict[str, Any] = data["kpi"]
    assert set(kpi.keys()) == {"sold_count", "avg_price_wan", "avg_unit_price", "on_sale_count"}

    # trend 非空
    trend: list[dict[str, Any]] = data["trend"]
    assert isinstance(trend, list)
    assert len(trend) >= 1

    # 三个分布结构
    for dist_key in ("price_distribution", "rooms_distribution", "floor_distribution"):
        dist: dict[str, Any] = data[dist_key]
        assert set(dist.keys()) == {"buckets", "total"}
        assert isinstance(dist["buckets"], list)
        assert dist["total"] >= 0

    # main_layout 为 None 或字符串
    assert data["main_layout"] is None or isinstance(data["main_layout"], str)


def test_public_community_analysis_range_param_effective(
    c_end_phone_client: TestClient,
    db_session: Session,
    reports_sample_data: dict[str, Any],
) -> None:
    """验证 range 参数：插入 60 天前成交后，range=4w 排除、range=6m 包含.

    样本小区默认 5 条成交（sold_date 为 now - j*5 天，≤20 天）。补插 1 条 60 天前的成交：
    - range=4w（28 天）→ sold_count=5
    - range=6m（180 天）→ sold_count=6
    """
    target = reports_sample_data["communities"][0]
    now = datetime.now(timezone.utc)
    db_session.add(
        PropertyCurrent(
            data_source="链家",
            source_property_id=f"src-old-{uuid.uuid4()}",
            community_id=target.id,
            status=PropertyStatus.SOLD,
            rooms=3,
            halls=2,
            floor_original="3楼",
            floor_level="中楼层",
            orientation="南北",
            build_area=Decimal(90),
            sold_price_wan=Decimal(300),
            sold_date=now - timedelta(days=60),
            is_active=True,
        )
    )
    db_session.commit()

    resp_4w = c_end_phone_client.get(f"{_BASE}/{target.id}/analysis", params={"range": "4w"})
    assert resp_4w.status_code == 200, f"期望 200，实际 {resp_4w.status_code} {resp_4w.text}"
    assert resp_4w.json()["kpi"]["sold_count"]["value"] == 5, "range=4w 应排除 60 天前成交"

    resp_6m = c_end_phone_client.get(f"{_BASE}/{target.id}/analysis", params={"range": "6m"})
    assert resp_6m.status_code == 200, f"期望 200，实际 {resp_6m.status_code} {resp_6m.text}"
    assert resp_6m.json()["kpi"]["sold_count"]["value"] == 6, "range=6m 应包含 60 天前成交"


def test_public_community_analysis_trend_dim_rooms(
    c_end_phone_client: TestClient,
    reports_sample_data: dict[str, Any],
) -> None:
    """trend_dim=rooms 生效：dim_breakdown 非空且含户型键."""
    target = reports_sample_data["communities"][0]
    resp = c_end_phone_client.get(f"{_BASE}/{target.id}/analysis", params={"trend_dim": "rooms"})

    assert resp.status_code == 200, f"期望 200，实际 {resp.status_code} {resp.text}"
    trend: list[dict[str, Any]] = resp.json()["trend"]
    assert len(trend) >= 1

    has_non_empty = any(point["dim_breakdown"] for point in trend)
    assert has_non_empty, "trend_dim=rooms 应至少有一个周期 dim_breakdown 非空"

    all_keys: set[str] = set()
    for point in trend:
        if point["dim_breakdown"]:
            all_keys.update(point["dim_breakdown"].keys())
    assert {"1室", "2室", "3室", "4室+"}.issubset(all_keys)


def test_public_community_analysis_null_district(
    c_end_phone_client: TestClient,
    db_session: Session,
    reports_sample_data: dict[str, Any],
) -> None:
    """District 为 NULL 的活跃小区 → 200 且 district 返回空串（回归：曾因响应校验失败 500）."""
    target = reports_sample_data["communities"][0]
    db_session.query(Community).filter(Community.id == target.id).update({"district": None})
    db_session.commit()

    resp = c_end_phone_client.get(f"{_BASE}/{target.id}/analysis")

    assert resp.status_code == 200, f"期望 200，实际 {resp.status_code} {resp.text}"
    assert resp.json()["community"]["district"] == ""


def test_public_community_analysis_invalid_range(
    c_end_phone_client: TestClient,
    reports_sample_data: dict[str, Any],
) -> None:
    """非法 range 值 → 422（统一错误响应格式）.

    使用有效社区 ID，确保社区依赖先通过后再触发 range 枚举校验。
    """
    target = reports_sample_data["communities"][0]
    resp = c_end_phone_client.get(f"{_BASE}/{target.id}/analysis", params={"range": "99x"})

    assert resp.status_code == 422, f"期望 422，实际 {resp.status_code} {resp.text}"
    body = resp.json()
    assert body["code"] == 422
