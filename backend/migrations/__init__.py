"""启动时数据迁移.

项目未使用 Alembic，对于新增列与已存数据的格式变更，通过本模块在应用启动时
（init_db 之后）幂等执行。所有迁移必须可重复执行且不破坏已有数据。

本包按职责拆分为多个子模块，``run_startup_migrations`` 统一编排调用：
- ``_helpers``：通用辅助函数（``_column_exists`` / ``_index_exists`` / ``_pg_quote_literal``）
  与共享常量（批次大小、Fernet 前缀、advisory lock key）
- ``_seeds``：权限种子数据（``_PERMISSIONS_SEED`` / ``_ROLE_PERMISSIONS_SEED``）
- ``_seeds_subjects``：科目种子数据（``_INITIAL_SUBJECTS``）
- ``_user_security``：users 表 token_version / phone_hash 列与手机号加密回填（H-002 / H-006）
- ``_schema_columns``：l4_marketing_projects / renovation_photos / project_renovations 等表的列变更
- ``_finance``：跟投管理表、资金账本、科目管理、enum 同步、项目结算列等迁移
- ``_type_migrations``：timestamp → timestamptz、VARCHAR → date / text 等列类型合规性修复
- ``_permission_system``：微信 OAuth 表、user_roles、权限系统三张表与索引
- 其余独立迁移（add_counterparty_type / fix_image_urls / migrate_uploads_to_oss 等）保留为单独模块

迁移清单：
- add_token_version_column: 为 users 表添加 token_version 列（H-002）
- add_phone_hash_column: 为 users 表添加 phone_hash 列与唯一索引（H-006）
- encrypt_existing_phones: 将已存的明文手机号加密为 Fernet 密文（H-006）
- populate_phone_hash: 为已存用户回填 phone_hash（H-006）
- add_user_temporary_fields: 为 users 表添加 is_temporary / merged_to_user_id 列与
  idx_user_temporary 索引（微信登录合并增强，临时账号与合并目标记录）
- add_stage_completed_dates_column: 为 l4_marketing_projects 表添加 stage_completed_dates 列
- add_thumbnail_url_to_photos: 为 renovation_photos 与 property_media 表添加 thumbnail_url 列
- add_renovation_extra_amount_columns: 为 project_renovations 表添加定制柜/窗户/电器金额列
- add_contact_person_id_column: 为 project_renovations 表添加 contact_person_id 列（对接负责人）
- run_fix_image_urls: 将数据库中的绝对图片 URL 转为相对路径（图片处理链路加固）
- create_investment_tables: 幂等创建跟投管理 4 张表（investments/investors/return_adjustments/investment_logs）
- rename_return_adjustment_columns: 将 return_adjustments 表回报率字段重命名为分配比例字段（清空旧数据）
- add_finance_record_counterparty_columns: 为 finance_records 表添加 counterparty/receipt_url 列（资金账本）
- create_finance_record_logs_table: 幂等创建资金账本操作日志表（finance_record_logs）
- create_finance_subjects_table: 幂等创建科目管理表 finance_subjects 并初始化系统预置科目
  （替代 CashFlowCategory 硬编码枚举，支持用户自定义科目 CRUD）
- migrate_finance_subjects_modes_to_jsonb: 将 finance_subjects.modes 列从 JSON 迁移为 JSONB，
  创建 GIN 索引 idx_subject_modes_gin (jsonb_path_ops)，加速 @> 包含查询（P2-11）
- add_finance_record_receipt_urls_column: 为 finance_records 表添加 receipt_urls JSON 列并从旧 receipt_url 回填
  （多票据支持）
- add_cashflow_category_enum_values: 同步 PostgreSQL cashflowcategory enum 与 Python 枚举（幂等）
- migrate_add_ended_status: 同步 PostgreSQL projectstatus enum 与 Python ProjectStatus 枚举
  （新增 ENDED="ended" 值），并重建 project_status_logs 表 stale CHECK 约束（幂等）
- migrate_record_date_to_timestamptz: 将 finance_records.record_date 列类型从 timestamp
  迁移为 timestamptz（时区一致性修复，幂等）
- migrate_project_date_columns_to_date: 将 projects 表 commission_start_date/commission_end_date/
  finance_settled_date 列从 VARCHAR(10) 迁移为 date（日期类型合规修复，幂等）
- migrate_user_datetime_columns_to_timestamptz: 将 users/refresh_tokens/api_keys 表的 5 个
  DateTime 列迁移为 timestamptz（时区一致性修复，幂等）
- migrate_all_datetime_columns_to_timestamptz: 遍历所有模型 DateTime 列，将 PG 中仍为
  timestamp without time zone 的列统一迁移为 timestamptz（通用时区修复，幂等）
- migrate_uuid_columns_to_native_uuid: 遍历所有模型 Uuid 列（BaseModel.id 与 project_id
  逻辑外键），将 PG 中仍为 varchar 的列统一迁移为原生 uuid（USING col::uuid，幂等）
- migrate_encrypted_columns_to_text: 将 EncryptedString 列从 character varying 迁移为 text
  （Fernet 密文远超声明长度，PG 严格强制 VARCHAR 长度会报错，幂等）
- widen_url_columns_to_text: 将 URL 列从 VARCHAR(500) 迁移为 text
  （OSS/CDN URL 含 query string 时可能超 500 字符，PG 严格强制 VARCHAR 长度会报错，幂等）
- create_wechat_oauth_tables: 幂等创建微信 OAuth state/temp_code 表并清理过期记录
- create_user_roles_table: 幂等创建 user_roles 关联表（用户附加角色多对多）
- migrate_installation_stage_to_delivery: 将 projects/renovation_photos/l4_marketing_media 中"安装"阶段
  数据迁移为"交付"（移除安装阶段）
- add_media_type_to_renovation_photos: 为 renovation_photos 表添加 media_type 列（图片/视频区分）
- add_counterparty_type_to_finance_records: 为 finance_records 表添加 counterparty_type 列（公司/个人支付方）
- rebuild_contract_no_index: 重建 idx_contract_no 为部分唯一索引（WHERE is_deleted=false），
  清理已删除项目的合同记录，允许合同编号在项目软删除后被复用
- migrate_permission_system: 幂等创建权限系统三张表（permissions/role_permissions/operation_logs），
  初始化系统权限点，为 4 个内置角色分配默认权限集
- add_lead_eval_history_and_expected_price: 幂等创建 lead_eval_histories 表（评估历史）+ 索引
  idx_lead_eval_history_lead + 为 leads 表添加 expected_price 列（业主心理预期价）
- add_project_document_category: 为 project_documents 表添加 category 列（文书分类，6 大类）
- migrate_uploads_to_oss: 启动期仅改写 DB URL 为 OSS URL（仅 storage_backend=oss 时执行，幂等：
  已是 OSS URL 的记录跳过）；本地文件上传由带外脚本 `python -m migrations.migrate_uploads_to_oss`
  执行（upload_local_files_to_oss），切换到 OSS 后对外提供服务前运行一次
- backfill_lead_total_price_from_expected: 回填 leads.total_price = expected_price
  （仅 total_price IS NULL AND expected_price IS NOT NULL 的行，幂等），修复历史 C 端提交线索
  在 admin 总价列显示为空的问题；不回填 lead_price_history 审计数据
- backfill_lead_unit_price: 回填 leads.unit_price = ROUND(total_price / area, 2)
  （仅 unit_price IS NULL AND total_price/area 有效且 area > 0 的行，幂等），修复历史线索
  在 admin 单价列显示为空的问题；后续由 service 层自动维护
- create_community_images_table: 幂等创建 community_images 表 + 索引
  + 部分唯一索引 uq_community_image_url (community_id, url) WHERE is_deleted=false，
  允许同小区已删除记录被重新插入（小区户型图库管理）

"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

# 子模块迁移函数
from migrations._community_images import create_community_images_table
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
    rename_return_adjustment_columns,
)

# 重新导出供外部模块（conftest.py 等）使用 —— 以下导入必须放在迁移子模块导入之前，
# 以避免出现循环导入：子模块（如 _finance）会反向 from migrations import _column_exists。
from migrations._helpers import _MIGRATION_ADVISORY_LOCK_KEY, _column_exists
from migrations._permission_system import (
    add_permission_foreign_indexes,
    add_reports_indexes,
    create_user_roles_table,
    create_wechat_oauth_tables,
    migrate_permission_system,
    migrate_project_business_permission,
)
from migrations._schema_columns import (
    add_contact_person_id_column,
    add_renovation_extra_amount_columns,
    add_stage_completed_dates_column,
    add_thumbnail_url_to_photos,
    drop_other_decoration_amount_column,
    drop_soft_actual_cost_column,
)
from migrations._seeds import _PERMISSIONS_SEED, _ROLE_PERMISSIONS_SEED
from migrations._seeds_subjects import _INITIAL_SUBJECTS
from migrations._type_migrations import (
    migrate_all_datetime_columns_to_timestamptz,
    migrate_encrypted_columns_to_text,
    migrate_project_date_columns_to_date,
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

# 独立迁移模块
from migrations.add_counterparty_type import add_counterparty_type_to_finance_records
from migrations.add_lead_eval_history_and_expected_price import add_lead_eval_history_and_expected_price
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

logger = logging.getLogger(__name__)

__all__ = [
    "_INITIAL_SUBJECTS",
    "_PERMISSIONS_SEED",
    "_ROLE_PERMISSIONS_SEED",
    "_column_exists",
    "run_startup_migrations",
]


def run_startup_migrations(engine: Engine) -> None:
    """执行所有启动时迁移（幂等）.

    多 worker 部署（``--workers 2``）下，每个 Uvicorn worker 独立跑 lifespan →
    各自调用本函数。若不加互斥，两 worker 会并发执行 schema/数据迁移，导致：
    1. 并发上传/改写 OSS（虽有 Redis 标记但存在 check-then-set 竞态）；
    2. 非严格幂等的 schema 迁移竞态放大；
    3. 启动时间翻倍，易触发部署健康检查超时。

    解决：PostgreSQL session-level advisory lock 串行化。第一个 worker 获取锁后
    执行全部迁移，其余 worker 阻塞等待；锁释放后依次执行（迁移幂等，重复执行
    为快速 no-op：``_column_exists`` 检查 + Redis 完成标记跳过）。
    非 PostgreSQL 后端（开发/测试 SQLite 等）直接执行，无并发问题。
    """
    if engine.dialect.name != "postgresql":
        _run_all_migrations(engine)
        return

    # 在独立连接上持有 session-level advisory lock，跨 worker 互斥
    # （迁移事务借用连接池中其他连接，锁仅用于互斥，不影响事务隔离）
    with engine.connect() as lock_conn:
        lock_conn.execute(text("SELECT pg_advisory_lock(:k)"), {"k": _MIGRATION_ADVISORY_LOCK_KEY})
        try:
            logger.info("已获取迁移 advisory lock，开始执行启动迁移")
            _run_all_migrations(engine)
        finally:
            lock_conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _MIGRATION_ADVISORY_LOCK_KEY})
            logger.info("已释放迁移 advisory lock")


def _run_all_migrations(engine: Engine) -> None:
    """执行所有启动时迁移（幂等）."""
    try:
        add_token_version_column(engine)
        add_phone_hash_column(engine)
        encrypt_existing_phones(engine)
        populate_phone_hash(engine)
        add_user_temporary_fields(engine)
        add_stage_completed_dates_column(engine)
        add_thumbnail_url_to_photos(engine)
        add_renovation_extra_amount_columns(engine)
        drop_other_decoration_amount_column(engine)
        drop_soft_actual_cost_column(engine)
        add_contact_person_id_column(engine)
        run_fix_image_urls(engine)
        create_investment_tables(engine)
        rename_return_adjustment_columns(engine)
        add_finance_record_counterparty_columns(engine)
        create_finance_record_logs_table(engine)
        create_finance_subjects_table(engine)
        migrate_finance_subjects_modes_to_jsonb(engine)
        add_finance_record_subject_columns(engine)
        add_finance_record_receipt_urls_column(engine)
        add_cashflow_category_enum_values(engine)
        add_project_finance_settlement_columns(engine)
        migrate_add_ended_status(engine)
        migrate_record_date_to_timestamptz(engine)
        migrate_project_date_columns_to_date(engine)
        migrate_user_datetime_columns_to_timestamptz(engine)
        migrate_encrypted_columns_to_text(engine)
        widen_url_columns_to_text(engine)
        migrate_all_datetime_columns_to_timestamptz(engine)
        migrate_uuid_columns_to_native_uuid(engine)
        create_wechat_oauth_tables(engine)
        create_user_roles_table(engine)
        migrate_installation_stage_to_delivery(engine)
        add_media_type_to_renovation_photos(engine)
        add_counterparty_type_to_finance_records(engine)
        cleanup_reserved_contracts(engine)
        rebuild_contract_no_index(engine)
        migrate_permission_system(engine)
        migrate_project_business_permission(engine)
        add_permission_foreign_indexes(engine)
        add_reports_indexes(engine)
        add_lead_eval_history_and_expected_price(engine)
        add_project_document_category(engine)
        backfill_lead_total_price_from_expected(engine)
        backfill_lead_unit_price(engine)
        create_community_images_table(engine)
        # 数据迁移（不改 schema，放在末尾）：仅 storage_backend=oss 时执行，local 模式跳过
        migrate_uploads_to_oss(engine)
    except Exception:
        logger.exception("启动迁移失败")
        raise
