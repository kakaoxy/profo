"""项目创建服务模块.

负责项目的创建流程，包括基础记录、合同记录和业主记录的创建。
"""

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from models import Project, ProjectContract, ProjectOwner
from models.common import ProjectStatus
from schemas.project import ProjectCreate
from services.utils import parse_date_string

from . import documents, owners

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


class ProjectCreator:
    """项目创建服务.

    负责项目的全创建流程，包括：
    - 项目基础记录的创建
    - 合同记录的创建
    - 业主记录的创建（如提供）

    Attributes:
        db: SQLAlchemy数据库会话

    """

    def __init__(self, db: "Session") -> None:
        """初始化项目创建服务.

        Args:
            db: SQLAlchemy数据库会话

        """
        self.db = db

    def create(self, project_data: ProjectCreate) -> Project:
        """创建项目.

        同时创建项目基础记录、合同记录和业主记录（如提供）。
        项目创建后状态默认为"签约中"。

        Args:
            project_data: 项目创建数据

        Returns:
            创建成功的项目模型实例

        """
        project_id = uuid.uuid4()
        now = datetime.now(timezone.utc)

        # 1. 创建项目基础记录
        project = self._create_base_project(project_id, project_data, now)

        # 2. 创建合同记录
        self._create_contract_record(project_id, project_data, now)

        # 3. 创建业主记录（如果提供了业主信息）
        #    owners 数组优先：提供了 owners 时跳过遗留字段创建，避免重复记录
        if project_data.owners is None:
            self._create_owner_record(project_id, project_data, now)

        # 4. 同步业主列表（如果提供了 owners 数组）
        if project_data.owners is not None:
            owners.sync_owners(self.db, project_id, project_data.owners)

        # 5. 初始化文书签收清单（business_form 非 NULL 时）
        if project_data.business_form is not None:
            documents.initialize_documents(self.db, project_id, project_data.business_form)

        self.db.commit()
        self.db.refresh(project)

        return project

    def _create_base_project(
        self,
        project_id: uuid.UUID,
        project_data: ProjectCreate,
        now: datetime,
    ) -> Project:
        """创建项目基础记录."""
        project = Project(
            id=project_id,
            community_id=project_data.community_id,
            community_name=project_data.community_name,
            address=project_data.address,
            area=project_data.area,
            layout=project_data.layout,
            orientation=project_data.orientation,
            floor_info=project_data.floor_info,
            electricity_account=project_data.electricity_account,
            water_account=project_data.water_account,
            gas_account=project_data.gas_account,
            project_manager_id=project_data.project_manager_id,
            status=ProjectStatus.SIGNING.value,
            business_form=project_data.business_form,
            commission_start_date=project_data.commission_start_date,
            commission_end_date=project_data.commission_end_date,
            is_deleted=False,
            created_at=now,
            updated_at=now,
        )
        project.name = project.generate_name()
        self.db.add(project)
        return project

    def _create_contract_record(
        self,
        project_id: uuid.UUID,
        project_data: ProjectCreate,
        now: datetime,
    ) -> None:
        """创建合同记录.

        若 contract_no 已有 reserved 占位记录（由 ContractNumberGenerator 预占），
        则更新该记录为正式合同；否则新建合同记录。
        """
        signing_date = parse_date_string(project_data.signing_date)
        planned_handover_date = parse_date_string(project_data.planned_handover_date)

        # Convert signing_materials Pydantic models to dicts for JSON serialization
        signing_materials = None
        if project_data.signing_materials:
            signing_materials = [m.model_dump() for m in project_data.signing_materials]

        contract_status = "生效" if signing_date else "未生效"

        # 查找预占式生成器留下的 reserved 占位记录
        existing = (
            self.db.query(ProjectContract)
            .filter(
                ProjectContract.contract_no == project_data.contract_no,
                ProjectContract.contract_status == "reserved",
                ProjectContract.is_deleted.is_(False),
            )
            .first()
        )
        if existing is not None:
            # 复用占位记录：更新为正式合同
            existing.project_id = project_id
            existing.signing_price = project_data.signing_price
            existing.signing_date = signing_date
            existing.signing_period = project_data.signing_period
            existing.extension_period = project_data.extension_period
            existing.extension_rent = project_data.extension_rent
            existing.cost_assumption_type = project_data.cost_assumption_type
            existing.cost_assumption_other = project_data.cost_assumption_other
            existing.planned_handover_date = planned_handover_date
            existing.other_agreements = project_data.other_agreements
            existing.signing_materials = signing_materials
            existing.contract_status = contract_status
            existing.updated_at = now
            return

        contract = ProjectContract(
            id=uuid.uuid4(),
            project_id=project_id,
            contract_no=project_data.contract_no,
            signing_price=project_data.signing_price,
            signing_date=signing_date,
            signing_period=project_data.signing_period,
            extension_period=project_data.extension_period,
            extension_rent=project_data.extension_rent,
            cost_assumption_type=project_data.cost_assumption_type,
            cost_assumption_other=project_data.cost_assumption_other,
            planned_handover_date=planned_handover_date,
            other_agreements=project_data.other_agreements,
            signing_materials=signing_materials,
            contract_status=contract_status,
            is_deleted=False,
            created_at=now,
            updated_at=now,
        )
        self.db.add(contract)

    def _create_owner_record(
        self,
        project_id: uuid.UUID,
        project_data: ProjectCreate,
        now: datetime,
    ) -> None:
        """创建业主记录（如果提供了业主信息）."""
        if any(
            [
                project_data.owner_name,
                project_data.owner_phone,
                project_data.owner_id_card,
            ],
        ):
            owner = ProjectOwner(
                id=uuid.uuid4(),
                project_id=project_id,
                owner_name=project_data.owner_name,
                owner_phone=project_data.owner_phone,
                owner_id_card=project_data.owner_id_card,
                relation_type="业主",
                owner_info=project_data.notes,
                is_deleted=False,
                created_at=now,
                updated_at=now,
            )
            self.db.add(owner)
