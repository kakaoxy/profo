"""
数据解析工具
包含楼层信息解析器
"""
import re
from dataclasses import dataclass
from typing import Optional


@dataclass
class FloorInfo:
    """楼层信息数据类"""
    floor_number: Optional[int] = None
    total_floors: Optional[int] = None
    floor_level: Optional[str] = None


class FloorParser:
    """楼层信息解析器"""
    
    # 楼层级别常量
    LEVEL_LOW = "低楼层"
    LEVEL_MID = "中楼层"
    LEVEL_HIGH = "高楼层"
    
    @staticmethod
    def parse_floor(floor_original: str) -> FloorInfo:
        """
        解析楼层字符串
        
        支持格式:
        - "高楼层/18" -> floor_number=None, total_floors=18, level="高楼层"
        - "15/28" -> floor_number=15, total_floors=28, level="中楼层"
        - "中楼层/共28层" -> floor_number=None, total_floors=28, level="中楼层"
        - "低楼层(共18层)" -> floor_number=None, total_floors=18, level="低楼层"
        - "3层/共6层" -> floor_number=3, total_floors=6, level="中楼层"
        
        Args:
            floor_original: 原始楼层字符串
            
        Returns:
            FloorInfo: 解析后的楼层信息
        """
        if not floor_original or not isinstance(floor_original, str):
            return FloorInfo()
        
        # 去除空格
        floor_str = floor_original.strip()
        
        if not floor_str:
            return FloorInfo()
        
        floor_info = FloorInfo()
        
        # 尝试提取中文楼层级别 (低楼层/中楼层/高楼层)
        level_match = re.search(r'(低楼层|中楼层|高楼层)', floor_str)
        if level_match:
            floor_info.floor_level = level_match.group(1)
        
        # 尝试提取总楼层数
        # 匹配模式: "共X层", "/X", "(共X层)", "总X层"
        total_patterns = [
            r'共\s*(\d+)\s*层',  # 共18层
            r'/\s*(\d+)(?:\s*层)?',  # /18 或 /18层
            r'\(\s*共\s*(\d+)\s*层\s*\)',  # (共18层)
            r'总\s*(\d+)\s*层',  # 总18层
        ]
        
        for pattern in total_patterns:
            match = re.search(pattern, floor_str)
            if match:
                try:
                    floor_info.total_floors = int(match.group(1))
                    break
                except (ValueError, IndexError):
                    continue
        
        # 尝试提取当前楼层数
        # 匹配模式: "15/28", "15层/28层", "第15层"
        floor_patterns = [
            r'^(\d+)\s*/\s*\d+',  # 15/28 (开头的数字/数字)
            r'^(\d+)\s*层',  # 15层 (开头的数字层)
            r'第\s*(\d+)\s*层',  # 第15层
        ]
        
        for pattern in floor_patterns:
            match = re.search(pattern, floor_str)
            if match:
                try:
                    floor_info.floor_number = int(match.group(1))
                    break
                except (ValueError, IndexError):
                    continue
        
        # 如果有楼层数和总楼层数，但没有楼层级别，则计算楼层级别
        if floor_info.floor_number is not None and floor_info.total_floors is not None:
            if floor_info.floor_level is None:
                floor_info.floor_level = FloorParser.calculate_floor_level(
                    floor_info.floor_number, 
                    floor_info.total_floors
                )
        
        return floor_info
    
    @staticmethod
    def calculate_floor_level(floor_number: int, total_floors: int) -> str:
        """
        计算楼层级别
        
        规则:
        - <= 33%: 低楼层
        - 33% - 67%: 中楼层
        - > 67%: 高楼层
        
        Args:
            floor_number: 当前楼层数
            total_floors: 总楼层数
            
        Returns:
            str: 楼层级别 ("低楼层", "中楼层", "高楼层")
        """
        if floor_number <= 0 or total_floors <= 0:
            return FloorParser.LEVEL_MID  # 默认返回中楼层
        
        ratio = floor_number / total_floors
        
        if ratio <= 0.33:
            return FloorParser.LEVEL_LOW
        elif ratio <= 0.67:
            return FloorParser.LEVEL_MID
        else:
            return FloorParser.LEVEL_HIGH
