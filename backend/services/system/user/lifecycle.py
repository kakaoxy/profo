"""用户生命周期服务（密码与账号状态变更）.

处理密码修改/重置与账号停用等敏感操作，统一在变更后失效用户 Token。
"""

from fastapi import Request
from sqlalchemy.orm import Session

from models import User
from schemas.user import PasswordChange, PasswordResetRequest
from services.system.auth import AuthService
from services.system.exceptions import ResourceNotFoundError, ValidationError
from services.system.operation_log import operation_log_service
from utils.auth import get_password_hash, validate_password_strength, verify_password

from .core import _user_snapshot, user_service


class UserLifecycleService:
    """用户生命周期服务（密码修改/重置、账号删除）."""

    def reset_password(
        self,
        db: Session,
        user_id: str,
        password_data: PasswordResetRequest,
        *,
        operator_id: str | None = None,
        request: Request | None = None,
    ) -> dict[str, str]:
        """重置密码."""
        user = user_service.get_user_by_id(db, user_id)
        if not user:
            msg = "用户不存在"
            raise ResourceNotFoundError(msg)

        is_valid, error_msg = validate_password_strength(password_data.password)
        if not is_valid:
            raise ValidationError(error_msg)

        user.password = get_password_hash(password_data.password)
        db.commit()
        # 撤销该用户已签发的所有 Token，强制重新登录
        AuthService.invalidate_user_tokens(db, user)

        # 审计日志在主操作成功后写入（不记录密码本身）
        operation_log_service.log_action(
            db,
            user_id=operator_id,
            action="reset_password",
            resource_type="user",
            resource_id=user_id,
            request=request,
        )
        return {"message": "密码重置成功"}

    def delete_user(
        self,
        db: Session,
        user_id: str,
        current_user_id: str,
        *,
        request: Request | None = None,
    ) -> dict[str, str]:
        """删除用户."""
        if user_id == current_user_id:
            msg = "不能删除自己"
            raise ValidationError(msg)

        user = user_service.get_user_by_id(db, user_id)
        if not user:
            msg = "用户不存在"
            raise ResourceNotFoundError(msg)

        # 审计快照：在删除（停用）前记录
        before_snapshot = _user_snapshot(user)

        user.status = "inactive"
        db.commit()
        # 禁用后立即撤销已签发 Token，避免过期前继续访问
        AuthService.invalidate_user_tokens(db, user)

        # 审计日志在主操作成功后写入；操作者即 current_user_id
        operation_log_service.log_action(
            db,
            user_id=current_user_id,
            action="delete",
            resource_type="user",
            resource_id=user_id,
            before=before_snapshot,
            request=request,
        )
        return {"message": "用户删除成功"}

    def change_password(
        self,
        db: Session,
        current_user: User,
        password_data: PasswordChange,
        *,
        request: Request | None = None,
    ) -> dict[str, str]:
        """修改密码.

        与 reset_password/delete_user 一致，写入审计日志（不记录密码本身）。
        """
        if not verify_password(password_data.current_password, current_user.password)[0]:
            msg = "当前密码错误"
            raise ValidationError(msg)

        is_valid, error_msg = validate_password_strength(password_data.new_password)
        if not is_valid:
            raise ValidationError(error_msg)

        current_user.password = get_password_hash(password_data.new_password)
        current_user.must_change_password = False
        db.commit()
        # 修改密码后撤销旧 Token，强制使用新密码重新登录
        AuthService.invalidate_user_tokens(db, current_user)

        # 审计日志（操作者即用户自身，不记录密码本身）
        operation_log_service.log_action(
            db,
            user_id=current_user.id,
            action="change_password",
            resource_type="user",
            resource_id=str(current_user.id),
            request=request,
        )
        return {"message": "密码修改成功"}


# 全局服务实例
user_lifecycle_service = UserLifecycleService()
