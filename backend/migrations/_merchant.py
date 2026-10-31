"""商户管理模块迁移（V01 平台基座）.

v103 仅做种子写入，不新增业务表：
- 6 个商户域权限点（merchant:read/write/visit/broker/agreement/map）；
- 内置角色默认授权：admin 全量、operator 全量、user 读/写/拜访/协议；
- 4 个业务字典组及已确认字典项。

授权策略对齐 ``migrate_permission_system``：角色若被人工编辑过
（``roles.permissions_customized = TRUE``），除 admin 外不自动补权限，
避免把运营/员工主动移除的权限在重启时静默加回。
"""

import logging
import uuid

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

# 与 migrations/_seeds.py::_PERMISSIONS_SEED 中的同名条目逐字段一致
MERCHANT_PERMISSION_DEFS: list[dict[str, object]] = [
    {
        "code": "merchant:read",
        "name": "商户域查看",
        "module": "merchant",
        "category": "api",
        "sort_order": 10,
        "description": "门店、经纪人、协议、线索等商户域数据的查看",
    },
    {
        "code": "merchant:write",
        "name": "商户域维护",
        "module": "merchant",
        "category": "api",
        "sort_order": 20,
        "description": "公司/门店新增、编辑、停用、软删、合并与商户域字典维护",
    },
    {
        "code": "merchant:visit",
        "name": "拜访记录",
        "module": "merchant",
        "category": "api",
        "sort_order": 30,
        "description": "拜访登记、补录与拜访记录查看",
    },
    {
        "code": "merchant:broker",
        "name": "经纪人管理",
        "module": "merchant",
        "category": "api",
        "sort_order": 40,
        "description": "经纪人档案维护、绑定、解绑、换店",
    },
    {
        "code": "merchant:agreement",
        "name": "协议管理",
        "module": "merchant",
        "category": "api",
        "sort_order": 50,
        "description": "协议发起、签署、作废、归档",
    },
    {
        "code": "merchant:map",
        "name": "地图与轨迹",
        "module": "merchant",
        "category": "api",
        "sort_order": 60,
        "description": "后台门店地图与拜访轨迹查看",
    },
]

MERCHANT_PERMISSION_CODES: tuple[str, ...] = tuple(str(p["code"]) for p in MERCHANT_PERMISSION_DEFS)

# 角色默认授权（V01 BR-M12-009/010、确认记录 N10）
_ROLE_GRANTS: dict[str, tuple[str, ...]] = {
    "admin": MERCHANT_PERMISSION_CODES,
    "operator": MERCHANT_PERMISSION_CODES,
    "user": ("merchant:read", "merchant:write", "merchant:visit", "merchant:agreement"),
}

# 四个字典组种子项（V01 4.3.1；merchant_store_type 本期保留空组）
MERCHANT_DICT_SEEDS: list[dict[str, object]] = [
    {
        "dict_code": "merchant_cooperation_status",
        "code": "not_cooperated",
        "label": "未合作",
        "sort_order": 10,
    },
    {
        "dict_code": "merchant_cooperation_status",
        "code": "negotiating",
        "label": "洽谈中",
        "sort_order": 20,
    },
    {
        "dict_code": "merchant_cooperation_status",
        "code": "cooperated",
        "label": "已合作",
        "sort_order": 30,
    },
    {
        "dict_code": "merchant_cooperation_status",
        "code": "paused",
        "label": "暂停",
        "sort_order": 40,
    },
    {
        "dict_code": "merchant_cooperation_status",
        "code": "terminated",
        "label": "终止",
        "sort_order": 50,
    },
    {
        "dict_code": "merchant_visit_result",
        "code": "not_met",
        "label": "未见到人",
        "sort_order": 10,
    },
    {
        "dict_code": "merchant_visit_result",
        "code": "interested",
        "label": "有意向",
        "sort_order": 20,
    },
    {
        "dict_code": "merchant_visit_result",
        "code": "cooperated",
        "label": "已合作",
        "sort_order": 30,
    },
    {
        "dict_code": "merchant_visit_result",
        "code": "other",
        "label": "其他",
        "sort_order": 40,
    },
    {
        "dict_code": "merchant_agreement_status",
        "code": "not_initiated",
        "label": "未发起",
        "sort_order": 10,
    },
    {
        "dict_code": "merchant_agreement_status",
        "code": "pending_sign",
        "label": "待签署",
        "sort_order": 20,
    },
    {
        "dict_code": "merchant_agreement_status",
        "code": "signed",
        "label": "已签署",
        "sort_order": 30,
    },
    {
        "dict_code": "merchant_agreement_status",
        "code": "expired",
        "label": "已过期",
        "sort_order": 40,
    },
    {
        "dict_code": "merchant_agreement_status",
        "code": "voided",
        "label": "已作废",
        "sort_order": 50,
    },
]


