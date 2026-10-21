"""BR-29 审核三场景修复 · 后端验收测试（2026-10-20）.

覆盖运营反馈的三类缺陷与本次实现口径：
1. 楼栋号尾部单个「号」自动归一（写入层统一收口，历史数据不清洗）；
2. 「用已有的」无目标时的降级、以及合并到「待审兄弟」条目（含并发锁序）；
3. 审核通过后的纠错改名（楼栋 / 户室 / 小区）。

[为何是 DB 集成测试而非纯单测] 三条链路的核心风险都在**事务与约束**上
（uq 冲突返回 409 而非 500、floor 派生列重算、FOR UPDATE 锁序、pending 转正），
纯函数单测无法覆盖；这里复用根 conftest 的 SAVEPOINT 隔离，测试数据随事务回滚。
"""

import threading
import uuid
from typing import Any

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker

from models import (
    BdBuilding,
    BdEntryStatus,
    BdPendingEntry,
    BdRoom,
    Community,
    CommunityAlias,
)
from schemas.building_dict import (
    BdBuildingRenameRequest,
    BdCommunityRenameRequest,
    BdPendingSubmitRequest,
    BdRoomRenameRequest,
)
from services.property.building_review_service import (
    BuildingReviewService,
    get_building_review_service,
    get_reviewer_roles,
)
from services.property.dict_submit_service import get_dict_submit_service
from services.property.dict_write_service import get_dict_write_service
from services.system.exceptions import ConflictError, ValidationError
from utils.building_dict import has_building_suffix, normalize_building_no

# ==================== 1. 归一函数（纯函数） ====================


# ⚠️ 样本表与前端 `src/lib/dict-display.cross-platform.test.ts` 的 SHARED_SAMPLES
# 严格一一对应（顺序也一致）—— BR-29 跨端一致性靠这两处对跑，改一处必须同步另一处。
@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("21号", "21"),
        ("金杨路660弄21号", "金杨路660弄21"),
        # 只剥单个「号」：语义后缀必须原样保留（剥「号楼」会让 2号楼 丢语义）
        ("2号楼", "2号楼"),
        ("单栋", "单栋"),
        ("A栋", "A栋"),
        ("3幢", "3幢"),
        ("5单元", "5单元"),
        # 无后缀原样
        ("21", "21"),
        ("惠园路2000弄01", "惠园路2000弄01"),
        # 回退保护：纯「号」剥完为空 → 保留原文（不给脏值造空串）
        ("号", "号"),
        # 空白折叠（含首尾与内部连续空白）
        ("  a  b  ", "a b"),
        ("  21号  ", "21"),
        # 空值
        ("", ""),
        (None, ""),
    ],
)
def test_normalize_building_no(raw: str | None, expected: str) -> None:
    """楼栋号归一：只剥尾部单个「号」+ 空白折叠 + 空值/空结果回退."""
    assert normalize_building_no(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("21号", True),
        ("2号楼", True),
        ("单栋", True),
        ("A栋", True),
        ("660弄", True),
        ("21", False),
        ("金杨路660弄21", False),
        ("", False),
        (None, False),
    ],
)
def test_has_building_suffix(raw: str | None, expected: bool) -> None:
    """展示层后缀感知（与前端 lib/dict-display.ts 同源）."""
    assert has_building_suffix(raw) is expected


def test_normalize_is_idempotent() -> None:
    """归一幂等：二次归一结果不变（改名/重放链路的安全前提）."""
    for raw in ("21号", "2号楼", "单栋", "号", "  a  b  "):
        once = normalize_building_no(raw)
        assert normalize_building_no(once) == once


def test_normalize_then_display_equals_plain_display() -> None:
    """「归一后展示」恒等于「直接展示」—— 这是历史数据不清洗仍正确的原因.

    与前端 dict-display.test.ts 的同名不变式一一对应。
    """

    def display(no: str) -> str:
        return no if has_building_suffix(no) else f"{no}号"

    for raw in ("金杨路660弄21号", "21号", "105号", "21", "2号楼", "单栋"):
        assert display(normalize_building_no(raw)) == display(raw)


# ==================== 测试夹具：字典数据 ====================


def _uid(prefix: str) -> str:
    """生成隔离名称（避免与开发库既有数据撞 uq）."""
    return f"__BR29_{prefix}_{uuid.uuid4().hex[:10]}__"


