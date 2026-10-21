"""为 lead_eval_histories 增加评分与可售周期两列及 CHECK 约束（幂等）.

- 幂等为 `lead_eval_histories` 添加 `condition_score SMALLINT`（房源条件分 1-5）
- 幂等为 `lead_eval_histories` 添加 `expected_sale_days SMALLINT`（装修后预计可售天数 1-365）
- 幂等添加两条 CHECK 约束（列可空：存量记录无该事实，禁止用默认值伪造评估结论）

为什么可空而非 NOT NULL + DEFAULT：存量 `LeadEvalHistory` 行没有真实评分，
用默认值（如 3 分）填空会把「没评过」伪装成「评了 3 分」；前端以「未评分 / 周期待补」
显式降级。新写入路径由 Pydantic 必填校验兜住。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

_TABLE = "lead_eval_histories"

# (列名, 约束名, 约束表达式) —— 与 models/lead/lead.py 的 CheckConstraint 必须逐字一致
_CHECKS: tuple[tuple[str, str, str], ...] = (
    (
        "condition_score",
        "ck_lead_eval_condition_score",
        "condition_score IS NULL OR (condition_score BETWEEN 1 AND 5)",
    ),
    (
        "expected_sale_days",
        "ck_lead_eval_expected_sale_days",
        "expected_sale_days IS NULL OR (expected_sale_days BETWEEN 1 AND 365)",
    ),
)


def _constraint_exists(engine: Engine, table: str, conname: str) -> bool:
    """检查某表上是否已有指定名称的 CHECK 约束.

    必须同时按 `conrelid` 过滤：PG 的约束名只在**表内**唯一，
    全局按 `conname` 查会把别的表上的同名约束误判为本表已有。

    Args:
        engine: SQLAlchemy 引擎
        table: 表名
        conname: 约束名

    Returns:
        存在返回 True

    """
    with engine.connect() as conn:
        return bool(
            conn.execute(
                text(
                    "SELECT 1 FROM pg_constraint "
                    "WHERE conrelid = to_regclass(:tbl) AND conname = :name AND contype = 'c' LIMIT 1",
                ),
                {"tbl": f"public.{table}", "name": conname},
            ).first(),
        )


def add_lead_eval_verdict_fields(engine: Engine) -> None:
    """幂等为 lead_eval_histories 增加评分与可售周期两列及其 CHECK 约束.

    Args:
        engine: SQLAlchemy 引擎

    """
    # 延迟导入避免循环依赖（migrations/__init__.py 在 _column_exists 定义前导入本模块）
    from migrations import _column_exists

    # 表不存在时跳过（全新库由 Base.metadata.create_all 覆盖，含模型声明的约束）
    with engine.connect() as conn:
        if conn.execute(text("SELECT to_regclass(:name)"), {"name": f"public.{_TABLE}"}).scalar() is None:
            logger.info("迁移：%s 不存在，跳过评分/周期列与约束创建", _TABLE)
            return

    # 1. 加列（幂等）
    for column, _conname, _expr in _CHECKS:
        if not _column_exists(engine, _TABLE, column):
            logger.info("迁移：%s 增加 %s 列", _TABLE, column)
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE {_TABLE} ADD COLUMN {column} SMALLINT"))

    # 2. 加 CHECK 约束（幂等：ADD CONSTRAINT 不支持 IF NOT EXISTS，必须先查 pg_constraint）
    for _column, conname, expr in _CHECKS:
        if not _constraint_exists(engine, _TABLE, conname):
            logger.info("迁移：%s 增加约束 %s", _TABLE, conname)
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE {_TABLE} ADD CONSTRAINT {conname} CHECK ({expr})"))
