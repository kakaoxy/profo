"""经纪人端钥匙分享路由（/public/key-shares/{token}…）.

免登录 GET 返回掩码（skipAuth）；查看明文需 C 端 token，即时写
KeyShareView + 审计日志。Router 禁 ORM，逻辑在 KeySharePublicService。
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request
from fastapi.security import OAuth2PasswordBearer
from pydantic import UUID4

from dependencies.auth import CurrentActiveUserDep, DbSessionDep
from dependencies.keys import KeySharePublicServiceDep
from models import User
from schemas.keys import PublicKeyShareResponse, PublicKeyShareRevealResponse
from utils.common import RateLimits, limiter

router = APIRouter(prefix="/public", tags=["public-key-shares"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token", auto_error=False)


async def _optional_c_user(
    request: Request,
    db: DbSessionDep,
    token_from_header: str | None = Depends(oauth2_scheme),
) -> User | None:
    """可选 C 端用户：已登录则返回用户（用于「已查看」标记/首访日志），否则 None.

    公开页面的身份是可选增强信息，认证失败静默降级为匿名访问（设计意图）。
    """
    if token_from_header is None and request.cookies.get("c_access_token") is None:
        return None
    from dependencies.auth import get_current_user

    try:
        return await get_current_user(request, db, token_from_header)
    except Exception:
        return None


OptionalCUserDep = Annotated[User | None, Depends(_optional_c_user)]


@router.get("/key-shares/{token}")
@limiter.limit(RateLimits.KEY_SHARE_PUBLIC)
def get_public_key_share(
    request: Request,
    token: Annotated[str, Path(description="分享令牌")],
    service: KeySharePublicServiceDep,
    current_user: OptionalCUserDep,
) -> PublicKeyShareResponse:
    """免登录获取分享信息（掩码列表 + 有效期状态 + 已查看角标）.

    回收态返回专用 status=revoked（无密码数据）；已过期软标记不阻断。
    """
    return service.get_public_share(token, current_user)


@router.post("/key-shares/{token}/keys/{key_id}/reveal")
@limiter.limit(RateLimits.KEY_SHARE_REVEAL)
def reveal_public_key(
    request: Request,
    token: Annotated[str, Path(description="分享令牌")],
    key_id: Annotated[UUID4, Path(description="密码组ID")],
    service: KeySharePublicServiceDep,
    current_user: CurrentActiveUserDep,
) -> PublicKeyShareRevealResponse:
    """查看明文（需 C 端登录；写 KeyShareView + 审计日志后返回明文）."""
    return service.reveal_public_key(token, key_id, current_user)
