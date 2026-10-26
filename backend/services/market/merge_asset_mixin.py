"""小区合并 · 资产随迁与对称回迁（SPEC community-merge-union §4.2-4.5/§4.7）.

[拆分理由] ``merger.py`` 因本次「取最大合集」修复新增约 700 行（画像并集、户型图/
待审条目/竞品边随迁 + 三者解除合并回迁），总量破 1200 行，超 AGENTS「单文件 >500 行
必须拆分」。本模块以 Mixin 承载「子档附属数据改指主档 / 按 origin 回迁」这一组同质
能力，与宿主 ``CommunityMerger`` 共享事务边界（**全部方法内禁止 commit**，由宿主
统一提交），行为与拆分前完全一致。

口径要点（详见各方法 docstring）：
- 画像并集：主档非空值永不覆盖（D1），判定规则收敛在纯函数
  ``community_profile_merge.merge_community_profile``，与预览端点共用；
- 户型图：撞 ``uq_community_image_url`` 的那条改挂后软删，解除合并时复活（D6）；
- 待审条目：撞 ``uq_pending_open`` 时引用账本改挂 + 本条置 merged，避免整笔回滚；
- 竞品边：owner 侧记 origin 可逆，引用侧不记（SPEC §9 L3）；自环与重复边删除。
"""

import logging
from dataclasses import replace
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from models.property import Community
from services.market.community_profile_merge import PROFILE_FIELDS, ProfileUnion, merge_community_profile

logger = logging.getLogger(__name__)


