"""「我的客户」订阅消息通知服务.

新线索留资与后台状态变更时，向线索归属员工推送微信订阅消息
（复用 ``WeChatAuthService.send_subscribe_message``；员工 openid 解析
对齐 services/recruit/attribution 与 services/leads/notify 模式）。

所有通知均为 best-effort：模板未配置 / 无归属员工 / openid 解析失败时
日志留痕并静默跳过，发送或查询出现的任何异常仅 logger 记录，绝不向上抛、
绝不影响留资与状态流转主流程。
"""

import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from models import User
from schemas.growth_center import GrowthModule, UnifiedLeadStatus
from services.growth_center.flow_matrix import UNIFIED_STATUS_LABELS
from services.system.wechat import WeChatAuthService
from settings import settings

logger = logging.getLogger(__name__)

# 点击消息跳转页（小程序「我的客户」列表页）
_NOTIFY_PAGE_PATH = "pages/customers/mine/index"
# 订阅消息模板字段键名（需与微信公众平台「我的客户」模板字段一一对应；
# 模板实际配置前按订阅消息常用 thing/time 结构组织）
_NOTIFY_FIELD_SUMMARY = "thing1"  # 摘要（thing 类型 ≤20 字符）
_NOTIFY_FIELD_TIME = "time2"  # 时间（time 类型）
# thing 类型字段长度上限（微信 thing.DATA 规则：20 字符内，超长触发 47003）
_NOTIFY_THING_MAX_LEN = 20

# 模块 → 摘要文案前缀（module 参数取 GrowthModule.value）
_MODULE_LABELS: dict[str, str] = {
    GrowthModule.VALUATION.value: "估价",
    GrowthModule.BOOKING.value: "预约",
    GrowthModule.SHEET.value: "房源单",
    GrowthModule.RECRUIT.value: "招募",
}

# 统一状态值 → 中文标签（单一口径：叶子模块 flow_matrix.UNIFIED_STATUS_LABELS）

_CST = ZoneInfo("Asia/Shanghai")


def unified_status_label(unified_value: str) -> str:
    """统一状态值 → 中文标签.

    Args:
        unified_value: 统一状态值（UnifiedLeadStatus.value）

    Returns:
        中文名；未知取值回退原值

    """
    try:
        return UNIFIED_STATUS_LABELS[UnifiedLeadStatus(unified_value)]
    except ValueError:
        return unified_value


def _resolve_employee_openids(db: Session, employee_id: str) -> list[str]:
    """解析归属员工可通知的微信 openid 列表.

    优先使用主账号直接绑定的 openid（wechat_openid 非空）；主账号无直接
    绑定时，通过 merged_to_user_id 反查仍持有 openid 的已合并临时账号
    （status='merged'）（对齐 recruit attribution 同名逻辑）。

    Args:
        db: 数据库会话
        employee_id: 归属员工用户ID

    Returns:
        可发送 openid 列表；无任何可用的 openid 时返回空列表。

    """
    employee = db.query(User).filter(User.id == employee_id).first()
    if employee is None:
        return []
    if employee.wechat_openid:
        return [employee.wechat_openid]
    merged = (
        db.query(User)
        .filter(
            User.merged_to_user_id == employee_id,
            User.status == "merged",
            User.wechat_openid.isnot(None),
        )
        .all()
    )
    return [u.wechat_openid for u in merged if u.wechat_openid]


def _send_customer_notify(db: Session, lead_id: int | str, referrer_user_id: str | None, summary: str) -> None:
    """best-effort 发送核心：全链路静默跳过 + 全异常捕获仅记日志.

    Args:
        db: 数据库会话（用于查询归属员工 openid）
        lead_id: 线索ID（仅用于日志定位）
        referrer_user_id: 归属员工用户ID（为空时跳过）
        summary: 通知摘要文案（超长自动截断至 thing 类型上限）

    """
    try:
        template_id = settings.wechat_customer_lead_template_id
        if not template_id:
            logger.debug("订阅消息模板未配置，跳过我的客户通知：lead_id=%s", lead_id)
            return
        if not referrer_user_id:
            logger.debug("线索无归属员工，跳过我的客户通知：lead_id=%s", lead_id)
            return

        openids = _resolve_employee_openids(db, referrer_user_id)
        if not openids:
            logger.info(
                "归属员工无任何可用的微信 openid，跳过我的客户通知：lead_id=%s, employee_id=%s",
                lead_id,
                referrer_user_id,
            )
            return

        # 时间文案（Asia/Shanghai）：time 类型，格式对齐既有通知「2019年10月1日 15:01」
        now = datetime.now(_CST)
        time_text = f"{now.year}年{now.month}月{now.day}日 {now.hour:02d}:{now.minute:02d}"

        data = {
            # 摘要截断 20 字符（thing 类型上限）
            _NOTIFY_FIELD_SUMMARY: {"value": summary[:_NOTIFY_THING_MAX_LEN]},
            _NOTIFY_FIELD_TIME: {"value": time_text},
        }

        for openid in openids:
            try:
                WeChatAuthService.send_subscribe_message(openid, template_id, data, page=_NOTIFY_PAGE_PATH)
            except Exception:
                logger.exception("我的客户订阅消息发送失败：lead_id=%s, openid=%s", lead_id, openid)
    except Exception:
        logger.exception("我的客户订阅消息通知失败：lead_id=%s", lead_id)


def notify_new_customer_lead(
    db: Session,
    module: str,
    lead_id: int | str,
    referrer_user_id: str | None,
    summary: str,
) -> None:
    """新线索留资订阅消息通知（同步阻塞，供路由层 run_in_threadpool 或同步 Service 调用）.

    仅在首次新线索（is_new=True）创建成功后由留资链路触发；模板未配置 /
    无归属员工 / openid 解析失败时静默跳过，任何异常仅 logger 记录，
    绝不影响留资结果。

    Args:
        db: 数据库会话（用于查询归属员工 openid）
        module: 获客模块（GrowthModule.value：valuation/booking/sheet/recruit）
        lead_id: 线索ID
        referrer_user_id: 归属员工用户ID（为空即内部创建/无归属，静默跳过）
        summary: 线索摘要（如小区名/房源标题/商圈名）

    """
    module_label = _MODULE_LABELS.get(module, module)
    _send_customer_notify(db, lead_id, referrer_user_id, f"{module_label}新线索：{summary}")


def notify_customer_status_changed(
    db: Session,
    module: str,
    lead_id: int | str,
    referrer_user_id: str | None,
    status_label: str,
    summary: str,
) -> None:
    """线索状态变更订阅消息通知（同步阻塞，供路由层 run_in_threadpool 或同步 Service 调用）.

    仅在后台（admin）变更线索状态且统一状态实际变化后触发；模板未配置 /
    无归属员工 / openid 解析失败时静默跳过，任何异常仅 logger 记录，
    绝不影响状态流转结果。

    Args:
        db: 数据库会话（用于查询归属员工 openid）
        module: 获客模块（GrowthModule.value：valuation/sheet/recruit）
        lead_id: 线索ID
        referrer_user_id: 归属员工用户ID（为空即无归属，静默跳过）
        status_label: 变更后的统一状态中文标签
        summary: 线索摘要（如小区名/商圈名）

    """
    module_label = _MODULE_LABELS.get(module, module)
    _send_customer_notify(db, lead_id, referrer_user_id, f"{module_label}状态变更为「{status_label}」：{summary}")
