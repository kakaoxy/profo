"""E2E：v99 画像回填的「物业类型并集」口径修复（追加迁移 v100）.

**报障**：迁移脚本 v99 对 ``property_types`` 只做「主档空 → 整列取子档」，而运行时
``merge_community_profile`` 是「主档 + 子档 去重并集（D4）」。历史已合并小区因此丢失
子档独有的物业类型。

**本脚本验证的东西**（全部实跑真实 PostgreSQL，不用桩）：

  C1  迁移账本：v100 ``backfill_merged_community_property_types`` 真实 applied
  C2  运行时口径对齐：v100 的字段清单与 ``merge_community_profile.PROFILE_FIELDS`` 同集同序
  C3  **缺陷复现**：先跑 v99 → 主档物业类型仍是 ``['住宅-公寓']``（子档 ``住宅-新里`` 丢失）
  C4  **修复生效**：再跑 v100 → 主档变 ``['住宅-公寓','住宅-新里','住宅-别墅']``（并集去重保序）
  C5  子档不被改写（解除合并 AC-5 的前提）
  C6  幂等：v100 连跑第二次影响 0 行，整表快照 sha256 一致
  C7  与运行时纯函数逐例同结果（多子档 / 空主档 / 空白元素 / 全空 / 重复）
  C8  边界不越界：v100 只改 ``property_types`` 与 ``updated_at``，其余画像字段原样
  C9  空白元素（现网实测 7 行）被裁剪且不产生 ``''`` 类型
  C10 审计留痕：写入 ``community_merge_property_types_union`` 且 before/after 可读
  C11 **报障 2 反证**：快照构建按「字段名变量」取值不抛 KeyError；v99 全链路（含
      ``_PROFILE_BACKFILL_FIELDS`` 遍历与 ``name`` 列取用）实跑无异常、12 字段齐全

**为什么用 profo_test**：本脚本会真实调用迁移与写库，必须用专用测试库；数据用
``__E2E_V100`` 前缀造、结束后删除并自检无残留。迁移审计会经 ``db.SessionLocal``
写库，故脚本把它重定向到测试库，绝不污染 dev 库。

命令: cd backend && .venv/bin/python tests/e2e/test_migration_community_profile_union.py
产物: tests/e2e/artifacts/e2e-community-profile-union-<ts>.txt
"""

import hashlib
import json
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

import db
from conftest import _get_test_database_url
from migrations._community_merge import (
    _BACKFILL_SQL,
    _LEGACY_ARCHIVED_SQL,
    _PROFILE_BACKFILL_FIELDS,
    _SNAPSHOT_SQL,
    backfill_merged_community_profiles,
)
from migrations._community_merge_profile_union import (
    _UNION_PROFILE_FIELDS,
    _UNION_SQL,
    backfill_merged_community_property_types,
)
from services.market.community_profile_merge import PROFILE_FIELDS, merge_community_profile

PREFIX = "__E2E_V100"
ARTIFACT_DIR = Path(__file__).resolve().parent / "artifacts"

LINES: list[str] = []
RESULTS: list[bool] = []


def log(message: str = "") -> None:
    """打印并记入工件."""
    print(message)
    LINES.append(message)


def check(name: str, ok: bool, detail: str = "") -> None:
    """记录一条断言."""
    RESULTS.append(bool(ok))
    log(f"{'✅' if ok else '❌'} {name}" + (f" — {detail}" if detail else ""))


engine = create_engine(_get_test_database_url())
# v99 的审计仍走进程级全局 ``db.SessionLocal``（已应用迁移，源码不可再改）：
# 把全局会话指向测试库，避免本脚本把审计写进 dev 的 operation_logs。
# v100 已改为 ``Session(engine)``，**不依赖**这个补丁——C12 专门验证这一点。
db.SessionLocal = sessionmaker(bind=engine)


def exec_sql(sql: str, **params: object) -> list[tuple]:
    """执行写 SQL（自动提交）."""
    with engine.begin() as conn:
        result = conn.execute(text(sql), params)
        return list(result) if result.returns_rows else []


def exec_scalar(sql: str, **params: object) -> object:
    """执行只读 SQL 并取首列."""
    with engine.connect() as conn:
        return conn.execute(text(sql), params).scalar()


