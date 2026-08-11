"""线索价格历史服务组件.

负责价格历史记录的创建和查询.
"""

import uuid
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import desc
from sqlalchemy.orm import Session

from models.lead import Lead, LeadPriceHistory
from services.system.exceptions import ResourceNotFoundError


def compute_unit_price(
    total_price: float | Decimal | None,
    area: float | Decimal | None,
) -> Decimal | None:
    """计算单价 = 总价 / 面积（万/㎡），保留 2 位小数.

    两者均 > 0 时返回 Decimal，否则 None（避免除零与无意义结果）.
    使用 Decimal(repr(float)) 规避 float 直接转 Decimal 的精度问题.

    Args:
        total_price: 总价（万），可为 float/Decimal/None
        area: 面积（㎡），可为 float/Decimal/None

    Returns:
        单价（万/㎡，2 位小数）或 None

    """
    if total_price is None or area is None:
        return None
    try:
        tp = Decimal(repr(float(total_price)))
        ar = Decimal(repr(float(area)))
    except (TypeError, ValueError):
        return None
    if tp <= 0 or ar <= 0:
        return None
    return (tp / ar).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class LeadPriceService:
    """线索价格历史服务.

    负责价格历史记录的创建和查询。

    Attributes:
        db: SQLAlchemy数据库会话

    """

    def __init__(self, db: Session) -> None:
        """初始化价格历史服务.

        Args:
            db: SQLAlchemy数据库会话

        """
        self.db = db

    def get_price_history(self, lead_id: str) -> list[LeadPriceHistory]:
        """获取线索价格历史记录.

        Args:
            lead_id: 线索ID

        Returns:
            价格历史记录列表，按记录时间倒序

        """
        return (
            self.db.query(LeadPriceHistory)
            .filter(LeadPriceHistory.lead_id == lead_id)
            .order_by(desc(LeadPriceHistory.recorded_at))
            .all()
        )

    def add_price_record(
        self,
        lead_id: str,
        price: float,
        remark: str | None,
        created_by_id: str,
    ) -> LeadPriceHistory:
        """添加价格记录，同时更新线索的当前总价.

        Args:
            lead_id: 线索ID
            price: 价格
            remark: 备注
            created_by_id: 记录人ID

        Returns:
            创建的价格记录对象

        Raises:
            ResourceNotFoundError: 当线索不存在时

        """
        lead = self.db.query(Lead).filter(Lead.id == lead_id).first()
        if not lead:
            msg = "线索不存在"
            raise ResourceNotFoundError(msg)

        # 创建价格记录
        rec = LeadPriceHistory(
            id=uuid.uuid4(),
            lead_id=lead_id,
            price=price,
            remark=remark,
            created_by_id=created_by_id,
        )
        self.db.add(rec)

        # 更新当前价格
        lead.total_price = price
        # 总价变更后重算单价（面积不变，仅当面积有效时）
        new_unit = compute_unit_price(lead.total_price, lead.area)
        if new_unit is not None:
            lead.unit_price = new_unit
        self.db.add(lead)

        self.db.commit()
        self.db.refresh(rec)
        return rec

    def create_initial_record(
        self,
        lead_id: str,
        price: float,
        created_by_id: str,
    ) -> LeadPriceHistory | None:
        """创建初始价格记录.

        Args:
            lead_id: 线索ID
            price: 价格
            created_by_id: 创建人ID

        Returns:
            创建的价格记录对象，如果price为None则返回None

        """
        if not price:
            return None

        rec = LeadPriceHistory(
            id=uuid.uuid4(),
            lead_id=lead_id,
            price=price,
            remark="Initial Creation",
            created_by_id=created_by_id,
        )
        self.db.add(rec)
        return rec