def _make_community(session: Session, name: str) -> Community:
    community = Community(
        id=str(uuid.uuid4()),
        name=name,
        district="浦东",
        business_circle="金杨",
        source="admin",
        is_active=True,
    )
    session.add(community)
    session.flush()
    return community


def _make_building(session: Session, community_id: str, no: str) -> BdBuilding:
    building = BdBuilding(community_id=community_id, building_no=no, room_count=0)
    session.add(building)
    session.flush()
    return building


def _make_room(session: Session, building_id: int, room_no: str, floor: int | None) -> BdRoom:
    room = BdRoom(building_id=building_id, room_no=room_no, floor=floor)
    session.add(room)
    session.flush()
    return room


def _submit_pending(
    session: Session,
    *,
    kind: str,
    name: str,
    parent_kind: str | None = None,
    parent_id: str | None = None,
    source_type: str | None = "admin",
) -> BdPendingEntry:
    """经录入端提交服务造一条 pending（走真实归一/唯一性逻辑）."""
    resp = get_dict_submit_service().submit(
        session,
        BdPendingSubmitRequest(
            kind=kind,
            name=name,
            parent_kind=parent_kind,
            parent_id=parent_id,
            source_type=source_type,
            source_id=str(uuid.uuid4()) if source_type else None,
        ),
        submitted_by=None,
        commit=False,
    )
    entry = session.get(BdPendingEntry, resp.pending_id)
    assert entry is not None
    return entry


def _operator(session: Session) -> Any:
    """取 admin 用户（seeded_db 已种）."""
    from models import User

    return session.query(User).filter(User.username == "admin").one()


def _resolve(
    session: Session,
    entry_id: int,
    *,
    action: str,
    target_id: str | None = None,
    target_kind: str | None = None,
    name: str | None = None,
) -> Any:
    from schemas.building_dict import BdReviewResolveRequest

    return get_building_review_service().resolve(
        session,
        entry_id=entry_id,
        body=BdReviewResolveRequest(
            action=action,
            target_id=target_id,
            target_kind=target_kind,
            name=name,
        ),
        operator=_operator(session),
        request=None,
    )


# ==================== 2. rename_building ====================


def test_rename_building_normalizes_and_audits(seeded_db: dict[str, Any]) -> None:
    """改名成功：落库值已归一（尾部「号」剥离）+ 返回旧名/新名."""
    session: Session = seeded_db["session"]
    community = _make_community(session, _uid("小区"))
    building = _make_building(session, community.id, "21")

    result = get_dict_write_service().rename_building(
        session,
        building.id,
        BdBuildingRenameRequest(building_no="金杨路660弄21号"),
        operator_id=str(_operator(session).id),
    )

    session.refresh(building)
    assert building.building_no == "金杨路660弄21"  # 已归一
    assert result.old_name == "21"
    assert result.new_name == "金杨路660弄21"


def test_rename_building_duplicate_returns_409_not_500(seeded_db: dict[str, Any]) -> None:
    """同小区同名 → ConflictError（409 语义），绝不能落到 IntegrityError 变 500."""
    session: Session = seeded_db["session"]
    community = _make_community(session, _uid("小区"))
    _make_building(session, community.id, "A栋")
    victim = _make_building(session, community.id, "B栋")

    with pytest.raises(ConflictError) as exc:
        get_dict_write_service().rename_building(
            session,
            victim.id,
            BdBuildingRenameRequest(building_no="A栋"),
            operator_id=str(_operator(session).id),
        )
    assert "已存在楼栋" in str(exc.value)
    # 断言未落库（事务未被污染）
    session.refresh(victim)
    assert victim.building_no == "B栋"


def test_rename_building_conflict_via_normalization(seeded_db: dict[str, Any]) -> None:
    """归一后才撞名同样 409（如「A栋」vs 输入「A栋号」→ 归一「A栋」）."""
    session: Session = seeded_db["session"]
    community = _make_community(session, _uid("小区"))
    _make_building(session, community.id, "A栋")
    victim = _make_building(session, community.id, "B")

    with pytest.raises(ConflictError):
        get_dict_write_service().rename_building(
            session,
            victim.id,
            BdBuildingRenameRequest(building_no="A栋号"),
            operator_id=str(_operator(session).id),
        )


