"""「我的客户」测试局部配置.

提供：
- ``c_users``：员工侧（customer 角色持 C 端令牌）与外部客户测试用户；
- ``c_client_factory``：C 端令牌（aud=c）TestClient 工厂；
- ``customer_user`` / ``c_end_client``：C 端员工侧固定用户及其已认证客户端；
- ``backend_client`` / ``normal_user_client``：后台管理端与普通用户已认证客户端（含 CSRF 头）；
- ``my_customers_data``：跨 4 模块的自建测试线索数据。

依赖根 conftest 的 PostgreSQL SAVEPOINT 隔离基建（测试数据随外层事务
回滚自动清理，不污染开发库），不改变其既有行为。
"""

import uuid
from collections.abc import Callable, Generator
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from models import Lead, ProjectBooking, RecruitLead, RecruitLeadStatus, Role, User
from utils.auth import AUDIENCE_ADMIN, AUDIENCE_C, create_access_token, get_password_hash
from utils.crypto import hash_phone


def _reset_dependency_overrides(app: FastAPI, previous_overrides: dict[Any, Any]) -> None:
    """清空测试期间新增的依赖 override，并恢复 fixture 启动前已存在的 override.

    直接 ``clear()`` 会连原有的 override 一起清掉，造成跨测试污染；
    快照-恢复语义保证只移除本 fixture 及被测代码新增的部分。

    """
    app.dependency_overrides.clear()
    app.dependency_overrides.update(previous_overrides)


@pytest.fixture
def c_users(seeded_db: dict[str, Any]) -> dict[str, User]:
    """创建「我的客户」测试用户（均持 customer 角色，小程序员工侧走 C 端令牌）.

    - a / b：两名互不归属的员工侧用户（归属过滤/越权 404 用）；
    - customer：外部客户用户（估价线索 creator，携带手机号供解密断言）。
    """
    session: Session = seeded_db["session"]
    customer_role = session.query(Role).filter(Role.code == "customer").one()

    def _make_user(username: str, nickname: str, phone: str | None = None) -> User:
        return User(
            id=str(uuid.uuid4()),
            username=username,
            # 测试种子密码随机生成，避免硬编码账号口令
            password=get_password_hash(f"pw-{uuid.uuid4().hex}"),
            nickname=nickname,
            role_id=customer_role.id,
            status="active",
            phone=phone,
            phone_hash=hash_phone(phone) if phone else None,
        )

    users = {
        "a": _make_user(f"mycust-a-{uuid.uuid4().hex[:8]}", "员工A"),
        "b": _make_user(f"mycust-b-{uuid.uuid4().hex[:8]}", "员工B"),
        "customer": _make_user(f"mycust-c-{uuid.uuid4().hex[:8]}", "客户小明", phone="13800001111"),
    }
    session.add_all(users.values())
    session.commit()
    return users


@pytest.fixture
def c_client_factory(seeded_db: dict[str, Any]) -> Generator[Callable[[User], TestClient], None, None]:
    """C 端 TestClient 工厂：签发 aud=c 令牌并以 ``c_access_token`` cookie 携带."""
    from main import app

    session: Session = seeded_db["session"]

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    previous_overrides = dict(app.dependency_overrides)
    app.dependency_overrides[db.get_db] = _override_get_db

    def _factory(user: User) -> TestClient:
        token = create_access_token(
            data={"sub": user.id, "role": "customer", "ver": user.token_version},
            audience=AUDIENCE_C,
        )
        # Cookie 认证的非安全方法（POST/PUT）须携带 X-Requested-With 过 CSRF 中间件
        return TestClient(
            app,
            cookies={"c_access_token": token},
            headers={"X-Requested-With": "XMLHttpRequest"},
        )

    yield _factory
    _reset_dependency_overrides(app, previous_overrides)


def _make_client(session: Session, cookies: dict[str, str]) -> Generator[TestClient, None, None]:
    """构造 TestClient 的生成器 helper：覆盖 get_db 并按 cookies 携带认证.

    供测试 fixture 内 ``yield from _make_client(session, {...})`` 复用
    （与 ``c_client_factory`` 等同构：dependency_overrides + CSRF 头）。

    """
    from main import app

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    previous_overrides = dict(app.dependency_overrides)
    app.dependency_overrides[db.get_db] = _override_get_db
    # Cookie 认证的非安全方法（POST/PUT）须携带 X-Requested-With 过 CSRF 中间件
    yield TestClient(
        app,
        cookies=cookies,
        headers={"X-Requested-With": "XMLHttpRequest"},
    )
    _reset_dependency_overrides(app, previous_overrides)


