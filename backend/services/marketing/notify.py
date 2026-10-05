"""房源上新/调价订阅消息通知服务.

在 admin 创建即发布 / 草稿转发布（上新）与已发布房源调价（price_change）后，
向所有剩余额度 > 0 的订阅用户推送微信订阅消息（频道型公共通知，额度模型天然限流）。

任何异常仅记日志，绝不影响主流程（对齐 services/leads/notify.py ·
services/recruit/attribution.py 通知模式）。

调用约定（对齐既有先例）：
- Service 层保持纯同步，本模块的 notify_* 也是同步阻塞函数；
- 由路由层 ``await run_in_threadpool(notify_..., ...)`` 发起（线程池执行）。
"""

import logging
from datetime import datetime
from decimal import Decimal
from typing import TypedDict
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from models import L4MarketingNotifyLog, L4MarketingProject, L4MarketingSubscription, SendStatus
from services.system import subscribe_templates
from services.system.wechat import WeChatAuthService

logger = logging.getLogger(__name__)

# 订阅消息模板 key（subscribe_templates 配置键，DB 优先 + env 回退）
_TEMPLATE_KEY_NEW_LISTING = "project_new"
_TEMPLATE_KEY_PRICE_CHANGE = "project_price_change"

# 点击消息跳转页（房源详情页，携带 marketing_project_id）
_NOTIFY_PAGE_PATH = "pages/projects/detail/index?id={id}"

# 单批推送上限（订阅用户规模可控，单批足够；超出截断并记 skipped，P1 做补发）
_MAX_BATCH = 500

# 模板字段键名（需与微信公众平台申请的模板字段一一对应；调整申请后在此改映射即可）
_NEW_FIELD_COMMUNITY = "thing1"  # 小区名称（thing ≤20 字符）
_NEW_FIELD_HOUSE = "thing2"  # 房源信息（thing ≤20 字符）
_NEW_FIELD_PRICE = "amount1"  # 总价（amount：纯数字，禁带「万」等符号）
_NEW_FIELD_TIME = "time3"  # 上架时间（time）
_PRICE_FIELD_COMMUNITY = "thing1"  # 小区名称（thing ≤20 字符）
_PRICE_FIELD_DESC = "thing2"  # 调价说明（thing ≤20 字符）
_PRICE_FIELD_PRICE = "amount1"  # 现总价（amount：纯数字）
_PRICE_FIELD_TIME = "time3"  # 调价时间（time）
# thing 类型字段长度上限（微信 thing.DATA 规则：20 字符内，超长触发 47003）
_THING_MAX_LEN = 20

_CST = ZoneInfo("Asia/Shanghai")


class PriceSignal(TypedDict):
    """已发布房源调价信号（update_project 检出，路由层据此触发通知）."""

    old_price: float
    new_price: float


def _now_cst_text() -> str:
    """当前北京时间文本（time 类型，格式对齐微信示例「2019年10月1日 15:01」）."""
    now = datetime.now(_CST)
    return f"{now.year}年{now.month}月{now.day}日 {now.hour:02d}:{now.minute:02d}"


def _house_summary(project: L4MarketingProject) -> str:
    """房源信息摘要（thing ≤20 字符）."""
    text = f"{project.layout} · {project.orientation}"
    return text[:_THING_MAX_LEN]


def _log_send(
    db: Session,
    *,
    user_id: str,
    project_id: int,
    notify_type: str,
    template_id: str,
    status: str,
    error_msg: str | None = None,
) -> None:
    """写发送留痕（内部已包在调用方的 try/except 中，自身异常直接抛给外层记日志）."""
    db.add(
        L4MarketingNotifyLog(
            user_id=user_id,
            marketing_project_id=project_id,
            notify_type=notify_type,
            template_id=template_id,
            send_status=status,
            error_msg=error_msg[:200] if error_msg else None,
        ),
    )
    db.commit()


def _fetch_subscribers(db: Session, quota_column: object) -> list[L4MarketingSubscription]:
    """查询指定频道剩余额度 > 0 的订阅行（单批上限截断）.

    新会话中执行（notify_* 由路由层用独立线程池调用，db 会话不可跨线程复用，
    由调用方保证传入的是当前线程安全的会话）。
    """
    stmt = (
        select(L4MarketingSubscription)
        .options(selectinload("*"))
        .where(quota_column > 0)  # type: ignore[operator]
        .limit(_MAX_BATCH)
    )
    return list(db.scalars(stmt))


