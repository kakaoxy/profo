"""用户身份判定.

跨路由复用的「是否内部员工」判定逻辑：主角色或附加角色中存在非 customer
角色即内部员工。供 /public/auth/me 与 /public/users 构建响应时填充
PublicUserInfo.is_internal，替代前端依赖 permissions 差集的推断。

与 AuthService.has_backend_identity（constants.role_codes.BACKEND_ROLE_CODES）
的差异：BACKEND_ROLE_CODES = {admin, operator, user}，若未来新增后台角色而
未同步该常量，has_backend_identity 会漏判；本模块以「非 customer 即内部」
的反向口径判定，与前端旧行为（permissions 差集）语义一致，且不受新增角色影响。
"""

from constants.role_codes import RoleCode
from models import User


def is_internal_user(user: User) -> bool:
    """判断用户是否为内部员工（主角色或附加角色含非 customer 角色）.

    Args:
        user: 用户对象（需有 role 与 roles 关系；role/roles 为 None 时安全返回 False）

    Returns:
        True 表示内部员工；False 表示纯 C 端用户

    """
    if user.role and user.role.code != RoleCode.CUSTOMER.value:
        return True
    return any(r.code != RoleCode.CUSTOMER.value for r in (user.roles or []))
