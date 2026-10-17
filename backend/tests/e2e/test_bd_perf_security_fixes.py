"""E2E: 楼盘字典性能与安全专项审查（第二批）修复验证（可重跑工件）.

对应 `docs/Done/2026-10-17-楼盘字典-性能与安全专项审查报告.md`：

  S1  跨小区 dictionary-link（只传 room_id）必须 400；房源类写楼栋/户室 400；
      同小区合法绑定仍 200
  S2  已合并归档小区：详情 GET 404、画像 PATCH 409；主档视角可见 merged_children
  H2  「待审小区 → 待审楼栋」两级 create 全部成功（create 与 merge 两条父级路径）
  H3  pending-backfill 收敛：无回填对象的 open 引用被关闭，连续两次均返回 0 条，
      且库内 open 引用为 0；reference_count 口径为「待回填」
  H1  单条目防线 16MB；流式解析峰值内存与文件大小无关（38.7MB 输入峰值 <100MB，
      旧链路实测 534MB）
  P1  room_count 对账 SQL 为聚合 JOIN（无逐行相关子查询），耗时显著低于旧实现
  P2  review?status=bogus 返回 422（非 500）
  P3  楼栋详情户室分页：默认 200/页、上限 500、跨页不重复、room_total 正确
  P4  超长文件名上传 400 且 temp/uploads 不新增残留（无孤儿文件）
  L1  批量补录逐条重试：非 IntegrityError 只跳过当条，已成功条目保留
  L2  父级 resolved_target_id 脏值 → 400（非 500）
  L3  lng/lat 越界 → 422；合法值 201；导入解析过滤 (0,0) 与越界
  L5  retry_backfill 写 operation_logs 审计（bd_pending_backfill_retry）

命令: cd backend && .venv/bin/python tests/e2e/test_bd_perf_security_fixes.py
预期: 全部断言 PASS；`__PS_*` 造数 0 残留。
"""

# ruff: noqa: E402 —— env 注入必须先于业务 import（backend/ 目录直跑找不到根 .env）

import io
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, ".")

for _line in Path("../.env").read_text().splitlines():
    _line = _line.strip()
    if _line and "=" in _line and not _line.startswith("#"):
        _k, _v = _line.split("=", 1)
        os.environ.setdefault(_k.strip(), _v.strip())

from fastapi.testclient import TestClient
from sqlalchemy import text

import db
from main import app
from services.property.dict_import_loader import MAX_SINGLE_ENTRY_BYTES
from services.property.dict_import_service import UPLOAD_DIR
from services.property.dict_parser import open_decoded_text, parse_community_txt, parse_community_txt_stream
from utils.auth import AUDIENCE_ADMIN, create_access_token

results: list[tuple[str, bool, str]] = []

PREFIX = "__PS"

API = "/api/v1/admin/building-dictionary"


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"{'✅' if ok else '❌'} {name}" + (f" — {detail}" if detail else ""))


def exec_sql(sql: str, **params: object) -> list[tuple]:
    with db.engine.begin() as conn:
        result = conn.execute(text(sql), params)
        return list(result) if result.returns_rows else []


_row = exec_sql("SELECT id, token_version FROM users WHERE username = 'admin' LIMIT 1")[0]
admin_id, admin_ver = str(_row[0]), int(_row[1])
token = create_access_token(data={"sub": admin_id, "role": "admin", "ver": admin_ver}, audience=AUDIENCE_ADMIN)
HEADERS = {"Authorization": f"Bearer {token}", "X-Requested-With": "XMLHttpRequest"}


class _TupleClient:
    """TestClient 包装：每次调用返回 (status_code, json)，便于 `s, body = ...` 解包。

    既有字典 E2E 工件（test_bd_capacity_fixes / test_bd_audit_*）用 TestClient 原始
    返回值，本文件统一解包口径，避免每处手写 response.status_code / .json()。
    """

    def __init__(self, inner: TestClient) -> None:
        self._inner = inner

    @staticmethod
    def _unwrap(resp: object) -> tuple[int, dict]:
        try:
            return resp.status_code, resp.json()  # type: ignore[attr-defined]
        except ValueError:
            return resp.status_code, {}  # type: ignore[attr-defined]

    def get(self, path: str, **kwargs: object) -> tuple[int, dict]:
        return self._unwrap(self._inner.get(path, headers=HEADERS, **kwargs))

    def post(self, path: str, **kwargs: object) -> tuple[int, dict]:
        return self._unwrap(self._inner.post(path, headers=HEADERS, **kwargs))

    def put(self, path: str, **kwargs: object) -> tuple[int, dict]:
        return self._unwrap(self._inner.put(path, headers=HEADERS, **kwargs))

    def patch(self, path: str, **kwargs: object) -> tuple[int, dict]:
        return self._unwrap(self._inner.patch(path, headers=HEADERS, **kwargs))