@pytest.fixture
def customer_user(seeded_db: dict[str, Any]) -> User:
    """C 端员工侧测试用户（customer 角色，固定 id 供测试造数字面量对齐）."""
    session: Session = seeded_db["session"]
    customer_role = session.query(Role).filter(Role.code == "customer").one()
    user = User(
        id="customer-user",
        username="customer_user",
        # 测试种子密码随机生成，避免硬编码账号口令
        password=get_password_hash(f"pw-{uuid.uuid4().hex}"),
        nickname="分享员工",
        role_id=customer_role.id,
        status="active",
    )
    session.add(user)
    session.commit()
    return user


@pytest.fixture
def c_end_client(seeded_db: dict[str, Any], customer_user: User) -> Generator[TestClient, None, None]:
    """已认证 C 端员工 TestClient（c_access_token cookie，登录主体 = customer_user）."""
    from main import app

    session: Session = seeded_db["session"]

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    previous_overrides = dict(app.dependency_overrides)
    app.dependency_overrides[db.get_db] = _override_get_db
    token = create_access_token(
        data={"sub": customer_user.id, "role": "customer", "ver": customer_user.token_version},
        audience=AUDIENCE_C,
    )
    # Cookie 认证的非安全方法（POST/PUT）须携带 X-Requested-With 过 CSRF 中间件
    yield TestClient(
        app,
        cookies={"c_access_token": token},
        headers={"X-Requested-With": "XMLHttpRequest"},
    )
    _reset_dependency_overrides(app, previous_overrides)


@pytest.fixture
def backend_client(seeded_db: dict[str, Any]) -> Generator[TestClient, None, None]:
    """后台管理端已认证 TestClient（access_token cookie + CSRF 头，admin 角色）."""
    from main import app

    session: Session = seeded_db["session"]
    admin_user = seeded_db["users"]["admin"]

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    previous_overrides = dict(app.dependency_overrides)
    app.dependency_overrides[db.get_db] = _override_get_db
    token = create_access_token(
        data={"sub": admin_user.id, "role": "admin", "ver": admin_user.token_version},
        audience=AUDIENCE_ADMIN,
    )
    # Cookie 认证的非安全方法（POST/PUT）须携带 X-Requested-With 过 CSRF 中间件
    yield TestClient(
        app,
        cookies={"access_token": token},
        headers={"X-Requested-With": "XMLHttpRequest"},
    )
    _reset_dependency_overrides(app, previous_overrides)


@pytest.fixture
def normal_user_client(seeded_db: dict[str, Any]) -> Generator[TestClient, None, None]:
    """普通用户已认证 TestClient（access_token cookie + CSRF 头，权限 403 场景）."""
    from main import app

    session: Session = seeded_db["session"]
    normal_user = seeded_db["users"]["normal"]

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    previous_overrides = dict(app.dependency_overrides)
    app.dependency_overrides[db.get_db] = _override_get_db
    token = create_access_token(
        data={"sub": normal_user.id, "role": "user", "ver": normal_user.token_version},
        audience=AUDIENCE_ADMIN,
    )
    # Cookie 认证的非安全方法（POST/PUT）须携带 X-Requested-With 过 CSRF 中间件
    yield TestClient(
        app,
        cookies={"access_token": token},
        headers={"X-Requested-With": "XMLHttpRequest"},
    )
    _reset_dependency_overrides(app, previous_overrides)


@pytest.fixture
def customer_audience_token(seeded_db: dict[str, Any], customer_user: User) -> str:
    """C 端受众 Token 字符串（aud=c，供 Authorization Header 隔离测试）."""
    return create_access_token(
        data={"sub": customer_user.id, "role": "customer", "ver": customer_user.token_version},
        audience=AUDIENCE_C,
    )


@pytest.fixture
def admin_audience_token(seeded_db: dict[str, Any]) -> str:
    """后台受众 Token 字符串（aud=admin，供 Authorization Header 隔离测试）."""
    admin_user = seeded_db["users"]["admin"]
    return create_access_token(
        data={"sub": admin_user.id, "role": "admin", "ver": admin_user.token_version},
        audience=AUDIENCE_ADMIN,
    )


