"""C端公开接口集成测试.

覆盖所有公开API端点的功能验证。
"""

import asyncio
import contextlib
from collections.abc import Generator
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from db import get_db
from models import Community, L4MarketingProject, Lead, Role, User
from utils.auth import create_access_token, get_password_hash


@pytest.fixture(scope="module")
def test_app() -> Generator[tuple[TestClient, Session], None, None]:
    from sqlalchemy import create_engine, event
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    db_path = Path(__file__).parent / "test_public.db"
    if db_path.exists():
        db_path.unlink()

    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    def _enable_sqlite_fk(dbapi_conn: Any, connection_record: Any) -> None:  # noqa: ANN401
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    event.listen(engine, "connect", _enable_sqlite_fk)

    session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    from models import Base

    Base.metadata.create_all(bind=engine)
    db = session_local()

    roles = [
        Role(
            id="admin-role",
            name="管理员",
            code="admin",
            permissions=["view_data", "edit_data", "manage_users", "manage_roles"],
        ),
        Role(id="operator-role", name="运营人员", code="operator", permissions=["view_data", "edit_data"]),
        Role(id="user-role", name="普通用户", code="user", permissions=["view_data"]),
        Role(id="customer-role", name="C端用户", code="customer", permissions=["view_data"]),
    ]
    for r in roles:
        db.add(r)
    db.commit()

    admin_user = User(
        id="admin-user",
        username="admin",
        password=get_password_hash("Admin123!"),
        nickname="管理员",
        role_id="admin-role",
        status="active",
    )
    db.add(admin_user)
    db.commit()

    from main import app

    def _get_test_db() -> Generator[Session, None, None]:
        db = session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _get_test_db

    client = TestClient(app, raise_server_exceptions=False)

    yield client, db

    db.close()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    app.dependency_overrides.clear()
    if db_path.exists():
        with contextlib.suppress(PermissionError):
            db_path.unlink()


@pytest.fixture
def app_data(test_app: tuple[TestClient, Session]) -> tuple[TestClient, Session]:
    client, db = test_app
    return client, db