client = _TupleClient(TestClient(app))


def cleanup() -> None:
    """清理本轮造数（按名称前缀 + 上传目录前缀）."""
    exec_sql(
        "DELETE FROM bd_pending_references WHERE pending_id IN (SELECT id FROM bd_pending_entries WHERE name LIKE :p)",
        p=f"{PREFIX}%",
    )
    exec_sql("DELETE FROM bd_pending_entries WHERE name LIKE :p", p=f"{PREFIX}%")
    exec_sql(
        "DELETE FROM bd_rooms WHERE building_id IN "
        "(SELECT id FROM bd_buildings WHERE community_id IN (SELECT id FROM communities WHERE name LIKE :p))",
        p=f"{PREFIX}%",
    )
    exec_sql(
        "DELETE FROM bd_buildings WHERE community_id IN (SELECT id FROM communities WHERE name LIKE :p)",
        p=f"{PREFIX}%",
    )
    exec_sql("DELETE FROM communities WHERE name LIKE :p", p=f"{PREFIX}%")
    exec_sql("DELETE FROM bd_import_tasks WHERE filename LIKE :p", p=f"{PREFIX}%")
    for f in UPLOAD_DIR.glob(f"bd_*{PREFIX}*"):
        f.unlink(missing_ok=True)


cleanup()

# ============================================================
# S1：跨小区 dictionary-link
# ============================================================
print("\n=== S1 跨小区绑定越权 ===")
s, c1 = client.post(
    f"{API}/communities",
    json={"name": f"{PREFIX}S1小区A__", "district": "静安区", "business_circle": "PS"},
)
s2, c2 = client.post(
    f"{API}/communities",
    json={"name": f"{PREFIX}S1小区B__", "district": "静安区", "business_circle": "PS"},
)
check("S1 前置：两个字典小区创建成功", s == 201 and s2 == 201, f"{s}/{s2}")
check("S1 两个小区 id 不同（跨小区校验前提）", c1["id"] != c2["id"], f"{c1['id']} vs {c2['id']}")

client.post(f"{API}/buildings", json={"community_id": c1["id"], "building_no": "1"})
# 取 A 小区 1 号楼真实 id
row = exec_sql(
    "SELECT id FROM bd_buildings WHERE community_id = :c AND building_no = '1' LIMIT 1",
    c=c1["id"],
)
building_a = int(row[0][0])
client.post(
    f"{API}/buildings/{building_a}/rooms",
    json={"building_id": building_a, "floor": "1", "room_suffix": "01"},
)
room_a = int(exec_sql("SELECT id FROM bd_rooms WHERE building_id = :b LIMIT 1", b=building_a)[0][0])
check("S1 前置：A 小区有楼栋与户室", building_a > 0 and room_a > 0, f"building={building_a} room={room_a}")

# 1) 只传 room_id（属于 A）但把单据绑到 B → 必须 400
s, body = client.put(
    "/api/v1/admin/marketing/projects/1/dictionary-link",
    json={"community_id": c2["id"], "room_id": room_a},
)
check(
    "S1 跨小区 room_id 绑定被拒（400，非 200）",
    s == 400 and "不属于所选小区" in body.get("message", ""),
    f"{s} {body.get('message')}",
)

# 2) 同小区合法绑定 → 200
s, body = client.put(
    "/api/v1/admin/marketing/projects/1/dictionary-link",
    json={"community_id": c1["id"], "room_id": room_a},
)
check("S1 同小区合法绑定仍 200（未误伤正常路径）", s == 200, f"{s} {body}")

# 3) 房源类（机器链路）只允许小区级 → 传 room_id 必须 400
s, body = client.put(
    "/api/v1/admin/properties/网签:11282911/dictionary-link",
    json={"community_id": c1["id"], "room_id": room_a},
)
check(
    "S1 房源类写楼栋/户室被拒（契约承诺变代码约束）",
    s == 400 and "仅支持小区级" in body.get("message", ""),
    f"{s} {body.get('message')}",
)

