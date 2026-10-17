"""小区合并服务.

处理小区的合并逻辑，包括别名迁移、房源更新及状态变更.
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import or_, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from models import BdRoom, L4MarketingProject, Lead, Project
from models.property import Community, CommunityAlias, PropertyCurrent

logger = logging.getLogger(__name__)


class MergeResult:
    """合并结果值对象."""

    def __init__(self, *, success: bool, affected_properties: int, message: str) -> None:
        """初始化合并结果."""
        self.success = success
        self.affected_properties = affected_properties
        self.message = message


class CommunityMerger:
    """小区数据治理服务.

    负责处理小区的合并逻辑，包括别名迁移、房源更新及状态变更.
    """

    ALIAS_SOURCE_MERGE = "merge_operation"

    # 持有字典关联字段（community_id/building_id/room_id）的业务单据模型。
    # 合并/解除合并时与字典楼栋树同步改指，避免「单据小区 ≠ 楼栋小区」的脏关联
    # 让 validate_dict_ownership 把单据永久判为不可编辑。
    _DICT_DOC_MODELS: tuple[type, ...] = (Project, Lead, L4MarketingProject)

    def merge_communities(self, primary_id: int, merge_ids: list[int], db: Session) -> MergeResult:
        """执行小区合并的主流程."""
        try:
            primary_community = self._validate_communities(primary_id, merge_ids, db)
            merge_communities = db.query(Community).filter(Community.id.in_(merge_ids)).all()

            affected_count = self._count_affected_properties(merge_ids, db)
            logger.info(
                "开始合并: 主ID=%s, 合并IDs=%s, 预计影响房源=%s",
                primary_id,
                merge_ids,
                affected_count,
            )

            self._process_aliases(primary_community, merge_communities, db)
            self._migrate_properties(primary_id, merge_ids, db)
            # H3：字典楼栋树跟随小区合并迁移（否则主档看不到被并小区楼栋，
            # 且被并小区可被 delete_community 整树物理删掉）
            dict_stats = self._migrate_dict_buildings(primary_id, merge_ids, db)
            # H3 配套：单据小区改指主档（否则楼栋已迁主档、单据仍指向归档小区，
            # 归属校验把单据判为脏关联 → 三模块单据此后任何编辑都 400）
            doc_count = self._migrate_business_docs(primary_id, merge_ids, db)
            self._archive_communities(primary_community, merge_communities)
            self._refresh_primary_stats(primary_community, db)

            db.commit()

            success_msg = (
                f"成功合并 {len(merge_ids)} 个小区到 '{primary_community.name}'，"
                f"共迁移 {affected_count} 套房源、{dict_stats['buildings']} 个字典楼栋、"
                f"{doc_count} 张关联单据改指主档"
            )
            logger.info(success_msg)
            return MergeResult(success=True, affected_properties=affected_count, message=success_msg)

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

            # 4. 主档计数刷新
            self._refresh_primary_stats(primary, db)
            db.commit()

            success_msg = (
                f"已解除合并：'{merged.name}' 恢复独立小区"
                f"（原关联房源 {affected_count} 套、字典楼栋 {len(restored_building_ids)} 个、"
                f"关联单据 {restored_docs} 张已归位；如需把房源拆回请人工迁移）"
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

    def _validate_communities(self, primary_id: int, merge_ids: list[int], db: Session) -> Community:
        """验证主小区和待合并小区是否存在且有效.

        使用 with_for_update 加行级锁，防止并发合并导致房源归属不一致。
        """
        primary = (
            db.query(Community)
            .filter(
                Community.id == primary_id,
                Community.is_active.is_(True),
            )
            .with_for_update()
            .first()
        )

        if not primary:
            msg = f"主小区 ID {primary_id} 不存在或已被删除"
            raise ValueError(msg)

        existing = (
            db.query(Community)
            .filter(
                Community.id.in_(merge_ids),
                Community.is_active.is_(True),
            )
            .with_for_update()
            .all()
        )

        if len(existing) != len(merge_ids):
            msg = "提供的合并列表中包含无效或已删除的小区 ID"
            raise ValueError(msg)

        return primary

    def _count_affected_properties(self, merge_ids: list[int], db: Session) -> int:
        """统计将被迁移的房源数量."""
        return (
            db.query(PropertyCurrent)
            .filter(
                PropertyCurrent.community_id.in_(merge_ids),
                PropertyCurrent.is_active.is_(True),
            )
            .count()
        )

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

    def _migrate_properties(self, primary_id: int, merge_ids: list[int], db: Session) -> None:
        """批量更新房源的归属小区."""
        db.query(PropertyCurrent).filter(
            PropertyCurrent.community_id.in_(merge_ids),
            PropertyCurrent.is_active.is_(True),
        ).update(
            {PropertyCurrent.community_id: primary_id},
            synchronize_session=False,
        )

    def _migrate_dict_buildings(self, primary_id: int, merge_ids: list[int], db: Session) -> dict[str, int]:
        """字典楼栋树跟随合并迁移（H3 修复，与 _migrate_properties 同事务）.

        - 主档须按楼栋号看得到被并小区的楼栋（总览/详情/FR-14 数据情况）；
        - 不迁移的话，被并小区虽已 is_active=False，仍是 bd_buildings 的持有者，
          且 delete_community 拦不住「本小区已被并入别处」→ 整树物理删除不可恢复。

        uq(community_id, building_no) 冲突（主档已有同号楼栋）的楼栋不迁移，
        保留在原小区（其归属在解除合并时自然还原），避免整笔事务失败。
        origin_community_id 记录原归属，供 unmerge 可逆回迁。

        冲突比较不能只看主档存量：同批多个被并小区之间也可能同号（真实数据里
        ``01``/``02`` 等楼栋号在 19.6k 个小区中重复率极高）。原实现只做
        ``NOT EXISTS(主档同号)``，同批两行同号时会双双通过检查 → 同一 UPDATE
        内两行都改判主档 → 撞 ``uq_bd_buildings_no`` 使整笔合并回滚（线上表现为
        合并永远 400「数据库操作失败」）。故追加同批内「同号只迁移 id 最小的一行」
        判定（同一语句内子查询看到的是语句开始时的快照，结果确定）。

        Returns:
            {"buildings": 迁移楼栋数, "rooms": 随之迁移的户室数}

        """
        from models import BdBuilding

        # 一条 SQL 完成迁移（避免逐楼栋往返）：主档已有同号、或同批中已有更小的
        # 同号行被迁移的那批留在原小区
        result = db.execute(
            text(
                """
                UPDATE bd_buildings b
                   SET community_id = :primary_id,
                       origin_community_id = b.community_id,
                       updated_at = now()
                 WHERE b.community_id = ANY(:merge_ids)
                   AND NOT EXISTS (
                       SELECT 1 FROM bd_buildings p
                        WHERE p.community_id = :primary_id
                          AND p.building_no = b.building_no
                   )
                   AND NOT EXISTS (
                       SELECT 1 FROM bd_buildings s
                        WHERE s.community_id = ANY(:merge_ids)
                          AND s.building_no = b.building_no
                          AND s.id < b.id
                   )
                """
            ),
            {"primary_id": str(primary_id), "merge_ids": [str(i) for i in merge_ids]},
        )
        moved = result.rowcount or 0
        room_count = (
            db.query(BdRoom)
            .filter(
                BdRoom.building_id.in_(
                    db.query(BdBuilding.id).filter(
                        BdBuilding.community_id == str(primary_id),
                        BdBuilding.origin_community_id.in_([str(i) for i in merge_ids]),
                    )
                )
            )
            .count()
        )
        logger.info("小区合并：字典楼栋迁移 %d 个（户室 %d 个随之改归主档）", moved, room_count)
        return {"buildings": moved, "rooms": room_count}

    def _restore_dict_buildings(self, merged_id: str, primary_id: str, db: Session) -> list[int]:
        """解除合并：把合并时改指主档的字典楼栋按 origin_community_id 回迁原本小区.

        只回迁带 origin_community_id == 本被并小区 的楼栋（merge 迁移才有标记），
        手工改归主档的楼栋不回迁。

        Returns:
            本次回迁的楼栋 id 列表（供引用单据同步拆回）。

        """
        result = db.execute(
            text(
                """
                UPDATE bd_buildings
                   SET community_id = origin_community_id,
                       origin_community_id = NULL,
                       updated_at = now()
                 WHERE community_id = :primary_id
                   AND origin_community_id = :merged_id
             RETURNING id
                """
            ),
            {"primary_id": str(primary_id), "merged_id": str(merged_id)},
        )
        restored = [int(r[0]) for r in result.all()]
        if restored:
            logger.info("解除合并：字典楼栋回迁 %d 个到小区 %s", len(restored), merged_id)
        return restored

    def _migrate_business_docs(self, primary_id: int, merge_ids: list[int], db: Session) -> int:
        """单据小区改指主档（H3 配套修复）.

        合并把字典楼栋改判主档后，若引用了这些楼栋的单据仍指向被并（已归档）小区，
        就形成「单据小区 ≠ 楼栋小区」——三模块创建/编辑链路的
        ``validate_dict_ownership`` 会以「字典楼栋不属于所选小区」400 挡住此后
        任何编辑（含只改状态/发布态），单据永久不可编辑，只能人工先把小区改对。
        故与楼栋迁移同事务把 projects/leads/l4_marketing_projects 的
        ``community_id`` 一并改判主档（楼栋/户室 id 不变，仍指向已随迁的实表行）。

        只改指「小区级单据」与「楼栋已随迁的单据」：楼栋号撞号被留在原小区的
        那批（见 ``_migrate_dict_buildings``）引用的单据保持原小区，否则又会
        造出新的「单据小区 ≠ 楼栋小区」脏关联（正好是本方法要消除的问题）。

        ``community_name`` 冗余列按既有口径保留原值（与 dictionary_link_service
        绑定口径一致：不改写来源单据的小区名冗余）。

        Returns:
            改指的关联单据张数。

        """
        merged_strs = [str(i) for i in merge_ids]
        primary_str = str(primary_id)
        moved_building_ids = [
            int(r[0])
            for r in db.execute(
                text("SELECT id FROM bd_buildings WHERE community_id = :p AND origin_community_id = ANY(:m)"),
                {"p": primary_str, "m": merged_strs},
            ).all()
        ]
        total = 0
        for model in self._DICT_DOC_MODELS:
            # 1. 未选楼栋/户室的小区级单据：无归属可比对，直接随小区改指
            total += int(
                db.query(model)
                .filter(
                    model.community_id.in_(merged_strs),
                    model.building_id.is_(None),
                    model.room_id.is_(None),
                )
                .update(
                    {model.community_id: primary_str, model.updated_at: datetime.now(timezone.utc)},
                    synchronize_session=False,
                )
                or 0
            )
            if not moved_building_ids:
                continue
            # 2. 引用了「已随迁楼栋」的单据（楼栋直连或经户室反查）
            rooms_of_moved = db.query(BdRoom.id).filter(BdRoom.building_id.in_(moved_building_ids))
            total += int(
                db.query(model)
                .filter(
                    model.community_id.in_(merged_strs),
                    or_(
                        model.building_id.in_(moved_building_ids),
                        model.room_id.in_(rooms_of_moved.scalar_subquery()),
                    ),
                )
                .update(
                    {model.community_id: primary_str, model.updated_at: datetime.now(timezone.utc)},
                    synchronize_session=False,
                )
                or 0
            )
        if total:
            logger.info("小区合并：%d 张关联单据改指主档（项目/线索/营销）", total)
        return total

    def _restore_business_docs(
        self, merged_id: str, primary_id: str, restored_building_ids: list[int], db: Session
    ) -> int:
        """解除合并：把引用了回迁楼栋的单据一并拆回被并小区.

        只拆引用 ``_restore_dict_buildings`` 本次回迁楼栋的单据（主档自身单据、
        以及引用撞号留在原小区楼栋的单据都不受影响），与 merge 的改指对称。

        ⚠️ 未覆盖：合并时被改指主档的「小区级单据」（未选楼栋/户室）不在此拆回——
        它们与哪些楼栋一起回迁没有可判定依据，沿用既有口径「房源类需人工迁移」。
        """
        if not restored_building_ids:
            return 0
        total = 0
        for model in self._DICT_DOC_MODELS:
            room_ids_of_restored = db.query(BdRoom.id).filter(BdRoom.building_id.in_(restored_building_ids))
            restored = (
                db.query(model)
                .filter(
                    model.community_id == primary_id,
                    or_(
                        model.building_id.in_(restored_building_ids),
                        model.room_id.in_(room_ids_of_restored.scalar_subquery()),
                    ),
                )
                .update(
                    {model.community_id: merged_id, model.updated_at: datetime.now(timezone.utc)},
                    synchronize_session=False,
                )
            )
            total += int(restored or 0)
        if total:
            logger.info("解除合并：%d 张关联单据拆回被并小区 %s", total, merged_id)
        return total

    def _archive_communities(self, primary: Community, communities: list[Community]) -> None:
        """软删除被合并的小区.

        v1.9：同时写入 merged_into_id（字典合并信息区块与解除合并依据，SRS §8）。
        """
        now = datetime.now(timezone.utc)
        for c in communities:
            c.is_active = False
            c.merged_into_id = primary.id
            c.updated_at = now

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
