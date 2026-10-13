"""小区合并服务.

处理小区的合并逻辑，包括别名迁移、房源更新及状态变更.
"""

import logging
from datetime import datetime, timezone

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

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
            self._archive_communities(primary_community, merge_communities)
            self._refresh_primary_stats(primary_community, db)

            db.commit()

            success_msg = (
                f"成功合并 {len(merge_ids)} 个小区到 '{primary_community.name}'，共迁移 {affected_count} 套房源"
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

            # 4. 主档计数刷新
            self._refresh_primary_stats(primary, db)
            db.commit()

            success_msg = (
                f"已解除合并：'{merged.name}' 恢复独立小区"
                f"（原关联房源 {affected_count} 套留在主档，如需拆回请人工迁移）"
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
        """确保别名存在，不存在则创建."""
        exists = (
            db.query(CommunityAlias)
            .filter(
                CommunityAlias.alias_name == alias_name,
                CommunityAlias.community_id == community_id,
                CommunityAlias.is_deleted.is_(False),
            )
            .first()
        )

        if not exists:
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
