"""权限系统迁移.

包含微信 OAuth 表、user_roles 关联表、权限系统三张表（permissions/role_permissions/
operation_logs）的创建与初始化，以及权限点索引与报表索引。均为幂等执行。
"""

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from migrations._helpers import _index_exists, _pg_quote_literal
from migrations._seeds import _PERMISSIONS_SEED, _ROLE_PERMISSIONS_SEED

logger = logging.getLogger(__name__)


def create_wechat_oauth_tables(engine: Engine) -> None:
    """幂等创建微信 OAuth state/temp_code 表并清理过期记录.

    使用 SQLAlchemy Core API 通过模型 __table__ 元数据创建，
    checkfirst=True 确保表/索引已存在时跳过。
    创建后清理上次运行残留的过期 state/code 记录。
    """
    from models import Base  # noqa: PLC0415
    from models.system import WeChatOAuthState, WeChatTempCode  # noqa: PLC0415

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    target_tables = [WeChatOAuthState.__table__, WeChatTempCode.__table__]
    missing_tables = [t for t in target_tables if t.name not in existing_tables]

    if missing_tables:
        table_names = [t.name for t in missing_tables]
        logger.info("迁移：创建微信 OAuth 表 %s", table_names)
        Base.metadata.create_all(bind=engine, tables=missing_tables, checkfirst=True)

    # 清理上次运行残留的过期记录
    with engine.begin() as conn:
        deleted = conn.execute(text("DELETE FROM wechat_oauth_states WHERE expires_at < NOW()")).rowcount
    if deleted:
        logger.info("迁移：清理 %d 条过期微信 OAuth state 记录", deleted)

    with engine.begin() as conn:
        deleted = conn.execute(text("DELETE FROM wechat_temp_codes WHERE expires_at < NOW()")).rowcount
    if deleted:
        logger.info("迁移：清理 %d 条过期微信临时码记录", deleted)


def create_user_roles_table(engine: Engine) -> None:
    """幂等创建 user_roles 关联表（用户附加角色多对多）.

    使用 SQLAlchemy 模型 __table__ 元数据创建，checkfirst=True 确保表已存在时跳过。
    表结构由 backend.models.user.user.UserRole 定义，user_id / role_id 均为逻辑外键
    （与 User.role_id 一致，不由数据库 FK 约束强制）。
    """
    from models import Base  # noqa: PLC0415
    from models.user import UserRole  # noqa: PLC0415

    inspector = inspect(engine)
    if "user_roles" in inspector.get_table_names():
        return

    logger.info("迁移：创建 user_roles 关联表")
    Base.metadata.create_all(bind=engine, tables=[UserRole.__table__], checkfirst=True)


