"""房源上新/调价订阅消息通知服务.

在 admin 创建即发布 / 草稿转发布（上新）与已发布房源调价（price_change）后，
向所有剩余额度 > 0 的订阅用户推送微信订阅消息（频道型公共通知，额度模型天然限流）。

任何异常仅记日志，绝不影响主流程（对齐 services/leads/notify.py ·
services/recruit/attribution.py 通知模式）。

调用约定：
- notify_* 为后台任务入口（FastAPI BackgroundTasks 在响应返回后执行），
  自建独立数据库会话（不能复用请求依赖注入的会话——后台任务执行时请求会话已关闭），
  入口捕获一切异常仅 logger 记录；
- 微信 errcode 语义：send_subscribe_message 返回 0 才算受理成功；
  43101/40003 等预期业务态返回非 0 原码——未真正送达时不扣额度，
  留痕 skipped（用户额度授权保留，可继续接收后续推送）；
- 额度扣减为原子条件更新（``quota = quota - 1 WHERE quota > 0``），
  防止并发推送对同一订阅行双扣。
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import TypedDict
from zoneinfo import ZoneInfo

from sqlalchemy import select, update
from sqlalchemy.orm import InstrumentedAttribute, Session

from db import SessionLocal
from models import (
    L4MarketingNotifyLog,
    L4MarketingPriceChange,
    L4MarketingProject,
    L4MarketingSubscription,
    SendStatus,
)
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


@dataclass(slots=True)
class ProjectChangeSignal:
    """项目变更信号（update_project 检出，路由层据此后台触发订阅消息通知）."""

    is_new_listing: bool = False
    price_signal: PriceSignal | None = None


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


def _safe_log(db: Session, **kwargs: object) -> None:
    """留痕写入兜底（失败仅回滚记日志，不影响发送循环与额度扣减）."""
    try:
        _log_send(db, **kwargs)  # type: ignore[arg-type]
    except Exception:
        db.rollback()
        logger.exception("通知留痕写入失败：project_id=%s", kwargs.get("project_id"))


def _fetch_subscribers(
    db: Session,
    quota_column: InstrumentedAttribute[int],
) -> list[L4MarketingSubscription]:
    """查询指定频道剩余额度 > 0 的订阅行（单批上限截断）."""
    stmt = select(L4MarketingSubscription).where(quota_column > 0).limit(_MAX_BATCH)
    return list(db.scalars(stmt))


def _decrement_quota(
    db: Session,
    subscription_id: int,
    quota_column: InstrumentedAttribute[int],
) -> bool:
    """原子扣减订阅额度（``quota = quota - 1 WHERE quota > 0``，防并发双扣）.

    Returns:
        True 表示扣减成功；False 表示额度已为 0（并发下被其他推送扣完）

    """
    updated = db.execute(
        update(L4MarketingSubscription)
        .where(
            L4MarketingSubscription.id == subscription_id,
            quota_column > 0,
        )
        .values(**{quota_column.key: quota_column - 1})
    )
    db.commit()
    return (updated.rowcount or 0) > 0


def notify_projects_published(project_id: int) -> None:
    """上新订阅消息通知（后台任务入口，自建会话并吞掉一切异常）.

    在创建即发布 / 草稿首次转发布成功后由路由层 BackgroundTasks 触发；
    模板未配置 / 无订阅用户时 info 日志留痕并跳过。

    Args:
        project_id: 已发布且 published_at 已写入的项目 ID

    """
    try:
        with SessionLocal() as db:
            _notify_projects_published(db, project_id)
    except Exception:
        logger.exception("上新订阅消息通知失败：project_id=%s", project_id)


def _notify_projects_published(db: Session, project_id: int) -> None:
    """上新通知主体（同步阻塞，调用方负责异常兜底与会话生命周期）."""
    # 重读项目（后台任务执行时传入对象已随请求会话关闭，仅传 ID）
    project = db.get(L4MarketingProject, project_id)
    if project is None:
        logger.info("上新通知项目不存在（可能已删除），跳过：project_id=%s", project_id)
        return

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
        # 先取快照（扣减 commit 会过期 ORM 对象，避免过期重载）
        user_id = sub.user_id
        openid = sub.openid
        try:
            errcode = WeChatAuthService.send_subscribe_message(openid, template_id, data, page=page)
        except Exception as exc:
            # 发送失败：留痕 failed，不扣额度（用户未消费）
            logger.exception("上新订阅消息发送失败：project_id=%s, openid=%s", project.id, openid)
            _safe_log(
                db,
                user_id=user_id,
                project_id=project.id,
                notify_type="new_listing",
                template_id=template_id,
                status=SendStatus.FAILED.value,
                error_msg=str(exc),
            )
            continue
        if errcode != 0:
            # 43101/40003 等预期业务态：未真正送达，留痕 skipped，不扣额度（授权保留）
            _safe_log(
                db,
                user_id=user_id,
                project_id=project.id,
                notify_type="new_listing",
                template_id=template_id,
                status=SendStatus.SKIPPED.value,
                error_msg=f"errcode={errcode}",
            )
            continue
        # 送达成功：原子扣减额度（quota>0 条件更新，防并发双扣）+ success 留痕
        if _decrement_quota(db, sub.id, L4MarketingSubscription.new_listing_quota):
            _safe_log(
                db,
                user_id=user_id,
                project_id=project.id,
                notify_type="new_listing",
                template_id=template_id,
                status=SendStatus.SUCCESS.value,
            )
        else:
            # 消息已发出但额度被并发推送扣完（一次性订阅超额消费），仅记日志
            logger.warning(
                "上新通知送达但额度并发扣减失败（quota 已为 0）：project_id=%s, user_id=%s",
                project.id,
                user_id,
            )


def notify_project_price_changed(
    project_id: int,
    price_signal: PriceSignal | None = None,
) -> None:
    """调价订阅消息通知（后台任务入口，自建会话并吞掉一切异常）.

    在已发布房源 total_price 变更成功后由路由层 BackgroundTasks 触发
    （price_changes 记录由 Service 层先落库）；涨降都推：降价「总价下调 N 万」
    营销文案，涨价「总价已更新」中性文案。任何异常仅 logger 记录，
    绝不影响调价结果。

    Args:
        project_id: 调价后的项目 ID（total_price 已更新）
        price_signal: 变更信号（old_price/new_price，万元）；
            缺省时回退读 l4_marketing_price_changes 最近一条重算（防御性兼容）

    """
    try:
        with SessionLocal() as db:
            _notify_project_price_changed(db, project_id, price_signal)
    except Exception:
        logger.exception("调价订阅消息通知失败：project_id=%s", project_id)


def _notify_project_price_changed(
    db: Session,
    project_id: int,
    price_signal: PriceSignal | None,
) -> None:
    """调价通知主体（同步阻塞，调用方负责异常兜底与会话生命周期）."""
    # 重读项目（后台任务执行时传入对象已随请求会话关闭，仅传 ID）
    project = db.get(L4MarketingProject, project_id)
    if project is None:
        logger.info("调价通知项目不存在（可能已删除），跳过：project_id=%s", project_id)
        return

    template_id = subscribe_templates.resolve_template_id(db, _TEMPLATE_KEY_PRICE_CHANGE)
    if not template_id:
        logger.info("订阅消息模板未配置，跳过调价通知：project_id=%s", project.id)
        return

    subscribers = _fetch_subscribers(db, L4MarketingSubscription.price_change_quota)
    if not subscribers:
        logger.info("无可用订阅用户，跳过调价通知：project_id=%s", project.id)
        return

    if price_signal is None:
        # 信号缺失兜底：回退调价历史最近一条（记录由 Service 层先落库）
        change = (
            db.query(L4MarketingPriceChange)
            .filter(L4MarketingPriceChange.marketing_project_id == project.id)
            .order_by(L4MarketingPriceChange.created_at.desc())
            .first()
        )
        price_signal = (
            PriceSignal(old_price=float(change.old_price), new_price=float(change.new_price))
            if change
            else PriceSignal(old_price=float(project.total_price), new_price=float(project.total_price))
        )

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
        user_id = sub.user_id
        openid = sub.openid
        try:
            errcode = WeChatAuthService.send_subscribe_message(openid, template_id, data, page=page)
        except Exception as exc:
            # 发送失败：留痕 failed，不扣额度（用户未消费）
            logger.exception("调价订阅消息发送失败：project_id=%s, openid=%s", project.id, openid)
            _safe_log(
                db,
                user_id=user_id,
                project_id=project.id,
                notify_type="price_change",
                template_id=template_id,
                status=SendStatus.FAILED.value,
                error_msg=str(exc),
            )
            continue
        if errcode != 0:
            # 43101/40003 等预期业务态：未真正送达，留痕 skipped，不扣额度（授权保留）
            _safe_log(
                db,
                user_id=user_id,
                project_id=project.id,
                notify_type="price_change",
                template_id=template_id,
                status=SendStatus.SKIPPED.value,
                error_msg=f"errcode={errcode}",
            )
            continue
        # 送达成功：原子扣减额度（quota>0 条件更新，防并发双扣）+ success 留痕
        if _decrement_quota(db, sub.id, L4MarketingSubscription.price_change_quota):
            _safe_log(
                db,
                user_id=user_id,
                project_id=project.id,
                notify_type="price_change",
                template_id=template_id,
                status=SendStatus.SUCCESS.value,
            )
        else:
            logger.warning(
                "调价通知送达但额度并发扣减失败（quota 已为 0）：project_id=%s, user_id=%s",
                project.id,
                user_id,
            )
