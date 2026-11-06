"""E2E: 线索小区匹配的合并链循环安全与 community_id 类型防御.

覆盖两个 code-review 项：

1. ``LeadService._resolve_community_by_name`` 沿 ``merged_into_id`` 追主档时，
   自指/双向环必须返回 ``None`` 而不是死循环或返回环内节点；多级链应追到最终主档。
2. 绕过 Pydantic 直接构造 ``LeadCreate`` 传入数字型 ``community_id`` 时，
   ``create_lead`` 也必须按字符串查询并落库，不能静默匹配失败。

命令: cd backend && .venv/bin/python tests/e2e/test_lead_community_resolution_edges.py
"""

from __future__ import annotations

import uuid
import warnings

from db import SessionLocal
from models import Community, Lead, User
from schemas.lead import LeadCreate
from services.leads.core import LeadService

PASSED: list[bool] = []


def check(name: str, actual: object, expected: object) -> None:
    """记录并打印一条断言."""
    ok = actual == expected
    PASSED.append(ok)
    print(f"  {'✓' if ok else '✗'} {name}: {actual!r}" + ("" if ok else f"（期望 {expected!r}）"))


def main() -> None:
    """执行循环链、多级链与数字 ID 防御验证，并清理造数."""
    prefix = f"__E2E_RESOLVE_EDGE_{uuid.uuid4().hex[:8]}__"
    db = SessionLocal()
    created_community_ids: list[str] = []
    created_lead_ids: list[str] = []
    try:
        # ---- 1. 自指 / 双向环 / 多级链 ----
        self_cycle = Community(id=str(uuid.uuid4()), name=f"{prefix}自指", is_active=True)
        cycle_a = Community(id=str(uuid.uuid4()), name=f"{prefix}环A", is_active=True)
        cycle_b = Community(id=str(uuid.uuid4()), name=f"{prefix}环B", is_active=True)
        chain_a = Community(id=str(uuid.uuid4()), name=f"{prefix}链A", is_active=False)
        chain_b = Community(id=str(uuid.uuid4()), name=f"{prefix}链B", is_active=False)
        chain_c = Community(
            id=str(uuid.uuid4()),
            name=f"{prefix}链C",
            district="区C",
            business_circle="商圈C",
            is_active=True,
        )
        communities = [self_cycle, cycle_a, cycle_b, chain_a, chain_b, chain_c]
        db.add_all(communities)
        db.commit()
        created_community_ids = [item.id for item in communities]

        self_cycle.merged_into_id = self_cycle.id
        cycle_a.merged_into_id = cycle_b.id
        cycle_b.merged_into_id = cycle_a.id
        chain_a.merged_into_id = chain_b.id
        chain_b.merged_into_id = chain_c.id
        db.commit()

        service = LeadService(db)
        check("1.1 自指链返回 None", service._resolve_community_by_name(self_cycle.name), None)
        check("1.2 双向环返回 None", service._resolve_community_by_name(cycle_a.name), None)
        resolved = service._resolve_community_by_name(chain_a.name)
        check("1.3 多级链追到最终主档", resolved.name if resolved else None, chain_c.name)
        check("1.4 最终主档区域可用的商圈", resolved.business_circle if resolved else None, "商圈C")

        # ---- 2. 数字型 community_id 防御 ----
        numeric_id = "123456789012345678901234567890123456"
        numeric_community = Community(
            id=numeric_id,
            name=f"{prefix}数字ID小区",
            district="区N",
            business_circle="商圈N",
            is_active=True,
        )
        db.add(numeric_community)
        db.commit()
        created_community_ids.append(numeric_id)

        admin = db.query(User).first()
        if admin is None:
            msg = "缺少用户数据，无法验证 create_lead"
            raise SystemExit(msg)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            lead_data = LeadCreate.model_construct(
                community_name=numeric_community.name,
                community_id=int(numeric_id),
                layout="1室1厅",
                floor_info="1/6",
                area=88.0,
            )
            lead = service.create_lead(lead_data, creator_id=admin.id)
        created_lead_ids.append(lead.id)
        check("2.1 数字 ID 转换为字符串后匹配", lead.community_id, numeric_id)
        check("2.2 落库类型为 str", type(lead.community_id).__name__, "str")
    finally:
        db.rollback()
        if created_lead_ids:
            db.query(Lead).filter(Lead.id.in_(created_lead_ids)).delete(synchronize_session=False)
        if created_community_ids:
            db.query(Community).filter(Community.id.in_(created_community_ids)).delete(synchronize_session=False)
        db.commit()
        db.close()

    passed = sum(PASSED)
    print(f"\n结果：{passed}/{len(PASSED)} 通过")
    if passed != len(PASSED):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
