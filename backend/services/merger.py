from datetime import datetime
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
import logging

from models.community import Community, CommunityAlias
from models.property import PropertyCurrent
# 假设 MergeResult 定义在 schemas 或 dto 中，这里保留原有类定义
# from schemas import CommunityMergeResponse

logger = logging.getLogger(__name__)

class MergeResult:
    """合并结果值对象"""
    def __init__(self, success: bool, affected_properties: int, message: str):
        self.success = success
        self.affected_properties = affected_properties
        self.message = message

class CommunityMerger:
    """
    小区数据治理服务
    负责处理小区的合并逻辑，包括别名迁移、房源更新及状态变更。
    """
    
    ALIAS_SOURCE_MERGE = "merge_operation"

    def merge_communities(self, primary_id: int, merge_ids: List[int], db: Session) -> MergeResult:
        """
        执行小区合并的主流程
        """
        try:
            # 1. 验证输入
            primary_community = self._validate_communities(primary_id, merge_ids, db)
            merge_communities = db.query(Community).filter(Community.id.in_(merge_ids)).all()

            # 2. 统计影响范围
            affected_count = self._count_affected_properties(merge_ids, db)
            logger.info(f"开始合并: 主ID={primary_id}, 合并IDs={merge_ids}, 预计影响房源={affected_count}")

            # 3. 处理别名 (创建历史名称别名 + 转移现有别名)
            self._process_aliases(primary_community, merge_communities, db)

            # 4. 迁移房源
            self._migrate_properties(primary_id, merge_ids, db)

            # 5. 归档旧小区
            self._archive_communities(merge_communities)

            # 6. 更新主小区统计
            self._refresh_primary_stats(primary_community, db)

            db.commit()
            
            success_msg = f"成功合并 {len(merge_ids)} 个小区到 '{primary_community.name}'，共迁移 {affected_count} 套房源"
            logger.info(success_msg)
            return MergeResult(True, affected_count, success_msg)

        except SQLAlchemyError as e:
            db.rollback()
            error_msg = f"数据库错误: {str(e)}"
            logger.error(f"合并失败: {error_msg}", exc_info=True)
            return MergeResult(False, 0, error_msg)
            
        except ValueError as e:
            db.rollback()
            error_msg = f"验证错误: {str(e)}"
            logger.warning(f"合并请求无效: {error_msg}")
            return MergeResult(False, 0, error_msg)

        except Exception as e:
            db.rollback()
            error_msg = f"系统未知错误: {str(e)}"
            logger.critical(f"合并发生未预期错误: {error_msg}", exc_info=True)
            return MergeResult(False, 0, error_msg)

    def _validate_communities(self, primary_id: int, merge_ids: List[int], db: Session) -> Community:
        """验证主小区和待合并小区是否存在且有效"""
        primary = db.query(Community).filter(
            Community.id == primary_id, 
            Community.is_active == True
        ).first()
        
        if not primary:
            raise ValueError(f"主小区 ID {primary_id} 不存在或已被删除")

        # 检查待合并小区是否存在
        existing_count = db.query(Community).filter(
            Community.id.in_(merge_ids),
            Community.is_active == True
        ).count()
        
        if existing_count != len(merge_ids):
            # 为了性能，只在出错时查询具体缺少的ID，或者直接报错
            raise ValueError(f"提供的合并列表中包含无效或已删除的小区 ID")
            
        return primary

    def _count_affected_properties(self, merge_ids: List[int], db: Session) -> int:
        """统计将被迁移的房源数量"""
        return db.query(PropertyCurrent).filter(
            PropertyCurrent.community_id.in_(merge_ids),
            PropertyCurrent.is_active == True
        ).count()

    def _process_aliases(self, primary: Community, merge_communities: List[Community], db: Session):
        """
        处理别名逻辑：
        1. 将被合并小区的名字作为别名添加到主小区。
        2. 将被合并小区原有的别名转移到主小区。
        """
        primary_id = primary.id
        
        for target in merge_communities:
            # 逻辑 A: 将旧小区名存为新别名
            self._ensure_alias_exists(db, primary_id, target.name, self.ALIAS_SOURCE_MERGE)
            
            # 逻辑 B: 转移该小区已有的别名
            self._transfer_existing_aliases(db, target.id, primary_id)

    def _ensure_alias_exists(self, db: Session, community_id: int, alias_name: str, source: str):
        """确保别名存在，不存在则创建"""
        exists = db.query(CommunityAlias).filter(
            CommunityAlias.alias_name == alias_name,
            CommunityAlias.community_id == community_id
        ).first()
        
        if not exists:
            new_alias = CommunityAlias(
                community_id=community_id,
                alias_name=alias_name,
                data_source=source,
                created_at=datetime.now()
            )
            db.add(new_alias)

    def _transfer_existing_aliases(self, db: Session, old_community_id: int, new_community_id: int):
        """
        转移旧小区的别名到新小区。
        注意：需要处理唯一性约束冲突（如果目标小区已有同名别名，则直接删除旧记录或跳过更新）。
        """
        # 查出所有旧别名
        old_aliases = db.query(CommunityAlias).filter(
            CommunityAlias.community_id == old_community_id
        ).all()

        for alias in old_aliases:
            # 检查新主小区下是否已存在同名别名
            is_duplicate = db.query(CommunityAlias).filter(
                CommunityAlias.community_id == new_community_id,
                CommunityAlias.alias_name == alias.alias_name
            ).count() > 0

            if is_duplicate:
                # 如果重复，直接删除旧的别名记录（因为它已经不再需要指向旧ID，且新ID已有该名称）
                # 或者不做任何操作，让外键级联删除（取决于数据库设计），这里选择显式删除以防万一
                db.delete(alias)
            else:
                # 转移指向
                alias.community_id = new_community_id

    def _migrate_properties(self, primary_id: int, merge_ids: List[int], db: Session):
        """批量更新房源的归属小区"""
        db.query(PropertyCurrent).filter(
            PropertyCurrent.community_id.in_(merge_ids),
            PropertyCurrent.is_active == True
        ).update(
            {PropertyCurrent.community_id: primary_id},
            synchronize_session=False
        )

    def _archive_communities(self, communities: List[Community]):
        """软删除被合并的小区"""
        now = datetime.now()
        for c in communities:
            c.is_active = False
            c.updated_at = now

    def _refresh_primary_stats(self, primary: Community, db: Session):
        """重新计算主小区的统计数据"""
        count = db.query(PropertyCurrent).filter(
            PropertyCurrent.community_id == primary.id,
            PropertyCurrent.is_active == True
        ).count()
        primary.total_properties = count
        primary.updated_at = datetime.now()