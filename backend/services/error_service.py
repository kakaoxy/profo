"""
错误记录服务
处理错误日志的持久化存储
"""
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional

from models.error import FailedRecord
from db import SessionLocal

logger = logging.getLogger(__name__)

def save_failed_record(
    data: Dict[str, Any],
    error_message: str,
    failure_type: str = "validation_error",
    data_source: Optional[str] = None
) -> bool:
    """
    保存失败记录到数据库
    
    Args:
        data: 原始数据
        error_message: 错误信息
        failure_type: 失败类型
        data_source: 数据来源
    
    Returns:
        bool: 是否保存成功
    """
    db = None
    try:
        db = SessionLocal()
        
        # 如果没有提供 data_source，尝试从数据中提取
        if not data_source:
            data_source = data.get('数据源') or data.get('data_source')
        
        failed_record = FailedRecord(
            data_source=data_source,
            payload=json.dumps(data, ensure_ascii=False, default=str),
            failure_type=failure_type,
            failure_reason=error_message,
            occurred_at=datetime.now(),
            is_handled=False
        )
        
        db.add(failed_record)
        db.commit()
        
        logger.info(f"失败记录已保存: {failure_type} - {error_message[:50]}")
        return True
    
    except Exception as e:
        logger.error(f"保存失败记录时出错: {str(e)}")
        if db:
            db.rollback()
        return False
    
    finally:
        if db:
            db.close()