def test_rename_building_promotes_matching_pending(seeded_db: dict[str, Any]) -> None:
    """撞同名 open pending → 自动转正（BR-26「视同 admin 确认」）."""
    session: Session = seeded_db["session"]
    community = _make_community(session, _uid("小区"))
    building = _make_building(session, community.id, "旧名")
    pending = _submit_pending(
        session,
        kind="building",
        name="新名",
        parent_kind="community",
        parent_id=community.id,
    )
    assert pending.status == BdEntryStatus.PENDING

    get_dict_write_service().rename_building(
        session,
        building.id,
        BdBuildingRenameRequest(building_no="新名"),
        operator_id=str(_operator(session).id),
    )

    session.refresh(pending)
    session.refresh(building)
    assert building.building_no == "新名"
    assert pending.status == BdEntryStatus.CREATED
    # 转正后指向该实表楼栋
    assert pending.resolved_target_id == str(building.id)


def test_rename_building_noop_returns_without_audit(seeded_db: dict[str, Any]) -> None:
    """同名（含仅量词差异归一后相同）→ 幂等返回，不报错."""
    session: Session = seeded_db["session"]
    community = _make_community(session, _uid("小区"))
    building = _make_building(session, community.id, "21")

    result = get_dict_write_service().rename_building(
        session,
        building.id,
        BdBuildingRenameRequest(building_no="21号"),  # 归一后 == "21"
        operator_id=str(_operator(session).id),
    )
    assert result.success is True
    session.refresh(building)
    assert building.building_no == "21"


# ==================== 3. rename_room ====================


def test_rename_room_recomputes_derived_floor(seeded_db: dict[str, Any]) -> None:
    """户室改名 0401→0501 后 floor 必须由 4 变 5（派生列重算，否则楼层分组静默错位）."""
    session: Session = seeded_db["session"]
    community = _make_community(session, _uid("小区"))
    building = _make_building(session, community.id, "1")
    room = _make_room(session, building.id, "0401", floor=4)

    result = get_dict_write_service().rename_room(
        session,
        building.id,
        room.id,
        BdRoomRenameRequest(room_no="0501"),
        operator_id=str(_operator(session).id),
    )

    session.refresh(room)
    assert room.room_no == "0501"
    assert room.floor == 5
    assert "4 → 5" in result.message


def test_rename_room_to_nonstandard_clears_floor(seeded_db: dict[str, Any]) -> None:
    """改成非标户室号 → floor 归 NULL（进「楼层待定」组，BR-02）."""
    session: Session = seeded_db["session"]
    community = _make_community(session, _uid("小区"))
    building = _make_building(session, community.id, "1")
    room = _make_room(session, building.id, "0401", floor=4)

    get_dict_write_service().rename_room(
        session,
        building.id,
        room.id,
        BdRoomRenameRequest(room_no="0233-1"),
        operator_id=str(_operator(session).id),
    )

    session.refresh(room)
    assert room.room_no == "0233-1"
    assert room.floor is None


def test_rename_room_duplicate_returns_409(seeded_db: dict[str, Any]) -> None:
    """同楼栋同名 → ConflictError（409），未落库."""
    session: Session = seeded_db["session"]
    community = _make_community(session, _uid("小区"))
    building = _make_building(session, community.id, "1")
    _make_room(session, building.id, "0401", floor=4)
    victim = _make_room(session, building.id, "0402", floor=4)

    with pytest.raises(ConflictError):
        get_dict_write_service().rename_room(
            session,
            building.id,
            victim.id,
            BdRoomRenameRequest(room_no="0401"),
            operator_id=str(_operator(session).id),
        )
    session.refresh(victim)
    assert victim.room_no == "0402"


def test_rename_room_cross_building_returns_404(seeded_db: dict[str, Any]) -> None:
    """Room 不属于该 building → ResourceNotFound（防跨楼栋误改）."""
    from services.system.exceptions import ResourceNotFoundError

    session: Session = seeded_db["session"]
    community = _make_community(session, _uid("小区"))
    b1 = _make_building(session, community.id, "1")
    b2 = _make_building(session, community.id, "2")
    room = _make_room(session, b1.id, "0401", floor=4)

    with pytest.raises(ResourceNotFoundError):
        get_dict_write_service().rename_room(
            session,
            b2.id,
            room.id,
            BdRoomRenameRequest(room_no="0402"),
            operator_id=str(_operator(session).id),
        )


