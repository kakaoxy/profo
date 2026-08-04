"""测试配置模块.

测试基础设施使用 PostgreSQL（与生产环境一致），隔离方案：
- 会话级共享 PG 引擎与表结构
- 每个测试用例使用连接级事务 + SAVEPOINT 隔离，测试结束 rollback
- 直连 engine 的迁移测试通过 TRUNCATE 清理（见 test_phone_encryption.py）

注意：DATABASE_URL 必须指向专用测试库，测试启动时会 TRUNCATE 所有表。
"""

import contextlib
import os
from collections.abc import Generator
from typing import Any

# 防御性 setdefault：.env 未配置 REDIS_URL 时兜底（与 JWT_SECRET_KEY 等一致）
# 必须在 from settings import settings 之前执行，否则 Settings() 导入期即 sys.exit(1)
os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/0")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

import db
from models import Base, Permission, PermissionCategory, Role, User, role_permissions
from settings import settings
from utils.auth import create_access_token, get_password_hash

_TEST_DB_NAME = "profo_test"


def _get_test_database_url() -> str:
    """获取测试用 PostgreSQL 连接串.

    解析规则：
    1. 环境变量 DATABASE_URL（允许 CI/测试时显式覆盖）
    2. settings.database_url（pydantic-settings 从 .env 加载）

    任一来源的连接串，其数据库名必须为 `profo_test`（专用测试库）。
    若为主库 `profo` 或其他名称，将强制改写为 `profo_test`，避免测试
    TRUNCATE 清空主库数据。

    ⚠️ 测试启动时会 TRUNCATE 该库所有表，请确保指向专用测试库。
    """
    raw = os.environ.get("DATABASE_URL") or settings.database_url
    # 兜底保护：将路径末尾的数据库名强制改为 profo_test，绝不回退到主库 profo
    # 兼容 `postgresql+psycopg://user:pass@host:port/dbname` 与 `postgresql://...` 两种形式
    if f"/{_TEST_DB_NAME}" not in raw:
        # 匹配 URL 中最后一个 `/` 之后的数据库名（不含 query string）
        idx = raw.rfind("/")
        if idx == -1:
            msg = f"无法解析 DATABASE_URL 中的数据库名: {raw}"
            raise RuntimeError(msg)
        prefix, suffix = raw[: idx + 1], raw[idx + 1 :]
        # 去除可能的 query string（?xxx）
        qidx = suffix.find("?")
        db_name = suffix[:qidx] if qidx != -1 else suffix
        if db_name == _TEST_DB_NAME:
            return raw
        rest = suffix[qidx:] if qidx != -1 else ""
        # 不抛异常直接改写，避免 CI 中误配置导致测试无法运行；但记录警告
        import logging

        logging.getLogger(__name__).warning(
            "测试 DATABASE_URL 指向非测试库 %r，已强制改写为 %r",
            db_name,
            _TEST_DB_NAME,
        )
        return f"{prefix}{_TEST_DB_NAME}{rest}"
    return raw


def _truncate_all_tables(engine: Engine) -> None:
    """TRUNCATE 所有表（仅在测试会话启动时调用一次，确保干净起点）.

    使用 CASCADE 处理外键依赖，按 schema 内所有表一次性 TRUNCATE。
    """
    inspector = inspect(engine)
    table_names = inspector.get_table_names()
    if not table_names:
        return
    # 一次性 TRUNCATE 所有表，CASCADE 处理外键；PG 支持
    # 表名来自 inspector（可信元数据），非用户输入
    quoted = ", ".join(f'"{t}"' for t in table_names)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE"))


