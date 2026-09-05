"""分享归因 referrer 统一校验.

C 端分享链路的 referrer 为明文员工 ID，可被恶意构造伪造归属/刷归因统计；
所有将客户端 referrer 落库的写路径（估价/房源/房源单/招募的 visit 与留资）
统一经 ``resolve_valid_referrer`` 校验：仅存在、active 且具备后台身份的
员工生效，无效一律静默置空（与估价线索 ``_resolve_referrer_id`` 原口径一致）。
"""

from sqlalchemy.orm import Session

from models import User


def resolve_valid_referrer(db: Session, referrer: str | None) -> str | None:
    """校验分享归属员工 ID，无效时返回 None（静默降级为无归属）.

    口径：用户存在 + status=active + 具备后台身份（主角色或附加角色含后台
    角色，见 ``AuthService.has_backend_identity``），普通 C 端用户 ID 不生效，
    避免归因数据被非员工 ID 污染。

    Args:
        db: 同步数据库会话
        referrer: 客户端透传的分享归属员工 ID（可为空）

    Returns:
        校验通过的员工 ID；为空或无效（不存在/非 active/无后台身份）时返回 None

    """
    if not referrer:
        return None
    referrer_user = db.query(User).filter(User.id == referrer, User.status == "active").first()
    if referrer_user is None:
        return None
    # 方法内 import 避免与 services.system.auth 的潜在循环依赖
    from services.system.auth import AuthService

    if not AuthService.has_backend_identity(referrer_user):
        return None
    return referrer_user.id
