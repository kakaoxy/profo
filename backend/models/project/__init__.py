"""项目管理模块.

包含项目全生命周期管理的所有模型.
"""

# 导入关系定义
from ._project_base import Project
from ._project_contract import ProjectContract
from ._project_finance import FinanceRecord
from ._project_followup import ProjectEvaluation, ProjectFollowUp
from ._project_interaction import ProjectInteraction
from ._project_owner import ProjectOwner
from ._project_renovation import ProjectRenovation, RenovationPhoto
from ._project_sale import ProjectSale
from ._project_status_log import ProjectStatusLog

__all__ = [
    "FinanceRecord",
    "Project",
    "ProjectContract",
    "ProjectEvaluation",
    "ProjectFollowUp",
    "ProjectInteraction",
    "ProjectOwner",
    "ProjectRenovation",
    "ProjectSale",
    "ProjectStatusLog",
    "RenovationPhoto",
]