@pytest.fixture
def dual_login_client(
    seeded_db: dict[str, Any],
    customer_user: User,
) -> Generator[TestClient, None, None]:
    """同时携带后台与 C 端两类 Cookie 的 TestClient（双端登录隔离测试）."""
    from main import app

    session: Session = seeded_db["session"]
    admin_user = seeded_db["users"]["admin"]
    admin_token = create_access_token(
        data={"sub": admin_user.id, "role": "admin", "ver": admin_user.token_version},
        audience=AUDIENCE_ADMIN,
    )
    c_token = create_access_token(
        data={"sub": customer_user.id, "role": "customer", "ver": customer_user.token_version},
        audience=AUDIENCE_C,
    )

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    previous_overrides = dict(app.dependency_overrides)
    app.dependency_overrides[db.get_db] = _override_get_db
    # Cookie 认证的非安全方法（POST/PUT）须携带 X-Requested-With 过 CSRF 中间件
    yield TestClient(
        app,
        cookies={"access_token": admin_token, "c_access_token": c_token},
        headers={"X-Requested-With": "XMLHttpRequest"},
    )
    _reset_dependency_overrides(app, previous_overrides)


@pytest.fixture
def my_customers_data(c_users: dict[str, User], seeded_db: dict[str, Any]) -> dict[str, Any]:
    """构建 A 名下跨 4 模块线索与他人/内部创建者干扰数据（随测试事务回滚清理）.

    A 的线索（8 条，badge/counts 断言口径）：
    - 估价 v1 / v4（new）、房源单 s1（new）、预约 1 条（恒 new）；
    - 招募 r1（new）/ r2（contacted）/ r_converted（converted）/ r_eliminated（eliminated）。
    干扰数据：B 的估价与招募线索、内部员工（admin）创建且归属 A 的估价线索
    （列表口径剔除，不出现也不计数）。
    """
    session: Session = seeded_db["session"]
    a = c_users["a"]
    b = c_users["b"]
    customer = c_users["customer"]
    admin_id: str = seeded_db["users"]["admin"].id

    def _valuation(referrer: User, creator_id: str, source_property_id: int | None = None) -> Lead:
        lead = Lead(
            community_name="阳光花园",
            layout="2室1厅",
            area=89.5,
            expected_price=300.0,
            creator_id=creator_id,
            referrer_id=referrer.id,
            source_property_id=source_property_id,
        )
        session.add(lead)
        return lead

    def _recruit(referrer: User, status: RecruitLeadStatus, phone: str) -> RecruitLead:
        lead = RecruitLead(
            phone=phone,
            phone_hash=hash_phone(phone),
            main_business_area="滨江商圈",
            referrer_employee_id=referrer.id,
            status=status,
        )
        session.add(lead)
        return lead

    v1 = _valuation(a, customer.id)
    v4 = _valuation(a, customer.id)
    s1 = _valuation(a, customer.id, source_property_id=42)
    v_b = _valuation(b, customer.id)
    v_internal = _valuation(a, admin_id)

    r1 = _recruit(a, RecruitLeadStatus.NEW, "13900000001")
    r2 = _recruit(a, RecruitLeadStatus.CONTACTED, "13900000002")
    r_converted = _recruit(a, RecruitLeadStatus.CONVERTED, "13900000003")
    r_eliminated = _recruit(a, RecruitLeadStatus.ELIMINATED, "13900000004")
    r_b = _recruit(b, RecruitLeadStatus.NEW, "13900000005")

    booking = ProjectBooking(
        marketing_project_id=9001,
        user_id=customer.id,
        phone="13700000001",
        phone_hash=hash_phone("13700000001"),
        referrer_user_id=a.id,
    )
    session.add(booking)
    session.commit()

    return {
        "valuation_id": v1.id,
        "valuation_spare_id": v4.id,
        "sheet_id": s1.id,
        "valuation_b_id": v_b.id,
        "valuation_internal_id": v_internal.id,
        "recruit_new_id": r1.id,
        "recruit_contacted_id": r2.id,
        "recruit_converted_id": r_converted.id,
        "recruit_eliminated_id": r_eliminated.id,
        "recruit_b_id": r_b.id,
        "booking_id": str(booking.id),
        "customer_phone": "13800001111",
        "recruit_new_phone": "13900000001",
        "booking_phone": "13700000001",
    }
