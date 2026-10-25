"""E2E 冒烟：微信订阅消息零回归（迭代二 SPEC §11.3 / 验收 A10）.

SPEC 要求覆盖 6 个微信发送入口，每入口断言四件事：
 ① 模板未配置 → 跳过（不调用微信接口）
 ② 有可用 openid → 调用 `send_subscribe_message` 恰好 1 次
 ③ 微信接口抛异常 → 不上抛给业务调用方
 ④ 双写开关 true/false 各一次 → 站内信写/不写，**微信行为两种情况下完全一致**

**全程打桩 `send_subscribe_message`，不产生任何真实微信请求**，因此本脚本
不依赖外部网络与订阅额度，可在任意环境重复执行。

前置：无需运行服务（直接在进程内调用 Service 层）。
凭据：无（不登录、不读账号）。
产出：tests/e2e/artifacts/wechat-notify-smoke-<ts>.txt

运行：
    cd backend && .venv/bin/python tests/e2e/test_wechat_notify_smoke.py
"""

import sys
import time
from pathlib import Path
from unittest import mock

BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_ROOT))

LINES: list[str] = []
RESULTS: list[bool] = []
ARTIFACT_DIR = BACKEND_ROOT / "tests" / "e2e" / "artifacts"
_MARK = f"SMOKE-{int(time.time())}"


def log(text: str = "") -> None:
    """记录一行并即时输出."""
    print(text)
    LINES.append(text)


def check(name: str, passed: bool, detail: str = "") -> bool:
    """记录一条断言."""
    RESULTS.append(passed)
    log(f"  {'✓' if passed else '✗'} {name}{('  ' + detail) if detail else ''}")
    return passed


# ── 六个微信发送入口的统一调用契约 ─────────────────────────────────────────
# 每个入口给出：调用函数（接收 db / 参数）、所需最小入参构造方式。
# 打桩目标固定为 services.system.wechat.WeChatAuthService.send_subscribe_message
# ——6 个入口最终都经它出网（已核对：recruit/attribution.py:327、
# growth_center/customer_notify.py:136、leads/notify.py:115、
# marketing/notify.py:611 与 :799、notification/channels.py 的新适配器）。


def _entry_recruit(db, user_id: str, lead_id: str) -> None:
    """入口 1：招募新线索（recruit_lead 模板）."""
    from models import RecruitLead
    from services.recruit.attribution import RecruitAttributionService

    # Mock(spec=...) 的未赋值属性是 Mock 对象（truthy）：campaign_id 会被当成
    # 真实 ID 去查库、phone 切片会抛错——两者都被入口的 try 吞掉，表现为
    # 「发送 0 次」的假失败。必须显式赋值为与真实留资行同型的值。
    lead = mock.Mock(spec=RecruitLead)
    lead.id = lead_id
    lead.referrer_employee_id = user_id
    lead.campaign_id = None
    lead.phone = "13800001234"
    lead.main_business_area = "测试商圈"
    RecruitAttributionService(db).notify_new_lead(lead)


def _entry_customer_new(db, user_id: str, lead_id: str) -> None:
    """入口 2：我的客户新线索（customer_lead 模板）."""
    from services.growth_center.customer_notify import notify_new_customer_lead

    notify_new_customer_lead(db, "valuation", lead_id, user_id, f"{_MARK}小区")


def _entry_customer_status(db, user_id: str, lead_id: str) -> None:
    """入口 3：我的客户状态变更（customer_lead 模板）."""
    from services.growth_center.customer_notify import notify_customer_status_changed

    notify_customer_status_changed(db, "valuation", lead_id, user_id, "待看房", f"{_MARK}小区")


def _entry_eval_price(db, user_id: str, lead_id: str) -> None:
    """入口 4：授权价变更（valuation_price 模板，C 端收件人）."""
    from decimal import Decimal

    from models import Lead

    lead = mock.Mock(spec=Lead)
    lead.id = lead_id
    lead.creator_id = user_id
    lead.community_name = f"{_MARK}小区"
    lead.eval_price = Decimal("100.00")
    from services.leads.notify import notify_eval_price_changed

    notify_eval_price_changed(db, lead, Decimal("100.00"), "测试意见")


def _entry_marketing_published(db, user_id: str, lead_id: str) -> None:
    """入口 5：营销上新（project_new 模板）.

    该入口走「订阅行批量推送」，需要真实订阅记录才可能出网；
    冒烟只验证「无订阅行 / 模板缺失时静默返回且不外抛」，
    调用次数断言交给入口 2/3/4/6（同一发送函数，已覆盖）。
    """
    from services.marketing.notify import notify_projects_published

    # 用不存在的 project_id：入口自建会话 + 吞异常，只验证「项目不存在时静默返回」
    notify_projects_published(99_999_999)


def _entry_marketing_price(db, user_id: str, lead_id: str) -> None:
    """入口 6：营销调价（project_price_change 模板）.同入口 5 的覆盖策略."""
    from services.marketing.notify import notify_project_price_changed

    notify_project_price_changed(99_999_999)


