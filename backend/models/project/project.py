"""项目管理相关模型.

按功能职责拆分的组件化模块.
"""

from sqlalchemy.orm import relationship

from ._project_base import Project
from ._project_contract import ProjectContract
from ._project_finance import FinanceRecord
from ._project_followup import ProjectEvaluation, ProjectFollowUp
from ._project_interaction import ProjectInteraction
from ._project_owner import ProjectOwner
from ._project_renovation import ProjectRenovation, RenovationPhoto
from ._project_sale import ProjectSale
from ._project_status_log import ProjectStatusLog

# Project -> 子模型关系（逻辑外键，级联由Service处理）
Project.contract = relationship(
    "ProjectContract", back_populates="project", uselist=False,
    primaryjoin="Project.id == foreign(ProjectContract.project_id)",
)
Project.owners = relationship(
    "ProjectOwner", back_populates="project",
    primaryjoin="Project.id == foreign(ProjectOwner.project_id)",
)
Project.sale = relationship(
    "ProjectSale", back_populates="project", uselist=False,
    primaryjoin="Project.id == foreign(ProjectSale.project_id)",
)
Project.follow_ups = relationship(
    "ProjectFollowUp", back_populates="project",
    primaryjoin="Project.id == foreign(ProjectFollowUp.project_id)",
)
Project.evaluations = relationship(
    "ProjectEvaluation", back_populates="project",
    primaryjoin="Project.id == foreign(ProjectEvaluation.project_id)",
)
Project.interactions = relationship(
    "ProjectInteraction", back_populates="project",
    primaryjoin="Project.id == foreign(ProjectInteraction.project_id)",
)
Project.finance_records = relationship(
    "FinanceRecord", back_populates="project",
    primaryjoin="Project.id == foreign(FinanceRecord.project_id)",
)
Project.status_logs = relationship(
    "ProjectStatusLog", back_populates="project",
    primaryjoin="Project.id == foreign(ProjectStatusLog.project_id)",
)
Project.renovation = relationship(
    "ProjectRenovation", back_populates="project", uselist=False,
    primaryjoin="Project.id == foreign(ProjectRenovation.project_id)",
)
Project.renovation_photos = relationship(
    "RenovationPhoto", back_populates="project",
    primaryjoin="Project.id == foreign(RenovationPhoto.project_id)",
)

# 子模型 -> Project 关系
ProjectContract.project = relationship(
    "Project", back_populates="contract",
    foreign_keys="[ProjectContract.project_id]",
    primaryjoin="foreign(ProjectContract.project_id) == Project.id",
)
ProjectOwner.project = relationship(
    "Project", back_populates="owners",
    foreign_keys="[ProjectOwner.project_id]",
    primaryjoin="foreign(ProjectOwner.project_id) == Project.id",
)
ProjectSale.project = relationship(
    "Project", back_populates="sale",
    foreign_keys="[ProjectSale.project_id]",
    primaryjoin="foreign(ProjectSale.project_id) == Project.id",
)
ProjectFollowUp.project = relationship(
    "Project", back_populates="follow_ups",
    foreign_keys="[ProjectFollowUp.project_id]",
    primaryjoin="foreign(ProjectFollowUp.project_id) == Project.id",
)
ProjectEvaluation.project = relationship(
    "Project", back_populates="evaluations",
    foreign_keys="[ProjectEvaluation.project_id]",
    primaryjoin="foreign(ProjectEvaluation.project_id) == Project.id",
)
ProjectInteraction.project = relationship(
    "Project", back_populates="interactions",
    foreign_keys="[ProjectInteraction.project_id]",
    primaryjoin="foreign(ProjectInteraction.project_id) == Project.id",
)
FinanceRecord.project = relationship(
    "Project", back_populates="finance_records",
    foreign_keys="[FinanceRecord.project_id]",
    primaryjoin="foreign(FinanceRecord.project_id) == Project.id",
)
ProjectStatusLog.project = relationship(
    "Project", back_populates="status_logs",
    foreign_keys="[ProjectStatusLog.project_id]",
    primaryjoin="foreign(ProjectStatusLog.project_id) == Project.id",
)
ProjectRenovation.project = relationship(
    "Project", back_populates="renovation",
    foreign_keys="[ProjectRenovation.project_id]",
    primaryjoin="foreign(ProjectRenovation.project_id) == Project.id",
)
ProjectRenovation.photos = relationship(
    "RenovationPhoto", back_populates="renovation",
    primaryjoin="ProjectRenovation.id == foreign(RenovationPhoto.renovation_id)",
)
RenovationPhoto.project = relationship(
    "Project", back_populates="renovation_photos",
    foreign_keys="[RenovationPhoto.project_id]",
    primaryjoin="foreign(RenovationPhoto.project_id) == Project.id",
)
RenovationPhoto.renovation = relationship(
    "ProjectRenovation", back_populates="photos",
    foreign_keys="[RenovationPhoto.renovation_id]",
    primaryjoin="foreign(RenovationPhoto.renovation_id) == ProjectRenovation.id",
)

from models.user.user import User  # noqa: E402

Project.project_manager = relationship("User", back_populates="managed_projects", primaryjoin="foreign(Project.project_manager_id) == User.id")
User.managed_projects = relationship("Project", back_populates="project_manager", primaryjoin="foreign(Project.project_manager_id) == User.id")

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
