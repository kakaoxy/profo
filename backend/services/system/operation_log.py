"""操作审计日志服务.

记录用户对系统资源的操作行为，支持合规审计。
"""

import logging
import uuid
from datetime import datetime, timedelta
from typing import Any

from fastapi import Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from models.project import (
    FinanceRecord,
    Project,
    ProjectDocument,
    ProjectOwner,
    ProjectRenovation,
    ProjectSale,
)
from models.system import OperationLog
from models.user.user import Role, User
from settings import settings
from utils.common import _get_client_ip

logger = logging.getLogger(__name__)

# 审计概览的动作分布取前 N 项（设计稿右栏为 4 条，这里留余量）
_SUMMARY_ACTION_LIMIT = 6

# User-Agent 字段在数据库中为 VARCHAR(255)，超长需截断
USER_AGENT_MAX_LENGTH = 255


class OperationLogService:
    """操作审计日志服务."""

    def log_action(
        self,
        db: Session,
        *,
        user_id: str | None,
        action: str,
        resource_type: str,
        resource_id: str | None = None,
        before: dict[str, Any] | None = None,
        after: dict[str, Any] | None = None,
        request: Request | None = None,
    ) -> OperationLog | None:
        """记录操作审计日志.

        审计日志写入失败不阻塞主流程（捕获异常并记录 error 日志）。

        IP 提取复用 ``utils.common._get_client_ip``，与限流器一致：
        XFF 存在时一律从右向左跳过可信代理解析真实客户端 IP，
        避免 XFF 最左侧伪造污染审计追溯。

        Args:
            db: 数据库会话
            user_id: 操作者用户ID（未认证时为 None）
            action: 操作类型（create/update/delete/sensitive_data_access/assign_permissions 等）
            resource_type: 资源类型（user/role/permission/project 等）
            resource_id: 资源ID（可选）
            before: 变更前快照（可选）
            after: 变更后快照（可选）
            request: FastAPI Request 对象（用于提取 IP 和 User-Agent，可选）

        Returns:
            OperationLog 对象，写入失败时返回 None

        """
        # 提取 IP 和 User-Agent
        ip = None
        user_agent = None
        if request:
            ip = _get_client_ip(request)
            user_agent = request.headers.get("user-agent", "")
            # 截断 user_agent 避免超过数据库字段长度限制
            if user_agent and len(user_agent) > USER_AGENT_MAX_LENGTH:
                user_agent = user_agent[:USER_AGENT_MAX_LENGTH]

        try:
            log_entry = OperationLog(
                user_id=user_id,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                ip=ip,
                user_agent=user_agent,
                before=before,
                after=after,
            )
            db.add(log_entry)
            db.commit()
        except Exception:  # 审计日志失败不应阻塞主流程
            db.rollback()
            logger.exception(
                "审计日志写入失败: action=%s resource_type=%s",
                action,
                resource_type,
            )
            return None
        else:
            db.refresh(log_entry)
            return log_entry

    def list_operation_logs(
        self,
        db: Session,
        *,
        user_id: str | None = None,
        action: str | None = None,
        resource_type: str | None = None,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        page: int = 1,
        page_size: int | None = None,
    ) -> tuple[int, list[OperationLog]]:
        """分页查询审计日志.

        支持按 user_id/action/resource_type/时间范围筛选。
        按创建时间倒序排列（最新的在前）。

        Args:
            db: 数据库会话
            user_id: 操作者用户ID筛选（可选）
            action: 操作类型筛选（可选）
            resource_type: 资源类型筛选（可选）
            start_time: 起始时间筛选（可选，>=）
            end_time: 结束时间筛选（可选，<=）
            page: 页码（从 1 开始）
            page_size: 每页条数（None 时使用 settings.default_page_size）

        Returns:
            (total, items) 元组，total 为符合条件的总数，items 为当前页日志列表

        """
        effective_page_size = page_size if page_size is not None else settings.default_page_size
        query = db.query(OperationLog)

        if user_id:
            query = query.filter(OperationLog.user_id == user_id)
        if action:
            query = query.filter(OperationLog.action == action)
        if resource_type:
            query = query.filter(OperationLog.resource_type == resource_type)
        if start_time:
            query = query.filter(OperationLog.created_at >= start_time)
        if end_time:
            query = query.filter(OperationLog.created_at <= end_time)

        total = query.count()
        offset = (page - 1) * effective_page_size
        logs = query.order_by(OperationLog.created_at.desc()).offset(offset).limit(effective_page_size).all()
        return total, logs

    def get_summary(self, db: Session) -> dict[str, Any]:
        """审计概览（迭代二 audit_summary widget，SPEC D-03 / D-10）.

        只统计**真实存在**的数据：
        - ``today_total``：今日（Asia/Shanghai 自然日）操作总数；
        - ``login_failure_count``：今日 ``action='login_failure'`` 条数
          （该 action 由 ``routers/system/auth.py`` 真实写入）；
        - ``action_distribution``：今日按 ``action`` 原值聚合 Top 6。

        不含「高风险」：``operation_logs`` 无风险等级列，业务中不存在该概念。
        不做「查询」分类：审计只记录写操作与敏感读，读接口不落库。

        Args:
            db: 数据库会话

        Returns:
            与 ``OperationLogSummaryResponse`` 字段同名的 dict。

        """
        from utils.time_windows import cst_today_start

        day_start = cst_today_start()
        day_end = day_start + timedelta(days=1)

        base = db.query(OperationLog).filter(
            OperationLog.created_at >= day_start,
            OperationLog.created_at < day_end,
        )
        today_total = base.count()
        login_failure_count = base.filter(OperationLog.action == "login_failure").count()

        rows = (
            db.query(OperationLog.action, func.count(OperationLog.id).label("cnt"))
            .filter(
                OperationLog.created_at >= day_start,
                OperationLog.created_at < day_end,
            )
            .group_by(OperationLog.action)
            .order_by(func.count(OperationLog.id).desc(), OperationLog.action.asc())
            .limit(_SUMMARY_ACTION_LIMIT)
            .all()
        )
        return {
            "today_total": int(today_total),
            "login_failure_count": int(login_failure_count),
            "action_distribution": [{"action": action, "count": int(cnt)} for action, cnt in rows],
        }


