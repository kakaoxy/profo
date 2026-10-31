"""商户域审计写入（V01 REQ-M12-004）.

与 ``services/system/operation_log.py`` 的差异：
- 审计行加入**当前业务事务**，不单独 commit（BR-M12-025：日志失败必须回滚业务）；
- ``resource_type`` 使用商户域约定值（``merchant_store`` / ``merchant_dict`` 等）；
- 快照中的手机号统一按中间四位掩码（N11）。
"""

import re
from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from models.system.operation_log import OperationLog
from utils.common import _get_client_ip

USER_AGENT_MAX_LENGTH = 255

_PHONE_PATTERN = re.compile(r"^(\d{3})\d{4}(\d{4})$")
_PHONE_KEYS = frozenset(
    {
        "phone",
        "contact_phone",
        "signer_phone",
        "mobile",
        "inviter_phone",
    },
)


def mask_phone(value: str | None) -> str | None:
    """手机号中间四位掩码（13800001111 → 138****1111）.

    非 11 位手机号统一返回 ``****``，避免把完整号码写进审计快照。
    """
    if not value:
        return value
    matched = _PHONE_PATTERN.match(value)
    if matched:
        return f"{matched.group(1)}****{matched.group(2)}"
    return "****"


def mask_snapshot(value: Any) -> Any:
    """递归脱敏快照：手机号类键名按掩码处理，其余原样返回."""
    if isinstance(value, dict):
        return {
            key: (mask_phone(item) if key in _PHONE_KEYS and isinstance(item, str) else mask_snapshot(item))
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [mask_snapshot(item) for item in value]
    return value


def add_audit_log(
    db: Session,
    *,
    user_id: str | None,
    action: str,
    resource_type: str,
    resource_id: str | None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    request: Request | None = None,
) -> OperationLog:
    """在业务事务内追加审计行（不 commit，不吞异常）.

    调用方负责 commit/rollback：``add_audit_log`` 抛出的异常必须让业务事务回滚，
    不允许出现「业务已改但审计缺失」（BR-M12-025）。
    """
    ip = None
    user_agent = None
    if request is not None:
        ip = _get_client_ip(request)
        user_agent = request.headers.get("user-agent", "")
        if user_agent and len(user_agent) > USER_AGENT_MAX_LENGTH:
            user_agent = user_agent[:USER_AGENT_MAX_LENGTH]

    entry = OperationLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        ip=ip,
        user_agent=user_agent,
        before=mask_snapshot(before),
        after=mask_snapshot(after),
    )
    db.add(entry)
    db.flush()
    return entry


__all__ = ["add_audit_log", "mask_phone", "mask_snapshot"]
