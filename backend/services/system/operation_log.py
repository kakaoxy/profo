"""操作审计日志服务.

记录用户对系统资源的操作行为，支持合规审计。
"""

import logging
from datetime import datetime
from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from models.system import OperationLog
from settings import settings

logger = logging.getLogger(__name__)

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

        TODO: 当前 IP 提取使用 ``request.client.host`` 简单方案，后续可升级为
            读取 ``X-Forwarded-For`` 并过滤可信代理（参考 ``utils.common._get_client_ip``）。

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
            ip = request.client.host if request.client else None
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


# 全局服务实例
operation_log_service = OperationLogService()
