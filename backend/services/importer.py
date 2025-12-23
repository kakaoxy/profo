from datetime import datetime
from typing import Optional, Tuple, Any, List
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
import logging

from models import (
    Community, CommunityAlias, PropertyCurrent, PropertyHistory,
    PropertyStatus, ChangeType, PropertyMedia, MediaType
)
from schemas import PropertyIngestionModel, ImportResult, UploadResult, PushResult, BatchImportResult, FloorInfo
from services.parser import FloorParser
from utils.error_formatters import format_database_error
from services.error_service import save_failed_record

logger = logging.getLogger(__name__)

class PropertyImporter:
    """处理房源数据导入的核心服务"""
    
    def __init__(self):
        self.floor_parser = FloorParser()
    
    def import_property(self, data: PropertyIngestionModel, db: Session) -> ImportResult:
        """导入单条房源数据的入口方法"""
        try:
            return self._process_import_transaction(data, db)
        except Exception as e:
            return self._handle_import_error(e, data, db)

    def _process_import_transaction(self, data: PropertyIngestionModel, db: Session) -> ImportResult:
        """处理核心导入逻辑（事务内）"""
        community_id = self.find_or_create_community(data, db)
        
        existing_property = self._get_existing_property(data, db)
        
        if existing_property:
            self._handle_update(existing_property, data, community_id, db)
            property_id = existing_property.id
            action = "更新"
        else:
            new_property = self._handle_creation(data, community_id, db)
            property_id = new_property.id
            action = "创建"
            
        db.commit()
        logger.info(f"{action}房源: {data.source_property_id} (ID: {property_id})")
        
        return ImportResult(success=True, property_id=property_id, error=None)

    def find_or_create_community(self, data: PropertyIngestionModel, db: Session) -> int:
        """查找或创建小区"""
        name = data.community_name.strip()
        
        # 1. 尝试查找 (名称匹配或别名匹配)
        community = self._find_community_by_name_or_alias(name, db)
        
        if community:
            self._update_community_info_if_needed(community, data, db)
            return community.id
        
        # 2. 创建新小区
        return self._create_community(name, data, db)

    def _find_community_by_name_or_alias(self, name: str, db: Session) -> Optional[Community]:
        """通过名称或别名查找小区对象"""
        # 直接匹配
        community = db.query(Community).filter(
            Community.name == name, 
            Community.is_active.is_(True)
        ).first()
        if community:
            return community
            
        # 别名匹配
        alias = db.query(CommunityAlias).filter(CommunityAlias.alias_name == name).first()
        if alias:
            return db.query(Community).get(alias.community_id)
            
        return None

    def _update_community_info_if_needed(self, community: Community, 
                                       data: PropertyIngestionModel, db: Session):
        """如果信息缺失，更新小区补充信息"""
        updated = False
        
        if data.city_id is not None and community.city_id is None:
            community.city_id = data.city_id
            updated = True
            
        if data.district and not community.district:
            community.district = data.district
            updated = True
            
        if data.business_circle and not community.business_circle:
            community.business_circle = data.business_circle
            updated = True
            
        if updated:
            community.updated_at = datetime.now()
            # flush 不是必须的，commit 会处理，但在长事务中 flush 可以保持状态一致
            db.flush() 

    def _create_community(self, name: str, data: PropertyIngestionModel, db: Session) -> int:
        """创建新的小区记录"""
        new_community = Community(
            name=name,
            city_id=data.city_id,
            district=data.district,
            business_circle=data.business_circle,
            total_properties=0,
            is_active=True,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        db.add(new_community)
        db.flush() # 获取 ID
        logger.info(f"创建新小区: {name} (ID: {new_community.id})")
        return new_community.id

    def _get_existing_property(self, data: PropertyIngestionModel, db: Session) -> Optional[PropertyCurrent]:
        return db.query(PropertyCurrent).filter(
            PropertyCurrent.data_source == data.data_source,
            PropertyCurrent.source_property_id == data.source_property_id
        ).first()

    def _handle_update(self, existing: PropertyCurrent, data: PropertyIngestionModel,
                       community_id: int, db: Session):
        """处理更新逻辑：快照 + 更新当前表"""
        change_type = self._determine_change_type(existing, data)
        self._create_history_snapshot(existing, change_type, db)
        self._map_data_to_property(existing, data, community_id)
        self._save_property_media(data, db)

    def _handle_creation(self, data: PropertyIngestionModel, community_id: int, db: Session) -> PropertyCurrent:
        """处理创建逻辑"""
        new_property = PropertyCurrent(
            data_source=data.data_source,
            source_property_id=data.source_property_id,
            created_at=datetime.now(),
            is_active=True
        )
        self._map_data_to_property(new_property, data, community_id)
        db.add(new_property)
        db.flush() # 确保获取ID，方便后续日志或返回
        self._save_property_media(data, db)
        return new_property

    def _map_data_to_property(self, prop: PropertyCurrent, data: PropertyIngestionModel, community_id: int):
        """
        统一的数据映射方法
        同时用于 Create 和 Update，消除代码重复
        """
        floor_info = self.floor_parser.parse_floor(data.floor_original)
        
        prop.community_id = community_id
        prop.status = PropertyStatus(data.status.value)
        prop.property_type = data.property_type
        prop.rooms = data.rooms
        prop.halls = data.halls
        prop.baths = data.baths
        prop.orientation = data.orientation
        prop.floor_original = data.floor_original
        prop.floor_number = floor_info.floor_number
        prop.total_floors = floor_info.total_floors
        prop.floor_level = floor_info.floor_level
        prop.build_area = data.build_area
        prop.inner_area = data.inner_area
        prop.listed_price_wan = data.listed_price_wan
        prop.listed_date = data.listed_date
        prop.sold_price_wan = data.sold_price_wan
        prop.sold_date = data.sold_date
        prop.build_year = data.build_year
        prop.building_structure = data.building_structure
        prop.decoration = data.decoration
        prop.elevator = data.elevator
        prop.ownership_type = data.ownership_type
        prop.ownership_years = data.ownership_years
        prop.last_transaction = data.last_transaction
        prop.heating_method = data.heating_method
        prop.listing_remarks = data.listing_remarks
        prop.updated_at = datetime.now()

    def _create_history_snapshot(self, property_obj: PropertyCurrent, 
                                 change_type: ChangeType, db: Session):
        """创建历史快照"""
        history = PropertyHistory(
            data_source=property_obj.data_source,
            source_property_id=property_obj.source_property_id,
            change_type=change_type,
            captured_at=datetime.now(),
            # 显式列出需要保留的历史字段，避免遗漏
            status=property_obj.status,
            community_id=property_obj.community_id,
            rooms=property_obj.rooms,
            build_area=property_obj.build_area,
            listed_price_wan=property_obj.listed_price_wan,
            sold_price_wan=property_obj.sold_price_wan,
            listed_date=property_obj.listed_date,
            sold_date=property_obj.sold_date,
            floor_original=property_obj.floor_original,
            orientation=property_obj.orientation,
            decoration=property_obj.decoration
        )
        db.add(history)
        logger.debug(f"创建历史快照: {property_obj.source_property_id} ({change_type.value})")

    def _determine_change_type(self, existing: PropertyCurrent, 
                               data: PropertyIngestionModel) -> ChangeType:
        if existing.status.value != data.status.value:
            return ChangeType.STATUS_CHANGE
        
        # 使用 Enum 或常量代替 "在售"
        is_for_sale = (data.status.value == PropertyStatus.FOR_SALE.value) if hasattr(PropertyStatus, 'FOR_SALE') else (data.status == "在售")
        
        if is_for_sale:
            if existing.listed_price_wan != data.listed_price_wan:
                return ChangeType.PRICE_CHANGE
        else:
            if existing.sold_price_wan != data.sold_price_wan:
                return ChangeType.PRICE_CHANGE
        
        return ChangeType.INFO_CHANGE

    def _handle_import_error(self, e: Exception, data: PropertyIngestionModel, db: Session) -> ImportResult:
        """统一的异常处理逻辑"""
        db.rollback()
        
        error_msg = format_database_error(e) if isinstance(e, SQLAlchemyError) else str(e)
        failure_type = "database_error" if isinstance(e, SQLAlchemyError) else "import_error"
        if isinstance(e, IntegrityError):
            failure_type = "database_integrity_error"
            
        logger.error(f"导入失败 - {data.source_property_id}: {error_msg}")
        
        save_failed_record(
            data=data.model_dump(by_alias=True),
            error_message=error_msg,
            failure_type=failure_type,
            data_source=data.data_source
        )
        
        return ImportResult(
            success=False,
            property_id=None,
            error=error_msg
        )

    def _save_property_media(self, data: PropertyIngestionModel, db: Session):
        """保存房源图片链接到 property_media 表"""
        if not data.image_urls:
            logger.debug(f"房源 {data.source_property_id} 没有图片链接，跳过媒体资源保存")
            return
            
        try:
            # 删除该房源现有的所有图片记录（确保更新时不会重复）
            db.query(PropertyMedia).filter(
                PropertyMedia.data_source == data.data_source,
                PropertyMedia.source_property_id == data.source_property_id
            ).delete()
            
            # 对URL进行去重处理，保持原始顺序
            seen_urls = set()
            unique_urls = []
            for url in data.image_urls:
                if url and url.strip():  # 确保URL不为空
                    url_stripped = url.strip()
                    if url_stripped not in seen_urls:
                        seen_urls.add(url_stripped)
                        unique_urls.append(url_stripped)
            
            if len(unique_urls) < len(data.image_urls):
                logger.debug(f"房源 {data.source_property_id} 发现重复图片链接，已去重: {len(data.image_urls)} -> {len(unique_urls)}")
            
            # 批量插入新的图片记录
            media_records = []
            for index, url in enumerate(unique_urls):
                media_record = PropertyMedia(
                    data_source=data.data_source,
                    source_property_id=data.source_property_id,
                    media_type=MediaType.OTHER,  # 统一作为"其他"类型，前端自行选择展示
                    url=url,
                    sort_order=index,  # 按去重后的顺序排序
                    created_at=datetime.now()
                )
                media_records.append(media_record)
            
            if media_records:
                db.bulk_save_objects(media_records)
                logger.info(f"保存房源 {data.source_property_id} 的图片链接: {len(media_records)} 张")
                
        except Exception as e:
            # 图片保存失败不影响主流程，记录警告即可
            logger.warning(f"保存房源 {data.source_property_id} 图片链接失败: {str(e)}")