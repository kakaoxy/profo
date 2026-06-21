"""测试配置模块."""

import os
from collections.abc import Generator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import db
from models import Base, Role, User
from utils.auth import create_access_token, get_password_hash


def _enable_sqlite_fk(dbapi_conn: Any, connection_record: Any) -> None:  # noqa: ANN401
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


@pytest.fixture(scope="session", autouse=True)
def _profo_test_env() -> None:
    os.environ.setdefault("JWT_SECRET_KEY", "0123456789abcdef0123456789abcdef")
    os.environ.setdefault("WECHAT_APPID", "test")
    os.environ.setdefault("WECHAT_SECRET", "test")
    os.environ.setdefault("ENCRYPTION_KEY", "2jMwZQncfSnqaQxT3E-hhDMx7npoFQDxyNjyS8SvRCc=")

    db_path = (Path(__file__).parent / "test.db").resolve()
    if db_path.exists():
        db_path.unlink()

    os.environ["DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"
    yield

    try:
        db.engine.dispose()
    except Exception:  # noqa: BLE001
        return

    if db_path.exists():
        try:
            db_path.unlink()
        except PermissionError:
            return


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    """提供隔离的数据库会话，每个测试用例使用独立内存数据库."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    event.listen(engine, "connect", _enable_sqlite_fk)

    session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = session_local()

    yield session

    session.close()
    engine.dispose()


def _seed_roles_and_users(session: Session) -> dict[str, User]:
    """种子数据：创建角色和管理员/普通用户."""
    roles = [
        Role(id="admin-role", name="管理员", code="admin", permissions=["view_data", "edit_data", "manage_users", "manage_roles"]),
        Role(id="operator-role", name="运营人员", code="operator", permissions=["view_data", "edit_data"]),
        Role(id="user-role", name="普通用户", code="user", permissions=["view_data"]),
        Role(id="customer-role", name="C端用户", code="customer", permissions=["view_data"]),
    ]
    for r in roles:
        session.add(r)
    session.commit()

    admin_user = User(
        id="admin-user",
        username="admin",
        password=get_password_hash("Admin123!"),
        nickname="管理员",
        role_id="admin-role",
        status="active",
    )
    normal_user = User(
        id="normal-user",
        username="testuser",
        password=get_password_hash("Test123!"),
        nickname="测试用户",
        role_id="user-role",
        status="active",
    )
    session.add(admin_user)
    session.add(normal_user)
    session.commit()

    return {"admin": admin_user, "normal": normal_user}


@pytest.fixture()
def seeded_db(db_session: Session) -> dict[str, Any]:
    """提供含种子数据的数据库会话."""
    users = _seed_roles_and_users(db_session)
    return {"session": db_session, "users": users}


@pytest.fixture()
def admin_client(seeded_db: dict[str, Any]) -> Generator[TestClient, None, None]:
    """已认证的管理员 httpx 客户端."""
    from main import app

    session = seeded_db["session"]
    admin_user = seeded_db["users"]["admin"]

    token = create_access_token(data={"sub": admin_user.id, "role": "admin"})

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    client = TestClient(app, cookies={"access_token": token})
    yield client
    app.dependency_overrides.clear()


@pytest.fixture()
def user_client(seeded_db: dict[str, Any]) -> Generator[TestClient, None, None]:
    """已认证的普通用户 httpx 客户端."""
    from main import app

    session = seeded_db["session"]
    normal_user = seeded_db["users"]["normal"]

    token = create_access_token(data={"sub": normal_user.id, "role": "user"})

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    client = TestClient(app, cookies={"access_token": token})
    yield client
    app.dependency_overrides.clear()
