"""项目服务相关依赖注入函数."""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from db import get_db
from services import ProjectService
from services.projects.sales_summary import SalesSummaryService


def get_project_service(db: Annotated[Session, Depends(get_db)]) -> ProjectService:
    """获取项目服务实例.

    Args:
        db: 数据库会话

    Returns:
        ProjectService: 项目服务实例

    """
    return ProjectService(db)


def get_sales_summary_service(db: Annotated[Session, Depends(get_db)]) -> SalesSummaryService:
    """获取销售指标 hero 区聚合服务（/projects/sales-* 只读）.

    Args:
        db: 数据库会话

    Returns:
        SalesSummaryService: 销售指标聚合服务实例

    """
    return SalesSummaryService(db)


# 项目服务依赖类型
ProjectServiceDep = Annotated[ProjectService, Depends(get_project_service)]
SalesSummaryServiceDep = Annotated[SalesSummaryService, Depends(get_sales_summary_service)]

__all__ = [
    "ProjectServiceDep",
    "SalesSummaryServiceDep",
    "get_project_service",
    "get_sales_summary_service",
]