class MergeAssetMixin:
    """子档附属数据（画像/户型图/待审条目/竞品边）随主档收敛与回迁."""

    def _merge_community_profile(
        self,
        primary: Community,
        children: list[Community],
    ) -> ProfileUnion:
        """把子档画像并入主档（SPEC D1：主档非空值永不覆盖）.

        判定规则全部收敛在纯函数 ``merge_community_profile``，与合并预览端点共用，
        避免「预览说补 3 项、实际补 5 项」的漂移。

        **子档行一个字节都不改**——这是解除合并后子档画像原样还在（AC-5）的前提。

        Args:
            primary: 主档小区
            children: 子档小区列表（按 merge_ids 顺序）

        Returns:
            并集结果（``filled`` 为实际写入的字段）；额外挂 ``before`` / ``after``
            两个快照 dict 供审计使用。**快照必须在本方法内取**：主档对象是
            就地改写的，调用方事后再 ``getattr`` 只会读到新值，审计就会出现
            「before == after」的假留痕（实施期实测踩过）。

        """
        primary_snapshot = {name: getattr(primary, name, None) for name in PROFILE_FIELDS}
        child_snapshots = [
            {**{name: getattr(child, name, None) for name in PROFILE_FIELDS}, "id": child.id} for child in children
        ]
        result = merge_community_profile(primary_snapshot, child_snapshots)

        for name in result.filled:
            setattr(primary, name, result.values[name])
        if result.filled:
            primary.updated_at = datetime.now(timezone.utc)
            logger.info(
                "小区合并：主档 %s 补入画像 %s",
                primary.id,
                ", ".join(result.filled),
            )
        if result.warnings:
            logger.warning("小区合并：画像并集告警 %s", result.warnings)
        # 审计快照：只记被补入的字段。before 必须取**改写前**的 primary_snapshot —
        # 主档对象在这里被就地改过，事后再 getattr 只会读到新值。
        # ProfileUnion 是 frozen dataclass，用 replace 产出新实例。
        return replace(
            result,
            before={name: primary_snapshot[name] for name in result.filled},
            after={name: result.values[name] for name in result.filled},
        )

    def _migrate_pending_entries(
        self,
        primary: Community,
        children: list[Community],
        db: Session,
    ) -> int:
        """待审楼栋/户室改指主档（SPEC §4.3）.

        不改指的话，合并后审核转正会把楼栋落进**已归档**子档（字典树不可见，
        且主档永远看不到），这正是「合并后数据不见了」的同类缺陷。

        撞 ``uq_pending_open``（主档已有同名 open 条目）时把本条的引用账本改挂
        到已存在条目，并把本条置终态 merged —— 否则整笔合并会因唯一冲突回滚。

        **不改** ``kind=community``（自身即小区，与档案合并无关）与
        ``parent_is_pending=true``（父级也在审核池，拓扑由审核链路管）的条目。

        Args:
            primary: 主档
            children: 子档列表
            db: 数据库会话

        Returns:
            改指（或合并到同名条目）的待审条目数

        """
        from models import BdEntryKind, BdEntryStatus, BdPendingEntry, BdPendingReference

        child_ids = [c.id for c in children]
        if not child_ids:
            return 0

        entries = (
            db.query(BdPendingEntry)
            .filter(
                BdPendingEntry.kind.in_((BdEntryKind.BUILDING, BdEntryKind.ROOM)),
                BdPendingEntry.status == BdEntryStatus.PENDING,
                BdPendingEntry.community_id.in_(child_ids),
                BdPendingEntry.parent_is_pending.is_(False),
            )
            .with_for_update()
            .all()
        )

        moved = 0
        now = datetime.now(timezone.utc)
        for entry in entries:
            origin = entry.community_id
            clash = (
                db.query(BdPendingEntry)
                .filter(
                    BdPendingEntry.id != entry.id,
                    BdPendingEntry.kind == entry.kind,
                    BdPendingEntry.status == BdEntryStatus.PENDING,
                    BdPendingEntry.parent_is_pending == entry.parent_is_pending,
                    BdPendingEntry.parent_id == entry.parent_id,
                    BdPendingEntry.normalized_name == entry.normalized_name,
                    BdPendingEntry.community_scope == primary.id,
                )
                .with_for_update()
                .first()
            )
            if clash is not None:
                # 主档已有同名 open 条目：引用账本改挂，本条收敛为 merged（终态）
                refs = db.query(BdPendingReference).filter(BdPendingReference.pending_id == entry.id).all()
                for ref in refs:
                    duplicate = (
                        db.query(BdPendingReference)
                        .filter(
                            BdPendingReference.pending_id == clash.id,
                            BdPendingReference.biz_type == ref.biz_type,
                            BdPendingReference.biz_id == ref.biz_id,
                            BdPendingReference.field == ref.field,
                        )
                        .first()
                    )
                    if duplicate is not None:
                        db.delete(ref)
                    else:
                        ref.pending_id = clash.id
                entry.status = BdEntryStatus.MERGED
                entry.resolved_target_id = str(clash.id)
                entry.resolved_at = now
                entry.origin_community_id = origin
                logger.info(
                    "小区合并：待审条目 %s 与主档同名条目 %s 合并（引用 %d 条改挂）",
                    entry.id,
                    clash.id,
                    len(refs),
                )
            else:
                entry.community_id = primary.id
                entry.community_scope = primary.id
                entry.origin_community_id = origin
            moved += 1

        if moved:
            db.flush()
            logger.info("小区合并：%d 条待审条目改指主档（或并入同名条目）", moved)
        return moved

    def _migrate_community_images(
        self,
        primary: Community,
        children: list[Community],
        db: Session,
    ) -> dict[str, int]:
        """户型图随主档收敛（SPEC §4.4，含 URL 撞唯一索引处理）.

        ``uq_community_image_url`` 是 ``UNIQUE (community_id, url) WHERE is_deleted=false``
        ——两侧存在同 URL 时朴素改挂会抛 ``UniqueViolation`` 使整笔合并回滚。
        故撞 URL 的那条改挂后**软删**（``is_deleted=True``），解除合并时复活回子档。

        Args:
            primary: 主档
            children: 子档列表
            db: 数据库会话

        Returns:
            ``{"moved": 迁移张数, "deduped": 因撞 URL 被软删的张数}``

        """
        from models import CommunityImage

        child_ids = [c.id for c in children]
        if not child_ids:
            return {"moved": 0, "deduped": 0}

        existing_urls = {
            row[0]
            for row in db.query(CommunityImage.url)
            .filter(CommunityImage.community_id == primary.id, CommunityImage.is_deleted.is_(False))
            .all()
        }
        base_sort = (
            db.query(CommunityImage.sort_order)
            .filter(CommunityImage.community_id == primary.id)
            .order_by(CommunityImage.sort_order.desc())
            .limit(1)
            .scalar()
            or 0
        )

        images = (
            db.query(CommunityImage)
            .filter(
                CommunityImage.community_id.in_(child_ids),
                CommunityImage.is_deleted.is_(False),
            )
            .order_by(CommunityImage.community_id, CommunityImage.sort_order, CommunityImage.id)
            .with_for_update()
            .all()
        )

        moved = 0
        deduped = 0
        now = datetime.now(timezone.utc)
        for offset, image in enumerate(images, start=1):
            origin = image.community_id
            image.community_id = primary.id
            image.origin_community_id = origin
            image.updated_at = now
            if image.url in existing_urls:
                image.is_deleted = True
                deduped += 1
            else:
                existing_urls.add(image.url)
                image.sort_order = base_sort + offset
            moved += 1

        if moved:
            db.flush()
            logger.info("小区合并：%d 张户型图改挂主档（其中 %d 张因 URL 重复软删）", moved, deduped)
        return {"moved": moved, "deduped": deduped}

    def _migrate_competitors(
        self,
        primary: Community,
        children: list[Community],
        db: Session,
    ) -> int:
        """竞品关系改指主档（SPEC §4.5）.

        步骤顺序（同一事务内的 SQL 序列，不能用 ORM 先行改写，见下方注释）：
        1. 先软删「改指后会变成自环」与「改指后会与已有边重复」的边（记 ``origin``）；
        2. owner 侧改指（记 ``origin``，可逆）；
        3. 引用侧改指（不记 origin —— 被引用方归属不是本小区数据，见 SPEC §9 L3）；
        4. 按 (owner, competitor) 收敛重复边，**优先保留主档原行**（SPEC §9 L7）；
        5. 兜底软删自环。

        去重一律**软删**（``is_deleted=true`` + ``origin_community_id=原 owner``），
        绝不物理删除：物理删除后该边无任何痕迹，解除合并无法回迁，子档的竞品关系
        会永久丢失（v101 修复的缺陷）。``uq_community_competitor`` 是部分唯一索引
        （``WHERE is_deleted=false``），软删行不占键，解除合并复活时不会撞约束。

        Args:
            primary: 主档
            children: 子档列表
            db: 数据库会话

        Returns:
            改指成功的竞品边数

        """
        # 全部走 SQL。顺序很关键，且**不能先用 ORM 改 community_id**：
        # autoflush 会在去重语句之前把重复边写进库 → 撞 uq_community_competitor
        # → 整笔合并 400（实测 E2E S7-b）。正确做法是先按「改指后的最终键」
        # 预清理冲突，之后两条 UPDATE 才必然不撞约束。
        child_ids = [c.id for c in children]
        if not child_ids:
            return 0

        # (1) 预清理：按改指后的最终 (owner, competitor) 去重，并软删会变成自环的边。
        #     保留优先级：主档自身的边（无需改指）> 子档迁移来的边 > 按 id 升序（确定性）。
        #     ⚠️ 被去重的边**不能物理删除**：删掉后既无 origin 也无行，解除合并时
        #     按 origin 回迁找不到它 → 子档竞品关系永久丢失（实测过）。
        #     改为「置 is_deleted=true + 记 origin=原 owner」，解除合并时复活回子档。
        #     ``uq_community_competitor`` 自 v101 起是部分唯一索引（WHERE is_deleted=false），
        #     软删行不占用该键，复活时不会撞约束。
        #
        #     这里**故意不改 community_id**（保持在原小区上）：解除合并按
        #     ``origin_community_id`` 找可回迁的边，不依赖 community_id 是否已改指。
        #     若在这里挪动坐标，还得推导「改指后该落在哪」，徒增出错面。
        #
        #     ``origin`` 只对被移动的边（will_move）记原 owner；主档自身的边
        #     （will_move=false）被去重时原 owner 就是主档，没有可回迁的归属，
        #     保持 origin 原值（NULL），解除合并不会把它错误地搬走。
        db.execute(
            text(
                """
                WITH projected AS (
                    SELECT id,
                           community_id AS old_owner,
                           CASE WHEN community_id = ANY(:m) THEN :p ELSE community_id END AS new_owner,
                           CASE WHEN competitor_community_id = ANY(:m)
                                THEN :p ELSE competitor_community_id END AS new_comp,
                           (community_id = ANY(:m)) AS will_move
                      FROM community_competitors
                     WHERE is_deleted = false
                ), ranked AS (
                    SELECT id, old_owner, will_move,
                           ROW_NUMBER() OVER (
                               PARTITION BY new_owner, new_comp
                               ORDER BY will_move ASC, id ASC
                           ) AS rn
                      FROM projected
                ), doomed AS (
                    SELECT id, old_owner, will_move FROM ranked WHERE rn > 1
                    UNION
                    SELECT p.id, p.old_owner, p.will_move
                      FROM projected p
                     WHERE p.new_owner = p.new_comp
                )
                UPDATE community_competitors c
                   SET is_deleted = true,
                       origin_community_id = CASE WHEN d.will_move THEN d.old_owner
                                                  ELSE c.origin_community_id END
                  FROM doomed d
                 WHERE c.id = d.id
                   AND c.is_deleted = false
                """
            ),
            {"p": primary.id, "m": child_ids},
        )

        # (2) owner 侧改指（记 origin，可逆）
        moved = int(
            db.execute(
                text(
                    "UPDATE community_competitors "
                    "   SET community_id = :p, origin_community_id = community_id "
                    " WHERE community_id = ANY(:m) "
                    "   AND is_deleted = false"
                ),
                {"p": primary.id, "m": child_ids},
            ).rowcount
            or 0
        )

        # (3) 引用侧改指（不记 origin —— 被引用方归属不是本小区数据，SPEC §9 L3）
        db.execute(
            text(
                "UPDATE community_competitors "
                "   SET competitor_community_id = :p "
                " WHERE competitor_community_id = ANY(:m) "
                "   AND is_deleted = false"
            ),
            {"p": primary.id, "m": child_ids},
        )

        # (4) 兜底清自环（引用侧改指后理论上已被 (1) 覆盖，保留防御性收尾）。
        #     同样改软删并记 origin，使子档侧的自环边也能随解除合并复活。
        self_loop = int(
            db.execute(
                text(
                    "UPDATE community_competitors "
                    "   SET is_deleted = true, "
                    "       origin_community_id = community_id "
                    " WHERE community_id = competitor_community_id "
                    "   AND is_deleted = false"
                )
            ).rowcount
            or 0
        )
        db.flush()
        logger.info("小区合并：%d 条竞品边改挂主档（软删自环/重复 %d 条）", moved, self_loop)
        return moved

    def _restore_community_images(self, merged_id: str, primary_id: str, db: Session) -> int:
        """解除合并：把合并时改挂主档的户型图按 origin 回迁（与 ``_migrate_community_images`` 对称）.

        因撞 URL 被去重软删的行一并**复活**（``is_deleted=False``）——它本就是子档
        真实存在的图片，解除合并后子档应恢复原样。

        Returns:
            回迁的户型图张数

        """
        from models import CommunityImage

        images = (
            db.query(CommunityImage)
            .filter(
                CommunityImage.community_id == primary_id,
                CommunityImage.origin_community_id == merged_id,
            )
            .with_for_update()
            .all()
        )
        now = datetime.now(timezone.utc)
        for image in images:
            image.community_id = merged_id
            image.origin_community_id = None
            image.is_deleted = False
            image.updated_at = now
        if images:
            db.flush()
            logger.info("解除合并：户型图回迁 %d 张到小区 %s", len(images), merged_id)
        return len(images)

    def _restore_pending_entries(self, merged_id: str, primary_id: str, db: Session) -> int:
        """解除合并：把合并时改指主档的待审条目按 origin 回迁（SPEC §4.7）.

        撞 ``uq_pending_open``（子档已有同名 open 条目）时跳过并告警——保留主档那条
        更安全（它可能已被运营引用），不强行改挂。

        Returns:
            回迁的待审条目数

        """
        from models import BdEntryStatus, BdPendingEntry

        entries = (
            db.query(BdPendingEntry)
            .filter(
                BdPendingEntry.community_id == primary_id,
                BdPendingEntry.origin_community_id == merged_id,
                BdPendingEntry.status == BdEntryStatus.PENDING,
            )
            .with_for_update()
            .all()
        )
        restored = 0
        for entry in entries:
            clash = (
                db.query(BdPendingEntry)
                .filter(
                    BdPendingEntry.id != entry.id,
                    BdPendingEntry.kind == entry.kind,
                    BdPendingEntry.status == BdEntryStatus.PENDING,
                    BdPendingEntry.parent_is_pending == entry.parent_is_pending,
                    BdPendingEntry.parent_id == entry.parent_id,
                    BdPendingEntry.normalized_name == entry.normalized_name,
                    BdPendingEntry.community_scope == merged_id,
                )
                .first()
            )
            if clash is not None:
                logger.warning(
                    "解除合并：待审条目 %s 回迁会与条目 %s 撞同名，保留在主档（需人工处理）",
                    entry.id,
                    clash.id,
                )
                continue
            entry.community_id = merged_id
            entry.community_scope = merged_id
            entry.origin_community_id = None
            restored += 1
        if restored:
            db.flush()
            logger.info("解除合并：待审条目回迁 %d 条到小区 %s", restored, merged_id)
        return restored

    def _restore_competitors(self, merged_id: str, primary_id: str, db: Session) -> int:
        """解除合并：把合并时改指主档的竞品边按 origin 回迁（owner 侧，SPEC §4.7）.

        撞 ``uq_community_competitor`` 的边跳过并告警（主档已有同一条竞品关系）。

        Args:
            merged_id: 被解除合并的子档 ID（按 ``origin_community_id`` 匹配）
            primary_id: 主档 ID。**当前实现不参与筛选**：去重软删的边保留原坐标
                （仍挂在子档上），只按 origin 匹配才能同时覆盖「改指迁移的边」与
                「软删保留的边」两种形态。保留参数是为了与其余 ``_restore_*``
                方法保持一致的调用签名。
            db: 数据库会话

        Returns:
            回迁的竞品边数

        """
        from models import CommunityCompetitor

        _ = primary_id  # 见 docstring：回迁只按 origin 匹配，不按主档筛选

        # 按 ``origin`` 找可回迁的边，**不限定 community_id**：合并去重软删的边
        # 保留原坐标（仍挂在子档上），而改指迁移的边已挂到主档——两者都要回迁。
        # 若只查 ``community_id = primary``，情形 A/D（重复边、自环边）会漏（实测过）。
        edges = (
            db.query(CommunityCompetitor)
            .filter(CommunityCompetitor.origin_community_id == merged_id)
            .with_for_update()
            .all()
        )
        restored = 0
        for edge in edges:
            # 撞键检查只看**未删除**的行：部分唯一索引 WHERE is_deleted=false，
            # 已软删的行不占键，不构成冲突（否则会把本该复活的边误判为撞键跳过）。
            clash = (
                db.query(CommunityCompetitor)
                .filter(
                    CommunityCompetitor.id != edge.id,
                    CommunityCompetitor.community_id == merged_id,
                    CommunityCompetitor.competitor_community_id == edge.competitor_community_id,
                    CommunityCompetitor.is_deleted.is_(False),
                )
                .first()
            )
            if clash is not None:
                logger.warning("解除合并：竞品边 %s 回迁会撞唯一约束，已跳过", edge.id)
                continue
            edge.community_id = merged_id
            edge.origin_community_id = None
            # 合并期间被去重软删的边在此复活（子档原本就存在这条关系）
            edge.is_deleted = False
            restored += 1
        if restored:
            db.flush()
            logger.info("解除合并：竞品边回迁 %d 条到小区 %s", restored, merged_id)
        return restored
