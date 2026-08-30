"""估价授权价变更订阅消息通知.

在小程序员工侧「授权评估价」（approve）与「调整评估价」（再次评估）成功后，
向线索提交人（客户）推送订阅消息（评估结果通知）。任何异常仅记日志，
绝不影响主流程（对齐 services/recruit/attribution.py 通知模式）。
"""

import logging
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from models import User
from models.lead import Lead
from services.system.wechat import WeChatAuthService
from settings import settings

logger = logging.getLogger(__name__)

# 点击消息跳转页（我的估价列表）
_NOTIFY_PAGE_PATH = "pages/valuation/list/index"
# 订阅消息模板（10833 · 评估结果通知）字段键名（需与微信公众平台模板字段一一对应）
_NOTIFY_FIELD_COMMUNITY = "thing3"  # 楼盘（小区名称，thing 类型 ≤20 字符）
_NOTIFY_FIELD_PRICE = "amount2"  # 评估总值(万)（amount 类型：纯数字，小数后最多 2 位，禁带「万」等符号）
_NOTIFY_FIELD_REMARK = "thing1"  # 评估结果（员工评估意见，thing 类型 ≤20 字符）
_NOTIFY_FIELD_TIME = "time4"  # 结果时间（time 类型）
# thing 类型字段长度上限（微信 thing.DATA 规则：20 字符内，超长触发 47003）
_NOTIFY_THING_MAX_LEN = 20

_CST = ZoneInfo("Asia/Shanghai")


def _resolve_creator_openids(db: Session, user_id: str) -> list[str]:
    """解析线索提交人可通知的微信 openid 列表.

    优先使用主账号直接绑定的 openid（wechat_openid 非空）；
    主账号无直接绑定时，通过 merged_to_user_id 反查仍持有 openid 的
    已合并临时账号（status='merged'）（对齐 recruit attribution 同名逻辑）。

    Returns:
        可发送 openid 列表；无任何可用的 openid 时返回空列表。

    """
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        return []
    if user.wechat_openid:
        return [user.wechat_openid]
    merged = (
        db.query(User)
        .filter(
            User.merged_to_user_id == user_id,
            User.status == "merged",
            User.wechat_openid.isnot(None),
        )
        .all()
    )
    return [u.wechat_openid for u in merged if u.wechat_openid]


def notify_eval_price_changed(
    db: Session,
    lead: Lead,
    eval_price: Decimal,
    remark: str | None,
) -> None:
    """授权价变更订阅消息通知（同步阻塞，供路由层 run_in_threadpool 调用）.

    在授权评估价（approve）与调整评估价成功后由留资链路触发；
    模板未配置 / 线索无提交人 / 提交人无可用 openid 时 info 日志留痕并跳过，
    发送或查询出现的任何异常仅 logger 记录，绝不影响评估授权结果。

    Args:
        db: 数据库会话（用于查询提交人 openid）
        lead: 已完成授权/调整的线索对象
        eval_price: 授权评估价(万)
        remark: 评估意见/调整意见（选填，空时显示「无」）

    """
    try:
        template_id = settings.wechat_valuation_price_template_id
        if not template_id:
            logger.info("订阅消息模板未配置，跳过授权价通知：lead_id=%s", lead.id)
            return
        if not lead.creator_id:
            logger.info("线索无提交人，跳过授权价通知：lead_id=%s", lead.id)
            return

        openids = _resolve_creator_openids(db, lead.creator_id)
        if not openids:
            logger.info(
                "线索提交人无任何可用的微信 openid，跳过授权价通知：lead_id=%s, creator_id=%s",
                lead.id,
                lead.creator_id,
            )
            return

        # 结果时间（Asia/Shanghai）：time 类型，格式对齐微信示例「2019年10月1日 15:01」
        now = datetime.now(_CST)
        time_text = f"{now.year}年{now.month}月{now.day}日 {now.hour:02d}:{now.minute:02d}"

        data = {
            # 楼盘/评估结果截断 20 字符（thing 类型上限）；评估结果空时显示「无」；
            # 评估总值(amount2) 为 amount 类型，仅传纯数字（单位万在消息卡片语境中自明）
            _NOTIFY_FIELD_COMMUNITY: {"value": (lead.community_name or "估价线索")[:_NOTIFY_THING_MAX_LEN]},
            _NOTIFY_FIELD_PRICE: {"value": f"{eval_price:.2f}"},
            _NOTIFY_FIELD_REMARK: {"value": (remark or "无")[:_NOTIFY_THING_MAX_LEN]},
            _NOTIFY_FIELD_TIME: {"value": time_text},
        }

        for openid in openids:
            try:
                WeChatAuthService.send_subscribe_message(openid, template_id, data, page=_NOTIFY_PAGE_PATH)
            except Exception:
                logger.exception("授权价订阅消息发送失败：lead_id=%s, openid=%s", lead.id, openid)
    except Exception:
        logger.exception("授权价订阅消息通知失败：lead_id=%s", lead.id)