# ==================== 4. rename_community ====================


def test_rename_community_deposits_old_name_as_alias(seeded_db: dict[str, Any]) -> None:
    """旧名写入 community_aliases(data_source='rename_operation')."""
    session: Session = seeded_db["session"]
    old_name = _uid("小区原名")
    new_name = _uid("小区新名")
    community = _make_community(session, old_name)

    get_dict_write_service().rename_community(
        session,
        community.id,
        BdCommunityRenameRequest(name=new_name),
        operator_id=str(_operator(session).id),
    )

    session.refresh(community)
    assert community.name == new_name
    alias = (
        session.query(CommunityAlias)
        .filter(
            CommunityAlias.community_id == community.id,
            CommunityAlias.alias_name == old_name,
        )
        .one_or_none()
    )
    assert alias is not None, "旧名未沉淀为别名 → 改名后旧名搜不到"
    assert alias.data_source == get_dict_write_service().RENAME_ALIAS_SOURCE
    assert alias.is_deleted is False


def test_rename_community_old_name_still_searchable(seeded_db: dict[str, Any]) -> None:
    """旧名搜索仍命中（走读服务 keyword 的别名分支）——别名真实生效，不只落库."""
    from services.property.dict_read_service import BuildingDictReadService

    session: Session = seeded_db["session"]
    old_name = _uid("旧名可搜")
    new_name = _uid("新名展示")
    community = _make_community(session, old_name)

    get_dict_write_service().rename_community(
        session,
        community.id,
        BdCommunityRenameRequest(name=new_name),
        operator_id=str(_operator(session).id),
    )

    resp = BuildingDictReadService().query_communities(session, keyword=old_name, page=1, page_size=10)
    assert [c.id for c in resp.items] == [community.id], "改名后旧名检索不到（消费方未生效）"


def test_rename_community_duplicate_returns_409(seeded_db: dict[str, Any]) -> None:
    """改名撞其他小区 → ConflictError（409）."""
    session: Session = seeded_db["session"]
    taken = _uid("已被占用")
    _make_community(session, taken)
    mover = _make_community(session, _uid("待改名"))

    with pytest.raises(ConflictError):
        get_dict_write_service().rename_community(
            session,
            mover.id,
            BdCommunityRenameRequest(name=taken),
            operator_id=str(_operator(session).id),
        )


def test_rename_community_to_archived_name_returns_409(seeded_db: dict[str, Any]) -> None:
    """改名到「已归档（已合并）」小区占用的名字 → 409（否则解除合并时会撞全库唯一）."""
    session: Session = seeded_db["session"]
    archived_name = _uid("已归档")
    archived = Community(
        id=str(uuid.uuid4()),
        name=archived_name,
        is_active=False,
        source="admin",
    )
    session.add(archived)
    session.flush()
    mover = _make_community(session, _uid("待改名"))

    with pytest.raises(ConflictError) as exc:
        get_dict_write_service().rename_community(
            session,
            mover.id,
            BdCommunityRenameRequest(name=archived_name),
            operator_id=str(_operator(session).id),
        )
    assert "已归档" in str(exc.value)


def test_rename_archived_community_returns_409(seeded_db: dict[str, Any]) -> None:
    """给已合并归档的小区改名 → 409（改了主档视角也看不见，会形成静默脏数据）."""
    session: Session = seeded_db["session"]
    archived = Community(id=str(uuid.uuid4()), name=_uid("子档"), is_active=False, source="admin")
    session.add(archived)
    session.flush()

    with pytest.raises(ConflictError):
        get_dict_write_service().rename_community(
            session,
            archived.id,
            BdCommunityRenameRequest(name=_uid("新名")),
            operator_id=str(_operator(session).id),
        )


# ==================== 5. _merge_into_pending_sibling ====================


def _two_pending_buildings(session: Session) -> tuple[Community, BdPendingEntry, BdPendingEntry]:
    """同小区下造两条待审楼栋（模拟重复提交）."""
    community = _make_community(session, _uid("合并小区"))
    entry_a = _submit_pending(session, kind="building", name="8号楼", parent_kind="community", parent_id=community.id)
    entry_b = _submit_pending(session, kind="building", name="9号楼", parent_kind="community", parent_id=community.id)
    return community, entry_a, entry_b


