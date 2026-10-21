"""财务管理服务包（资金账户 + 模块入口锁）.

与 ``services/projects/finance``（项目账本）区分：本包只负责「钱在哪个账户」，
不参与项目盈亏计算，两者通过 ``finance_records.account_id`` 单向关联。

使用方式:
    from services.finance import FundAccountService, AccountUnlockService
"""

from .fund_account import FundAccountService, resolve_active_account
from .unlock import (
    MAX_ATTEMPTS,
    UNLOCK_TTL_SECONDS,
    AccountLockedError,
    AccountPasswordError,
    AccountUnlockService,
    AccountUnlockUnavailableError,
)

__all__ = [
    "MAX_ATTEMPTS",
    "UNLOCK_TTL_SECONDS",
    "AccountLockedError",
    "AccountPasswordError",
    "AccountUnlockService",
    "AccountUnlockUnavailableError",
    "FundAccountService",
    "resolve_active_account",
]
