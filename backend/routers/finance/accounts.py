"""资金账户路由层.

按 AGENTS.md 规范：
- Router 禁 SQLAlchemy 查询，全部通过 Service 编排
- 直接返回 Pydantic 模型，不包装 code/msg/data
- 写端点统一 RateLimits 限流；错误响应由 ServiceException 统一处理器输出 ``{code,message}``
- 除 ``lock-state`` / ``unlock`` / ``lock`` / ``module-password`` 外，全部端点要求模块已解锁
  （``AccountsUnlockedDep``）——只在页面挡一层等于没锁，见 SPEC §4.5
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request, status
from pydantic import UUID4

from dependencies.auth import (
    ACCOUNTS_UNLOCK_HEADER,
    AccountAdminPermDep,
    AccountReadPermDep,
    AccountsUnlockedDep,
    AccountWritePermDep,
    DbSessionDep,
)
from models.common import FundAccountStatus, FundAccountType
from schemas.finance import (
    FundAccountCreate,
    FundAccountFilter,
    FundAccountListResponse,
    FundAccountLockStateResponse,
    FundAccountOptionListResponse,
    FundAccountPasswordSetRequest,
    FundAccountResponse,
    FundAccountSummaryResponse,
    FundAccountUnlockRequest,
    FundAccountUnlockResponse,
    FundAccountUpdate,
    FundAdjustmentCreateRequest,
    FundAdjustmentReceiptsRequest,
    FundAdjustmentResponse,
    FundFlowListResponse,
)
from services.finance import AccountUnlockService, FundAccountService
from utils.common import RateLimits, get_login_user_identifier, limiter

router = APIRouter(
    prefix="/admin/accounts",
    tags=["finance-accounts"],
)


def get_fund_account_service(db: DbSessionDep) -> FundAccountService:
    """创建资金账户服务实例."""
    return FundAccountService(db)


def get_unlock_service(db: DbSessionDep) -> AccountUnlockService:
    """创建模块入口锁服务实例."""
    return AccountUnlockService(db)


_AccountServiceDep = Annotated[FundAccountService, Depends(get_fund_account_service)]
_UnlockServiceDep = Annotated[AccountUnlockService, Depends(get_unlock_service)]


# ==================== 模块入口锁（无需解锁即可调用） ====================


@router.get(
    "/lock-state",
    summary="获取资金账户模块锁状态",
)
def get_lock_state(
    request: Request,
    service: _UnlockServiceDep,
    current_user: AccountReadPermDep,
) -> FundAccountLockStateResponse:
    """读取模块锁状态（未解锁也可调用，供锁屏渲染与倒计时）."""
    token = request.headers.get(ACCOUNTS_UNLOCK_HEADER)
    return service.get_lock_state(str(current_user.id), token)


@router.post(
    "/unlock",
    summary="解锁资金账户模块",
)
# ⚠️ key_func 必须按用户而非 IP（2026-10-22 缺陷修复）：
# slowapi 默认键是客户端 IP，而本项目的 admin 请求全部经 Next.js Server Action
# 从同源转发到后端，生产上则是一整个办公室共享一个 NAT 出口 —— 于是**所有人共用一个
# 计数桶**：任何一个同事（或一次自动化脚本）把额度用完，其他人全被 429 挡住。
# 实测：E2E 连续跑 5 次就把 IP 桶打满，真实用户随即改不了密码。
# get_login_user_identifier 是本项目既有的 M8 口径（NAT 多用户互不挤占），
# 且解锁的业务锁定（错 5 次锁 15 分钟）本就是按 user_id 计数的，这里与之一致。
@limiter.limit(RateLimits.ACCOUNT_UNLOCK, key_func=get_login_user_identifier)
def unlock_accounts(
    request: Request,
    data: FundAccountUnlockRequest,
    service: _UnlockServiceDep,
    current_user: AccountReadPermDep,
) -> FundAccountUnlockResponse:
    """校验模块密码并签发解锁令牌（5 次错误锁 15 分钟）."""
    return service.unlock(data, str(current_user.id))


@router.post(
    "/lock",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="锁定资金账户模块",
)
def lock_accounts(
    request: Request,
    service: _UnlockServiceDep,
    current_user: AccountReadPermDep,
) -> None:
    """手动锁定：删除当前解锁令牌（幂等）."""
    service.revoke_token(str(current_user.id), request.headers.get(ACCOUNTS_UNLOCK_HEADER))


@router.post(
    "/module-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="设置/重设资金账户模块密码",
)
# 同上：按用户计数，避免同事之间 / 自动化脚本与真人之间互相挤占改密码额度。
@limiter.limit(RateLimits.ACCOUNT_PASSWORD_SET, key_func=get_login_user_identifier)
def set_module_password(
    request: Request,
    data: FundAccountPasswordSetRequest,
    service: _UnlockServiceDep,
    current_user: AccountAdminPermDep,
) -> None:
    """设置或重设模块密码（6 位数字；重设需原密码；仅 account:admin）."""
    service.set_password(data, str(current_user.id))


# ==================== 记账用的账户选项（无需解锁） ====================


@router.get(
    "/options",
    summary="获取资金账户选项（供记账选账户，不含余额）",
)
def list_account_options(
    service: _AccountServiceDep,
    _current_user: AccountReadPermDep,
) -> FundAccountOptionListResponse:
    """列出在用账户的 id/名称/类型/卡号（**不含任何金额**）.

    设计意图：记账弹窗需要让用户选「哪张卡」，但不需要展示「卡里有多少钱」。
    因此本端点**不要求模块解锁**，也从结构上不返回余额——余额只能通过解锁后的
    ``GET /admin/accounts`` 获取。这样「未解锁也能正常记账」与「余额不泄露」同时成立。
    """
    items = service.list_options()
    return FundAccountOptionListResponse(items=items, total=len(items))


# ==================== 账户列表 / 汇总 ====================


@router.get(
    "",
    summary="获取资金账户列表",
)
def list_accounts(
    service: _AccountServiceDep,
    _current_user: AccountsUnlockedDep,
    search: Annotated[str | None, Query(max_length=50, description="模糊搜索: 名称/卡号/开户人/备注")] = None,
    account_type: Annotated[FundAccountType | None, Query(alias="type", description="账户类型")] = None,
    account_status: Annotated[FundAccountStatus | None, Query(alias="status", description="账户状态")] = None,
    sort: Annotated[str, Query(description="排序: balance/last/name")] = "balance",
) -> FundAccountListResponse:
    """查询账户列表（含由流水推导的余额与进出合计）."""
    filter_data = FundAccountFilter(
        search=search,
        type=account_type,
        status=account_status,
        sort=sort,
    )
    return service.list_accounts(filter_data)


@router.get(
    "/summary",
    summary="获取资金账户总览 KPI",
)
def get_accounts_summary(
    service: _AccountServiceDep,
    _current_user: AccountsUnlockedDep,
) -> FundAccountSummaryResponse:
    """总览：余额合计 / 本月进出 / 对账调整合计 / 未挂账户统计."""
    return service.get_summary()


# ==================== 跨账户流水 ====================


@router.get(
    "/flows",
    summary="获取账户流水（可跨账户）",
)
def list_account_flows(
    service: _AccountServiceDep,
    _current_user: AccountsUnlockedDep,
    account_id: Annotated[UUID4 | None, Query(description="账户ID；不传=全部账户")] = None,
    untracked_only: Annotated[bool, Query(description="只看未挂账户的流水")] = False,
    direction: Annotated[str | None, Query(pattern="^(in|out)$", description="方向: in/out")] = None,
    search: Annotated[str | None, Query(max_length=50, description="模糊搜索: 项目/科目/对方")] = None,
    page: Annotated[int, Query(ge=1, description="页码")] = 1,
    page_size: Annotated[int, Query(ge=1, le=200, description="每页数量")] = 50,
) -> FundFlowListResponse:
    """查询账户流水（跨账户，便于找「没记账户」的账并逐笔补挂）."""
    return service.list_flows(
        account_id=account_id,
        untracked_only=untracked_only,
        direction=direction,
        search=search,
        page=page,
        page_size=page_size,
    )


# ==================== 账户 CRUD ====================


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="新建资金账户",
)
@limiter.limit(RateLimits.ACCOUNT_WRITE)
def create_account(
    request: Request,
    data: FundAccountCreate,
    service: _AccountServiceDep,
    current_user: AccountWritePermDep,
    _unlocked: AccountsUnlockedDep,
) -> FundAccountResponse:
    """新建账户（名称在未删除账户中唯一）."""
    return service.create_account(data, str(current_user.id), request=request)


@router.get(
    "/{account_id}",
    summary="获取资金账户详情",
)
def get_account(
    account_id: Annotated[UUID4, Path(description="账户ID")],
    service: _AccountServiceDep,
    _current_user: AccountsUnlockedDep,
) -> FundAccountResponse:
    """账户详情（含推导余额与进出合计）."""
    return service.get_account(account_id)


@router.patch(
    "/{account_id}",
    summary="更新资金账户",
)
@limiter.limit(RateLimits.ACCOUNT_WRITE)
def update_account(
    request: Request,
    account_id: Annotated[UUID4, Path(description="账户ID")],
    data: FundAccountUpdate,
    service: _AccountServiceDep,
    current_user: AccountWritePermDep,
    _unlocked: AccountsUnlockedDep,
) -> FundAccountResponse:
    """更新账户信息；改期初余额会改变推导余额，响应回传新余额供前端提示."""
    return service.update_account(account_id, data, str(current_user.id), request=request)


@router.delete(
    "/{account_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="删除资金账户",
)
@limiter.limit(RateLimits.ACCOUNT_WRITE)
def delete_account(
    request: Request,
    account_id: Annotated[UUID4, Path(description="账户ID")],
    service: _AccountServiceDep,
    current_user: AccountWritePermDep,
    _unlocked: AccountsUnlockedDep,
) -> None:
    """删除账户（有流水或对账记录时 409，提示改为停用）."""
    service.delete_account(account_id, str(current_user.id), request=request)


# ==================== 单账户流水 / 对账调整 ====================


@router.get(
    "/{account_id}/flows",
    summary="获取单账户流水",
)
def list_single_account_flows(
    account_id: Annotated[UUID4, Path(description="账户ID")],
    service: _AccountServiceDep,
    _current_user: AccountsUnlockedDep,
    direction: Annotated[str | None, Query(pattern="^(in|out)$", description="方向: in/out")] = None,
    search: Annotated[str | None, Query(max_length=50, description="模糊搜索")] = None,
    page: Annotated[int, Query(ge=1, description="页码")] = 1,
    page_size: Annotated[int, Query(ge=1, le=200, description="每页数量")] = 50,
) -> FundFlowListResponse:
    """查询指定账户的流水."""
    return service.list_flows(
        account_id=account_id,
        direction=direction,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{account_id}/adjustments",
    summary="获取账户对账调整记录",
)
def list_adjustments(
    account_id: Annotated[UUID4, Path(description="账户ID")],
    service: _AccountServiceDep,
    _current_user: AccountsUnlockedDep,
) -> list[FundAdjustmentResponse]:
    """查询账户的对账调整记录（按日期倒序）."""
    return service.list_adjustments(account_id)


@router.patch(
    "/{account_id}/adjustments/{adjustment_id}/receipts",
    summary="为核对调整补传凭证",
)
@limiter.limit(RateLimits.ACCOUNT_WRITE)
def append_adjustment_receipts(
    request: Request,
    account_id: Annotated[UUID4, Path(description="账户ID")],
    adjustment_id: Annotated[UUID4, Path(description="调整记录ID")],
    data: FundAdjustmentReceiptsRequest,
    service: _AccountServiceDep,
    current_user: AccountWritePermDep,
    _unlocked: AccountsUnlockedDep,
) -> FundAdjustmentResponse:
    """补传核对调整的凭证（**仅追加 receipt_urls**，金额/原因/日期不可改）."""
    return service.append_adjustment_receipts(
        account_id,
        adjustment_id,
        data.receipt_urls,
        str(current_user.id),
        request=request,
    )


@router.post(
    "/{account_id}/adjustments",
    status_code=status.HTTP_201_CREATED,
    summary="新增对账调整",
)
@limiter.limit(RateLimits.ACCOUNT_WRITE)
def create_adjustment(
    request: Request,
    account_id: Annotated[UUID4, Path(description="账户ID")],
    data: FundAdjustmentCreateRequest,
    service: _AccountServiceDep,
    current_user: AccountWritePermDep,
    _unlocked: AccountsUnlockedDep,
) -> FundAdjustmentResponse:
    """对账调整（只加不改不删；差额为 0 时拒绝）."""
    return service.create_adjustment(account_id, data, str(current_user.id), request=request)