def test_merge_into_pending_sibling_promotes_target(seeded_db: dict[str, Any]) -> None:
    """合并到待审兄弟：目标被转正、本条目 merged 且指向同一实表 id."""
    session: Session = seeded_db["session"]
    community, entry_a, entry_b = _two_pending_buildings(session)

    resp = _resolve(session, entry_b.id, action="merge", target_id=str(entry_a.id), target_kind="pending")
    assert resp.success is True

    session.refresh(entry_a)
    session.refresh(entry_b)
    assert entry_a.status == BdEntryStatus.CREATED
    assert entry_b.status == BdEntryStatus.MERGED
    assert entry_b.resolved_target_id == entry_a.resolved_target_id

    promoted = session.query(BdBuilding).filter(BdBuilding.community_id == community.id).one()
    assert promoted.building_no == "8号楼"
    assert entry_a.resolved_target_id == str(promoted.id)


def test_merge_into_pending_sibling_kind_mismatch_returns_400(seeded_db: dict[str, Any]) -> None:
    """Kind 不一致（楼栋 ← 户室）→ ValidationError（400）."""
    session: Session = seeded_db["session"]
    community = _make_community(session, _uid("错kind"))
    building = _make_building(session, community.id, "1")
    room_pending = _submit_pending(
        session, kind="room", name="0401", parent_kind="building", parent_id=str(building.id)
    )
    building_pending = _submit_pending(
        session, kind="building", name="2", parent_kind="community", parent_id=community.id
    )

    with pytest.raises(ValidationError) as exc:
        _resolve(
            session,
            building_pending.id,
            action="merge",
            target_id=str(room_pending.id),
            target_kind="pending",
        )
    assert "类型" in str(exc.value)


def test_merge_into_pending_sibling_cross_community_returns_400(seeded_db: dict[str, Any]) -> None:
    """归属小区不一致 → ValidationError（400）——否则单据会落成跨小区脏关联."""
    session: Session = seeded_db["session"]
    c1 = _make_community(session, _uid("小区A"))
    c2 = _make_community(session, _uid("小区B"))
    entry_a = _submit_pending(session, kind="building", name="8号楼", parent_kind="community", parent_id=c1.id)
    entry_b = _submit_pending(session, kind="building", name="8号楼", parent_kind="community", parent_id=c2.id)

    with pytest.raises(ValidationError) as exc:
        _resolve(session, entry_b.id, action="merge", target_id=str(entry_a.id), target_kind="pending")
    assert "同一小区" in str(exc.value)


def test_merge_into_self_returns_400(seeded_db: dict[str, Any]) -> None:
    """自合并 → ValidationError（400）."""
    session: Session = seeded_db["session"]
    _community, entry_a, _ = _two_pending_buildings(session)

    with pytest.raises(ValidationError) as exc:
        _resolve(session, entry_a.id, action="merge", target_id=str(entry_a.id), target_kind="pending")
    assert "合并到自己" in str(exc.value)


def test_merge_into_non_pending_target_returns_409(seeded_db: dict[str, Any]) -> None:
    """目标已非 pending → ConflictError（409，并发已处理）."""
    session: Session = seeded_db["session"]
    _community, entry_a, entry_b = _two_pending_buildings(session)
    # 先让 A 转正
    _resolve(session, entry_a.id, action="create")

    with pytest.raises(ConflictError) as exc:
        _resolve(session, entry_b.id, action="merge", target_id=str(entry_a.id), target_kind="pending")
    assert "已被处理" in str(exc.value)


