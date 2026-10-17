"""审核池队列查询（FR-11，从 building_review_service 拆分以满足单文件 ≤500 行）."""

import logging

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import BdEntryStatus, BdPendingEntry, BdReferenceStatus, User
from schemas.building_dict import BdReviewKpi, BdReviewListItem

logger = logging.getLogger(__name__)


def list_review_queue(
    db: Session,
    *,
    status: str | None = None,
    community_id: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[int, list[BdReviewListItem], BdReviewKpi]:
    """审核池队列（提交时间倒序 + 状态/小区筛选 + KPI）.

    Returns:
        (total, items, kpi)

    """
    query = db.query(BdPendingEntry)
    if status:
        query = query.filter(BdPendingEntry.status == status)
    if community_id:
        query = query.filter(BdPendingEntry.community_id == community_id)
    total = query.count()
    entries = query.order_by(BdPendingEntry.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    # KPI（FR-11：待审核/已处理/累计合并/累计驳回）
    pending_count = (
        db.query(func.count(BdPendingEntry.id)).filter(BdPendingEntry.status == BdEntryStatus.PENDING).scalar() or 0
    )
    processed_count = (
        db.query(func.count(BdPendingEntry.id))
        .filter(BdPendingEntry.status.in_((BdEntryStatus.CREATED, BdEntryStatus.MERGED, BdEntryStatus.REJECTED)))
        .scalar()
        or 0
    )
    merged_count = (
        db.query(func.count(BdPendingEntry.id)).filter(BdPendingEntry.status == BdEntryStatus.MERGED).scalar() or 0
    )
    rejected_count = (
        db.query(func.count(BdPendingEntry.id)).filter(BdPendingEntry.status == BdEntryStatus.REJECTED).scalar() or 0
    )

    # 提交人姓名
    submitter_ids = [e.submitted_by for e in entries if e.submitted_by]
    users = {u.id: u for u in db.query(User).filter(User.id.in_(submitter_ids)).all()} if submitter_ids else {}

    # 小区名（楼栋/户室条目小区列展示用；community 条目自身 name 即小区名）
    from models import Community

    comm_ids = {e.community_id for e in entries if e.community_id}
    comm_names = (
        {c.id: c.name for c in db.query(Community).filter(Community.id.in_(comm_ids)).all()} if comm_ids else {}
    )

    items = [
        BdReviewListItem(
            id=e.id,
            kind=e.kind.value if e.kind else "community",
            name=e.name,
            community_id=e.community_id,
            community_name=(
                comm_names.get(e.community_id)
                if e.community_id
                else (e.name if e.kind and e.kind.value == "community" else None)
            ),
            parent_kind=e.parent_kind.value if e.parent_kind else None,
            parent_id=e.parent_id,
            payload=e.payload,
            source_type=e.source_type,
            source_id=e.source_id,
            submitted_by=e.submitted_by,
            submitter_name=(users[e.submitted_by].nickname if e.submitted_by and e.submitted_by in users else None),
            status=e.status.value if e.status else "pending",
            created_at=e.created_at,
            # H3：口径为「待回填」引用数（原 len(e.references) 含 resolved，运营看到的是
            # 历史累计而非待处理量，与列名语义不符）
            reference_count=sum(1 for r in e.references or [] if r.status == BdReferenceStatus.OPEN),
        )
        for e in entries
    ]
    kpi = BdReviewKpi(
        pending=int(pending_count),
        processed=int(processed_count),
        merged_total=int(merged_count),
        rejected_total=int(rejected_count),
    )
    return total, items, kpi
