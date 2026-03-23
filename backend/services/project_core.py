"""
项目核心业务服务
负责：项目创建、列表查询、基础信息更新、状态流转

注意：此服务已适配新的规范化表结构。
项目基础信息在 projects 表，签约/业主/销售等信息在关联的子表中。
"""
from typing import Optional, Dict, Any, Union
from datetime import datetime
from sqlalchemy.orm import Session, selectinload, defer, noload
from sqlalchemy import func
from fastapi import HTTPException, status
import uuid

from models import Project, ProjectContract, ProjectOwner, ProjectSale, FinanceRecord
from models.base import ProjectStatus, CashFlowType
from schemas.project import ProjectCreate, ProjectUpdate, StatusUpdate, ProjectListResponse, ProjectResponse


def parse_date_string(value: Union[str, datetime, None]) -> Optional[datetime]:
    """解析日期字符串为 datetime 对象
    支持格式: YYYY-MM-DD, ISO 格式字符串, 或 datetime 对象
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        # 尝试解析 YYYY-MM-DD 格式
        if len(value) == 10 and value.count('-') == 2:
            try:
                year, month, day = map(int, value.split('-'))
                return datetime(year, month, day)
            except ValueError:
                pass
        # 尝试解析 ISO 格式
        try:
            return datetime.fromisoformat(value.replace('Z', '+00:00').replace('+00:00', ''))
        except ValueError:
            pass
        # 尝试其他格式
        try:
            return datetime.strptime(value, '%Y-%m-%dT%H:%M:%S.%fZ')
        except ValueError:
            pass
    return None


class ProjectCoreService:
    def __init__(self, db: Session):
        self.db = db

    def _get_project(self, project_id: str, include_all: bool = False) -> Project:
        """获取项目详情，同时加载关联的子表数据"""

        # 查询项目基本信息
        query = self.db.query(Project).filter(Project.id == project_id)

        if include_all:
            # 完整加载：预加载所有关联关系
            query = query.options(
                selectinload(Project.contract),
                selectinload(Project.owners),
                selectinload(Project.sale),
                selectinload(Project.renovation_photos),
                selectinload(Project.interactions),
                selectinload(Project.finance_records),
                selectinload(Project.status_logs),
            )
        else:
            # 简化加载：只加载必要的关系
            query = query.options(
                selectinload(Project.contract),
                selectinload(Project.owners),
                selectinload(Project.sale),
            )

        project = query.first()

        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="项目不存在"
            )

        return project

    def _build_project_response(self, project: Project) -> Dict[str, Any]:
        """将项目及其关联数据组合成响应字典"""
        response = {
            "id": project.id,
            "name": project.name or project.generate_name(),
            "community_name": project.community_name,
            "address": project.address,
            "area": str(project.area) if project.area else None,
            "layout": project.layout,
            "orientation": project.orientation,
            "status": project.status,
            "renovation_stage": project.renovation_stage,
            "is_deleted": project.is_deleted,
            "created_at": project.created_at.isoformat() if project.created_at else None,
            "updated_at": project.updated_at.isoformat() if project.updated_at else None,
        }

        # 直接从关联表查询数据（确保能获取到）
        from models.project import ProjectContract, ProjectOwner, ProjectSale

        # 查询合同信息
        contract = self.db.query(ProjectContract).filter(
            ProjectContract.project_id == project.id,
            ProjectContract.is_deleted == False
        ).first()
        if contract:
            # 格式化为 YYYY-MM-DD 格式，避免时区问题
            signing_date_str = contract.signing_date.strftime('%Y-%m-%d') if contract.signing_date else None
            planned_handover_date_str = contract.planned_handover_date.strftime('%Y-%m-%d') if contract.planned_handover_date else None

            response.update({
                "contract_no": contract.contract_no,
                "signing_price": float(contract.signing_price) if contract.signing_price else None,
                "signing_date": signing_date_str,
                "signing_period": contract.signing_period,
                "extension_period": contract.extension_period,
                "extension_rent": float(contract.extension_rent) if contract.extension_rent else None,
                "cost_assumption": contract.cost_assumption,
                "planned_handover_date": planned_handover_date_str,
                "other_agreements": contract.other_agreements,
                "signing_materials": contract.signing_materials,
                "contract_status": contract.contract_status,
            })

        # 查询业主信息
        owner = self.db.query(ProjectOwner).filter(
            ProjectOwner.project_id == project.id,
            ProjectOwner.is_deleted == False
        ).first()
        if owner:
            response.update({
                "owner_name": owner.owner_name,
                "owner_phone": owner.owner_phone,
                "owner_id_card": owner.owner_id_card,
                "owner_info": owner.owner_info,
            })

        # 查询销售信息
        sale = self.db.query(ProjectSale).filter(
            ProjectSale.project_id == project.id,
            ProjectSale.is_deleted == False
        ).first()
        if sale:
            # 格式化为 YYYY-MM-DD 格式，避免时区问题
            listing_date_str = sale.listing_date.strftime('%Y-%m-%d') if sale.listing_date else None
            sold_date_str = sale.sold_date.strftime('%Y-%m-%d') if sale.sold_date else None

            response.update({
                "listing_date": listing_date_str,
                "list_price": float(sale.list_price) if sale.list_price else None,
                "sold_date": sold_date_str,
                "sold_price": float(sale.sold_price) if sale.sold_price else None,
                "transaction_status": sale.transaction_status,
                "channel_manager_id": sale.channel_manager_id,
                "property_agent_id": sale.property_agent_id,
                "negotiator_id": sale.negotiator_id,
            })

        # 查询并计算财务数据
        from decimal import Decimal
        finance_records = self.db.query(FinanceRecord).filter(
            FinanceRecord.project_id == project.id
        ).all()

        total_income = Decimal(0)
        total_expense = Decimal(0)
        for record in finance_records:
            if record.type == CashFlowType.INCOME.value:
                total_income += record.amount
            else:
                total_expense += record.amount

        net_cash_flow = total_income - total_expense
        roi = float(net_cash_flow / total_expense * 100) if total_expense > 0 else 0.0

        response.update({
            "total_income": float(total_income),
            "total_expense": float(total_expense),
            "net_cash_flow": float(net_cash_flow),
            "roi": roi,
        })

        # 查询互动记录（销售记录）
        from models.project import ProjectInteraction
        interactions = self.db.query(ProjectInteraction).filter(
            ProjectInteraction.project_id == project.id
        ).order_by(ProjectInteraction.interaction_at.desc()).all()

        if interactions:
            sales_records = []
            for interaction in interactions:
                sales_records.append({
                    "id": interaction.id,
                    "project_id": interaction.project_id,
                    "record_type": interaction.record_type,
                    "customer_name": interaction.interaction_target,
                    "record_date": interaction.interaction_at.isoformat() if interaction.interaction_at else None,
                    "price": float(interaction.price) if interaction.price else None,
                    "notes": interaction.content,
                    "created_at": interaction.created_at.isoformat() if interaction.created_at else None,
                })
            response["sales_records"] = sales_records

        # 查询装修照片（蜕变影像）
        if project.renovation_photos:
            renovation_photos = []
            for photo in project.renovation_photos:
                renovation_photos.append({
                    "id": photo.id,
                    "project_id": photo.project_id,
                    "stage": photo.stage,
                    "url": photo.url,
                    "filename": photo.filename,
                    "description": photo.description,
                    "created_at": photo.created_at.isoformat() if photo.created_at else None,
                })
            response["renovation_photos"] = renovation_photos

        # 构建阶段日期映射（用于蜕变影像展示）
        from models.project import ProjectRenovation
        renovation = self.db.query(ProjectRenovation).filter(
            ProjectRenovation.project_id == project.id
        ).first()

        if renovation:
            stage_dates = {}

            # 严格从 stage_completed_dates JSON 字段读取各阶段完成日期
            # 只有真正完成并提交的阶段才会被记录为已完成
            if renovation.stage_completed_dates:
                # stage_completed_dates 格式: {stage_name: date_string}
                for stage_name, date_value in renovation.stage_completed_dates.items():
                    if date_value:
                        # 统一日期格式为 YYYY-MM-DD
                        if isinstance(date_value, str):
                            stage_dates[stage_name] = date_value
                        elif isinstance(date_value, datetime):
                            stage_dates[stage_name] = date_value.strftime('%Y-%m-%d')

            # 注意：不再从 actual_start_date、contract_start_date、actual_end_date 等字段
            # 推断阶段完成状态，以确保阶段完成状态的原子性和一致性
            # 只有用户明确提交完成某个阶段时，才会记录到 stage_completed_dates 中

            if stage_dates:
                response["renovation_stage_dates"] = stage_dates

        return response

    def create_project(self, project_data: ProjectCreate) -> ProjectResponse:
        """创建项目，同时创建关联的子表记录"""
        project_id = str(uuid.uuid4())
        now = datetime.utcnow()

        # 1. 创建项目基础记录
        project = Project(
            id=project_id,
            community_name=project_data.community_name,
            address=project_data.address,
            area=project_data.area,
            layout=project_data.layout,
            orientation=project_data.orientation,
            status=ProjectStatus.SIGNING.value,
            is_deleted=False,
            created_at=now,
            updated_at=now,
        )
        # 自动生成项目名称
        project.name = project.generate_name()
        self.db.add(project)

        # 2. 创建合同记录（合同编号必填）
        signing_date = parse_date_string(project_data.signing_date)
        planned_handover_date = parse_date_string(project_data.planned_handover_date)

        contract = ProjectContract(
            id=str(uuid.uuid4()),
            project_id=project_id,
            contract_no=project_data.contract_no,
            signing_price=project_data.signing_price,
            signing_date=signing_date,
            signing_period=project_data.signing_period,
            extension_period=project_data.extension_period,
            extension_rent=project_data.extension_rent,
            cost_assumption=project_data.cost_assumption,
            planned_handover_date=planned_handover_date,
            other_agreements=project_data.other_agreements,
            signing_materials=project_data.signing_materials,
            contract_status="生效" if signing_date else "未生效",
            is_deleted=False,
            created_at=now,
            updated_at=now,
        )
        self.db.add(contract)

        # 3. 创建业主记录（如果提供了业主信息）
        if any([
            project_data.owner_name,
            project_data.owner_phone,
            project_data.owner_id_card,
        ]):
            owner = ProjectOwner(
                id=str(uuid.uuid4()),
                project_id=project_id,
                owner_name=project_data.owner_name,
                owner_phone=project_data.owner_phone,
                owner_id_card=project_data.owner_id_card,
                relation_type="业主",
                owner_info=project_data.notes,  # 旧字段notes映射到owner_info
                is_deleted=False,
                created_at=now,
                updated_at=now,
            )
            self.db.add(owner)

        self.db.commit()
        self.db.refresh(project)

        return ProjectResponse.model_validate(self._build_project_response(project))

    def get_project(self, project_id: str, include_all: bool = False) -> Optional[ProjectResponse]:
        """获取项目详情"""
        project = self._get_project(project_id, include_all)
        return ProjectResponse.model_validate(self._build_project_response(project))

    def get_projects(self, status_filter: Optional[str] = None,
                    community_name: Optional[str] = None,
                    page: int = 1, page_size: int = 50) -> Dict[str, Any]:
        """获取项目列表"""

        # 1. 基础查询构造
        query = self.db.query(Project)

        # 预加载关联数据（签约、业主、销售信息）
        query = query.options(
            selectinload(Project.contract),
            selectinload(Project.owners),
            selectinload(Project.sale),
        )

        # 排除已删除的项目
        query = query.filter(Project.is_deleted == False)

        if status_filter:
            query = query.filter(Project.status == status_filter)

        if community_name:
            query = query.filter(Project.community_name.contains(community_name))

        # 2. 获取总数
        total = query.count()

        # 3. 获取当前页的项目
        projects = query.order_by(Project.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

        # 4. 转换每个项目
        items = []
        for p in projects:
            items.append(ProjectResponse.model_validate(self._build_project_response(p)))

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size
        }

    def update_project(self, project_id: str, update_data: ProjectUpdate) -> ProjectResponse:
        """更新项目信息"""
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")

        update_dict = update_data.model_dump(exclude_unset=True)

        # 只限制已售状态不能修改某些字段
        if project.status == ProjectStatus.SOLD.value:
            allowed_fields = {
                'community_name', 'address', 'area', 'orientation', 'layout',
                'renovation_stage', 'notes', 'tags',
                'owner_name', 'owner_phone', 'owner_id_card', 'owner_info'
            }
            update_dict = {k: v for k, v in update_dict.items() if k in allowed_fields}

        # 1. 更新项目基础字段
        project_fields = ['community_name', 'address', 'area', 'orientation', 'layout',
                         'renovation_stage', 'status', 'tags']
        for field in project_fields:
            if field in update_dict:
                setattr(project, field, update_dict.pop(field))

        # 如果小区名称或地址发生变化，重新生成项目名称
        if 'community_name' in project_fields or 'address' in project_fields:
            project.name = project.generate_name()

        # 2. 处理签约相关字段 - 更新 ProjectContract
        contract_fields = ['contract_no', 'signing_price', 'signing_date', 'signing_period',
                          'extension_period', 'extension_rent', 'cost_assumption',
                          'planned_handover_date', 'other_agreements', 'signing_materials']

        contract_updates = {k: update_dict.pop(k) for k in list(contract_fields) if k in update_dict}

        # 解析日期字段
        if 'signing_date' in contract_updates:
            contract_updates['signing_date'] = parse_date_string(contract_updates['signing_date'])
        if 'planned_handover_date' in contract_updates:
            contract_updates['planned_handover_date'] = parse_date_string(contract_updates['planned_handover_date'])

        if contract_updates:
            contract = self.db.query(ProjectContract).filter(
                ProjectContract.project_id == project_id
            ).first()
            if contract:
                for field, value in contract_updates.items():
                    setattr(contract, field, value)
            else:
                # 创建新的合同记录
                contract = ProjectContract(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    is_deleted=False,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                    **contract_updates
                )
                self.db.add(contract)

        # 3. 处理业主相关字段 - 更新 ProjectOwner
        owner_fields = ['owner_name', 'owner_phone', 'owner_id_card']
        owner_updates = {k: update_dict.pop(k) for k in list(owner_fields) if k in update_dict}
        if 'notes' in update_dict:
            owner_updates['owner_info'] = update_dict.pop('notes')

        if owner_updates:
            owner = self.db.query(ProjectOwner).filter(
                ProjectOwner.project_id == project_id
            ).first()
            if owner:
                for field, value in owner_updates.items():
                    setattr(owner, field, value)
            else:
                owner = ProjectOwner(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    relation_type="业主",
                    is_deleted=False,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                    **owner_updates
                )
                self.db.add(owner)

        # 4. 处理销售相关字段 - 更新 ProjectSale
        sale_fields = ['listing_date', 'list_price', 'sold_date', 'sold_price']
        sale_updates = {k: update_dict.pop(k) for k in list(sale_fields) if k in update_dict}

        # 解析日期字段
        if 'listing_date' in sale_updates:
            sale_updates['listing_date'] = parse_date_string(sale_updates['listing_date'])
        if 'sold_date' in sale_updates:
            sale_updates['sold_date'] = parse_date_string(sale_updates['sold_date'])

        if sale_updates:
            sale = self.db.query(ProjectSale).filter(
                ProjectSale.project_id == project_id
            ).first()
            if sale:
                for field, value in sale_updates.items():
                    setattr(sale, field, value)
            else:
                sale = ProjectSale(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    transaction_status="在售",
                    is_deleted=False,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                    **sale_updates
                )
                self.db.add(sale)

        # 5. 更新项目主表的其他字段
        for field, value in update_dict.items():
            if hasattr(project, field):
                setattr(project, field, value)

        project.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(project)

        return ProjectResponse.model_validate(self._build_project_response(project))

    def delete_project(self, project_id: str) -> None:
        """删除项目 (软删除)"""
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")

        project.is_deleted = True
        project.status = ProjectStatus.DELETED.value
        project.updated_at = datetime.utcnow()
        self.db.commit()

    def update_status(self, project_id: str, status_update: StatusUpdate) -> ProjectResponse:
        """更新项目状态"""
        project = self.db.query(Project).filter(Project.id == project_id).first()

        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="项目不存在"
            )

        new_status = status_update.status.value
        current_status = project.status

        # 验证状态流转
        self._validate_status_transition(current_status, new_status)

        # 更新状态
        old_status = project.status
        project.status = new_status
        project.updated_at = datetime.utcnow()

        # 更新销售表的交易状态
        if new_status == ProjectStatus.SELLING.value:
            sale = self.db.query(ProjectSale).filter(
                ProjectSale.project_id == project_id
            ).first()

            # 解析 listing_date
            listing_date = parse_date_string(status_update.listing_date)

            if sale:
                sale.transaction_status = "在售"
                if listing_date:
                    sale.listing_date = listing_date
                if status_update.list_price is not None:
                    sale.list_price = status_update.list_price
                sale.updated_at = datetime.utcnow()
            else:
                # 创建新的销售记录
                sale = ProjectSale(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    listing_date=listing_date,
                    list_price=status_update.list_price,
                    transaction_status="在售",
                    is_deleted=False,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                )
                self.db.add(sale)

        elif new_status == ProjectStatus.SOLD.value:
            sale = self.db.query(ProjectSale).filter(
                ProjectSale.project_id == project_id
            ).first()
            if sale:
                sale.transaction_status = "已售"
                sale.sold_date = datetime.utcnow()
                sale.updated_at = datetime.utcnow()

        # 如果进入装修阶段且当前没有子阶段，初始化为第一个阶段
        if new_status == ProjectStatus.RENOVATING.value and not project.renovation_stage:
            project.renovation_stage = "拆除"

        self.db.commit()
        self.db.refresh(project)

        return ProjectResponse.model_validate(self._build_project_response(project))

    def get_project_stats(self) -> Dict[str, int]:
        """获取项目统计"""
        stats = self.db.query(
            Project.status,
            func.count(Project.id)
        ).filter(Project.is_deleted == False).group_by(Project.status).all()

        result = {
            "signing": 0,
            "renovating": 0,
            "selling": 0,
            "sold": 0
        }

        for status, count in stats:
            if status in result:
                result[status] = count

        return result

    # ========== 内部辅助方法 ==========

    def _validate_status_transition(self, current_status: str, new_status: str) -> None:
        """验证状态流转合法性"""
        # 特殊规则：只限制除了在售状态外，其他状态不能切换到已售状态
        if new_status == ProjectStatus.SOLD.value and current_status != ProjectStatus.SELLING.value and current_status != ProjectStatus.SOLD.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="只有在售或已售状态才能切换到已售状态"
            )
