"""房源订阅通知 C 端服务.

订阅额度账本（l4_marketing_subscriptions）的读写：
- get_status：查询当前用户两频道剩余额度
- report_result：小程序 requestSubscribeMessage 结果上报，仅 accept 计入额度
  （模板 ID → 频道映射经 subscribe_templates 解析，用户不存在的模板 ID 静默忽略）
- 每人一行 upsert（uq 唯一约束 + 冲突回退重查，对齐 subscribe_templates 服务同口径）
"""

import logging

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import L4MarketingSubscription, User
from services.system import subscribe_templates

logger = logging.getLogger(__name__)

# 授权结果 → 是否计入额度（一次性订阅：每次「允许」可收 1 条；其余状态不计数）
_QUOTA_INC_STATUS = "accept"


class MarketingSubscriptionService:
    """房源订阅通知服务."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def _get_row(self, user_id: str) -> L4MarketingSubscription | None:
        """查询用户订阅行（无则 None）."""
        return self.db.query(L4MarketingSubscription).filter(L4MarketingSubscription.user_id == user_id).first()

    def get_status(self, user_id: str) -> dict[str, object]:
        """查询当前用户订阅额度状态.

        Returns:
            {new_listing_quota, price_change_quota, last_subscribed_at}

        """
        row = self._get_row(user_id)
        if row is None:
            return {"new_listing_quota": 0, "price_change_quota": 0, "last_subscribed_at": None}
        return {
            "new_listing_quota": row.new_listing_quota,
            "price_change_quota": row.price_change_quota,
            "last_subscribed_at": row.last_subscribed_at,
        }

    def _upsert_row(self, user_id: str, openid: str) -> L4MarketingSubscription:
        """获取或创建用户订阅行（并发首次创建回退重查）.

        并发场景下唯一约束冲突（uq_l4_marketing_subscriptions_user）时 rollback
        后重查，复用并发事务已提交的行。
        """
        row = self._get_row(user_id)
        if row is not None:
            return row
        row = L4MarketingSubscription(user_id=user_id, openid=openid)
        self.db.add(row)
        try:
            self.db.flush()
        except IntegrityError:
            self.db.rollback()
            row = self._get_row(user_id)
            if row is None:
                msg = "订阅记录写入失败"
                raise RuntimeError(msg) from None
        return row

    def report_result(
        self,
        user_id: str,
        results: list[tuple[str, str]],
    ) -> dict[str, int]:
        """上报订阅授权结果（accept 累计对应频道额度）.

        模板 ID → 频道映射实时经 subscribe_templates 解析（模板更换后旧上报
        自动失效）；用户上报了不属于本功能的模板 ID 时静默忽略。

        Args:
            user_id: 当前登录 C 端用户 ID
            results: [(template_id, status), ...]（requestSubscribeMessage 结果项）

        Returns:
            累计后的额度 {new_listing_quota, price_change_quota}

        """
        # 解析当前生效模板 ID → 频道（配置为空时对应频道无法映射，上报被忽略）
        channel_by_template: dict[str, str] = {}
        new_id = subscribe_templates.resolve_template_id(self.db, "project_new")
        if new_id:
            channel_by_template[new_id] = "new_listing"
        price_id = subscribe_templates.resolve_template_id(self.db, "project_price_change")
        if price_id:
            channel_by_template[price_id] = "price_change"

        user = self.db.query(User).filter(User.id == user_id).first()
        openid = (user.wechat_openid if user else None) or ""
        if not openid:
            # 无 openid 无法接收订阅消息：额度无意义，直接返回当前额度（通常全 0）
            logger.warning("订阅上报用户无 openid，忽略：user_id=%s", user_id)
            status = self.get_status(user_id)
            return {
                "new_listing_quota": int(status["new_listing_quota"]),
                "price_change_quota": int(status["price_change_quota"]),
            }

        row = self._upsert_row(user_id, openid)

        from datetime import datetime, timezone

        changed = False
        for template_id, result_status in results:
            channel = channel_by_template.get(template_id)
            if channel is None:
                logger.info("订阅上报模板 ID 与当前配置不符，忽略：template_id=%s", template_id)
                continue
            if result_status != _QUOTA_INC_STATUS:
                continue
            if channel == "new_listing":
                row.new_listing_quota += 1
            else:
                row.price_change_quota += 1
            changed = True

        if changed:
            row.last_subscribed_at = datetime.now(timezone.utc)
            row.openid = openid  # openid 快照刷新（换号绑定后保持最新）
            self.db.commit()
            self.db.refresh(row)

        return {
            "new_listing_quota": row.new_listing_quota,
            "price_change_quota": row.price_change_quota,
        }
