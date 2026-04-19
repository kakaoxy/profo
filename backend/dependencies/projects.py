"""
项目服务相关依赖注入函数
"""
from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from db import get_db
from services import ProjectService


def get_project_service(db: Annotated[Session, Depends(get_db)]) -> ProjectService:
    """
    获取项目服务实例

    Args:
        db: 数据库会话

    Returns:
        ProjectService: 项目服务实例
    """
    return ProjectService(db)


# 项目服务依赖类型
ProjectServiceDep = Annotated[ProjectService, Depends(get_project_service)]

__all__ = [
    "ProjectServiceDep",
    "get_project_service",
]
