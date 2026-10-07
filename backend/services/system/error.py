"""错误记录服务.

处理错误日志的持久化存储.
"""

import json
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import sessionmaker

from db import engine
from models.system import FailedRecord
from utils.security_logger import redact_url_credentials

logger = logging.getLogger(__name__)

ErrorSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

_DATA_SOURCE_KEYS = ["data_source", "source", "数据来源"]


def save_failed_record(
    data: dict[str, object],
    error_message: str,
    failure_type: str = "validation_error",
    data_source: str | None = None,
) -> bool:
    """保存失败记录到数据库（使用独立连接避免事务冲突）.

    Args:
        data: 原始数据
        error_message: 错误信息
        failure_type: 失败类型
        data_source: 数据来源

    Returns:
        bool: 是否保存成功

    """
    # 入库前统一脱敏：调用方会传 str(exc)，而 httpx HTTPStatusError 的消息包含完整
    # 请求 URL（微信接口将 secret / access_token 放在 query）。日志出口有过滤器拦截，
    # 但本表属持久化存储、不经日志管线，因此在此单独收口。
    error_message = redact_url_credentials(error_message)

    db = None
    try:
        db = ErrorSessionLocal()

        if not data_source:
            for key in _DATA_SOURCE_KEYS:
                if key in data:
                    data_source = data[key]
                    break

        failed_record = FailedRecord(
            data_source=data_source,
            payload=json.dumps(data, ensure_ascii=False, default=str),
            failure_type=failure_type,
            failure_reason=error_message,
            occurred_at=datetime.now(timezone.utc),
            is_handled=False,
        )

        db.add(failed_record)
        db.commit()

        logger.info("失败记录已保存: %s - %.50s", failure_type, error_message)

    except Exception:
        logger.exception("保存失败记录时出错")
        if db:
            db.rollback()
        return False

    else:
        return True

    finally:
        if db:
            db.close()
