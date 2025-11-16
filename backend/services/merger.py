"""
小区合并服务
处理小区数据治理，包括小区合并、别名创建和房源更新
"""
from datetime import datetime
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
import logging

from models import Community, CommunityAlias, PropertyCurrent
from schemas import CommunityMergeResponse


logger = logging.getLogger(__name__)


class MergeResult:
    """合并结果"""
    def __init__(self, success: bool, affected_properties: int, message: str):
        self.success = success
        self.affected_properties = affected_properties
        self.message = message


class CommunityMerger:
    """小区数据治理服务"""
    
    def merge_communities(
        self, 
        primary_id: int, 
        merge_ids: List[int], 
        db: Session
    ) -> MergeResult:
        """
        合并小区
        
        流程:
        1. 验证所有小区 ID 存在
        2. 统计受影响的房源数量
        3. 将被合并小区名称存入 community_aliases
        4. 更新所有关联房源的 community_id
        5. 软删除被合并的小区记录
        
        Args:
            primary_id: 主小区ID（保留的小区）
            merge_ids: 要合并的小区ID列表
            db: 数据库会话
        
        Returns:
            MergeResult: 合并结果
        """
        try:
            # 1. 验证所有小区 ID 存在
            primary_community = db.query(Community).filter(
                Community.id == primary_id,
                Community.is_active == True
            ).first()
            
            if not primary_community:
                return MergeResult(
                    success=False,
                    affected_properties=0,
                    message=f"主小区 ID {primary_id} 不存在或已被删除"
                )
            
            # 查询要合并的小区
            merge_communities = db.query(Community).filter(
                Community.id.in_(merge_ids),
                Community.is_active == True
            ).all()
            
            if len(merge_communities) != len(merge_ids):
                found_ids = [c.id for c in merge_communities]
                missing_ids = [mid for mid in merge_ids if mid not in found_ids]
                return MergeResult(
                    success=False,
                    affected_properties=0,
                    message=f"以下小区 ID 不存在或已被删除: {missing_ids}"
                )
            
            # 2. 统计受影响的房源数量
            affected_properties_count = db.query(PropertyCurrent).filter(
                PropertyCurrent.community_id.in_(merge_ids),
                PropertyCurrent.is_active == True
            ).count()
            
            logger.info(f"开始合并小区: 主小区={primary_id}, 合并小区={merge_ids}, 影响房源={affected_properties_count}")
            
            # 3. 将被合并小区名称存入 community_aliases
            for merge_community in merge_communities:
                # 检查别名是否已存在
                existing_alias = db.query(CommunityAlias).filter(
                    CommunityAlias.alias_name == merge_community.name,
                    CommunityAlias.community_id == primary_id
                ).first()
                
                if not existing_alias:
                    # 创建新别名
                    alias = CommunityAlias(
                        community_id=primary_id,
                        alias_name=merge_community.name,
                        data_source="merge_operation",  # 标记为合并操作产生的别名
                        created_at=datetime.now()
                    )
                    db.add(alias)
                    logger.info(f"创建别名: {merge_community.name} -> {primary_community.name}")
                
                # 同时将该小区的现有别名也转移到主小区
                existing_aliases = db.query(CommunityAlias).filter(
                    CommunityAlias.community_id == merge_community.id
                ).all()
                
                for existing_alias in existing_aliases:
                    # 检查别名是否已存在于主小区
                    duplicate_check = db.query(CommunityAlias).filter(
                        CommunityAlias.alias_name == existing_alias.alias_name,
                        CommunityAlias.community_id == primary_id
                    ).first()
                    
                    if not duplicate_check:
                        # 更新别名指向主小区
                        existing_alias.community_id = primary_id
                        logger.info(f"转移别名: {existing_alias.alias_name} -> {primary_community.name}")
            
            # 4. 更新所有关联房源的 community_id
            updated_count = db.query(PropertyCurrent).filter(
                PropertyCurrent.community_id.in_(merge_ids),
                PropertyCurrent.is_active == True
            ).update(
                {PropertyCurrent.community_id: primary_id},
                synchronize_session=False
            )
            
            logger.info(f"更新房源: {updated_count} 条记录的 community_id 更新为 {primary_id}")
            
            # 5. 软删除被合并的小区记录
            for merge_community in merge_communities:
                merge_community.is_active = False
                merge_community.updated_at = datetime.now()
                logger.info(f"软删除小区: {merge_community.name} (ID: {merge_community.id})")
            
            # 6. 更新主小区的房源统计
            primary_community.total_properties = db.query(PropertyCurrent).filter(
                PropertyCurrent.community_id == primary_id,
                PropertyCurrent.is_active == True
            ).count()
            primary_community.updated_at = datetime.now()
            
            # 提交事务
            db.commit()
            
            logger.info(f"小区合并完成: 主小区={primary_community.name}, 影响房源={affected_properties_count}")
            
            return MergeResult(
                success=True,
                affected_properties=affected_properties_count,
                message=f"成功合并 {len(merge_ids)} 个小区到 '{primary_community.name}'，共影响 {affected_properties_count} 套房源"
            )
        
        except IntegrityError as e:
            db.rollback()
            error_msg = f"数据库完整性错误: {str(e)}"
            logger.error(f"小区合并失败: {error_msg}")
            return MergeResult(
                success=False,
                affected_properties=0,
                message=error_msg
            )
        
        except Exception as e:
            db.rollback()
            error_msg = f"合并失败: {str(e)}"
            logger.error(f"小区合并失败: {error_msg}")
            return MergeResult(
                success=False,
                affected_properties=0,
                message=error_msg
            )
