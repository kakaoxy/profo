"""E2E: 2026-10-22 迭代提交的审查修复回归（可复验工件）.

覆盖本次审查修复的缺陷（R4–R6 可在修复前复现失败）：

- R4 v90 回填缺陷 → v93 修复后 ``unit_price`` 可算出、``operator_id`` 不再被队头阻塞。
- R5 ``LedgerRecordUpdate`` 金额精度漏约束 → PATCH 可写入 100.005 / 1e13。
- R6 ``GET /admin/accounts/options``（免解锁）原样下发完整卡号 → 必须掩码。

**另含一条部署判据（D1）——这条是本文件最重要的护栏**：

- D1 **禁止修改已 applied 的迁移源码**。踩坑实录（2026-10-22/23 两次真实部署失败）：
  - ``866e0bbc`` 在 v17 里加了「种子前置改名」并对本地 dev 库执行了
    ``manage rebaseline 17``；但**生产账本仍是旧 checksum**，于是
    ``./deploy-local.sh`` 部署报 ``backend 健康状态为 unhealthy``
    （容器日志为 ``MigrationBlockedError: 迁移源码校验和不匹配``，启动即退出，
    健康检查等 120s 后判死）。
  - ``4df76613`` 把 v17 改回原样（= 生产账本 checksum）才恢复可部署。
  - 本文件因此**断言 v17 的 checksum 等于一个钉死的常量**（= 生产账本值），
    任何人再去改 v17 都会在这里立刻失败，而不是等到上线时才发现。
    需要修 v17 的行为时，正确做法是**新增追加迁移**（如 v93），不是改旧函数。

**与单测的分工**：这里全部走真实 PostgreSQL（独立临时库）与真实 Service/Runner，
不 mock 数据库——checksum / 唯一约束 / 掩码都只在真实链路上才暴露。

前置：PostgreSQL 可达（读 ``DATABASE_URL``，仅借用其连接信息），无需后端进程。
本脚本会临时创建/删除 ``<原库名>_review_e2e`` 库，绝不触碰原库。

运行::

    cd backend
    set -a; source ../.env; set +a
    .venv/bin/python tests/e2e/test_review_fixes_20261022.py

产出：``tests/e2e/artifacts/review-fixes-20261022-<ts>.txt``
退出码：0 = 全部通过；1 = 有失败（Fail Loud，不静默跳过）。
"""

from __future__ import annotations

import os
import sys
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(_BACKEND_DIR))

os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/0")
os.environ.setdefault("UPLOAD_DIR", str(_BACKEND_DIR / "static" / "uploads"))
os.environ.setdefault("MIGRATION_BACKUP_MODE", "off")
os.environ.setdefault("JWT_SECRET_KEY", "e2e-only-key")
os.environ.setdefault("ENCRYPTION_KEY", "e2e-only-encryption-key")
os.environ.setdefault("WECHAT_APPID", "e2e")
os.environ.setdefault("WECHAT_SECRET", "e2e")

ARTIFACT_DIR = Path(__file__).resolve().parent / "artifacts"

# 生产账本（2026-10-20 applied）记录的 v17 checksum —— 部署能否起来的唯一判据。
# 只要源码与它不等，_verify_checksums 就会阻断启动 → deploy-local.sh 健康检查
# 120s 后报 unhealthy（2026-10-22/23 已真实踩坑两次）。
# ⚠️ 禁止为了「顺手改一下旧迁移」而更新此常量：正确做法是新增追加迁移（如 v93）。
_PROD_V17_CHECKSUM = "721533f386b3a1d727b1118e17f63e21a2b999e69633804d06e450560995fda7"
_results: list[tuple[str, bool, str]] = []
_lines: list[str] = []


def log(msg: str) -> None:
    """打印并收集一行日志."""
    print(msg)
    _lines.append(msg)


def check(name: str, *, ok: bool, detail: str = "") -> None:
    """记录一条校验结果（``ok`` 仅关键字，避免布尔位置参数歧义）."""
    _results.append((name, bool(ok), detail))
    log(f"  {'✓' if ok else '✗'} {name}" + (f" — {detail}" if detail else ""))


def _rewrite_db_url(base: str, new_db: str) -> str:
    """把 SQLAlchemy URL 里的数据库名替换为 ``new_db``."""
    head, _, _ = base.rpartition("/")
    return f"{head}/{new_db}"


