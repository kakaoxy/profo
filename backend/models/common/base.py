"""基础模型和枚举类型."""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """SQLAlchemy 2.0 声明式基类."""


class PropertyStatus(str, enum.Enum):
    """房源状态枚举."""

    FOR_SALE = "在售"
    SOLD = "成交"


class ChangeType(str, enum.Enum):
    """变更类型枚举."""

    PRICE_CHANGE = "price_change"
    STATUS_CHANGE = "status_change"
    INFO_CHANGE = "info_change"


class MediaType(str, enum.Enum):
    """媒体类型枚举."""

    FLOOR_PLAN = "floor_plan"  # 户型图
    INTERIOR = "interior"  # 室内图
    EXTERIOR = "exterior"  # 外观图
    OTHER = "other"


class MediaKind(str, enum.Enum):
    """媒体种类枚举（区分图片/视频）."""

    IMAGE = "image"  # 图片
    VIDEO = "video"  # 视频


class ProjectStatus(str, enum.Enum):
    """项目主状态枚举."""

    SIGNING = "signing"  # 签约阶段
    RENOVATING = "renovating"  # 改造阶段
    SELLING = "selling"  # 在售阶段
    SOLD = "sold"  # 已售阶段
    DELETED = "deleted"  # 已删除


class RenovationStage(str, enum.Enum):
    """改造子阶段枚举."""

    DEMOLITION = "拆除"  # 拆除
    DESIGN = "设计"  # 设计
    PLUMBING = "水电"  # 水电
    CARPENTRY = "木瓦"  # 木瓦
    PAINTING = "油漆"  # 油漆
    DELIVERY = "交付"  # 交付
    COMPLETED = "已完成"  # 已完成


class CashFlowType(str, enum.Enum):
    """现金流类型枚举."""

    INCOME = "income"  # 收入
    EXPENSE = "expense"  # 支出


class CounterpartyType(str, enum.Enum):
    """支付方类型枚举."""

    COMPANY = "company"  # 公司
    INDIVIDUAL = "individual"  # 个人


class BusinessForm(str, enum.Enum):
    """业务形式枚举."""

    AGENT = "agent"  # 代理美化
    WHOLESALE = "wholesale"  # 收购美化


class DocumentSignoffStatus(str, enum.Enum):
    """文书签收状态枚举."""

    UNSIGNED = "unsigned"  # 未签署
    SIGNED = "signed"  # 签署
    ARCHIVED = "archived"  # 归档


class CashFlowCategory(str, enum.Enum):
    """现金流分类枚举."""

    # 支出类
    PERFORMANCE_BOND = "履约保证金"
    AGENCY_COMMISSION = "中介佣金"
    RENOVATION_FEE = "装修费"
    MARKETING_FEE = "营销费"
    OTHER_EXPENSE = "其他支出"
    TAX_FEE = "税费"
    OPERATION_FEE = "运营费"
    PURCHASE_PRICE = "收购款"  # 收购款（收购美化独有支出）
    CHANNEL_COMMISSION = "渠道佣金"
    ENGINEERING_RENOVATION = "工程装修费"
    HARD_DECORATION = "硬装"
    SOFT_DECORATION = "软装"
    CUSTOM_CABINET_DECORATION = "定制柜"
    WINDOW_DECORATION = "窗户"
    WALL_DECORATION = "墙面"
    OTHER_DECORATION = "其他装修"
    MARKETING_PROMOTION = "营销推广费"
    OPERATION_SERVICE = "运营服务费"
    INVESTMENT_PRINCIPAL_RETURN = "跟投本金退还"
    INVESTOR_PROFIT_DISTRIBUTION = "投资人利润分配"
    PURCHASE_PRINCIPAL = "购房本金"
    PROPERTY_TAX = "房屋税费"
    QUOTA_FEE = "名额费"
    HOLDING_COST_MONTHLY = "持有成本-月供"
    OTHER_TAX = "其他税费"
    PROJECT_RESERVE = "项目备用金"
    MARKETING_ADVANCE = "营销费垫付"
    FINANCE_TAX_COST = "财税成本"
    PROJECT_INCENTIVE = "项目激励"
    PAID_COMMISSION = "代付佣金"
    TAX_COMMISSION_DIFF = "税费及佣金差额"
    PURCHASE_DEPOSIT = "购房款-定金"
    PURCHASE_DOWNPAYMENT = "购房款-首付"
    SELLING_COMMISSION = "卖房佣金"
    SELLING_TAX = "卖房税费"

    # 收入类
    BOND_RETURN = "回收保证金"
    PREMIUM = "溢价款"
    SERVICE_FEE = "服务费"
    OTHER_INCOME = "其他收入"
    SALE_PRICE = "售房款"
    BOND_RECOVERY = "保证金回收"
    VALUE_ADDED_SERVICE = "增值服务费"
    PROJECT_INVESTMENT = "项目跟投款"
    RESERVE_RECOVERY = "备用金回收"
    MARKETING_PROMOTION_DEDUCTION = "营销推广费抵扣"
    OWNER_COMMISSION = "业主佣金"