@pytest.fixture(scope="session", autouse=True)
def _profo_test_env() -> Generator[None, None, None]:
    """测试环境变量配置.

    通过 setdefault 注入测试所需的密钥（仅当对应环境变量未设置时）。
    DATABASE_URL 由 _get_test_database_url() 解析，不在此处强制。
    """
    os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/0")
    os.environ.setdefault("JWT_SECRET_KEY", "0123456789abcdef0123456789abcdef")
    os.environ.setdefault("WECHAT_APPID", "test")
    os.environ.setdefault("WECHAT_SECRET", "test")
    os.environ.setdefault("ENCRYPTION_KEY", "2jMwZQncfSnqaQxT3E-hhDMx7npoFQDxyNjyS8SvRCc=")

    yield

    with contextlib.suppress(Exception):
        db.engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def _disable_rate_limiter() -> Generator[None, None, None]:
    """测试环境禁用限流（避免依赖 Redis，加速测试）.

    限流是基础设施关注点，单测验证业务逻辑而非限流行为。
    生产环境降级由 in_memory_fallback_enabled 保障。
    """
    from utils.common import limiter

    limiter.enabled = False
    yield
    limiter.enabled = True


@pytest.fixture(scope="session")
def test_engine() -> Generator[Engine, None, None]:
    """会话级 PG 引擎：建表 + 初始 TRUNCATE.

    一次性创建所有表结构并清空数据，整个测试会话共享该引擎。
    ⚠️ 会 TRUNCATE 目标库所有表，DATABASE_URL 必须指向专用测试库。
    """
    database_url = _get_test_database_url()
    engine = create_engine(
        database_url,
        pool_pre_ping=True,
    )
    Base.metadata.create_all(bind=engine)

    # 运行启动迁移，补齐 create_all 无法为已存在表添加的新列（幂等）
    from migrations import run_startup_migrations

    run_startup_migrations(engine)

    _truncate_all_tables(engine)

    yield engine

    engine.dispose()


@pytest.fixture
def db_session(test_engine: Engine) -> Generator[Session, None, None]:
    """提供隔离的数据库会话.

    使用连接级事务 + SAVEPOINT 实现测试隔离：
    1. 从引擎获取连接，开启外层事务
    2. 创建 Session 绑定到该连接，join_transaction_mode="create_savepoint"
       - 测试代码调用 commit() 时仅释放 SAVEPOINT，不影响外层事务
       - 测试代码调用 rollback() 时仅回滚到 SAVEPOINT
    3. 测试结束后回滚外层事务，撤销所有变更
    """
    connection = test_engine.connect()
    trans = connection.begin()

    session = Session(bind=connection, join_transaction_mode="create_savepoint")

    yield session

    session.close()
    trans.rollback()
    connection.close()


def _seed_permissions(session: Session, roles: list[Role]) -> None:
    """种子权限点并按 _ROLE_PERMISSIONS_SEED 关联到角色.

    复用 migrations 中的权限种子数据，确保测试中 require_permission 依赖
    能正确解析角色权限（与生产环境一致）。

    幂等：先查询已存在的权限点与角色权限关联，避免唯一约束冲突
    （savepoint 隔离失效时前序测试的种子数据可能未被回滚）。
    """
    from migrations import _PERMISSIONS_SEED, _ROLE_PERMISSIONS_SEED

    role_by_code = {r.code: r for r in roles}
    perm_by_code: dict[str, Permission] = {}

    # 预加载已存在的权限点，避免重复 INSERT 触发 ix_permissions_code 唯一约束
    existing_perms = {p.code: p for p in session.query(Permission).all()}

    for perm_data in _PERMISSIONS_SEED:
        code = perm_data["code"]
        if code in existing_perms:
            perm_by_code[code] = existing_perms[code]
            continue
        perm = Permission(
            code=code,
            name=perm_data["name"],
            module=perm_data["module"],
            category=PermissionCategory(perm_data["category"]),
            sort_order=perm_data["sort_order"],
            is_system=True,
            description=perm_data["description"],
        )
        session.add(perm)
        session.flush()
        perm_by_code[code] = perm

    # 预加载已存在的角色权限关联，避免重复 INSERT
    existing_role_perms: set[tuple[str, str]] = {
        (rp.role_id, rp.permission_id) for rp in session.execute(role_permissions.select()).all()
    }

    for role_code, perm_codes in _ROLE_PERMISSIONS_SEED.items():
        role = role_by_code.get(role_code)
        if not role:
            continue
        for code in perm_codes:
            perm = perm_by_code.get(code)
            if not perm:
                continue
            key = (role.id, perm.id)
            if key in existing_role_perms:
                continue
            session.execute(
                role_permissions.insert().values(role_id=role.id, permission_id=perm.id),
            )
            existing_role_perms.add(key)