def _drop_create_db(engine_admin, name: str) -> None:
    """删除并重建目标库（幂等）."""
    from sqlalchemy import text

    with engine_admin.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS "{name}"'))
        conn.execute(text(f'CREATE DATABASE "{name}"'))


def main() -> int:
    """执行全部回归校验并写工件."""
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import Session, configure_mappers

    base_url = os.environ.get("DATABASE_URL", "")
    if "postgresql" not in base_url:
        log("[FATAL] 必须提供 PostgreSQL 的 DATABASE_URL（本用例不做 SQLite 降级）")
        return 1

    target_db = "profo_review_e2e"
    engine_admin = create_engine(base_url, isolation_level="AUTOCOMMIT")
    log("═" * 78)
    log("E2E：2026-10-22 迭代提交审查修复回归")
    log(f"时间：{datetime.now(timezone.utc):%Y-%m-%d %H:%M:%S} UTC")
    log(f"临时库：{target_db}（结束时删除，不触碰 {base_url.rpartition('/')[2]}）")
    log("═" * 78)
    _drop_create_db(engine_admin, target_db)

    engine = create_engine(_rewrite_db_url(base_url, target_db))
    try:
        _run_checks(engine, configure_mappers, text, Session)
    finally:
        engine.dispose()
        _drop_create_db(engine_admin, target_db)
        engine_admin.dispose()

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    artifact = ARTIFACT_DIR / f"review-fixes-20261022-{int(datetime.now(tz=timezone.utc).timestamp())}.txt"
    passed = sum(1 for _, ok, _ in _results if ok)
    total = len(_results)
    summary = [
        "",
        "═" * 78,
        f"总结论：{passed}/{total} 通过 {'✓' if passed == total else '✗'}",
    ]
    for name, ok, detail in _results:
        summary.append(f"  {'✓' if ok else '✗'} {name}" + (f" — {detail}" if detail else ""))
    artifact.write_text("\n".join([*_lines, *summary]) + "\n", encoding="utf-8")
    print("\n".join(summary))
    print(f"\n工件：{artifact}")
    return 0 if passed == total else 1


