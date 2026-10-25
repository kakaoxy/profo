"""工作台权限种子迁移（v97，迭代二 SPEC §4.3）.

幂等插入 ``workbench:manage`` 权限点并授予内置 admin 角色（**不授予** operator/user）。

为什么 admin 授予要显式写、而不是只依赖 ``_ROLE_PERMISSIONS_SEED``：
``migrate_permission_system``（``_permission_system.py:200-250``）会跳过
``permissions_customized = TRUE`` 的角色——若管理员曾编辑过 admin 的权限集，
本权限点就补不上。本迁移按「新权限点不可能被故意移除」的既有口径
（与 ``_biz_dicts.py`` 的 ``dict:manage`` 一致）显式授予，保证入口不丢。

⚠️ 同时必须在 ``migrations/_seeds.py::_PERMISSIONS_SEED`` 追加同一条定义：
- ``_ROLE_PERMISSIONS_SEED["admin"]`` 是 ``[p["code"] for p in _PERMISSIONS_SEED]``
  （``_seeds.py:409``），会自动带上；
- ``migrate_permission_system`` 每次启动也会补插种子缺项，两处必须一致。
"""

import logging
import uuid

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

# 权限点定义（与 migrations/_seeds.py::_PERMISSIONS_SEED 中的同名条目**逐字段一致**）
WORKBENCH_MANAGE_CODE = "workbench:manage"
WORKBENCH_MANAGE_DEF: dict[str, object] = {
    "code": WORKBENCH_MANAGE_CODE,
    "name": "管理工作台布局",
    "module": "workbench",
    "category": "api",
    "sort_order": 10,
    "description": "管理角色默认工作台布局（仅 admin）",
}


def seed_workbench_manage_permission(engine: Engine) -> None:
    """v97：幂等插入 workbench:manage 权限点并授予 admin（不授予 operator/user）.

    Args:
        engine: 数据库引擎。

    """
    # 1. 插入权限点（已存在则跳过）
    with engine.begin() as conn:
        existing_id = conn.execute(
            text("SELECT id FROM permissions WHERE code = :code"),
            {"code": WORKBENCH_MANAGE_CODE},
        ).scalar()

        if existing_id is None:
            permission_id = str(uuid.uuid4())
            conn.execute(
                text(
                    "INSERT INTO permissions "
                    "(id, code, name, module, category, sort_order, is_system, risk_level, "
                    " description, created_at, updated_at) "
                    "VALUES (:id, :code, :name, :module, :category, :sort_order, TRUE, 'L5', "
                    " :description, NOW(), NOW())"
                ),
                {
                    "id": permission_id,
                    "code": WORKBENCH_MANAGE_DEF["code"],
                    "name": WORKBENCH_MANAGE_DEF["name"],
                    "module": WORKBENCH_MANAGE_DEF["module"],
                    "category": WORKBENCH_MANAGE_DEF["category"],
                    "sort_order": WORKBENCH_MANAGE_DEF["sort_order"],
                    "description": WORKBENCH_MANAGE_DEF["description"],
                },
            )
            logger.info("迁移 v97：已插入权限点 %s", WORKBENCH_MANAGE_CODE)
        else:
            permission_id = str(existing_id)

    # 2. 授予 admin（幂等：跳过已存在的 (role_id, permission_id) 关联）
    with engine.begin() as conn:
        admin_role_id = conn.execute(text("SELECT id FROM roles WHERE code = 'admin'")).scalar()
        if admin_role_id is None:
            # 全新库在权限种子之前无 admin 角色：跳过授予，由后续启动的
            # migrate_permission_system 依 _ROLE_PERMISSIONS_SEED 补齐。
            logger.warning("迁移 v97：admin 角色不存在，跳过授权（将在权限种子同步时补齐）")
            return

        granted = conn.execute(
            text("SELECT 1 FROM role_permissions WHERE role_id = :rid AND permission_id = :pid"),
            {"rid": admin_role_id, "pid": permission_id},
        ).first()
        if granted is None:
            conn.execute(
                text("INSERT INTO role_permissions (role_id, permission_id) VALUES (:rid, :pid)"),
                {"rid": admin_role_id, "pid": permission_id},
            )
            logger.info("迁移 v97：已授予 admin 角色 %s 权限", WORKBENCH_MANAGE_CODE)


__all__ = [
    "WORKBENCH_MANAGE_CODE",
    "WORKBENCH_MANAGE_DEF",
    "seed_workbench_manage_permission",
]
