"""
TDD tests for Iteration 5: System user module layer compliance
Tests verify service layer methods before they are implemented.
"""
import pytest
from unittest.mock import MagicMock, patch
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from models import Base, User, Role
from db import get_db
from main import app
from fastapi.testclient import TestClient


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    yield session
    session.close()


class TestUserServiceListUsersSimple:
    """Test UserService.list_users_simple() method"""

    def _seed_users(self, db_session):
        role = Role(id="role-1", name="Test", code="test")
        db_session.add(role)

        users = [
            User(id="u1", username="alice", nickname="Alice Wang", role_id="role-1", status="active", password="hashed"),
            User(id="u2", username="bob", nickname="Bob Li", role_id="role-1", status="active", password="hashed"),
            User(id="u3", username="charlie", nickname="Charlie", role_id="role-1", status="inactive", password="hashed"),
            User(id="u4", username="dave", nickname="Dave", role_id="role-1", status="active", password="hashed"),
        ]
        for u in users:
            db_session.add(u)
        db_session.commit()

    def test_list_users_simple_exists(self):
        """RED: list_users_simple() should exist on UserService"""
        from services.system.user import UserService
        svc = UserService()
        assert hasattr(svc, "list_users_simple"), "list_users_simple method must exist"

    def test_list_users_simple_returns_all_active(self, db_session):
        """RED: list_users_simple should return all active users when no filter"""
        self._seed_users(db_session)

        from services.system.user import UserService
        svc = UserService()
        result = svc.list_users_simple(db_session, status="active")

        assert isinstance(result, list)
        assert len(result) == 3
        user_ids = {r["id"] for r in result}
        assert "u1" in user_ids
        assert "u2" in user_ids
        assert "u4" in user_ids
        assert "u3" not in user_ids

    def test_list_users_simple_filters_by_nickname(self, db_session):
        """RED: list_users_simple should filter by nickname with ilike"""
        self._seed_users(db_session)

        from services.system.user import UserService
        svc = UserService()
        result = svc.list_users_simple(db_session, nickname="alice")

        assert len(result) == 1
        assert result[0]["username"] == "alice"

    def test_list_users_simple_filters_by_nickname_match_username(self, db_session):
        """RED: list_users_simple should also match username with ilike"""
        self._seed_users(db_session)

        from services.system.user import UserService
        svc = UserService()
        result = svc.list_users_simple(db_session, nickname="bob")

        assert len(result) == 1
        assert result[0]["id"] == "u2"

    def test_list_users_simple_filters_by_nickname_partial(self, db_session):
        """RED: list_users_simple should do partial match on nickname or username"""
        self._seed_users(db_session)

        from services.system.user import UserService
        svc = UserService()
        result = svc.list_users_simple(db_session, nickname="li")

        assert len(result) == 3
        usernames = {r["username"] for r in result}
        assert "alice" in usernames
        assert "bob" in usernames
        assert "charlie" in usernames

    def test_list_users_simple_no_status_returns_all(self, db_session):
        """RED: list_users_simple without status returns all users"""
        self._seed_users(db_session)

        from services.system.user import UserService
        svc = UserService()
        result = svc.list_users_simple(db_session)

        assert len(result) == 4

    def test_list_users_simple_return_format(self, db_session):
        """RED: list_users_simple returns dicts with id, nickname, username"""
        self._seed_users(db_session)

        from services.system.user import UserService
        svc = UserService()
        result = svc.list_users_simple(db_session, status="active")

        assert len(result) > 0
        for item in result:
            assert "id" in item
            assert "nickname" in item
            assert "username" in item
            assert isinstance(item["id"], str)
            assert isinstance(item["username"], str)


class TestSystemInitService:
    """Test SystemInitService.initialize() method"""

    def test_init_service_exists(self):
        """RED: SystemInitService class should exist in init_service module"""
        from services.system.init_service import SystemInitService
        svc = SystemInitService()
        assert hasattr(svc, "initialize"), "initialize method must exist"

    def test_initialize_creates_roles(self, db_session):
        """RED: initialize should create 3 default roles"""
        from services.system.init_service import SystemInitService

        svc = SystemInitService()
        result = svc.initialize(db_session)

        roles = db_session.query(Role).all()
        role_codes = {r.code for r in roles}
        assert "admin" in role_codes
        assert "operator" in role_codes
        assert "user" in role_codes

    def test_initialize_creates_admin_user(self, db_session):
        """RED: initialize should create admin user"""
        from services.system.init_service import SystemInitService

        svc = SystemInitService()
        result = svc.initialize(db_session)

        admin = db_session.query(User).filter(User.username == "admin").first()
        assert admin is not None
        assert admin.nickname == "系统管理员"
        admin_role = db_session.query(Role).filter(Role.code == "admin").first()
        assert admin.role_id == admin_role.id

    def test_initialize_is_idempotent(self, db_session):
        """RED: initialize should be idempotent (skip if already initialized)"""
        from services.system.init_service import SystemInitService

        svc = SystemInitService()
        result1 = svc.initialize(db_session)
        result2 = svc.initialize(db_session)

        assert "已初始化" in result2.get("message", "")

        roles_count = db_session.query(Role).count()
        assert roles_count == 3

    def test_initialize_returns_result_dict(self, db_session):
        """RED: initialize should return a dict with message"""
        from services.system.init_service import SystemInitService

        svc = SystemInitService()
        result = svc.initialize(db_session)

        assert isinstance(result, dict)
        assert "message" in result