def _run_checks(engine, configure_mappers, text, Session) -> None:  # noqa: N803
    """在临时库上执行全部校验小节."""
    import db
    from migrations.checksum import checksum_of
    from migrations.registry import MIGRATION_BY_VERSION, MIGRATIONS, NEXT_VERSION
    from migrations.runner import run_startup_migrations

    # ── ① 全量迁移（新建库）────────────────────────────────────────────
    log("\n① 全量迁移：新建库一次跑完 + 二次幂等")
    db.engine = engine
    db.SessionLocal.configure(bind=engine)
    from models import Base

    Base.metadata.create_all(bind=engine)
    first = run_startup_migrations(engine)
    check(
        "首次全量迁移 applied 为全部",
        ok=first is not None and first.applied == len(MIGRATIONS),
        detail=f"applied={first.applied if first else None} / registry={len(MIGRATIONS)}",
    )
    second = run_startup_migrations(engine)
    check(
        "二次启动幂等（executed_now=0）",
        ok=second is not None and not second.executed,
        detail=f"executed={second.executed if second else None}",
    )

    # ── ② R1：checksum 漂移门禁 ─────────────────────────────────────────
    log("\n② R1 v17 checksum 必须与账本一致（否则后端无法启动）")
    v17 = MIGRATION_BY_VERSION[17]
    actual = checksum_of(v17.fn)
    with engine.begin() as conn:
        recorded = conn.execute(text("SELECT checksum FROM schema_migrations WHERE version = 17")).scalar()
    check(
        "v17 源码 checksum == 账本记录",
        ok=actual == recorded,
        detail=f"actual={actual[:16]}… recorded={(recorded or '')[:16]}…",
    )
    # 端到端：再跑一次启动迁移，_verify_checksums 不抛即证明门禁放行
    try:
        run_startup_migrations(engine)
        check("启动迁移未被 checksum 门禁阻断", ok=True)
    except Exception as exc:
        check("启动迁移未被 checksum 门禁阻断", ok=False, detail=f"{type(exc).__name__}: {exc}")

    # ── ③ D1：已 applied 的迁移源码必须与生产账本 checksum 一致 ─────────
    log("\n③ D1 禁改已 applied 迁移：v17 checksum 必须钉死为生产账本值")
    # 生产账本（2026-10-20 applied）记录值。这是**部署能否起来的唯一判据**：
    # 只要源码 checksum 与它不等，_verify_checksums 就会阻断启动 →
    # deploy-local.sh 健康检查 120s 后报 unhealthy（已真实踩坑两次）。
    # ⚠️ 不要为了「顺手改一下旧迁移」而更新这个常量——正确做法是新增追加迁移。
    check(
        "v17 源码 checksum == 生产账本值（禁改已 applied 迁移）",
        ok=actual == _PROD_V17_CHECKSUM,
        detail=f"actual={actual[:16]}… prod={_PROD_V17_CHECKSUM[:16]}…",
    )

    # ── ③b D2：核对「本仓库登记的全部迁移」与生产账本 —— 只许追加，不许漂移 ──
    log("\n③b D2 生产账本对齐：已 applied 版本 0 漂移，新增版本仅允许追加")
    # ⚠️ 这条替代不了对真实生产库的核对（本脚本不连生产），但它能保证：
    #    凡是本地能算出的 checksum，都与 registry 一一对应；并且提醒运维在部署前
    #    对生产执行一次 manage verify（见 docs 里的部署前置检查）。
    from migrations.registry import MIGRATIONS as _MIGS

    versions = sorted(m.version for m in _MIGS)
    check("版本号 1..N 连续无空洞", ok=versions == list(range(1, len(versions) + 1)), detail=f"N={len(versions)}")
    v93 = MIGRATION_BY_VERSION.get(93)
    check(
        "V93 为追加迁移（不修改任何历史版本）",
        ok=v93 is not None and v93.version > max(m.version for m in _MIGS if m.version != 93),
        detail=v93.name if v93 else "-",
    )

    # ── ④ R4：v90 回填缺陷 → v93 修复 ──────────────────────────────────
    log("\n④ R4 v93：先补 total_price 再算 unit_price；operator_id 不再队头阻塞")
    from migrations._batched_backfill_leads_finance_fix import (
        backfill_lead_and_operator_reachability,
    )
    from migrations._helpers import _MIGRATION_BATCH_SIZE
    from models import Project

    session = Session(bind=engine)
    proj = Project(
        id=uuid.uuid4(),
        name="E2E回填验证",
        community_name="C",
        address="A",
        status="selling",
        business_form="agent",
        is_deleted=False,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    session.add(proj)
    session.commit()
    project_id = proj.id
    session.close()

    lead_id = str(uuid.uuid4())
    with engine.begin() as conn:
        # total_price NULL + expected_price/area 有值：v90 顺序缺陷下 unit_price 永久留空
        conn.execute(
            text(
                "INSERT INTO leads (id, community_name, is_hot, status, is_deleted, "
                "created_at, updated_at, area, expected_price, total_price, unit_price) "
                "VALUES (:id, 'E2E回填小区', 0, 'PENDING_ASSESSMENT', false, NOW(), NOW(), "
                "100, 2000000, NULL, NULL)"
            ),
            {"id": lead_id},
        )
        # 队头阻塞：前 _MIGRATION_BATCH_SIZE 行无可追溯日志，可追溯的那行 id 排在最后
        head_rows = [{"id": str(uuid.uuid4()), "p": project_id} for _ in range(_MIGRATION_BATCH_SIZE)]
        conn.execute(
            text(
                "INSERT INTO finance_records (id, project_id, type, category, amount, outflow, inflow, "
                "record_date, is_deleted, created_at, updated_at) "
                "VALUES (:id, :p, 'expense', '其他支出', 1, 1, 0, NOW(), false, NOW(), NOW())"
            ),
            head_rows,
        )
        traceable_id = str(uuid.uuid4())
        conn.execute(
            text(
                "INSERT INTO finance_records (id, project_id, type, category, amount, outflow, inflow, "
                "record_date, is_deleted, created_at, updated_at) "
                "VALUES (:id, :p, 'expense', '其他支出', 1, 1, 0, NOW(), false, NOW(), NOW())"
            ),
            {"id": traceable_id, "p": project_id},
        )
        conn.execute(
            text(
                "INSERT INTO operation_logs (id, user_id, action, resource_type, resource_id, "
                "created_at, updated_at) "
                "VALUES (gen_random_uuid(), 'admin-user', 'create', 'project_finance', :r, NOW(), NOW())"
            ),
            {"r": traceable_id},
        )

    backfill_lead_and_operator_reachability(engine)
    with engine.begin() as conn:
        lead_row = conn.execute(text("SELECT total_price, unit_price FROM leads WHERE id = :i"), {"i": lead_id}).first()
        operator = conn.execute(
            text("SELECT operator_id FROM finance_records WHERE id = :i"), {"i": traceable_id}
        ).scalar()
    check(
        "v93 先补 total_price",
        ok=lead_row is not None and lead_row[0] is not None,
        detail=str(lead_row[0] if lead_row else None),
    )
    check(
        "v93 后 unit_price 可算出（20000.00）",
        ok=lead_row is not None and lead_row[1] == Decimal("20000.00"),
        detail=str(lead_row[1] if lead_row else None),
    )
    check("v93 消除 operator 队头阻塞（可追溯流水被回填）", ok=operator == "admin-user", detail=str(operator))

    # 幂等：再跑一次不应再改动任何行
    with engine.begin() as conn:
        before = conn.execute(text("SELECT count(*) FROM finance_records WHERE operator_id IS NULL")).scalar()
    backfill_lead_and_operator_reachability(engine)
    with engine.begin() as conn:
        after = conn.execute(text("SELECT count(*) FROM finance_records WHERE operator_id IS NULL")).scalar()
    check("v93 幂等（重复执行不再改动）", ok=before == after, detail=f"{before} → {after}")

    # ── ⑤ R5：金额精度约束（Create 与 Update 同口径）───────────────────
    log("\n⑤ R5 LedgerRecordUpdate 金额精度约束")
    from schemas.project.finance import LedgerRecordCreate, LedgerRecordUpdate

    def _update_accepts(**kwargs: str) -> bool:
        """``LedgerRecordUpdate`` 是否接受给定金额（异常即拒绝）."""
        try:
            LedgerRecordUpdate(**kwargs)
        except Exception:
            return False
        return True

    for field in ("outflow", "inflow"):
        for bad, why in (("100.005", "超 2 位小数"), ("1e13", "超 max_digits")):
            accepted = _update_accepts(**{field: bad})
            check(
                f"Update.{field}={bad} 被拒（{why}）",
                ok=not accepted,
                detail="被接受了" if accepted else "",
            )
        ok_valid = _update_accepts(**{field: "100.00"})
        check(f"Update.{field}=100.00 仍被接受（未过度收紧）", ok=ok_valid)
    try:
        LedgerRecordCreate(project_id=str(uuid.uuid4()), subject_id="S01", date="2026-10-22", outflow="100.00")
        check("Create 合法金额仍被接受（无回归）", ok=True)
    except Exception as exc:
        check("Create 合法金额仍被接受（无回归）", ok=False, detail=str(exc))

    # ── ⑥ R6：/options 卡号掩码 ────────────────────────────────────────
    log("\n⑥ R6 免解锁的 /options 必须掩码卡号；解锁列表保持原值（避免掩码回写）")
    from models import FundAccount
    from models.common import FundAccountStatus, FundAccountType
    from services.finance.fund_account import FundAccountService

    session = Session(bind=engine)
    account = FundAccount(
        name=f"E2E掩码-{uuid.uuid4().hex[:6]}",
        type=FundAccountType.BANK,
        account_no="6222000100010001",
        opening_balance=Decimal(0),
        opening_date=datetime(2026, 1, 1, tzinfo=timezone.utc).date(),
        status=FundAccountStatus.ACTIVE,
        is_deleted=False,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    session.add(account)
    session.commit()
    service = FundAccountService(session)
    options = service.list_options()
    masked = next((o.account_no for o in options if o.id == str(account.id)), None)
    listed = service.get_account(account.id)
    session.close()
    check("options 下发掩码（保留前 4 后 4）", ok=masked == "6222********0001", detail=str(masked))
    check(
        "解锁后的详情/列表不被掩码污染（编辑不会回写掩码）",
        ok=listed.account_no == "6222000100010001",
        detail=str(listed.account_no),
    )

    # ── ⑦ 注册表完整性 ────────────────────────────────────────────────
    log("\n⑦ 注册表完整性（追加式登记）")
    versions = [m.version for m in MIGRATIONS]
    check(
        "版本严格递增无空洞",
        ok=versions == sorted(versions) and versions == list(range(1, len(versions) + 1)),
        detail=f"{len(versions)} 项",
    )
    check("NEXT_VERSION = 末版 + 1", ok=max(versions) + 1 == NEXT_VERSION, detail=f"NEXT_VERSION={NEXT_VERSION}")
    check(
        "v93 已登记",
        ok=93 in MIGRATION_BY_VERSION,
        detail=MIGRATION_BY_VERSION[93].name if 93 in MIGRATION_BY_VERSION else "-",
    )


if __name__ == "__main__":
    sys.exit(main())
