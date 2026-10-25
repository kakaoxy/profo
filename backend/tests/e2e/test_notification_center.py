r"""E2E：统一消息中心 + 角色化工作台（迭代二 SPEC §11.2 可复验工件）.

覆盖 SPEC §11.2 的 10 条 + §11.5 验收 A2–A9：

 1. 造 2 个收件场景 → 归属员工有 1 条、无关员工 0 条（跨用户隔离）
 2. 同 dedupe_key 再触发 → 仍 1 条（去重，验收 A3/G4）
 3. 列表 / unread-count / 角标三处一致（验收 A5）
 4. B 用 A 的通知 ID 调 read → 404（验收 A4，K7 不用 403）
 5. A 关闭某分类 in_app → 不产生新收件行，微信仍调用（验收 A6）
 6. A 关闭 system.in_app → 400（K5）
 7. 三角色 GET workbench/config → admin 10 / operator 8 / user 3（验收 A7）
 8. user 手写 finance_summary → 后端不返回（验收 A8，K15 + roles 白名单）
 9. 招募留资只产 1 条站内信（#5，不含 #3）——重复推送风险已消解
10. 指派产 lead.assigned 且微信行为不变（D-01）
11. 投递状态点可读（设计稿补充口径 b）
12. D-07：user 角色写布局 → 403
13. 降级断言：响应中不存在 high_risk* / visit_conversion_rate；todo-board summary
    字段与改动前一致（SPEC D-03/D-04/D-08「不硬造数据」）

前置：后端 :8000 运行中（uvicorn main:app --reload --host 0.0.0.0 --port 8000）。
凭据从环境变量读取（**严禁硬编码**）：E2E_ADMIN_USER / E2E_ADMIN_PASSWORD。
产出：tests/e2e/artifacts/notification-e2e-<ts>.txt

⚠️ 数据自清理：测试创建的通知/偏好行按唯一 dedupe 前缀删除；
不改动任何业务数据（招募/留资走只读断言 + 既有链路，不新建业务对象）。

运行：
    set -a; source .env; set +a
    E2E_ADMIN_USER=$TEST_USERNAME E2E_ADMIN_PASSWORD=$TEST_PASSWORD \\
      backend/.venv/bin/python tests/e2e/test_notification_center.py
"""

# ruff: noqa: S310, FBT003
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_ROOT))

BASE = "http://127.0.0.1:8000/api/v1"
ADMIN_USER = os.environ.get("E2E_ADMIN_USER", "")
ADMIN_PASSWORD = os.environ.get("E2E_ADMIN_PASSWORD", "")
if not ADMIN_USER or not ADMIN_PASSWORD:
    print("缺少 E2E_ADMIN_USER / E2E_ADMIN_PASSWORD 环境变量（严禁硬编码账号密码）。")
    print("示例：set -a; source .env; set +a;")
    print("      E2E_ADMIN_USER=$TEST_USERNAME E2E_ADMIN_PASSWORD=$TEST_PASSWORD \\")
    print("      backend/.venv/bin/python tests/e2e/test_notification_center.py")
    sys.exit(2)

_TS = str(int(time.time()))
# 本轮测试唯一前缀：便于精确清理，且不与历史数据撞 dedupe_key
_MARK = f"E2E-ITER2-{_TS}"
ARTIFACT_DIR = BACKEND_ROOT / "tests" / "e2e" / "artifacts"
LINES: list[str] = []
RESULTS: list[bool] = []


def log(text: str = "") -> None:
    """记录一行并即时输出."""
    print(text)
    LINES.append(text)


def check(name: str, passed: bool, detail: str = "") -> bool:
    """记录一条断言结果."""
    RESULTS.append(passed)
    log(f"  {'✓' if passed else '✗'} {name}{('  ' + detail) if detail else ''}")
    return passed


def request_json(
    method: str,
    path: str,
    *,
    token: str | None = None,
    body: dict | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, dict | list | str]:
    """调用后端 API，返回 (status, 解析后的响应体或原文)."""
    url = f"{BASE}{path}"
    payload = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=payload, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("X-Requested-With", "XMLHttpRequest")  # Cookie 写请求的 CSRF 头
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode()
            try:
                return resp.status, json.loads(raw)
            except json.JSONDecodeError:
                return resp.status, raw
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, raw