def test_merge_into_pending_sibling_concurrent_only_one_wins() -> None:
    """并发两请求合并到同一目标 → 只有一个成功（验 FOR UPDATE 锁序）.

    ⚠️ 测试基建约束（必须独立连接）：根 conftest 的 SAVEPOINT 隔离把每条用例包在
    **单连接事务**里，跨线程共用同一连接会互相打断（实测 ``OperationalError`` /
    ``IntegrityError``）—— 那验证不了行锁。本用例因此**完全自理**：独立 Engine +
    独立 Session + 自建 admin 用户 + 手工清理，不复用 ``seeded_db``（其数据在未提交
    事务里，另一条连接根本看不见）。

    断言：两条并发「合并到同一目标」请求必须一成功一 409，且目标楼栋**只被转正一次**
    （字典 1 行）。若 ``FOR UPDATE`` 缺失，两者会双双转正 → 撞 ``uq_bd_building_no``
    → 500 且可能插出重复行。
    """
    from sqlalchemy import create_engine

    from conftest import _get_test_database_url
    from models import Role, User
    from schemas.building_dict import BdPendingSubmitRequest, BdReviewResolveRequest
    from services.property.dict_submit_service import get_dict_submit_service
    from utils.auth import get_password_hash

    engine = create_engine(_get_test_database_url(), pool_size=5, max_overflow=5)
    maker = sessionmaker(bind=engine)
    tag = uuid.uuid4().hex[:10]
    created_ids: list[int] = []
    community_id: str | None = None
    operator_id: str | None = None

    created_role_id: str | None = None
    setup = maker()
    try:
        # 独立连接看不到 conftest 未提交的种子 → 自建角色/用户（admin code 满足审核权限）
        role = setup.query(Role).filter(Role.code == "admin").one_or_none()
        if role is None:
            role = Role(code="admin", name="管理员")
            setup.add(role)
            setup.flush()
            # 独立连接自己建的角色必须自己收拾 —— 否则 roles_name_key 冲突会让
            # 后续所有依赖 conftest 种子的用例在 setup 阶段炸掉（实测 10 条 ERROR）
            created_role_id = role.id
        operator_id = str(uuid.uuid4())
        setup.add(
            User(
                id=operator_id,
                username=f"br29op{tag}",
                password=get_password_hash(f"pw-{tag}"),
                nickname="br29op",
                role_id=role.id,
                status="active",
            )
        )
        community_id = str(uuid.uuid4())
        setup.add(
            Community(
                id=community_id,
                name=f"__BR29_CONC_{tag}__",
                district="浦东",
                business_circle="并发",
                source="admin",
                is_active=True,
            )
        )
        setup.flush()
        svc = get_dict_submit_service()
        created_ids.extend(
            svc.submit(
                setup,
                BdPendingSubmitRequest(
                    kind="building",
                    name=no,
                    parent_kind="community",
                    parent_id=community_id,
                    source_type="admin",
                    source_id=str(uuid.uuid4()),
                ),
                commit=False,
            ).pending_id
            for no in ("8号楼", "9号楼", "10号楼")
        )
        setup.commit()
    finally:
        setup.close()

    target_id, source_ids = created_ids[0], created_ids[1:]
    outcomes: list[str] = []
    lock = threading.Lock()
    start = threading.Barrier(len(source_ids))

    def _worker(entry_id: int) -> None:
        db2 = maker()
        try:
            operator = db2.get(User, operator_id)
            start.wait(timeout=30)
            get_building_review_service().resolve(
                db2,
                entry_id=entry_id,
                body=BdReviewResolveRequest(action="merge", target_id=str(target_id), target_kind="pending"),
                operator=operator,
                request=None,
            )
            with lock:
                outcomes.append("ok")
        except ConflictError:
            with lock:
                outcomes.append("conflict")
        except Exception as exc:
            with lock:
                outcomes.append(f"error:{type(exc).__name__}")
        finally:
            db2.close()

    threads = [threading.Thread(target=_worker, args=(sid,)) for sid in source_ids]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)

    try:
        assert sorted(outcomes) == ["conflict", "ok"], f"并发结果异常: {outcomes}"
        verify = maker()
        try:
            assert verify.query(BdBuilding).filter(BdBuilding.community_id == community_id).count() == 1, (
                "目标被重复转正（FOR UPDATE 锁序失效）"
            )
            assert verify.get(BdPendingEntry, target_id).status == BdEntryStatus.CREATED
        finally:
            verify.close()
    finally:
        cleanup = maker()
        try:
            cleanup.execute(
                text("DELETE FROM bd_pending_references WHERE pending_id = ANY(:ids)"),
                {"ids": created_ids},
            )
            cleanup.execute(text("DELETE FROM bd_pending_entries WHERE id = ANY(:ids)"), {"ids": created_ids})
            cleanup.execute(text("DELETE FROM bd_buildings WHERE community_id = :cid"), {"cid": community_id})
            cleanup.execute(text("DELETE FROM communities WHERE id = :cid"), {"cid": community_id})
            cleanup.execute(text("DELETE FROM users WHERE id = :uid"), {"uid": operator_id})
            if created_role_id is not None:
                cleanup.execute(text("DELETE FROM roles WHERE id = :rid"), {"rid": created_role_id})
            cleanup.commit()
        finally:
            cleanup.close()
            engine.dispose()