def _insert_permissions(engine: Engine) -> None:
    """幂等插入 6 个权限点，返回 code → id 映射."""
    codes: dict[str, str] = {}
    with engine.begin() as conn:
        for perm in MERCHANT_PERMISSION_DEFS:
            existing_id = conn.execute(
                text("SELECT id FROM permissions WHERE code = :code"),
                {"code": perm["code"]},
            ).scalar()
            if existing_id is None:
                permission_id = str(uuid.uuid4())
                conn.execute(
                    text(
                        "INSERT INTO permissions "
                        "(id, code, name, module, category, sort_order, is_system, risk_level, "
                        " description, created_at, updated_at) "
                        "VALUES (:id, :code, :name, :module, :category, :sort_order, TRUE, 'L5', "
                        " :description, NOW(), NOW()) "
                        "ON CONFLICT (code) DO NOTHING"
                    ),
                    {
                        "id": permission_id,
                        "code": perm["code"],
                        "name": perm["name"],
                        "module": perm["module"],
                        "category": perm["category"],
                        "sort_order": perm["sort_order"],
                        "description": perm["description"],
                    },
                )
                logger.info("迁移 v103：已插入权限点 %s", perm["code"])
                codes[str(perm["code"])] = permission_id
            else:
                codes[str(perm["code"])] = str(existing_id)
    return codes


def _grant_roles(engine: Engine, permission_ids: dict[str, str]) -> None:
    """按角色默认授权（幂等；非 admin 角色被人工编辑过则跳过）."""
    with engine.begin() as conn:
        for role_code, grant_codes in _ROLE_GRANTS.items():
            row = conn.execute(
                text("SELECT id, permissions_customized FROM roles WHERE code = :code"),
                {"code": role_code},
            ).first()
            if row is None:
                logger.warning("迁移 v103：角色 %s 不存在，跳过授权（由权限种子同步补齐）", role_code)
                continue
            role_id = str(row[0])
            customized = bool(row[1])
            if customized and role_code != "admin":
                logger.info("迁移 v103：角色 %s 权限集被人工编辑过，跳过默认授权", role_code)
                continue
            for code in grant_codes:
                permission_id = permission_ids.get(code)
                if permission_id is None:
                    continue
                granted = conn.execute(
                    text("SELECT 1 FROM role_permissions WHERE role_id = :rid AND permission_id = :pid"),
                    {"rid": role_id, "pid": permission_id},
                ).first()
                if granted is None:
                    conn.execute(
                        text("INSERT INTO role_permissions (role_id, permission_id) VALUES (:rid, :pid)"),
                        {"rid": role_id, "pid": permission_id},
                    )


def _insert_dicts(engine: Engine) -> None:
    """幂等插入 4 个字典组的种子项."""
    inserted = 0
    with engine.begin() as conn:
        for seed in MERCHANT_DICT_SEEDS:
            result = conn.execute(
                text(
                    "INSERT INTO biz_dict_items "
                    "(id, dict_code, code, label, business_form, category, sort_order, enabled, "
                    "is_builtin, remark, created_at, updated_at) "
                    "VALUES (gen_random_uuid(), :dict_code, :code, :label, NULL, NULL, :sort_order, "
                    "TRUE, TRUE, NULL, NOW(), NOW()) "
                    "ON CONFLICT (dict_code, code) DO NOTHING"
                ),
                seed,
            )
            inserted += result.rowcount
    if inserted:
        logger.info("迁移 v103：初始化 %d 条商户域字典种子", inserted)


def seed_merchant_platform(engine: Engine) -> None:
    """v103：商户域权限点 + 角色默认授权 + 业务字典种子（幂等）."""
    permission_ids = _insert_permissions(engine)
    _grant_roles(engine, permission_ids)
    _insert_dicts(engine)
