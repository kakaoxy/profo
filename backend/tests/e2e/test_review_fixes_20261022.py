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
    # v93 当初也是追加的：它大于此前所有已登记版本（v93 之后新增的 v94 不计入比较）
    check(
        "V93 当初为追加迁移（版本号大于其之前的所有迁移）",
        ok=v93 is not None and v93.version > max(m.version for m in _MIGS if m.version < 93),
        detail=v93.name if v93 else "-",
    )

    # v93 已 applied（生产账本 3dd6f52e…），故后续加固必须走 v94，不得改 v93。
    v94 = MIGRATION_BY_VERSION.get(94)
    prod_v93_checksum = "3dd6f52ef0cf99c3647c809611145f56f0960455723139f0699ff82dbf4272d6"
    check(
        "v93 checksum == 生产账本值（v93 已部署，禁止再改）",
        ok=checksum_of(v93.fn) == prod_v93_checksum,
        detail=f"actual={checksum_of(v93.fn)[:16]}… prod={prod_v93_checksum[:16]}…",
    )
    check(
        "V94 已登记为追加迁移（加固走新版本，不改已部署的 v93）",
        ok=v94 is not None and v94.version == 94,
        detail=v94.name if v94 else "-",
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

    # ── ④b D3：游标 SQL 不得依赖「参数在 IS NULL 里」的歧义写法 ──────────
    log("\n④b D3 游标 SQL：禁止 (:after_id IS NULL OR ...) —— PG 无法推断参数类型")
    # 背景（2026-10-23 评审意见核实）：评审建议把 ``CAST(:after_id AS text)`` 去掉、
    # 直接写 ``(:after_id IS NULL OR id > :after_id)``，理由是 leads.id 本是 varchar。
    # 但**实测该写法在首次执行就抛** AmbiguousParameter（纯 psql 的
    # ``PREPARE p AS ... $1 IS NULL ...`` 也一样报错），因为 ``$1 IS NULL`` 中
    # 参数没有任何类型上下文。故实现改为「首批/后续批两条 SQL」，彻底不用 CAST。
    # 这条用例把「歧义写法必须失败」钉住，防止有人再改回去。
    ambiguous_sql = (
        "SELECT id FROM leads WHERE total_price IS NULL AND expected_price IS NOT NULL "
        "AND (:after_id IS NULL OR id > :after_id) ORDER BY id LIMIT :batch"
    )
    try:
        with engine.begin() as conn:
            conn.execute(text(ambiguous_sql), {"after_id": None, "batch": 5}).all()
        ambiguous_failed = False
    except Exception:
        ambiguous_failed = True
    check("歧义写法 (:after_id IS NULL OR ...) 确实会抛错（故必须拆分）", ok=ambiguous_failed)

    # 拆分后的两种写法都必须可执行：首批（仅 :batch）+ 后续批（id > :after_id 裸参数）
    first_ok = next_ok = False
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "SELECT id FROM leads WHERE total_price IS NULL "
                    "AND expected_price IS NOT NULL ORDER BY id LIMIT :batch"
                ),
                {"batch": 5},
            ).all()
        first_ok = True
    except Exception:
        first_ok = False
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "SELECT id FROM leads WHERE total_price IS NULL "
                    "AND expected_price IS NOT NULL AND id > :after_id "
                    "ORDER BY id LIMIT :batch"
                ),
                {"after_id": "", "batch": 5},
            ).all()
        next_ok = True
    except Exception:
        next_ok = False
    check("拆分后首批 SQL 可执行（无 CAST）", ok=first_ok)
    check("拆分后后续批 SQL 可执行（id > :after_id 裸参数，无 CAST）", ok=next_ok)

    # ── ④d D5：冻结基线 —— 跨环境唯一真源（根治「改历史迁移」反复事故）──
    log("\n④d D5 冻结基线：已发布迁移的 checksum 必须与仓库基线逐字一致")
    from migrations.frozen_checksums import FROZEN_CHECKSUMS, FROZEN_MAX_VERSION

    frozen_bad = []
    for _v, (_name, _frozen) in sorted(FROZEN_CHECKSUMS.items()):
        _m = MIGRATION_BY_VERSION.get(_v)
        if _m is None:
            frozen_bad.append(f"v{_v} 在注册表缺失")
            continue
        if checksum_of(_m.fn) != _frozen:
            frozen_bad.append(f"v{_v} {_name}")
    check(
        f"全部 {FROZEN_MAX_VERSION} 个已发布迁移与冻结基线一致",
        ok=not frozen_bad,
        detail="均一致" if not frozen_bad else f"漂移: {frozen_bad[:3]}",
    )
    check(
        "冻结基线版本号连续（1..FROZEN_MAX_VERSION）",
        ok=sorted(FROZEN_CHECKSUMS) == list(range(1, FROZEN_MAX_VERSION + 1)),
        detail=f"1..{FROZEN_MAX_VERSION}",
    )

    # ── ④c D4：表名白名单（表名是标识符，不能用字面量转义）─────────────
    log("\n④c D4 表名白名单：误传未知标识符必须 Fail Loud，且不能用 _pg_quote_literal")
    from migrations._backfill_hardened import (
        _ALLOWED_TABLES,
        _cursor_batch_update,
    )

    check(
        "白名单仅含本模块两张表",
        ok=frozenset({"leads", "finance_records"}) == _ALLOWED_TABLES,
        detail=str(sorted(_ALLOWED_TABLES)),
    )
    for bad_table in ("users", "leads; DROP TABLE leads", "leads'", "Leads"):
        blocked = False
        try:
            _cursor_batch_update(
                engine,
                table=bad_table,
                where_sql="1=1",
                update_sql="UPDATE leads SET id = id WHERE id = :id",
                label="probe",
            )
        except ValueError:
            blocked = True
        except Exception:
            blocked = False
        check(f"非法表名 {bad_table!r} 被白名单拦截", ok=blocked)

    # 反证：`_pg_quote_literal` 用在这里会生成 `FROM 'leads'` → 语法错误。
    from migrations._helpers import _pg_quote_literal

    literal_breaks = False
    # 反证 SQL 刻意使用字符串拼接：要验证的正是「拼接后语法错误」这一事实。
    quoted = _pg_quote_literal("leads")  # -> "'leads'"（标识符不能这样写）
    try:
        with engine.begin() as conn:
            conn.execute(text(f"SELECT id FROM {quoted} LIMIT 1")).all()  # noqa: S608 - 反证用例，故意拼接
    except Exception:
        literal_breaks = True
    check("_pg_quote_literal 不能用于表名（会语法错误，故白名单才是正解）", ok=literal_breaks)

    # ── ④e D6：v94 加固实现真实数据验证（首批/后续批 SQL 均落在真实 PG 执行）───
    # 背景（2026-10-24 审查）：v94 临时库全链跑时表是空的、dev 库 v93 已补完 0 行，
    # 「首批 SQL（无游标）+ 后续批 SQL（uuid 主键 id > :after_id 裸参数）」这条真实
    # 数据执行路径此前从未被验证过——正是本项目反复踩的「未实测」坑。此用例
    # 造可回填数据后实跑 v94，锁住三组回填语义。
    log("\n④e D6 v94 加固实现：真实数据验证首批/后续批游标循环与三组回填语义")
    from migrations._backfill_hardened import backfill_leads_and_operator_hardened

    now = datetime.now(timezone.utc)
    pid = str(uuid.uuid4())
    lead_id = str(uuid.uuid4())
    fr_id = str(uuid.uuid4())
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO projects (id, name, community_name, address, status, business_form, "
                "is_deleted, finance_settlement_status, created_at, updated_at) "
                "VALUES (:i, 'E2Ev94验证项目', 'E2Ev94小区', 'E2Ev94地址', 'selling', 'agent', "
                "false, 'unsettled', :n, :n)"
            ),
            {"i": pid, "n": now},
        )
        conn.execute(
            text(
                "INSERT INTO leads (id, community_name, is_hot, status, is_deleted, created_at, updated_at, "
                "area, expected_price, total_price, unit_price) "
                "VALUES (:i, 'E2Ev94小区', 0, 'PENDING_ASSESSMENT', false, :n, :n, 80, 1600000, NULL, NULL)"
            ),
            {"i": lead_id, "n": now},
        )
        conn.execute(
            text(
                "INSERT INTO finance_records (id, project_id, type, category, amount, outflow, inflow, "
                "record_date, is_deleted, created_at, updated_at) "
                "VALUES (:i, :p, 'expense', '其他支出', 5, 5, 0, :n, false, :n, :n)"
            ),
            {"i": fr_id, "p": pid, "n": now},
        )
        conn.execute(
            text(
                "INSERT INTO operation_logs (id, user_id, action, resource_type, resource_id, created_at, updated_at) "
                "VALUES (gen_random_uuid(), 'e2e-v94', 'create', 'project_finance', :r, :n, :n)"
            ),
            {"r": fr_id, "n": now},
        )

    # 实跑 v94：先过首批（无游标），再走后续批（id > :after_id 裸参数）至扫描完
    backfill_leads_and_operator_hardened(engine)

    with engine.begin() as conn:
        _lead = conn.execute(text("SELECT total_price, unit_price FROM leads WHERE id = :i"), {"i": lead_id}).first()
        _op = conn.execute(text("SELECT operator_id FROM finance_records WHERE id = :i"), {"i": fr_id}).scalar()
    check(
        "v94 先补 total_price 再算 unit_price（1600000.00 / 20000.00）",
        ok=_lead is not None and _lead[0] == Decimal("1600000.00") and _lead[1] == Decimal("20000.00"),
        detail=str(tuple(_lead) if _lead else None),
    )
    check("v94 operator_id 经 operation_logs 精确回填", ok=_op == "e2e-v94", detail=str(_op))

    # 幂等：再跑一遍不应再改动（结果不变即通过）
    backfill_leads_and_operator_hardened(engine)
    with engine.begin() as conn:
        _lead2 = conn.execute(text("SELECT total_price, unit_price FROM leads WHERE id = :i"), {"i": lead_id}).first()
        _op2 = conn.execute(text("SELECT operator_id FROM finance_records WHERE id = :i"), {"i": fr_id}).scalar()
    check("v94 幂等（重复执行结果不变）", ok=(_lead, _op) == (_lead2, _op2))

    # 清理造数（同事务删除，失败即整体回滚并让 check 失败）
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM operation_logs WHERE resource_id = :r AND user_id = 'e2e-v94'"), {"r": fr_id})
        conn.execute(text("DELETE FROM finance_records WHERE id = :i"), {"i": fr_id})
        conn.execute(text("DELETE FROM leads WHERE id = :i"), {"i": lead_id})
        conn.execute(text("DELETE FROM projects WHERE id = :i"), {"i": pid})
    check("v94 造数清理完成（不留残留）", ok=True)

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
