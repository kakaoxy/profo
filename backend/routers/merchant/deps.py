"""小程序员工侧商户权限依赖（C 端令牌 + 后台身份 + merchant:* 权限）."""

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends

from dependencies.auth import (
    CurrentCEmployeeUserDep,
    DbSessionDep,
    has_permission,
)
from models.user.user import User
from services.system.exceptions import PermissionDeniedError


def _checker(code: str) -> Callable[..., User]:
    """构造 C 端员工权限校验依赖."""

    def checker(user: CurrentCEmployeeUserDep, db: DbSessionDep) -> User:
        if not has_permission(user, code, db):
            msg = f"权限不足：缺少权限 {code}"
            raise PermissionDeniedError(msg)
        return user

    return checker


def _two_permission_checker(first: str, second: str) -> Callable[..., User]:
    """要求同时具备两个权限（员工现场建档需 merchant:write + merchant:visit）."""

    def checker(user: CurrentCEmployeeUserDep, db: DbSessionDep) -> User:
        missing = [code for code in (first, second) if not has_permission(user, code, db)]
        if missing:
            msg = f"权限不足：缺少权限 {', '.join(missing)}"
            raise PermissionDeniedError(msg)
        return user

    return checker


MerchantCReadDep = Annotated[User, Depends(_checker("merchant:read"))]
MerchantCWriteDep = Annotated[User, Depends(_checker("merchant:write"))]
MerchantCVisitDep = Annotated[User, Depends(_checker("merchant:visit"))]
MerchantCWriteVisitDep = Annotated[User, Depends(_two_permission_checker("merchant:write", "merchant:visit"))]

__all__ = [
    "MerchantCReadDep",
    "MerchantCVisitDep",
    "MerchantCWriteDep",
    "MerchantCWriteVisitDep",
]
