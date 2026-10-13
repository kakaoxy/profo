"""房源/楼盘字典域路由.

导出楼盘字典管理路由（/admin/building-dictionary）与存量绑定路由（/admin/*/dictionary-link）。
"""

from .building_dict import router as building_dict_router
from .dictionary_link import router as dictionary_link_router

__all__ = ["building_dict_router", "dictionary_link_router"]
