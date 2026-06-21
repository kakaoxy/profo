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
            self._archive_communities(merge_communities)
            self._refresh_primary_stats(primary_community, db)

            db.commit()

            success_msg = (
                f"成功合并 {len(merge_ids)} 个小区到 '{primary_community.name}'，共迁移 {affected_count} 套房源"
            )
            logger.info(success_msg)
            return MergeResult(success=True, affected_properties=affected_count, message=success_msg)

        except SQLAlchemyError as e:
            db.rollback()
            error_msg = f"数据库错误: {e!s}"
            logger.exception("合并失败: %s", error_msg)
            return MergeResult(success=False, affected_properties=0, message=error_msg)

        except ValueError as e:
            db.rollback()
            error_msg = f"验证错误: {e!s}"
            logger.warning("合并请求无效: %s", error_msg)
            return MergeResult(success=False, affected_properties=0, message=error_msg)

        except Exception as e:
            db.rollback()
            error_msg = f"系统未知错误: {e!s}"
            logger.critical("合并发生未预期错误: %s", error_msg, exc_info=True)
            return MergeResult(success=False, affected_properties=0, message=error_msg)

    def _validate_communities(self, primary_id: int, merge_ids: list[int], db: Session) -> Community:
        """验证主小区和待合并小区是否存在且有效."""
        primary = (
            db.query(Community)
            .filter(
                Community.id == primary_id,
                Community.is_active.is_(True),
            )
            .first()
        )

        if not primary:
            msg = f"主小区 ID {primary_id} 不存在或已被删除"
            raise ValueError(msg)

        existing_count = (
            db.query(Community)
            .filter(
                Community.id.in_(merge_ids),
                Community.is_active.is_(True),
            )
            .count()
        )

        if existing_count != len(merge_ids):
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

    def _archive_communities(self, communities: list[Community]) -> None:
        """软删除被合并的小区."""
        now = datetime.now(timezone.utc)
        for c in communities:
            c.is_active = False
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
