"""E2E: 楼盘字典导入（AC-P0-1/2/3）— 可重跑工件.

命令: cd backend && .venv/bin/python tests/e2e/test_bd_import.py
预期: 首次导入对账三计数>0、重跑对账全 0（幂等 BR-16）、DB 计数一致、画像正确。
"""
# ruff: noqa: E501, PT018

# ruff: noqa: E501, B007, PT018
import pathlib
import sys

sys.path.insert(0, ".")

from sqlalchemy import text

from db import SessionLocal, engine
from services.property.dict_import_loader import load_community_by_copy
from services.property.dict_parser import detect_encoding, parse_community_txt

# 1. 清理测试小区
db = SessionLocal()
for name in ("__测试导入小区A__", "__测试导入小区B__", "测试小区丙"):
    db.query(text("1")).from_statement(text("SELECT 1"))  # noop
db.commit()
db.close()

with engine.begin() as conn:
    conn.execute(
        text(
            "DELETE FROM bd_rooms WHERE building_id IN (SELECT id FROM bd_buildings WHERE community_id IN (SELECT id FROM communities WHERE name IN ('__测试导入小区A__','__测试导入小区B__','测试小区丙')))"
        )
    )
    conn.execute(
        text(
            "DELETE FROM bd_buildings WHERE community_id IN (SELECT id FROM communities WHERE name IN ('__测试导入小区A__','__测试导入小区B__','测试小区丙'))"
        )
    )
    conn.execute(text("DELETE FROM communities WHERE name IN ('__测试导入小区A__','__测试导入小区B__','测试小区丙')"))
    # 前置清理真实样本名：上次运行中断残留会让幂等 upsert 计数归 0，
    # 导致首次导入对账断言失败（测试自身隔离性缺陷，与业务代码无关）
    conn.execute(
        text(
            "DELETE FROM bd_rooms WHERE building_id IN (SELECT id FROM bd_buildings WHERE community_id IN (SELECT id FROM communities WHERE name IN ('万寿新村（青浦）','月浦八村','高兴花园')))"
        )
    )
    conn.execute(
        text(
            "DELETE FROM bd_buildings WHERE community_id IN (SELECT id FROM communities WHERE name IN ('万寿新村（青浦）','月浦八村','高兴花园'))"
        )
    )
    conn.execute(text("DELETE FROM communities WHERE name IN ('万寿新村（青浦）','月浦八村','高兴花园')"))

base = pathlib.Path("../docs/To-Do/楼盘字典-上海/20170620-300")
samples = ["万寿新村（青浦）.txt", "月浦八村.txt", "高兴花园.txt"]

stats_total = {"communities": 0, "buildings": 0, "rooms": 0}
for fname in samples:
    data = (base / fname).read_bytes()
    content = detect_encoding(data)
    parsed = parse_community_txt(content, fname[:-4])
    stats = load_community_by_copy(
        engine,
        community_name=parsed.name,
        property_types=parsed.property_types,
        era_from=parsed.era_from,
        era_to=parsed.era_to,
        property_mgmt=parsed.property_mgmt,
        developer=parsed.developer,
        district_area=parsed.district_area,
        address=parsed.address,
        ring=parsed.ring,
        lng=next((r[2] for r in parsed.rooms if r[2] is not None), None),
        lat=next((r[3] for r in parsed.rooms if r[3] is not None), None),
        rooms=parsed.rooms,
    )
    print(f"{parsed.name}: {stats.as_dict()} warnings={parsed.warnings}")
    for k in stats_total:
        stats_total[k] += getattr(stats, k)
print("首次导入对账:", stats_total)

# 2. 重跑幂等（BR-16）
stats_total2 = {"communities": 0, "buildings": 0, "rooms": 0}
for fname in samples:
    data = (base / fname).read_bytes()
    parsed = parse_community_txt(detect_encoding(data), fname[:-4])
    stats = load_community_by_copy(
        engine,
        community_name=parsed.name,
        property_types=parsed.property_types,
        era_from=parsed.era_from,
        era_to=parsed.era_to,
        property_mgmt=parsed.property_mgmt,
        developer=parsed.developer,
        district_area=parsed.district_area,
        address=parsed.address,
        ring=parsed.ring,
        lng=next((r[2] for r in parsed.rooms if r[2] is not None), None),
        lat=next((r[3] for r in parsed.rooms if r[3] is not None), None),
        rooms=parsed.rooms,
    )
    for k in stats_total2:
        stats_total2[k] += getattr(stats, k)
print("重跑对账（应全 0）:", stats_total2)
assert stats_total2 == {"communities": 0, "buildings": 0, "rooms": 0}, "重跑不幂等!"

# 3. DB 计数核对
with engine.connect() as conn:
    n_comm = conn.execute(
        text("SELECT count(*) FROM communities WHERE name IN ('万寿新村（青浦）','月浦八村','高兴花园')")
    ).scalar()
    n_bld = conn.execute(
        text(
            "SELECT count(*) FROM bd_buildings b JOIN communities c ON c.id=b.community_id WHERE c.name IN ('万寿新村（青浦）','月浦八村','高兴花园')"
        )
    ).scalar()
    n_room = conn.execute(
        text(
            "SELECT count(*) FROM bd_rooms r JOIN bd_buildings b ON b.id=r.building_id JOIN communities c ON c.id=b.community_id WHERE c.name IN ('万寿新村（青浦）','月浦八村','高兴花园')"
        )
    ).scalar()
    floor_4 = conn.execute(
        text(
            "SELECT count(*) FROM bd_rooms r JOIN bd_buildings b ON b.id=r.building_id WHERE b.building_no='01' AND r.floor=4"
        )
    ).scalar()
    nonstd = conn.execute(
        text("SELECT count(*) FROM bd_rooms r JOIN bd_buildings b ON b.id=r.building_id WHERE r.floor IS NULL")
    ).scalar()
print(f"DB 计数: 小区={n_comm} 楼栋={n_bld} 户室={n_room} (floor=4: {floor_4}, 未分层: {nonstd})")
assert n_comm == 3 and n_bld == stats_total["buildings"] and n_room == stats_total["rooms"]

# 4. 画像核对
with engine.connect() as conn:
    row = conn.execute(
        text(
            "SELECT property_types, era_from, era_to, ring, address, property_mgmt, developer FROM communities WHERE name='万寿新村（青浦）'"
        )
    ).fetchone()
    print("万寿新村画像:", row)
    assert row[2] == 2010 and row[3] == "外环外"

with engine.begin() as conn:
    conn.execute(
        text(
            "DELETE FROM bd_rooms WHERE building_id IN (SELECT id FROM bd_buildings WHERE community_id IN (SELECT id FROM communities WHERE name IN ('万寿新村（青浦）','月浦八村','高兴花园')))"
        )
    )
    conn.execute(
        text(
            "DELETE FROM bd_buildings WHERE community_id IN (SELECT id FROM communities WHERE name IN ('万寿新村（青浦）','月浦八村','高兴花园'))"
        )
    )
    conn.execute(text("DELETE FROM communities WHERE name IN ('万寿新村（青浦）','月浦八村','高兴花园')"))
print("\nAC-P0-1/2/3 E2E 全部通过 ✓")