def make_community(
    suffix: str,
    *,
    active: bool = True,
    merged_into: str | None = None,
    property_types: list[str] | None = None,
    created_at_offset: int = 0,
    **profile: object,
) -> str:
    """造一个小区行（其余画像字段默认 NULL）."""
    community_id = str(uuid.uuid4())
    columns = [
        "id",
        "name",
        "is_active",
        "merged_into_id",
        "property_types",
        "total_properties",
        "created_at",
        "updated_at",
    ]
    values = [":id", ":name", ":active", ":merged_into", ":types", "0", ":created_at", "now()"]
    params: dict[str, object] = {
        "id": community_id,
        "name": f"{PREFIX}_{suffix}_{uuid.uuid4().hex[:6]}",
        "active": active,
        "merged_into": merged_into,
        "types": property_types,
        "created_at": f"2026-01-01 00:00:{created_at_offset:02d}+00",
    }
    for key, value in profile.items():
        columns.append(key)
        values.append(f":{key}")
        params[key] = value
    with engine.begin() as conn:
        conn.execute(
            text(f"INSERT INTO communities ({', '.join(columns)}) VALUES ({', '.join(values)})"),  # noqa: S608
            params,
        )
    return community_id


def read_community(community_id: str) -> dict[str, object]:
    """读一行画像（12 字段 + name + updated_at）."""
    columns = ", ".join(_UNION_PROFILE_FIELDS)
    with engine.connect() as conn:
        return dict(
            conn.execute(
                text(f"SELECT name, {columns}, updated_at FROM communities WHERE id = :id"),  # noqa: S608
                {"id": community_id},
            )
            .mappings()
            .one()
        )


def property_types_of(community_id: str) -> list[str] | None:
    """读单个小区的物业类型."""
    return exec_scalar("SELECT property_types FROM communities WHERE id = :id", id=community_id)


def cleanup() -> None:
    """删除本脚本造的所有数据（小区 + 本轮审计）."""
    exec_sql("DELETE FROM communities WHERE name LIKE :p", p=f"{PREFIX}%")
    exec_sql(
        "DELETE FROM operation_logs WHERE action IN "
        "('community_merge_property_types_union', 'community_merge_profile_backfill')"
    )


