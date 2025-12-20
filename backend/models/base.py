"""
基础模型和枚举类型
"""
from sqlalchemy.orm import declarative_base
import enum
from datetime import datetime
from sqlalchemy import Column, String, DateTime
from sqlalchemy.dialects.postgresql import UUID
import uuid


Base = declarative_base()


class PropertyStatus(str, enum.Enum):
    """房源状态枚举"""
    FOR_SALE = "在售"
    SOLD = "成交"


class ChangeType(str, enum.Enum):
    """变更类型枚举"""
    PRICE_CHANGE = "price_change"
    STATUS_CHANGE = "status_change"
    INFO_CHANGE = "info_change"


class MediaType(str, enum.Enum):
    """媒体类型枚举"""
    FLOOR_PLAN = "floor_plan"  # 户型图
    INTERIOR = "interior"  # 室内图
    EXTERIOR = "exterior"  # 外观图
    OTHER = "other"


class ProjectStatus(str, enum.Enum):
    """项目主状态枚举"""
    SIGNING = "signing"      # 签约阶段
    RENOVATING = "renovating"  # 改造阶段
    SELLING = "selling"      # 在售阶段
    SOLD = "sold"           # 已售阶段
    DELETED = "deleted"     # 已删除


class RenovationStage(str, enum.Enum):
    """改造子阶段枚举"""
    DEMOLITION = "拆除"      # 拆除
    DESIGN = "设计"         # 设计
    PLUMBING = "水电"        # 水电
    CARPENTRY = "木瓦"       # 木瓦
    PAINTING = "油漆"        # 油漆
    INSTALLATION = "安装"    # 安装
    DELIVERY = "交付"        # 交付


class CashFlowType(str, enum.Enum):
    """现金流类型枚举"""
    INCOME = "income"        # 收入
    EXPENSE = "expense"      # 支出


class CashFlowCategory(str, enum.Enum):
    """现金流分类枚举"""
    # 支出类
    PERFORMANCE_BOND = "履约保证金"
    AGENCY_COMMISSION = "中介佣金"
    RENOVATION_FEE = "装修费"
    MARKETING_FEE = "营销费"
    OTHER_EXPENSE = "其他支出"
    TAX_FEE = "税费"
    OPERATION_FEE = "运营杂费"

    # 收入类
    BOND_RETURN = "回收保证金"
    PREMIUM = "溢价款"
    SERVICE_FEE = "服务费"
    OTHER_INCOME = "其他收入"
    SALE_PRICE = "售房款"


class RecordType(str, enum.Enum):
    """销售记录类型枚举"""
    VIEWING = "viewing"        # 带看记录
    OFFER = "offer"           # 出价记录
    NEGOTIATION = "negotiation"  # 面谈记录


class BaseModel(Base):
    """基础模型，包含公共字段"""
    __abstract__ = True

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)