"""A 级通用补偿：声明式 ``DROP ... IF EXISTS``（覆盖 40+ 项，零脚本）.

**安全守卫**（防「新表已有业务数据时被 DROP」）：
- ``DropSpec.tables`` 非空时先 ``SELECT count(*)``；``> 0`` → 拒绝执行，
  提示「该表已有 N 行数据，DROP 会丢数据，请改用 ``restore`` 或带 ``--force`` 确认」；
- 全部 DDL 使用 ``IF EXISTS``，天然幂等；
- ``dropped_tables`` 携带备注，供审计 notes 记录。

⚠️ 本表只登记 **A 级（纯新增）** 项。C/D 级不在此表（走 ``restore-hint``）。
B 级项有实脚本的登记在 ``compensations/registry.py``；无实脚本的 B 级项在此表
以「按列/按索引回滚」的保守形式登记，并在 notes 注明实际边界。
"""

from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.engine import Connection

from migrations.compensations.base import CompensationContext, CompensationResult
from migrations.compensations.guards import assert_tables_empty


@dataclass(frozen=True, slots=True)
class DropSpec:
    """一条 A 级补偿的声明：要删的表 / 列 / 索引."""

    tables: tuple[str, ...] = ()
    columns: tuple[tuple[str, str], ...] = ()
    indexes: tuple[str, ...] = ()
    notes: str | None = None


DROP_SPECS: dict[int, DropSpec] = {
    1: DropSpec(columns=(("users", "token_version"),)),
    2: DropSpec(columns=(("users", "phone_hash"),), indexes=("idx_users_phone_hash",)),
    5: DropSpec(
        columns=(("users", "is_temporary"), ("users", "merged_into_user_id")),
        indexes=("idx_user_temporary",),
    ),
    6: DropSpec(columns=(("l4_marketing_projects", "stage_completed_dates"),)),
    7: DropSpec(columns=(("renovation_photos", "thumbnail_url"), ("property_media", "thumbnail_url"))),
    8: DropSpec(
        columns=(
            ("project_renovations", "custom_cabinet_amount"),
            ("project_renovations", "window_amount"),
            ("project_renovations", "wall_treatment_amount"),
        ),
        notes="wall_treatment_amount 可能由 appliance_amount 重命名而来；回滚后需人工决定是否恢复原名",
    ),
    11: DropSpec(columns=(("project_renovations", "contact_person_id"),)),
    13: DropSpec(
        tables=("investments", "investors", "return_adjustments", "investment_logs"),
        notes="空表才允许 DROP（守卫 assert_tables_empty）",
    ),
    15: DropSpec(columns=(("finance_records", "counterparty"), ("finance_records", "receipt_url"))),
    16: DropSpec(tables=("finance_record_logs",)),
    17: DropSpec(
        tables=("finance_subjects",),
        indexes=("idx_subject_stage",),
        notes="含预置科目种子数据，空表才允许 DROP",
    ),
    19: DropSpec(
        columns=(
            ("finance_records", "subject_id"),
            ("finance_records", "outflow"),
            ("finance_records", "inflow"),
            ("finance_records", "payer"),
            ("finance_records", "payee"),
        ),
        indexes=("idx_finance_subject_id",),
        notes="删列即丢弃回填数据；如需保留数据请用 restore",
    ),
    22: DropSpec(
        columns=(
            ("projects", "finance_settlement_status"),
            ("projects", "finance_settled_date"),
            ("projects", "finance_settled_note"),
        ),
    ),
    23: DropSpec(
        columns=(
            ("projects", "is_archived"),
            ("projects", "archived_at"),
            ("projects", "archived_note"),
        ),
    ),
    32: DropSpec(tables=("wechat_oauth_states", "wechat_temp_codes")),
    33: DropSpec(tables=("user_roles",), indexes=("ix_user_roles_role_id",)),
    35: DropSpec(
        columns=(("renovation_photos", "media_type"),),
        notes="若列由本迁移新建则等价回滚；含 _backfill_media_type 对既有行的视频标记，删除列会一并丢失",
    ),
    36: DropSpec(columns=(("finance_records", "counterparty_type"),)),
    42: DropSpec(columns=(("roles", "is_system"),)),
    43: DropSpec(columns=(("permissions", "risk_level"),)),
    44: DropSpec(
        indexes=(
            "ix_project_interaction_operator_id",
            "ix_user_roles_role_id",
            "ix_role_permissions_permission_id",
        ),
    ),
    45: DropSpec(indexes=("idx_reports_core", "idx_community_status_date")),
    47: DropSpec(
        tables=("lead_eval_histories",),
        columns=(("leads", "expected_price"),),
        indexes=("idx_lead_eval_history_lead",),
        notes="表非空时拒绝（评估历史由线索业务持续追加，不可重建）",
    ),
    48: DropSpec(columns=(("project_documents", "category"),)),
    53: DropSpec(tables=("community_images",), indexes=("uq_community_image_url",)),
    54: DropSpec(
        tables=(
            "recruit_campaigns",
            "recruit_leads",
            "recruit_visits",
            "recruit_share_events",
            "recruit_qr_scenes",
        ),
    ),
    55: DropSpec(columns=(("recruit_campaigns", "poster_bg_url"),)),
    56: DropSpec(indexes=("idx_recruit_visit_referrer",)),
    57: DropSpec(indexes=("idx_recruit_campaign_status_created",)),
    58: DropSpec(
        tables=(
            "project_bookings",
            "project_visits",
            "project_share_events",
            "valuation_visits",
            "valuation_share_events",
        ),
    ),
    60: DropSpec(
        tables=(
            "property_share_sheets",
            "property_share_sheet_items",
            "property_sheet_visits",
            "property_sheet_share_events",
        ),
    ),
    61: DropSpec(tables=("customer_follow_ups",)),
    62: DropSpec(tables=("system_configs",)),
    63: DropSpec(
        tables=("project_keys", "project_normal_keys", "key_shares", "key_share_views", "key_audit_logs"),
    ),
    64: DropSpec(indexes=("idx_key_audit_detail_share_id",)),
    65: DropSpec(columns=(("projects", "key_note"),)),
    66: DropSpec(
        indexes=(
            "idx_leads_trgm_search",
            "idx_communities_name_lower_trgm",
            "idx_communities_name_trgm",
            "idx_communities_business_circle_trgm",
            "idx_l4_marketing_projects_community_name_trgm",
            "idx_investments_trgm_search",
            "idx_projects_trgm_search",
            "idx_project_contracts_trgm_search",
            "idx_users_trgm_search",
        ),
        notes="只删索引，**不 drop pg_trgm 扩展**（可能被其他地方依赖）",
    ),
    67: DropSpec(indexes=("idx_lead_auditor_audit_time",)),
    68: DropSpec(
        tables=("l4_marketing_subscriptions", "l4_marketing_notify_logs", "l4_marketing_price_changes"),
    ),
    70: DropSpec(
        columns=(
            ("l4_marketing_notify_logs", "price_change_id"),
            ("l4_marketing_notify_logs", "sub_source"),
        ),
    ),
    71: DropSpec(indexes=("idx_l4_marketing_notify_logs_price_change",)),
    72: DropSpec(
        tables=("l4_marketing_project_subscriptions",),
        notes="含 last_subscribed_at / cancelled_at 子步骤（wrapper 内调用，随父项一起回滚，K2）",
    ),
    73: DropSpec(indexes=("idx_lead_referrer",)),
    82: DropSpec(
        tables=("biz_dict_items",),
        indexes=("uq_biz_dict_items", "idx_biz_dict_items_dict"),
        notes="含 4 组业务字典种子（非空时拒绝 DROP）",
    ),
    83: DropSpec(
        columns=(
            ("lead_eval_histories", "condition_score"),
            ("lead_eval_histories", "expected_sale_days"),
        ),
        notes="CHECK 约束随列 DROP 自动消失（PG 行为），无需单独处理",
    ),
}


