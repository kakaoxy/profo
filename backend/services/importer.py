"""
数据导入核心服务
处理房源数据的导入、更新和历史记录管理
"""
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
import logging

from models import (
    Community, CommunityAlias, PropertyCurrent, PropertyHistory,
    PropertyStatus, ChangeType
)
from schemas import PropertyIngestionModel, ImportResult
from services.parser import FloorParser
from exceptions import DatabaseException, DuplicateRecordException
from error_handlers import ErrorHandler


logger = logging.getLogger(__name__)


class PropertyImporter:
    """处理房源数据导入的核心服务"""
    
    def __init__(self):
        self.floor_parser = FloorParser()
    
    def find_or_create_community(self, name: str, db: Session, 
                                  city_id: Optional[int] = None,
                                  district: Optional[str] = None,
                                  business_circle: Optional[str] = None) -> int:
        """
        查找或创建小区
        
        逻辑:
        1. 先在 communities 表中精确匹配 name
        2. 如果不存在，检查 community_aliases 表
        3. 如果都不存在，创建新小区记录
        
        Args:
            name: 小区名称
            db: 数据库会话
            city_id: 城市ID (可选)
            district: 行政区 (可选)
            business_circle: 商圈 (可选)
        
        Returns:
            int: community_id
        """
        # 去除空格并标准化
        name = name.strip()
        
        # 1. 先在 communities 表中查找
        community = db.query(Community).filter(
            Community.name == name,
            Community.is_active == True
        ).first()
        
        if community:
            return community.id
        
        # 2. 在 community_aliases 表中查找
        alias = db.query(CommunityAlias).filter(
            CommunityAlias.alias_name == name
        ).first()
        
        if alias:
            return alias.community_id
        
        # 3. 创建新小区记录
        new_community = Community(
            name=name,
            city_id=city_id,
            district=district,
            business_circle=business_circle,
            total_properties=0,
            is_active=True,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        db.add(new_community)
        db.flush()  # 获取自增ID但不提交事务
        
        logger.info(f"创建新小区: {name} (ID: {new_community.id})")
        
        return new_community.id
    
    def create_history_snapshot(self, property_obj: PropertyCurrent, 
                                change_type: ChangeType, db: Session):
        """
        创建历史快照
        
        将 property_current 的当前状态复制到 property_history
        记录 change_type 和 captured_at
        
        Args:
            property_obj: PropertyCurrent 对象
            change_type: 变更类型
            db: 数据库会话
        """
        history = PropertyHistory(
            data_source=property_obj.data_source,
            source_property_id=property_obj.source_property_id,
            change_type=change_type,
            captured_at=datetime.now(),
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
        logger.info(f"创建历史快照: {property_obj.source_property_id} ({change_type.value})")
    
    def _determine_change_type(self, existing: PropertyCurrent, 
                               data: PropertyIngestionModel) -> ChangeType:
        """
        判断变更类型
        
        Args:
            existing: 现有房源记录
            data: 新数据
        
        Returns:
            ChangeType: 变更类型
        """
        # 检查状态变化
        if existing.status.value != data.status.value:
            return ChangeType.STATUS_CHANGE
        
        # 检查价格变化
        if data.status == "在售":
            if existing.listed_price_wan != data.listed_price_wan:
                return ChangeType.PRICE_CHANGE
        else:  # 成交
            if existing.sold_price_wan != data.sold_price_wan:
                return ChangeType.PRICE_CHANGE
        
        # 其他信息变化
        return ChangeType.INFO_CHANGE
    
    def import_property(self, data: PropertyIngestionModel, db: Session) -> ImportResult:
        """
        导入单条房源数据
        
        流程:
        1. 查找或创建小区 (find_or_create_community)
        2. 检查房源是否存在 (data_source + source_property_id)
        3. 如果存在: 创建历史快照 + 更新当前记录
        4. 如果不存在: 解析楼层 + 创建新记录
        
        Args:
            data: 验证后的房源数据
            db: 数据库会话
        
        Returns:
            ImportResult: 导入结果
        """
        try:
            # 1. 查找或创建小区
            community_id = self.find_or_create_community(
                name=data.community_name,
                db=db,
                city_id=data.city_id,
                district=data.district,
                business_circle=data.business_circle
            )
            
            # 2. 检查房源是否已存在
            existing_property = db.query(PropertyCurrent).filter(
                PropertyCurrent.data_source == data.data_source,
                PropertyCurrent.source_property_id == data.source_property_id
            ).first()
            
            if existing_property:
                # 3. 房源已存在 - 创建历史快照并更新
                change_type = self._determine_change_type(existing_property, data)
                self.create_history_snapshot(existing_property, change_type, db)
                
                # 更新现有记录
                self._update_property(existing_property, data, community_id, db)
                
                db.commit()
                
                logger.info(f"更新房源: {data.source_property_id} (ID: {existing_property.id})")
                
                return ImportResult(
                    success=True,
                    property_id=existing_property.id,
                    error=None
                )
            
            else:
                # 4. 新房源 - 解析楼层并创建
                floor_info = self.floor_parser.parse_floor(data.floor_original)
                
                new_property = PropertyCurrent(
                    data_source=data.data_source,
                    source_property_id=data.source_property_id,
                    community_id=community_id,
                    status=PropertyStatus(data.status.value),
                    property_type=data.property_type,
                    rooms=data.rooms,
                    halls=data.halls,
                    baths=data.baths,
                    orientation=data.orientation,
                    floor_original=data.floor_original,
                    floor_number=floor_info.floor_number,
                    total_floors=floor_info.total_floors,
                    floor_level=floor_info.floor_level,
                    build_area=data.build_area,
                    inner_area=data.inner_area,
                    listed_price_wan=data.listed_price_wan,
                    listed_date=data.listed_date,
                    sold_price_wan=data.sold_price_wan,
                    sold_date=data.sold_date,
                    build_year=data.build_year,
                    building_structure=data.building_structure,
                    decoration=data.decoration,
                    elevator=data.elevator,
                    ownership_type=data.ownership_type,
                    ownership_years=data.ownership_years,
                    last_transaction=data.last_transaction,
                    heating_method=data.heating_method,
                    listing_remarks=data.listing_remarks,
                    is_active=True,
                    created_at=datetime.now(),
                    updated_at=datetime.now()
                )
                
                db.add(new_property)
                db.commit()
                db.refresh(new_property)
                
                logger.info(f"创建新房源: {data.source_property_id} (ID: {new_property.id})")
                
                return ImportResult(
                    success=True,
                    property_id=new_property.id,
                    error=None
                )
        
        except IntegrityError as e:
            db.rollback()
            # 使用统一的错误格式化
            error_msg = ErrorHandler.format_database_error(e)
            logger.error(f"导入失败 - {data.source_property_id}: {error_msg}")
            
            # 保存失败记录
            ErrorHandler.save_failed_record(
                data=data.model_dump(by_alias=True),
                error_message=error_msg,
                failure_type="database_integrity_error",
                data_source=data.data_source
            )
            
            return ImportResult(
                success=False,
                property_id=None,
                error=error_msg
            )
        
        except SQLAlchemyError as e:
            db.rollback()
            # 使用统一的错误格式化
            error_msg = ErrorHandler.format_database_error(e)
            logger.error(f"导入失败 - {data.source_property_id}: {error_msg}")
            
            # 保存失败记录
            ErrorHandler.save_failed_record(
                data=data.model_dump(by_alias=True),
                error_message=error_msg,
                failure_type="database_error",
                data_source=data.data_source
            )
            
            return ImportResult(
                success=False,
                property_id=None,
                error=error_msg
            )
        
        except Exception as e:
            db.rollback()
            error_msg = f"导入失败: {str(e)}"
            logger.error(f"导入失败 - {data.source_property_id}: {error_msg}")
            
            # 保存失败记录
            ErrorHandler.save_failed_record(
                data=data.model_dump(by_alias=True),
                error_message=error_msg,
                failure_type="import_error",
                data_source=data.data_source
            )
            
            return ImportResult(
                success=False,
                property_id=None,
                error=error_msg
            )
    
    def _update_property(self, property_obj: PropertyCurrent, 
                        data: PropertyIngestionModel, 
                        community_id: int, db: Session):
        """
        更新现有房源记录
        
        Args:
            property_obj: 现有房源对象
            data: 新数据
            community_id: 小区ID
            db: 数据库会话
        """
        # 解析楼层信息
        floor_info = self.floor_parser.parse_floor(data.floor_original)
        
        # 更新所有字段
        property_obj.community_id = community_id
        property_obj.status = PropertyStatus(data.status.value)
        property_obj.property_type = data.property_type
        property_obj.rooms = data.rooms
        property_obj.halls = data.halls
        property_obj.baths = data.baths
        property_obj.orientation = data.orientation
        property_obj.floor_original = data.floor_original
        property_obj.floor_number = floor_info.floor_number
        property_obj.total_floors = floor_info.total_floors
        property_obj.floor_level = floor_info.floor_level
        property_obj.build_area = data.build_area
        property_obj.inner_area = data.inner_area
        property_obj.listed_price_wan = data.listed_price_wan
        property_obj.listed_date = data.listed_date
        property_obj.sold_price_wan = data.sold_price_wan
        property_obj.sold_date = data.sold_date
        property_obj.build_year = data.build_year
        property_obj.building_structure = data.building_structure
        property_obj.decoration = data.decoration
        property_obj.elevator = data.elevator
        property_obj.ownership_type = data.ownership_type
        property_obj.ownership_years = data.ownership_years
        property_obj.last_transaction = data.last_transaction
        property_obj.heating_method = data.heating_method
        property_obj.listing_remarks = data.listing_remarks
        property_obj.updated_at = datetime.now()
