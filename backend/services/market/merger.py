"""小区合并服务.

处理小区的合并逻辑，包括画像合集、别名迁移、资产随迁、房源更新及状态变更.

**口径来源**：SPEC `docs/To-Do/2026-10-26-楼盘字典-小区合并信息合集-SPEC.md`。
合并的目标是「取两个小区信息的最大合集」——主档名称永不被覆盖（D2），主档非空画像
永不被覆盖（D1），子档的户型图/待审条目/竞品边随主档收敛并可用 ``origin_community_id``
在解除合并时归位（D6/D9）。

[拆分说明] 本文件只保留「合并/解除合并事务流 + 别名 + 归档」；同质能力拆到
共享同一事务边界的 Mixin（AGENTS「单文件 >500 行必须拆分」）：
- ``merge_asset_mixin.MergeAssetMixin``：画像并集 + 户型图/待审条目/竞品边随迁与回迁；
- ``merge_dict_tree_mixin.MergeDictTreeMixin``：字典楼栋树与业务单据的对称改指（H3）；
- ``merge_preview_mixin.MergePreviewMixin``：只读影响预览。
"""

import logging
from datetime import datetime, timezone

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from models import L4MarketingProject, Lead, Project
from models.property import Community, CommunityAlias, PropertyCurrent
from services.market.community_profile_merge import ProfileUnion
from services.market.merge_asset_mixin import MergeAssetMixin
from services.market.merge_dict_tree_mixin import MergeDictTreeMixin
from services.market.merge_preview_mixin import MergePreviewMixin

logger = logging.getLogger(__name__)


class MergeResult:
    """合并结果值对象."""

    def __init__(
        self,
        *,
        success: bool,
        affected_properties: int,
        message: str,
        profile_filled: list[str] | None = None,
        images_moved: int = 0,
        pending_entries_moved: int = 0,
        competitor_edges_moved: int = 0,
        archived_children_reparented: int = 0,
        archived_children_reparented_detail: list[dict[str, str]] | None = None,
        warnings: list[str] | None = None,
        profile_before: dict | None = None,
        profile_after: dict | None = None,
    ) -> None:
        """初始化合并结果."""
        self.success = success
        self.affected_properties = affected_properties
        self.message = message
        self.profile_filled = profile_filled or []
        self.images_moved = images_moved
        self.pending_entries_moved = pending_entries_moved
        self.competitor_edges_moved = competitor_edges_moved
        self.archived_children_reparented = archived_children_reparented
        # 被压平的孙档名单（仅进审计，不进 API 回执）：层级压平后原归属不可再查，
        # 这份名单是解除合并后人工重建层级的唯一依据（SPEC §9 L2 的缓解）。
        self.archived_children_reparented_detail = archived_children_reparented_detail or []
        self.warnings = warnings or []
        self.profile_before = profile_before or {}
        self.profile_after = profile_after or {}


