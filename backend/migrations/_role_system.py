"""权限治理硬化迁移.

为权限系统治理加固（spec: harden-permission-governance）提供两个幂等迁移：
- add_role_is_system_column: roles 表添加 is_system 列并回填 4 个内置角色为 TRUE
- add_permission_risk_level_column: permissions 表添加 risk_level 列并按种子映射回填等级
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations._helpers import _column_exists

logger = logging.getLogger(__name__)

# 系统内置角色代码：is_system=TRUE，禁止删除/修改 code/停用
_SYSTEM_ROLE_CODES = ("admin", "operator", "user", "customer")

# 权限点风险等级种子映射（未列出的权限点保持列默认值 L1）：
# L0 读取 / L1 普通写入 / L2 数据管理 / L3 审批 / L4 高风险 / L5 系统安全
_PERMISSION_RISK_LEVELS: dict[str, str] = {
    # L0 只读
    "user:read": "L0",
    "role:read": "L0",
    "permission:read": "L0",
    "property:read": "L0",
    "lead:read": "L0",
    "project:read": "L0",
    "ledger:read": "L0",
    "subject:read": "L0",
    "investment:read": "L0",
    "l4_marketing:read": "L0",
    "recruit:read": "L0",
    "operation_log:read": "L0",
    # L1 普通写入
    "lead:create": "L1",
    "lead:submit": "L1",
    "lead:upload_photo": "L1",
    "valuation:write": "L1",
    "project:write": "L1",
    "project:renovation:upload_photo": "L1",
    "project:sales:add_record": "L1",
    # L2 数据管理
    "lead:write": "L2",
    "property:write": "L2",
    "property:upload": "L2",
    "subject:write": "L2",
    "investment:write": "L2",
    "investment:copy": "L2",
    "l4_marketing:write": "L2",
    "recruit:write": "L2",
    "project:delete": "L2",
    "project:renovation:complete_stage": "L2",
    "project:sales:manage_team": "L2",
    # L3 审批
    "ledger:write": "L3",
    "property:governance": "L3",
    "user:create": "L3",
    "user:update": "L3",
    # L4 高风险
    "user:delete": "L4",
    "user:reset_password": "L4",
    "user:unbind_wechat": "L4",
    "ledger:settle": "L4",
    # L5 系统安全
    "role:create": "L5",
    "role:update": "L5",
    "role:delete": "L5",
    "role:assign_permissions": "L5",
    "permission:manage": "L5",
    "api_key:manage": "L5",
}


def add_role_is_system_column(engine: Engine) -> None:
    """为 roles 表添加 is_system 列并回填内置角色为 TRUE（幂等）.

    - 加列：_column_exists 检查，NOT NULL DEFAULT FALSE（无引号布尔关键字）
    - 回填：admin/operator/user/customer 四内置角色置 TRUE（重复执行为等值 UPDATE，幂等）
    """
    if not _column_exists(engine, "roles", "is_system"):
        logger.info("迁移：为 roles 表添加 is_system 列")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE roles ADD COLUMN is_system BOOLEAN NOT NULL DEFAULT FALSE"))

    with engine.begin() as conn:
        # PG 专属：列表参数用 = ANY(:codes)（text() 的 IN :codes 不支持列表绑定）
        result = conn.execute(
            text("UPDATE roles SET is_system = TRUE WHERE code = ANY(:codes) AND is_system <> TRUE"),
            {"codes": list(_SYSTEM_ROLE_CODES)},
        )
        if result.rowcount:
            logger.info("迁移：回填内置角色 is_system=TRUE（%d 个角色）", result.rowcount)


def add_permission_risk_level_column(engine: Engine) -> None:
    """为 permissions 表添加 risk_level 列并按种子映射回填（幂等）.

    - 加列：_column_exists 检查，NOT NULL DEFAULT 'L1'
    - 回填：逐码 UPDATE，仅风险等级与目标不一致的行被改写（幂等）；
      未列入映射的权限点（含 API 自建）保持默认 L1
    """
    if not _column_exists(engine, "permissions", "risk_level"):
        logger.info("迁移：为 permissions 表添加 risk_level 列")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE permissions ADD COLUMN risk_level VARCHAR(8) NOT NULL DEFAULT 'L1'"))

    with engine.begin() as conn:
        for code, level in sorted(_PERMISSION_RISK_LEVELS.items()):
            conn.execute(
                text("UPDATE permissions SET risk_level = :level WHERE code = :code AND risk_level <> :level"),
                {"level": level, "code": code},
            )
    logger.info("迁移：permissions.risk_level 种子回填完成（%d 个权限点）", len(_PERMISSION_RISK_LEVELS))
