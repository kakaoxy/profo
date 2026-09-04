"""报表测试 fixtures.

提供 ~63 条样本数据 (3 商圈 × 3 小区 × (5 成交 + 2 在售))，
确保 PERCENTILE_CONT 动态分段触发 (成交样本量 45 ≥ 30)。

设计决策
--------
- **TestClient (同步) vs httpx.AsyncClient + ASGITransport**:
  spec 文档建议使用 ``httpx.AsyncClient + ASGITransport``，但项目现有测试基础设施
  (``backend/conftest.py``、``backend/tests/conftest.py``) 一致使用
  ``fastapi.testclient.TestClient`` (同步) + ``db_session`` SAVEPOINT 隔离。
  遵循 AGENTS.md §1 "模式冲突: 选更契合项目者，说明理由，禁止混合"，
  选择 TestClient 与项目惯例保持一致，避免破坏现有 fixture 链路。
- **缓存隔离**: ``services.reports.cache.cached_report`` 装饰器在模块层维护 5 分钟
  内存缓存，缓存 key 含 Session repr (内存地址)。虽然不同测试的 Session 实例不同
  (cache key 自然不同)，但显式清空保证可读性与可重复性，避免极端情况下内存地址
  复用导致的跨测试污染。
- **数据隔离**: 复用根 conftest 的 ``db_session`` (连接级事务 + SAVEPOINT)，
  测试结束自动回滚，无需手动清理。
"""

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
from models.common import PropertyStatus
from models.property.community import Community
from models.property.property import PropertyCurrent
from services.reports.cache import invalidate_reports_cache
from utils.auth import AUDIENCE_ADMIN, create_access_token

# 商圈 → 行政区映射 (上海实际地理关系，避免全部塞入同一行政区)
_BC_DISTRICT_MAP: dict[str, str] = {
    "徐家汇": "徐汇区",
    "五角场": "杨浦区",
    "人民广场": "黄浦区",
}

# 楼层级别循环表 (与 j 取模对应)
_FLOOR_LEVELS: list[str] = ["低楼层", "中楼层", "高楼层"]


class _FakeRedis:
    """最小化内存 Redis，仅支持 cache 装饰器用到的操作（测试隔离用）.

    替代真实 Redis 连接，使报表单测无需外部 Redis 服务。
    """

    def __init__(self) -> None:
        self._store: dict[str, bytes] = {}

    def ping(self) -> bool:
        return True

    def get(self, key: str) -> bytes | None:
        return self._store.get(key)

    def set(self, key: str, value: bytes, ex: int | None = None) -> None:
        self._store[key] = value

    def delete(self, *keys: str) -> int:
        n = 0
        for k in keys:
            if k in self._store:
                del self._store[k]
                n += 1
        return n

    def scan(self, cursor: int = 0, match: str | None = None, count: int | None = None):
        import fnmatch

        matched = [k for k in self._store if match is None or fnmatch.fnmatch(k, match)]
        return 0, matched


@pytest.fixture(autouse=True)
def _clear_reports_cache(monkeypatch: pytest.MonkeyPatch) -> Generator[None, None, None]:
    """每个测试用独立内存 Redis 并清空缓存，避免跨测试污染.

    用 _FakeRedis 替换 services.reports.cache.get_redis_client，使报表单测
    不依赖真实 Redis（cached_report 装饰器与 invalidate_reports_cache 均通过
    该模块级名字调用，patch 后同时覆盖）。autouse=True 对引用本 conftest 的
    测试生效。
    """
    fake = _FakeRedis()
    monkeypatch.setattr("services.reports.cache.get_redis_client", lambda: fake)
    invalidate_reports_cache()
    yield
    invalidate_reports_cache()


