"""迁移注册表：``_run_all_migrations`` 顶层调用单元的版本化登记（迭代一 T1.2）。

**权威口径**
- ``version`` = ``1..90``，严格按 ``migrations/__init__.py::_run_all_migrations``
  的**当前调用顺序**编号（实测 90 项，非计划稿的 77/80；见总纲 §1 B1/B8）。
- 新增迁移**只能追加**在 ``MIGRATIONS`` 末尾，``version`` 从 ``NEXT_VERSION``（88）起
  严格递增，禁止插入历史中间序号，禁止复用已删除版本号。
- 粒度 = 一次顶层 ``fn(engine)`` 调用；wrapper 内部子步骤（如
  ``create_marketing_project_subscription_table`` 内的 ``add_last_subscribed_at_*``）
  不单列，随父项一起备份/补偿（K2）。
- ``name`` 一经登记**不得修改**（参与 checksum 与审计）；文件名约定
  ``compensations/<version:03d>_<name>.py``。

**元数据字段**
- ``kind``：``schema``（DDL）/ ``data``（数据改写）/ ``seed``（种子写入）
- ``risk``：``A`` 纯新增可 DROP 回退 / ``B`` 确定性回填可脚本反向 /
  ``C`` 只能按备份恢复 / ``D`` 不可回滚（外部副作用）
- ``backup``：``none`` / ``table``（``--data-only`` 单表）/ ``full``（全库）
- ``reversible``：是否允许自动补偿（``C``/``D`` 一律 False）
- ``compensation``：实脚本模块名（``migrations/compensations/<...>.py``）；
  为空时按 A 级通用 DROP（``compensations/generic_drop.py``）或 ``restore-hint``

**登记期自检**（``Migration.__post_init__`` + 单测强制）
- ``backup="table"`` 必须给出 ``backup_tables``；
- ``risk`` 为 ``C``/``D`` 时 ``reversible`` 必须 False 且 ``backup`` 不得为 ``none``；
- ``version`` 连续无缺口、``name`` 全局唯一且符合 ``^[a-z][a-z0-9_]{2,199}$``。
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

from sqlalchemy.engine import Engine

from migrations._batched_backfill_leads_finance import batched_backfill_leads_and_finance
from migrations._bd_audit_20261017_fixes import run_bd_audit_20261017_fixes
from migrations._bd_audit_20261018_fixes import run_bd_audit_20261018_fixes
from migrations._bd_community_address_widen import widen_community_address_column
from migrations._bd_import_task_recovery import recover_stale_bd_import_tasks
from migrations._bd_room_floor_backfill import backfill_bd_room_floor
from migrations._biz_dicts import create_biz_dict_items_table
from migrations._building_dictionary import run_building_dictionary_migrations
from migrations._clear_wechat_session_key import clear_wechat_session_key
from migrations._community_images import create_community_images_table
from migrations._customer_follow_ups import create_customer_follow_ups_table
from migrations._finance import (
    add_cashflow_category_enum_values,
    add_finance_record_counterparty_columns,
    add_finance_record_receipt_urls_column,
    add_finance_record_subject_columns,
    add_project_finance_settlement_columns,
    create_finance_record_logs_table,
    create_finance_subjects_table,
    create_investment_tables,
    migrate_finance_subjects_modes_to_jsonb,
    rename_investment_subjects,
    rename_return_adjustment_columns,
)
from migrations._fund_accounts import (
    add_finance_record_account_column,
    backfill_finance_record_operator,
    close_orphan_finance_records,
    create_fund_account_tables,
)
from migrations._keys import (
    add_key_audit_share_id_index,
    add_project_key_note_column,
    create_key_tables,
)
from migrations._keys_seq import add_normal_key_seq_column
from migrations._marketing_notify import (
    add_price_change_id_index_to_notify_logs,
    add_price_change_id_to_notify_logs,
    add_published_at_to_l4_marketing_projects,
    create_marketing_project_subscription_table,
    create_marketing_subscription_tables,
    widen_subscription_openid_columns,
)
from migrations._permission_system import (
    add_permission_foreign_indexes,
    add_reports_indexes,
    create_user_roles_table,
    create_wechat_oauth_tables,
    migrate_permission_system,
    migrate_project_business_permission,
)
from migrations._project_archive import add_project_archive_columns
from migrations._project_booking_share import create_project_booking_and_share_tables
from migrations._project_booking_status import add_project_booking_status_column
from migrations._project_sale_partial_unique import rebuild_project_sale_unique_index
from migrations._property_sheet import create_property_sheet_tables
from migrations._recruit import (
    add_poster_bg_url_to_campaigns,
    create_recruit_tables,
    ensure_campaign_status_created_index,
    ensure_visit_referrer_index,
)
from migrations._role_system import (
    add_permission_risk_level_column,
    add_role_is_system_column,
)
from migrations._schema_columns import (
    add_contact_person_id_column,
    add_lead_referrer_column,
    add_renovation_extra_amount_columns,
    add_stage_completed_dates_column,
    add_thumbnail_url_to_photos,
    drop_other_decoration_amount_column,
    drop_soft_actual_cost_column,
)
from migrations._search_indexes import add_trgm_search_indexes
from migrations._system_configs import create_system_configs_table
from migrations._type_migrations import (
    migrate_all_datetime_columns_to_timestamptz,
    migrate_encrypted_columns_to_text,
    migrate_project_date_columns_to_date,
    migrate_project_document_archive_date_to_date,
    migrate_record_date_to_timestamptz,
    migrate_user_datetime_columns_to_timestamptz,
    migrate_uuid_columns_to_native_uuid,
    widen_url_columns_to_text,
)
from migrations._user_security import (
    add_phone_hash_column,
    add_token_version_column,
    add_user_temporary_fields,
    encrypt_existing_phones,
    populate_phone_hash,
)
from migrations.add_counterparty_type import add_counterparty_type_to_finance_records
from migrations.add_lead_auditor_index import add_lead_auditor_index
from migrations.add_lead_eval_history_and_expected_price import add_lead_eval_history_and_expected_price
from migrations.add_lead_eval_verdict_fields import add_lead_eval_verdict_fields
from migrations.add_lead_referrer_index import add_lead_referrer_index
from migrations.add_lead_status_lost_to_competitor import add_lead_status_lost_to_competitor
from migrations.add_media_type_column import add_media_type_to_renovation_photos
from migrations.add_project_document_category import add_project_document_category
from migrations.backfill_lead_total_price_from_expected import backfill_lead_total_price_from_expected
from migrations.backfill_lead_unit_price import backfill_lead_unit_price
from migrations.cleanup_reserved_contracts import cleanup_reserved_contracts
from migrations.fix_image_urls import run_fix_image_urls
from migrations.migrate_add_ended_status import migrate_add_ended_status
from migrations.migrate_installation_stage import migrate_installation_stage_to_delivery
from migrations.migrate_uploads_to_oss import migrate_uploads_to_oss
from migrations.rebuild_contract_no_index import rebuild_contract_no_index

Kind = Literal["schema", "data", "seed"]
Backup = Literal["none", "table", "full"]
Risk = Literal["A", "B", "C", "D"]


@dataclass(frozen=True, slots=True)
class Migration:
    """一条可执行迁移的登记元数据."""

    version: int
    name: str
    fn: Callable[[Engine], None]
    kind: Kind
    risk: Risk
    backup: Backup
    reversible: bool
    backup_tables: tuple[str, ...] = ()
    compensation: str | None = None
    description: str = ""

    def __post_init__(self) -> None:
        """登记期自检：拦截「备份缺失 / 声称可逆」的高风险登记."""
        if self.backup == "table" and not self.backup_tables:
            msg = f"v{self.version} {self.name}: backup=table 必须提供 backup_tables"
            raise ValueError(msg)
        if self.risk in ("C", "D") and self.reversible:
            msg = f"v{self.version} {self.name}: 风险 {self.risk} 不得声明 reversible=True"
            raise ValueError(msg)
        if self.risk in ("C", "D") and self.backup == "none":
            msg = f"v{self.version} {self.name}: 风险 {self.risk} 必须备份（backup != none）"
            raise ValueError(msg)
        if self.reversible and self.backup == "none" and self.kind == "data":
            msg = f"v{self.version} {self.name}: 数据类迁移不得声明可逆却无备份"
            raise ValueError(msg)


MIGRATIONS: tuple[Migration, ...] = (
    Migration(
        version=1,
        name="add_token_version_column",
        fn=add_token_version_column,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="users.token_version 列（H-002）",
    ),
    Migration(
        version=2,
        name="add_phone_hash_column",
        fn=add_phone_hash_column,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="users.phone_hash 列 + 唯一索引（H-006）",
    ),
    Migration(
        version=3,
        name="encrypt_existing_phones",
        fn=encrypt_existing_phones,
        kind="data",
        risk="C",
        backup="table",
        reversible=False,
        backup_tables=("users",),
        description="明文手机号 Fernet 加密（不可还原，不提供解密脚本）",
    ),
    Migration(
        version=4,
        name="populate_phone_hash",
        fn=populate_phone_hash,
        kind="data",
        risk="B",
        backup="table",
        reversible=True,
        backup_tables=("users",),
        compensation="0004_populate_phone_hash",
        description="回填 users.phone_hash（H-006）",
    ),
    Migration(
        version=5,
        name="add_user_temporary_fields",
        fn=add_user_temporary_fields,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="users 临时账号/合并目标列 + idx_user_temporary",
    ),
    Migration(
        version=6,
        name="add_stage_completed_dates_column",
        fn=add_stage_completed_dates_column,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="l4_marketing_projects.stage_completed_dates",
    ),
    Migration(
        version=7,
        name="add_thumbnail_url_to_photos",
        fn=add_thumbnail_url_to_photos,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="renovation_photos/property_media.thumbnail_url",
    ),
    Migration(
        version=8,
        name="add_renovation_extra_amount_columns",
        fn=add_renovation_extra_amount_columns,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="project_renovations 定制柜/窗户/墙面金额列",
    ),
    Migration(
        version=9,
        name="drop_other_decoration_amount_column",
        fn=drop_other_decoration_amount_column,
        kind="schema",
        risk="C",
        backup="table",
        reversible=False,
        backup_tables=("project_renovations",),
        description="删除 project_renovations.other_decoration_amount",
    ),
    Migration(
        version=10,
        name="drop_soft_actual_cost_column",
        fn=drop_soft_actual_cost_column,
        kind="schema",
        risk="C",
        backup="table",
        reversible=False,
        backup_tables=("project_renovations",),
        description="删除 project_renovations.soft_actual_cost",
    ),
    Migration(
        version=11,
        name="add_contact_person_id_column",
        fn=add_contact_person_id_column,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="project_renovations.contact_person_id",
    ),
    Migration(
        version=12,
        name="run_fix_image_urls",
        fn=run_fix_image_urls,
        kind="data",
        risk="C",
        backup="table",
        reversible=False,
        backup_tables=("renovation_photos", "property_media"),
        description="绝对图片 URL → 相对路径",
    ),
    Migration(
        version=13,
        name="create_investment_tables",
        fn=create_investment_tables,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="跟投管理 4 表（空表才可回滚）",
    ),
    Migration(
        version=14,
        name="rename_return_adjustment_columns",
        fn=rename_return_adjustment_columns,
        kind="schema",
        risk="C",
        backup="full",
        reversible=False,
        description="回报率列重命名 + 旧数据清空",
    ),
    Migration(
        version=15,
        name="add_finance_record_counterparty_columns",
        fn=add_finance_record_counterparty_columns,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="finance_records.counterparty/receipt_url",
    ),
    Migration(
        version=16,
        name="create_finance_record_logs_table",
        fn=create_finance_record_logs_table,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="finance_record_logs 表（空表才可回滚）",
    ),
    Migration(
        version=17,
        name="create_finance_subjects_table",
        fn=create_finance_subjects_table,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="finance_subjects 表 + 预置科目（非空不可回滚）",
    ),
    Migration(
        version=18,
        name="migrate_finance_subjects_modes_to_jsonb",
        fn=migrate_finance_subjects_modes_to_jsonb,
        kind="schema",
        risk="C",
        backup="table",
        reversible=False,
        backup_tables=("finance_subjects",),
        description="modes JSON→JSONB + GIN 索引",
    ),
    Migration(
        version=19,
        name="add_finance_record_subject_columns",
        fn=add_finance_record_subject_columns,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="finance_records 科目/流入流出列 + 回填",
    ),
    Migration(
        version=20,
        name="add_finance_record_receipt_urls_column",
        fn=add_finance_record_receipt_urls_column,
        kind="schema",
        risk="B",
        backup="table",
        reversible=True,
        backup_tables=("finance_records",),
        description="receipt_urls JSON + 旧单值回填",
    ),
    Migration(
        version=21,
        name="add_cashflow_category_enum_values",
        fn=add_cashflow_category_enum_values,
        kind="schema",
        risk="C",
        backup="full",
        reversible=False,
        description="cashflowcategory 枚举同步（PG 不能删枚举值）",
    ),
    Migration(
        version=22,
        name="add_project_finance_settlement_columns",
        fn=add_project_finance_settlement_columns,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="projects 结算 3 列 + financeactiontype 枚举",
    ),
    Migration(
        version=23,
        name="add_project_archive_columns",
        fn=add_project_archive_columns,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="projects 归档 3 列（is_archived/archived_at/archived_note）",
    ),
    Migration(
        version=24,
        name="migrate_add_ended_status",
        fn=migrate_add_ended_status,
        kind="schema",
        risk="C",
        backup="full",
        reversible=False,
        description="projectstatus 加 ended + CHECK 约束重建",
    ),
    Migration(
        version=25,
        name="migrate_record_date_to_timestamptz",
        fn=migrate_record_date_to_timestamptz,
        kind="schema",
        risk="C",
        backup="table",
        reversible=False,
        backup_tables=("finance_records",),
        description="finance_records.record_date → timestamptz",
    ),
    Migration(
        version=26,
        name="migrate_project_date_columns_to_date",
        fn=migrate_project_date_columns_to_date,
        kind="schema",
        risk="C",
        backup="table",
        reversible=False,
        backup_tables=("projects",),
        description="projects 日期列 VARCHAR→date",
    ),
    Migration(
        version=27,
        name="migrate_user_datetime_columns_to_timestamptz",
        fn=migrate_user_datetime_columns_to_timestamptz,
        kind="schema",
        risk="C",
        backup="table",
        reversible=False,
        backup_tables=("users", "refresh_tokens", "api_keys"),
        description="users/refresh_tokens/api_keys 时间列 → timestamptz",
    ),
    Migration(
        version=28,
        name="migrate_encrypted_columns_to_text",
        fn=migrate_encrypted_columns_to_text,
        kind="schema",
        risk="A",
        backup="none",
        reversible=False,
        description="加密列 VARCHAR→text（放宽不可逆）",
    ),
    Migration(
        version=29,
        name="widen_url_columns_to_text",
        fn=widen_url_columns_to_text,
        kind="schema",
        risk="A",
        backup="none",
        reversible=False,
        description="URL 列 VARCHAR→text（放宽不可逆）",
    ),
    Migration(
        version=30,
        name="migrate_all_datetime_columns_to_timestamptz",
        fn=migrate_all_datetime_columns_to_timestamptz,
        kind="schema",
        risk="C",
        backup="full",
        reversible=False,
        description="全模型时间列统一 timestamptz",
    ),
    Migration(
        version=31,
        name="migrate_uuid_columns_to_native_uuid",
        fn=migrate_uuid_columns_to_native_uuid,
        kind="schema",
        risk="C",
        backup="full",
        reversible=False,
        description="UUID 列 VARCHAR→原生 uuid",
    ),
    Migration(
        version=32,
        name="create_wechat_oauth_tables",
        fn=create_wechat_oauth_tables,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="微信 OAuth state/temp_code 表",
    ),
    Migration(
        version=33,
        name="create_user_roles_table",
        fn=create_user_roles_table,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="user_roles 关联表（非空不可回滚）",
    ),
    Migration(
        version=34,
        name="migrate_installation_stage_to_delivery",
        fn=migrate_installation_stage_to_delivery,
        kind="data",
        risk="C",
        backup="table",
        reversible=False,
        backup_tables=("projects", "renovation_photos", "l4_marketing_media"),
        description="安装阶段→交付阶段值改写",
    ),
    Migration(
        version=35,
        name="add_media_type_to_renovation_photos",
        fn=add_media_type_to_renovation_photos,
        kind="schema",
        risk="B",
        backup="table",
        reversible=True,
        backup_tables=("renovation_photos",),
        description="media_type 列 + 存量按 URL 后缀回填",
    ),
    Migration(
        version=36,
        name="add_counterparty_type_to_finance_records",
        fn=add_counterparty_type_to_finance_records,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="finance_records.counterparty_type",
    ),
    Migration(
        version=37,
        name="cleanup_reserved_contracts",
        fn=cleanup_reserved_contracts,
        kind="data",
        risk="C",
        backup="table",
        reversible=False,
        backup_tables=("project_contracts",),
        description="删除占用合同编号的合同行",
    ),
    Migration(
        version=38,
        name="rebuild_contract_no_index",
        fn=rebuild_contract_no_index,
        kind="data",
        risk="C",
        backup="table",
        reversible=False,
        backup_tables=("project_contracts",),
        description="合同编号部分唯一索引重建 + 清理已删项目合同",
    ),
    Migration(
        version=39,
        name="migrate_permission_system",
        fn=migrate_permission_system,
        kind="schema",
        risk="C",
        backup="table",
        reversible=False,
        backup_tables=("roles", "permissions", "role_permissions", "operation_logs"),
        description="权限系统三表 + 种子 + permissions_customized 回填",
    ),
    Migration(
        version=40,
        name="migrate_project_business_permission",
        fn=migrate_project_business_permission,
        kind="seed",
        risk="B",
        backup="table",
        reversible=True,
        backup_tables=("permissions", "role_permissions"),
        description="project_business 权限点种子",
    ),
    Migration(
        version=41,
        name="add_role_is_system_column",
        fn=add_role_is_system_column,
        kind="schema",
        risk="B",
        backup="table",
        reversible=True,
        backup_tables=("roles",),
        description="roles.is_system 列 + 内置角色回填",
    ),
    Migration(
        version=42,
        name="add_permission_risk_level_column",
        fn=add_permission_risk_level_column,
        kind="schema",
        risk="B",
        backup="table",
        reversible=True,
        backup_tables=("permissions",),
        description="permissions.risk_level 列 + 回填",
    ),
    Migration(
        version=43,
        name="add_permission_foreign_indexes",
        fn=add_permission_foreign_indexes,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="权限关联外键索引（operator/role/permission）",
    ),
    Migration(
        version=44,
        name="add_reports_indexes",
        fn=add_reports_indexes,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="报表索引 idx_reports_core / idx_community_status_date",
    ),
    Migration(
        version=45,
        name="add_lead_eval_history_and_expected_price",
        fn=add_lead_eval_history_and_expected_price,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="lead_eval_histories 表 + leads.expected_price",
    ),
    Migration(
        version=46,
        name="add_lead_status_lost_to_competitor",
        fn=add_lead_status_lost_to_competitor,
        kind="schema",
        risk="C",
        backup="table",
        reversible=False,
        backup_tables=("leads",),
        description="leadstatus 枚举 RENAME + 脏数据收敛",
    ),
    Migration(
        version=47,
        name="add_lead_referrer_column",
        fn=add_lead_referrer_column,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="leads.referrer_id 列 + idx_lead_referrer",
    ),
    Migration(
        version=48,
        name="add_project_document_category",
        fn=add_project_document_category,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="project_documents.category（6 大类）",
    ),
    Migration(
        version=49,
        name="backfill_lead_total_price_from_expected",
        fn=backfill_lead_total_price_from_expected,
        kind="data",
        risk="B",
        backup="table",
        reversible=True,
        backup_tables=("leads",),
        description="leads.total_price 回填（从 expected_price）",
    ),
    Migration(
        version=50,
        name="backfill_lead_unit_price",
        fn=backfill_lead_unit_price,
        kind="data",
        risk="B",
        backup="table",
        reversible=True,
        backup_tables=("leads",),
        compensation="0050_backfill_lead_unit_price",
        description="leads.unit_price 回填 = ROUND(total_price/area,2)",
    ),
    Migration(
        version=51,
        name="create_community_images_table",
        fn=create_community_images_table,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="community_images 表 + 部分唯一索引",
    ),
    Migration(
        version=52,
        name="create_recruit_tables",
        fn=create_recruit_tables,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="招募计划 5 表",
    ),
    Migration(
        version=53,
        name="add_poster_bg_url_to_campaigns",
        fn=add_poster_bg_url_to_campaigns,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="recruit_campaigns.poster_bg_url",
    ),
    Migration(
        version=54,
        name="ensure_visit_referrer_index",
        fn=ensure_visit_referrer_index,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="recruit_visits.referrer_employee_id 索引",
    ),
    Migration(
        version=55,
        name="ensure_campaign_status_created_index",
        fn=ensure_campaign_status_created_index,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="recruit_campaigns(status, created_at) 索引",
    ),
    Migration(
        version=56,
        name="create_project_booking_and_share_tables",
        fn=create_project_booking_and_share_tables,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="房源预约与分享归因 5 表",
    ),
    Migration(
        version=57,
        name="add_project_booking_status_column",
        fn=add_project_booking_status_column,
        kind="schema",
        risk="B",
        backup="table",
        reversible=True,
        backup_tables=("project_bookings",),
        description="project_bookings.status 统一 5 态列",
    ),
    Migration(
        version=58,
        name="create_property_sheet_tables",
        fn=create_property_sheet_tables,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="房源单 4 表",
    ),
    Migration(
        version=59,
        name="create_customer_follow_ups_table",
        fn=create_customer_follow_ups_table,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="customer_follow_ups 表",
    ),
    Migration(
        version=60,
        name="create_system_configs_table",
        fn=create_system_configs_table,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="system_configs KV 表",
    ),
    Migration(
        version=61,
        name="create_key_tables",
        fn=create_key_tables,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="钥匙管理 5 表",
    ),
    Migration(
        version=62,
        name="add_key_audit_share_id_index",
        fn=add_key_audit_share_id_index,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="key_audit_logs detail->>'share_id' 表达式索引",
    ),
    Migration(
        version=63,
        name="add_normal_key_seq_column",
        fn=add_normal_key_seq_column,
        kind="schema",
        risk="B",
        backup="table",
        reversible=True,
        backup_tables=("project_normal_keys",),
        description="project_normal_keys.seq 回填",
    ),
    Migration(
        version=64,
        name="add_project_key_note_column",
        fn=add_project_key_note_column,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="projects.key_note",
    ),
    Migration(
        version=65,
        name="add_trgm_search_indexes",
        fn=add_trgm_search_indexes,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="pg_trgm GIN 搜索索引（O1，不 drop extension）",
    ),
    Migration(
        version=66,
        name="add_lead_auditor_index",
        fn=add_lead_auditor_index,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="leads(auditor_id, audit_time) 索引",
    ),
    Migration(
        version=67,
        name="create_marketing_subscription_tables",
        fn=create_marketing_subscription_tables,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="房源订阅 3 表",
    ),
    Migration(
        version=68,
        name="add_published_at_to_l4_marketing_projects",
        fn=add_published_at_to_l4_marketing_projects,
        kind="schema",
        risk="B",
        backup="table",
        reversible=True,
        backup_tables=("l4_marketing_projects",),
        description="l4_marketing_projects.published_at",
    ),
    Migration(
        version=69,
        name="add_price_change_id_to_notify_logs",
        fn=add_price_change_id_to_notify_logs,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="notify_logs.price_change_id / sub_source",
    ),
    Migration(
        version=70,
        name="add_price_change_id_index_to_notify_logs",
        fn=add_price_change_id_index_to_notify_logs,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="notify_logs(price_change_id) 索引",
    ),
    Migration(
        version=71,
        name="create_marketing_project_subscription_table",
        fn=create_marketing_project_subscription_table,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="房源级订阅表（含 last_subscribed_at/cancelled_at 子步骤）",
    ),
    Migration(
        version=72,
        name="widen_subscription_openid_columns",
        fn=widen_subscription_openid_columns,
        kind="schema",
        risk="A",
        backup="none",
        reversible=False,
        description="openid 列宽 64→100（放宽不可逆）",
    ),
    Migration(
        version=73,
        name="add_lead_referrer_index",
        fn=add_lead_referrer_index,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="leads(referrer_id) 索引",
    ),
    Migration(
        version=74,
        name="clear_wechat_session_key",
        fn=clear_wechat_session_key,
        kind="data",
        risk="C",
        backup="table",
        reversible=False,
        backup_tables=("users",),
        description="清空 users.wechat_session_key 存量",
    ),
    Migration(
        version=75,
        name="migrate_uploads_to_oss",
        fn=migrate_uploads_to_oss,
        kind="data",
        risk="C",
        backup="table",
        reversible=False,
        backup_tables=(
            "renovation_photos",
            "property_media",
            "l4_marketing_media",
            "project_renovations",
            "l4_marketing_projects",
            "project_contracts",
            "finance_records",
            "leads",
        ),
        description="本地 URL → OSS URL（多源反向替换不可靠）",
    ),
    Migration(
        version=76,
        name="run_building_dictionary_migrations",
        fn=run_building_dictionary_migrations,
        kind="schema",
        risk="C",
        backup="full",
        reversible=False,
        description="楼盘字典 4 表 + communities 11 列 + 业务表 9 列",
    ),
    Migration(
        version=77,
        name="widen_community_address_column",
        fn=widen_community_address_column,
        kind="schema",
        risk="A",
        backup="none",
        reversible=False,
        description="communities.address 300→500（放宽不可逆）",
    ),
    Migration(
        version=78,
        name="backfill_bd_room_floor",
        fn=backfill_bd_room_floor,
        kind="data",
        risk="B",
        backup="table",
        reversible=True,
        backup_tables=("bd_rooms",),
        compensation="0078_backfill_bd_room_floor",
        description="bd_rooms.floor 3 位户室号楼层回填",
    ),
    Migration(
        version=79,
        name="recover_stale_bd_import_tasks",
        fn=recover_stale_bd_import_tasks,
        kind="data",
        risk="B",
        backup="table",
        reversible=True,
        backup_tables=("bd_import_tasks",),
        description="遗留 processing 导入任务 → failed（可重跑）",
    ),
    Migration(
        version=80,
        name="run_bd_audit_20261017_fixes",
        fn=run_bd_audit_20261017_fixes,
        kind="schema",
        risk="C",
        backup="full",
        reversible=False,
        description="楼盘字典 2026-10-17 审查修复（H1-H4/M3/L2）",
    ),
    Migration(
        version=81,
        name="run_bd_audit_20261018_fixes",
        fn=run_bd_audit_20261018_fixes,
        kind="schema",
        risk="C",
        backup="full",
        reversible=False,
        description="楼盘字典 2026-10-18 性能与安全修复（P1/H2/H3/L3）",
    ),
    Migration(
        version=82,
        name="create_biz_dict_items_table",
        fn=create_biz_dict_items_table,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="业务字典表 + 4 组种子 + dict:manage 权限",
    ),
    Migration(
        version=83,
        name="add_lead_eval_verdict_fields",
        fn=add_lead_eval_verdict_fields,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="lead_eval_histories 增加 condition_score/expected_sale_days 两列与 CHECK 约束",
    ),
    Migration(
        version=84,
        name="create_fund_account_tables",
        fn=create_fund_account_tables,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="资金账户两张表（fund_accounts/fund_account_adjustments）+ 权限点种子",
    ),
    Migration(
        version=85,
        name="add_finance_record_account_column",
        fn=add_finance_record_account_column,
        kind="schema",
        risk="A",
        backup="none",
        reversible=True,
        description="finance_records 增加 account_id 列与 (account_id, record_date) 索引",
    ),
    Migration(
        version=86,
        name="close_orphan_finance_records",
        fn=close_orphan_finance_records,
        kind="data",
        risk="B",
        backup="table",
        reversible=False,
        backup_tables=("finance_records",),
        description="收敛所属项目已软删的孤儿流水（软删），修复「有记录但不能补挂」",
    ),
    Migration(
        version=87,
        name="backfill_finance_record_operator",
        fn=backfill_finance_record_operator,
        kind="data",
        risk="B",
        backup="table",
        reversible=True,
        backup_tables=("finance_records",),
        description="从 operation_logs 回填流水记账人（仅可精确追溯部分，其余留空）",
    ),
    Migration(
        version=88,
        name="migrate_project_document_archive_date_to_date",
        fn=migrate_project_document_archive_date_to_date,
        kind="schema",
        risk="B",
        backup="table",
        reversible=False,
        backup_tables=("project_documents",),
        description="project_documents.archive_date VARCHAR(10) → date（类型合规修复）",
    ),
    Migration(
        version=89,
        name="rebuild_project_sale_unique_index",
        fn=rebuild_project_sale_unique_index,
        kind="schema",
        risk="B",
        backup="table",
        reversible=False,
        backup_tables=("project_sales",),
        description="project_sales UNIQUE(project_id) → 部分唯一索引(WHERE is_deleted=false)，修复软删行占用唯一键",
    ),
    Migration(
        version=90,
        name="batched_backfill_leads_and_finance",
        fn=batched_backfill_leads_and_finance,
        kind="data",
        risk="B",
        backup="table",
        reversible=True,
        backup_tables=("leads", "finance_records"),
        description="分批回填 leads.unit_price/total_price、收敛 finance_records 孤儿流水与记账人",
    ),
    Migration(
        version=91,
        name="rename_investment_subjects",
        fn=rename_investment_subjects,
        kind="data",
        risk="B",
        backup="table",
        reversible=True,
        backup_tables=("finance_subjects",),
        description="系统预置科目改名：投资款收入/投资款还本 → 项目投资款收入/项目投资款还本（对齐业务规格命名）",
    ),
)

MIGRATION_BY_VERSION: dict[int, Migration] = {m.version: m for m in MIGRATIONS}
"""version → Migration 索引（执行器与 CLI 共用）."""

MIGRATION_BY_NAME: dict[str, Migration] = {m.name: m for m in MIGRATIONS}
"""name → Migration 索引（CLI 允许用名字代替版本号）."""

LEGACY_MIGRATION_NAMES: tuple[str, ...] = tuple(m.name for m in MIGRATIONS)
"""旧 ``_run_all_migrations`` 期望的调用顺序（``test_registry_matches_legacy_order`` 使用）."""

MIGRATION_COUNT = len(MIGRATIONS)
"""登记总数（当前 91）。"""

NEXT_VERSION = 92
"""下一个可用版本号：新增迁移从这里开始，禁止回填空号。"""
