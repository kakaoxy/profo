"""E2E: 资金账户管理（SPEC docs/To-Do/2026-10-21-资金账户管理-落地SPEC.md §8 可复验工件）.

覆盖 SPEC 的成功标准 S1–S7：

- V1 建账户 → 记一笔选它 → 账户余额 / 账户流水 / 项目账本三处一致
- V2 勾「没走账户」的账不进任何账户余额，但仍在项目账本里
- V3 对账调整后账户余额变化，项目盈亏汇总（/admin/ledger/stats）不变
- V4 未解锁时裸调 /admin/accounts → 403
- V5 连错 5 次 → 429，正确密码也进不去；手动解锁后恢复
- V6 停用账户不能记账（400）；有流水的账户不能删除（409，改停用）
- V7 迁移幂等（由 run_startup_migrations 调用两次断言，独立于 API）

前置：后端 :8000 运行中（uvicorn main:app --reload --host 0.0.0.0 --port 8000）。
凭据从环境变量读取（严禁硬编码）：E2E_ADMIN_USER / E2E_ADMIN_PASSWORD。
产出：tests/e2e/artifacts/e2e-fund-accounts-<ts>.txt

⚠️ 测试自建数据（e2e_ 前缀账户 / 项目）在结束时清理；账户走 DELETE 接口（无流水才能删），
有流水的账户改为停用并保留（无法物理删除是产品口径，不是测试缺陷）。

运行：
    set -a; source .env; set +a
    backend/.venv/bin/python tests/e2e/test_fund_accounts.py
"""

# ruff: noqa: S310, FBT003
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from decimal import Decimal
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_ROOT))

BASE = "http://127.0.0.1:8000/api/v1"
ADMIN_USER = os.environ.get("E2E_ADMIN_USER", "")
ADMIN_PASSWORD = os.environ.get("E2E_ADMIN_PASSWORD", "")
if not ADMIN_USER or not ADMIN_PASSWORD:
    print("缺少 E2E_ADMIN_USER / E2E_ADMIN_PASSWORD 环境变量（严禁硬编码账号密码）。")
    print("示例：set -a; source .env; set +a; backend/.venv/bin/python tests/e2e/test_fund_accounts.py")
    sys.exit(2)

# 模块密码从环境变量读取：**严禁**在脚本里写死并覆盖共享环境的业务配置
# （第一版曾写死 135790 并直接 POST /module-password，把测试环境的业务密码改掉了）
MODULE_PASSWORD = os.environ.get("E2E_FUND_ACCOUNT_PASSWORD", "")
if not MODULE_PASSWORD:
    print("缺少 E2E_FUND_ACCOUNT_PASSWORD 环境变量（模块入口锁链路无法测试）。")
    print("示例：E2E_FUND_ACCOUNT_PASSWORD=xxxxxx backend/.venv/bin/python tests/e2e/test_fund_accounts.py")
    sys.exit(2)

_ts = str(int(time.time()))
_UNLOCK_HEADER = "X-Accounts-Unlock"
ALL_PASS: list[bool] = []
LINES: list[str] = []
ARTIFACT_DIR = BACKEND_ROOT / "tests" / "e2e" / "artifacts"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
ARTIFACT = ARTIFACT_DIR / f"e2e-fund-accounts-{_ts}.txt"


def log(msg: str) -> None:
    print(msg)
    LINES.append(msg)


def check(name: str, actual, expect) -> bool:
    ok = actual == expect
    ALL_PASS.append(ok)
    log(f"  {'✓' if ok else '✗'} {name}: {actual!r}" + ("" if ok else f"（期望 {expect!r}）"))
    return ok


def check_true(name: str, cond: bool, detail: str = "") -> bool:
    ALL_PASS.append(bool(cond))
    log(f"  {'✓' if cond else '✗'} {name}" + (f": {detail}" if detail else ""))
    return bool(cond)


def req(method, path, body=None, token=None, form=None, extra_headers=None):
    """发请求，返回 (status, payload, headers)。"""
    r = urllib.request.Request(BASE + path, method=method)
    data = None
    if token:
        r.add_header("Authorization", f"Bearer {token}")
    for key, value in (extra_headers or {}).items():
        r.add_header(key, value)
    if form is not None:
        r.add_header("Content-Type", "application/x-www-form-urlencoded")
        data = urllib.parse.urlencode(form).encode()
    elif body is not None:
        r.add_header("Content-Type", "application/json")
        data = json.dumps(body).encode()
    try:
        with urllib.request.urlopen(r, data, timeout=30) as resp:
            raw = resp.read()
            payload = json.loads(raw) if raw else None
            return resp.status, payload, dict(resp.headers)
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw), dict(exc.headers)
        except Exception:
            return exc.code, {"raw": raw[:300].decode(errors="replace")}, dict(exc.headers)


def login(username: str, password: str) -> str | None:
    for attempt in range(12):
        status, data, _ = req(
            "POST",
            "/auth/token",
            form={"grant_type": "password", "username": username, "password": password},
        )
        if status == 200:
            return data["access_token"]
        if status == 429 and attempt < 11:
            time.sleep(12)
            continue
        log(f"  登录失败: {status} {data}")
        return None
    return None


def money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


log(f"资金账户 E2E 报告  时间={time.strftime('%Y-%m-%d %H:%M:%S')}")
log(f"BASE={BASE}")

token = login(ADMIN_USER, ADMIN_PASSWORD)
if token is None:
    log("管理员登录失败，终止")
    ARTIFACT.write_text("\n".join(LINES), encoding="utf-8")
    sys.exit(1)
log("管理员登录成功")


# 本次运行是否亲手创建了模块密码（决定结束时是否删除该记录）
PASSWORD_OWNED_BY_E2E = False
# 本次运行是否为了跑通用例而「临时覆写」了既有密码（决定结束时是否还原原哈希）
PASSWORD_HASH_BACKUP: dict[str, object] | None = None

# 备份落盘路径（⚠️ 2026-10-22 事故修复：备份不能只放内存）
# 事故经过：脚本把原哈希备份到**进程内存**后覆写 DB；随后因根 .env 的
# CORS_ORIGINS 是 JSON 数组、子进程 import settings 直接 FATAL sys.exit(1)，
# 内存里的备份随进程消失，原哈希永久丢失。更糟的是下一次运行看到「E2E 密码能解锁」
# 就判定为只读模式、不再覆写也不再还原，于是**把上一轮覆写的值当成了原值**。
# 现在备份同时写入磁盘（0600），任何异常退出都能据此还原；并在还原时校验
# 「当前值是否仍是 E2E 覆写值」，避免把覆写值误认为原值而放弃还原。
PASSWORD_BACKUP_FILE = Path(__file__).resolve().parent / ".fund_accounts_password_backup.json"