class CommunityMerger(MergeAssetMixin, MergeDictTreeMixin, MergePreviewMixin):
    """小区数据治理服务.

    负责处理小区的合并逻辑，包括别名迁移、房源更新及状态变更.
    附属数据随迁/回迁与只读预览由三个 Mixin 装配（见模块头「拆分说明」）。
    """

    ALIAS_SOURCE_MERGE = "merge_operation"

    # 持有字典关联字段（community_id/building_id/room_id）的业务单据模型。
    # 合并/解除合并时与字典楼栋树同步改指，避免「单据小区 ≠ 楼栋小区」的脏关联
    # 让 validate_dict_ownership 把单据永久判为不可编辑。
    _DICT_DOC_MODELS: tuple[type, ...] = (Project, Lead, L4MarketingProject)

    def merge_communities(self, primary_id: str, merge_ids: list[str], db: Session) -> MergeResult:
        """执行小区合并的主流程."""
        try:
            primary_community = self._validate_communities(primary_id, merge_ids, db)
            merge_communities = self._load_children(merge_ids, db)

            affected_count = self._count_affected_properties(merge_ids, db)
            logger.info(
                "开始合并: 主ID=%s, 合并IDs=%s, 预计影响房源=%s",
                primary_id,
                merge_ids,
                affected_count,
            )

            # ① 画像合集（P0）：主档非空值不覆盖，只填空（SPEC D1）
            profile = self._merge_community_profile(primary_community, merge_communities)
            self._process_aliases(primary_community, merge_communities, db)
            self._migrate_properties(primary_id, merge_ids, db)
            # H3：字典楼栋树跟随小区合并迁移（否则主档看不到被并小区楼栋，
            # 且被并小区可被 delete_community 整树物理删掉）
            dict_stats = self._migrate_dict_buildings(primary_id, merge_ids, db)
            # H3 配套：单据小区改指主档（否则楼栋已迁主档、单据仍指向归档小区，
            # 归属校验把单据判为脏关联 → 三模块单据此后任何编辑都 400）
            doc_count = self._migrate_business_docs(primary_id, merge_ids, db)
            # ② 待审条目 / ③ 户型图 / ④ 竞品边随主档收敛（SPEC §4.3-4.5）
            pending_moved = self._migrate_pending_entries(primary_community, merge_communities, db)
            image_stats = self._migrate_community_images(primary_community, merge_communities, db)
            competitor_moved = self._migrate_competitors(primary_community, merge_communities, db)
            reparented_detail = self._archive_communities(primary_community, merge_communities, db)
            self._refresh_primary_stats(primary_community, db)

            db.commit()

            success_msg = self._compose_success_message(
                primary_community.name,
                len(merge_ids),
                affected_count,
                dict_stats["buildings"],
                doc_count,
                profile,
                image_stats,
                pending_moved,
                competitor_moved,
            )
            logger.info(success_msg)
            return MergeResult(
                success=True,
                affected_properties=affected_count,
                message=success_msg,
                profile_filled=profile.filled,
                images_moved=image_stats["moved"],
                pending_entries_moved=pending_moved,
                competitor_edges_moved=competitor_moved,
                archived_children_reparented=len(reparented_detail),
                archived_children_reparented_detail=reparented_detail,
                warnings=profile.warnings,
                # 快照取自并集结果本身（内部在改写主档**之前**捕获）；
                # 在这里重新 getattr 会得到「改后」的值，before 就失真了。
                profile_before=profile.before,
                profile_after=profile.after,
            )

        except SQLAlchemyError:
            db.rollback()
            error_msg = "数据库操作失败，请稍后重试或联系管理员"
            logger.exception("合并失败")
            return MergeResult(success=False, affected_properties=0, message=error_msg)

        except ValueError as e:
            db.rollback()
            error_msg = f"验证错误: {e!s}"
            logger.warning("合并请求无效: %s", error_msg)
            return MergeResult(success=False, affected_properties=0, message=error_msg)

        except Exception as e:
            db.rollback()
            error_msg = "系统内部错误，请联系管理员"
            logger.critical("合并发生未预期错误: %s", e, exc_info=True)
            return MergeResult(success=False, affected_properties=0, message=error_msg)

    def unmerge_community(self, merged_id: str, primary_id: str, db: Session) -> MergeResult:
        """解除合并（FR-14，v1.9）：恢复归档/清指针/撤销吸纳别名，单事务.

        被并小区数据因软归档保留（aliases 已删除标记、property 无需拆回 ——
        房源已在合并时改指主档；恢复独立后新数据自然分开）。
        """
        try:
            # 行锁防并发（与 merge 同口径）
            merged = (
                db.query(Community)
                .filter(Community.id == merged_id, Community.merged_into_id == primary_id)
                .with_for_update()
                .first()
            )
            primary = db.query(Community).filter(Community.id == primary_id).with_for_update().first()
            if not merged or not primary:
                msg = "被并小区不存在或不属于该主档"
                raise ValueError(msg)

            affected_count = (
                db.query(PropertyCurrent)
                .filter(PropertyCurrent.community_id == merged_id, PropertyCurrent.is_active.is_(True))
                .count()
            )

            # 1. 恢复归档小区 + 清指针
            merged.is_active = True
            merged.merged_into_id = None
            merged.updated_at = datetime.now(timezone.utc)

            # 2. 撤销并入时吸纳的别名（merge_operation 来源，指向主档且名为被并小区名）
            absorbed_alias = (
                db.query(CommunityAlias)
                .filter(
                    CommunityAlias.community_id == primary_id,
                    CommunityAlias.alias_name == merged.name,
                    CommunityAlias.data_source == self.ALIAS_SOURCE_MERGE,
                    CommunityAlias.is_deleted.is_(False),
                )
                .first()
            )
            if absorbed_alias:
                absorbed_alias.is_deleted = True

            # 3. 被并小区原别名恢复：合并时被删除标记的同名记录不可精确追溯，
            #    保守不动（解绑核心诉求是小区恢复独立，别名可重新维护）

            # 3. 字典楼栋树回迁（H3）：合并时改指主档的楼栋按 origin_community_id 归位
            restored_building_ids = self._restore_dict_buildings(merged_id, primary_id, db)

            # 3b. 引用已回迁楼栋的单据一并拆回被并小区（与 merge 改指对称，
            #     否则单据小区为主档、楼栋已归位被并小区 → 同样成为不可编辑死单据）
            restored_docs = self._restore_business_docs(merged_id, primary_id, restored_building_ids, db)

            # 3c. 户型图 / 待审条目 / 竞品边回迁（与 merge 的改指对称，SPEC §4.7）
            restored_images = self._restore_community_images(merged_id, primary_id, db)
            restored_pending = self._restore_pending_entries(merged_id, primary_id, db)
            restored_competitors = self._restore_competitors(merged_id, primary_id, db)

            # 4. 主档计数刷新
            self._refresh_primary_stats(primary, db)
            db.commit()

            success_msg = (
                f"已解除合并：'{merged.name}' 恢复独立小区"
                f"（原关联房源 {affected_count} 套、字典楼栋 {len(restored_building_ids)} 个、"
                f"关联单据 {restored_docs} 张、户型图 {restored_images} 张、"
                f"待审条目 {restored_pending} 条、竞品关系 {restored_competitors} 条已归位；"
                f"如需把房源拆回请人工迁移）"
            )
            logger.info(success_msg)
            return MergeResult(success=True, affected_properties=affected_count, message=success_msg)
        except ValueError:
            db.rollback()
            raise
        except SQLAlchemyError:
            db.rollback()
            logger.exception("解除合并数据库失败")
            return MergeResult(success=False, affected_properties=0, message="数据库操作失败，请稍后重试")
        except Exception:
            db.rollback()
            logger.exception("解除合并未预期错误")
            return MergeResult(success=False, affected_properties=0, message="系统内部错误")

    def _validate_communities(
        self,
        primary_id: str,
        merge_ids: list[str],
        db: Session,
        *,
        for_update: bool = True,
    ) -> Community:
        """验证主小区和待合并小区是否存在且有效.

        使用 with_for_update 加行级锁，防止并发合并导致房源归属不一致。

        Args:
            primary_id: 主档 ID
            merge_ids: 待并入 ID 列表
            db: 数据库会话
            for_update: 是否加行锁。**只有写路径（合并）可以为 True** ——
                预览端点每次勾选都会触发，给它加 FOR UPDATE 等于用读接口
                长期持住主档 + 全部子档的行锁，会把并发的真实合并挡住
                （也直接违反 SPEC §5.1「只读、零副作用」的契约）。
                预览传 False：校验规则完全一致，只是不锁行。

        Raises:
            ValueError: 主档或子档不存在/已归档

        """
        primary_query = db.query(Community).filter(
            Community.id == primary_id,
            Community.is_active.is_(True),
        )
        child_query = db.query(Community).filter(
            Community.id.in_(merge_ids),
            Community.is_active.is_(True),
        )
        if for_update:
            primary_query = primary_query.with_for_update()
            child_query = child_query.with_for_update()

        primary = primary_query.first()

        if not primary:
            msg = f"主小区 ID {primary_id} 不存在或已被删除"
            raise ValueError(msg)

        existing = child_query.all()

        if len(existing) != len(merge_ids):
            msg = "提供的合并列表中包含无效或已删除的小区 ID"
            raise ValueError(msg)

        return primary

    @staticmethod
    def _load_children(merge_ids: list[str], db: Session) -> list[Community]:
        """按**请求顺序**加载子档（合并与预览必须同序）.

        画像并集是「先到先得」（主档优先 → 第一个有值的子档优先，SPEC D1/Q2）。
        ``IN`` 查询返回的是数据库任意序，若合并按它执行、预览按 ``merge_ids``
        排序执行，两个子档持有同一空字段时两边会取到**不同子档的值** —— 正是
        本修复要杜绝的「预览说补 A、实际补 B」。故两侧共用本方法定序。

        Args:
            merge_ids: 请求中的子档 ID 列表（顺序即优先级）
            db: 数据库会话

        Returns:
            按 ``merge_ids`` 顺序排列的子档列表

        """
        rows = db.query(Community).filter(Community.id.in_(merge_ids)).all()
        order = {cid: idx for idx, cid in enumerate(merge_ids)}
        return sorted(rows, key=lambda c: order.get(c.id, len(order)))

    def _count_affected_properties(self, merge_ids: list[str], db: Session) -> int:
        """统计将被迁移的房源数量."""
        return (
            db.query(PropertyCurrent)
            .filter(
                PropertyCurrent.community_id.in_(merge_ids),
                PropertyCurrent.is_active.is_(True),
            )
            .count()
        )

    def _compose_success_message(
        self,
        primary_name: str,
        merge_count: int,
        affected_count: int,
        building_count: int,
        doc_count: int,
        profile: ProfileUnion,
        image_stats: dict[str, int],
        pending_moved: int,
        competitor_moved: int,
    ) -> str:
        """拼接合并成功文案（含画像补入摘要，供前端 toast 直接展示）."""
        base = (
            f"成功合并 {merge_count} 个小区到 '{primary_name}'，"
            f"共迁移 {affected_count} 套房源、{building_count} 个字典楼栋、"
            f"{doc_count} 张关联单据改指主档"
        )
        extras: list[str] = []
        if profile.filled:
            extras.append(f"补入画像 {len(profile.filled)} 项（{'/'.join(profile.filled)}）")
        if image_stats["moved"]:
            deduped = image_stats["deduped"]
            extras.append(f"迁移户型图 {image_stats['moved']} 张" + (f"（{deduped} 张因重复软删）" if deduped else ""))
        if pending_moved:
            extras.append(f"{pending_moved} 条待审条目改指主档")
        if competitor_moved:
            extras.append(f"{competitor_moved} 条竞品关系改指主档")
        if not extras:
            return base
        return base + "；" + "、".join(extras)

    def _process_aliases(self, primary: Community, merge_communities: list[Community], db: Session) -> None:
        """处理别名逻辑.

        1. 将被合并小区的名字作为别名添加到主小区.
        2. 将被合并小区原有的别名转移到主小区.
        """
        primary_id = primary.id

        for target in merge_communities:
            self._ensure_alias_exists(db, primary_id, target.name, self.ALIAS_SOURCE_MERGE)
            self._transfer_existing_aliases(db, target.id, primary_id)

    def _ensure_alias_exists(self, db: Session, community_id: str, alias_name: str, source: str) -> None:
        """确保别名存在，不存在则创建.

        ``uq_alias_source (alias_name, data_source)`` **不含 community_id 也不含
        is_deleted**：解除合并只把并入别名标记删除（行仍在），且该别名可能挂着
        上一个主档。原实现按 (alias_name, community_id, is_deleted=False) 查，
        两种回退路径都会判定「不存在」→ 直接 INSERT → 撞唯一约束 → 整笔合并
        在 commit 时回滚（线上表现为「合并 → 解除合并 → 再合并」永久 400，
        无论再次合并到同一主档还是换一个主档）。

        故按约束实际键 (alias_name, data_source) 查单行，命中则复壮并改挂当前主档。
        """
        row = (
            db.query(CommunityAlias)
            .filter(
                CommunityAlias.alias_name == alias_name,
                CommunityAlias.data_source == source,
            )
            .first()
        )
        if row is not None:
            row.community_id = community_id
            row.is_deleted = False
            return

        new_alias = CommunityAlias(
            community_id=community_id,
            alias_name=alias_name,
            data_source=source,
            created_at=datetime.now(timezone.utc),
        )
        db.add(new_alias)

    def _transfer_existing_aliases(self, db: Session, old_community_id: str, new_community_id: str) -> None:
        """转移旧小区的别名到新小区.

        注意：需要处理唯一性约束冲突（如果目标小区已有同名别名，则直接删除旧记录或跳过更新）.
        """
        old_aliases = (
            db.query(CommunityAlias)
            .filter(
                CommunityAlias.community_id == old_community_id,
                CommunityAlias.is_deleted.is_(False),
            )
            .all()
        )

        for alias in old_aliases:
            is_duplicate = (
                db.query(CommunityAlias)
                .filter(
                    CommunityAlias.community_id == new_community_id,
                    CommunityAlias.alias_name == alias.alias_name,
                    CommunityAlias.is_deleted.is_(False),
                )
                .count()
                > 0
            )

            if is_duplicate:
                alias.is_deleted = True
            else:
                alias.community_id = new_community_id

    def _migrate_properties(self, primary_id: str, merge_ids: list[str], db: Session) -> None:
        """批量更新房源的归属小区."""
        db.query(PropertyCurrent).filter(
            PropertyCurrent.community_id.in_(merge_ids),
            PropertyCurrent.is_active.is_(True),
        ).update(
            {PropertyCurrent.community_id: primary_id},
            synchronize_session=False,
        )

    def _archive_communities(
        self,
        primary: Community,
        communities: list[Community],
        db: Session,
    ) -> list[dict[str, str]]:
        """软删除被合并的小区，并把它们的后代一并改指本主档（SPEC §4.6）.

        v1.9：写入 ``merged_into_id``（合并信息区块与解除合并依据，SRS §8）。

        **链式合并压缩层级**：B→A 后再 A→C 时，若只把 A 指向 C，B 仍指向已归档的 A
        → C 的 ``merged_children`` 看不到 B，且无法从 C 直接解除 B（实测 400）。
        故把「已并入本批子档」的后代统一改指新主档，层级压平。

        **为什么要返回名单而不只是计数**（SPEC §9 L2）：压平后 ``B.merged_into_id``
        指向 C，A 上不再留任何「B 曾属于我」的痕迹，解除合并**无法**据此还原层级，
        也没有别的依据可查——层级关系就此永久丢失。把被改指的后代 ``(id, name)``
        落进合并审计后，至少可从审计日志人工重建，把 L2 从「不可逆」降为「可人工修复」。
        维护者注意：不要在压平后再查询后代名单（更新后它们已指向主档，查不到原归属）。

        Args:
            primary: 主档
            communities: 本批被并小区
            db: 数据库会话

        Returns:
            被改指的后代小区名单 ``[{"id": ..., "name": ...}]``（链式合并时非空）；
            长度即原返回值语义上的「改指条数」

        """
        now = datetime.now(timezone.utc)
        child_ids = [c.id for c in communities]
        reparented: list[dict[str, str]] = []
        for c in communities:
            c.is_active = False
            c.merged_into_id = primary.id
            c.updated_at = now

        if child_ids:
            # 先取名单再更新：更新后 merged_into_id 已改指主档，按原条件再也查不到
            descendants = (
                db.query(Community)
                .filter(
                    Community.merged_into_id.in_(child_ids),
                    Community.id.notin_([primary.id, *child_ids]),
                )
                .all()
            )
            if descendants:
                reparented = [{"id": str(row.id), "name": row.name} for row in descendants]
                db.query(Community).filter(
                    Community.id.in_([row.id for row in descendants]),
                ).update(
                    {Community.merged_into_id: primary.id, Community.updated_at: now},
                    synchronize_session=False,
                )
        if reparented:
            logger.info(
                "小区合并：%d 个后代归档小区改指主档（层级压平）%s",
                len(reparented),
                ", ".join(f"{item['name']}({item['id']})" for item in reparented[:20]),
            )
        return reparented

    def _refresh_primary_stats(self, primary: Community, db: Session) -> None:
        """重新计算主小区的统计数据."""
        count = (
            db.query(PropertyCurrent)
            .filter(
                PropertyCurrent.community_id == primary.id,
                PropertyCurrent.is_active.is_(True),
            )
            .count()
        )
        primary.total_properties = count
        primary.updated_at = datetime.now(timezone.utc)
