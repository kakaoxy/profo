"""
项目管理内部组件模块

包含项目服务的内部组件：查询、构建器、状态管理、创建、更新、合同编号生成等。
这些组件仅供 projects 模块内部使用。
"""

from .query import ProjectQueryService
from .builder import ProjectResponseBuilder
from .state import ProjectStateManager
from .creator import ProjectCreator
from .updater import ProjectUpdater
from .contract_number import ContractNumberGenerator

__all__ = [
    "ProjectQueryService",
    "ProjectResponseBuilder",
    "ProjectStateManager",
    "ProjectCreator",
    "ProjectUpdater",
    "ContractNumberGenerator",
]
