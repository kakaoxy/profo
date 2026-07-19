"""角色服务.

处理角色管理的业务逻辑.
"""

from typing import Any

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from models import Role, User, UserRole
from schemas.user import RoleCreate, RoleUpdate
from settings import settings
from utils.formatters import escape_like

from .exceptions import ConflictError, ResourceNotFoundError, ValidationError
from .operation_log import operation_log_service
from .permission import permission_service

# 允许更新的角色字段白名单（防止设置 id 等敏感字段）
_ROLE_ALLOWED_FIELDS = {"name", "code", "description", "permissions", "is_active"}


def _assert_operator_not_in_role(db: Session, operator_id: str | None, role_id: str) -> None:
    """自提权防护：操作者不能修改自身所属的角色（主角色或附加角色）.

    Args:
        db: 数据库会话
        operator_id: 操作者用户ID；None 时跳过校验（兼容内部调用）
        role_id: 被修改的角色ID

    Raises:
        ValidationError: 操作者的主角色或附加角色包含 role_id

    """
    if operator_id is None:
        return
    # 主角色命中
    if db.query(User.id).filter(User.id == operator_id, User.role_id == role_id).first() is not None:
        msg = "不能修改自身所属的角色"
        raise ValidationError(msg)
    # 附加角色命中
    if db.query(UserRole.id).filter(UserRole.user_id == operator_id, UserRole.role_id == role_id).first() is not None:
        msg = "不能修改自身所属的角色"
        raise ValidationError(msg)


def _role_snapshot(role: Role, permission_codes: list[str] | None = None) -> dict[str, Any]:
    """构建角色审计快照.

    Args:
        role: 角色对象
        permission_codes: 权限代码列表；None 表示不包含该字段（避免无谓查询）

    Returns:
        包含业务关键字段的字典

    """
    snapshot: dict[str, Any] = {
        "name": role.name,
        "code": role.code,
        "description": role.description,
        "is_active": role.is_active,
    }
    if permission_codes is not None:
        snapshot["permission_codes"] = permission_codes
    return snapshot