# ==================== 6. _resolve_create 名称归一 ====================


def test_resolve_create_without_name_still_normalizes(seeded_db: dict[str, Any]) -> None:
    """回归「21号号」：不传 name 但原文带「号」→ 落库已去「号」.

    这是运营反馈的**原始现象**：系统「自动加号」实际是展示层叠加，
    审核员不手改时如果只对 override 分支归一，原文会原样落库并拼成「21号号」。
    """
    session: Session = seeded_db["session"]
    community = _make_community(session, _uid("create归一"))
    pending = _submit_pending(
        session,
        kind="building",
        name="金杨路660弄21号",
        parent_kind="community",
        parent_id=community.id,
    )

    resp = _resolve(session, pending.id, action="create")

    assert resp.resolved_name == "金杨路660弄21"
    assert resp.name_normalized_from == "金杨路660弄21号"
    session.expire_all()
    assert session.query(BdBuilding).filter(BdBuilding.community_id == community.id).one().building_no == (
        "金杨路660弄21"
    )


def test_resolve_create_with_overridden_name(seeded_db: dict[str, Any]) -> None:
    """传 name → 按修正值落库，且 entry.name 回写保持一致（列表/字典不脱节）."""
    session: Session = seeded_db["session"]
    community = _make_community(session, _uid("create改名"))
    pending = _submit_pending(session, kind="building", name="待改名", parent_kind="community", parent_id=community.id)

    resp = _resolve(session, pending.id, action="create", name="金杨路660弄22号")

    assert resp.resolved_name == "金杨路660弄22"
    session.expire_all()
    refreshed = session.get(BdPendingEntry, pending.id)
    assert refreshed is not None
    assert refreshed.name == "金杨路660弄22", "entry.name 未回写 → 审核池历史与字典行脱节"


def test_resolve_create_with_empty_name_returns_400(seeded_db: dict[str, Any]) -> None:
    """传 name 为空串 → ValidationError（400）.

    注：Schema 层 ``min_length=1`` 已拦空串，这里**直接调 service** 验证业务层
    兜底（脚本/内部调用绕过 schema 时同样安全）。
    """
    session: Session = seeded_db["session"]
    community = _make_community(session, _uid("空名"))
    pending = _submit_pending(session, kind="building", name="有名字", parent_kind="community", parent_id=community.id)

    with pytest.raises(ValidationError) as exc:
        _resolve(session, pending.id, action="create", name="   ")
    assert "不能为空" in str(exc.value)


def test_resolve_create_name_collides_with_existing_building(seeded_db: dict[str, Any]) -> None:
    """修正后撞同小区已有楼栋 → 幂等并入已有行（BR-26 口径），不报 500."""
    session: Session = seeded_db["session"]
    community = _make_community(session, _uid("撞名并入"))
    existing = _make_building(session, community.id, "8号楼")
    pending = _submit_pending(
        session, kind="building", name="8号楼-重复", parent_kind="community", parent_id=community.id
    )

    resp = _resolve(session, pending.id, action="create", name="8号楼")

    assert resp.success is True
    session.expire_all()
    assert session.query(BdBuilding).filter(BdBuilding.community_id == community.id).count() == 1
    refreshed = session.get(BdPendingEntry, pending.id)
    assert refreshed is not None
    assert refreshed.resolved_target_id == str(existing.id)


def test_resolve_merge_name_is_ignored(seeded_db: dict[str, Any]) -> None:
    """Merge 传 name 被忽略（改名只属于「确认新增」语义），落库名不变."""
    session: Session = seeded_db["session"]
    community = _make_community(session, _uid("merge忽略名"))
    existing = _make_building(session, community.id, "8号楼")
    pending = _submit_pending(session, kind="building", name="8号楼", parent_kind="community", parent_id=community.id)

    _resolve(session, pending.id, action="merge", target_id=str(existing.id), name="不该生效的名字")

    session.refresh(existing)
    assert existing.building_no == "8号楼"
    refreshed = session.get(BdPendingEntry, pending.id)
    assert refreshed is not None
    assert refreshed.status == BdEntryStatus.MERGED