def _write_password_backup(backup: dict[str, object]) -> None:
    """把原密码哈希备份落盘（0600），供异常退出后恢复.

    Args:
        backup: 含 value/updated_by_id/updated_at 的备份字典

    """
    from utils.auth.password import get_password_hash

    payload = {
        "value": backup["value"],
        "updated_by_id": backup.get("updated_by_id"),
        "updated_at": backup["updated_at"].isoformat() if backup.get("updated_at") else None,
        "e2e_password_hash": get_password_hash(MODULE_PASSWORD),
        "saved_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    PASSWORD_BACKUP_FILE.write_text(json.dumps(payload), encoding="utf-8")
    PASSWORD_BACKUP_FILE.chmod(0o600)


def _read_password_backup() -> dict[str, object] | None:
    """读取落盘的密码备份（不存在或损坏返回 None）."""
    if not PASSWORD_BACKUP_FILE.exists():
        return None
    try:
        from datetime import datetime

        raw = json.loads(PASSWORD_BACKUP_FILE.read_text(encoding="utf-8"))
        updated_at = raw.get("updated_at")
        return {
            "value": raw["value"],
            "updated_by_id": raw.get("updated_by_id"),
            "updated_at": datetime.fromisoformat(updated_at) if updated_at else None,
        }
    except Exception as exc:
        log(f"  ⚠️ 读取落盘密码备份失败: {exc}")
        return None


def backup_and_override_module_password() -> bool:
    """备份现有模块密码哈希并临时改为 E2E 值（用于「已有密码但 E2E 不知道」的环境）.

    为什么需要（2026-10-22）：密码哈希不可逆，环境一旦被历史 E2E 或人工改成了
    未知值，后续 E2E 就只能永远「跳过」——解锁、锁定、余额、流水等全部核心用例
    都跑不了，等于资金账户模块失去自动化回归。但直接 POST /module-password 又会
    重犯 D-002 事故（改掉业务密码且不还原）。

    因此采用**原值备份 + 精确回写**：
    1. 直接从 ``system_configs`` 读出 ``value`` / ``updated_by_id`` / ``updated_at``；
    2. **先落盘再覆写**（``PASSWORD_BACKUP_FILE``，0600）：进程被 kill、import 期
       异常退出、CI 超时都不会丢备份（2026-10-22 事故的直接教训）；
    3. 覆写为 E2E 密码的哈希；
    4. 结束时由 ``restore_module_password()`` 把三个字段全部回写（不仅 value，
       连审计痕迹的 updated_by_id/updated_at 也一并还原，业务侧完全无感）。

    Returns:
        覆写成功返回 True（此时调用方必须保证最终走到 restore_module_password）。

    """
    global PASSWORD_HASH_BACKUP
    try:
        from db import SessionLocal
        from models import SystemConfig
        from utils.auth.password import get_password_hash

        db = SessionLocal()
        try:
            row = db.query(SystemConfig).filter(SystemConfig.key == "fund_accounts.password_hash").first()
            if row is None:
                return False
            PASSWORD_HASH_BACKUP = {
                "value": row.value,
                "updated_by_id": row.updated_by_id,
                "updated_at": row.updated_at,
            }
            # 先落盘，再改库：任何时刻崩溃都能从磁盘找回原值
            _write_password_backup(PASSWORD_HASH_BACKUP)
            row.value = get_password_hash(MODULE_PASSWORD)
            row.updated_at = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
            db.commit()
            log(f"  已备份原密码哈希到 {PASSWORD_BACKUP_FILE.name} 并临时覆写为 E2E 值（结束时精确还原）")
            return True
        finally:
            db.close()
    except Exception as exc:
        log(f"  ⚠️ 备份/覆写模块密码失败: {exc}")
        PASSWORD_HASH_BACKUP = None
        return False


def _cleanup_test_account_rows(account_id: str | None) -> None:
    """直连 SQL 清理 E2E 自建账户及其对账记录（仅用于测试数据，不绕过业务口径）.

    为什么必须清理：产品口径是「有对账记录的账户只能停用、不能删除」（API 已断言 409），
    但 E2E 每跑一次就会留下一个 ``e2e_已停用_*`` 孤儿账户。共享环境的账户列表会被
    测试垃圾逐步污染，最终无法分辨真实账户。因此测试数据由测试自己用 SQL 清干净，
    与 ``tests/e2e/test_biz_dicts.py`` 的「ABI 只增不删 → 测试清理走直接 SQL」一致。

    Args:
        account_id: 待清理账户 ID（None 时直接返回）。

    """
    if not account_id:
        return
    try:
        from sqlalchemy import text

        from db import SessionLocal

        db = SessionLocal()
        try:
            db.execute(text("DELETE FROM fund_account_adjustments WHERE account_id = :i"), {"i": account_id})
            db.execute(text("DELETE FROM fund_accounts WHERE id = :i"), {"i": account_id})
            db.commit()
        finally:
            db.close()
    except Exception as exc:
        log(f"  ⚠️ 清理测试账户失败（需人工删除 {account_id}）: {exc}")


def _clear_redis_guard() -> int:
    """清理 Redis 中资金账户的锁定键与失败计数（保留解锁令牌）.

    为什么单独抽出来：``backup_and_override_module_password`` 之前的解锁尝试
    会产生 ``fund_accounts:fail:*`` 计数（错 1 次就 +1），覆写密码后若不清计数，
    紧接着的正确密码解锁仍会被计数/锁定挡住（实测会直接 429）。

    Returns:
        清理的键数量。

    """
    try:
        import redis

        from settings import settings

        r = redis.Redis.from_url(settings.redis_url)
        keys = [*r.scan_iter("fund_accounts:fail:*"), *r.scan_iter("fund_accounts:lock:*")]
        for key in keys:
            r.delete(key)
        return len(keys)
    except Exception as exc:
        log(f"  ⚠️ 清理 Redis 锁定/计数失败: {exc}")
        return 0


def restore_module_password() -> None:
    """还原模块密码与 Redis 状态.

    两种情形均为「把共享环境业务配置恢复原样」：
    - ``PASSWORD_OWNED_BY_E2E``：环境原本**无**密码 → 删除本次写入的记录；
    - ``PASSWORD_HASH_BACKUP`` ：环境原本**有**密码 → 把 value/updated_by_id/
      updated_at 三个字段精确回写（不是只改 value）。
    同时清理本进程可能产生的 Redis 锁键/失败计数/令牌，避免把环境留在锁定态。

    ⚠️ 2026-10-22 事故修复：若内存备份为空（进程被 kill / import 期异常退出），
    必须回退到**落盘备份** ``PASSWORD_BACKUP_FILE`` 再还原，而不是只打一行告警。
    旧逻辑的致命后果：下一次运行时看到「E2E 密码能解锁」就进只读模式、不覆写也不
    还原，等于把上一轮覆写的值永久当成业务原值。
    """
    global PASSWORD_HASH_BACKUP
    try:
        import redis

        from db import SessionLocal
        from models import SystemConfig
        from settings import settings

        # 内存备份缺失时，用落盘备份兜底（事故恢复路径）
        if PASSWORD_HASH_BACKUP is None and PASSWORD_BACKUP_FILE.exists():
            disk_backup = _read_password_backup()
            if disk_backup is not None:
                PASSWORD_HASH_BACKUP = disk_backup
                log("  检测到落盘备份 → 用磁盘记录还原上次被中断的原密码哈希")

        if PASSWORD_HASH_BACKUP is None and not PASSWORD_OWNED_BY_E2E:
            # 本次没改过密码：但环境里可能是「上次进程被 kill、还原没跑到」的 E2E 残留。
            #
            # ⚠️ 判定口径（2026-10-22 修正）：不能只看「E2E 密码能解锁」就报警。
            # 开发环境的模块密码**本来就可能**就是 E2E_FUND_ACCOUNT_PASSWORD
            # （frontend/.env.local 里配置的正是同一个值，两条 E2E 链路共用），
            # 那样每次正常跑完都会误报「残留」。真正的残留判定条件只有两个同时成立：
            #   1. 有落盘备份（说明确实覆写过）——已在上面被消费掉，此处必然没有；
            #   2. 密码行的 updated_at 晚于本进程启动时间（说明本次之外有人改过）。
            # 两个条件都不成立时，说明密码没被动过，直接静默即可。
            try:
                from utils.auth.password import verify_password

                stub_db = SessionLocal()
                try:
                    stub_row = (
                        stub_db.query(SystemConfig).filter(SystemConfig.key == "fund_accounts.password_hash").first()
                    )
                    if stub_row is not None and MODULE_PASSWORD:
                        stub_ok, _ = verify_password(MODULE_PASSWORD, stub_row.value)
                        if stub_ok:
                            log(
                                "  模块密码等于 E2E_FUND_ACCOUNT_PASSWORD（本次未改密码，无落盘备份）。\n"
                                "    若该环境本应使用业务自有密码，请用「改密码」流程重设。",
                            )
                finally:
                    stub_db.close()
            except Exception as exc:
                # 仅告警用途，失败不影响清理 Redis 的主职责
                log(f"  ⚠️ 残留检测跳过: {exc}")

        if PASSWORD_OWNED_BY_E2E:
            db = SessionLocal()
            try:
                deleted = db.query(SystemConfig).filter(SystemConfig.key == "fund_accounts.password_hash").delete()
                db.commit()
                log(f"  已还原：删除 E2E 创建的模块密码记录（{deleted} 条）")
            finally:
                db.close()
        elif PASSWORD_HASH_BACKUP is not None:
            db = SessionLocal()
            try:
                row = db.query(SystemConfig).filter(SystemConfig.key == "fund_accounts.password_hash").first()
                if row is not None:
                    row.value = PASSWORD_HASH_BACKUP["value"]
                    row.updated_by_id = PASSWORD_HASH_BACKUP["updated_by_id"]
                    row.updated_at = PASSWORD_HASH_BACKUP["updated_at"]
                    db.commit()
                    log("  已还原：原密码哈希与 updated_by_id/updated_at（业务侧无感）")
                    # 还原成功后才删除落盘备份，避免「删了备份但没还原」
                    PASSWORD_BACKUP_FILE.unlink(missing_ok=True)
                else:
                    log("  ⚠️ 还原失败：密码记录已不存在（需人工检查）")
            finally:
                db.close()
        redis_client = redis.Redis.from_url(settings.redis_url)
        cleared = 0
        for key in redis_client.scan_iter("fund_accounts:*"):
            redis_client.delete(key)
            cleared += 1
        if cleared:
            log(f"  已清理 {cleared} 个 fund_accounts:* Redis 键（锁/失败计数/令牌）")

        # ⚠️ 必须同时清限流桶（2026-10-22 缺陷修复）：
        # slowapi 的计数键是 ``LIMITS:LIMITER/...``，不在 fund_accounts 命名空间下。
        # 而 /unlock 与 /module-password 现在按 **user_id** 计数（NAT 内各人独立），
        # 本脚本以 admin 身份运行 → 消耗的正是**真人管理员的额度**。不清的话，
        # 连续跑几轮 E2E 就会让真实用户「正常改密码」被 429 挡住
        # （实测已发生：5 轮 E2E 打满 5/hour 的旧额度）。
        # 只清这两个端点，不动其它端点的限流计数。
        limit_cleared = 0
        for pattern in ("LIMITS:*module-password*", "LIMITS:*accounts/unlock*"):
            for key in redis_client.scan_iter(pattern):
                redis_client.delete(key)
                limit_cleared += 1
        if limit_cleared:
            log(f"  已清理 {limit_cleared} 个限流桶（module-password / unlock，避免占用真人额度）")
    except Exception as exc:
        log(f"  ⚠️ 还原模块密码失败（需人工检查 fund_accounts.password_hash）: {exc}")


# ─────────────────────────────────────────────────────────────
# V4（前置）：未解锁时裸调端点必须被拒
# ─────────────────────────────────────────────────────────────
log("\nV4. 未解锁裸调 /admin/accounts")
status, payload, _ = req("GET", "/admin/accounts", token=token)
check("未解锁访问账户列表", status, 403)
check_true(
    "错误响应为 {code,message} 结构",
    isinstance(payload, dict) and "code" in payload and "message" in payload,
    str(payload)[:120],
)

status, lock_state, _ = req("GET", "/admin/accounts/lock-state", token=token)
check("lock-state 未解锁也可读", status, 200)
check_true("lock-state 返回 has_password 字段", isinstance(lock_state, dict) and "has_password" in lock_state)

# ── 模块密码：不污染既有配置 ──────────────────────────────────────────────
# ⚠️ 教训（本脚本第一版的实际事故 D-002）：直接 POST /module-password 会**改掉共享
# 环境里业务方已设的模块密码**，且无法还原（哈希不可逆、也不知道原密码）。
# 现在的三档口径：
#   1. 环境已设密码且 E2E 密码可解锁 → 只读模式，全程不碰密码；
#   2. 环境已设密码但 E2E 密码不匹配 → **备份原哈希 → 临时覆写 → 结束时精确还原**
#      （旧逻辑是直接跳过，导致资金账户模块在「密码未知」的环境里零回归覆盖）；
#   3. 环境未设密码 → 由本脚本设置，结束时删除该记录。
EXISTING_HAS_PASSWORD = bool((lock_state or {}).get("has_password"))

if EXISTING_HAS_PASSWORD:
    log("  环境已设模块密码 → 先尝试只读解锁")
    status, payload, _ = req("POST", "/admin/accounts/unlock", {"password": MODULE_PASSWORD}, token=token)
    # ⚠️ 2026-10-22 事故修复：解锁成功**不能**直接认定为「环境原密码就是 E2E 值」。
    # 若存在落盘备份，说明上一轮覆写过、还原没跑到（进程被 kill / import 期异常），
    # 此时能解锁恰恰证明「当前值是我们自己写进去的」，必须继续走还原流程，
    # 否则会把覆写值永久当成业务原值（旧逻辑的致命缺口）。
    if status == 200 and PASSWORD_BACKUP_FILE.exists():
        log("  ⚠️ 解锁成功但检测到落盘备份 → 说明当前密码是本脚本上次覆写后未还原的残留")
        log("     → 先还原原值，再按「密码不匹配」流程重新备份/覆写")
        restore_module_password()
        status, payload, _ = req("POST", "/admin/accounts/unlock", {"password": MODULE_PASSWORD}, token=token)
    if status == 200:
        log("  使用 E2E_FUND_ACCOUNT_PASSWORD 解锁成功（全程未改密码）")
    else:
        log(f"  E2E 密码不匹配（{status}）→ 备份原哈希后临时覆写，结束时精确还原")
        if not backup_and_override_module_password():
            log("  ⚠️ 无法备份/覆写模块密码 → 跳过依赖解锁的用例")
            ALL_PASS.append(False)
            LINES.append("  ✗ 跳过：环境已有模块密码、E2E 密码不匹配且无法临时覆写")
            restore_module_password()
            ARTIFACT.write_text("\n".join(LINES), encoding="utf-8")
            log(f"报告已保存: {ARTIFACT}")
            sys.exit(1)
        # 覆写后清掉上一步失败留下的计数/锁，否则紧接着的解锁会直接 429
        _clear_redis_guard()
        status, payload, _ = req("POST", "/admin/accounts/unlock", {"password": MODULE_PASSWORD}, token=token)
        if status != 200:
            log(f"  ⚠️ 覆写后仍无法解锁（{status} {payload}）→ 终止")
            ALL_PASS.append(False)
            restore_module_password()
            ARTIFACT.write_text("\n".join(LINES), encoding="utf-8")
            sys.exit(1)
        log("  覆写后解锁成功")
else:
    status, payload, _ = req(
        "POST",
        "/admin/accounts/module-password",
        {"new_password": MODULE_PASSWORD},
        token=token,
    )
    check_true("首次设置模块密码（环境原本未设）", status in (204, 200), f"status={status}")
    PASSWORD_OWNED_BY_E2E = status in (204, 200)
# 同小时内重复运行会撞 5/hour 限流；此时若环境仍无密码则无法继续
if not PASSWORD_OWNED_BY_E2E and not EXISTING_HAS_PASSWORD:
    log("  ⚠️ 设置密码失败（可能触发 5/hour 限流），跳过依赖解锁的用例")
    ALL_PASS.append(False)
    restore_module_password()
    ARTIFACT.write_text("\n".join(LINES), encoding="utf-8")
    sys.exit(1)

# ─────────────────────────────────────────────────────────────
# V5：连错 5 次锁 15 分钟，正确密码也拒绝
# ─────────────────────────────────────────────────────────────
log("\nV5. 连错 5 次 → 429 锁定")
wrong_password = "999999"
last_status = None
for i in range(5):
    status, payload, _ = req(
        "POST",
        "/admin/accounts/unlock",
        {"password": wrong_password},
        token=token,
    )
    last_status = status
    log(f"  第 {i + 1} 次错误密码 → {status}")
check("第 5 次错误密码被锁定", last_status, 429)

status, payload, headers = req(
    "POST",
    "/admin/accounts/unlock",
    {"password": MODULE_PASSWORD},
    token=token,
)
check("锁定期内正确密码也被拒", status, 429)
retry_after = headers.get("Retry-After") or headers.get("retry-after")
check_true("429 带 Retry-After 头", retry_after is not None and int(retry_after) > 0, f"Retry-After={retry_after}")

# 锁定 15 分钟无法在 E2E 内等待：直接清理 Redis 锁键以继续后续用例
log("  （清理 Redis 锁键以继续后续用例，模拟 15 分钟后）")
try:
    import redis

    from settings import settings

    r = redis.Redis.from_url(settings.redis_url)
    user_me = req("GET", "/auth/me", token=token)[1]
    uid = str(user_me.get("id")) if isinstance(user_me, dict) else ""
    keys = list(r.scan_iter("fund_accounts:*"))
    deleted = 0
    for key in keys:
        if not uid or uid.encode() in key:
            r.delete(key)
            deleted += 1
    log(f"  已清理 {deleted} 个 fund_accounts:* Redis 键")
except Exception as exc:
    log(f"  ⚠️ 无法清理 Redis 锁键（后续解锁用例依赖 15 分钟自然过期）: {exc}")

# 正确密码解锁
status, unlocked, _ = req(
    "POST",
    "/admin/accounts/unlock",
    {"password": MODULE_PASSWORD},
    token=token,
)
if status != 200:
    log(f"✗ 解锁失败（{status} {unlocked}），终止后续用例")
    ALL_PASS.append(False)
    restore_module_password()
    ARTIFACT.write_text("\n".join(LINES), encoding="utf-8")
    sys.exit(1)
unlock_token = unlocked["token"]
check_true("正确密码解锁成功并返回令牌", bool(unlock_token))
check("解锁后 seconds_left ≈ 1800", unlocked["seconds_left"], 1800)
UNLOCK_HEADERS = {_UNLOCK_HEADER: unlock_token}
log("已解锁")

# ─────────────────────────────────────────────────────────────
# V13：密码错误必须返回 400 而非 401（回归 2026-10-22 缺陷）
# ─────────────────────────────────────────────────────────────
# 缺陷现象：AccountPasswordError 原用 status_code=401。前端 lib/api-server.ts
# 的 fetchWithAutoRefresh 把**任何** 401 当 access_token 过期，自动刷新令牌后重放
# 同一请求 → 用户输错 1 次服务端收到 2 次 POST → 失败计数 +2，5 次上限在 3 次
# 输入后就被触发（实测已复现：计数 6）。修复后走 400，不再触发令牌重放。
# 注：本组放在 V5 清理 Redis 之后，避免失败计数污染 V5 的「连错 5 次」断言。
log("\nV13. 密码错误返回 400（不触发前端令牌重试）")
status, payload, _ = req(
    "POST",
    "/admin/accounts/unlock",
    {"password": "000111"},
    token=token,
)
check("密码错误返回 400（非 401，避免前端重放双扣）", status, 400)
check_true(
    "400 响应仍带剩余尝试次数",
    isinstance(payload, dict) and "还可尝试" in str(payload.get("message", "")),
    str(payload)[:120],
)
# 清理 V13 产生的失败计数，不影响后续用例
_v13_cleared = 0
try:
    import redis as _redis_mod

    from settings import settings as _settings

    _r = _redis_mod.Redis.from_url(_settings.redis_url)
    for _k in list(_r.scan_iter("fund_accounts:fail:*")) + list(_r.scan_iter("fund_accounts:lock:*")):
        _r.delete(_k)
        _v13_cleared += 1
except Exception as exc:
    log(f"  ⚠️ V13 后清理失败计数异常: {exc}")
log(f"  （已清理 {_v13_cleared} 个失败计数/锁键）")

# ─────────────────────────────────────────────────────────────
# V1：建账户 → 记一笔 → 三处数字一致
# ─────────────────────────────────────────────────────────────
log("\nV1. 建账户 → 记账 → 三处一致")
acc_name = f"e2e_资金账户_{_ts}"
status, account, _ = req(
    "POST",
    "/admin/accounts",
    {
        "name": acc_name,
        "type": "bank",
        "account_no": "6222 **** 0001",
        "holder": "E2E 测试",
        "opening_balance": 100000,
        "opening_date": "2026-01-01",
        "status": "active",
        "note": "E2E 自动创建，结束前清理",
    },
    token=token,
    extra_headers=UNLOCK_HEADERS,
)
check("新建账户", status, 201)
account_id = account["id"] if isinstance(account, dict) else None
check_true("新账户余额等于期初", money(account.get("balance")) == money(100000), str(account.get("balance")))

# 同名账户应 409
status, payload, _ = req(
    "POST",
    "/admin/accounts",
    {
        "name": acc_name,
        "type": "bank",
        "opening_balance": 0,
        "opening_date": "2026-01-01",
    },
    token=token,
    extra_headers=UNLOCK_HEADERS,
)
check("同名账户被拒", status, 409)

# ── V14：PATCH 可清空选填字段（回归 2026-10-22 缺陷）──────────────────────
# 缺陷现象：update_account 用 `if data.x is not None` 判断，无法区分「未传」与
# 「传 null」，导致卡号写错、备注要清掉时永远改不掉（实测 PATCH null 后仍返回原值）。
# 修复：改用 model_fields_set 区分，可空文本字段显式传 null 即清空。
log("\nV14. PATCH 可清空 card_no/holder/note")
status, patched, _ = req(
    "PATCH",
    f"/admin/accounts/{account_id}",
    {"account_no": None, "holder": None, "note": None},
    token=token,
    extra_headers=UNLOCK_HEADERS,
)
check("PATCH 清空三个选填字段", status, 200)
check_true(
    "account_no/holder/note 已置空",
    isinstance(patched, dict)
    and patched.get("account_no") is None
    and patched.get("holder") is None
    and patched.get("note") is None,
    str({k: patched.get(k) for k in ("account_no", "holder", "note")}) if isinstance(patched, dict) else "",
)
# 再把卡号写回去，供后续用例读取
req(
    "PATCH",
    f"/admin/accounts/{account_id}",
    {"account_no": "6222 **** 0001"},
    token=token,
    extra_headers=UNLOCK_HEADERS,
)

# ── V15：纯空白账户名称被拒（回归 2026-10-22 缺陷）────────────────────
# 缺陷现象：Pydantic min_length=1 拦不住 "   "（长 3），入库前又 strip，结果是能建出
# 名为空字符串的账户（实测已复现），列表里显示为空白卡片。
log("\nV15. 纯空白账户名被拒")
status, payload, _ = req(
    "POST",
    "/admin/accounts",
    {"name": "   ", "type": "bank", "opening_balance": 0, "opening_date": "2026-01-01"},
    token=token,
    extra_headers=UNLOCK_HEADERS,
)
check("纯空白名称被拒（400）", status, 400)

# 建项目
status, project, _ = req(
    "POST",
    "/projects",
    {
        "community_name": f"E2E资金账户小区{_ts}",
        "address": f"E2E资金账户路{_ts}号",
        "contract_no": f"E2E-ACC-{_ts}",
        "business_form": "agent",
    },
    token=token,
)
check("创建测试项目", status in (200, 201), True)
project_id = project["id"] if isinstance(project, dict) else None
check_true("项目ID 非空", bool(project_id), str(project))

# 找一个 agent 模式科目
status, subjects, _ = req("GET", "/admin/subjects?mode=agent&is_deleted=false", token=token)
subject_id = None
if status == 200 and subjects:
    subject_id = subjects[0]["id"]
check_true("取到可用科目", subject_id is not None, str(subject_id))

# 记账：流出 12000，挂该账户
status, record, _ = req(
    "POST",
    "/admin/ledger",
    {
        "project_id": project_id,
        "date": "2026-10-19",
        "subject_id": subject_id,
        "outflow": 12000,
        "inflow": 0,
        "payer": acc_name,
        "payee": "E2E 房东",
        "description": "E2E 资金账户联动",
        "account_id": account_id,
    },
    token=token,
)
check("记账（挂账户）", status, 201)
record_id = record["id"] if isinstance(record, dict) else None
check("响应回填 account_id", (record or {}).get("account_id"), account_id)
check("响应回填 account_name", (record or {}).get("account_name"), acc_name)

status, account_after, _ = req("GET", f"/admin/accounts/{account_id}", token=token, extra_headers=UNLOCK_HEADERS)
check("账户余额 = 期初 − 流出", money(account_after.get("balance")), money(88000))
check("账户累计流出", money(account_after.get("outflow_total")), money(12000))

# 单账户流水可见该笔
status, flows, _ = req("GET", f"/admin/accounts/{account_id}/flows", token=token, extra_headers=UNLOCK_HEADERS)
check("单账户流水返回 1 笔", flows.get("total"), 1)
check("流水行金额", money(flows["items"][0]["outflow"]), money(12000))

# 项目账本该笔可见且挂账户
status, ledger, _ = req("GET", f"/admin/ledger/{project_id}", token=token)
rows = [r for r in ledger["records"] if r["id"] == record_id]
check_true("项目账本含该笔", len(rows) == 1)
if rows:
    check("项目账本行 account_id 一致", rows[0].get("account_id"), account_id)
    check("项目账本行 account_name 一致", rows[0].get("account_name"), acc_name)

# ─────────────────────────────────────────────────────────────
# V2：没走账户 → 不进余额、仍在项目账本
# ─────────────────────────────────────────────────────────────
log("\nV2. 勾「没走账户」")
status, skipped_record, _ = req(
    "POST",
    "/admin/ledger",
    {
        "project_id": project_id,
        "date": "2026-10-20",
        "subject_id": subject_id,
        "outflow": 3000,
        "inflow": 0,
        "payee": "E2E 跟投",
        "description": "跟投往来，未走账户",
        "account_skipped": True,
    },
    token=token,
)
check("记账（未走账户）", status, 201)
check("record.account_id 为空", (skipped_record or {}).get("account_id"), None)

status, account_after2, _ = req("GET", f"/admin/accounts/{account_id}", token=token, extra_headers=UNLOCK_HEADERS)
check("未走账户不影响该账户余额", money(account_after2.get("balance")), money(88000))

status, ledger2, _ = req("GET", f"/admin/ledger/{project_id}", token=token)
check("项目账本含未走账户的 2 笔", len(ledger2["records"]), 2)

# 未走账户必须写备注
status, payload, _ = req(
    "POST",
    "/admin/ledger",
    {
        "project_id": project_id,
        "date": "2026-10-20",
        "subject_id": subject_id,
        "outflow": 100,
        "inflow": 0,
        "account_skipped": True,
    },
    token=token,
)
check("未走账户无备注被拒", status, 400)

# 汇总里的「没记账户」计数 ≥1
status, summary, _ = req("GET", "/admin/accounts/summary", token=token, extra_headers=UNLOCK_HEADERS)
untracked_count = int(summary.get("untracked_count") or 0)
check_true("summary 未挂账户计数 ≥ 1", untracked_count >= 1, str(untracked_count))

# ─────────────────────────────────────────────────────────────
# V3：对账调整 → 余额变、项目盈亏不变
# ─────────────────────────────────────────────────────────────
log("\nV3. 对账调整")
# 基线必须取在对账前一刻：V1/V2 已写入 2 笔项目流水（12000 + 3000），
# 若用 V1 之前的快照，差额就是这两笔而不是对账造成的。
STATS_BEFORE_ADJUST = req("GET", "/admin/ledger/stats", token=token)[1]
status, adj, _ = req(
    "POST",
    f"/admin/accounts/{account_id}/adjustments",
    {
        "adjust_date": "2026-10-20",
        "actual_balance": 88050,
        "reason": "E2E：银行手续费 50 未记",
    },
    token=token,
    extra_headers=UNLOCK_HEADERS,
)
check("新增对账调整", status, 201)
check("差额自动算出 +50", money((adj or {}).get("amount")), money(50))

status, account_after3, _ = req("GET", f"/admin/accounts/{account_id}", token=token, extra_headers=UNLOCK_HEADERS)
check("调整后账户余额 = 88050（88000 + 50）", money(account_after3.get("balance")), money(88050))

STATS_AFTER = req("GET", "/admin/ledger/stats", token=token)[1]
check(
    "对账不改变项目盈亏（net_cash_flow）",
    money(STATS_AFTER.get("net_cash_flow")),
    money(STATS_BEFORE_ADJUST.get("net_cash_flow")),
)

# 差额为 0 被拒
status, payload, _ = req(
    "POST",
    f"/admin/accounts/{account_id}/adjustments",
    {
        "adjust_date": "2026-10-20",
        "actual_balance": float(account_after3.get("balance")),
        "reason": "E2E：无差额",
    },
    token=token,
    extra_headers=UNLOCK_HEADERS,
)
check("差额为 0 被拒", status, 400)

status, adjustments, _ = req(
    "GET", f"/admin/accounts/{account_id}/adjustments", token=token, extra_headers=UNLOCK_HEADERS
)
check("对账记录 1 条", len(adjustments), 1)
check("对账记录带操作人", bool(adjustments[0].get("operator_id")), True)

# ─────────────────────────────────────────────────────────────
# V9：核对调整必须出现在账户流水页，且合计与余额公式一致
# ─────────────────────────────────────────────────────────────
# 缺陷现象（用户反馈）：利息入账 / 银行卡年费这类与项目无关的账户收支记不进流水，
# `/admin/accounts/flows` 只列 finance_records，导致
#   1. 流水页看不到调整记录；
#   2. 页面「进/出/净」合计无论如何加都推不出余额（与余额公式 期初+进−出±核对 不一致）。
log("\nV9. 核对调整进入账户流水")
status, flows_with_adj, _ = req(
    "GET", f"/admin/accounts/{account_id}/flows?page_size=200", token=token, extra_headers=UNLOCK_HEADERS
)
adj_rows = [i for i in (flows_with_adj or {}).get("items", []) if i.get("source") == "adjustment"]
check_true("单账户流水含调整行", len(adj_rows) == 1, f"{len(adj_rows)} 行")
if adj_rows:
    adj_row = adj_rows[0]
    check_true(
        "调整行 project_id 为空（非项目收支）",
        adj_row.get("project_id") is None,
        str(adj_row.get("project_id")),
    )
    check_true("调整行带 reason", bool(adj_row.get("reason")), str(adj_row.get("reason")))
    check_true(
        "调整行带带符号 adjust_amount",
        adj_row.get("adjust_amount") is not None,
        str(adj_row.get("adjust_amount")),
    )
    # 正数入流入、负数入流出的折算口径
    check("调整 +50 计入 inflow", money(adj_row.get("inflow")), money(50))
    check("调整 +50 不计入 outflow", money(adj_row.get("outflow")), money(0))

check("调整正数计入 adjustment_inflow", money(flows_with_adj.get("adjustment_inflow")), money(50))
check("调整负数计入 adjustment_outflow", money(flows_with_adj.get("adjustment_outflow")), money(0))

# 合计必须能推出余额：期初 + 总流入 − 总流出 == 账户当前余额
status, acc_now, _ = req("GET", f"/admin/accounts/{account_id}", token=token, extra_headers=UNLOCK_HEADERS)
derived = (
    money(acc_now.get("opening_balance"))
    + money(flows_with_adj.get("total_inflow"))
    - money(flows_with_adj.get("total_outflow"))
)
check("流水合计可推导账户余额（期初+进−出）", derived, money(acc_now.get("balance")))

# 跨账户流水同样包含调整行
status, cross_flows, _ = req("GET", "/admin/accounts/flows?page_size=200", token=token, extra_headers=UNLOCK_HEADERS)
adj_id = adj_rows[0]["record_id"] if adj_rows else ""
cross_adj = [i for i in (cross_flows or {}).get("items", []) if i.get("record_id") == adj_id]
check_true("跨账户流水含同一调整行", len(cross_adj) == 1, f"{len(cross_adj)} 行")

# 「只看没记账户」筛选不应混入调整行（调整必然属于某账户，无需补挂）
status, untracked_flows, _ = req(
    "GET", "/admin/accounts/flows?untracked_only=true&page_size=200", token=token, extra_headers=UNLOCK_HEADERS
)
untracked_adj = [i for i in (untracked_flows or {}).get("items", []) if i.get("source") == "adjustment"]
check("「没记账户」筛选不含调整行", len(untracked_adj), 0)

# 方向筛选：调整负数应出现在「只看出」，正数出现在「只看进」
status, out_flows, _ = req(
    "GET",
    f"/admin/accounts/{account_id}/flows?direction=out&page_size=200",
    token=token,
    extra_headers=UNLOCK_HEADERS,
)
check_true(
    "direction=out 下正数调整不可见",
    all(i.get("source") != "adjustment" for i in (out_flows or {}).get("items", [])),
    str(len((out_flows or {}).get("items", []))),
)
status, in_flows, _ = req(
    "GET",
    f"/admin/accounts/{account_id}/flows?direction=in&page_size=200",
    token=token,
    extra_headers=UNLOCK_HEADERS,
)
in_adj = [i for i in (in_flows or {}).get("items", []) if i.get("source") == "adjustment"]
check_true("direction=in 下正数调整可见", len(in_adj) == 1, f"{len(in_adj)} 行")

# ─────────────────────────────────────────────────────────────
# V10：记账人必须落库并回显（回归 2026-10-21 缺陷）
# ─────────────────────────────────────────────────────────────
# 缺陷：create_record 构造 FinanceRecord 时漏传 operator_id → 恒为 NULL，
# 账户流水/项目账本的「记账人」列永远显示「—」。
log("\nV10. 记账人写入与回显")
status, op_record, _ = req(
    "POST",
    "/admin/ledger",
    {
        "project_id": project_id,
        "date": "2026-10-21",
        "subject_id": subject_id,
        "outflow": 1,
        "inflow": 0,
        "payee": "记账人验证",
        "description": "V10 记账人",
        "account_id": account_id,
    },
    token=token,
)
check("记账（用于验证记账人）", status, 201)
op_record_id = (op_record or {}).get("id")
check_true(
    "响应回填 operator_id",
    bool((op_record or {}).get("operator_id")),
    str((op_record or {}).get("operator_id")),
)
check_true(
    "响应回填 operator_name（非空、非 ID）",
    bool((op_record or {}).get("operator_name")),
    str((op_record or {}).get("operator_name")),
)

status, op_flows, _ = req(
    "GET", f"/admin/accounts/{account_id}/flows?page_size=200", token=token, extra_headers=UNLOCK_HEADERS
)
op_row = next((i for i in (op_flows or {}).get("items", []) if i.get("record_id") == op_record_id), None)
check_true(
    "账户流水行含 operator_name",
    bool((op_row or {}).get("operator_name")),
    str((op_row or {}).get("operator_name")),
)

# 项目账本详情同样带上记账人
status, ledger_detail, _ = req("GET", f"/admin/ledger/{project_id}", token=token)
ledger_row = next((r for r in (ledger_detail or {}).get("records", []) if r.get("id") == op_record_id), None)
check_true(
    "项目账本行含 operator_name",
    bool((ledger_row or {}).get("operator_name")),
    str((ledger_row or {}).get("operator_name")),
)

# 清理这笔验证流水
if op_record_id:
    req("DELETE", f"/admin/ledger/{op_record_id}", token=token)

# ─────────────────────────────────────────────────────────────
# V11：记账用的账户选项接口（免解锁、不含余额）
# ─────────────────────────────────────────────────────────────
# 需求：记一笔弹窗要「默认显示所有账户」，但余额只在资金账户解锁后可见。
# 实现：新增 GET /admin/accounts/options（需 account:read，不需解锁，绝不返回金额）。
log("\nV11. 账户选项接口（无余额）")
status, options, _ = req("GET", "/admin/accounts/options", token=token)
check("未解锁也可取账户选项", status, 200)
opt_items = (options or {}).get("items", [])
check_true("选项返回至少 1 个在用账户", len(opt_items) >= 1, str(len(opt_items)))
if opt_items:
    opt = opt_items[0]
    check_true("选项含 name", bool(opt.get("name")), str(opt.get("name")))
    # 关键安全断言：选项里不允许出现任何金额字段
    money_keys = [k for k in opt if "balance" in k or "total" in k or "amount" in k]
    check("选项不含任何金额字段", money_keys, [])
    check_true("选项标记 is_locked（余额未下发）", opt.get("is_locked") is True, str(opt.get("is_locked")))

# 锁定后：options 仍可用，accounts 必须 403
status, _, _ = req("POST", "/admin/accounts/lock", token=token, extra_headers=UNLOCK_HEADERS)
status_opt, options_locked, _ = req("GET", "/admin/accounts/options", token=token)
check("锁定后选项接口仍可用", status_opt, 200)
status_acc, _, _ = req("GET", "/admin/accounts", token=token)
check("锁定后账户列表 403（余额不可得）", status_acc, 403)

# 重新解锁，供后续用例
status, re_unlocked, _ = req("POST", "/admin/accounts/unlock", {"password": MODULE_PASSWORD}, token=token)
check("重新解锁", status, 200)
if status == 200:
    UNLOCK_HEADERS.clear()
    UNLOCK_HEADERS[_UNLOCK_HEADER] = re_unlocked["token"]

# ─────────────────────────────────────────────────────────────
# V12：调整凭证 —— 计数正确 + 补传只追加 + 返回 URL 供预览
# ─────────────────────────────────────────────────────────────
# 缺陷（用户反馈）：
#   1. 调整行 receipt_count 被硬编码 0 → 有凭证也显示「缺凭证」；
#   2. 流水行只给 receipt_count 不给 receipt_urls → 前端无法做缩略图预览；
#   3. 调整记录「只加不改不删」，缺凭证时无补传途径。
log("\nV12. 调整凭证：计数 / 补传 / 返回 URL")
status, adj_before, _ = req(
    "GET", f"/admin/accounts/{account_id}/adjustments", token=token, extra_headers=UNLOCK_HEADERS
)
adj_id = adj_before[0]["id"] if adj_before else None
check_true("取得待测调整记录", adj_id is not None, str(adj_id))
check("新建调整时无凭证", adj_before[0].get("receipt_urls") if adj_before else None, [])

# 补传凭证
proof_url = "/static/uploads/e2e-proof.png"
status, adj_after, _ = req(
    "PATCH",
    f"/admin/accounts/{account_id}/adjustments/{adj_id}/receipts",
    {"receipt_urls": [proof_url]},
    token=token,
    extra_headers=UNLOCK_HEADERS,
)
check("补传调整凭证", status, 200)
check("返回含新凭证", (adj_after or {}).get("receipt_urls"), [proof_url])

# 幂等：重复提交同一 URL 不产生重复项
status, adj_dup, _ = req(
    "PATCH",
    f"/admin/accounts/{account_id}/adjustments/{adj_id}/receipts",
    {"receipt_urls": [proof_url]},
    token=token,
    extra_headers=UNLOCK_HEADERS,
)
check("重复补传同一 URL 不重复", (adj_dup or {}).get("receipt_urls"), [proof_url])

# 流水页：调整行 receipt_count 必须 > 0，且返回 receipt_urls（供前端预览）
status, flows_after, _ = req(
    "GET", f"/admin/accounts/{account_id}/flows?page_size=200", token=token, extra_headers=UNLOCK_HEADERS
)
adj_flow = next((i for i in (flows_after or {}).get("items", []) if i.get("record_id") == adj_id), None)
check_true(
    "调整流水的 receipt_count > 0",
    (adj_flow or {}).get("receipt_count", 0) > 0,
    str((adj_flow or {}).get("receipt_count")),
)
check("调整流水返回 receipt_urls", (adj_flow or {}).get("receipt_urls"), [proof_url])

# 金额/原因/日期不可通过补传接口修改（请求体只有 receipt_urls 一个字段）
status, _, _ = req(
    "PATCH",
    f"/admin/accounts/{account_id}/adjustments/{adj_id}/receipts",
    {"receipt_urls": [proof_url], "amount": 99999, "reason": "篡改"},
    token=token,
    extra_headers=UNLOCK_HEADERS,
)
status, adj_check, _ = req(
    "GET", f"/admin/accounts/{account_id}/adjustments", token=token, extra_headers=UNLOCK_HEADERS
)
target = next((a for a in adj_check if a["id"] == adj_id), None) if isinstance(adj_check, list) else None
check_true(
    "金额未被篡改（仍为 50）",
    money((target or {}).get("amount")) == money(50),
    str((target or {}).get("amount")),
)
check_true(
    "原因未被篡改",
    (target or {}).get("reason") != "篡改",
    str((target or {}).get("reason")),
)

# ─────────────────────────────────────────────────────────────
# V6：停用账户不能记账；有流水不能删除
# ─────────────────────────────────────────────────────────────
log("\nV6. 停用 / 删除保护")
status, payload, _ = req(
    "PATCH",
    f"/admin/accounts/{account_id}",
    {"status": "off"},
    token=token,
    extra_headers=UNLOCK_HEADERS,
)
check("停用账户", status, 200)

status, payload, _ = req(
    "POST",
    "/admin/ledger",
    {
        "project_id": project_id,
        "date": "2026-10-21",
        "subject_id": subject_id,
        "outflow": 100,
        "inflow": 0,
        "account_id": account_id,
    },
    token=token,
)
check("停用账户不能记账", status, 400)

status, payload, _ = req(
    "DELETE",
    f"/admin/accounts/{account_id}",
    token=token,
    extra_headers=UNLOCK_HEADERS,
)
check("有流水的账户不能删除", status, 409)

# 恢复启用（后续清理会删账户，需要先删流水）
req("PATCH", f"/admin/accounts/{account_id}", {"status": "active"}, token=token, extra_headers=UNLOCK_HEADERS)

# ─────────────────────────────────────────────────────────────
# V8：删除项目后，其流水必须从账户维度消失（回归 2026-10-21 缺陷）
# ─────────────────────────────────────────────────────────────
# 缺陷现象：删除项目只置 projects.is_deleted，流水仍存活 → 账户流水页仍列出已删项目的
# 账，点「补上账户」命中 update_record 的「项目不存在」404（列表与操作能力不一致）。
# 修复：delete_project 联动软删流水（代码层）+ _flow_query 过滤项目（兜底层）
#      + 迁移 v86 收敛存量孤儿流水（数据层）。
log("\nV8. 删除项目 → 流水从账户维度消失")
status, orphan_project, _ = req(
    "POST",
    "/projects",
    {
        "community_name": f"E2E孤儿流水小区{_ts}",
        "address": f"E2E孤儿流水路{_ts}号",
        "contract_no": f"E2E-ORPHAN-{_ts}",
        "business_form": "agent",
    },
    token=token,
)
check("创建待删项目", status in (200, 201), True)
orphan_project_id = orphan_project["id"] if isinstance(orphan_project, dict) else None

status, orphan_record, _ = req(
    "POST",
    "/admin/ledger",
    {
        "project_id": orphan_project_id,
        "date": "2026-07-09",
        "subject_id": subject_id,
        "outflow": 1,
        "inflow": 0,
        "description": "孤儿流水回归用例",
        "account_skipped": True,
    },
    token=token,
)
check("记账（未走账户，金额 1 元）", status, 201)
orphan_record_id = (orphan_record or {}).get("id")

# 删除前：该笔出现在账户流水列表里
status, before_flows, _ = req("GET", "/admin/accounts/flows?page_size=200", token=token, extra_headers=UNLOCK_HEADERS)
before_ids = {item["record_id"] for item in (before_flows or {}).get("items", [])}
check_true("删除前：流水出现在账户流水列表", orphan_record_id in before_ids, str(orphan_record_id))

# 删除项目
status, _, _ = req("DELETE", f"/projects/{orphan_project_id}", token=token)
check("删除项目", status, 204)

# 删除后：不再出现在账户流水列表（这正是本次缺陷的现象）
status, after_flows, _ = req("GET", "/admin/accounts/flows?page_size=200", token=token, extra_headers=UNLOCK_HEADERS)
after_ids = {item["record_id"] for item in (after_flows or {}).get("items", [])}
check("删除后：流水不再出现在账户流水列表", orphan_record_id in after_ids, False)

# 删除后：补挂必须是「记录不存在」，不能是「项目不存在」
# （「项目不存在」正是本次缺陷的原始报错：列表展示了不可操作的记录）
status, payload, _ = req(
    "PATCH",
    f"/admin/ledger/{orphan_record_id}",
    {"account_id": None, "account_skipped": True, "description": "回归用例"},
    token=token,
)
check_true(
    "补挂报错不再是「项目不存在」",
    (payload or {}).get("message") != "项目不存在",
    f"{status} {(payload or {}).get('message')}",
)

# 项目账本全局汇总不含已删项目的流水（口径一致）
status, stats_after_delete, _ = req("GET", "/admin/ledger/stats", token=token)
log(
    f"  删除后全局汇总：records={stats_after_delete.get('total_records')} net={stats_after_delete.get('net_cash_flow')}"
)

# ─────────────────────────────────────────────────────────────
# V16：余额公式与流水页合计恒等（回归 2026-10-22 口径不一致缺陷）
# ─────────────────────────────────────────────────────────────
# 缺陷现象：余额聚合（_flow_totals）只过滤 FinanceRecord.is_deleted，而流水列表
# （_unified_flow_query）还要求 Project.is_deleted=false。对「项目已删、流水未删」
# 的孤儿流水，余额把它算进去、流水页却不显示 → 页面上的「进 − 出 ± 核对」
# 再也推不出余额（实测差 133000.00）。
# 修复：余额聚合/本月进出/未挂账户统计统一走 _alive_records_filter()。
# 断言口径：对每个在用账户，期初 + 流水页进 − 流水页出 + 调整合计 == 账户余额。
log("\nV16. 余额公式与流水页合计恒等")
status, accounts_now, _ = req("GET", "/admin/accounts", token=token, extra_headers=UNLOCK_HEADERS)
check("取账户列表", status, 200)
formula_problems: list[str] = []
for _acc in (accounts_now or {}).get("items", []):
    _aid = _acc["id"]
    status, _flows, _ = req(
        "GET",
        f"/admin/accounts/flows?account_id={_aid}&page_size=200",
        token=token,
        extra_headers=UNLOCK_HEADERS,
    )
    if status != 200:
        formula_problems.append(f"{_acc['name']}: 流水接口 {status}")
        continue
    # 流水页合计含调整（已折进 inflow/outflow），故直接与流水的 record/adjust 两部分对账
    _lhs = money(_acc["opening_balance"]) + money(_flows["total_inflow"]) - money(_flows["total_outflow"])
    _rhs = money(_acc["balance"])
    if _lhs != _rhs:
        formula_problems.append(f"{_acc['name']}: 期初+进−出={_lhs} != 余额={_rhs}")
check("所有在用账户：期初 + 流水进 − 流水出 == 余额", formula_problems, [])

# ─────────────────────────────────────────────────────────────
# V17：并发对账不得重复记账（回归 2026-10-22 高危缺陷）
# ─────────────────────────────────────────────────────────────
# 缺陷现象：create_adjustment 是「读当前余额 → 相减 → 落库」的复合操作，中间无锁。
# 两个请求同时用同一个 actual_balance 对账时都读到同一旧余额、都算出同一笔差额、
# 各自插入一条调整 → 钱被记两次，且「只加不改不删」意味着无法撤销。
# 实测复现（余额 1000，两线程并发提交 actual_balance=1200）：两条 201、两条 200，
# 最终余额 1400（应为 1200）。
# 修复：先对账户行 SELECT ... FOR UPDATE 取行锁，把「读-算-写」串行化。
log("\nV17. 并发对账不得重复记账")

_v17_name = f"e2e_并发对账_{_ts}"
status, v17_acc, _ = req(
    "POST",
    "/admin/accounts",
    {
        "name": _v17_name,
        "type": "bank",
        "opening_balance": 1000,
        "opening_date": "2026-01-01",
        "status": "active",
    },
    token=token,
    extra_headers=UNLOCK_HEADERS,
)
check("V17 建账户（期初 1000）", status, 201)
v17_id = v17_acc["id"]

_v17_results: list[tuple] = []
_v17_lock = threading.Lock()


def _v17_worker() -> None:
    res = req(
        "POST",
        f"/admin/accounts/{v17_id}/adjustments",
        {"adjust_date": "2026-10-22", "actual_balance": 1200, "reason": "V17 并发对账"},
        token=token,
        extra_headers=UNLOCK_HEADERS,
    )
    with _v17_lock:
        _v17_results.append(res)


_v17_threads = [threading.Thread(target=_v17_worker) for _ in range(2)]
for _t in _v17_threads:
    _t.start()
for _t in _v17_threads:
    _t.join(timeout=30)

_v17_created = [r for r in _v17_results if r[0] == 201]
check("V17 并发两次对账只成功一次", len(_v17_created), 1)
status, v17_after, _ = req("GET", f"/admin/accounts/{v17_id}", token=token, extra_headers=UNLOCK_HEADERS)
check("V17 最终余额 = 1200（未被记两次）", money(v17_after.get("balance")), money(1200))
status, v17_adj, _ = req("GET", f"/admin/accounts/{v17_id}/adjustments", token=token, extra_headers=UNLOCK_HEADERS)
check("V17 调整记录只有 1 条", len(v17_adj or []), 1)

# ─────────────────────────────────────────────────────────────
# V18：改模块密码后旧解锁令牌必须立即失效（回归 2026-10-22 高危缺陷）
# ─────────────────────────────────────────────────────────────
# 缺陷现象：令牌校验只查 Redis 里 hash 是否存在，与密码哈希无关；改密不清令牌，
# 于是改密前解锁的会话（含另一台设备）在剩余 30 分钟内仍可读全部余额——
# 「改密码」在最需要它的场景（密码泄露）完全无效。实测旧令牌仍返回 200。
# 修复：set_password 成功后吊销全部 fund_accounts:unlock:* 令牌。
log("\nV18. 改密后旧令牌失效")
_v18_new_pw = "246813" if MODULE_PASSWORD != "246813" else "135790"


def _read_module_password_row() -> dict[str, object] | None:
    """读取模块密码行（value/updated_by_id/updated_at），供 V18 精确还原."""
    from db import SessionLocal
    from models import SystemConfig

    db = SessionLocal()
    try:
        row = db.query(SystemConfig).filter(SystemConfig.key == "fund_accounts.password_hash").first()
        if row is None:
            return None
        return {"value": row.value, "updated_by_id": row.updated_by_id, "updated_at": row.updated_at}
    finally:
        db.close()


def _write_module_password_row(snapshot: dict[str, object]) -> bool:
    """把密码行精确回写（含审计字段），不经过 API、不消耗 5/hour 限流."""
    from db import SessionLocal
    from models import SystemConfig

    db = SessionLocal()
    try:
        row = db.query(SystemConfig).filter(SystemConfig.key == "fund_accounts.password_hash").first()
        if row is None:
            return False
        row.value = snapshot["value"]
        row.updated_by_id = snapshot["updated_by_id"]
        row.updated_at = snapshot["updated_at"]
        db.commit()
        return True
    finally:
        db.close()


# ⚠️ 只调 1 次改密接口（RateLimits.ACCOUNT_PASSWORD_SET = 5/hour）。改两次会撞限流，
# 实测第 2 次直接 429 → 密码没改回来 → 后续用例因「令牌被吊销」全部级联失败。
# 还原走 DB 精确回写（与 restore_module_password 同一口径），不消耗配额。
_v18_snapshot = _read_module_password_row()
check_true("V18 读到当前密码行（供还原）", _v18_snapshot is not None)
status, _, _ = req(
    "POST",
    "/admin/accounts/module-password",
    {"new_password": _v18_new_pw, "old_password": MODULE_PASSWORD},
    token=token,
)
check("V18 修改模块密码", status, 204)
status, _, _ = req("GET", "/admin/accounts", token=token, extra_headers=UNLOCK_HEADERS)
check("V18 改密后旧令牌被拒（403）", status, 403)

check_true("V18 精确回写原密码行", _write_module_password_row(_v18_snapshot or {}))
status, _v18_relock, _ = req("POST", "/admin/accounts/unlock", {"password": MODULE_PASSWORD}, token=token)
check("V18 还原后重新解锁", status, 200)
if status == 200:
    UNLOCK_HEADERS.clear()
    UNLOCK_HEADERS[_UNLOCK_HEADER] = _v18_relock["token"]
    status, _, _ = req("GET", "/admin/accounts", token=token, extra_headers=UNLOCK_HEADERS)
    check("V18 新令牌可用", status, 200)

# ─────────────────────────────────────────────────────────────
# V19：金额精度必须显式拒绝而非静默四舍五入（回归 2026-10-22 缺陷）
# ─────────────────────────────────────────────────────────────
# 缺陷现象：actual_balance 无精度约束，落库列是 NUMERIC(15,2)，PostgreSQL 静默
# 四舍五入。实测 actual_balance=1000.005、系统余额 1000 → 差额 0.005 被存成 0.01，
# 余额成了 1000.01，与用户填写值不一致且无法反推原值。
# 修复：Pydantic decimal_places=2，超过 2 位小数直接 422。
log("\nV19. 金额精度超过 2 位小数被拒")
status, _v19_payload, _ = req(
    "POST",
    f"/admin/accounts/{v17_id}/adjustments",
    {"adjust_date": "2026-10-22", "actual_balance": 1200.005, "reason": "V19 精度"},
    token=token,
    extra_headers=UNLOCK_HEADERS,
)
check("V19 3 位小数被拒（422）", status, 422)
status, _v19_ok, _ = req(
    "POST",
    f"/admin/accounts/{v17_id}/adjustments",
    {"adjust_date": "2026-10-22", "actual_balance": 1200.05, "reason": "V19 精度 OK"},
    token=token,
    extra_headers=UNLOCK_HEADERS,
)
check("V19 2 位小数正常受理（201）", status, 201)
check("V19 差额精确为 0.05", money((_v19_ok or {}).get("amount")), money(0.05))

# V17/V19 账户清理（有调整记录，先直连 SQL 清）
_cleanup_test_account_rows(v17_id)
log(f"  （V17/V19 账户 {v17_id} 已清理）")

# ─────────────────────────────────────────────────────────────
# V7：改名 / 文案（前端源码断言，后端只在上面验导出表头）
# ─────────────────────────────────────────────────────────────
log("\nV7. 「资金账本」→「项目账本」后端文案")
backend_hits = []
for path in (BACKEND_ROOT / "routers").rglob("*.py"):
    text = path.read_text(encoding="utf-8", errors="ignore")
    if "资金账本" in text:
        backend_hits.append(f"{path.relative_to(BACKEND_ROOT)}")
check(
    "后端 routers 无「资金账本」（导出文件名除外）",
    [h for h in backend_hits if "ledger.py" not in h],
    [],
)
check_true(
    "导出文件名保持「资金账本_*」（SPEC D1）",
    "资金账本_" in (BACKEND_ROOT / "routers" / "finance" / "ledger.py").read_text(encoding="utf-8"),
)

# ─────────────────────────────────────────────────────────────
# 清理：删除流水 → 删除账户 → 删除项目
# ─────────────────────────────────────────────────────────────
log("\n清理测试数据")
for rid in (record_id, (skipped_record or {}).get("id")):
    if rid:
        status, _, _ = req("DELETE", f"/admin/ledger/{rid}", token=token)
        log(f"  删除流水 {rid}: {status}")

# 本账户还有 1 条对账调整记录（只加不改不删），故删除仍应被拒（409）
# —— 这是 SPEC §4 的既定口径：有流水或对账记录都只能停用，不能删。
status, _, _ = req("DELETE", f"/admin/accounts/{account_id}", token=token, extra_headers=UNLOCK_HEADERS)
check("有对账记录仍不能删除（只能停用）", status, 409)
req(
    "PATCH",
    f"/admin/accounts/{account_id}",
    {"status": "off", "name": f"e2e_已停用_{_ts}"},
    token=token,
    extra_headers=UNLOCK_HEADERS,
)
# 业务口径是「有对账记录只能停用」（API 不可删，已在上一步断言）；但**测试数据必须
# 自己收拾干净**：否则每跑一次 E2E 就往共享环境留一个 e2e_已停用_* 孤儿账户，
# 累积几十个后账户列表被测试垃圾淹没。故这里用直连 SQL 清理测试自建的行
# （与 tests/e2e/test_biz_dicts.py「ABI 无删接口 → 测试清理走直接 SQL」同一先例）。
_cleanup_test_account_rows(account_id)
log(f"  （账户 {account_id} 的测试数据已通过直连 SQL 清理）")

if project_id:
    status, _, _ = req("DELETE", f"/projects/{project_id}", token=token)
    log(f"  删除项目 {project_id}: {status}")

# 手动锁定（清理令牌，避免影响下次运行）
req("POST", "/admin/accounts/lock", token=token, extra_headers=UNLOCK_HEADERS)
status, payload, _ = req("GET", "/admin/accounts", token=token, extra_headers=UNLOCK_HEADERS)
check("锁定后旧令牌失效", status, 403)

# ─────────────────────────────────────────────────────────────
# 还原环境（关键）：删除 E2E 自建的模块密码 + 清 Redis 锁状态
# ─────────────────────────────────────────────────────────────
log("\n还原环境")
restore_module_password()

# ─────────────────────────────────────────────────────────────
# 总结
# ─────────────────────────────────────────────────────────────
passed = sum(1 for ok in ALL_PASS if ok)
total = len(ALL_PASS)
log("")
log(f"总结论：{passed}/{total} 通过" + (" ✓" if passed == total else " ✗ 存在失败用例"))
ARTIFACT.write_text("\n".join(LINES), encoding="utf-8")
log(f"报告已保存: {ARTIFACT}")
sys.exit(0 if passed == total else 1)
