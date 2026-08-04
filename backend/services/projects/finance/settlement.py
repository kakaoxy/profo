"""结算 / 反结算 / 操作日志."""

import logging
import uuid

from models import FinanceRecordLog, Project, User
from models.common import FinanceActionType, SettlementStatus
from schemas.project import FinanceLogResponse
from schemas.project.finance import (
    FinanceSettlementChangeRequest,
    FinanceSettlementResponse,
    FinanceUnsettleRequest,
)
from services.system.exceptions import ResourceNotFoundError, ValidationError

logger = logging.getLogger(__name__)


class _SettlementMixin:
    """结算 / 反结算 / 操作日志方法."""

    # ==================== 结算 / 反结算 ====================

    def settle_finance(
        self,
        project_id: uuid.UUID,
        data: FinanceSettlementChangeRequest,
        operator_id: str,
    ) -> FinanceSettlementResponse:
        """结算：unsettled → settled，记录日期与说明，写日志."""
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
        if not project:
            msg = "项目不存在"
            raise ResourceNotFoundError(msg)
        if project.finance_settlement_status == SettlementStatus.SETTLED:
            msg = "该项目资金账本已结算，无需重复结算"
            raise ValidationError(msg)

        project.finance_settlement_status = SettlementStatus.SETTLED
        project.finance_settled_date = data.settled_date
        project.finance_settled_note = data.settled_note

        log = FinanceRecordLog(
            project_id=project_id,
            action_type=FinanceActionType.SETTLE,
            detail={
                "settled_date": data.settled_date.isoformat(),
                "settled_note": data.settled_note or "",
            },
            operator=operator_id,
        )
        self.db.add(log)
        self.db.commit()
        self.db.refresh(project)
        logger.info("项目 %s 资金账本已结算", project_id)
        return self._build_settlement_response(project)

    def unsettle_finance(
        self,
        project_id: uuid.UUID,
        data: FinanceUnsettleRequest,
        operator_id: str,
    ) -> FinanceSettlementResponse:
        """反结算：settled → unsettled，清空结算字段，写日志."""
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
        if not project:
            msg = "项目不存在"
            raise ResourceNotFoundError(msg)
        if project.finance_settlement_status != SettlementStatus.SETTLED:
            msg = "该项目资金账本未结算，无需反结算"
            raise ValidationError(msg)

        project.finance_settlement_status = SettlementStatus.UNSETTLED
        project.finance_settled_date = None
        project.finance_settled_note = None

        log = FinanceRecordLog(
            project_id=project_id,
            action_type=FinanceActionType.UNSETTLE,
            detail={"reason": data.reason},
            operator=operator_id,
        )
        self.db.add(log)
        self.db.commit()
        self.db.refresh(project)
        logger.info("项目 %s 资金账本已反结算", project_id)
        return self._build_settlement_response(project)

    def list_logs(self, project_id: uuid.UUID) -> list[FinanceLogResponse]:
        """获取项目资金账本操作日志（按 created_at 降序）.

        联表 User 批量填充 operator_name（参考 InvestmentService._build_logs_response）。
        """
        logs = (
            self.db.query(FinanceRecordLog)
            .filter(FinanceRecordLog.project_id == project_id)
            .order_by(FinanceRecordLog.created_at.desc())
            .all()
        )

        operator_ids = {log.operator for log in logs}
        name_map: dict[str, str] = {}
        if operator_ids:
            users = self.db.query(User).filter(User.id.in_(operator_ids)).all()
            name_map = {u.id: (u.nickname or u.username or u.id) for u in users}

        return [
            FinanceLogResponse(
                id=log.id,
                project_id=log.project_id,
                action_type=log.action_type,
                detail=log.detail or {},
                operator_id=log.operator,
                operator_name=name_map.get(log.operator, log.operator),
                created_at=log.created_at,
            )
            for log in logs
        ]
