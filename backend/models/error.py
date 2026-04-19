"""
错误处理相关模型
包含FailedRecord表
"""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Index

from .base import Base


class FailedRecord(Base):
    """失败记录表 - 零丢失保障"""
    __tablename__ = "failed_records"
    
    id: int = Column(Integer, primary_key=True, autoincrement=True)
    data_source: Optional[str] = Column(String(50), nullable=True, comment="数据来源")
    payload: str = Column(Text, nullable=False, comment="原始数据(JSON)")
    failure_type: str = Column(String(50), nullable=False, comment="失败类型")
    failure_reason: str = Column(Text, nullable=False, comment="失败原因")
    occurred_at: datetime = Column(DateTime, default=lambda: datetime.now(timezone.utc), comment="发生时间")
    is_handled: bool = Column(Boolean, default=False, comment="是否已处理")
    handled_at: Optional[datetime] = Column(DateTime, nullable=True, comment="处理时间")
    handler_notes: Optional[str] = Column(Text, nullable=True, comment="处理备注")
    
    __table_args__ = (
        Index("idx_unhandled", "data_source", "is_handled", "occurred_at"),
    )
    
    def __repr__(self) -> str:
        return f"<FailedRecord(id={self.id}, type='{self.failure_type}', handled={self.is_handled})>"