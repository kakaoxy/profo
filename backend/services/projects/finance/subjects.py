"""科目管理 CRUD（FinanceSubject）.

按 AGENTS.md 规范：
- Service 层负责业务校验与数据库操作，Router 不直接查询
- 使用同步 SQLAlchemy Session（self.db 由 _FinanceServiceBase 注入）
- 错误通过 ServiceException 子类抛出，由路由层异常处理器统一转换
"""

import json
import logging
from datetime import datetime, timezone

from sqlalchemy import text

from models import FinanceSubject
from schemas.project.finance import (
    FinanceSubjectCreate,
    FinanceSubjectFilter,
    FinanceSubjectResponse,
    FinanceSubjectUpdate,
)
from services.system.exceptions import ConflictError, ResourceNotFoundError, ValidationError

logger = logging.getLogger(__name__)


class _SubjectMixin:
    """科目管理 CRUD 方法（FinanceService Mixin）."""

    def list_subjects(self, filter_data: FinanceSubjectFilter) -> list[FinanceSubjectResponse]:
        """查询科目列表（支持 mode/stage/level/system/is_deleted/search 筛选）.

        mode 筛选使用 PostgreSQL JSONB 包含查询：modes @> CAST(:mode AS JSONB)。
        modes 列经 migrate_finance_subjects_modes_to_jsonb 迁移为 JSONB 类型，
        配合 idx_subject_modes_gin (jsonb_path_ops) 索引加速 @> 查询。
        """
        query = self.db.query(FinanceSubject)

        # is_deleted 默认 False（仅未删除）；显式传 True 时包含已删除
        query = query.filter(FinanceSubject.is_deleted.is_(filter_data.is_deleted))

        if filter_data.system is not None:
            query = query.filter(FinanceSubject.system.is_(filter_data.system))

        if filter_data.stage is not None:
            query = query.filter(FinanceSubject.stage == filter_data.stage.value)

        if filter_data.level is not None:
            query = query.filter(FinanceSubject.level == filter_data.level.value)

        # mode 筛选：JSONB 数组包含查询（modes 列已是 jsonb，无需 ::jsonb 转换）
        if filter_data.mode is not None:
            query = query.filter(text("modes @> CAST(:mode AS JSONB)").bindparams(mode=json.dumps([filter_data.mode])))

        # search 模糊搜索科目名称
        if filter_data.search is not None:
            search_pattern = f"%{filter_data.search}%"
            query = query.filter(FinanceSubject.name.ilike(search_pattern))

        # 按 level 升序、name 升序排列，便于前端分组展示
        subjects = query.order_by(FinanceSubject.level.asc(), FinanceSubject.name.asc()).all()

        return [FinanceSubjectResponse.model_validate(s) for s in subjects]

    def create_subject(self, data: FinanceSubjectCreate) -> FinanceSubjectResponse:
        """创建科目（用户自定义）.

        - 校验 name 唯一性（含软删除的名称也不能复用，因 DB 层有 unique 约束）
        - system 强制为 False（用户自定义科目不可标记为系统预置）
        """
        # 校验 name 唯一性（含软删除）
        existing = self.db.query(FinanceSubject).filter(FinanceSubject.name == data.name).first()
        if existing is not None:
            msg = f"科目名称已存在：{data.name}"
            raise ConflictError(msg)

        now = datetime.now(timezone.utc)
        subject = FinanceSubject(
            name=data.name,
            level=data.level.value,
            pnl=data.pnl,
            modes=data.modes,
            stage=data.stage.value,
            note=data.note,
            system=False,  # 用户自定义强制为 False
            is_deleted=False,
            created_at=now,
            updated_at=now,
        )
        self.db.add(subject)
        self.db.commit()
        self.db.refresh(subject)

        logger.info("Subject created: id=%s name=%s", subject.id, subject.name)
        return FinanceSubjectResponse.model_validate(subject)

    def update_subject(self, subject_id: str, data: FinanceSubjectUpdate) -> FinanceSubjectResponse:
        """更新科目.

        - 系统预置科目(system=True)的 name/level 不可修改
        - 校验 name 唯一性（如更新 name）
        """
        subject = (
            self.db.query(FinanceSubject)
            .filter(
                FinanceSubject.id == subject_id,
                FinanceSubject.is_deleted.is_(False),
            )
            .first()
        )
        if subject is None:
            msg = "科目不存在"
            raise ResourceNotFoundError(msg)

        # 系统预置科目 name/level 不可修改
        if subject.system:
            if data.name is not None and data.name != subject.name:
                msg = "系统预置科目的名称不可修改"
                raise ValidationError(msg)
            if data.level is not None and data.level != subject.level:
                msg = "系统预置科目的层级不可修改"
                raise ValidationError(msg)

        # 校验 name 唯一性（如更新 name）
        if data.name is not None and data.name != subject.name:
            existing = (
                self.db.query(FinanceSubject)
                .filter(
                    FinanceSubject.name == data.name,
                    FinanceSubject.id != subject_id,
                )
                .first()
            )
            if existing is not None:
                msg = f"科目名称已存在：{data.name}"
                raise ConflictError(msg)
            subject.name = data.name

        if data.level is not None:
            subject.level = data.level.value
        if data.pnl is not None:
            subject.pnl = data.pnl
        if data.modes is not None:
            subject.modes = data.modes
        if data.stage is not None:
            subject.stage = data.stage.value
        if data.note is not None:
            subject.note = data.note

        subject.updated_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(subject)

        logger.info("Subject updated: id=%s name=%s", subject.id, subject.name)
        return FinanceSubjectResponse.model_validate(subject)

    def delete_subject(self, subject_id: str) -> None:
        """软删除科目（is_deleted=True）.

        - 系统预置科目(system=True)不可删除（返回 400 错误）
        """
        subject = (
            self.db.query(FinanceSubject)
            .filter(
                FinanceSubject.id == subject_id,
                FinanceSubject.is_deleted.is_(False),
            )
            .first()
        )
        if subject is None:
            msg = "科目不存在"
            raise ResourceNotFoundError(msg)

        if subject.system:
            msg = "系统预置科目不可删除"
            raise ValidationError(msg)

        subject.is_deleted = True
        subject.updated_at = datetime.now(timezone.utc)
        self.db.commit()

        logger.info("Subject deleted: id=%s name=%s", subject.id, subject.name)
