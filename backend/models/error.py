"""
错误处理相关模型
包含FailedRecord表
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Index
from .base import Base


class FailedRecord(Base):
    """失败记录表 - 零丢失保障"""
    __tablename__ = "failed_records"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # 来源信息
    data_source = Column(String(50), nullable=True, comment="数据来源")
    
    # 原始数据
    payload = Column(Text, nullable=False, comment="原始数据(JSON)")
    
    # 失败信息
    failure_type = Column(String(50), nullable=False, comment="失败类型")
    failure_reason = Column(Text, nullable=False, comment="失败原因")
    
    # 元数据
    occurred_at = Column(DateTime, default=datetime.now, comment="发生时间")
    is_handled = Column(Boolean, default=False, comment="是否已处理")
    handled_at = Column(DateTime, nullable=True, comment="处理时间")
    handler_notes = Column(Text, nullable=True, comment="处理备注")
    
    # 索引
    __table_args__ = (
        Index("idx_unhandled", "data_source", "is_handled", "occurred_at"),
    )
    
    def __repr__(self):
        return f"<FailedRecord(id={self.id}, type='{self.failure_type}', handled={self.is_handled})>"