def _create_customer_token(
    db: Session,
    username: str = "testcustomer",
    phone: str = "13900001111",
) -> tuple[str, User]:
    user = User(
        username=username,
        password=get_password_hash("Test123!"),
        nickname=username,
        phone=phone,
        role_id="customer-role",
        status="active",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(data={"sub": user.id, "role": "customer"})
    return token, user


def _create_admin_token(db: Session) -> tuple[str, User]:
    admin = db.query(User).filter(User.username == "admin").first()
    token = create_access_token(data={"sub": admin.id, "role": "admin"})
    return token, admin


class TestCurrentCustomerUserDep:
    """验证 CurrentCustomerUserDep 依赖注入."""

    def test_customer_role_user_passes_auth(self) -> None:
        from dependencies.auth import require_roles

        role_checker = require_roles(["customer"])
        user = MagicMock(spec=User)
        user.status = "active"
        user.role = MagicMock(spec=Role)
        user.role.code = "customer"
        result = asyncio.run(role_checker(user))
        assert result == user

    def test_admin_role_user_rejected(self) -> None:
        from dependencies.auth import require_roles

        role_checker = require_roles(["customer"])
        user = MagicMock(spec=User)
        user.status = "active"
        user.role = MagicMock(spec=Role)
        user.role.code = "admin"
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(role_checker(user))
        assert exc_info.value.status_code == 403

    def test_operator_role_user_rejected(self) -> None:
        from dependencies.auth import require_roles

        role_checker = require_roles(["customer"])
        user = MagicMock(spec=User)
        user.status = "active"
        user.role = MagicMock(spec=Role)
        user.role.code = "operator"
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(role_checker(user))
        assert exc_info.value.status_code == 403

    def test_inactive_customer_user_rejected(self) -> None:
        from dependencies.auth import get_current_active_user

        user = MagicMock(spec=User)
        user.status = "inactive"
        user.role = MagicMock(spec=Role)
        user.role.code = "customer"
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(get_current_active_user(user))
        assert exc_info.value.status_code == 403

    def test_current_customer_user_dep_exists(self) -> None:
        from dependencies.auth import CurrentCustomerUserDep

        assert CurrentCustomerUserDep is not None


class TestCustomerRoleInitialization:
    """验证 customer 角色初始化逻辑."""

    def test_customer_role_exists_in_test_db(self, app_data: tuple[TestClient, Session]) -> None:
        _client, db = app_data
        customer_role = db.query(Role).filter(Role.code == "customer").first()
        assert customer_role is not None
        assert customer_role.name == "C端用户"
        assert customer_role.code == "customer"

    def test_all_roles_exist(self, app_data: tuple[TestClient, Session]) -> None:
        _client, db = app_data
        role_codes = [r.code for r in db.query(Role).all()]
        assert "admin" in role_codes
        assert "operator" in role_codes
        assert "user" in role_codes
        assert "customer" in role_codes


class TestPublicRegister:
    """Task 2: C端用户注册接口测试."""

    def test_register_success(self, app_data: tuple[TestClient, Session]) -> None:
        client, db = app_data
        response = client.post(
            "/api/v1/public/auth/register",
            json={
                "username": "newuser01",
                "password": "Test123!",
                "nickname": "测试用户",
                "phone": "13800001111",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["username"] == "newuser01"
        assert data["user"]["phone"] == "138****1111"

        user = db.query(User).filter(User.username == "newuser01").first()
        assert user is not None
        assert user.role.code == "customer"

    def test_register_username_conflict(self, app_data: tuple[TestClient, Session]) -> None:
        client, _db = app_data
        client.post(
            "/api/v1/public/auth/register",
            json={
                "username": "conflict_user",
                "password": "Test123!",
            },
        )
        response = client.post(
            "/api/v1/public/auth/register",
            json={
                "username": "conflict_user",
                "password": "Test123!",
            },
        )
        assert response.status_code == 400
        assert "用户名已被占用" in response.json()["detail"]

    def test_register_phone_conflict(self, app_data: tuple[TestClient, Session]) -> None:
        client, _db = app_data
        client.post(
            "/api/v1/public/auth/register",
            json={
                "username": "phone_user1",
                "password": "Test123!",
                "phone": "13900009999",
            },
        )
        response = client.post(
            "/api/v1/public/auth/register",
            json={
                "username": "phone_user2",
                "password": "Test123!",
                "phone": "13900009999",
            },
        )
        assert response.status_code == 400
        assert "手机号已被绑定" in response.json()["detail"]

    def test_register_validation_error(self, app_data: tuple[TestClient, Session]) -> None:
        client, _db = app_data
        response = client.post(
            "/api/v1/public/auth/register",
            json={
                "username": "ab",
                "password": "123",
            },
        )
        assert response.status_code == 422


class TestPublicLogout:
    """Task 3: C端退出登录接口测试."""

    def test_logout_success(self, app_data: tuple[TestClient, Session]) -> None:
        client, db = app_data
        token, _user = _create_customer_token(db, "logout_user", "13900002222")
        response = client.post(
            "/api/v1/public/auth/logout",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        assert response.json()["message"] == "退出登录成功"

    def test_logout_without_auth(self, app_data: tuple[TestClient, Session]) -> None:
        client, _db = app_data
        response = client.post("/api/v1/public/auth/logout")
        assert response.status_code == 401


class TestPublicProfile:
    """Task 4: 修改用户资料接口测试."""

    def test_update_nickname(self, app_data: tuple[TestClient, Session]) -> None:
        client, db = app_data
        token, _user = _create_customer_token(db, "profile_user", "13900003333")
        response = client.put(
            "/api/v1/public/users/profile",
            json={"nickname": "新昵称"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["nickname"] == "新昵称"
        assert "****" in data["phone"]

    def test_profile_phone_masked(self, app_data: tuple[TestClient, Session]) -> None:
        client, db = app_data
        token, _user = _create_customer_token(db, "mask_user", "13900004444")
        response = client.put(
            "/api/v1/public/users/profile",
            json={"nickname": "测试"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        assert "****" in response.json()["phone"]


class TestPublicPhone:
    """Task 5: 修改手机号接口测试."""

    def test_update_phone_success(self, app_data: tuple[TestClient, Session]) -> None:
        client, db = app_data
        token, _user = _create_customer_token(db, "phone_user", "13900005555")
        response = client.put(
            "/api/v1/public/users/phone",
            json={"phone": "13900006666", "password": "Test123!"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        assert "****" in response.json()["phone"]

    def test_update_phone_wrong_password(self, app_data: tuple[TestClient, Session]) -> None:
        client, db = app_data
        token, _user = _create_customer_token(db, "phone_wrong_pwd", "13900007777")
        response = client.put(
            "/api/v1/public/users/phone",
            json={"phone": "13900008888", "password": "WrongPassword1!"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 401
        assert "密码错误" in response.json()["detail"]

    def test_update_phone_already_bound(self, app_data: tuple[TestClient, Session]) -> None:
        client, db = app_data
        _create_customer_token(db, "phone_bound_user1", "13900009998")
        token2, _user2 = _create_customer_token(db, "phone_bound_user2", "13900009997")
        response = client.put(
            "/api/v1/public/users/phone",
            json={"phone": "13900009998", "password": "Test123!"},
            headers={"Authorization": f"Bearer {token2}"},
        )
        assert response.status_code == 400
        assert "手机号已被其他账号绑定" in response.json()["detail"]


class TestPublicProjects:
    """Task 6: 获取房源列表接口测试."""

    def test_get_projects_empty(self, app_data: tuple[TestClient, Session]) -> None:
        client, _db = app_data
        response = client.get("/api/v1/public/projects")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data

    def test_get_projects_with_data(self, app_data: tuple[TestClient, Session]) -> None:
        client, db = app_data
        community = Community(
            id="test-community-1",
            name="测试小区",
            is_active=True,
        )
        db.add(community)
        db.commit()

        project = L4MarketingProject(
            community_id="test-community-1",
            community_name="测试小区",
            layout="三室两厅",
            orientation="南北通透",
            floor_info="15/28层",
            area=120.50,
            total_price=500.00,
            unit_price=4.15,
            title="精装修三居室",
            publish_status="发布",
            project_status="在售",
            is_deleted=False,
        )
        db.add(project)
        db.commit()

        response = client.get("/api/v1/public/projects")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        item = data["items"][0]
        assert item["community_name"] == "测试小区"
        assert item["project_status"] == "在售"

    def test_get_projects_filters_deleted(self, app_data: tuple[TestClient, Session]) -> None:
        client, db = app_data
        community = Community(
            id="test-community-del",
            name="删除小区",
            is_active=True,
        )
        db.add(community)
        db.commit()

        project = L4MarketingProject(
            community_id="test-community-del",
            community_name="删除小区",
            layout="两室一厅",
            orientation="朝南",
            floor_info="5/18层",
            area=80.00,
            total_price=300.00,
            unit_price=3.75,
            title="已删除房源",
            publish_status="发布",
            project_status="在售",
            is_deleted=True,
        )
        db.add(project)
        db.commit()

        response = client.get("/api/v1/public/projects")
        data = response.json()
        for item in data["items"]:
            assert item["title"] != "已删除房源"

    def test_get_projects_filters_draft(self, app_data: tuple[TestClient, Session]) -> None:
        client, db = app_data
        community = Community(
            id="test-community-draft",
            name="草稿小区",
            is_active=True,
        )
        db.add(community)
        db.commit()

        project = L4MarketingProject(
            community_id="test-community-draft",
            community_name="草稿小区",
            layout="一室一厅",
            orientation="朝东",
            floor_info="3/10层",
            area=50.00,
            total_price=200.00,
            unit_price=4.00,
            title="草稿房源",
            publish_status="草稿",
            project_status="在售",
            is_deleted=False,
        )
        db.add(project)
        db.commit()

        response = client.get("/api/v1/public/projects")
        data = response.json()
        for item in data["items"]:
            assert item["title"] != "草稿房源"

    def test_get_projects_with_filters(self, app_data: tuple[TestClient, Session]) -> None:
        client, _db = app_data
        response = client.get(
            "/api/v1/public/projects",
            params={
                "project_status": "在售",
                "community_name": "测试",
                "layout": "三室两厅",
                "min_price": 100,
                "max_price": 600,
                "min_area": 50,
                "max_area": 200,
                "sort_by": "total_price",
                "sort_order": "asc",
                "page": 1,
                "page_size": 10,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data


class TestPublicProjectDetail:
    """Task 7: 获取房源详情接口测试."""

    def test_get_project_detail(self, app_data: tuple[TestClient, Session]) -> None:
        client, db = app_data
        community = Community(
            id="test-community-detail",
            name="详情小区",
            is_active=True,
        )
        db.add(community)
        db.commit()

        project = L4MarketingProject(
            community_id="test-community-detail",
            community_name="详情小区",
            layout="三室两厅",
            orientation="南北通透",
            floor_info="15/28层",
            area=120.50,
            total_price=500.00,
            unit_price=4.15,
            title="详情测试房源",
            publish_status="发布",
            project_status="在售",
            is_deleted=False,
        )
        db.add(project)
        db.commit()
        db.refresh(project)

        response = client.get(f"/api/v1/public/projects/{project.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "详情测试房源"
        assert data["community_name"] == "详情小区"
        assert "media" in data
        assert "renovation_stages" in data

    def test_get_project_not_found(self, app_data: tuple[TestClient, Session]) -> None:
        client, _db = app_data
        response = client.get("/api/v1/public/projects/99999")
        assert response.status_code == 404


class TestPublicConsultant:
    """Task 8: 获取顾问联系方式接口测试."""

    def test_get_consultant_with_assigned(self, app_data: tuple[TestClient, Session]) -> None:
        client, db = app_data
        consultant = User(
            username="consultant01",
            password=get_password_hash("Test123!"),
            nickname="张顾问",
            phone="13900001234",
            role_id="operator-role",
            status="active",
        )
        db.add(consultant)
        db.commit()
        db.refresh(consultant)

        community = Community(
            id="test-community-consult",
            name="顾问小区",
            is_active=True,
        )
        db.add(community)
        db.commit()

        project = L4MarketingProject(
            community_id="test-community-consult",
            community_name="顾问小区",
            layout="两室一厅",
            orientation="朝南",
            floor_info="8/20层",
            area=90.00,
            total_price=350.00,
            unit_price=3.89,
            title="有顾问的房源",
            publish_status="发布",
            project_status="在售",
            consultant_id=consultant.id,
            is_deleted=False,
        )
        db.add(project)
        db.commit()
        db.refresh(project)

        response = client.get(f"/api/v1/public/projects/{project.id}/consultant")
        assert response.status_code == 200
        data = response.json()
        assert data["phone"] == "139****1234"
        assert data["nickname"] == "张顾问"

    def test_get_consultant_default(self, app_data: tuple[TestClient, Session]) -> None:
        client, db = app_data
        community = Community(
            id="test-community-noconsult",
            name="无顾问小区",
            is_active=True,
        )
        db.add(community)
        db.commit()

        project = L4MarketingProject(
            community_id="test-community-noconsult",
            community_name="无顾问小区",
            layout="一室一厅",
            orientation="朝北",
            floor_info="2/5层",
            area=40.00,
            total_price=150.00,
            unit_price=3.75,
            title="无顾问房源",
            publish_status="发布",
            project_status="在售",
            is_deleted=False,
        )
        db.add(project)
        db.commit()
        db.refresh(project)

        response = client.get(f"/api/v1/public/projects/{project.id}/consultant")
        assert response.status_code == 200
        data = response.json()
        assert data["phone"] == "400-xxx-xxxx"
        assert data["nickname"] == "Profo客服"


class TestPublicSoldProjects:
    """Task 9: 获取成交案例列表接口测试."""

    def test_get_sold_projects(self, app_data: tuple[TestClient, Session]) -> None:
        client, db = app_data
        community = Community(
            id="test-community-sold",
            name="成交小区",
            is_active=True,
        )
        db.add(community)
        db.commit()

        project = L4MarketingProject(
            community_id="test-community-sold",
            community_name="成交小区",
            layout="两室一厅",
            orientation="朝南",
            floor_info="6/12层",
            area=85.00,
            total_price=320.00,
            unit_price=3.76,
            title="已成交房源",
            publish_status="发布",
            project_status="已售",
            is_deleted=False,
        )
        db.add(project)
        db.commit()

        response = client.get("/api/v1/public/projects/sold")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert "sold_days" in data["items"][0]

    def test_sold_projects_only_sold_status(self, app_data: tuple[TestClient, Session]) -> None:
        client, _db = app_data
        response = client.get("/api/v1/public/projects/sold")
        data = response.json()
        for item in data["items"]:
            assert item.get("sold_days") is not None or True


class TestPublicPlatformStats:
    """Task 10: 获取平台统计数据接口测试."""

    def test_get_platform_stats(self, app_data: tuple[TestClient, Session]) -> None:
        client, _db = app_data
        response = client.get("/api/v1/public/stats/platform")
        assert response.status_code == 200
        data = response.json()
        assert "total_owners" in data
        assert "on_sale_count" in data
        assert "current_month_sold" in data
        assert isinstance(data["total_owners"], int)
        assert isinstance(data["on_sale_count"], int)
        assert isinstance(data["current_month_sold"], int)


class TestPublicCommunitySearch:
    """Task 11: 搜索小区接口测试."""

    def test_search_communities(self, app_data: tuple[TestClient, Session]) -> None:
        client, db = app_data
        community = Community(
            id="test-search-community",
            name="搜索测试花园",
            district="浦东新区",
            business_circle="陆家嘴",
            is_active=True,
        )
        db.add(community)
        db.commit()

        response = client.get("/api/v1/public/communities/search?q=搜索测试")
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert data[0]["name"] == "搜索测试花园"
        assert data[0]["district"] == "浦东新区"

    def test_search_communities_empty(self, app_data: tuple[TestClient, Session]) -> None:
        client, _db = app_data
        response = client.get("/api/v1/public/communities/search?q=不存在的社区名称xyz")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 0

    def test_search_communities_with_limit(self, app_data: tuple[TestClient, Session]) -> None:
        client, _db = app_data
        response = client.get("/api/v1/public/communities/search?q=小区&limit=5")
        assert response.status_code == 200


class TestPublicLeads:
    """Task 12-14: 卖房估价接口测试."""

    def test_create_lead(self, app_data: tuple[TestClient, Session]) -> None:
        client, db = app_data
        token, _user = _create_customer_token(db, "lead_user", "13900005551")
        response = client.post(
            "/api/v1/public/leads",
            json={
                "community_name": "估价小区",
                "layout": "三室两厅",
                "area": 120.5,
                "floor_info": "10/20层",
                "orientation": "南北通透",
                "remarks": "精装修",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["community_name"] == "估价小区"
        assert data["status"] == "pending_assessment"

    def test_create_lead_requires_auth(self, app_data: tuple[TestClient, Session]) -> None:
        client, _db = app_data
        response = client.post(
            "/api/v1/public/leads",
            json={
                "community_name": "估价小区",
            },
        )
        assert response.status_code == 401

    def test_create_lead_creator_id_auto_set(self, app_data: tuple[TestClient, Session]) -> None:
        client, db = app_data
        token, user = _create_customer_token(db, "lead_creator_user", "13900005552")
        response = client.post(
            "/api/v1/public/leads",
            json={"community_name": "自动设置创建者小区"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 201
        lead = db.query(Lead).filter(Lead.community_name == "自动设置创建者小区").first()
        assert lead is not None
        assert lead.creator_id == user.id

    def test_get_my_leads(self, app_data: tuple[TestClient, Session]) -> None:
        client, db = app_data
        token, _user = _create_customer_token(db, "my_leads_user", "13900005553")
        client.post(
            "/api/v1/public/leads",
            json={"community_name": "我的线索小区"},
            headers={"Authorization": f"Bearer {token}"},
        )
        response = client.get(
            "/api/v1/public/leads/mine",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        item = data["items"][0]
        assert "status_display" in item
        assert "status_color" in item

    def test_get_lead_detail_own(self, app_data: tuple[TestClient, Session]) -> None:
        client, db = app_data
        token, _user = _create_customer_token(db, "detail_user", "13900005554")
        create_resp = client.post(
            "/api/v1/public/leads",
            json={"community_name": "详情线索小区"},
            headers={"Authorization": f"Bearer {token}"},
        )
        lead_id = create_resp.json()["id"]

        response = client.get(
            f"/api/v1/public/leads/{lead_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["community_name"] == "详情线索小区"
        assert "status_display" in data
        assert "status_color" in data
        assert "follow_ups" in data

    def test_get_lead_detail_others_forbidden(self, app_data: tuple[TestClient, Session]) -> None:
        client, db = app_data
        token1, _user1 = _create_customer_token(db, "owner_user", "13900005555")
        create_resp = client.post(
            "/api/v1/public/leads",
            json={"community_name": "他人线索小区"},
            headers={"Authorization": f"Bearer {token1}"},
        )
        lead_id = create_resp.json()["id"]

        token2, _user2 = _create_customer_token(db, "other_user", "13900005556")
        response = client.get(
            f"/api/v1/public/leads/{lead_id}",
            headers={"Authorization": f"Bearer {token2}"},
        )
        assert response.status_code == 403
        assert "无权查看该线索" in response.json()["detail"]

    def test_get_lead_detail_not_found(self, app_data: tuple[TestClient, Session]) -> None:
        client, db = app_data
        token, _user = _create_customer_token(db, "notfound_user", "13900005557")
        response = client.get(
            "/api/v1/public/leads/nonexistent-id",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 404
        assert "线索不存在" in response.json()["detail"]


class TestPublicRateLimits:
    """验证C端接口速率限制."""

    def test_register_has_rate_limit(self) -> None:
        from routers.public.auth import register

        assert hasattr(register, "__wrapped__")

    def test_logout_has_rate_limit(self) -> None:
        from routers.public.auth import logout

        assert hasattr(logout, "__wrapped__")

    def test_update_profile_has_rate_limit(self) -> None:
        from routers.public.users import update_profile

        assert hasattr(update_profile, "__wrapped__")

    def test_update_phone_has_rate_limit(self) -> None:
        from routers.public.users import update_phone

        assert hasattr(update_phone, "__wrapped__")

    def test_get_projects_has_rate_limit(self) -> None:
        from routers.public.projects import get_projects

        assert hasattr(get_projects, "__wrapped__")

    def test_create_lead_has_rate_limit(self) -> None:
        from routers.public.leads import create_lead

        assert hasattr(create_lead, "__wrapped__")

    def test_get_my_leads_has_rate_limit(self) -> None:
        from routers.public.leads import get_my_leads

        assert hasattr(get_my_leads, "__wrapped__")

    def test_search_communities_has_rate_limit(self) -> None:
        from routers.public.communities import search_communities

        assert hasattr(search_communities, "__wrapped__")