def _seed_roles_and_users(session: Session) -> dict[str, User]:
    """种子数据：创建角色和管理员/普通用户.

    幂等：先查询已存在的角色与用户，避免主键约束冲突
    （savepoint 隔离失效时前序测试的种子数据可能未被回滚）。
    """
    role_specs = [
        {
            "id": "admin-role",
            "name": "管理员",
            "code": "admin",
            "permissions": ["view_data", "edit_data", "manage_users", "manage_roles"],
        },
        {
            "id": "operator-role",
            "name": "运营人员",
            "code": "operator",
            "permissions": ["view_data", "edit_data"],
        },
        {"id": "user-role", "name": "普通用户", "code": "user", "permissions": ["view_data"]},
        {"id": "customer-role", "name": "C端用户", "code": "customer", "permissions": ["view_data"]},
    ]

    existing_roles = {r.id: r for r in session.query(Role).all()}
    roles: list[Role] = []
    for spec in role_specs:
        role = existing_roles.get(spec["id"])
        if role is None:
            role = Role(
                id=spec["id"],
                name=spec["name"],
                code=spec["code"],
                permissions=spec["permissions"],
            )
            session.add(role)
            session.flush()
        roles.append(role)
    session.commit()

    _seed_permissions(session, roles)

    existing_users = {u.id: u for u in session.query(User).all()}
    if "admin-user" not in existing_users:
        admin_user = User(
            id="admin-user",
            username="admin",
            password=get_password_hash("Admin123!"),
            nickname="管理员",
            role_id="admin-role",
            status="active",
        )
        session.add(admin_user)
        existing_users["admin-user"] = admin_user
    if "normal-user" not in existing_users:
        normal_user = User(
            id="normal-user",
            username="testuser",
            password=get_password_hash("Test123!"),
            nickname="测试用户",
            role_id="user-role",
            status="active",
        )
        session.add(normal_user)
        existing_users["normal-user"] = normal_user
    session.commit()

    return {"admin": existing_users["admin-user"], "normal": existing_users["normal-user"]}


@pytest.fixture
def seeded_db(db_session: Session) -> dict[str, Any]:
    """提供含种子数据的数据库会话."""
    users = _seed_roles_and_users(db_session)
    return {"session": db_session, "users": users}


@pytest.fixture
def admin_client(seeded_db: dict[str, Any]) -> Generator[TestClient, None, None]:
    """已认证的管理员 httpx 客户端."""
    from main import app

    session = seeded_db["session"]
    admin_user = seeded_db["users"]["admin"]

    token = create_access_token(data={"sub": admin_user.id, "role": "admin", "ver": admin_user.token_version})

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    client = TestClient(app, cookies={"access_token": token})
    yield client
    app.dependency_overrides.clear()


@pytest.fixture
def user_client(seeded_db: dict[str, Any]) -> Generator[TestClient, None, None]:
    """已认证的普通用户 httpx 客户端."""
    from main import app

    session = seeded_db["session"]
    normal_user = seeded_db["users"]["normal"]

    token = create_access_token(data={"sub": normal_user.id, "role": "user", "ver": normal_user.token_version})

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    client = TestClient(app, cookies={"access_token": token})
    yield client
    app.dependency_overrides.clear()