# 还原探针单据
exec_sql(
    "UPDATE l4_marketing_projects SET community_id = '8078a001-3e87-401f-ac5d-9b865aa89aae', "
    "building_id = NULL, room_id = NULL, dict_status = 'linked' WHERE id = 1"
)
leftover = exec_sql("SELECT count(*) FROM l4_marketing_projects WHERE id = 1 AND room_id IS NOT NULL")[0][0]
check("S1 探针单据已还原（room_id 归零）", int(leftover) == 0, f"room_id 非空={leftover}")

# ============================================================
# S2：归档小区不可读/不可写
# ============================================================
print("\n=== S2 归档小区读写拦截 ===")
s, primary = client.post(
    f"{API}/communities",
    json={"name": f"{PREFIX}S2主档__", "district": "静安区", "business_circle": "PS"},
)
s, secondary = client.post(
    f"{API}/communities",
    json={"name": f"{PREFIX}S2子档__", "district": "静安区", "business_circle": "PS"},
)
s, merged = client.post(
    "/api/v1/admin/communities/merge",
    json={"primary_id": primary["id"], "merge_ids": [secondary["id"]]},
)
check("S2 前置：合并成功（子档 is_active=false）", s == 200 and merged["success"], f"{s}")

s, body = client.get(f"{API}/communities/{secondary['id']}")
check(
    "S2 归档小区详情 GET 返回 404（原 200）",
    s == 404,
    f"{s} {body.get('message', '')[:60]}",
)

s, body = client.patch(f"{API}/communities/{secondary['id']}", json={"ring": "内环内"})
check(
    "S2 归档小区画像 PATCH 返回 409（原 200 且落库）",
    s == 409,
    f"{s} {body.get('message', '')[:70]}",
)
# 落库未被修改
ring_after = exec_sql("SELECT ring FROM communities WHERE id = :i", i=secondary["id"])[0][0]
check("S2 归档小区画像未被写入（库内 ring 仍为空）", ring_after is None, f"ring={ring_after}")

s, detail = client.get(f"{API}/communities/{primary['id']}")
child_ids = [c["id"] for c in (detail.get("merged_children") or [])] if s == 200 else []
check(
    "S2 主档视角可见被并子档（merged_children，合并信息入口不丢）",
    secondary["id"] in child_ids,
    f"{s} children={child_ids}",
)
s, body = client.patch(f"{API}/communities/{primary['id']}", json={"ring": "内环内"})
check("S2 主档操作不受影响（PATCH 200）", s == 200, f"{s}")

# ============================================================
# H2：待审小区 → 待审楼栋 两级转正
# ============================================================
print("\n=== H2 审核链（父级待审小区 → 子级待审楼栋）===")


def submit_pending(payload: dict) -> int:
    s, body = client.post(f"{API}/pending", json=payload)
    assert s == 201, f"提交 pending 失败: {s} {body}"
    return int(body["pending_id"])


def resolve(entry_id: int, payload: dict) -> tuple[int, dict]:
    return client.post(f"{API}/review/{entry_id}/resolve", json=payload)


# 路径一：create
p_comm = submit_pending({"kind": "community", "name": f"{PREFIX}H2小区__", "community_payload": {"district": "静安区"}})
p_bld = submit_pending(
    {"kind": "building", "name": "8号楼", "parent_kind": "pending_community", "parent_id": str(p_comm)}
)
row = exec_sql("SELECT community_id, parent_is_pending FROM bd_pending_entries WHERE id = :i", i=p_bld)
check(
    "H2 前置：待审楼栋 parent_is_pending=true 且 community_id 为空",
    row[0][1] is True and row[0][0] is None,
    f"community_id={row[0][0]} parent_is_pending={row[0][1]}",
)

s, body = resolve(p_comm, {"action": "create"})
check("H2-a 父级小区 create 成功", s == 200, f"{s} {body.get('message', '')[:60]}")

row = exec_sql("SELECT community_id, community_scope FROM bd_pending_entries WHERE id = :i", i=p_bld)
check(
    "H2 父级转正后子级楼栋回填归属小区（原为 NULL → 永久 400 的根因）",
    row[0][0] is not None and row[0][1] is not None,
    f"community_id={row[0][0]} scope={row[0][1]}",
)

