"""小区合并 · 影响预览（SPEC community-merge-union §5.1）.

[拆分理由] 与 ``merger.py`` 主体（合并/解除合并事务流）分离：预览是**只读**接口，
不写任何行、不开事务，塞进写服务里容易让人误判它有副作用。

口径要点：
- 画像变化行与 ``merge_communities`` 共用 ``merge_community_profile`` 纯函数，
  「预览说补什么」与「实际补什么」结构上不可能漂移（AC-6/S10 断言）；
- 子档资产计数全部走分组聚合（每表一次查询），无 N+1。
"""

import logging

from sqlalchemy.orm import Session

from models.property import Community, CommunityAlias
from schemas.community import CommunityMergePreviewResponse
from services.market.community_profile_merge import PROFILE_FIELDS, merge_community_profile

logger = logging.getLogger(__name__)


class MergePreviewMixin:
    """合并影响预览（只读、零副作用）."""

    def preview_merge(
        self,
        primary_id: str,
        merge_ids: list[str],
        db: Session,
    ) -> CommunityMergePreviewResponse:
        """合并影响预览（只读、零副作用，SPEC §5.1 / Q3 已裁决为新增端点）.

        与 ``merge_communities`` **共用** ``merge_community_profile`` 纯函数，保证
        「预览说会补什么」与「实际补了什么」不可能漂移（AC-6/AC-10）。

        Args:
            primary_id: 主档小区 ID
            merge_ids: 待并入小区 ID 列表
            db: 数据库会话

        Returns:
            预览响应（画像变化行 + 子档资产 + 汇总计数 + 告警）

        Raises:
            ValueError: 主档或子档不存在/已归档（由 ``_validate_communities`` 抛）

        """
        from models import BdBuilding, BdEntryStatus, BdPendingEntry, CommunityCompetitor, CommunityImage
        from schemas.community import (
            CommunityMergeChildPreview,
            CommunityMergeCounts,
            CommunityMergeProfileItem,
            CommunitySearchResponse,
        )

        # 预览**不加行锁**（for_update=False）：本端点每次勾选都会触发，
        # 用读接口持住主档 + 全部子档的 FOR UPDATE 会挡住并发的真实合并，
        # 也违反「只读、零副作用」契约。校验规则与写路径完全一致。
        primary = self._validate_communities(primary_id, merge_ids, db, for_update=False)
        # 与 merge_communities 共用 _load_children 定序：预览与实际必须同序，
        # 否则「先到先得」会在两侧取到不同子档的值（AC-6 的反例）。
        children = self._load_children(merge_ids, db)

        primary_snapshot = {name: getattr(primary, name, None) for name in PROFILE_FIELDS}
        child_snapshots = [
            {**{name: getattr(child, name, None) for name in PROFILE_FIELDS}, "id": child.id} for child in children
        ]
        union = merge_community_profile(primary_snapshot, child_snapshots)

        profile_items = [
            CommunityMergeProfileItem(
                field=name,
                before=primary_snapshot[name],
                after=union.values[name],
                source=union.sources[name],
            )
            for name in PROFILE_FIELDS
        ]

        child_ids = [c.id for c in children]
        building_counts = self._group_counts(db, BdBuilding, BdBuilding.community_id, child_ids)
        room_counts = self._group_counts(db, BdBuilding, BdBuilding.community_id, child_ids, aggregate="room_count")
        image_counts = self._group_counts(
            db,
            CommunityImage,
            CommunityImage.community_id,
            child_ids,
            extra_filters=(CommunityImage.is_deleted.is_(False),),
        )
        pending_counts = self._group_counts(
            db,
            BdPendingEntry,
            BdPendingEntry.community_id,
            child_ids,
            extra_filters=(BdPendingEntry.status == BdEntryStatus.PENDING,),
        )
        # v101：与 get_competitors 同口径——预览计数只算未删除的竞品边，
        # 否则会把历史合并去重留下的 is_deleted 行算成「会随迁的边」。
        competitor_counts = self._group_counts(
            db,
            CommunityCompetitor,
            CommunityCompetitor.community_id,
            child_ids,
            extra_filters=(CommunityCompetitor.is_deleted.is_(False),),
        )
        archived_counts = self._group_counts(db, Community, Community.merged_into_id, child_ids)
        alias_counts = self._group_counts(
            db,
            CommunityAlias,
            CommunityAlias.community_id,
            child_ids,
            extra_filters=(CommunityAlias.is_deleted.is_(False),),
        )
        doc_counts = self._count_child_documents(child_ids, db)

        child_previews = [
            CommunityMergeChildPreview(
                id=c.id,
                name=c.name,
                building_count=building_counts.get(c.id, 0),
                room_count=room_counts.get(c.id, 0),
                linked_document_count=doc_counts.get(c.id, 0),
                image_count=image_counts.get(c.id, 0),
                open_pending_count=pending_counts.get(c.id, 0),
                competitor_edge_count=competitor_counts.get(c.id, 0),
                archived_children_count=archived_counts.get(c.id, 0),
                alias_count=alias_counts.get(c.id, 0),
            )
            for c in children
        ]

        counts = CommunityMergeCounts(
            properties=self._count_affected_properties(merge_ids, db),
            buildings=sum(building_counts.values()),
            rooms=sum(room_counts.values()),
            documents=sum(doc_counts.values()),
            images=sum(image_counts.values()),
            pending_entries=sum(pending_counts.values()),
            competitor_edges=sum(competitor_counts.values()),
            archived_children=sum(archived_counts.values()),
            aliases=sum(alias_counts.values()) + len(children),
        )

        return CommunityMergePreviewResponse(
            primary=CommunitySearchResponse(
                id=primary.id,
                name=primary.name,
                district=primary.district,
                business_circle=primary.business_circle,
            ),
            children=child_previews,
            profile=profile_items,
            counts=counts,
            warnings=union.warnings,
        )

    @staticmethod
    def _group_counts(
        db: Session,
        model: type,
        group_column: object,
        ids: list[str],
        *,
        aggregate: str | None = None,
        extra_filters: tuple = (),
    ) -> dict[str, int]:
        """按小区分组计数（可选 SUM 聚合），供预览使用（避免 N+1）."""
        from sqlalchemy import func

        if not ids:
            return {}
        column = getattr(model, aggregate) if aggregate else model.id
        expr = func.coalesce(func.sum(column), 0) if aggregate else func.count(column)
        rows = db.query(group_column, expr).filter(group_column.in_(ids), *extra_filters).group_by(group_column).all()
        return {str(cid): int(total or 0) for cid, total in rows if cid is not None}

    def _count_child_documents(self, child_ids: list[str], db: Session) -> dict[str, int]:
        """统计每个子档下的关联单据数（项目/线索/营销，与合并改指口径一致）."""
        from sqlalchemy import func

        if not child_ids:
            return {}
        result: dict[str, int] = dict.fromkeys(child_ids, 0)
        for model in self._DICT_DOC_MODELS:
            rows = (
                db.query(model.community_id, func.count(model.id))
                .filter(model.community_id.in_(child_ids))
                .group_by(model.community_id)
                .all()
            )
            for cid, count in rows:
                if cid is not None:
                    result[str(cid)] = result.get(str(cid), 0) + int(count or 0)
        return result
