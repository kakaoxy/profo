"""业务字典表迁移（建表 + 索引 + 种子 + 权限点）.

对应 spec ``techdebt-config-unify`` T1.1。全部步骤幂等：
- 建表用 ``Base.metadata.create_all(checkfirst=True)``（CREATE TABLE IF NOT EXISTS 语义）；
- 索引先 ``_index_exists`` 再补建（表已存在但索引缺失的中间态可修复）；
- 种子按 ``(dict_code, code)`` 唯一键 ``ON CONFLICT DO NOTHING``，不覆盖运营已改的
  ``label/sort_order/enabled``（重启不回滚人工配置，D6 语义）；
- ``dict:manage`` 权限点 ``WHERE NOT EXISTS`` 插入，并显式授予内置 admin 角色
  （新权限点无人可能「故意移除」，admin 免于 ``permissions_customized`` 跳过而丢失入口）。

种子集来源（决策记录，见 spec §8「未覆盖/不确定」）：
- ``recruit_source`` ← ``models.recruit.recruit.RecruitLeadSource``（card/poster）；
- ``document_template`` ← ``constants/documents.py`` 全量 30 项（携带 business_form/category/
  display_order），``code`` 为 ``<business_form>:<文书名>``——``uq_biz_dict_items(dict_code, code)``
  跨业务形式唯一，而两种业务形式存在同名文书（其他/收款收据/房屋交接书），故必须带前缀；
  消费方只用 ``label`` 作文书名、``sort_order`` 作 display_order；
- ``lead_attr_channel`` ← 代码内已知的上报值（小程序 valuation-share 的 ``card``、
  recruit/property-sheet 的 ``poster``、公共 share/timeline 口径的 ``timeline``/``direct``）；
  ⚠️ 生产存量自由文本 distinct 值盘点需连生产库，本期未执行，由运营在
  ``/admin/settings/dicts`` 补录（字典外值经宽松校验照常落库，见 D5）；
- ``renovation_stage_alias`` ← ``models.common.base.RenovationStage`` 7 值（label 与 code 同值，
  运营可改 label 改进展示，入库值不变 —— D4）。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from constants.documents import AGENT_DOCUMENTS, WHOLESALE_DOCUMENTS
from migrations._helpers import _index_exists

logger = logging.getLogger(__name__)

# 字典组编码（与前端 useDict("...") 字符串一致）
DICT_LEAD_ATTR_CHANNEL = "lead_attr_channel"
DICT_RECRUIT_SOURCE = "recruit_source"
DICT_DOCUMENT_TEMPLATE = "document_template"
DICT_RENOVATION_STAGE_ALIAS = "renovation_stage_alias"

# 本期支持的字典组（公开端点/管理端以此为白名单，未登记组一律 404）
SUPPORTED_DICT_CODES: tuple[str, ...] = (
    DICT_LEAD_ATTR_CHANNEL,
    DICT_RECRUIT_SOURCE,
    DICT_DOCUMENT_TEMPLATE,
    DICT_RENOVATION_STAGE_ALIAS,
)

# dict:manage 权限点种子（仅 admin；对照 migrations/_seeds.py::_PERMISSIONS_SEED 同构）
_DICT_MANAGE_PERMISSION: dict = {
    "code": "dict:manage",
    "name": "管理业务字典",
    "module": "dict",
    "category": "api",
    "sort_order": 10,
    "description": "维护业务字典条目（新增/改展示名/排序/停用），变更写操作审计",
}


def _recruit_source_seeds() -> list[dict]:
    """招募来源种子（code 逐字复制 RecruitLeadSource，避免小程序 hardcode 值失配）."""
    from models.recruit import RecruitLeadSource

    labels = {RecruitLeadSource.CARD: "小程序卡片", RecruitLeadSource.POSTER: "招募海报"}
    return [
        {
            "dict_code": DICT_RECRUIT_SOURCE,
            "code": source.value,
            "label": labels[source],
            "sort_order": index * 10,
            "business_form": None,
            "category": None,
        }
        for index, source in enumerate(RecruitLeadSource)
    ]


def _document_template_seeds() -> list[dict]:
    """文书模板种子（常量全量 30 项，code 带业务形式前缀保证全局唯一）."""
    seeds: list[dict] = []
    for business_form, documents in (
        ("agent", AGENT_DOCUMENTS),
        ("wholesale", WHOLESALE_DOCUMENTS),
    ):
        seeds.extend(
            {
                "dict_code": DICT_DOCUMENT_TEMPLATE,
                "code": f"{business_form}:{document.document_name}",
                "label": document.document_name,
                "sort_order": document.display_order,
                "business_form": business_form,
                "category": document.category,
            }
            for document in documents
        )
    return seeds


def _known_channel_seeds() -> list[dict]:
    """归因渠道种子（代码内已知上报值，详见模块 docstring 的「未覆盖」说明）."""
    rows = (
        ("card", "分享卡片"),
        ("poster", "分享海报"),
        ("timeline", "朋友圈"),
        ("direct", "直接进入"),
    )
    return [
        {
            "dict_code": DICT_LEAD_ATTR_CHANNEL,
            "code": code,
            "label": label,
            "sort_order": index * 10,
            "business_form": None,
            "category": None,
        }
        for index, (code, label) in enumerate(rows)
    ]


def _renovation_stage_alias_seeds() -> list[dict]:
    """改造阶段别名种子（code = 入库中文值，label 可改，入库值不变 —— D4）."""
    from models.common.base import RenovationStage

    return [
        {
            "dict_code": DICT_RENOVATION_STAGE_ALIAS,
            "code": stage.value,
            "label": stage.value,
            "sort_order": index * 10,
            "business_form": None,
            "category": None,
        }
        for index, stage in enumerate(RenovationStage)
    ]


def _all_seeds() -> list[dict]:
    """全部种子（合并四组，顺序即默认 sort_order 生成顺序）."""
    return [
        *_recruit_source_seeds(),
        *_document_template_seeds(),
        *_known_channel_seeds(),
        *_renovation_stage_alias_seeds(),
    ]


def _ensure_dict_manage_permission(engine: Engine) -> None:
    """幂等写入 dict:manage 权限点并授予内置 admin 角色.

    与 ``migrate_permission_system`` 的种子回填不同：新权限点在既有库中不可能被
    「人工移除」，故 admin 角色即使 ``permissions_customized=TRUE`` 也补授，
    否则上线后管理员打不开字典管理页（fail loud 的入口缺口）。
    """
    perm = _DICT_MANAGE_PERMISSION
    with engine.begin() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM permissions WHERE code = :code"),
            {"code": perm["code"]},
        ).scalar()
        if not exists:
            # 条件插入放在 Python 判断内：`INSERT ... SELECT ... WHERE NOT EXISTS` 會在同一
            # 参数用于 SELECT 与 WHERE 两处时触发 PG AmbiguousParameter（text vs varchar）
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
        conn.execute(
            text(
                "INSERT INTO role_permissions (role_id, permission_id) "
                "SELECT r.id, p.id FROM roles r CROSS JOIN permissions p "
                "WHERE r.code = 'admin' AND p.code = :code "
                "AND NOT EXISTS ("
                "  SELECT 1 FROM role_permissions rp "
                "  WHERE rp.role_id = r.id AND rp.permission_id = p.id"
                ")",
            ),
            {"code": perm["code"]},
        )


def create_biz_dict_items_table(engine: Engine) -> None:
    """幂等创建 ``biz_dict_items`` 表 + 索引 + 种子 + dict:manage 权限点."""
    from models import Base
    from models.system import BizDictItem

    Base.metadata.create_all(bind=engine, tables=[BizDictItem.__table__], checkfirst=True)

    for index_name, ddl in (
        (
            "uq_biz_dict_items",
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_biz_dict_items ON biz_dict_items (dict_code, code)",
        ),
        (
            "idx_biz_dict_items_dict",
            "CREATE INDEX IF NOT EXISTS idx_biz_dict_items_dict ON biz_dict_items (dict_code, enabled, sort_order)",
        ),
    ):
        if not _index_exists(engine, index_name):
            logger.info("迁移：创建 %s 索引", index_name)
            with engine.begin() as conn:
                conn.execute(text(ddl))

    seeds = _all_seeds()
    inserted = 0
    with engine.begin() as conn:
        for seed in seeds:
            result = conn.execute(
                text(
                    "INSERT INTO biz_dict_items "
                    "(id, dict_code, code, label, business_form, category, sort_order, enabled, "
                    "is_builtin, remark, created_at, updated_at) "
                    "VALUES (gen_random_uuid(), :dict_code, :code, :label, :business_form, :category, "
                    ":sort_order, TRUE, TRUE, NULL, NOW(), NOW()) "
                    "ON CONFLICT (dict_code, code) DO NOTHING",
                ),
                seed,
            )
            inserted += result.rowcount
    if inserted:
        logger.info("迁移：初始化 %d 条业务字典种子", inserted)

    _ensure_dict_manage_permission(engine)
