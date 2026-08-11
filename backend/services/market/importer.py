"""房源导入服务.

处理房源数据的导入、更新和历史快照记录.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from models import (
    ChangeType,
    Community,
    CommunityAlias,
    MediaType,
    PropertyCurrent,
    PropertyHistory,
    PropertyMedia,
    PropertyStatus,
)
from schemas import ImportResult, PropertyIngestionModel
from services.market.community_image_service import CommunityImageService
from services.system import save_failed_record
from utils.error_formatters import format_database_error
from utils.floor_plan import get_floor_plan
from utils.image_download import download_external_image

from .parser import FloorParser

logger = logging.getLogger(__name__)


@dataclass
class _CommunityData:
    community_name: str
    city_id: int | None = None
    district: str | None = None
    business_circle: str | None = None


class PropertyImporter:
    """处理房源数据导入的核心服务."""

    def __init__(self) -> None:
        """初始化导入器."""
        self.floor_parser = FloorParser()

    def import_property(self, data: PropertyIngestionModel, db: Session, user_id: str = "") -> ImportResult:
        """导入单条房源数据的入口方法.

        Args:
            data: 房源数据
            db: 数据库会话
            user_id: 用户ID（可选，默认为空字符串）

        Note:
            此方法不再内部调用 db.commit()，事务管理由调用方负责。
            使用 savepoint (begin_nested) 保护单条记录，失败时仅回滚到 savepoint，
            不影响同批次中其他记录的 session 状态。

        """
        try:
            nested = db.begin_nested()
            try:
                result = self._process_import_transaction(data, db, user_id)
                nested.commit()
            except Exception as e:
                nested.rollback()
                return self._handle_import_error(e, data)
            else:
                return result
        except Exception as e:
            return self._handle_import_error(e, data)

    def _process_import_transaction(self, data: PropertyIngestionModel, db: Session, user_id: str = "") -> ImportResult:
        """处理核心导入逻辑（不包含事务提交，由调用方管理事务）."""
        community_id = self.find_or_create_community(data, db)

        existing_property = self._get_existing_property(data, db)

        if existing_property:
            self._handle_update(existing_property, data, community_id, db, user_id)
            property_id = existing_property.id
            action = "更新"
        else:
            new_property = self._handle_creation(data, community_id, db, user_id)
            property_id = new_property.id
            action = "创建"

        # 注意：移除了 db.commit()，事务提交由外层调用方管理
        # 这样可以确保批次级别的原子性
        logger.info("%s房源: %s (ID: %s, 用户ID: %s)", action, data.source_property_id, property_id, user_id)

        return ImportResult(success=True, property_id=property_id, error=None)

    def find_or_create_community(
        self,
        data: PropertyIngestionModel | str,
        db: Session,
        city_id: int | None = None,
        district: str | None = None,
        business_circle: str | None = None,
    ) -> str:
        """查找或创建小区.

        Args:
            data: PropertyIngestionModel 对象或小区名称字符串（向后兼容）
            db: 数据库会话
            city_id: 城市ID（可选，用于向后兼容）
            district: 行政区（可选，用于向后兼容）
            business_circle: 商圈（可选，用于向后兼容）

        Returns:
            小区ID

        """
        # 处理向后兼容：支持直接传入小区名称字符串
        if isinstance(data, str):
            name = data.strip()
            data = _CommunityData(name, city_id, district, business_circle)
        else:
            name = data.community_name.strip()

        # 1. 尝试查找 (名称匹配或别名匹配)
        community = self._find_community_by_name_or_alias(name, db)

        if community:
            self._update_community_info_if_needed(community, data, db)
            return community.id

        # 2. 创建新小区
        return self._create_community(name, data, db)

    def _find_community_by_name_or_alias(self, name: str, db: Session) -> Community | None:
        """通过名称或别名查找小区对象."""
        # 直接匹配
        community = (
            db.query(Community)
            .filter(
                Community.name == name,
                Community.is_active.is_(True),
            )
            .first()
        )
        if community:
            return community

        # 别名匹配
        alias = (
            db.query(CommunityAlias)
            .filter(CommunityAlias.alias_name == name, CommunityAlias.is_deleted.is_(False))
            .first()
        )
        if alias:
            return db.get(Community, alias.community_id)

        return None

    def _update_community_info_if_needed(
        self,
        community: Community,
        data: PropertyIngestionModel | _CommunityData,
        db: Session,
    ) -> None:
        """如果信息缺失，更新小区补充信息."""
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
            community.updated_at = datetime.now(timezone.utc)
            # flush 不是必须的，commit 会处理，但在长事务中 flush 可以保持状态一致
            db.flush()

    def _create_community(self, name: str, data: PropertyIngestionModel | _CommunityData, db: Session) -> str:
        """创建新的小区记录."""
        new_community = Community(
            name=name,
            city_id=data.city_id,
            district=data.district,
            business_circle=data.business_circle,
            total_properties=0,
            is_active=True,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(new_community)
        db.flush()  # 获取 ID
        logger.info("创建新小区: %s (ID: %s)", name, new_community.id)
        return new_community.id

    def _get_existing_property(self, data: PropertyIngestionModel, db: Session) -> PropertyCurrent | None:
        return (
            db.query(PropertyCurrent)
            .filter(
                PropertyCurrent.data_source == data.data_source,
                PropertyCurrent.source_property_id == data.source_property_id,
            )
            .first()
        )

    def _handle_update(
        self,
        existing: PropertyCurrent,
        data: PropertyIngestionModel,
        community_id: str,
        db: Session,
        user_id: str,
    ) -> None:
        """处理更新逻辑：快照 + 更新当前表."""
        change_type = self._determine_change_type(existing, data)
        self._create_history_snapshot(existing, change_type, db)
        self._map_data_to_property(existing, data, community_id, user_id)
        self._save_property_media(data, db, community_id)

    def _handle_creation(
        self,
        data: PropertyIngestionModel,
        community_id: str,
        db: Session,
        user_id: str,
    ) -> PropertyCurrent:
        """处理创建逻辑."""
        new_property = PropertyCurrent(
            data_source=data.data_source,
            source_property_id=data.source_property_id,
            created_at=datetime.now(timezone.utc),
            is_active=True,
        )
        self._map_data_to_property(new_property, data, community_id, user_id)
        db.add(new_property)
        db.flush()  # 确保获取ID，方便后续日志或返回
        self._save_property_media(data, db, community_id)
        return new_property

    def _map_data_to_property(
        self,
        prop: PropertyCurrent,
        data: PropertyIngestionModel,
        community_id: str,
        user_id: str,
    ) -> None:
        """统一的数据映射方法.

        同时用于 Create 和 Update，消除代码重复.
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
        prop.owner_id = user_id
        prop.updated_at = datetime.now(timezone.utc)

    def create_history_snapshot(self, property_obj: PropertyCurrent, change_type: ChangeType, db: Session) -> None:
        """创建历史快照（公有方法，向后兼容）.

        Note: 此方法不再内部调用 db.commit()，事务管理由调用方负责
        """
        self._create_history_snapshot(property_obj, change_type, db)

    def _create_history_snapshot(self, property_obj: PropertyCurrent, change_type: ChangeType, db: Session) -> None:
        """创建历史快照（内部实现）."""
        history = PropertyHistory(
            data_source=property_obj.data_source,
            source_property_id=property_obj.source_property_id,
            change_type=change_type,
            captured_at=datetime.now(timezone.utc),
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
            decoration=property_obj.decoration,
        )
        db.add(history)
        logger.debug("创建历史快照: %s (%s)", property_obj.source_property_id, change_type.value)

    def _determine_change_type(self, existing: PropertyCurrent, data: PropertyIngestionModel) -> ChangeType:
        if existing.status.value != data.status.value:
            return ChangeType.STATUS_CHANGE

        is_for_sale = data.status.value == PropertyStatus.FOR_SALE.value

        if is_for_sale:
            if existing.listed_price_wan != data.listed_price_wan:
                return ChangeType.PRICE_CHANGE
        elif existing.sold_price_wan != data.sold_price_wan:
            return ChangeType.PRICE_CHANGE

        return ChangeType.INFO_CHANGE

    def _handle_import_error(self, e: Exception, data: PropertyIngestionModel) -> ImportResult:
        """统一的异常处理逻辑.

        Note: 事务回滚由 import_property 中的 savepoint 处理，此方法仅负责错误记录。
        """
        error_msg = format_database_error(e) if isinstance(e, SQLAlchemyError) else str(e)
        failure_type = "database_error" if isinstance(e, SQLAlchemyError) else "import_error"
        if isinstance(e, IntegrityError):
            failure_type = "database_integrity_error"

        logger.error("导入失败 - %s: %s", data.source_property_id, error_msg)

        save_failed_record(
            data=data.model_dump(by_alias=True),
            error_message=error_msg,
            failure_type=failure_type,
            data_source=data.data_source,
        )

        return ImportResult(
            success=False,
            property_id=None,
            error=error_msg,
        )

    def _save_property_media(
        self,
        data: PropertyIngestionModel,
        db: Session,
        community_id: str,
    ) -> None:
        """保存户型图到 ``property_media`` 表并归类到 ``community_images``.

        链路设计（BREAKING）：整个 ``property_media`` 表只保存户型图，其他类型图片
        不下载、不保存。流程：
        1. 用 ``get_floor_plan(data.data_source, data.image_urls)`` 从图片列表选出户型图 URL
        2. 选不到户型图（返回 None）时不保存任何记录
        3. 外站图片（http/https）下载到本地存储，失败时回退原 URL（仍保存到 property_media）
        4. 下载/保存成功后调用 ``CommunityImageService.classify_to_community`` 归类到
           ``community_images``（``source=scraped``）
        5. 归类失败不影响主流程（log warning，继续），不回滚 property_media 已保存的记录

        Args:
            data: 房源导入数据
            db: 数据库会话
            community_id: 房源关联小区ID（可空，空时跳过归类）

        """
        if not data.image_urls:
            logger.debug("房源 %s 没有图片链接，跳过媒体资源保存", data.source_property_id)
            return

        try:
            # 1. 选出户型图 URL（与前端 getFloorPlan 完全等价）
            floor_plan_url = get_floor_plan(data.data_source, data.image_urls)
            if not floor_plan_url:
                logger.info(
                    "房源 %s 未识别到户型图，不保存任何图片到 property_media",
                    data.source_property_id,
                )
                return

            # 2. 删除该房源现有的所有图片记录（确保更新时不会重复）
            db.query(PropertyMedia).filter(
                PropertyMedia.data_source == data.data_source,
                PropertyMedia.source_property_id == data.source_property_id,
            ).delete()

            # 3. 外站图片下载到本地存储，失败时回退原 URL
            stored_url = floor_plan_url
            if floor_plan_url.startswith(("http://", "https://")):
                downloaded = download_external_image(floor_plan_url)
                if downloaded:
                    stored_url = downloaded
                # 下载失败保留原外站 URL（admin 端可加载外站 URL）

            media_record = PropertyMedia(
                data_source=data.data_source,
                source_property_id=data.source_property_id,
                media_type=MediaType.OTHER,  # 统一作为"其他"类型，前端自行选择展示
                url=stored_url,
                sort_order=0,
                created_at=datetime.now(timezone.utc),
            )
            db.add(media_record)
            db.flush()
            logger.info(
                "保存房源 %s 的户型图: %s -> %s",
                data.source_property_id,
                floor_plan_url,
                stored_url,
            )

            # 4. 归类到 community_images（community_id 为空时由 Service 跳过）
            try:
                CommunityImageService.classify_to_community(
                    db=db,
                    community_id=community_id,
                    url=stored_url,
                    source_property_id=data.source_property_id,
                )
            except Exception as classify_err:
                # 归类失败不影响主流程，log warning 继续，不回滚 property_media 已保存的记录
                logger.warning(
                    "房源 %s 户型图归类到 community_images 失败: %s",
                    data.source_property_id,
                    classify_err,
                )

        except Exception as e:
            # 图片保存失败不影响主流程，记录警告即可
            logger.warning("保存房源 %s 图片链接失败: %s", data.source_property_id, e)
