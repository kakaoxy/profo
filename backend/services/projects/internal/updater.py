"""项目更新服务模块.

负责项目信息的更新，包括基础字段、合同信息、业主信息和销售信息。
已售状态不再限制可改字段（白名单已移除），写锁收口到独立归档标记。
"""

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from models import Project, ProjectContract, ProjectOwner, ProjectSale
from models.common import BusinessForm
from schemas.project.owner import OwnerInlineUpdate
from services.projects.archive import ensure_project_writable
from services.utils import parse_date_string

from . import documents, owners

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


class ProjectUpdater:
    """项目更新服务.

    支持更新项目基础字段、合同信息、业主信息和销售信息。
    写锁：已归档项目拒绝更新（``assert_project_not_archived``）。

    Attributes:
        db: SQLAlchemy数据库会话

    """

    def __init__(self, db: "Session") -> None:
        """初始化项目更新服务.

        Args:
            db: SQLAlchemy数据库会话

        """
        self.db = db

    def update(self, project: Project, update_dict: dict[str, Any], *, submitted_by: str | None = None) -> Project:
        """更新项目信息.

        支持更新项目基础字段、合同信息、业主信息和销售信息。
        已归档项目直接 400（归档前任意状态均可修改，sold 白名单已由归档锁替代）。

        Args:
            project: 项目模型实例
            update_dict: 更新数据字典
            submitted_by: 操作者用户ID（字典 pending 引用审核池「提交人」）

        Returns:
            更新后的项目模型实例

        """
        # 归档写锁：Fail Loud（不再像旧 sold 白名单那样静默丢弃字段）。
        # ensure_project_writable 内部 refresh 重读最新 is_archived（TOCTOU 防护），
        # 统一入口见 services/projects/archive.py。
        ensure_project_writable(self.db, project)

        # 提前弹出 owners，避免作为普通字段更新到 project 表
        owners_payload = update_dict.pop("owners", None)

        # 记录变更前业务形式，用于后续文书清单同步
        old_business_form = project.business_form

        # 更新各模块数据
        self._update_project_fields(project, update_dict)
        self._update_contract_fields(project.id, update_dict)
        self._update_owner_fields(project.id, update_dict)
        self._update_sale_fields(project.id, update_dict)
        self._update_remaining_fields(project, update_dict)

        # 同步业主列表（不内联 diff，委托给 owners service）
        if owners_payload is not None:
            owner_items: list[OwnerInlineUpdate] = [
                OwnerInlineUpdate(**o) if isinstance(o, dict) else o for o in owners_payload
            ]
            owners.sync_owners(self.db, project.id, owner_items)

        # 业务形式变更时追加新业务形式独有的文书（不内联逻辑，委托给 documents service）
        new_business_form = project.business_form
        if old_business_form != new_business_form:
            old_enum = BusinessForm(old_business_form) if old_business_form else None
            new_enum = BusinessForm(new_business_form) if new_business_form else None
            documents.sync_documents_on_business_form_change(
                self.db,
                project.id,
                old_enum,
                new_enum,
            )

        # 补录录入端新增字典 pending 引用（M2/BR-22 引用闭环）：
        # 与主更新同一事务提交（commit=False），submit 失败时随主事务整体回滚，
        # 避免「更新已落库但 pending 引用丢失」的半提交。
        new_community = update_dict.pop("new_community", None) or None
        new_building = update_dict.pop("new_building", None) or None
        new_room = update_dict.pop("new_room", None) or None
        if new_community or new_building or new_room:
            from services.property.dict_submit_service import submit_dict_chain

            submit_dict_chain(
                self.db,
                new_community=new_community,
                new_building=new_building,
                new_room=new_room,
                biz_type="project",
                biz_id=str(project.id),
                community_id=project.community_id,
                building_id=project.building_id,
                submitted_by=submitted_by,
                commit=False,
            )

        project.updated_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(project)

        return project

    def _update_project_fields(
        self,
        project: Project,
        update_dict: dict[str, Any],
    ) -> None:
        """更新项目基础字段."""
        project_fields = [
            "community_id",
            "community_name",
            "address",
            # 楼盘字典四级地址（M2/BR-22：编辑与新建同口径走选择器）
            "building_id",
            "room_id",
            "dict_status",
            "area",
            "orientation",
            "layout",
            "floor_info",
            "electricity_account",
            "water_account",
            "gas_account",
            "renovation_stage",
            "status",
            "tags",
            "project_manager_id",
            "business_form",
            "commission_start_date",
            "commission_end_date",
        ]

        # 跟踪是否实际更新了影响项目名称的字段
        name_changed = False
        for field in project_fields:
            if field in update_dict:
                if field in ("community_name", "address"):
                    name_changed = True
                setattr(project, field, update_dict.pop(field))

        # 仅当小区名称或地址实际更新时，才重新生成项目名称
        if name_changed:
            project.name = project.generate_name()

    def _update_contract_fields(
        self,
        project_id: uuid.UUID,
        update_dict: dict[str, Any],
    ) -> None:
        """更新合同相关字段."""
        contract_fields = [
            "contract_no",
            "signing_price",
            "signing_date",
            "signing_period",
            "extension_period",
            "extension_rent",
            "cost_assumption_type",
            "cost_assumption_other",
            "planned_handover_date",
            "other_agreements",
            "signing_materials",
            "signing_materials_removed_urls",
        ]

        contract_updates = {k: update_dict.pop(k) for k in list(contract_fields) if k in update_dict}

        # 解析日期字段
        if "signing_date" in contract_updates:
            contract_updates["signing_date"] = parse_date_string(contract_updates["signing_date"])
        if "planned_handover_date" in contract_updates:
            contract_updates["planned_handover_date"] = parse_date_string(contract_updates["planned_handover_date"])

        if not contract_updates:
            return

        # 行锁：并发 PUT 时串行化对同一项目合同的读-改-写，避免双读旧值互相覆盖
        # （READ COMMITTED 下不加锁时两个事务可能读到同一旧基底，合并仍会丢数据）
        contract = (
            self.db.query(ProjectContract)
            .filter(
                ProjectContract.project_id == project_id,
                ProjectContract.is_deleted.is_(False),
            )
            .with_for_update()
            .first()
        )

        # signing_materials 并发合并防护（bug 修复）：前端附件保存为“读-改-写全量 PUT”，
        # 多文件上传/多处编辑并发时，后完成的 PUT 用旧快照整体覆写，会丢失其他
        # 并发写入的附件（实证：连发 7 个 PUT 后 7 张图只落库 4 张）。改为基于库中
        # 现值读-改-写合并：incoming 同 url 原位覆盖（支持修改分类/元数据）、
        # 新 url 追加；signing_materials_removed_urls 为显式删除信号（删除不走
        # 全量覆写语义，否则旧快照覆写会复活已删除项）。空列表 / 两者均不传时
        # 保持原语义（显式清空 / 不修改）。
        raw_materials = contract_updates.get("signing_materials")
        raw_removed = contract_updates.pop("signing_materials_removed_urls", None)
        if isinstance(raw_materials, list) and raw_materials:
            incoming = [m.model_dump() if hasattr(m, "model_dump") else m for m in raw_materials]
            existing = contract.signing_materials if contract else None
            removed_urls = [str(u) for u in raw_removed if u] if isinstance(raw_removed, list) else []
            contract_updates["signing_materials"] = self._merge_signing_materials(existing, incoming, removed_urls)
        elif isinstance(raw_removed, list) and raw_removed:
            # 仅传删除列表：从库中现值移除指定 URL
            existing = contract.signing_materials if contract else None
            removed_urls = [str(u) for u in raw_removed if u]
            contract_updates["signing_materials"] = self._merge_signing_materials(existing, [], removed_urls)

        if contract:
            for field, value in contract_updates.items():
                setattr(contract, field, value)
        else:
            contract = ProjectContract(
                id=uuid.uuid4(),
                project_id=project_id,
                is_deleted=False,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
                **contract_updates,
            )
            self.db.add(contract)

    @staticmethod
    def _merge_signing_materials(
        existing: Any,
        incoming: list[Any],
        removed_urls: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        """将 incoming 附件列表合并进库中现值，返回合并结果（纯函数）.

        以库中现值为基底：incoming 中同 url 条目原位覆盖（保留库中顺序，
        支持修改分类等元数据），新 url 追加到尾部；库中历史重复 url 收敛为
        首条；removed_urls 中的 url 强制移除（显式删除信号）。历史纯 URL
        字符串格式兼容为结构化条目。
        """
        removed_set = {str(u) for u in removed_urls or []}
        existing_items: list[dict[str, Any]] = []
        if isinstance(existing, list):
            for item in existing:
                if isinstance(item, dict):
                    existing_items.append(dict(item))
                elif isinstance(item, str):
                    existing_items.append(
                        {
                            "filename": item.rsplit("/", 1)[-1] or "unknown",
                            "url": item,
                            "category": "other",
                            "fileType": "other",
                            "size": 0,
                        }
                    )

        incoming_by_url: dict[str, dict[str, Any]] = {}
        for item in incoming:
            if isinstance(item, dict) and item.get("url"):
                url = str(item["url"])
                if url not in removed_set:
                    incoming_by_url[url] = dict(item)

        merged: list[dict[str, Any]] = []
        seen_urls: set[str] = set()
        for item in existing_items:
            url = str(item.get("url", ""))
            if url in removed_set:
                continue
            if url in seen_urls:
                continue
            seen_urls.add(url)
            merged.append({**item, **incoming_by_url[url]} if url in incoming_by_url else item)
        for url, item in incoming_by_url.items():
            if url not in seen_urls:
                seen_urls.add(url)
                merged.append(item)
        return merged

    def _update_owner_fields(
        self,
        project_id: uuid.UUID,
        update_dict: dict[str, Any],
    ) -> None:
        """更新业主相关字段.

        ⚠️ 防脱敏值回写：ProjectResponse 下发的 owner_phone/owner_id_card 为脱敏值
        （含 ``*``），编辑表单若未改动直接原样提交，会把脱敏值写回覆盖明文。
        此处跳过仍含 ``*`` 的值（真实明文不可能包含星号）。
        """
        owner_fields = ["owner_name", "owner_phone", "owner_id_card", "owner_info"]
        owner_updates = {k: update_dict.pop(k) for k in list(owner_fields) if k in update_dict}
        for field in ("owner_phone", "owner_id_card"):
            value = owner_updates.get(field)
            if isinstance(value, str) and "*" in value:
                del owner_updates[field]

        if "notes" in update_dict:
            owner_updates["owner_info"] = update_dict.pop("notes")

        if not owner_updates:
            return

        owner = (
            self.db.query(ProjectOwner)
            .filter(
                ProjectOwner.project_id == project_id,
                ProjectOwner.is_deleted.is_(False),
            )
            .first()
        )

        if owner:
            for field, value in owner_updates.items():
                setattr(owner, field, value)
        else:
            owner = ProjectOwner(
                id=uuid.uuid4(),
                project_id=project_id,
                relation_type="业主",
                is_deleted=False,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
                **owner_updates,
            )
            self.db.add(owner)

    def _update_sale_fields(
        self,
        project_id: uuid.UUID,
        update_dict: dict[str, Any],
    ) -> None:
        """更新销售相关字段."""
        sale_fields = ["listing_date", "list_price", "sold_date", "sold_price"]
        sale_updates = {k: update_dict.pop(k) for k in list(sale_fields) if k in update_dict}

        # 解析日期字段
        if "listing_date" in sale_updates:
            sale_updates["listing_date"] = parse_date_string(sale_updates["listing_date"])
        if "sold_date" in sale_updates:
            sale_updates["sold_date"] = parse_date_string(sale_updates["sold_date"])

        if not sale_updates:
            return

        sale = (
            self.db.query(ProjectSale)
            .filter(
                ProjectSale.project_id == project_id,
                ProjectSale.is_deleted.is_(False),
            )
            .first()
        )

        if sale:
            for field, value in sale_updates.items():
                setattr(sale, field, value)
        else:
            sale = ProjectSale(
                id=uuid.uuid4(),
                project_id=project_id,
                transaction_status="在售",
                is_deleted=False,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
                **sale_updates,
            )
            self.db.add(sale)

    def _update_remaining_fields(
        self,
        project: Project,
        update_dict: dict[str, Any],
    ) -> None:
        """更新项目主表的剩余字段."""
        for field, value in update_dict.items():
            if hasattr(project, field):
                setattr(project, field, value)