class RoleService:
    """角色服务."""

    def get_roles(
        self,
        db: Session,
        name: str | None = None,
        code: str | None = None,
        is_active: bool | None = None,
        page: int = 1,
        page_size: int | None = None,
    ) -> tuple[int, list[Role]]:
        """获取角色列表."""
        effective_page_size = page_size if page_size is not None else settings.default_page_size
        query = db.query(Role)

        if name:
            query = query.filter(Role.name.like(f"%{escape_like(name)}%", escape="\\"))
        if code:
            query = query.filter(Role.code.like(f"%{escape_like(code)}%", escape="\\"))
        if is_active is not None:
            query = query.filter(Role.is_active == is_active)

        total = query.count()
        offset = (page - 1) * effective_page_size
        roles = query.order_by(Role.name).offset(offset).limit(effective_page_size).all()

        return total, roles

    def get_role_by_id(self, db: Session, role_id: str) -> Role | None:
        """根据ID获取角色."""
        return db.query(Role).filter(Role.id == role_id).first()

    def create_role(
        self,
        db: Session,
        role_data: RoleCreate,
        *,
        operator_id: str | None = None,
        request: Request | None = None,
    ) -> Role:
        """创建角色.

        Args:
            db: 数据库会话
            role_data: 角色创建数据
            operator_id: 操作者用户ID（用于审计日志，可选）
            request: FastAPI Request 对象（用于审计日志提取 IP/UA，可选）

        Returns:
            创建的 Role 对象

        """
        # Check name existence
        existing_name = db.query(Role).filter(Role.name == role_data.name).first()
        if existing_name:
            msg = "角色名称已存在"
            raise ConflictError(msg)

        # Check code existence
        existing_code = db.query(Role).filter(Role.code == role_data.code).first()
        if existing_code:
            msg = "角色代码已存在"
            raise ConflictError(msg)

        # permission_codes 是关联表派生字段，非 Role 模型列，需排除避免构造异常
        db_role = Role(**role_data.model_dump(exclude={"permission_codes"}))
        db.add(db_role)
        db.commit()
        db.refresh(db_role)
        # 设置角色权限（role_permissions 关联表 + 同步 Role.permissions JSON）
        if role_data.permission_codes:
            permission_service.set_role_permissions(db, str(db_role.id), role_data.permission_codes)
            db.refresh(db_role)

        # 审计日志在主操作成功后写入
        permission_codes = permission_service.get_role_permission_codes(db, str(db_role.id))
        operation_log_service.log_action(
            db,
            user_id=operator_id,
            action="create",
            resource_type="role",
            resource_id=str(db_role.id),
            after=_role_snapshot(db_role, permission_codes),
            request=request,
        )
        return db_role

    def update_role(
        self,
        db: Session,
        role_id: str,
        role_data: RoleUpdate,
        *,
        operator_id: str | None = None,
        request: Request | None = None,
    ) -> Role:
        """更新角色.

        Args:
            db: 数据库会话
            role_id: 角色ID
            role_data: 角色更新数据
            operator_id: 操作者用户ID（用于审计日志，可选）
            request: FastAPI Request 对象（用于审计日志提取 IP/UA，可选）

        Returns:
            更新后的 Role 对象

        """
        # 自提权防护：操作者不能修改自身所属角色（含 permission_codes 字段修改）
        _assert_operator_not_in_role(db, operator_id, role_id)

        role = self.get_role_by_id(db, role_id)
        if not role:
            msg = "角色不存在"
            raise ResourceNotFoundError(msg)

        # 审计快照：在更新前记录（含 permission_codes）
        before_permission_codes = permission_service.get_role_permission_codes(db, role_id)
        before_snapshot = _role_snapshot(role, before_permission_codes)

        # Check name uniqueness
        if role_data.name and role_data.name != role.name:
            existing_name = (
                db.query(Role)
                .filter(
                    Role.name == role_data.name,
                    Role.id != role_id,
                )
                .first()
            )
            if existing_name:
                msg = "角色名称已存在"
                raise ConflictError(msg)

        # Check code uniqueness
        if role_data.code and role_data.code != role.code:
            existing_code = (
                db.query(Role)
                .filter(
                    Role.code == role_data.code,
                    Role.id != role_id,
                )
                .first()
            )
            if existing_code:
                msg = "角色代码已存在"
                raise ConflictError(msg)

        update_data = role_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if field in _ROLE_ALLOWED_FIELDS:
                setattr(role, field, value)

        db.commit()
        db.refresh(role)

        # permission_codes 不在白名单（非 Role 列），单独通过关联表编排
        # 区分未传入（None=不修改）与传入空列表（[]=清空）
        if "permission_codes" in update_data:
            permission_service.set_role_permissions(db, role_id, update_data["permission_codes"])
            # 权限变更后递增该角色下所有用户（主角色 + 附加角色）的 token_version，
            # 使其权限缓存失效，下次请求重新从 DB 加载权限。
            # 不撤销 refresh_token：用户可继续用 refresh_token 换取新 access_token，
            # refresh 时会重新校验 token_version。
            user_ids_subquery = (
                select(User.id)
                .where(User.role_id == role_id)
                .union(select(UserRole.user_id).where(UserRole.role_id == role_id))
            )
            db.query(User).filter(User.id.in_(user_ids_subquery)).update(
                {User.token_version: User.token_version + 1}, synchronize_session=False
            )
            db.commit()
            db.refresh(role)

        # 审计日志在主操作成功后写入
        # 仅 permission_codes 变更（其他业务字段未传入）时 action 标注为 assign_permissions
        non_perm_fields = set(update_data.keys()) - {"permission_codes"}
        action = "assign_permissions" if "permission_codes" in update_data and not non_perm_fields else "update"
        after_permission_codes = permission_service.get_role_permission_codes(db, role_id)
        operation_log_service.log_action(
            db,
            user_id=operator_id,
            action=action,
            resource_type="role",
            resource_id=role_id,
            before=before_snapshot,
            after=_role_snapshot(role, after_permission_codes),
            request=request,
        )
        return role

    def delete_role(
        self,
        db: Session,
        role_id: str,
        *,
        operator_id: str | None = None,
        request: Request | None = None,
    ) -> dict:
        """删除角色（逻辑删除，停用角色）.

        Args:
            db: 数据库会话
            role_id: 角色ID
            operator_id: 操作者用户ID（用于审计日志，可选）
            request: FastAPI Request 对象（用于审计日志提取 IP/UA，可选）

        Returns:
            操作结果消息

        """
        role = self.get_role_by_id(db, role_id)
        if not role:
            msg = "角色不存在"
            raise ResourceNotFoundError(msg)

        # 使用 exists 查询避免加载全量用户
        has_users = db.query(User.id).filter(User.role_id == role_id).limit(1).first() is not None
        if has_users:
            msg = "角色下存在用户，无法删除"
            raise ConflictError(msg)

        # 审计快照：在停用前记录
        before_snapshot = _role_snapshot(role)

        role.is_active = False
        db.commit()

        # 审计日志在主操作成功后写入
        operation_log_service.log_action(
            db,
            user_id=operator_id,
            action="delete",
            resource_type="role",
            resource_id=role_id,
            before=before_snapshot,
            request=request,
        )
        return {"message": "角色删除成功"}


# 全局服务实例
role_service = RoleService()