class RecordType(str, enum.Enum):
    """销售记录类型枚举."""

    VIEWING = "viewing"  # 带看记录
    OFFER = "offer"  # 出价记录
    NEGOTIATION = "negotiation"  # 面谈记录


class LeadStatus(str, enum.Enum):
    """线索状态枚举."""

    PENDING_ASSESSMENT = "pending_assessment"  # 待评估
    PENDING_VISIT = "pending_visit"  # 待看房
    REJECTED = "rejected"  # 已驳回
    VISITED = "visited"  # 已看房
    SIGNED = "signed"  # 已签约


class FollowUpMethod(str, enum.Enum):
    """跟进方式枚举."""

    PHONE = "phone"  # 电话
    WECHAT = "wechat"  # 微信
    FACE = "face"  # 面谈
    VISIT = "visit"  # 实地带看


class ImportTaskStatus(str, enum.Enum):
    """导入任务状态枚举."""

    PENDING = "pending"  # 待处理
    PROCESSING = "processing"  # 处理中
    COMPLETED = "completed"  # 完成
    FAILED = "failed"  # 失败
    CANCELLED = "cancelled"  # 已取消


class SettlementStatus(str, enum.Enum):
    """跟投结算状态枚举."""

    UNSETTLED = "unsettled"  # 未结算
    SETTLED = "settled"  # 已结算


class InvestorType(str, enum.Enum):
    """投资方类型枚举."""

    ENTERPRISE = "enterprise"  # 企业
    INDIVIDUAL = "individual"  # 个人


class InvestmentActionType(str, enum.Enum):
    """跟投操作日志类型枚举."""

    CREATE = "create"
    STATUS_CHANGE = "status_change"
    RATIO_ADJUST = "ratio_adjust"
    DISTRIBUTION_ADJUST = "distribution_adjust"
    INVESTOR_ADD = "investor_add"
    INVESTOR_EDIT = "investor_edit"
    INVESTOR_DELETE = "investor_delete"
    SUB_INVESTOR_ADD = "sub_investor_add"
    SUB_INVESTOR_EDIT = "sub_investor_edit"
    SUB_INVESTOR_DELETE = "sub_investor_delete"
    TOTAL_INVESTMENT_CHANGE = "total_investment_change"
    TOTAL_RETURN_CHANGE = "total_return_change"
    SETTLE = "settle"
    UNSETTLE = "unsettle"


class FinanceActionType(str, enum.Enum):
    """资金账本操作日志类型枚举."""

    CREATE = "create"
    DELETE = "delete"
    SETTLE = "settle"
    UNSETTLE = "unsettle"
    UPDATE = "update"


class SubjectLevel(str, enum.Enum):
    """科目成本层级枚举（①取得成本 ~ ⑦配对项）."""

    ACQUISITION = "1"  # ①取得成本
    DIRECT_RENOVATION = "2"  # ②直接改造成本
    TRANSACTION = "3"  # ③交易费用
    CAPITAL = "4"  # ④资金成本
    CASHFLOW = "5"  # ⑤现金流专属
    INCOME = "6"  # ⑥收入项
    PAIRING = "7"  # ⑦配对项


class SubjectStage(str, enum.Enum):
    """科目业务阶段枚举."""

    SIGNING = "signing"  # 签约
    RENOVATION = "renovation"  # 装修
    HOLDING = "holding"  # 持有期
    LISTING = "listing"  # 在售
    SOLD = "sold"  # 已售


class BaseModel(Base):
    """基础模型，包含公共字段."""

    __abstract__ = True

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
