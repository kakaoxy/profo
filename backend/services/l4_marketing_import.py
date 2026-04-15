"""
L4 市场营销层导入服务
负责从L3项目导入数据到L4营销房源
"""
from typing import Optional, List
from decimal import Decimal
from sqlalchemy.orm import Session

from models import Project, RenovationPhoto, Community
from schemas.l4_project_import import (
    L3ProjectImportResponse,
    ImportableMediaResponse
)


class L4MarketingImportService:
    """L4营销导入服务
    
    负责从L3项目导入数据，实现写时复制(CoW)模式
    """

    def __init__(self, db: Session) -> None:
        self.db: Session = db

    def import_from_l3_project(
        self,
        project_id: str
    ) -> Optional[L3ProjectImportResponse]:
        """从L3项目导入数据

        采用写时复制模式，将L3项目数据转换为L4营销房源初始数据

        Args:
            project_id: L3项目ID

        Returns:
            导入数据响应，项目不存在返回None
        """
        # 查询项目及其关联数据
        project: Optional[Project] = self.db.query(Project).filter(
            Project.id == project_id,
            Project.is_deleted == False
        ).first()

        if not project:
            return None

        # 获取小区ID
        community_id = self._get_community_id(project.community_name)

        # 计算价格
        area = project.area
        total_price = self._get_total_price(project)
        unit_price = self._calculate_unit_price(area, total_price)

        # 生成标题
        title = self._generate_title(project)

        # 获取可导入的媒体资源
        available_media = self._get_available_media(project_id)

        # 从地址提取楼层信息
        floor_info = self._extract_floor_info(project.address)

        return L3ProjectImportResponse(
            project_id=project_id,
            community_id=community_id,
            community_name=project.community_name or "",
            layout=project.layout,
            orientation=project.orientation,
            floor_info=floor_info,
            area=area,
            total_price=total_price,
            unit_price=unit_price,
            title=title,
            tags=None,
            decoration_style=None,
            available_media=available_media
        )

    def _get_community_id(self, community_name: Optional[str]) -> Optional[int]:
        """根据小区名称获取小区ID"""
        if not community_name:
            return None
        community: Optional[Community] = self.db.query(Community).filter(
            Community.name == community_name
        ).first()
        return community.id if community else None

    def _get_total_price(self, project: Project) -> Optional[Decimal]:
        """获取总价（优先使用签约价格）"""
        if project.contract and project.contract.signing_price:
            return project.contract.signing_price
        if project.sale and project.sale.list_price:
            return project.sale.list_price
        return None

    def _calculate_unit_price(
        self,
        area: Optional[Decimal],
        total_price: Optional[Decimal]
    ) -> Optional[Decimal]:
        """计算单价"""
        if area and total_price and area > Decimal('0'):
            return total_price / area
        return None

    def _generate_title(self, project: Project) -> str:
        """生成标题"""
        parts = []
        if project.community_name:
            parts.append(project.community_name)
        if project.layout:
            parts.append(project.layout)
        if project.orientation:
            parts.append(project.orientation)
        return " ".join(parts) if parts else "未命名房源"

    def _get_available_media(self, project_id: str) -> List[ImportableMediaResponse]:
        """获取项目可导入的媒体资源"""
        photos: List[RenovationPhoto] = self.db.query(RenovationPhoto).filter(
            RenovationPhoto.project_id == project_id,
            RenovationPhoto.is_deleted == False
        ).order_by(RenovationPhoto.created_at).all()

        return [
            ImportableMediaResponse(
                id=photo.id,
                file_url=photo.url,
                thumbnail_url=photo.url,
                photo_category="renovation",
                renovation_stage=photo.stage,
                description=photo.description,
                sort_order=idx
            )
            for idx, photo in enumerate(photos)
        ]

    def _extract_floor_info(self, address: Optional[str]) -> Optional[str]:
        """从地址中提取楼层信息

        尝试从地址中解析楼层信息，例如：
        - "1号楼2单元301室" -> "3层"
        - "12号楼1单元1502室" -> "15层"

        Args:
            address: 物业地址

        Returns:
            提取的楼层信息，无法提取时返回None
        """
        if not address:
            return None

        import re

        # 匹配房间号模式：通常是3-4位数字，前1-2位表示楼层
        # 如 301 -> 3层, 1502 -> 15层, 0801 -> 8层
        patterns = [
            r'(\d+)号楼.*?(\d+)单元(\d{3,4})室',  # 1号楼2单元301室
            r'(\d+)栋.*?(\d+)单元(\d{3,4})室',   # 1栋2单元301室
            r'(\d+)[栋号楼].*?(\d{3,4})[室号]',    # 1号楼301室
            r'(\d{3,4})室',                       # 301室
        ]

        for pattern in patterns:
            match = re.search(pattern, address)
            if match:
                groups = match.groups()
                if len(groups) >= 3:
                    room_number = groups[2]
                elif len(groups) >= 2:
                    room_number = groups[1]
                else:
                    room_number = groups[0]

                # 根据房间号计算楼层
                if len(room_number) >= 3:
                    floor = room_number[:-2]  # 去掉后两位，前面是楼层
                    try:
                        floor_num = int(floor)
                        if 1 <= floor_num <= 100:
                            return f"{floor_num}层"
                    except ValueError:
                        continue

        return None