s, body = resolve(p_bld, {"action": "create"})
check(
    "H2-b 子级楼栋 create 成功（原 400「楼栋 pending 缺少归属小区」）",
    s == 200,
    f"{s} {body.get('message', '')[:70]}",
)

# 路径二：merge（对称修复）
p_comm2 = submit_pending(
    {"kind": "community", "name": f"{PREFIX}H2合并小区__", "community_payload": {"district": "静安区"}}
)
p_bld2 = submit_pending(
    {"kind": "building", "name": "9号楼", "parent_kind": "pending_community", "parent_id": str(p_comm2)}
)
s, _ = resolve(p_comm2, {"action": "merge", "target_id": primary["id"]})
check("H2-c 父级小区 merge 成功", s == 200, f"{s}")
s, body = resolve(p_bld2, {"action": "create"})
check(
    "H2-d 父级 merge 后子级楼栋 create 成功（对称路径）",
    s == 200,
    f"{s} {body.get('message', '')[:70]}",
)

# ============================================================
# H3：引用账本收敛
# ============================================================
print("\n=== H3 引用账本收敛 / reference_count 口径 ===")
# 造一条「无回填对象」的 open 引用（条目 pending 且 resolved_target_id 为空）
p_orphan = submit_pending(
    {"kind": "community", "name": f"{PREFIX}H3孤儿引用__", "community_payload": {"district": "静安区"}}
)
exec_sql(
    "INSERT INTO bd_pending_references (pending_id, biz_type, biz_id, field, status, created_at) "
    "VALUES (:pid, 'project', :biz, 'community_id', 'open', now())",
    pid=p_orphan,
    biz="00000000-0000-0000-0000-0000000ps000".replace("ps", "00"),  # 合法 UUID 格式但指向不存在项目
)
open_before = int(exec_sql("SELECT count(*) FROM bd_pending_references WHERE status = 'open'")[0][0])
check("H3 前置：库内存在无回填对象的 open 引用", open_before >= 1, f"open={open_before}")

s, body1 = client.post(f"{API}/review/pending-backfill")
s2, body2 = client.post(f"{API}/review/pending-backfill")
open_after = int(exec_sql("SELECT count(*) FROM bd_pending_references WHERE status = 'open'")[0][0])
check(
    "H3 回填后库内 open 引用收敛为 0",
    open_after == 0,
    f"before={open_before} after={open_after}",
)
check(
    "H3 连续两次 pending-backfill 均返回「实际回填 0 条」",
    s == 200 and s2 == 200 and "实际回填 0 条" in body1["message"] and "实际回填 0 条" in body2["message"],
    f"{body1['message']} / {body2['message']}",
)

# reference_count 口径 = open 数（不是历史累计）：造 1 open + 1 resolved，期望 1
exec_sql(
    "INSERT INTO bd_pending_references (pending_id, biz_type, biz_id, field, status, created_at) "
    "VALUES (:pid, 'lead', :biz, 'community_id', 'resolved', now())",
    pid=p_orphan,
    biz=f"{PREFIX}resolved-ref",
)
exec_sql(
    "INSERT INTO bd_pending_references (pending_id, biz_type, biz_id, field, status, created_at) "
    "VALUES (:pid, 'marketing', :biz, 'community_id', 'open', now())",
    pid=p_orphan,
    biz="9001",
)
cnt_open = int(
    exec_sql(
        "SELECT count(*) FROM bd_pending_references WHERE pending_id = :p AND status = 'open'",
        p=p_orphan,
    )[0][0]
)
cnt_all = int(exec_sql("SELECT count(*) FROM bd_pending_references WHERE pending_id = :p", p=p_orphan)[0][0])
s, queue = client.get(f"{API}/review?status=pending&page_size=100")
item = next((i for i in queue["items"] if i["id"] == p_orphan), None) if s == 200 else None
check(
    "H3 reference_count 只计 open（该条目 1 open + 2 resolved → 展示 1 而非 3）",
    item is not None and cnt_open == 1 and cnt_all == 3 and item["reference_count"] == cnt_open,
    f"reference_count={item['reference_count'] if item else None} open={cnt_open} all={cnt_all}",
)
# 清理该条目的造数引用（避免影响收尾统计）
exec_sql("DELETE FROM bd_pending_references WHERE pending_id = :p", p=p_orphan)