def notify_projects_published(
    db: Session,
    project: L4MarketingProject,
) -> None:
    """上新订阅消息通知（同步阻塞，供路由层 run_in_threadpool 调用）.

    在创建即发布 / 草稿首次转发布成功后由路由层触发；
    模板未配置 / 无订阅用户时 info 日志留痕并跳过，
    发送或查询出现的任何异常仅 logger 记录，绝不影响项目创建/发布结果。

    Args:
        db: 数据库会话（路由层依赖注入，线程池内独占使用）
        project: 已发布且 published_at 已写入的项目对象

    """
    try:
        template_id = subscribe_templates.resolve_template_id(db, _TEMPLATE_KEY_NEW_LISTING)
        if not template_id:
            logger.info("订阅消息模板未配置，跳过上新通知：project_id=%s", project.id)
            return

        subscribers = _fetch_subscribers(db, L4MarketingSubscription.new_listing_quota)
        if not subscribers:
            logger.info("无可用订阅用户，跳过上新通知：project_id=%s", project.id)
            return

        # 上架时间优先取 published_at（缺失回退 created_at），转北京时间文本
        published_at = project.published_at or project.created_at
        if published_at.tzinfo is not None:
            published_at = published_at.astimezone(_CST)
        time_text = (
            f"{published_at.year}年{published_at.month}月{published_at.day}日 "
            f"{published_at.hour:02d}:{published_at.minute:02d}"
        )

        data = {
            # 小区/房源信息截断 20 字符（thing 类型上限）；
            # 总价(amount1) 为 amount 类型，仅传纯数字（单位万在消息卡片语境中自明）
            _NEW_FIELD_COMMUNITY: {"value": (project.community_name or "新上房源")[:_THING_MAX_LEN]},
            _NEW_FIELD_HOUSE: {"value": _house_summary(project)},
            _NEW_FIELD_PRICE: {"value": f"{float(project.total_price):.1f}"},
            _NEW_FIELD_TIME: {"value": time_text},
        }
        page = _NOTIFY_PAGE_PATH.format(id=project.id)

        for sub in subscribers:
            try:
                WeChatAuthService.send_subscribe_message(sub.openid, template_id, data, page=page)
                # 送达成功：扣减上新额度并写 success 留痕（扣减失败不影响留痕）
                try:
                    sub.new_listing_quota -= 1
                    _log_send(
                        db,
                        user_id=sub.user_id,
                        project_id=project.id,
                        notify_type="new_listing",
                        template_id=template_id,
                        status=SendStatus.SUCCESS.value,
                    )
                except Exception:
                    db.rollback()
                    logger.exception("上新通知额度扣减/留痕失败：project_id=%s, user_id=%s", project.id, sub.user_id)
            except Exception as exc:
                # 发送失败：留痕 failed，不扣额度（用户未消费）
                logger.exception("上新订阅消息发送失败：project_id=%s, openid=%s", project.id, sub.openid)
                try:
                    _log_send(
                        db,
                        user_id=sub.user_id,
                        project_id=project.id,
                        notify_type="new_listing",
                        template_id=template_id,
                        status=SendStatus.FAILED.value,
                        error_msg=str(exc),
                    )
                except Exception:
                    db.rollback()
                    logger.exception("上新通知失败留痕写入失败：project_id=%s", project.id)
    except Exception:
        logger.exception("上新订阅消息通知失败：project_id=%s", project.id)


def notify_project_price_changed(
    db: Session,
    project: L4MarketingProject,
    price_signal: PriceSignal,
) -> None:
    """调价订阅消息通知（同步阻塞，供路由层 run_in_threadpool 调用）.

    在已发布房源 total_price 变更成功后由路由层触发（price_changes 记录
    由 Service 层先落库）；涨降都推：降价「总价下调 N 万」营销文案，
    涨价「总价已更新」中性文案。任何异常仅 logger 记录，绝不影响调价结果。

    Args:
        db: 数据库会话（路由层依赖注入，线程池内独占使用）
        project: 调价后的项目对象（total_price 已更新）
        price_signal: 变更信号（old_price/new_price，万元）

    """
    try:
        template_id = subscribe_templates.resolve_template_id(db, _TEMPLATE_KEY_PRICE_CHANGE)
        if not template_id:
            logger.info("订阅消息模板未配置，跳过调价通知：project_id=%s", project.id)
            return

        subscribers = _fetch_subscribers(db, L4MarketingSubscription.price_change_quota)
        if not subscribers:
            logger.info("无可用订阅用户，跳过调价通知：project_id=%s", project.id)
            return

        old_price = Decimal(str(price_signal["old_price"]))
        new_price = Decimal(str(price_signal["new_price"]))
        diff = new_price - old_price
        # 涨降都推：降价「总价下调 N 万」（营销点），涨价「总价已更新」（中性文案，
        # 不暴露幅度引导焦虑）；说明截断 20 字符（thing 类型上限）
        desc = f"总价下调 {abs(float(diff)):.0f} 万" if diff < 0 else "总价已更新"

        data = {
            _PRICE_FIELD_COMMUNITY: {"value": (project.community_name or "关注房源")[:_THING_MAX_LEN]},
            _PRICE_FIELD_DESC: {"value": desc[:_THING_MAX_LEN]},
            _PRICE_FIELD_PRICE: {"value": f"{float(new_price):.1f}"},
            _PRICE_FIELD_TIME: {"value": _now_cst_text()},
        }
        page = _NOTIFY_PAGE_PATH.format(id=project.id)

        for sub in subscribers:
            try:
                WeChatAuthService.send_subscribe_message(sub.openid, template_id, data, page=page)
                # 送达成功：扣减调价额度并写 success 留痕（扣减失败不影响留痕）
                try:
                    sub.price_change_quota -= 1
                    _log_send(
                        db,
                        user_id=sub.user_id,
                        project_id=project.id,
                        notify_type="price_change",
                        template_id=template_id,
                        status=SendStatus.SUCCESS.value,
                    )
                except Exception:
                    db.rollback()
                    logger.exception("调价通知额度扣减/留痕失败：project_id=%s, user_id=%s", project.id, sub.user_id)
            except Exception as exc:
                # 发送失败：留痕 failed，不扣额度（用户未消费）
                logger.exception("调价订阅消息发送失败：project_id=%s, openid=%s", project.id, sub.openid)
                try:
                    _log_send(
                        db,
                        user_id=sub.user_id,
                        project_id=project.id,
                        notify_type="price_change",
                        template_id=template_id,
                        status=SendStatus.FAILED.value,
                        error_msg=str(exc),
                    )
                except Exception:
                    db.rollback()
                    logger.exception("调价通知失败留痕写入失败：project_id=%s", project.id)
    except Exception:
        logger.exception("调价订阅消息通知失败：project_id=%s", project.id)
