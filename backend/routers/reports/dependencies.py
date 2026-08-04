"""商圈分析报表路由依赖.

提供路径参数校验、对比 ids 解析与查询参数筛选解析,
供 routers/reports/* 路由复用（链式依赖）.

依赖项职责：
- ``valid_community_id``: 校验路径参数 community_id 存在且 is_active=True，返回 ORM Community
- ``valid_compare_ids``: 解析对比接口 ids 逗号分隔字符串，校验数量 ∈ [2, 5]
- ``get_reports_filter``: 将查询参数解析为 ReportsFilter Pydantic 模型

注意：``DbSessionDep`` 实际定义在 ``dependencies/auth.py``（项目无独立 database.py 模块），
与 ``routers/market/communities.py``、``dependencies/projects.py`` 等现有导入风格保持一致.
"""

from typing import Annotated

from fastapi import Depends, Path, Query

from dependencies.auth import DbSessionDep
from models.property.community import Community
from schemas.reports.common import RangeOption, ReportsFilter
from services.reports.exceptions import CommunityNotFoundError, InvalidCompareIdsError
from services.reports.filter_builder import build_reports_filter

# 对比接口 ids 数量上下限
_MIN_COMPARE_IDS = 2
_MAX_COMPARE_IDS = 5


def valid_community_id(
    community_id: Annotated[str, Path(description="小区ID")],
    db: DbSessionDep,
) -> Community:
    """路径参数 community_id 校验.

    - 查询 Community 表 where id == community_id AND is_active == True
    - 不存在或 is_active=False 抛 CommunityNotFoundError（依赖层提前 404）
    - 返回 ORM 对象供路由复用（链式依赖）

    Args:
        community_id: 路径参数小区ID（UUID 字符串）
        db: 数据库会话

    Returns:
        Community: ORM 对象，路由可直接访问 .id / .name / .business_circle 等字段

    Raises:
        CommunityNotFoundError: 小区不存在或已停用（404）

    """
    community = (
        db.query(Community)
        .filter(
            Community.id == community_id,
            Community.is_active.is_(True),
        )
        .first()
    )
    if community is None:
        raise CommunityNotFoundError
    return community


# 链式依赖类型别名：路由声明 ValidCommunityIdDep 即可拿到 ORM Community
ValidCommunityIdDep = Annotated[Community, Depends(valid_community_id)]


def valid_compare_ids(
    ids: Annotated[str, Query(description="逗号分隔的商圈名列表")],
) -> list[str]:
    """对比接口 ids 数量校验.

    - 解析逗号分隔字符串为 list[str]
    - 去除空白与重复（保留首次出现顺序）
    - 数量 < 2 抛 InvalidCompareIdsError("至少需要 2 个商圈")
    - 数量 > 5 抛 InvalidCompareIdsError("最多支持 5 个商圈")

    Args:
        ids: 逗号分隔的商圈名列表（如 "朝阳区,海淀区,西城区"）

    Returns:
        list[str]: 去重后的商圈名列表（长度 ∈ [2, 5]）

    Raises:
        InvalidCompareIdsError: 数量非法（400）

    """
    seen: set[str] = set()
    parsed: list[str] = []
    for item in ids.split(","):
        name = item.strip()
        if name and name not in seen:
            seen.add(name)
            parsed.append(name)

    if len(parsed) < _MIN_COMPARE_IDS:
        msg = "至少需要 2 个商圈"
        raise InvalidCompareIdsError(msg)
    if len(parsed) > _MAX_COMPARE_IDS:
        msg = "最多支持 5 个商圈"
        raise InvalidCompareIdsError(msg)
    return parsed


# 对比接口 ids 依赖类型别名
ValidCompareIdsDep = Annotated[list[str], Depends(valid_compare_ids)]


def get_reports_filter(
    range: Annotated[RangeOption, Query(description="时间范围：4w/8w=周；6m/12m/24m=月")] = RangeOption.W4,
    sources: Annotated[str | None, Query(description="逗号分隔的数据来源（链家/贝壳/网签）")] = None,
    business_circles: Annotated[str | None, Query(description="逗号分隔的商圈名称列表（多关键词模糊匹配）")] = None,
    community_name: Annotated[str | None, Query(description="小区名称模糊搜索")] = None,
    status: Annotated[str | None, Query(description="房源状态：在售/成交")] = None,
    rooms: Annotated[str | None, Query(description="逗号分隔的户型（如 1,2,4plus）")] = None,
    floor_levels: Annotated[str | None, Query(description="逗号分隔的楼层级别（低/中/高）")] = None,
) -> ReportsFilter:
    """FastAPI 依赖：将查询参数解析为 ReportsFilter Pydantic 模型.

    包装 services.reports.filter_builder.build_reports_filter,
    所有参数可选，未传时使用默认值或 None.

    Returns:
        ReportsFilter: 解析后的筛选模型，供 Service 层使用

    """
    return build_reports_filter(
        range=range,
        sources=sources,
        business_circles=business_circles,
        community_name=community_name,
        status=status,
        rooms=rooms,
        floor_levels=floor_levels,
    )


# 报表筛选依赖类型别名
ReportsFilterDep = Annotated[ReportsFilter, Depends(get_reports_filter)]


__all__ = [
    "ReportsFilterDep",
    "ValidCommunityIdDep",
    "ValidCompareIdsDep",
    "get_reports_filter",
    "valid_community_id",
    "valid_compare_ids",
]