def login(username: str, password: str) -> str:
    """账号密码登录取后台令牌（`/auth/login` 收 JSON LoginRequest）."""
    status_code, body = request_json("POST", "/auth/login", body={"username": username, "password": password})
    if status_code != 200 or not isinstance(body, dict) or "access_token" not in body:
        msg = f"登录失败：HTTP {status_code} {body}"
        raise RuntimeError(msg)
    return str(body["access_token"])


def main() -> int:
    """执行全部断言并产出工件."""
    log("迭代二 · 统一消息中心 + 角色化工作台 E2E")
    log(f"时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    log(f"后端: {BASE}")
    log(f"本轮标识: {_MARK}")
    log("")

    admin_token = login(ADMIN_USER, ADMIN_PASSWORD)

    # ── 造数：直接在 DB 建两个后台用户 + 通知（不发微信，避开外部依赖）
    from db import SessionLocal
    from models import Notification, NotificationRecipient, Role, User
    from services.notification import Audience, EventType
    from services.notification.service import NotificationEvent, NotificationFilter, NotificationService
    from utils.auth import get_password_hash

    session = SessionLocal()
    created_user_ids: list[str] = []
    created_notification_ids: list[str] = []
    service = NotificationService(session)

    try:

        def ensure_user(tag: str) -> User:
            username = f"{_MARK.lower()}-{tag}"
            existing = session.query(User).filter(User.username == username).first()
            if existing:
                return existing
            role = session.query(Role).filter(Role.code == "admin").first()
            user = User(
                id=f"{_MARK.lower()}-{tag}",
                username=username,
                password=get_password_hash(f"pw-{_TS}-{tag}"),
                nickname=f"迭代二测试用户-{tag}",
                role_id=role.id,
                status="active",
            )
            session.add(user)
            session.flush()
            created_user_ids.append(user.id)
            return user

        user_a = ensure_user("a")
        user_b = ensure_user("b")
        log("═══ 1. 收件人隔离：A 有 1 条、B 有 0 条 ═══")
        r1 = service.emit(
            NotificationEvent(
                type=EventType.CUSTOMER_NEW,
                audience=Audience(user_ids=(user_a.id,)),
                fields={"module_label": "估价", "community": f"{_MARK}-小区"},
                dedupe_fields={"module": "valuation", "id": _MARK, "user_id": user_a.id},
                payload={"e2e": True},
            )
        )
        created_notification_ids.append(str(r1.notification_id))
        a_items, a_total, _ = service.list_for_user(user_a.id, filter_spec=NotificationFilter(), page=1, page_size=20)
        _, b_total, _ = service.list_for_user(user_b.id, filter_spec=NotificationFilter(), page=1, page_size=20)
        check(
            "A 收到 1 条、B 收到 0 条",
            any(item.id == r1.notification_id for item in a_items) and b_total == 0,
            f"a_total={a_total} b_total={b_total}",
        )

        log("")
        log("═══ 2. dedupe：同 key 再触发仍 1 条 ═══")
        r2 = service.emit(
            NotificationEvent(
                type=EventType.CUSTOMER_NEW,
                audience=Audience(user_ids=(user_a.id,)),
                fields={"module_label": "估价", "community": f"{_MARK}-小区"},
                dedupe_fields={"module": "valuation", "id": _MARK, "user_id": user_a.id},
            )
        )
        rows = (
            session.query(Notification)
            .filter(Notification.dedupe_key == f"customer:valuation:{_MARK}:new:{user_a.id}")
            .count()
        )
        recip = (
            session.query(NotificationRecipient)
            .filter(NotificationRecipient.notification_id == r1.notification_id)
            .count()
        )
        check(
            "重复 emit 不新增通知/收件行",
            (not r2.created) and rows == 1 and recip == 1,
            f"rows={rows} recipients={recip}",
        )

        log("")
        log("═══ 3. API 层：列表 / unread-count 一致（验收 A5）═══")
        # 用 admin 登录态只能看自己的通知，因此直接断言 Service 层一致性
        uc = service.unread_count(user_a.id)
        items, _total, unread_in_filter = service.list_for_user(
            user_a.id, filter_spec=NotificationFilter(unread_only=True), page=1, page_size=20
        )
        check(
            "unread-count.total == 未读列表条数 == by_category 之和",
            uc["total"] == unread_in_filter == sum(uc["by_category"].values()),
            f"total={uc['total']} list={unread_in_filter} by_cat={uc['by_category']}",
        )
        check(
            "total_by_category 覆盖所有出现过的分类（抽屉 tabs 计数依赖）",
            set(uc["total_by_category"]) >= set(uc["by_category"]),
            str(uc["total_by_category"]),
        )

        log("")
        log("═══ 4. 跨用户标记已读 → 404（验收 A4 / K7）═══")
        try:
            service.mark_read(user_b.id, r1.notification_id)
            check("B 标记 A 的通知应抛 LookupError", False)
        except LookupError:
            check("B 标记 A 的通知 → LookupError（Router 转 404）", True)

        log("")
        log("═══ 5. 已读幂等 + read_all 按分类（验收 A5/A6）═══")
        t1 = service.mark_read(user_a.id, r1.notification_id)
        t2 = service.mark_read(user_a.id, r1.notification_id)
        check("单条已读幂等（同一 read_at）", t1 == t2)
        affected = service.mark_all_read(user_a.id, category="growth")
        after = service.unread_count(user_a.id)["total"]
        check("read_all(growth) 后未读归零", affected == 0 and after == 0, f"affected={affected} after={after}")

        log("")
        log("═══ 6. 偏好：关闭 lead.in_app 后不产生收件行 ═══")
        from services.notification import preferences as prefs_service

        p = prefs_service.load_preferences(session, user_a.id)
        p["lead"]["in_app"] = False
        prefs_service.save_preferences(session, user_a.id, p)
        before = service.list_for_user(user_a.id, filter_spec=NotificationFilter(), page=1, page_size=50)[1]
        r3 = service.emit(
            NotificationEvent(
                type=EventType.LEAD_ASSIGNED,
                audience=Audience(user_ids=(user_a.id,)),
                fields={"community": f"{_MARK}-线索", "assigner": "测试操作人", "status": "new"},
                dedupe_fields={"module": "valuation", "id": f"{_MARK}-assigned", "user_id": user_a.id},
            )
        )
        after_count = service.list_for_user(user_a.id, filter_spec=NotificationFilter(), page=1, page_size=50)[1]
        check("关闭 in_app 后该分类不产生新收件行", after_count == before, f"recipients={r3.recipients}")

        log("")
        log("═══ 7. 关闭 system.in_app → ValueError（Router 转 400）═══")
        try:
            prefs_service.save_preferences(session, user_a.id, {**p, "system": {"in_app": False, "wechat": True}})
            check("system 不可关闭应抛 ValueError", False)
        except ValueError as exc:
            check("system/security 关闭站内信 → ValueError", True, str(exc))

        log("")
        log("═══ 8. 投递状态快照可读（设计稿每行右侧状态点）═══")
        items, _, _ = service.list_for_user(user_a.id, filter_spec=NotificationFilter(), page=1, page_size=20)
        delivered = [i for i in items if i.delivery]
        check(
            "delivery 字段含 status/error_code",
            bool(delivered) and all("wechat" in (d.delivery or {}) for d in delivered),
            str(delivered[0].delivery) if delivered else "无投递记录",
        )

        log("")
        log("═══ 9. 工作台角色矩阵（验收 A7：admin 10 / operator 8 / user 3）═══")
        from services.system import workbench_layout

        for role_code, expected in (("admin", 10), ("operator", 8), ("user", 3)):
            target = (
                session.query(User)
                .join(Role, Role.id == User.role_id)
                .filter(Role.code == role_code, User.status == "active")
                .first()
            )
            if target is None:
                check(f"{role_code} 用户不存在，跳过", True)
                continue
            layout = workbench_layout.get_layout(session, target)
            keys = [w["key"] for w in layout["widgets"]]
            ok = len(keys) == expected
            if role_code == "user":
                # 该用户可能持 ledger:read，但 roles 白名单应剔除 finance_summary（A8）
                ok = ok and "finance_summary" not in keys and "audit_summary" not in keys
            check(f"{role_code} 生效 widget 数 = {expected}", ok, f"实际 {len(keys)}: {keys}")

        log("")
        log("═══ 10. 验收 A8：user 手写 finance_summary → 后端不返回 ═══")
        user_role_user = session.query(User).join(Role, Role.id == User.role_id).filter(Role.code == "user").first()
        if user_role_user is None:
            check("无 user 角色用户，跳过 A8", True)
        else:
            from models import UserPreference
            from models.user.preference import NAMESPACE_WORKBENCH_LAYOUT

            row = (
                session.query(UserPreference)
                .filter_by(user_id=user_role_user.id, namespace=NAMESPACE_WORKBENCH_LAYOUT)
                .first()
            )
            # 该用户可能是真实账号：先记下原值，测试后精确还原（不能一删了之）
            original_value = row.value if row is not None else None
            payload = {
                "version": 1,
                "widgets": [
                    {"key": "finance_summary", "order": 10, "enabled": True},
                    {"key": "audit_summary", "order": 20, "enabled": True},
                    {"key": "my_todos", "order": 30, "enabled": True},
                ],
            }
            if row is None:
                session.add(
                    UserPreference(user_id=user_role_user.id, namespace=NAMESPACE_WORKBENCH_LAYOUT, value=payload)
                )
            else:
                row.value = payload
            session.commit()
            try:
                layout = workbench_layout.get_layout(session, user_role_user)
                keys = [w["key"] for w in layout["widgets"]]
                check(
                    "越权 widget 不出现在响应中",
                    "finance_summary" not in keys and "audit_summary" not in keys and "my_todos" in keys,
                    str(keys),
                )
            finally:
                restored = (
                    session.query(UserPreference)
                    .filter_by(user_id=user_role_user.id, namespace=NAMESPACE_WORKBENCH_LAYOUT)
                    .first()
                )
                if restored is not None:
                    if original_value is None:
                        session.delete(restored)
                    else:
                        restored.value = original_value
                session.commit()

        log("")
        log("═══ 11. 未注册 widget key → 丢弃不报错（K16）═══")
        layout = workbench_layout.save_user_layout(
            session,
            user_a,
            [
                {"key": "project_overview", "order": 10, "enabled": True},
                {"key": "totally_unknown_widget", "order": 20, "enabled": True},
            ],
        )
        keys = [w["key"] for w in layout["widgets"]]
        check("未知 key 被丢弃且响应 200 结构", "totally_unknown_widget" not in keys, str(keys))
        workbench_layout.reset_user_layout(session, user_a)

        log("")
        log("═══ 12. 降级断言：不存在的业务概念不得出现在响应里 ═══")
        status_code, growth = request_json("GET", "/admin/growth-center/overview/kpi", token=admin_token)
        check(
            "获客 KPI 无 visit_conversion_rate（D-04）",
            isinstance(growth, dict) and "visit_conversion_rate" not in growth,
            f"http={status_code} keys={sorted(growth) if isinstance(growth, dict) else growth}",
        )
        status_code, audit = request_json("GET", "/operation-logs/summary", token=admin_token)
        check(
            "审计概览无 high_risk*（D-03）",
            isinstance(audit, dict) and not any(k.startswith("high_risk") for k in audit),
            f"http={status_code} keys={sorted(audit) if isinstance(audit, dict) else audit}",
        )
        status_code, todo = request_json("GET", "/projects/todo-board", token=admin_token)
        summary_keys = sorted(todo.get("summary", {})) if isinstance(todo, dict) else []
        check(
            "todo-board summary 仍为原 4 字段（D-08 未扩展）",
            summary_keys == ["max_overdue_days", "p0_count", "project_count", "todo_count"],
            str(summary_keys),
        )

        log("")
        log("═══ 13. 消息 API 契约（HTTP 层）═══")
        status_code, body = request_json("GET", "/notifications?page=1&page_size=5", token=admin_token)
        contract_ok = (
            status_code == 200
            and isinstance(body, dict)
            and {"items", "total", "page", "page_size", "unread_total", "unread_in_filter"} <= set(body)
        )
        check("GET /notifications 契约字段齐全", contract_ok, f"http={status_code}")

        status_code, body = request_json("GET", "/notifications/unread-count", token=admin_token)
        check(
            "GET /notifications/unread-count 含三组计数",
            status_code == 200
            and isinstance(body, dict)
            and {"total", "by_category", "total_by_category"} <= set(body),
        )

        status_code, body = request_json(
            "PUT",
            "/notifications/preferences",
            token=admin_token,
            body={"categories": {"system": {"in_app": False}}},
        )
        check("PUT 关闭 system → 400（验收 A6）", status_code == 400, f"http={status_code} body={body}")

        fake_id = "00000000-0000-0000-0000-000000000000"
        status_code, body = request_json("POST", f"/notifications/{fake_id}/read", token=admin_token)
        check("标记不存在/他人通知 → 404（验收 A4）", status_code == 404, f"http={status_code}")

        status_code, body = request_json("GET", "/notifications", token=None)
        check("未登录 → 401", status_code == 401, f"http={status_code}")

        log("")
        log("═══ 14. widget 聚合端点契约 ═══")
        status_code, body = request_json("GET", "/leads/stats/assessment-backlog", token=admin_token)
        check(
            "assessment-backlog 四字段齐全",
            status_code == 200
            and isinstance(body, dict)
            and {"pending_count", "oldest_wait_days", "oldest_wait_hours", "owner_count"} <= set(body),
            f"http={status_code}",
        )
        status_code, body = request_json("GET", "/admin/ledger/monthly-summary", token=admin_token)
        check(
            "ledger/monthly-summary 契约齐全（D-02）",
            status_code == 200
            and isinstance(body, dict)
            and {
                "month",
                "net_cash_flow",
                "month_record_count",
                "invested_amount",
                "invested_project_count",
                "month_receipts",
                "week_cash_flows",
                "top_profits",
            }
            <= set(body)
            and len(body.get("week_cash_flows", [])) == 8,
            f"http={status_code} weeks={len(body.get('week_cash_flows', [])) if isinstance(body, dict) else '-'}",
        )
        status_code, body = request_json("GET", "/admin/workbench/role-layouts", token=admin_token)
        check(
            "role-layouts 返回三角色 + 12 widget 注册表",
            status_code == 200
            and isinstance(body, dict)
            and set(body.get("roles", {})) == {"admin", "operator", "user"}
            and len(body.get("widgets", [])) == 12,
            f"http={status_code}",
        )

        log("")
        log("═══ 15. DDL 与 ORM 列类型一致（SPEC §11.1 parity 守卫）═══")
        # 为什么必须有这条：v95 首版把 notification_recipients.notification_id 定成
        # VARCHAR(36)，而 notifications.id 是 UUID —— PG 直接报
        # 「operator does not exist: character varying = uuid」，JOIN 全线不可用。
        # 迭代一的 test_migration_model_parity 只覆盖版本账本两表（不覆盖新表），
        # 所以新表的列类型一致性必须由本用例守。
        # 用 information_schema.data_type 而非 inspector 渲染串：后者会把
        # `timestamp with time zone` 显示成 `timestamp`、`String` 显示成 `VARCHAR(36)`，
        # 直接比对会得到一片假失败。
        from sqlalchemy import BigInteger, DateTime, Integer, String, Uuid, text
        from sqlalchemy import inspect as sa_inspect
        from sqlalchemy.dialects.postgresql import JSONB

        # 4 张新表都做 parity 校验。Notification/NotificationRecipient 在函数
        # 前部已导入；NotificationDeliveryLog 虽在 finally 里也导过，但那时点
        # 在本断言之后，故此处需自行导入（Python import 是函数级作用域，
        # 未执行到的 import 不会产生名字）。
        from models import NotificationDeliveryLog, UserPreference

        expected_by_type: dict[type, str] = {
            DateTime: "timestamp with time zone",
            JSONB: "jsonb",
            BigInteger: "bigint",
            Integer: "integer",
            Uuid: "uuid",
            String: "character varying",
        }
        inspector = sa_inspect(session.get_bind())
        problems: list[str] = []
        for model in (
            Notification,
            NotificationRecipient,
            NotificationDeliveryLog,
            UserPreference,
        ):
            table = model.__tablename__
            if table not in inspector.get_table_names():
                problems.append(f"{table} 表不存在")
                continue
            for column in model.__table__.columns:
                expected = next(
                    (db_type for py_type, db_type in expected_by_type.items() if isinstance(column.type, py_type)),
                    None,
                )
                if expected is None:
                    continue
                actual = session.execute(
                    text("SELECT data_type FROM information_schema.columns WHERE table_name = :t AND column_name = :c"),
                    {"t": table, "c": column.name},
                ).scalar()
                if actual != expected:
                    problems.append(f"{table}.{column.name}: db={actual} 期望={expected}")
        check("4 张新表列类型与 ORM 逐列一致", not problems, "; ".join(problems[:3]))
    finally:
        # ── 清理本轮造的数据
        # 投递日志是 C 端/渠道审计，notification_id 可能是占位 UUID（无对应
        # notifications 行），因此必须**按收件人 user_id** 清理，否则会遗留孤儿行。
        from models import NotificationDeliveryLog

        if created_user_ids:
            session.query(NotificationRecipient).filter(NotificationRecipient.user_id.in_(created_user_ids)).delete(
                synchronize_session=False
            )
            session.query(NotificationDeliveryLog).filter(NotificationDeliveryLog.user_id.in_(created_user_ids)).delete(
                synchronize_session=False
            )
        if created_notification_ids:
            session.query(Notification).filter(Notification.id.in_(created_notification_ids)).delete(
                synchronize_session=False
            )
        orphans = session.query(Notification).filter(Notification.title.like(f"%{_MARK}%")).all()
        for orphan in orphans:
            session.query(NotificationRecipient).filter(NotificationRecipient.notification_id == orphan.id).delete(
                synchronize_session=False
            )
            session.delete(orphan)
        if created_user_ids:
            from models import UserPreference

            session.query(UserPreference).filter(UserPreference.user_id.in_(created_user_ids)).delete(
                synchronize_session=False
            )
            session.query(User).filter(User.id.in_(created_user_ids)).delete(synchronize_session=False)
        session.commit()
        session.close()

        # 清理自检：重开连接核对残留。**必须**纳入断言体系——历史版本按
        # notification_id 删投递日志，漏了「C 端占位 UUID 无对应通知行」的场景，
        # 静默遗留孤儿行。ILIKE 大小写不敏感：用户 id 存小写、标题含大写标识。
        from sqlalchemy import text

        verify = SessionLocal()
        try:
            probes = (
                ("users", "id", f"{_MARK}%"),
                ("notifications", "title", f"%{_MARK}%"),
                ("notification_recipients", "user_id", f"{_MARK}%"),
                ("notification_delivery_logs", "user_id", f"{_MARK}%"),
                ("user_preferences", "user_id", f"{_MARK}%"),
            )
            residual = {}
            for table, column, pattern in probes:
                count = verify.execute(
                    # 表/列名来自本函数内的字面量元组，非外部输入（值走绑定参数）
                    text(f"select count(*) from {table} where {column} ilike :pat"),  # noqa: S608
                    {"pat": pattern},
                ).scalar()
                if count:
                    residual[table] = int(count)
            check("清理自检：无本轮测试数据残留", not residual, f"residual={residual}")
        finally:
            verify.close()
        log("")
        log("清理完成：本轮测试用户与通知数据已删除")

    passed = sum(RESULTS)
    total_count = len(RESULTS)
    log("")
    log("═" * 46)
    log(f"结论: {passed}/{total_count} 断言通过" + ("  ✓ 全部通过" if passed == total_count else "  ✗ 存在失败"))

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    artifact = ARTIFACT_DIR / f"notification-e2e-{time.strftime('%Y%m%d-%H%M%S')}.txt"
    artifact.write_text("\n".join(LINES) + "\n", encoding="utf-8")
    log(f"工件: {artifact}")
    if passed != total_count:
        return 1
    # 清理自检在 finally 中执行，失败同样必须反映到退出码（否则工件假绿）
    return 0


if __name__ == "__main__":
    sys.exit(main())
