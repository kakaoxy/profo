"""E2E 注入验证：``reconcile_room_count``（P1 聚合 JOIN 去冗余自连接版）对账与幂等.

复验方式::

    cd backend && DATABASE_URL="postgresql+psycopg://user:pass@host:5432/db" \
        uv run python scripts/verify_reconcile_room_count.py

验证点（对真实 PostgreSQL 执行，跑完恢复现场）：
1. 选取 2 个有户室楼栋 + 1 个无户室楼栋，记录 room_count 与真实 ``count(*)``；
2. 制造漂移：有户室楼栋 ``room_count + 1``，无户室楼栋置 5；
3. 运行迁移函数 → 有户室恢复实表行数、无户室归零（LEFT JOIN COALESCE 分支）；
4. 幂等：重复调用零写入（room_count 与 updated_at 均不变）；
5. 恢复全部原始值。
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, text

from migrations._bd_audit_20261018_fixes import reconcile_room_count


def main() -> None:
    """执行注入式 E2E 验证."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("缺少 DATABASE_URL 环境变量（postgresql+psycopg://...）")
        raise SystemExit(1)
    engine = create_engine(url)

    # 1. 选样：两个有户室楼栋 + 一个无户室楼栋
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT b.id, b.room_count, COALESCE(a.cnt, 0) AS actual
                  FROM bd_buildings b
                  LEFT JOIN (SELECT building_id, count(*) AS cnt FROM bd_rooms GROUP BY building_id) a
                    ON a.building_id = b.id
                 WHERE b.id IN (SELECT id FROM bd_buildings WHERE room_count > 0 ORDER BY id LIMIT 2)
                    OR b.id IN (
                        SELECT b2.id FROM bd_buildings b2
                         LEFT JOIN (SELECT DISTINCT building_id FROM bd_rooms) r ON r.building_id = b2.id
                        WHERE r.building_id IS NULL
                        ORDER BY b2.id LIMIT 1
                    )
                 ORDER BY b.id
                """
            )
        ).all()
        assert len(rows) == 3, f"预期选到 3 个楼栋（两有一无），实际 {len(rows)}"
        originals = {r.id: r.room_count for r in rows}
        actuals = {r.id: r.actual for r in rows}

    zero_ids = [bid for bid, a in actuals.items() if a == 0]
    with_ids = [bid for bid, a in actuals.items() if a > 0]
    assert len(zero_ids) == 1 and len(with_ids) == 2, f"应为一无两有，actuals={actuals}"
    print(f"[1] 有户室楼栋 {with_ids}（真实 count: {[actuals[b] for b in with_ids]}），无户室楼栋 {zero_ids}")

    # 2. 制造漂移
    with engine.begin() as conn:
        for bid in with_ids:
            conn.execute(text("UPDATE bd_buildings SET room_count = room_count + 1 WHERE id = :i"), {"i": bid})
        for bid in zero_ids:
            conn.execute(text("UPDATE bd_buildings SET room_count = 5 WHERE id = :i"), {"i": bid})
    with engine.connect() as conn:
        drifted = dict(
            conn.execute(
                text("SELECT id, room_count FROM bd_buildings WHERE id = ANY(:ids)"),
                {"ids": list(originals)},
            ).all()
        )
    print(f"[2] 已制造漂移: {drifted}")

    # 3. 对账
    reconcile_room_count(engine)
    with engine.connect() as conn:
        after = dict(
            conn.execute(
                text("SELECT id, room_count FROM bd_buildings WHERE id = ANY(:ids)"),
                {"ids": list(originals)},
            ).all()
        )
    for bid in originals:
        assert after[bid] == actuals[bid], f"楼栋 {bid} room_count={after[bid]} 应为 {actuals[bid]}"
    print(
        f"[3] 对账通过：有户室恢复实表行数、无户室归零（{zero_ids[0]}: {drifted[zero_ids[0]]} → {after[zero_ids[0]]}）"
    )

    # 4. 幂等：重复调用零写入
    with engine.begin() as conn:
        before_snapshot = conn.execute(
            text("SELECT id, room_count, updated_at FROM bd_buildings WHERE id = ANY(:ids) ORDER BY id"),
            {"ids": list(originals)},
        ).all()
    reconcile_room_count(engine)
    with engine.connect() as conn:
        after_snapshot = conn.execute(
            text("SELECT id, room_count, updated_at FROM bd_buildings WHERE id = ANY(:ids) ORDER BY id"),
            {"ids": list(originals)},
        ).all()
    assert before_snapshot == after_snapshot, "幂等性失败：重复调用产生了写入"
    print("[4] 幂等通过：重复调用零写入（room_count 与 updated_at 均不变）")

    # 5. 恢复现场
    with engine.begin() as conn:
        for bid, rc in originals.items():
            conn.execute(text("UPDATE bd_buildings SET room_count = :rc WHERE id = :i"), {"rc": rc, "i": bid})
    with engine.connect() as conn:
        restored = dict(
            conn.execute(
                text("SELECT id, room_count FROM bd_buildings WHERE id = ANY(:ids)"),
                {"ids": list(originals)},
            ).all()
        )
    assert restored == originals, f"恢复失败: {restored} != {originals}"
    print(f"[5] 现场已恢复: {restored}")
    print("E2E PASS")


if __name__ == "__main__":
    main()