def _safe_uuid(value: str | None) -> uuid.UUID | None:
    """operation_logs.resource_id 是 String(36)，查询 Uuid 主键列前必须转成 uuid.UUID.

    PostgreSQL 不存在 uuid↔varchar 隐式转换，直接传 str 会报错；
    历史脏值/非法值返回 None 跳过，不让解析失败影响主流程。
    """
    if not value:
        return None
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


def _collect_ids(logs: list[OperationLog], resource_type: str) -> set[uuid.UUID]:
    """收集指定 resource_type 的全部合法 UUID 资源ID，非法值跳过。"""
    return {
        u
        for u in (_safe_uuid(log.resource_id) for log in logs if log.resource_type == resource_type and log.resource_id)
        if u is not None
    }


def resolve_operator_names(db: Session, logs: list[OperationLog]) -> dict[str, str]:
    """批量解析操作人可读名称（昵称优先，无昵称用用户名）.

    一次 IN 查询 users 表，返回 {user_id: 名称}；已删除用户不出现在结果中。
    """
    user_ids = {log.user_id for log in logs if log.user_id}
    if not user_ids:
        return {}
    rows = db.query(User.id, User.nickname, User.username).filter(User.id.in_(user_ids)).all()
    return {row.id: (row.nickname or row.username) for row in rows}


def resolve_resource_names(db: Session, logs: list[OperationLog]) -> dict[str, dict[str, str]]:
    """按 resource_type 分组批量解析资源可读名称.

    每个类型至多一次 IN 查询（子资源经 project_id 二跳 join 项目名），
    每页 20 条日志的解析开销恒定，无 N+1。
    返回 {resource_type: {resource_id: 名称}}；未注册类型不出现在结果中。
    """
    if not logs:
        return {}

    result: dict[str, dict[str, str]] = {}

    # ── 字符串主键表（无需 UUID 转换）──
    user_ids = {log.resource_id for log in logs if log.resource_type == "user" and log.resource_id}
    if user_ids:
        rows = db.query(User.id, User.nickname, User.username).filter(User.id.in_(user_ids)).all()
        result["user"] = {r.id: (r.nickname or r.username) for r in rows}

    role_ids = {log.resource_id for log in logs if log.resource_type == "role" and log.resource_id}
    if role_ids:
        rows = db.query(Role.id, Role.name).filter(Role.id.in_(role_ids)).all()
        result["role"] = {r.id: r.name for r in rows}

    # ── Uuid 主键表（str → uuid.UUID 后才能 IN）──
    project_ids = _collect_ids(logs, "project")
    if project_ids:
        rows = db.query(Project.id, Project.name).filter(Project.id.in_(project_ids)).all()
        result["project"] = {str(r.id): r.name for r in rows}

    sale_ids = _collect_ids(logs, "project_sales")
    if sale_ids:
        rows = (
            db.query(ProjectSale.id, Project.name)
            .join(Project, Project.id == ProjectSale.project_id)
            .filter(ProjectSale.id.in_(sale_ids))
            .all()
        )
        result["project_sales"] = {str(r.id): r.name for r in rows}

    renovation_ids = _collect_ids(logs, "project_renovation")
    if renovation_ids:
        rows = (
            db.query(ProjectRenovation.id, Project.name)
            .join(Project, Project.id == ProjectRenovation.project_id)
            .filter(ProjectRenovation.id.in_(renovation_ids))
            .all()
        )
        result["project_renovation"] = {str(r.id): r.name for r in rows}

    finance_ids = _collect_ids(logs, "project_finance")
    if finance_ids:
        rows = (
            db.query(FinanceRecord.id, Project.name)
            .join(Project, Project.id == FinanceRecord.project_id)
            .filter(FinanceRecord.id.in_(finance_ids))
            .all()
        )
        result["project_finance"] = {str(r.id): r.name for r in rows}

    document_ids = _collect_ids(logs, "project_document")
    if document_ids:
        rows = (
            db.query(ProjectDocument.id, ProjectDocument.document_name)
            .filter(ProjectDocument.id.in_(document_ids))
            .all()
        )
        result["project_document"] = {str(r.id): r.document_name for r in rows}

    owner_ids = _collect_ids(logs, "owner_bank_card")
    if owner_ids:
        rows = db.query(ProjectOwner.id, ProjectOwner.owner_name).filter(ProjectOwner.id.in_(owner_ids)).all()
        result["owner_bank_card"] = {str(r.id): r.owner_name for r in rows if r.owner_name}

    return result


# 全局服务实例
operation_log_service = OperationLogService()