def migrate_permission_system(engine: Engine) -> None:
    """幂等创建权限系统三张表并初始化系统权限点与内置角色默认权限集.

    1. 幂等创建三张表：
       - permissions：权限点字典（module:action 编码）
       - role_permissions：角色-权限关联表（Table 对象，逻辑外键，级联由 Service 处理）
       - operation_logs：操作审计日志表
       参考 create_investment_tables / create_user_roles_table，使用 Base.metadata.create_all
       + checkfirst=True，新建表语义（CREATE TABLE IF NOT EXISTS）。

    2. 初始化系统权限点（_PERMISSIONS_SEED，所有 is_system=True）：
       - 查询已存在 code 集合，跳过已存在的，仅插入缺失项
       - 使用 text() + 绑定参数，参考 encrypt_existing_phones

    3. 为 4 个内置角色（admin/operator/user/customer）分配默认权限集
       （_ROLE_PERMISSIONS_SEED）：跳过已存在的 (role_id, permission_id) 关联，
       仅插入缺失关联，参考 _ROLE_PERMISSIONS_SEED 映射。

    4. 关于现有 Role.permissions JSON 数据迁移：决策跳过。
       原因：旧权限码（view_data/edit_data/manage_users/manage_roles）与新权限码
       （user:read 等）语义不一致，映射困难；本迁移已通过 _ROLE_PERMISSIONS_SEED
       为 4 个内置角色分配正确的新权限集，覆盖了所有现有角色。旧 Role.permissions
       JSON 字段保留（向后兼容），但不再使用。
    """
    import uuid  # noqa: PLC0415

    from sqlalchemy import bindparam  # noqa: PLC0415

    from models import Base  # noqa: PLC0415
    from models.system import OperationLog  # noqa: PLC0415
    from models.user import Permission, role_permissions  # noqa: PLC0415

    # 1. 幂等创建三张表
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    target_tables = [Permission.__table__, role_permissions, OperationLog.__table__]
    missing_tables = [t for t in target_tables if t.name not in existing_tables]

    if missing_tables:
        table_names = [t.name for t in missing_tables]
        logger.info("迁移：创建权限系统表 %s", table_names)
        Base.metadata.create_all(bind=engine, tables=missing_tables, checkfirst=True)

    # 1.1 同步 permissioncategory enum 类型（PG enum 类型创建后不会随 Python enum 自动扩展）
    if engine.dialect.name == "postgresql":
        from models.user.permission import PermissionCategory  # noqa: PLC0415

        with engine.connect() as conn:
            type_exists = conn.execute(text("SELECT 1 FROM pg_type WHERE typname = 'permissioncategory'")).scalar()
        if type_exists:
            added = 0
            for member in PermissionCategory:
                val = member.value
                with engine.begin() as conn:
                    exists = conn.execute(
                        text(
                            "SELECT 1 FROM pg_enum e "
                            "JOIN pg_type t ON e.enumtypid = t.oid "
                            "WHERE t.typname = 'permissioncategory' AND e.enumlabel = :label",
                        ),
                        {"label": val},
                    ).scalar()
                    if not exists:
                        # PostgreSQL DDL 不支持绑定参数；enum 值经 _pg_quote_literal 防御性转义
                        conn.execute(
                            text(f"ALTER TYPE permissioncategory ADD VALUE IF NOT EXISTS {_pg_quote_literal(val)}")
                        )
                        added += 1
            if added:
                logger.info("迁移：同步 permissioncategory enum（共 %d 个值）", added)

    # 2. 初始化系统权限点（幂等：跳过已存在的 code）
    with engine.begin() as conn:
        existing_codes = {row[0] for row in conn.execute(text("SELECT code FROM permissions")).fetchall()}
        inserted = 0
        for perm in _PERMISSIONS_SEED:
            if perm["code"] in existing_codes:
                continue
            conn.execute(
                text(
                    "INSERT INTO permissions "
                    "(id, code, name, module, category, sort_order, is_system, description, created_at, updated_at) "
                    "VALUES (:id, :code, :name, :module, :category, :sort_order, TRUE, :description, NOW(), NOW())"
                ),
                {
                    "id": str(uuid.uuid4()),
                    "code": perm["code"],
                    "name": perm["name"],
                    "module": perm["module"],
                    "category": perm["category"],
                    "sort_order": perm["sort_order"],
                    "description": perm["description"],
                },
            )
            inserted += 1
    if inserted:
        logger.info("迁移：初始化 %d 个系统权限点", inserted)

    # 3. 为 4 个内置角色分配默认权限集（幂等：跳过已存在的关联）
    with engine.begin() as conn:
        # 3.1 查询内置角色 id（按 code）
        role_stmt = text("SELECT id, code FROM roles WHERE code IN :codes").bindparams(
            bindparam("codes", expanding=True)
        )
        role_rows = conn.execute(role_stmt, {"codes": list(_ROLE_PERMISSIONS_SEED.keys())}).fetchall()
        role_id_by_code: dict[str, str] = {row[1]: row[0] for row in role_rows}

        # 3.2 查询所需权限点 id（一次性 expanding IN）
        all_perm_codes: set[str] = set()
        for codes in _ROLE_PERMISSIONS_SEED.values():
            all_perm_codes.update(codes)
        perm_stmt = text("SELECT id, code FROM permissions WHERE code IN :codes").bindparams(
            bindparam("codes", expanding=True)
        )
        perm_rows = conn.execute(perm_stmt, {"codes": list(all_perm_codes)}).fetchall()
        perm_id_by_code: dict[str, str] = {row[1]: row[0] for row in perm_rows}

        # 3.3 查询已存在的 (role_id, permission_id) 关联
        existing_pairs: set[tuple[str, str]] = set()
        for role_code in _ROLE_PERMISSIONS_SEED:
            role_id = role_id_by_code.get(role_code)
            if not role_id:
                continue
            rows = conn.execute(
                text("SELECT permission_id FROM role_permissions WHERE role_id = :rid"),
                {"rid": role_id},
            ).fetchall()
            for row in rows:
                existing_pairs.add((role_id, row[0]))

        # 3.4 插入缺失关联
        inserted_links = 0
        for role_code, perm_codes in _ROLE_PERMISSIONS_SEED.items():
            role_id = role_id_by_code.get(role_code)
            if not role_id:
                continue
            for perm_code in perm_codes:
                perm_id = perm_id_by_code.get(perm_code)
                if not perm_id:
                    continue
                if (role_id, perm_id) in existing_pairs:
                    continue
                conn.execute(
                    text("INSERT INTO role_permissions (role_id, permission_id) VALUES (:rid, :pid)"),
                    {"rid": role_id, "pid": perm_id},
                )
                inserted_links += 1
    if inserted_links:
        logger.info("迁移：为内置角色分配 %d 条权限关联", inserted_links)


