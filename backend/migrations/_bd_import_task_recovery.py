"""恢复遗留 processing 状态的楼盘字典导入任务（幂等启动迁移）.

背景（楼盘字典全量导入承载力报告 §5.1 M7 / L2-④）：
导入任务由 backend 容器内的后台线程执行，服务重启/容器重建/OOMKilled 会
直接杀死该线程，任务永久卡在 ``processing``——进度条永远不动、互斥闸门
（同状态拒绝新任务）也永远不放行，只能人工改库。属「无任务恢复」机制缺陷。

修复：应用启动时把存量 ``processing`` 任务标记为 ``failed``（进度保留供
排查），并附「服务重启中断，可重跑」提示——导入按 BR-16 幂等（uq 跳过
已存在数据），直接重传同一包即可续跑。

幂等性：迁移执行于 lifespan（init_db/migrations 之后、服务开始接单之前），
此刻不可能有真正在跑的导入线程；标记后状态离开 processing，不再命中
UPDATE 条件，可重复执行。二次部署双 worker 均为 no-op。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def recover_stale_bd_import_tasks(engine: Engine) -> None:
    """将遗留 processing 状态的楼盘字典导入任务标记为 failed（可重跑）.

    Args:
        engine: SQLAlchemy 引擎

    """
    with engine.begin() as conn:
        result = conn.execute(
            text(
                "UPDATE bd_import_tasks SET status = 'failed', "
                "completed_at = now(), "
                "error_message = COALESCE(error_message, "
                "'服务重启中断，导入未完成。数据已按小区提交，重传同一文件即可从断点续跑（幂等，不会重复入库）。') "
                "WHERE status = 'processing'"
            )
        )
        affected = result.rowcount or 0
    if affected:
        logger.info("迁移：恢复遗留楼盘字典导入任务 %d 个（processing → failed，可重跑）", affected)
