"""资金账户迁移（建表 + 加列 + 索引 + 权限种子）.

对应 SPEC ``docs/To-Do/2026-10-21-资金账户管理-落地SPEC.md`` §3/§4.4，全部步骤幂等：

- 建表用 ``Base.metadata.create_all(checkfirst=True)``（CREATE TABLE IF NOT EXISTS 语义）；
- ``fund_accounts.name`` 唯一性用**部分唯一索引**（``WHERE is_deleted = false``）实现，
  让「删掉一个账户后可以复用同名」成立，同时保证在用账户不重名；
- ``finance_records.account_id`` 加列先 ``_column_exists`` 判断，索引先 ``_index_exists``；
- 权限点 ``account:read/write/admin`` 用 ``WHERE NOT EXISTS`` 插入（不覆盖运营已有配置），
  并按 ``_biz_dicts.py::_ensure_dict_manage_permission`` 的策略显式授予内置 admin：
  新权限点在既有库里不可能「被人故意移除」，因此即使 ``permissions_customized = TRUE``
  也补授——否则上线后管理员打不开资金账户页（入口缺口）。operator 仅在未人工定制时补授
  read/write（与 ``_ROLE_PERMISSIONS_SEED`` 语义一致），user 不授予。

⚠️ 不做的事情（有意为之，见 SPEC §3.3）：
- **不预置任何账户**（真实账户只有业务方知道，第一次进去自己建）；
- **不回填** ``finance_records.account_id``（NULL 是「没走账户」的明确语义，不是脏数据）。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations._helpers import _column_exists, _index_exists

logger = logging.getLogger(__name__)

# 资金账户权限点种子（与 migrations/_seeds.py::_PERMISSIONS_SEED 同构）
_FUND_ACCOUNT_PERMISSIONS: tuple[dict, ...] = (
    {
        "code": "account:read",
        "name": "查看资金账户",
        "module": "account",
        "category": "api",
        "sort_order": 10,
        "description": "查看资金账户与账户流水（另需模块密码解锁）",
    },
    {
        "code": "account:write",
        "name": "编辑资金账户",
        "module": "account",
        "category": "api",
        "sort_order": 20,
        "description": "新建/编辑账户、余额对账、补挂历史流水的账户",
    },
    {
        "code": "account:admin",
        "name": "设置账户密码",
        "module": "account",
        "category": "api",
        "sort_order": 30,
        "description": "设置/重设资金账户模块入口密码（仅 admin）",
    },
)

# 内置角色 → 需补授的权限码（仅在角色 permissions_customized = FALSE 时补授）
_ROLE_EXTRA_PERMISSIONS: dict[str, tuple[str, ...]] = {
    "operator": ("account:read", "account:write"),
}


def _ensure_fund_account_permissions(engine: Engine) -> None:
    """幂等写入资金账户权限点，并按策略授予内置角色."""
    with engine.begin() as conn:
        for perm in _FUND_ACCOUNT_PERMISSIONS:
            exists = conn.execute(
                text("SELECT 1 FROM permissions WHERE code = :code"),
                {"code": perm["code"]},
            ).scalar()
            if exists:
                continue
            conn.execute(
                text(
                    "INSERT INTO permissions "
                    "(id, code, name, module, category, sort_order, description, is_system, "
                    "created_at, updated_at) "
                    "VALUES (gen_random_uuid(), :code, :name, :module, "
                    "CAST(:category AS permissioncategory), :sort_order, :description, TRUE, NOW(), NOW())",
                ),
                perm,
            )

        # admin：全额补授（新权限点不存在「被人工移除」的历史，不跳过）
        admin_codes = tuple(perm["code"] for perm in _FUND_ACCOUNT_PERMISSIONS)
        _grant(conn, role_code="admin", codes=admin_codes, skip_customized=False)

        # operator：仅在角色未被人工定制时补授 read/write
        for role_code, codes in _ROLE_EXTRA_PERMISSIONS.items():
            _grant(conn, role_code=role_code, codes=codes, skip_customized=True)


def _grant(conn: object, *, role_code: str, codes: tuple[str, ...], skip_customized: bool) -> None:
    """为角色补授权限（幂等：跳过已存在关联）.

    Args:
        conn: 数据库连接（engine.begin() 上下文内的 Connection）
        role_code: 角色 code
        codes: 权限码列表
        skip_customized: True 时跳过 permissions_customized = TRUE 的角色

    """
    for code in codes:
        stmt = (
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT r.id, p.id FROM roles r CROSS JOIN permissions p "
            "WHERE r.code = :role_code AND p.code = :code "
        )
        if skip_customized:
            stmt += "AND r.permissions_customized = FALSE "
        stmt += (
            "AND NOT EXISTS (  SELECT 1 FROM role_permissions rp   WHERE rp.role_id = r.id AND rp.permission_id = p.id)"
        )
        conn.execute(text(stmt), {"role_code": role_code, "code": code})


def create_fund_account_tables(engine: Engine) -> None:
    """幂等创建资金账户两张表 + 索引 + 权限点种子."""
    from models import Base
    from models.finance import FundAccount, FundAccountAdjustment

    Base.metadata.create_all(
        bind=engine,
        tables=[FundAccount.__table__, FundAccountAdjustment.__table__],
        checkfirst=True,
    )

    # 部分唯一索引：仅未删除的账户要求名称唯一（删除后允许复用同名）
    if not _index_exists(engine, "uq_fund_accounts_name"):
        logger.info("迁移：创建 uq_fund_accounts_name 部分唯一索引")
        with engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_fund_accounts_name "
                    "ON fund_accounts (name) WHERE is_deleted = FALSE"
                )
            )

    _ensure_fund_account_permissions(engine)


def add_finance_record_account_column(engine: Engine) -> None:
    """为 finance_records 表添加 account_id 列与 (account_id, record_date) 索引（幂等）."""
    if not _column_exists(engine, "finance_records", "account_id"):
        logger.info("迁移：为 finance_records 表添加 account_id 列")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE finance_records ADD COLUMN account_id uuid"))

    if not _index_exists(engine, "idx_finance_account_date"):
        logger.info("迁移：创建 idx_finance_account_date 索引")
        with engine.begin() as conn:
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS idx_finance_account_date ON finance_records (account_id, record_date)")
            )


def close_orphan_finance_records(engine: Engine) -> None:
    """收敛历史孤儿流水：所属项目已软删、流水仍存活的记录一并软删（幂等）.

    背景（2026-10-21 缺陷）：`delete_project` 早年只置 `projects.is_deleted`，
    没有联动 `finance_records`。结果是已删项目的流水长期存活，产生两个真实问题：
      1. 账户流水页仍列出它们，点「补上账户」→ `update_record` 校验项目存在
         失败 → 404「项目不存在」（用户看到「有记录却不能改」的自相矛盾）；
      2. 项目账本全局汇总把这些账继续算进收支与笔数。

    修复分两层：
      - 代码层：`delete_project` 现在与项目同事务软删流水（今后不再产生）；
      - 数据层：本迁移收敛存量孤儿流水（`UPDATE` 而非 `DELETE`，保留可追溯）。

    ⚠️ 幂等：仅更新「项目已删且流水未删」的行，重复执行时第二次命中 0 行。
    ⚠️ 可逆性：risk=B（确定性回填），但**不做自动反向**——把流水恢复成存活会让
       第 1 个问题复发；如确需恢复数据，应按备份还原并手工核对。

    Returns:
        None

    """
    with engine.begin() as conn:
        result = conn.execute(
            text(
                "UPDATE finance_records fr "
                "SET is_deleted = TRUE, updated_at = NOW() "
                "FROM projects p "
                "WHERE fr.project_id = p.id "
                "  AND p.is_deleted = TRUE "
                "  AND fr.is_deleted = FALSE"
            )
        )
        if result.rowcount:
            logger.info("迁移：收敛 %d 条所属项目已删除的孤儿流水（软删）", result.rowcount)
        else:
            logger.debug("迁移：无孤儿流水需要收敛")


def backfill_finance_record_operator(engine: Engine) -> None:
    """回填 finance_records.operator_id（仅还原可精确追溯的部分）.

    背景（2026-10-21 缺陷）：`create_record` 构造 ``FinanceRecord`` 时漏传
    ``operator_id``，导致 2026-10-21 之前写入的流水 ``operator_id`` 恒为 NULL，
    界面「记账人」列永远显示「—」。

    修复策略（**不猜测**）：
      1. 代码层已修复写入（新建流水会带上记账人）；
      2. 历史数据仅回填**能精确对应**的部分——``operation_logs`` 里
         ``resource_type='project_finance' / action='create' / resource_id=<record_id>``
         且 ``user_id`` 非空的记录，把该 user_id 写回 ``finance_records.operator_id``；
      3. 其余历史流水保持 NULL（无可靠来源，猜错比留空更差）。

    幂等：仅更新 ``operator_id IS NULL`` 的行，重复执行命中 0 行。

    Args:
        engine: 数据库引擎

    Returns:
        None

    """
    with engine.begin() as conn:
        result = conn.execute(
            text(
                "UPDATE finance_records fr "
                "SET operator_id = ol.user_id, updated_at = NOW() "
                "FROM ("
                "  SELECT DISTINCT ON (resource_id) resource_id, user_id "
                "  FROM operation_logs "
                "  WHERE resource_type = 'project_finance' "
                "    AND action = 'create' "
                "    AND user_id IS NOT NULL "
                "  ORDER BY resource_id, created_at ASC"
                ") ol "
                "WHERE fr.id::text = ol.resource_id "
                "  AND fr.operator_id IS NULL"
            )
        )
        if result.rowcount:
            logger.info("迁移：回填 %d 条流水的记账人（来源 operation_logs）", result.rowcount)
        else:
            logger.debug("迁移：无需回填流水记账人")