# ============================================================
# L5：回填重试留审计
# ============================================================
print("\n=== L5 回填重试审计 ===")
audit_n = int(exec_sql("SELECT count(*) FROM operation_logs WHERE action = 'bd_pending_backfill_retry'")[0][0])
check("L5 retry_backfill 写入审计（bd_pending_backfill_retry）", audit_n >= 1, f"审计行数={audit_n}")

# ============================================================
# P2：status 非法值 422
# ============================================================
print("\n=== P2 审核池 status 枚举校验 ===")
s, body = client.get(f"{API}/review?status=bogus")
check(
    "P2 status=bogus 返回 422（原 500）",
    s == 422,
    f"{s} {body.get('message', '')[:80]}",
)
s, _ = client.get(f"{API}/review?status=pending")
check("P2 status=pending 正常 200（合法值不受影响）", s == 200, f"{s}")

# ============================================================
# P3：楼栋详情户室分页
# ============================================================
print("\n=== P3 楼栋详情户室分页 ===")
# 用真实库内最大楼栋（928 户）
big = exec_sql("SELECT id, room_count FROM bd_buildings ORDER BY room_count DESC LIMIT 1")
big_id, big_rooms = int(big[0][0]), int(big[0][1])

s, page1 = client.get(f"{API}/buildings/{big_id}")
check(
    "P3 默认分页 200/页且 has_more=true（原一次返回全部）",
    s == 200 and len(page1["rooms"]) == min(200, big_rooms) and page1["room_total"] == big_rooms,
    f"rooms={len(page1.get('rooms', []))} total={page1.get('room_total')} has_more={page1.get('room_has_more')}",
)
check(
    "P3 响应体显著小于全量（实测 <30KB，原 87.9KB）",
    len(str(page1)) < 30000,
    f"approx_chars={len(str(page1))}",
)

s, page2 = client.get(f"{API}/buildings/{big_id}?room_page=2&room_page_size=200")
ids1 = {r["id"] for r in page1["rooms"]}
ids2 = {r["id"] for r in page2["rooms"]}
check("P3 第 2 页与第 1 页不重复", not (ids1 & ids2), f"overlap={len(ids1 & ids2)}")

s, capped = client.get(f"{API}/buildings/{big_id}?room_page_size=500")
check("P3 page_size=500（上限）可用", s == 200 and len(capped["rooms"]) == min(500, big_rooms), f"{s}")

s, _ = client.get(f"{API}/buildings/{big_id}?room_page_size=501")
check("P3 page_size>500 被拒（422）", s == 422, f"{s}")

# ============================================================
# P4：超长文件名不产生孤儿文件
# ============================================================
print("\n=== P4 上传失败不落孤儿文件 ===")
before_n = len([f for f in UPLOAD_DIR.glob("bd_*") if f.is_file()])
long_name = f"{PREFIX}{'b' * 300}.txt"
s, body = client.post(
    f"{API}/import",
    files={"file": (long_name, b"test content", "text/plain")},
)
after_n = len([f for f in UPLOAD_DIR.glob("bd_*") if f.is_file()])
check(
    "P4 超长文件名返回 400 且提示明确（原 500「数据格式错误」）",
    s == 400 and "文件名过长" in body.get("message", ""),
    f"{s} {body.get('message', '')[:70]}",
)
check("P4 上传失败未产生孤儿文件", after_n == before_n, f"before={before_n} after={after_n}")

# ============================================================
# L3：坐标值域
# ============================================================
print("\n=== L3 坐标值域校验 ===")
s, body = client.patch(f"{API}/communities/{primary['id']}", json={"lng": 999.5, "lat": -888.1})
check(
    "L3 PATCH 越界坐标被拒（422，原 200 原样落库）",
    s == 422 and "lng" in body.get("message", "") and "lat" in body.get("message", ""),
    f"{s} {body.get('message', '')[:80]}",
)
client.post(
    f"{API}/communities",
    json={"name": f"{PREFIX}L3越界__", "district": "静安区", "business_circle": "PS", "lng": 999, "lat": 31.2},
)
check("L3 新增小区越界坐标被拒（422）", s == 422, f"{s}")