def migrate_project_business_permission(engine: Engine) -> None:
    """幂等迁移：插入 project 业务身份权限点 + 分配角色 + ProjectInteraction.operator_id 索引.

    覆盖场景：
    1. 插入 4 个新权限点（已存在的跳过）；
    2. 为 admin/operator 分配新权限码（user/customer 不分配，由业务身份豁免）；
    3. 通过 _index_exists 检查后创建 ProjectInteraction.operator_id 索引
       （ix_project_interaction_operator_id）。

    幂等性：所有步骤通过 _table_exists/_index_exists/已存在 code 检查跳过。
    """
    import uuid  # noqa: PLC0415

    from sqlalchemy import bindparam  # noqa: PLC0415

    # 1. 插入新权限点（跳过已存在的 code）
    new_perm_codes = [
        "project:renovation:upload_photo",
        "project:renovation:complete_stage",
        "project:sales:add_record",
        "project:sales:manage_team",
    ]
    new_perm_defs = {p["code"]: p for p in _PERMISSIONS_SEED if p["code"] in new_perm_codes}

    with engine.begin() as conn:
        existing_codes = {
            row[0] for row in conn.execute(text("SELECT code FROM permissions")).fetchall() if row[0] in new_perm_codes
        }
        inserted = 0
        for code in new_perm_codes:
            if code in existing_codes:
                continue
            perm = new_perm_defs[code]
            conn.execute(
                text(
                    "INSERT INTO permissions "
                    "(id, code, name, module, category, sort_order, is_system, description, created_at, updated_at) "
                    "VALUES (:id, :code, :name, :module, :category, :sort_order, TRUE, :description, NOW(), NOW())"
                ),
                {
                    "id": str(uuid.uuid4()),
                    "code": perm["code"],
                    "name": perm["name"],
                    "module": perm["module"],
                    "category": perm["category"],
                    "sort_order": perm["sort_order"],
                    "description": perm["description"],
                },
            )
            inserted += 1
    if inserted:
        logger.info("迁移：插入 %d 个 project 业务身份权限点", inserted)

    # 2. 为 admin/operator 分配新权限码（跳过已存在的关联）
    role_codes_to_update = ["admin", "operator"]
    with engine.begin() as conn:
        role_stmt = text("SELECT id, code FROM roles WHERE code IN :codes").bindparams(
            bindparam("codes", expanding=True)
        )
        role_rows = conn.execute(role_stmt, {"codes": role_codes_to_update}).fetchall()
        role_id_by_code: dict[str, str] = {row[1]: row[0] for row in role_rows}

        perm_stmt = text("SELECT id, code FROM permissions WHERE code IN :codes").bindparams(
            bindparam("codes", expanding=True)
        )
        perm_rows = conn.execute(perm_stmt, {"codes": new_perm_codes}).fetchall()
        perm_id_by_code: dict[str, str] = {row[1]: row[0] for row in perm_rows}

        existing_pairs: set[tuple[str, str]] = set()
        for role_code in role_codes_to_update:
            role_id = role_id_by_code.get(role_code)
            if not role_id:
                continue
            rows = conn.execute(
                text("SELECT permission_id FROM role_permissions WHERE role_id = :rid"),
                {"rid": role_id},
            ).fetchall()
            for row in rows:
                existing_pairs.add((role_id, row[0]))

        inserted_links = 0
        for role_code in role_codes_to_update:
            role_id = role_id_by_code.get(role_code)
            if not role_id:
                continue
            for perm_code in new_perm_codes:
                perm_id = perm_id_by_code.get(perm_code)
                if not perm_id:
                    continue
                if (role_id, perm_id) in existing_pairs:
                    continue
                conn.execute(
                    text("INSERT INTO role_permissions (role_id, permission_id) VALUES (:rid, :pid)"),
                    {"rid": role_id, "pid": perm_id},
                )
                inserted_links += 1
    if inserted_links:
        logger.info("迁移：为 admin/operator 分配 %d 条 project 业务身份权限关联", inserted_links)

    # 3. 创建 ProjectInteraction.operator_id 索引（幂等）
    if not _index_exists(engine, "ix_project_interaction_operator_id"):
        logger.info("迁移：创建 ix_project_interaction_operator_id 索引")
        with engine.begin() as conn:
            conn.execute(text("CREATE INDEX ix_project_interaction_operator_id ON project_interactions (operator_id)"))