# ==================== 7. 补录路径归一 ====================


def test_admin_create_buildings_normalizes(seeded_db: dict[str, Any]) -> None:
    """Admin 补录同样收口：输入「21号」落库「21」."""
    from schemas.building_dict import BdBuildingCreateRequest

    session: Session = seeded_db["session"]
    community = _make_community(session, _uid("补录归一"))

    get_dict_write_service().create_buildings(
        session,
        BdBuildingCreateRequest(community_id=community.id, building_no="21号"),
        operator_id=str(_operator(session).id),
    )

    session.expire_all()
    nos = [b.building_no for b in session.query(BdBuilding).filter(BdBuilding.community_id == community.id).all()]
    assert nos == ["21"]


def test_admin_create_buildings_dedupes_after_normalization(seeded_db: dict[str, Any]) -> None:
    """区间展开后归一可能产生重复值（如同时给「21」「21号」）→ 去重保序，added 不虚高."""
    from schemas.building_dict import BdBuildingCreateRequest

    session: Session = seeded_db["session"]
    community = _make_community(session, _uid("补录去重"))

    # 单值路径：同一批里不会有重复，这里验证「先归一 vs 已有」的正确跳过
    get_dict_write_service().create_buildings(
        session,
        BdBuildingCreateRequest(community_id=community.id, building_no="21号"),
        operator_id=str(_operator(session).id),
    )
    result = get_dict_write_service().create_buildings(
        session,
        BdBuildingCreateRequest(community_id=community.id, building_no="21"),
        operator_id=str(_operator(session).id),
    )

    assert result.added == 0, "归一后应命中已有楼栋并跳过，而不是插出第二行"
    assert result.skipped == 1


# ==================== 8. 审核处理人权限（回归保护） ====================


def test_reviewer_roles_default_is_admin(seeded_db: dict[str, Any]) -> None:
    """默认审核处理人角色为 ['admin']（配置缺失时的兜底，回归保护）."""
    session: Session = seeded_db["session"]
    assert "admin" in get_reviewer_roles(session)


def test_merge_into_pending_requires_reviewer_role(seeded_db: dict[str, Any]) -> None:
    """非配置处理角色走合并到待审兄弟 → PermissionDeniedError（403）."""
    from models import User
    from services.system.exceptions import PermissionDeniedError

    session: Session = seeded_db["session"]
    _community, entry_a, entry_b = _two_pending_buildings(session)
    normal = session.query(User).filter(User.username == "normal").first()
    if normal is None:  # 兜底：某些种子不含 normal 用户时跳过（显式跳过而非静默通过）
        pytest.skip("种子数据无 normal 用户，权限分支未覆盖")

    from schemas.building_dict import BdReviewResolveRequest

    with pytest.raises(PermissionDeniedError):
        BuildingReviewService().resolve(
            session,
            entry_id=entry_b.id,
            body=BdReviewResolveRequest(action="merge", target_id=str(entry_a.id), target_kind="pending"),
            operator=normal,
            request=None,
        )


# ==================== 9. 存量数据体检（运维扫描口径，只读） ====================


def test_legacy_building_no_scan_is_read_only(seeded_db: dict[str, Any]) -> None:
    """存量「X号」扫描口径（运维 R1 用）：只统计不修改，且展示层不冲突.

    断言的是**口径本身**（归一不改变展示），而非具体行数 —— 行数随环境变化。
    """
    session: Session = seeded_db["session"]
    raw = session.execute(text("SELECT count(*) FROM bd_buildings WHERE building_no ~ '号$'")).scalar_one()
    assert isinstance(raw, int)
    # 扫描不改数据：开发库行数在事务外不可见（SAVEPOINT 隔离），这里只验证 SQL 可执行
    normalized = session.execute(
        text("SELECT count(*) FROM bd_buildings WHERE regexp_replace(building_no, '号$', '') = ''")
    ).scalar_one()
    assert normalized == 0, "存在剥完为空的脏楼栋号（「号」），归一依赖回退保护"
