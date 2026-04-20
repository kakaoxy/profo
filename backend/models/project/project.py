"""
项目管理相关模型
按功能职责拆分的组件化模块
"""
from sqlalchemy.orm import relationship

from ._project_base import Project
from ._project_contract import ProjectContract
from ._project_owner import ProjectOwner
from ._project_sale import ProjectSale
from ._project_followup import ProjectFollowUp, ProjectEvaluation
from ._project_interaction import ProjectInteraction
from ._project_finance import FinanceRecord
from ._project_status_log import ProjectStatusLog
from ._project_renovation import ProjectRenovation, RenovationPhoto

Project.contract = relationship("ProjectContract", back_populates="project", uselist=False, cascade="all, delete-orphan")
Project.owners = relationship("ProjectOwner", back_populates="project", cascade="all, delete-orphan")
Project.sale = relationship("ProjectSale", back_populates="project", uselist=False, cascade="all, delete-orphan")
Project.follow_ups = relationship("ProjectFollowUp", back_populates="project", cascade="all, delete-orphan")
Project.evaluations = relationship("ProjectEvaluation", back_populates="project", cascade="all, delete-orphan")
Project.interactions = relationship("ProjectInteraction", back_populates="project", cascade="all, delete-orphan")
Project.finance_records = relationship("FinanceRecord", back_populates="project", cascade="all, delete-orphan")
Project.status_logs = relationship("ProjectStatusLog", back_populates="project", cascade="all, delete-orphan")
Project.renovation = relationship("ProjectRenovation", back_populates="project", uselist=False, cascade="all, delete-orphan")
Project.renovation_photos = relationship("RenovationPhoto", back_populates="project", cascade="all, delete-orphan")

ProjectContract.project = relationship("Project", back_populates="contract")
ProjectOwner.project = relationship("Project", back_populates="owners")
ProjectSale.project = relationship("Project", back_populates="sale")
ProjectFollowUp.project = relationship("Project", back_populates="follow_ups")
ProjectEvaluation.project = relationship("Project", back_populates="evaluations")
ProjectInteraction.project = relationship("Project", back_populates="interactions")
FinanceRecord.project = relationship("Project", back_populates="finance_records")
ProjectStatusLog.project = relationship("Project", back_populates="status_logs")
ProjectRenovation.project = relationship("Project", back_populates="renovation")
ProjectRenovation.photos = relationship("RenovationPhoto", back_populates="renovation", cascade="all, delete-orphan")
RenovationPhoto.project = relationship("Project", back_populates="renovation_photos")
RenovationPhoto.renovation = relationship("ProjectRenovation", back_populates="photos")

from models.user.user import User
Project.project_manager = relationship("User", back_populates="managed_projects")
User.managed_projects = relationship("Project", back_populates="project_manager")

__all__ = [
    "Project",
    "ProjectContract",
    "ProjectOwner",
    "ProjectSale",
    "ProjectFollowUp",
    "ProjectEvaluation",
    "ProjectInteraction",
    "FinanceRecord",
    "ProjectStatusLog",
    "ProjectRenovation",
    "RenovationPhoto",
]