def add_permission_foreign_indexes(engine: Engine) -> None:
    """为 user_roles.role_id 和 role_permissions.permission_id 创建索引（幂等）.

    user_roles 的复合唯一约束 (user_id, role_id) 仅支持 user_id 前缀查询，
    按 role_id 查询（如角色更新时查找受影响用户）需要独立索引。
    role_permissions 的复合主键 (role_id, permission_id) 同理，
    按 permission_id 删除（如删除权限点时清理关联）需要独立索引。
    """
    if not _index_exists(engine, "ix_user_roles_role_id"):
        logger.info("迁移：创建 ix_user_roles_role_id 索引")
        with engine.begin() as conn:
            conn.execute(text("CREATE INDEX ix_user_roles_role_id ON user_roles (role_id)"))

    if not _index_exists(engine, "ix_role_permissions_permission_id"):
        logger.info("迁移：创建 ix_role_permissions_permission_id 索引")
        with engine.begin() as conn:
            conn.execute(text("CREATE INDEX ix_role_permissions_permission_id ON role_permissions (permission_id)"))


def add_reports_indexes(engine: Engine) -> None:
    """为 property_current 表创建报表模块复合索引（幂等）.

    报表聚合查询核心 WHERE 模式为 is_active + status + sold_date 范围扫描，
    以及 community_id + status + sold_date 的小区维度聚合。
    现有 idx_status 仅覆盖单列（选择性低），idx_dates 的 sold_date 为第二列无法用于前缀扫描。
    """
    if not _index_exists(engine, "idx_reports_core"):
        logger.info("迁移：创建 idx_reports_core 索引 (is_active, status, sold_date)")
        with engine.begin() as conn:
            conn.execute(
                text("CREATE INDEX idx_reports_core ON property_current (is_active, status, sold_date)"),
            )

    if not _index_exists(engine, "idx_community_status_date"):
        logger.info("迁移：创建 idx_community_status_date 索引 (community_id, status, sold_date)")
        with engine.begin() as conn:
            conn.execute(
                text("CREATE INDEX idx_community_status_date ON property_current (community_id, status, sold_date)"),
            )
