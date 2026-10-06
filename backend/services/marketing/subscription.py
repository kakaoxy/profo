"""房源订阅通知 C 端服务.

订阅额度账本（l4_marketing_subscriptions）的读写：
- get_status：查询当前用户两频道剩余额度
- report_result：小程序 requestSubscribeMessage 结果上报，仅 accept 计入额度
  （模板 ID → 频道映射经 subscribe_templates 解析，用户不存在的模板 ID 静默忽略）
- get_project_status / report_project_result：房源级订阅（l4_marketing_project_subscriptions）
  状态查询与 accept 上报（一人一房源一行，upsert 复用 _upsert_row 模式）
- get_global_stats：订阅漏斗全局统计（admin 端点数据源，Router 禁 SQL 全部在此聚合）
- 每人一行 upsert（uq 唯一约束 + 冲突回退重查，对齐 subscribe_templates 服务同口径）
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import func, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import (
    L4MarketingProject,
    L4MarketingProjectSubscription,
    L4MarketingSubscription,
    User,
)
from schemas.l4_marketing import L4MarketingSubscriptionStatsResponse
from services.system import subscribe_templates
from services.system.exceptions import ResourceNotFoundError

logger = logging.getLogger(__name__)

# 授权结果 → 是否计入额度（一次性订阅：每次「允许」可收 1 条；其余状态不计数）
_QUOTA_INC_STATUS = "accept"


def _resolve_user_openid(db: Session, user: User | None) -> str:
    """解析用户可通知的微信 openid（订阅行快照用）.

    直接绑定（user.wechat_openid 非空）优先；主账号无直接绑定时反查
    merged_to_user_id 指向该用户、仍持有 openid 的已合并临时账号
    （status='merged'，间接绑定，对齐 leads/recruit 通知的 openid 解析口径）。

    内部员工经「微信临时账号 → 合并到主账号」绑定后 openid 保留在临时账号上，
    主账号 wechat_openid 为空是预期状态（merge_accounts 设计如此，转移会阻断
    主账号密码登录）。间接绑定返回首个 carrier 的 openid（订阅行仅存单个快照）。

    Returns:
        可投递 openid；无任何绑定时返回空串（额度仍累计，推送侧跳过该行）

    """
    if user is None:
        return ""
    if user.wechat_openid:
        return user.wechat_openid
    carrier = (
        db.query(User)
        .filter(
            User.merged_to_user_id == user.id,
            User.status == "merged",
            User.wechat_openid.isnot(None),
        )
        .first()
    )
    return carrier.wechat_openid if carrier else ""


def _dedup_results(results: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """按 template_id 去重（保留首次出现）.

    wx.requestSubscribeMessage 单次回调同一模板 ID 只返回一项，正常上报天然无
    重复；恶意/异常客户端在同一次请求中重复携带同一模板 ID 时按一次授权计，
    防止单请求多次累加额度（对齐一次性订阅语义：一次「允许」= 1 条额度）。
    """
    seen: set[str] = set()
    deduped: list[tuple[str, str]] = []
    for item in results:
        if item[0] in seen:
            continue
        seen.add(item[0])
        deduped.append(item)
    return deduped


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

    def get_global_stats(self) -> L4MarketingSubscriptionStatsResponse:
        """订阅漏斗全局统计（admin 端点数据源，Router 禁 SQL，聚合全部在此）.

        单表聚合（订阅表行数 = C 端用户量级，count/sum 无性能风险）：
        - new_listing_subscribers / price_change_subscribers：对应频道剩余额度 >0
          人数（可触达）
        - total_subscribers：任一频道订阅过的人数（总行数）
        - total_new_quota / total_price_quota：两频道额度池总量
        - project_level_subscribers：房源级订阅人数（去重 user_id，P2-1）
        - project_level_watches：房源级订阅关系总数（P2-1）

        Returns:
            全局统计响应模型

        """
        new_listing_subscribers = (
            self.db.query(L4MarketingSubscription).filter(L4MarketingSubscription.new_listing_quota > 0).count()
        )
        price_change_subscribers = (
            self.db.query(L4MarketingSubscription).filter(L4MarketingSubscription.price_change_quota > 0).count()
        )
        total_subscribers = self.db.query(func.count(L4MarketingSubscription.id)).scalar() or 0
        total_new_quota = (
            self.db.query(func.coalesce(func.sum(L4MarketingSubscription.new_listing_quota), 0)).scalar() or 0
        )
        total_price_quota = (
            self.db.query(func.coalesce(func.sum(L4MarketingSubscription.price_change_quota), 0)).scalar() or 0
        )

        # 房源级订阅统计（P2-1；表未建时降级 0，不阻断频道级统计）
        project_level_subscribers = 0
        project_level_watches = 0
        try:
            project_level_subscribers = (
                self.db.query(func.count(func.distinct(L4MarketingProjectSubscription.user_id))).scalar() or 0
            )
            project_level_watches = self.db.query(func.count(L4MarketingProjectSubscription.id)).scalar() or 0
        except Exception:
            # 表尚未迁移时 SQLAlchemy 抛 ProgrammingError：降级 0，不阻断频道级统计
            self.db.rollback()
            logger.warning("房源级订阅表不可用，统计降级为 0（P2-1 未迁移）")

        return L4MarketingSubscriptionStatsResponse(
            new_listing_subscribers=int(new_listing_subscribers),
            price_change_subscribers=int(price_change_subscribers),
            total_subscribers=int(total_subscribers),
            total_new_quota=int(total_new_quota),
            total_price_quota=int(total_price_quota),
            project_level_subscribers=int(project_level_subscribers),
            project_level_watches=int(project_level_watches),
        )

    def report_result(
        self,
        user_id: str,
        results: list[tuple[str, str]],
    ) -> dict[str, int]:
        """上报订阅授权结果（accept 累计对应频道额度）.

        模板 ID → 频道映射实时经 subscribe_templates 解析（模板更换后旧上报
        自动失效）；用户上报了不属于本功能的模板 ID 时静默忽略；同一模板 ID
        多次携带按一次授权计（_dedup_results 去重，防单请求刷额度）。
        额度累计为原子 UPDATE（quota = quota + N），防同用户并发上报丢失更新。

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
        # openid 快照解析：直接绑定优先，间接绑定回退已合并临时账号（内部员工
        # 微信绑定经合并后 openid 保留在临时账号，主账号为空是预期状态）；
        # 仍解析不到时留空（额度照常累计，推送侧跳过该行）
        openid = _resolve_user_openid(self.db, user)

        row = self._upsert_row(user_id, openid)

        # 单模板一次授权最多计 1（去重后 accept 项逐频道计数）
        new_inc = 0
        price_inc = 0
        for template_id, result_status in _dedup_results(results):
            channel = channel_by_template.get(template_id)
            if channel is None:
                logger.info("订阅上报模板 ID 与当前配置不符，忽略：template_id=%s", template_id)
                continue
            if result_status != _QUOTA_INC_STATUS:
                continue
            if channel == "new_listing":
                new_inc += 1
            else:
                price_inc += 1

        if new_inc or price_inc:
            # 原子累计（quota = quota + N WHERE user_id），防同用户并发上报丢失更新；
            # openid 快照刷新（换号绑定后保持最新；空值不覆盖已有快照）
            values: dict[str, object] = {"last_subscribed_at": datetime.now(timezone.utc)}
            if openid:
                values["openid"] = openid
            if new_inc:
                values["new_listing_quota"] = L4MarketingSubscription.new_listing_quota + new_inc
            if price_inc:
                values["price_change_quota"] = L4MarketingSubscription.price_change_quota + price_inc
            self.db.execute(
                update(L4MarketingSubscription).where(L4MarketingSubscription.user_id == user_id).values(**values)
            )
            self.db.commit()
            self.db.refresh(row)

        return {
            "new_listing_quota": row.new_listing_quota,
            "price_change_quota": row.price_change_quota,
        }

    # ==================================================================
    # 房源级订阅（P2-1「只盯这一套」）：与频道级账本相互独立
    # ==================================================================

    def _get_project_row(
        self,
        user_id: str,
        marketing_project_id: int,
    ) -> L4MarketingProjectSubscription | None:
        """查询用户对某房源的订阅行（无则 None）."""
        return (
            self.db.query(L4MarketingProjectSubscription)
            .filter(
                L4MarketingProjectSubscription.user_id == user_id,
                L4MarketingProjectSubscription.marketing_project_id == marketing_project_id,
            )
            .first()
        )

    def get_project_status(self, user_id: str, marketing_project_id: int) -> dict[str, object]:
        """查询当前用户对指定房源的订阅状态.

        Args:
            user_id: 当前登录 C 端用户 ID
            marketing_project_id: 房源 ID

        Returns:
            {subscribed, price_change_quota, last_subscribed_at}

        """
        row = self._get_project_row(user_id, marketing_project_id)
        if row is None:
            return {
                "subscribed": False,
                "price_change_quota": 0,
                "last_subscribed_at": None,
            }
        return {
            "subscribed": True,
            "price_change_quota": row.price_change_quota,
            "last_subscribed_at": row.last_subscribed_at,
        }

    def _upsert_project_row(
        self,
        user_id: str,
        marketing_project_id: int,
        openid: str,
    ) -> L4MarketingProjectSubscription:
        """获取或创建房源级订阅行（并发首次创建回退重查，对齐 _upsert_row 模式）.

        并发场景下唯一约束冲突（uq_l4_project_subs_user_project）时 rollback
        后重查，复用并发事务已提交的行。
        """
        row = self._get_project_row(user_id, marketing_project_id)
        if row is not None:
            return row
        row = L4MarketingProjectSubscription(
            user_id=user_id,
            marketing_project_id=marketing_project_id,
            openid=openid,
        )
        self.db.add(row)
        try:
            self.db.flush()
        except IntegrityError:
            self.db.rollback()
            row = self._get_project_row(user_id, marketing_project_id)
            if row is None:
                msg = "房源级订阅记录写入失败"
                raise RuntimeError(msg) from None
        return row

    def report_project_result(
        self,
        user_id: str,
        marketing_project_id: int,
        results: list[tuple[str, str]],
    ) -> dict[str, object]:
        """上报房源级订阅授权结果（accept 累计房源级额度 +1）.

        模板 ID 映射复用 project_price_change 配置（与频道级调价模板同一模板）；
        用户上报了不属于本功能的模板 ID 时静默忽略；同一模板 ID 多次携带按
        一次授权计（_dedup_results 去重）；额度累计为原子 UPDATE，房源不存在/
        已删除时 404。

        Args:
            user_id: 当前登录 C 端用户 ID
            marketing_project_id: 房源 ID
            results: [(template_id, status), ...]（requestSubscribeMessage 结果项）

        Returns:
            {subscribed, price_change_quota, last_subscribed_at}

        Raises:
            ResourceNotFoundError: 房源不存在或已删除

        """
        project = (
            self.db.query(L4MarketingProject)
            .filter(
                L4MarketingProject.id == marketing_project_id,
                L4MarketingProject.is_deleted.is_(False),
            )
            .first()
        )
        if project is None:
            msg = "房源不存在"
            raise ResourceNotFoundError(msg)

        user = self.db.query(User).filter(User.id == user_id).first()
        # openid 快照解析：直接绑定优先，间接绑定回退已合并临时账号（同 report_result 口径）；
        # 仍解析不到时留空（额度照常累计，推送侧跳过该行）
        openid = _resolve_user_openid(self.db, user)

        row = self._upsert_project_row(user_id, marketing_project_id, openid)

        price_id = subscribe_templates.resolve_template_id(self.db, "project_price_change")
        # 单模板一次授权最多计 1（去重后 accept 项计数）
        price_inc = 0
        for template_id, result_status in _dedup_results(results):
            if template_id != price_id:
                logger.info(
                    "房源级订阅上报模板 ID 与当前配置不符，忽略：template_id=%s",
                    template_id,
                )
                continue
            if result_status != _QUOTA_INC_STATUS:
                continue
            price_inc += 1

        if price_inc:
            # 原子累计（quota = quota + N WHERE user+project），防同用户并发上报丢失更新；
            # openid 快照刷新（换号绑定后保持最新；空值不覆盖已有快照）
            values: dict[str, object] = {
                "price_change_quota": L4MarketingProjectSubscription.price_change_quota + price_inc,
                "last_subscribed_at": datetime.now(timezone.utc),
            }
            if openid:
                values["openid"] = openid
            self.db.execute(
                update(L4MarketingProjectSubscription)
                .where(
                    L4MarketingProjectSubscription.user_id == user_id,
                    L4MarketingProjectSubscription.marketing_project_id == marketing_project_id,
                )
                .values(**values)
            )
            self.db.commit()
            self.db.refresh(row)

        return {
            "subscribed": True,
            "price_change_quota": row.price_change_quota,
            "last_subscribed_at": row.last_subscribed_at,
        }

    def cancel_project_subscription(self, user_id: str, marketing_project_id: int) -> dict[str, object]:
        """取消房源级调价提醒（清零剩余额度，保留订阅行）.

        一次性订阅额度已被微信授权锁定，取消无法退回微信侧：本地清零剩余额度
        （后续调价不再推送），保留订阅行以维持 admin 订阅人数累计口径与续订复用。
        幂等：未订阅时返回未订阅状态而非 404（重复点击取消不报错）。
        房源不存在/已删除时 404。

        Args:
            user_id: 当前登录 C 端用户 ID
            marketing_project_id: 房源 ID

        Returns:
            {subscribed, price_change_quota, last_subscribed_at}

        Raises:
            ResourceNotFoundError: 房源不存在或已删除

        """
        project = (
            self.db.query(L4MarketingProject)
            .filter(
                L4MarketingProject.id == marketing_project_id,
                L4MarketingProject.is_deleted.is_(False),
            )
            .first()
        )
        if project is None:
            msg = "房源不存在"
            raise ResourceNotFoundError(msg)

        row = self._get_project_row(user_id, marketing_project_id)
        if row is not None and row.price_change_quota > 0:
            row.price_change_quota = 0
            self.db.commit()
            self.db.refresh(row)
        return self.get_project_status(user_id, marketing_project_id)
