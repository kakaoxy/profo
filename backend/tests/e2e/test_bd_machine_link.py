"""E2E M1: 机器链路小区不一致 → pending（AC-P2-1）+ 一致直接引用（AC-P2-2）"""

# ruff: noqa: E402, F821, I001
import sys

sys.path.insert(0, ".")
from db import SessionLocal
from services.market.importer import PropertyImporter
from schemas import PropertyIngestionModel
from models import PropertyCurrent, BdPendingEntry, BdEntryKind, BdEntryStatus, Community
from sqlalchemy import text

db = SessionLocal()
imp = PropertyImporter()

# 清理
with db.begin():
    db.execute(text("DELETE FROM property_current WHERE data_source='e2e-m1'"))
    db.execute(text("DELETE FROM bd_pending_references WHERE biz_id LIKE 'e2e-m1%'"))
with db.begin():
    db.execute(text("DELETE FROM bd_pending_entries WHERE name LIKE '__E2E_M1小区__'"))


def make_model(spid, community):
    return PropertyIngestionModel(
        data_source="e2e-m1",
        source_property_id=spid,
        status="在售",
        community_name=community,
        rooms=2,
        halls=1,
        baths=1,
        orientation="南",
        floor_original="中楼层",
        build_area=88.0,
        listed_price_wan=500.0,
        listed_date="2026-10-13 12:00:00",
    )


# 用例1: 新小区名 → 不自动建小区 + pending + community_id 置空（AC-P2-1）
m1 = make_model("e2e-m1-001", "__E2E_M1小区__")
r1 = imp.import_property(m1, db, user_id="e2e")
print("1a 推送新小区:", r1.success, r1.error)
assert r1.success
db.commit()

prop1 = (
    db.query(PropertyCurrent)
    .filter(PropertyCurrent.data_source == "e2e-m1", PropertyCurrent.source_property_id == "e2e-m1-001")
    .first()
)
print(
    "1b community_id:",
    prop1.community_id,
    "| community_name:",
    prop1.community_name,
    "| dict_status:",
    prop1.dict_status,
)
assert prop1.community_id is None
assert prop1.community_name == "__E2E_M1小区__"
assert prop1.dict_status == "pending"

n_comm = db.query(Community).filter(Community.name == "__E2E_M1小区__").count()
print("1c communities 行数:", n_comm)
assert n_comm == 0, "不应自动建小区!"

pend = (
    db.query(BdPendingEntry)
    .filter(
        BdPendingEntry.kind == BdEntryKind.COMMUNITY,
        BdPendingEntry.normalized_name == "__e2e_m1小区__",
        BdPendingEntry.status == BdEntryStatus.PENDING,
    )
    .first()
)
print("1d pending:", pend.id if pend else None, "| source_type:", pend.source_type if pend else None)
assert pend is not None

# 用例2: 已有小区 → 直接引用（AC-P2-2）
c = db.query(Community).filter(Community.name == "__E2E_API撞名小区__").first()
m2 = make_model("e2e-m1-002", "__E2E_API撞名小区__")
r2 = imp.import_property(m2, db, user_id="e2e")
print("2a 推送已有小区:", r2.success)
assert r2.success
db.commit()
prop2 = (
    db.query(PropertyCurrent)
    .filter(PropertyCurrent.data_source == "e2e-m1", PropertyCurrent.source_property_id == "e2e-m1-002")
    .first()
)
print("2b community_id 已引用:", prop2.community_id == c.id, "| dict_status:", prop2.dict_status)
assert prop2.community_id == c.id
assert prop2.dict_status == "linked"
pend2 = (
    db.query(BdPendingEntry)
    .filter(
        BdPendingEntry.kind == BdEntryKind.COMMUNITY,
        BdPendingEntry.normalized_name == "__e2e_api撞名小区__",
        BdPendingEntry.status == BdEntryStatus.PENDING,
    )
    .count()
)
print("2c 无新增 pending:", pend2 == 0)
assert pend2 == 0

# 用例3: 同一新小区再次推送 → 复用同一 pending + 追加引用
m3 = make_model("e2e-m1-003", "__E2E_M1小区__")
r3 = imp.import_property(m3, db, user_id="e2e")
assert r3.success
db.commit()
refs = (
    db.query(BdPendingReference).filter(BdPendingReference.pending_id == pend.id).all()
    if "BdPendingReference" in dir()
    else []
)
from models import BdPendingReference

refs = db.query(BdPendingReference).filter(BdPendingReference.pending_id == pend.id).all()
print("3 pending 引用数:", len(refs))
assert len(refs) == 2  # prop-001 创建来源 + prop-003 追加

# 清理
db.rollback()
with db.begin():
    db.execute(text("DELETE FROM property_current WHERE data_source='e2e-m1'"))
    db.execute(text("DELETE FROM bd_pending_references WHERE biz_id LIKE 'e2e-m1%'"))
    db.execute(text("DELETE FROM bd_pending_entries WHERE name LIKE '__E2E_M1小区__'"))
db.close()
print("\nM1 机器链路 E2E 全部通过（AC-P2-1/2, AC-P4-5）✓")