@pytest.fixture
def reports_sample_data(db_session: Session) -> dict[str, Any]:
    """插入 ~63 条样本数据: 3 商圈 × 3 小区 × (5 成交 + 2 在售).

    成交记录覆盖 4 种户型 / 3 种楼层 / 多价格段 (200-400+ 万)；
    在售记录统一 3室2厅中楼层 400 万挂牌。

    成交 ``sold_date`` 分布在近 28 天内 (j*7 天)，确保 ``range=4w`` 默认窗口
    可命中全部 45 条成交记录，触发 PERCENTILE_CONT 动态分段 (≥30 样本)。

    Returns:
        dict: ``{"communities": list[Community], "properties": list[PropertyCurrent]}``

    """
    bc_list = ["徐家汇", "五角场", "人民广场"]
    communities: list[Community] = []
    for bc in bc_list:
        district = _BC_DISTRICT_MAP[bc]
        communities.extend(
            Community(
                id=str(uuid.uuid4()),
                name=f"小区-{bc}-{i}",
                district=district,
                business_circle=bc,
                is_active=True,
                total_properties=7,
            )
            for i in range(3)
        )
    db_session.add_all(communities)
    db_session.commit()

    properties: list[PropertyCurrent] = []
    now = datetime.now(timezone.utc)
    for i, community in enumerate(communities):
        # 5 条成交记录: j=0..4 → rooms=1,2,3,4,1; 楼层循环; 价格 200+i*20 起
        # sold_date 用 j*5 天分布 (j=4 → 20 天), 全部落在默认 range=4w (28 天) 窗口内
        properties.extend(
            PropertyCurrent(
                data_source="链家" if j % 2 == 0 else "贝壳",
                source_property_id=f"src-{i}-{j}",
                community_id=community.id,
                status=PropertyStatus.SOLD,
                rooms=(j % 4) + 1,
                halls=2,
                floor_original=f"{j + 1}楼",
                floor_level=_FLOOR_LEVELS[j % 3],
                orientation="南北",
                build_area=Decimal(80) + Decimal(j * 10),
                sold_price_wan=Decimal(200 + j * 50 + i * 20),
                sold_date=now - timedelta(days=j * 5),
                is_active=True,
            )
            for j in range(5)
        )
        # 2 条在售记录: 统一 3室2厅中楼层 400 万
        properties.extend(
            PropertyCurrent(
                data_source="链家",
                source_property_id=f"src-onsale-{i}-{j}",
                community_id=community.id,
                status=PropertyStatus.FOR_SALE,
                rooms=3,
                halls=2,
                floor_original="中楼层",
                floor_level="中楼层",
                orientation="南北",
                build_area=Decimal(90),
                listed_price_wan=Decimal(400),
                is_active=True,
            )
            for j in range(2)
        )
    db_session.add_all(properties)
    db_session.commit()
    return {"communities": communities, "properties": properties}


@pytest.fixture
def reports_client(
    seeded_db: dict[str, Any],
    reports_sample_data: dict[str, Any],
) -> Generator[TestClient, None, None]:
    """已认证 + 含报表样本数据的客户端.

    - Token 携带 ``aud=admin`` 与 ``ver=token_version``，通过后台接口鉴权
    - 覆盖 ``db.get_db`` 依赖，复用 ``seeded_db["session"]`` (与样本数据同 session)
    - 设置 ``X-Requested-With`` 头满足 CSRF 中间件要求
    """
    session = seeded_db["session"]
    admin_user = seeded_db["users"]["admin"]

    token = create_access_token(
        data={"sub": admin_user.id, "role": "admin", "ver": admin_user.token_version},
        audience=AUDIENCE_ADMIN,
    )

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    client = TestClient(app, cookies={"access_token": token})
    client.headers["X-Requested-With"] = "XMLHttpRequest"
    yield client
    app.dependency_overrides.clear()


@pytest.fixture
def reports_noauth_client(seeded_db: dict[str, Any]) -> Generator[TestClient, None, None]:
    """未认证客户端 (无 access_token cookie)，用于 401 测试.

    仍覆盖 ``db.get_db`` 避免连接非测试库；CSRF 中间件对 GET 不校验头。
    """
    session = seeded_db["session"]

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


@pytest.fixture
def reports_no_property_perm_client(
    seeded_db: dict[str, Any],
    reports_sample_data: dict[str, Any],
) -> Generator[TestClient, None, None]:
    """已认证但无 property:read 权限的客户端 (customer 角色)，用于 403 测试.

    创建一个 customer 角色用户 (customer 角色默认无 property:read 权限，
    见 migrations._ROLE_PERMISSIONS_SEED)，签发 aud=admin token 访问后台接口。
    """
    from models import Role, User
    from utils.auth import get_password_hash

    session = seeded_db["session"]
    customer_role = session.query(Role).filter(Role.code == "customer").first()
    if customer_role is None:
        msg = "customer 角色未在 seeded_db 中创建"
        raise RuntimeError(msg)

    no_perm_user = User(
        id="reports-no-perm-user",
        username="reports_no_perm",
        password=get_password_hash("NoPerm123!"),
        nickname="无权限用户",
        role_id=customer_role.id,
        status="active",
    )
    session.add(no_perm_user)
    session.commit()
    session.refresh(no_perm_user)

    token = create_access_token(
        data={"sub": no_perm_user.id, "role": "customer", "ver": no_perm_user.token_version},
        audience=AUDIENCE_ADMIN,
    )

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    client = TestClient(app, cookies={"access_token": token})
    client.headers["X-Requested-With"] = "XMLHttpRequest"
    yield client
    app.dependency_overrides.clear()