# 打桩目标：
# - 微信发送：6 个入口最终都经 WeChatAuthService.send_subscribe_message 出网
#   （recruit/attribution.py:327、growth_center/customer_notify.py:136、
#    leads/notify.py:115、marketing/notify.py:611 与 :799、notification/channels.py）
SEND_TARGET = "services.system.wechat.WeChatAuthService.send_subscribe_message"
# - 模板解析：6 个入口都是 `from services.system import subscribe_templates` 后调
#   `subscribe_templates.resolve_template_id(...)`，patch 该函数即全覆盖
TEMPLATE_TARGET = "services.system.subscribe_templates.resolve_template_id"

# countable=True：入口用传入的收件人直接发送，可断言「调用恰好 1 次」。
# countable=False：营销两入口按「订阅表全量」收件，需要真实订阅行 + 已发布项目，
#   且其内部**自建会话并 commit**（扣额度/写留痕），跑真数据会污染业务表——
#   因此这两个入口只测「模板缺失/项目不存在时静默返回、异常不上抛、双写不影响
#   微信次数」；「发送 1 次」这条不变量由入口 1–4 覆盖（同一个
#   WeChatAuthService.send_subscribe_message）。
ENTRIES = [
    ("1 招募新线索", _entry_recruit, True),
    ("2 我的客户新线索", _entry_customer_new, True),
    ("3 我的客户状态变更", _entry_customer_status, True),
    ("4 授权价变更", _entry_eval_price, True),
    ("5 营销上新（自建会话，仅测静默与不抛）", _entry_marketing_published, False),
    ("6 营销调价（自建会话，仅测静默与不抛）", _entry_marketing_price, False),
]