def compensate(conn: Connection, ctx: CompensationContext) -> CompensationResult:
    """按 ``DropSpec`` 执行通用回滚（事务由执行器管理，禁止自行 commit）.

    Args:
        conn: 执行器开启的事务连接。
        ctx: 补偿上下文（``ctx.version`` 决定执行哪条 DropSpec）。

    Returns:
        影响行数 0 + 说明（DROP DDL 无法给出行数）。

    Raises:
        CompensationNotSupportedError: 该版本未登记 DropSpec。

    """
    from migrations.compensations.base import CompensationNotSupportedError

    spec = DROP_SPECS.get(ctx.version)
    if spec is None:
        msg = f"v{ctx.version} 未登记 A 级通用补偿（DROP_SPECS 无此版本）"
        raise CompensationNotSupportedError(msg)

    if ctx.dry_run:
        # dry-run 只读：报告将要删除的对象与表行数，不执行任何 DDL
        counts = {table: _count_table(conn, table) for table in spec.tables}
        notes = _describe(spec, counts)
        return CompensationResult(affected_rows=sum(counts.values()), notes=notes)

    if spec.tables:
        assert_tables_empty(conn, spec.tables, force=ctx.force)
    for index in spec.indexes:
        conn.execute(text(f"DROP INDEX IF EXISTS {index}"))
    for table, column in spec.columns:
        conn.execute(text(f"ALTER TABLE {table} DROP COLUMN IF EXISTS {column}"))
    for table in spec.tables:
        conn.execute(text(f"DROP TABLE IF EXISTS {table}"))
    return CompensationResult(affected_rows=0, notes=_describe(spec, {}))


def _count_table(conn: Connection, table: str) -> int:
    """统计表行数（表不存在返回 0）.

    Args:
        conn: 事务连接。
        table: 表名（常量）。

    Returns:
        行数。

    """
    exists = conn.execute(text("SELECT to_regclass(:name) IS NOT NULL"), {"name": f"public.{table}"}).scalar()
    if not exists:
        return 0
    return int(conn.execute(text(f"SELECT count(*) FROM {table}")).scalar() or 0)


def _describe(spec: DropSpec, counts: dict[str, int]) -> str:
    """生成人类可读的补偿说明.

    Args:
        spec: 声明式补偿规格。
        counts: 表行数（dry-run 时有值）。

    Returns:
        说明文本。

    """
    parts: list[str] = []
    if spec.tables:
        listed = ", ".join(f"{t}({counts.get(t, 0)} 行)" for t in spec.tables)
        parts.append(f"DROP TABLE IF EXISTS: {listed}")
    if spec.columns:
        parts.append("DROP COLUMN IF EXISTS: " + ", ".join(f"{t}.{c}" for t, c in spec.columns))
    if spec.indexes:
        parts.append("DROP INDEX IF EXISTS: " + ", ".join(spec.indexes))
    if spec.notes:
        parts.append(spec.notes)
    return "；".join(parts)