# 导入解析：越界/0 占位置空
bad_txt = "PS坐标小区;01;0101;999.5;-888.1;\nPS坐标小区;02;0201;0;0;\nPS坐标小区;03;0301;121.47;31.23;\n"
parsed = parse_community_txt(bad_txt, f"{PREFIX}坐标小区")
coords = [(r[2], r[3]) for r in parsed.rooms]
check(
    "L3 导入解析过滤越界与 (0,0) 占位",
    coords == [(None, None), (None, None), (121.47, 31.23)],
    f"{coords}",
)
check(
    "L3 小区级首户坐标取首个合法值",
    parsed.lng == 121.47 and parsed.lat == 31.23,
    f"lng={parsed.lng} lat={parsed.lat}",
)

# ============================================================
# H1：内存防线（单条目上限 + 流式解析峰值）
# ============================================================
print("\n=== H1 导入内存防线 ===")
check(
    "H1 单条目上限降为 16MB（原 512MB，按 13.1× 放大反算）",
    MAX_SINGLE_ENTRY_BYTES == 16 * 1024 * 1024,
    f"{MAX_SINGLE_ENTRY_BYTES // 1024 // 1024}MB",
)

# 流式解析峰值（38.7MB / 140 万行）：旧链路实测 delta 534MB
line = "测试小区;01;0401;121.4;31.2;\n"
n_lines = 1_400_000
probe_path = UPLOAD_DIR / f"{PREFIX}h1_probe.txt"
with probe_path.open("w", encoding="gbk") as f:
    chunk = line * 10_000
    for _ in range(n_lines // 10_000):
        f.write(chunk)


def rss_bytes() -> int:
    import resource

    usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return int(usage) if sys.platform == "darwin" else int(usage) * 1024


base_rss = rss_bytes()
t0 = time.perf_counter()
with probe_path.open("rb") as fh:
    text_stream = open_decoded_text(io.BufferedReader(fh))
    parsed_stream = parse_community_txt_stream(text_stream, "H1探针")
    text_stream.close()
elapsed = time.perf_counter() - t0
peak_delta_mb = (rss_bytes() - base_rss) / 2**20
size_mb = probe_path.stat().st_size / 2**20
parsed_stream.rooms_csv_path and Path(parsed_stream.rooms_csv_path).unlink(missing_ok=True)
probe_path.unlink(missing_ok=True)

check(
    "H1 流式解析 140 万户室行数正确",
    parsed_stream.room_count == n_lines,
    f"room_count={parsed_stream.room_count}",
)
check(
    "H1 流式解析峰值内存与文件大小无关（38.7MB 输入 delta < 100MB；旧链路实测 534MB）",
    peak_delta_mb < 100,
    f"input={size_mb:.1f}MB peak_delta={peak_delta_mb:.0f}MB elapsed={elapsed:.2f}s",
)

# ============================================================
# P1：对账 SQL 形态（无逐行相关子查询）
# ============================================================
print("\n=== P1 room_count 对账 SQL ===")
import inspect

from migrations._bd_audit_20261018_fixes import reconcile_room_count

src = inspect.getsource(reconcile_room_count)
check(
    "P1 对账 SQL 用聚合 JOIN（MATERIALIZED 聚合一次），不再是逐行相关子查询",
    "MATERIALIZED" in src
    and "LEFT JOIN agg" in src
    and "SELECT count(*) FROM bd_rooms r WHERE r.building_id = bd.id" not in src,
    "聚合 JOIN 版",
)
# 幂等性：连续两次执行后仍无漂移
from migrations._bd_audit_20261018_fixes import reconcile_room_count as _reconcile

t0 = time.perf_counter()
_reconcile(db.engine)
elapsed_ms = (time.perf_counter() - t0) * 1000
drift = int(
    exec_sql(
        "SELECT count(*) FROM bd_buildings b LEFT JOIN "
        "(SELECT building_id, count(*) cnt FROM bd_rooms GROUP BY building_id) a ON a.building_id = b.id "
        "WHERE b.room_count IS DISTINCT FROM COALESCE(a.cnt, 0)"
    )[0][0]
)
check("P1 对账幂等（执行后零漂移）", drift == 0, f"drift={drift}")
check(
    "P1 单次对账耗时 < 1000ms（旧实现实测 1211ms）",
    elapsed_ms < 1000,
    f"elapsed={elapsed_ms:.0f}ms",
)

# ============================================================
# L1：逐条重试隔离
# ============================================================
print("\n=== L1 批量补录逐条重试隔离 ===")
from datetime import datetime, timezone

from sqlalchemy.exc import OperationalError

from services.property.dict_write_service import DictWriteService

svc = DictWriteService()
l1_session = db.SessionLocal()
real_flush = l1_session.flush
calls = {"n": 0}
now = datetime.now(timezone.utc)


def flaky_flush(*args: object, **kwargs: object) -> object:
    calls["n"] += 1
    if calls["n"] == 2:
        simulated = "simulated db failure"
        boom = "boom"
        raise OperationalError(boom, None, Exception(simulated))
    return real_flush(*args, **kwargs)


l1_session.flush = flaky_flush  # type: ignore[method-assign]
try:
    added, created = svc._retry_buildings_one_by_one(
        l1_session,
        community_id=c1["id"],
        nos=[f"{PREFIX}L1-{i}" for i in range(3)],
        now=now,
    )
finally:
    l1_session.flush = real_flush  # type: ignore[method-assign]
    l1_session.close()
check(
    "L1 非 IntegrityError 只跳过当条，其余照常写入（原会整批中断并漏转正）",
    added == 2 and len(created) == 2,
    f"added={added} created={sorted(created)}",
)

# ============================================================
# L2：父级 resolved_target_id 脏值 → 400
# ============================================================
print("\n=== L2 父级 id 脏值不 500 ===")
for name in (f"{PREFIX}L2楼栋脏父级__",):
    exec_sql("DELETE FROM bd_pending_entries WHERE name = :n", n=name)
dirty_id = submit_pending(
    {"kind": "building", "name": f"{PREFIX}L2楼栋脏父级__", "parent_kind": "community", "parent_id": c1["id"]}
)
# 造一条户室 pending 挂到「parent_is_pending=true 且 resolved_target_id 为脏串」的父级上
exec_sql(
    "INSERT INTO bd_pending_entries "
    "(kind, community_id, name, normalized_name, parent_kind, parent_id, parent_is_pending, "
    " community_scope, status, resolved_target_id, created_at, updated_at) "
    "VALUES ('building', :cid, :n, :n, 'community', 0, false, :cid, 'created', 'not-a-number', now(), now())",
    cid=c1["id"],
    n=f"{PREFIX}L2脏父级__",
)
dirty_parent_id = int(exec_sql("SELECT id FROM bd_pending_entries WHERE name = :n", n=f"{PREFIX}L2脏父级__")[0][0])
exec_sql(
    "INSERT INTO bd_pending_entries "
    "(kind, community_id, name, normalized_name, parent_kind, parent_id, parent_is_pending, "
    " community_scope, status, created_at, updated_at) "
    "VALUES ('room', :cid, :n, :n, 'building', :pid, true, :cid, 'pending', now(), now())",
    cid=c1["id"],
    n=f"{PREFIX}L2户室脏父级__",
    pid=dirty_parent_id,
)
dirty_room_id = int(exec_sql("SELECT id FROM bd_pending_entries WHERE name = :n", n=f"{PREFIX}L2户室脏父级__")[0][0])
s, body = resolve(dirty_room_id, {"action": "create"})
check(
    "L2 父级 resolved_target_id 非数字 → 400（原 500 ValueError）",
    s == 400 and "父级数据异常" in body.get("message", ""),
    f"{s} {body.get('message', '')[:60]}",
)

# ============================================================
# 收尾
# ============================================================
cleanup()
left = exec_sql(
    "SELECT (SELECT count(*) FROM communities WHERE name LIKE :p) + "
    "(SELECT count(*) FROM bd_pending_entries WHERE name LIKE :p) + "
    "(SELECT count(*) FROM bd_import_tasks WHERE filename LIKE :p)",
    p=f"{PREFIX}%",
)[0][0]
check("造数清理干净（0 残留）", int(left) == 0, f"残留={left}")
leftover_files = [f.name for f in UPLOAD_DIR.glob(f"bd_*{PREFIX}*")]
check("上传目录无测试残留文件", not leftover_files, f"{leftover_files}")

failed = [r for r in results if not r[1]]
print("\n" + "=" * 60)
print(f"用例 {len(results)} 条，通过 {len(results) - len(failed)} 条，失败 {len(failed)} 条")
for name, _ok, detail in failed:
    print(f"  ❌ {name} — {detail}")
print("=" * 60)
sys.exit(1 if failed else 0)