def snapshot_hash() -> str:
    """全部测试小区行的稳定快照（用于幂等比对）."""
    rows = exec_sql(
        "SELECT id, property_types, updated_at FROM communities WHERE name LIKE :p ORDER BY id",
        p=f"{PREFIX}%",
    )
    payload = json.dumps([[str(r[0]), r[1], str(r[2])] for r in rows], ensure_ascii=False, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()


def main() -> int:
    """执行全部断言并写出工件."""
    log("═" * 70)
    log("E2E：v99 物业类型并集口径修复（追加迁移 v100）")
    log(f"时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    log(f"数据库: {engine.url.database}")
    log("═" * 70)

    cleanup()

    # ---------- C1 迁移账本 ----------
    log("\n【C1】迁移账本：v100 真实 applied")
    from migrations.registry import MIGRATION_BY_VERSION
    from migrations.runner import run_startup_migrations
    from migrations.schema_migrations import load_state

    summary = run_startup_migrations(engine)
    assert summary is not None
    state = load_state(engine)
    row_v100 = state.applied.get(100)
    check("v100 已登记在注册表", 100 in MIGRATION_BY_VERSION, MIGRATION_BY_VERSION[100].name)
    check("v100 账本状态 applied", row_v100 is not None and row_v100.name == "backfill_merged_community_property_types")
    check("启动后无 pending", summary.pending == 0, summary.as_log_line())
    check(
        "v100 有单表备份记录", bool(row_v100 and row_v100.backup_path), str(row_v100.backup_path if row_v100 else None)
    )

    # ---------- C2 字段清单口径 ----------
    log("\n【C2】运行时口径对齐：字段清单同集同序")
    check(
        "v100 字段清单 == 运行时 PROFILE_FIELDS",
        _UNION_PROFILE_FIELDS == PROFILE_FIELDS,
        f"v100={list(_UNION_PROFILE_FIELDS)} runtime={list(PROFILE_FIELDS)}",
    )
    check(
        "v99 回填字段集合 == 运行时 PROFILE_FIELDS 集合（防字段清单漂移）",
        set(_PROFILE_BACKFILL_FIELDS) == set(PROFILE_FIELDS),
        f"v99={sorted(_PROFILE_BACKFILL_FIELDS)}",
    )
    check("v99 字段清单不含 'name'（name 是独立列，不参与并集）", "name" not in _PROFILE_BACKFILL_FIELDS)

    # ---------- C3/C4/C5 缺陷复现 + 修复 ----------
    log("\n【C3】缺陷复现：v99 只有「主档空才取子档」，子档独有类型丢失")
    primary = make_community("主档", property_types=["住宅-公寓"], address="主档地址")
    child1 = make_community(
        "子档1", active=False, merged_into=primary, property_types=["住宅-新里"], created_at_offset=1
    )
    child2 = make_community(
        "子档2", active=False, merged_into=primary, property_types=["住宅-别墅", "住宅-公寓"], created_at_offset=2
    )
    with engine.begin() as conn:
        v99_rows = conn.execute(text(_BACKFILL_SQL)).rowcount
    after_v99 = property_types_of(primary)
    check(
        "C3 v99 未改动已有的主档物业类型（缺陷：并集丢失）",
        after_v99 == ["住宅-公寓"],
        f"v99 影响 {v99_rows} 行 → {after_v99}；子档独有 ['住宅-新里','住宅-别墅'] 未并入",
    )

    log("\n【C4】修复生效：v100 按运行时并集补齐（主档在前，子档按 created_at 追加去重）")
    with engine.begin() as conn:
        v100_rows = conn.execute(text(_UNION_SQL)).rowcount
    after_v100 = property_types_of(primary)
    check(
        "C4 并集结果正确", after_v100 == ["住宅-公寓", "住宅-新里", "住宅-别墅"], f"{after_v100}（影响 {v100_rows} 行）"
    )

    log("\n【C5】子档不被改写（AC-5 解除合并前提）")
    check("C5 子档1 原样", property_types_of(child1) == ["住宅-新里"], str(property_types_of(child1)))
    check(
        "C5 子档2 原样",
        property_types_of(child2) == ["住宅-别墅", "住宅-公寓"],
        str(property_types_of(child2)),
    )

    # ---------- C6 幂等 ----------
    log("\n【C6】幂等：v100 连跑第二次影响 0 行，全表快照一致")
    before_hash = snapshot_hash()
    with engine.begin() as conn:
        second_rows = conn.execute(text(_UNION_SQL)).rowcount
    after_hash = snapshot_hash()
    check("C6 第二次影响 0 行", second_rows == 0, f"rowcount={second_rows}")
    check("C6 快照 sha256 一致", before_hash == after_hash, f"{before_hash[:16]}…")

    # 迁移函数级幂等（含审计写入路径）
    before_fn_hash = snapshot_hash()
    backfill_merged_community_property_types(engine)
    backfill_merged_community_property_types(engine)
    check("C6 迁移函数连跑两次快照一致", snapshot_hash() == before_fn_hash, f"{before_fn_hash[:16]}…")

    # ---------- C7 与运行时纯函数同结果 ----------
    log("\n【C7】与运行时 merge_community_profile 逐例同结果")
    cases: list[tuple[str, list[str] | None, list[list[str] | None]]] = [
        ("多子档各带独有类型", ["住宅-公寓"], [["住宅-新里"], ["住宅-别墅", "住宅-公寓"]]),
        ("主档为空数组", [], [["住宅-新里"], ["住宅-别墅"]]),
        ("主档为 NULL", None, [["住宅-新里"]]),
        ("主档自带重复", ["住宅-公寓", "住宅-公寓"], [["住宅-新里"]]),
        ("子档含首尾空格与重复", ["住宅-公寓"], [[" 住宅-新里 ", "住宅-新里"]]),
        ("子档含空白元素", ["住宅-公寓"], [[" ", "住宅-别墅"]]),
        ("主档已包含全部子档类型", ["住宅-公寓", "住宅-新里"], [["住宅-新里"]]),
    ]
    for label, primary_types, child_type_lists in cases:
        case_primary = make_community(f"用例{label}", property_types=primary_types)
        case_children = [
            make_community(
                f"用例{label}_子{index}",
                active=False,
                merged_into=case_primary,
                property_types=child_types,
                created_at_offset=index + 1,
            )
            for index, child_types in enumerate(child_type_lists)
        ]
        with engine.begin() as conn:
            conn.execute(text(_UNION_SQL))

        runtime = merge_community_profile(
            {"property_types": primary_types},
            [
                {"id": child_id, "property_types": child_types}
                for child_id, child_types in zip(case_children, child_type_lists, strict=True)
            ],
        )
        engine_result = property_types_of(case_primary)
        expected = runtime.values["property_types"]
        check(
            f"C7 {label}",
            engine_result == expected,
            f"SQL={engine_result} runtime={expected}",
        )

    # ---------- C8 只改目标列 ----------
    log("\n【C8】边界：只改 property_types 与 updated_at，其余画像字段原样")
    rich_primary = make_community(
        "画像主档",
        property_types=["住宅-公寓"],
        ring="内环内",
        era_from=1993,
        era_to=1998,
        developer="主档开发商",
        property_mgmt="主档物业",
        address="主档地址1,主档地址2",
        lng=121.5,
        lat=31.2,
        business_circle="金杨",
        district="浦东新区",
        city_id=1,
    )
    make_community(
        "画像子档",
        active=False,
        merged_into=rich_primary,
        property_types=["住宅-新里"],
        ring="外环外",
        developer="子档开发商",
        created_at_offset=1,
    )
    before_row = read_community(rich_primary)
    with engine.begin() as conn:
        conn.execute(text(_UNION_SQL))
    after_row = read_community(rich_primary)
    changed = {key for key in before_row if before_row[key] != after_row[key]}
    check(
        "C8 只改 property_types（updated_at 允许变）",
        changed <= {"property_types", "updated_at"},
        f"变化字段={sorted(changed)}",
    )
    check(
        "C8 物业类型被并集", after_row["property_types"] == ["住宅-公寓", "住宅-新里"], str(after_row["property_types"])
    )
    check("C8 主档 ring 未被覆盖（D1）", after_row["ring"] == "内环内", str(after_row["ring"]))
    check("C8 主档 developer 未被覆盖（D1）", after_row["developer"] == "主档开发商", str(after_row["developer"]))

    # ---------- C9 空白元素 ----------
    log("\n【C9】空白元素不入库、不产生空字符串")
    blank_primary = make_community("空白主档", property_types=[])
    make_community(
        "空白子档",
        active=False,
        merged_into=blank_primary,
        property_types=["  ", "", "住宅-洋房"],
        created_at_offset=1,
    )
    with engine.begin() as conn:
        conn.execute(text(_UNION_SQL))
    blank_result = property_types_of(blank_primary)
    check(
        "C9 空白元素被裁掉",
        blank_result == ["住宅-洋房"],
        f"{blank_result}",
    )
    empty_primary = make_community("全空主档", property_types=[])
    make_community(
        "全空子档",
        active=False,
        merged_into=empty_primary,
        property_types=[" ", ""],
        created_at_offset=1,
    )
    with engine.begin() as conn:
        empty_rows = conn.execute(text(_UNION_SQL)).rowcount
    check(
        "C9 全空组合不写回 {}（保留原值，不制造无意义写入）",
        property_types_of(empty_primary) == [],
        f"影响 {empty_rows} 行（本用例 0 行）→ {property_types_of(empty_primary)}",
    )

    # ---------- C10 审计 ----------
    log("\n【C10】审计留痕")
    exec_sql("DELETE FROM operation_logs WHERE action = 'community_merge_property_types_union'")
    audit_primary = make_community("审计主档", property_types=["住宅-公寓"])
    make_community(
        "审计子档",
        active=False,
        merged_into=audit_primary,
        property_types=["住宅-新里"],
        created_at_offset=1,
    )
    backfill_merged_community_property_types(engine)
    audit_rows = exec_sql(
        "SELECT before, after FROM operation_logs "
        "WHERE action = 'community_merge_property_types_union' ORDER BY created_at DESC"
    )
    audit_ok = False
    audit_detail = "无审计行"
    if audit_rows:
        before_json, after_json = audit_rows[0][0], audit_rows[0][1]
        changed_entries = [
            item for item in (after_json or {}).get("property_types_union", []) if item.get("id") == audit_primary
        ]
        audit_ok = bool(changed_entries) and changed_entries[0]["after"] == ["住宅-公寓", "住宅-新里"]
        audit_detail = json.dumps(changed_entries[:1], ensure_ascii=False, default=str)
        check(
            "C10 before 快照含被改主档",
            str(audit_primary) in (before_json or {}).get("profiles", {}),
            f"profiles={len((before_json or {}).get('profiles', {}))} 个",
        )
    check("C10 after 记录并集前后值", audit_ok, audit_detail)

    # ---------- C11 报障 2 反证 ----------
    log("\n【C11】报障 2 反证：'name' 字段名引用与 v99 全链路")
    with engine.connect() as conn:
        after_row_mapping = (
            conn.execute(
                text(
                    "SELECT id, ring, property_types, era_from, era_to, developer, property_mgmt, "
                    "address, lng, lat, business_circle, district, city_id FROM communities WHERE id = :id"
                ),
                {"id": primary},
            )
            .mappings()
            .one()
        )
    try:
        snapshot_entry = {
            name: after_row_mapping[name] for name in _PROFILE_BACKFILL_FIELDS if name in after_row_mapping
        }
        snapshot_error = None
    except Exception as exc:
        snapshot_entry, snapshot_error = {}, exc
    check(
        "C11 按字段名变量取值不抛 KeyError（'name' 是循环变量，不是字面量键）",
        snapshot_error is None and len(snapshot_entry) == len(_PROFILE_BACKFILL_FIELDS),
        f"keys={len(snapshot_entry)} err={snapshot_error}",
    )
    check("C11 'name' 不在快照字段清单内", "name" not in after_row_mapping, "'name' 由 SQL 显式选取、独立取用")
    check("C11 快照 SQL 与 legacy SQL 均显式选取 name", "p.name" in _SNAPSHOT_SQL and "name" in _LEGACY_ARCHIVED_SQL)

    # v99 全链路实跑（含 before/after 快照 + 审计），任何 KeyError 都会在这里冒泡
    v99_primary = make_community("v99主档")
    make_community(
        "v99子档",
        active=False,
        merged_into=v99_primary,
        property_types=["住宅-老公寓"],
        ring="内环内",
        created_at_offset=1,
    )
    v99_error = None
    try:
        backfill_merged_community_profiles(engine)
    except Exception as exc:
        v99_error = exc
    check("C11 v99 全链路实跑无异常", v99_error is None, f"err={v99_error}")
    v99_after = read_community(v99_primary)
    check(
        "C11 v99 正确补入 12 字段中的非空项",
        v99_after["property_types"] == ["住宅-老公寓"] and v99_after["ring"] == "内环内",
        f"types={v99_after['property_types']} ring={v99_after['ring']}",
    )
    v99_audit = exec_scalar("SELECT count(*) FROM operation_logs WHERE action = 'community_merge_profile_backfill'")
    check("C11 v99 审计已落库", int(v99_audit or 0) > 0, f"{v99_audit} 行")

    # ---------- C12 审计必须落在「被改动的那个库」 ----------
    log("\n【C12】审计落点：v100 用 Session(engine)，与调用方 engine 同库（v99 的已知缺陷已隔离）")
    from settings import settings as app_settings

    dev_url = app_settings.database_url
    dev_engine = create_engine(dev_url)
    try:

        def dev_audit_count() -> int:
            with dev_engine.connect() as dev_conn:
                return int(
                    dev_conn.execute(
                        text(
                            "SELECT count(*) FROM operation_logs WHERE action = 'community_merge_property_types_union'"
                        )
                    ).scalar()
                    or 0
                )

        # 反证：把全局 SessionLocal 指到 dev 库，若 v100 仍依赖它，审计就会跑到 dev
        db.SessionLocal = sessionmaker(bind=dev_engine)
        dev_before = dev_audit_count()
        isolated_primary = make_community("审计落点主档", property_types=["住宅-公寓"])
        make_community(
            "审计落点子档",
            active=False,
            merged_into=isolated_primary,
            property_types=["住宅-新里"],
            created_at_offset=1,
        )
        exec_sql("DELETE FROM operation_logs WHERE action = 'community_merge_property_types_union'")
        backfill_merged_community_property_types(engine)
        dev_after = dev_audit_count()
        test_audit = exec_scalar(
            "SELECT count(*) FROM operation_logs WHERE action = 'community_merge_property_types_union'"
        )
        check(
            "C12 审计未写进全局 SessionLocal 指向的库（dev）",
            dev_after == dev_before,
            f"dev {dev_before}→{dev_after}",
        )
        check("C12 审计写进迁移 engine 对应的库（test）", int(test_audit or 0) > 0, f"test={test_audit} 行")
    finally:
        db.SessionLocal = sessionmaker(bind=engine)
        dev_engine.dispose()

    # ---------- 收尾 ----------
    cleanup()
    residual = exec_scalar("SELECT count(*) FROM communities WHERE name LIKE :p", p=f"{PREFIX}%")
    check("清理自检：无测试数据残留", int(residual or 0) == 0, f"residual={residual}")

    passed = sum(RESULTS)
    total_count = len(RESULTS)
    log("")
    log("═" * 70)
    log(f"结论: {passed}/{total_count} 断言通过" + ("  ✓ 全部通过" if passed == total_count else "  ✗ 存在失败"))
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    artifact = ARTIFACT_DIR / f"e2e-community-profile-union-{time.strftime('%Y%m%d-%H%M%S')}.txt"
    artifact.write_text("\n".join(LINES) + "\n", encoding="utf-8")
    log(f"工件: {artifact}")
    return 0 if passed == total_count else 1


if __name__ == "__main__":
    try:
        code = main()
    except Exception:
        import traceback

        traceback.print_exc()
        ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
        crash = ARTIFACT_DIR / f"e2e-community-profile-union-{time.strftime('%Y%m%d-%H%M%S')}-crash.txt"
        crash.write_text("\n".join(LINES) + "\n" + traceback.format_exc(), encoding="utf-8")
        print(f"崩溃工件: {crash}")
        code = 1
    engine.dispose()
    sys.exit(code)