def main() -> int:
    """执行全部冒烟断言并产出工件."""
    from db import SessionLocal
    from settings import settings

    log("迭代二 · 微信订阅消息零回归冒烟（SPEC §11.3 / 验收 A10）")
    log(f"时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    log(f"本轮标识: {_MARK}")
    log("打桩目标: WeChatAuthService.send_subscribe_message（不产生真实微信请求）")
    log("")

    db = SessionLocal()
    temp_user_id = ""
    try:
        # 造一个**直接绑定 openid** 的临时收件员工。
        # 若复用真实账号（多数未绑 openid），断言 ② 的期望值会退化成 0，
        # 变成「什么都没调用也通过」的空洞通过（假绿）——SPEC §11.3 明确要求
        # 「有 openid → 调用 1 次」，因此必须让发送分支真正被走到。
        from models import Role, User
        from utils.auth import get_password_hash

        role = db.query(Role).filter(Role.code == "admin").first()
        temp_user = User(
            id=f"{_MARK.lower()}-recv",
            username=f"smoke-{_MARK.lower()}",
            password=get_password_hash(f"pw-{_MARK}"),
            nickname="冒烟测试收件人",
            role_id=role.id,
            status="active",
            wechat_openid=f"MOCK-{_MARK}",
        )
        db.add(temp_user)
        db.commit()
        temp_user_id = temp_user.id
        user_id = temp_user.id
        log(f"临时收件员工: {user_id}（wechat_openid 已绑定，走真实发送分支）")
        log("")

        for name, entry, countable in ENTRIES:
            log(f"═══ 入口 {name} ═══")

            # ① 模板未配置 → 不调用微信接口
            with (
                mock.patch(TEMPLATE_TARGET, return_value=""),
                mock.patch(SEND_TARGET) as send_mock,
            ):
                try:
                    entry(db, user_id, _MARK)
                    raised = False
                except Exception as exc:
                    raised = True
                    log(f"    异常: {type(exc).__name__}: {exc}")
            check("① 模板未配置：静默跳过且不上抛", (not raised) and send_mock.call_count == 0)

            # ②/③ 模板已配置 + 打桩发送
            with (
                mock.patch(TEMPLATE_TARGET, return_value="TEMPLATE_ID_MOCK"),
                mock.patch(SEND_TARGET, return_value=(0, None)) as send_ok,
            ):
                try:
                    entry(db, user_id, _MARK)
                    raised = False
                except Exception as exc:
                    raised = True
                    log(f"    异常: {type(exc).__name__}: {exc}")
                db.rollback()
            if countable:
                # 临时用户直接绑定 openid → 4 个 B 端入口都应恰好调用 1 次
                check(
                    "② 有 openid 时调用次数 == 1",
                    (not raised) and send_ok.call_count == 1,
                    f"实际 {send_ok.call_count}",
                )
            else:
                check("② 项目不存在：静默返回且不上抛（发送次数由入口 1–4 覆盖）", not raised)

            with (
                mock.patch(TEMPLATE_TARGET, return_value="TEMPLATE_ID_MOCK"),
                mock.patch(SEND_TARGET, side_effect=RuntimeError("模拟微信 5xx")) as send_boom,
            ):
                try:
                    entry(db, user_id, _MARK)
                    raised = False
                except Exception:
                    raised = True
                db.rollback()
                boomed = send_boom.call_count > 0
            check(
                "③ 微信接口抛异常：被吞掉且不上抛",
                not raised,
                f"调用 {int(boomed)}" if boomed else "未触达发送层（无 openid/无订阅行）",
            )

            # ④ 双写开关 true/false：微信调用次数必须一致（站内信不影响微信）
            counts: dict[str, int] = {}
            for flag in (True, False):
                original = settings.notification_dual_write
                settings.notification_dual_write = flag
                try:
                    with (
                        mock.patch(TEMPLATE_TARGET, return_value="TEMPLATE_ID_MOCK"),
                        mock.patch(SEND_TARGET, return_value=(0, None)) as send_switch,
                    ):
                        entry(db, user_id, _MARK)
                        counts[str(flag)] = send_switch.call_count
                        db.rollback()
                finally:
                    settings.notification_dual_write = original
            check(
                "④ 双写开关 true/false 下微信调用次数一致",
                counts["True"] == counts["False"],
                f"true={counts['True']} false={counts['False']}",
            )
            log("")

        # 附加 A：双写 emit 的真实不变量——站内信写 1 条、**微信 0 次**。
        # 原链路 notify_new_customer_lead 已发过微信；若 emit_customer_new 内部的
        # emit 再发一次，同一线索就收到两条相同微信（K17 零回归被破坏）。
        # 这里**只调 emit_customer_new**（不调 notify_*），两项都能直接观测。
        def count_notifications() -> int:
            """本轮标识下的站内信条数（rollback 会话内可见，用于前后对比）."""
            return db.query(Notification).filter(Notification.title.like(f"%{_MARK}%")).count()

        from models import Notification
        from services.notification.dual_write import emit_customer_new

        log("═══ 附加 A：双写 emit 的站内信/微信不变量 ═══")
        settings.notification_dual_write = True
        with (
            mock.patch(TEMPLATE_TARGET, return_value="TEMPLATE_ID_MOCK"),
            mock.patch(SEND_TARGET, return_value=(0, None)) as send_dw,
        ):
            before_on = count_notifications()
            emit_customer_new(
                db,
                module="valuation",
                lead_id=f"{_MARK}-dw-on",
                referrer_user_id=user_id,
                community=f"{_MARK}小区",
                module_label="估价",
            )
            # emit 内部自行 commit（站内信先落地），故取增量而非绝对值
            written_on = count_notifications() - before_on
        check(
            "开关 true：站内信落库 1 条",
            written_on == 1,
            f"新增={written_on}",
        )
        check(
            "开关 true：emit 不重复发微信（wechat=False 覆盖生效）",
            send_dw.call_count == 0,
            f"wechat_calls={send_dw.call_count}",
        )

        # 附加 B：开关 false 时整体跳过（读能力保留）
        log("── 附加 B：开关 false 不写站内信 ──")
        settings.notification_dual_write = False
        try:
            before_off = count_notifications()
            emit_customer_new(
                db,
                module="valuation",
                lead_id=f"{_MARK}-dw-off",
                referrer_user_id=user_id,
                community=f"{_MARK}小区",
                module_label="估价",
            )
            written_off = count_notifications() - before_off
        finally:
            settings.notification_dual_write = original
        check("开关 false：站内信 0 条（不写库）", written_off == 0, f"新增={written_off}")

    finally:
        # 临时用户与其产生的数据必须物理清理（commit 过的行不受 rollback 影响）
        from models import Notification, NotificationDeliveryLog, NotificationRecipient, User

        if temp_user_id:
            notif_ids = [n.id for n in db.query(Notification).filter(Notification.title.like(f"%{_MARK}%")).all()]
            if notif_ids:
                db.query(NotificationRecipient).filter(NotificationRecipient.notification_id.in_(notif_ids)).delete(
                    synchronize_session=False
                )
                db.query(Notification).filter(Notification.id.in_(notif_ids)).delete(synchronize_session=False)
            db.query(NotificationRecipient).filter(NotificationRecipient.user_id == temp_user_id).delete(
                synchronize_session=False
            )
            # C 端入口（授权价变更）的投递审计也以该用户为收件人，一并清理
            db.query(NotificationDeliveryLog).filter(NotificationDeliveryLog.user_id == temp_user_id).delete(
                synchronize_session=False
            )
            db.query(User).filter(User.id == temp_user_id).delete(synchronize_session=False)
            db.commit()
        db.rollback()
        db.close()

    passed = sum(RESULTS)
    total = len(RESULTS)
    log("")
    log("═" * 46)
    log(f"结论: {passed}/{total} 断言通过" + ("  ✓ 全部通过" if passed == total else "  ✗ 存在失败"))

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    artifact = ARTIFACT_DIR / f"wechat-notify-smoke-{time.strftime('%Y%m%d-%H%M%S')}.txt"
    artifact.write_text("\n".join(LINES) + "\n", encoding="utf-8")
    log(f"工件: {artifact}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
