"""
L4 市场营销层媒体服务
职责: 营销媒体资源管理
"""
from typing import List, Tuple, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, asc, desc

from models import L4MarketingMedia
from schemas.l4_marketing import L4MarketingMediaCreate, L4MarketingMediaUpdate, MediaSortOrderUpdate


class MarketingMediaService:
    """L4 营销媒体服务"""

    def __init__(self, db: Session) -> None:
        self.db: Session = db

    def get_media_list(
        self,
        marketing_project_id: int,
        skip: int = 0,
        limit: int = 100
    ) -> Tuple[List[L4MarketingMedia], int]:
        """
        获取媒体列表

        Args:
            marketing_project_id: 营销项目ID
            skip: 跳过记录数
            limit: 返回记录数

        Returns:
            (媒体列表, 总记录数)
        """
        query = self.db.query(L4MarketingMedia).filter(
            and_(
                L4MarketingMedia.marketing_project_id == marketing_project_id,
                L4MarketingMedia.is_deleted == False
            )
        )

        total: int = query.count()
        items: List[L4MarketingMedia] = query.order_by(
            asc(L4MarketingMedia.sort_order),
            desc(L4MarketingMedia.created_at)
        ).offset(skip).limit(limit).all()

        return items, total

    def get_media(self, media_id: int) -> Optional[L4MarketingMedia]:
        """
        获取单个媒体

        Args:
            media_id: 媒体ID

        Returns:
            媒体对象或None
        """
        return self.db.query(L4MarketingMedia).filter(
            and_(
                L4MarketingMedia.id == media_id,
                L4MarketingMedia.is_deleted == False
            )
        ).first()

    def create_media(
        self,
        data: L4MarketingMediaCreate,
        marketing_project_id: int
    ) -> L4MarketingMedia:
        """
        创建媒体记录

        Args:
            data: 创建数据
            marketing_project_id: 营销项目ID

        Returns:
            创建的媒体
        """
        db_obj = L4MarketingMedia(
            **data.model_dump(),
            marketing_project_id=marketing_project_id
        )
        self.db.add(db_obj)
        self.db.commit()
        self.db.refresh(db_obj)
        return db_obj

    def update_media(
        self,
        media_id: int,
        data: L4MarketingMediaUpdate
    ) -> Optional[L4MarketingMedia]:
        """
        更新媒体

        Args:
            media_id: 媒体ID
            data: 更新数据

        Returns:
            更新后的媒体或None
        """
        db_obj = self.get_media(media_id)
        if not db_obj:
            return None

        update_data = data.model_dump(exclude_unset=True)
        allowed_fields = {
            'photo_category', 'renovation_stage', 'description',
            'sort_order', 'thumbnail_url'
        }
        for field, value in update_data.items():
            if field in allowed_fields:
                setattr(db_obj, field, value)

        self.db.commit()
        self.db.refresh(db_obj)
        return db_obj

    def delete_media(self, media_id: int) -> bool:
        """
        逻辑删除媒体

        Args:
            media_id: 媒体ID

        Returns:
            是否删除成功
        """
        db_obj = self.get_media(media_id)
        if not db_obj:
            return False

        db_obj.is_deleted = True
        self.db.commit()
        return True

    def batch_update_sort_order(
        self,
        project_id: int,
        sort_updates: List[MediaSortOrderUpdate]
    ) -> int:
        """
        批量更新媒体排序

        Args:
            project_id: 营销项目ID
            sort_updates: 排序更新列表，每项为 MediaSortOrderUpdate 模型

        Returns:
            更新成功的记录数
        """
        if not sort_updates:
            return 0

        update_map = {u.media_id: u.sort_order for u in sort_updates}

        media_ids = list(update_map.keys())
        media_list = self.db.query(L4MarketingMedia).filter(
            and_(
                L4MarketingMedia.id.in_(media_ids),
                L4MarketingMedia.marketing_project_id == project_id,
                L4MarketingMedia.is_deleted == False
            )
        ).all()

        updated_count = 0
        for media in media_list:
            media.sort_order = update_map[media.id]
            updated_count += 1

        if updated_count > 0:
            self.db.commit()

        return updated_count


# 向后兼容的别名
L4MarketingMediaService = MarketingMediaService