"""存量数据绑定服务（R9 / FR-12 / BR-25 / BR-27，Task 19）.

四类统一绑定（项目/线索/营销/房源）：
- PUT：绑定/修正（绑定后数据层以字典为准；项目 address 原值保留转备注，
  其余 community_name 冗余不改写；rejected 人工补绑转 linked）；
- DELETE：解除关联（dict_status=manual、关联字段清空，BR-25）；
- 绑定不强制，未绑定单据零影响。

房源类（property_current）仅小区级绑定（机器链路无楼栋/户室数据）。
"""

import logging
from datetime import datetime, timezone

from fastapi import Request
from sqlalchemy.orm import Session

from models import Community, L4MarketingProject, Lead, Project, PropertyCurrent
from schemas.building_dict import DictionaryLinkRequest
from services.property.dict_ownership import validate_dict_ownership
from services.system.exceptions import ResourceNotFoundError, ValidationError

logger = logging.getLogger(__name__)

# 支持绑定的业务类型（biz_type）
_BIZ_PROJECT = "project"
_BIZ_LEAD = "lead"
_BIZ_MARKETING = "marketing"
_BIZ_PROPERTY = "property"


class DictionaryLinkService:
    """存量绑定服务（四类统一）."""

    def link(
        self,
        db: Session,
        *,
        biz_type: str,
        biz_id: str,
        body: DictionaryLinkRequest,
        operator_id: str | None = None,
        request: Request | None = None,
    ) -> tuple[bool, str, str]:
        """绑定/修正字典关联.

        Returns:
            (success, dict_status, message)

        """
        community = db.query(Community).filter(Community.id == body.community_id).first()
        if not community:
            msg = "字典小区不存在"
            raise ResourceNotFoundError(msg)

        # 楼栋/户室归属校验（S1 修复）：原实现只在「同时传了 building_id」时比对户室与
        # 请求楼栋，从不比对「户室所属楼栋的小区」与 body.community_id —— 只传 room_id
        # 即可把 A 小区的户室绑到 B 小区，落库后该单据在后续任何编辑时被
        # validate_dict_ownership 永久 400（不可编辑的死单据）。
        # 现统一复用主表单链路的 validate_dict_ownership（单一入口，避免两处口径漂移）：
        # 楼栋/户室不存在、楼栋不属于该小区、户室不属于该小区、户室与楼栋不匹配均 400。
        if biz_type == _BIZ_PROPERTY and (body.building_id is not None or body.room_id is not None):
            # 契约约束：房源类（机器链路）仅小区级绑定，文档承诺在此变成代码约束
            msg = "房源类仅支持小区级绑定，不支持楼栋/户室"
            raise ValidationError(msg)
        validate_dict_ownership(
            db,
            community_id=body.community_id,
            building_id=body.building_id,
            room_id=body.room_id,
        )

        record = self._get_record(db, biz_type, biz_id)
        before = self._snapshot(record)

        self._apply_link(record, body)
        record.dict_status = "linked"  # type: ignore[attr-defined]
        self._touch_updated_at(record)
        db.commit()

        self._audit(
            db,
            operator_id,
            "dictionary_link",
            biz_type,
            str(biz_id),
            before=before,
            after={
                "community_id": body.community_id,
                "building_id": body.building_id,
                "room_id": body.room_id,
                "dict_status": "linked",
            },
            request=request,
        )
        return True, "linked", "字典关联已生效"

    def unlink(
        self,
        db: Session,
        *,
        biz_type: str,
        biz_id: str,
        operator_id: str | None = None,
        request: Request | None = None,
    ) -> tuple[bool, str, str]:
        """解除关联（dict_status=manual，关联字段清空）."""
        record = self._get_record(db, biz_type, biz_id)
        before = self._snapshot(record)
        self._clear_link(record)
        record.dict_status = "manual"  # type: ignore[attr-defined]
        self._touch_updated_at(record)
        db.commit()
        self._audit(
            db,
            operator_id,
            "dictionary_unlink",
            biz_type,
            str(biz_id),
            before=before,
            after={"dict_status": "manual"},
            request=request,
        )
        return True, "manual", "已解除字典关联"

    # ---------- 内部 ----------

    def _get_record(
        self,
        db: Session,
        biz_type: str,
        biz_id: str,
    ) -> "Project | Lead | L4MarketingProject | PropertyCurrent":
        """按类型取单据记录."""
        if biz_type == _BIZ_PROJECT:
            record = db.query(Project).filter(Project.id == biz_id, Project.is_deleted.is_(False)).first()
        elif biz_type == _BIZ_LEAD:
            record = db.query(Lead).filter(Lead.id == biz_id, Lead.is_deleted.is_(False)).first()
        elif biz_type == _BIZ_MARKETING:
            record = (
                db.query(L4MarketingProject)
                .filter(L4MarketingProject.id == int(biz_id), L4MarketingProject.is_deleted.is_(False))
                .first()
            )
        elif biz_type == _BIZ_PROPERTY:
            ds, _, spid = biz_id.partition(":")
            record = (
                db.query(PropertyCurrent)
                .filter(PropertyCurrent.data_source == ds, PropertyCurrent.source_property_id == spid)
                .first()
            )
        else:
            record = None
        if not record:
            msg = f"{biz_type} 单据不存在: {biz_id}"
            raise ResourceNotFoundError(msg)
        return record

    @staticmethod
    def _apply_link(
        record: "Project | Lead | L4MarketingProject | PropertyCurrent",
        body: DictionaryLinkRequest,
    ) -> None:
        """应用绑定字段（项目 address 原值保留转备注 BR-19；community_name 冗余不改写）。"""
        record.community_id = body.community_id
        record.building_id = body.building_id
        record.room_id = body.room_id

    @staticmethod
    def _clear_link(record: "Project | Lead | L4MarketingProject | PropertyCurrent") -> None:
        """解绑清空关联字段（community_name 冗余保留不改写）。"""
        record.community_id = None
        record.building_id = None
        record.room_id = None

    @staticmethod
    def _touch_updated_at(record: "Project | Lead | L4MarketingProject | PropertyCurrent") -> None:
        """刷新 updated_at（PropertyCurrent/Lead/Marketing 均有该列）。"""
        if hasattr(record, "updated_at"):
            record.updated_at = datetime.now(timezone.utc)

    @staticmethod
    def _snapshot(record: "Project | Lead | L4MarketingProject | PropertyCurrent") -> dict:
        """绑定前快照（审计）。"""
        return {
            "community_id": getattr(record, "community_id", None),
            "building_id": getattr(record, "building_id", None),
            "room_id": getattr(record, "room_id", None),
            "dict_status": getattr(record, "dict_status", None),
        }

    def _audit(
        self,
        db: Session,
        operator_id: str | None,
        action: str,
        biz_type: str,
        biz_id: str,
        *,
        before: dict | None,
        after: dict | None,
        request: Request | None,
    ) -> None:
        """写审计日志。"""
        from services.system.operation_log import operation_log_service

        operation_log_service.log_action(
            db,
            user_id=operator_id,
            action=action,
            resource_type=f"dictionary_link_{biz_type}",
            resource_id=str(biz_id),
            before=before,
            after=after,
            request=request,
        )


_service: DictionaryLinkService | None = None


def get_dictionary_link_service() -> DictionaryLinkService:
    """获取绑定服务单例."""
    global _service
    if _service is None:
        _service = DictionaryLinkService()
    return _service
