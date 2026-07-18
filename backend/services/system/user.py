"""用户服务.

处理用户管理的业务逻辑.
"""

from typing import Any

from fastapi import Request
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from constants.role_codes import RoleCode
from models import Role, User, UserRole
from schemas.user import PasswordChange, PasswordResetRequest, UserCreate, UserUpdate
from settings import settings
from utils.auth import get_password_hash, validate_password_strength, verify_password
from utils.crypto import hash_phone
from utils.formatters import escape_like, mask_phone

from .auth import AuthService
from .exceptions import AuthenticationError, ConflictError, ResourceNotFoundError, ValidationError
from .operation_log import operation_log_service

# 允许更新的用户字段白名单（防止设置 password/wechat_*/id 等敏感字段）
_USER_ALLOWED_FIELDS = {"nickname", "phone", "avatar", "role_id", "status"}


def _user_snapshot(user: User) -> dict[str, Any]:
    """构建用户审计快照.

    仅包含业务关键字段；phone 脱敏后记录，password/phone_hash 等敏感字段不记录。
    """
    return {
        "username": user.username,
        "nickname": user.nickname,
        "role_id": user.role_id,
        "status": user.status,
        "phone": mask_phone(user.phone),
    }


class UserService:
    """用户服务."""

    def get_users(
        self,
        db: Session,
        username: str | None = None,
        nickname: str | None = None,
        role_id: str | None = None,
        user_status: str | None = None,
        page: int = 1,
        page_size: int | None = None,
    ) -> tuple[int, list[User]]:
        """获取用户列表."""
        effective_page_size = page_size if page_size is not None else settings.default_page_size
        query = db.query(User)

        if username:
            query = query.filter(User.username.like(f"%{escape_like(username)}%", escape="\\"))
        if nickname:
            query = query.filter(User.nickname.like(f"%{escape_like(nickname)}%", escape="\\"))

        if role_id:
            query = query.filter(User.role_id == role_id)
        if user_status:
            query = query.filter(User.status == user_status)

        total = query.count()
        offset = (page - 1) * effective_page_size
        users = query.order_by(User.created_at.desc()).offset(offset).limit(effective_page_size).all()

        return total, users

    def get_user_by_id(self, db: Session, user_id: str) -> User | None:
        """根据ID获取用户."""
        return db.query(User).filter(User.id == user_id).first()

    def _build_additional_user_roles(
        self,
        db: Session,
        user: User,
        additional_role_ids: list[str],
    ) -> list[UserRole]:
        """校验附加角色ID并返回待写入的 UserRole 对象列表.

        校验规则：
        - 所有 role_id 必须存在
        - 所有附加角色 code 必须为 "customer"
        - 主角色 code 不能为 "customer"（否则无需附加）

        Args:
            db: 数据库会话
            user: 用户对象（需有 id 和 role_id）
            additional_role_ids: 附加角色ID列表（可能含重复）

        Returns:
            待写入的 UserRole 对象列表（已去重）

        Raises:
            ValidationError: 附加角色不存在 / 不是 customer / 主角色已为 customer

        """
        # 去重并保留顺序
        unique_ids = list(dict.fromkeys(additional_role_ids))

        # 查询并校验附加角色存在性（query 会触发 session auto-flush，确保 user.id 可用）
        roles = db.query(Role).filter(Role.id.in_(unique_ids)).all()
        if len(roles) != len(unique_ids):
            msg = "附加角色不存在"
            raise ValidationError(msg)

        # 校验所有附加角色 code == "customer"
        if any(r.code != RoleCode.CUSTOMER.value for r in roles):
            msg = "附加角色仅支持 customer"
            raise ValidationError(msg)

        # 校验主角色 code != "customer"（直接使用已加载的 user.role 关系，避免重复查询）
        main_role = user.role
        if not main_role:
            msg = "主角色不存在"
            raise ValidationError(msg)
        if main_role.code == RoleCode.CUSTOMER.value:
            msg = "主角色已为 C 端身份，无需附加"
            raise ValidationError(msg)

        return [UserRole(user_id=user.id, role_id=role_id) for role_id in unique_ids]

    def create_user(
        self,
        db: Session,
        user_data: UserCreate,
        additional_role_ids: list[str] | None = None,
        *,
        operator_id: str | None = None,
        request: Request | None = None,
    ) -> User:
        """创建用户.

        Args:
            db: 数据库会话
            user_data: 用户创建数据
            additional_role_ids: 附加角色ID列表（None 或空列表表示无附加角色；
                非空时校验所有角色必须为 customer，且主角色不能为 customer）
            operator_id: 操作者用户ID（用于审计日志，可选）
            request: FastAPI Request 对象（用于审计日志提取 IP/UA，可选）

        Returns:
            创建的 User 对象

        Raises:
            ConflictError: 用户名或手机号已被使用
            ValidationError: 密码强度不足 / 附加角色校验失败

        """
        # Check username existence
        existing_user = db.query(User).filter(User.username == user_data.username).first()
        if existing_user:
            msg = "用户名已存在"
            raise ConflictError(msg)

        # Check phone existence (via hash, since phone is encrypted)
        phone_hash_value: str | None = None
        if user_data.phone:
            phone_hash_value = hash_phone(user_data.phone)
            existing_phone = db.query(User).filter(User.phone_hash == phone_hash_value).first()
            if existing_phone:
                msg = "手机号已被使用"
                raise ConflictError(msg)

        # Validate password strength
        is_valid, error_msg = validate_password_strength(user_data.password)
        if not is_valid:
            raise ValidationError(error_msg)

        # Create user（additional_role_ids 由 UserRole 表管理，不写入 User 列）
        db_user = User(
            **user_data.model_dump(exclude={"password", "additional_role_ids"}),
            phone_hash=phone_hash_value,
            password=get_password_hash(user_data.password),
        )
        db.add(db_user)

        try:
            # 处理附加角色（与主用户记录在同一事务内提交）
            # None 视为未提供，等同空列表
            if additional_role_ids:
                # 显式 flush 让 db_user.id 在调用 _build_additional_user_roles 前生成
                # （SessionLocal autoflush=False，依赖 db.query 触发 flush 不可靠；
                # UserRole.user_id 是 NOT NULL，需 db_user.id 有值）
                # flush 放在 try 内部：若触发唯一约束冲突（用户名/手机号）也能被捕获转 ConflictError
                db.flush()
                user_roles_to_add = self._build_additional_user_roles(db, db_user, additional_role_ids)
                db.add_all(user_roles_to_add)
            db.commit()
            db.refresh(db_user)
        except IntegrityError as e:
            db.rollback()
            msg = "用户名或手机号已被使用"
            raise ConflictError(msg) from e

        # 审计日志在主操作成功后写入；写入失败由 OperationLogService 内部捕获，不阻塞主流程
        operation_log_service.log_action(
            db,
            user_id=operator_id,
            action="create",
            resource_type="user",
            resource_id=str(db_user.id),
            after=_user_snapshot(db_user),
            request=request,
        )
        return db_user

    def update_user(
        self,
        db: Session,
        user_id: str,
        user_data: UserUpdate,
        additional_role_ids: list[str] | None = None,
        *,
        operator_id: str | None = None,
        request: Request | None = None,
    ) -> User:
        """更新用户.

        Args:
            db: 数据库会话
            user_id: 用户ID
            user_data: 用户更新数据
            additional_role_ids: 附加角色ID列表（None=不修改；[]=清空；
                非空=校验后全量替换，所有角色必须为 customer）
            operator_id: 操作者用户ID（用于审计日志，可选）
            request: FastAPI Request 对象（用于审计日志提取 IP/UA，可选）

        Returns:
            更新后的 User 对象

        Raises:
            ResourceNotFoundError: 用户不存在
            ConflictError: 手机号已被使用
            ValidationError: 附加角色校验失败

        """
        user = self.get_user_by_id(db, user_id)
        if not user:
            msg = "用户不存在"
            raise ResourceNotFoundError(msg)

        # 审计快照：在更新前记录
        before_snapshot = _user_snapshot(user)

        # Check phone uniqueness (via hash)
        if user_data.phone and user_data.phone != user.phone:
            new_hash = hash_phone(user_data.phone)
            existing_phone = (
                db.query(User)
                .filter(
                    User.phone_hash == new_hash,
                    User.id != user_id,
                )
                .first()
            )
            if existing_phone:
                msg = "手机号已被使用"
                raise ConflictError(msg)

        # 记录禁用前的状态，用于判断是否需要撤销 Token
        was_active = user.status == "active"

        update_data = user_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if field == "phone":
                # 同步更新 phone_hash 维护唯一性
                user.phone = value
                user.phone_hash = hash_phone(value) if value else None
            elif field in _USER_ALLOWED_FIELDS:
                setattr(user, field, value)

        # 处理附加角色（全量替换）
        # None=不修改；[]=清空；非空=校验后替换
        if additional_role_ids is not None:
            db.query(UserRole).filter(UserRole.user_id == user_id).delete(synchronize_session=False)
            if additional_role_ids:
                user_roles_to_add = self._build_additional_user_roles(db, user, additional_role_ids)
                db.add_all(user_roles_to_add)

        # 判断是否需要因角色变更递增 token_version（触发权限缓存失效）
        # role_id 在 update_data 中 或 additional_role_ids 显式传入（含空列表）均视为变更
        needs_token_invalidation: bool = "role_id" in update_data or additional_role_ids is not None

        # 用户由启用变为禁用时，立即撤销已签发 Token，避免旧 Token 在过期前继续访问
        if was_active and user.status != "active":
            db.commit()
            # invalidate_user_tokens 已递增 token_version，无需再次递增
            AuthService.invalidate_user_tokens(db, user)
        elif needs_token_invalidation:
            db.commit()
            # 角色变更：仅递增 token_version 使权限缓存失效，不撤销 refresh_token。
            # 用户可继续用 refresh_token 换取新 access_token（携带新 token_version）。
            db.query(User).filter(User.id == user_id).update(
                {User.token_version: User.token_version + 1}, synchronize_session=False
            )
            db.commit()
        else:
            db.commit()
        db.refresh(user)

        # 审计日志在主操作成功后写入
        operation_log_service.log_action(
            db,
            user_id=operator_id,
            action="update",
            resource_type="user",
            resource_id=user_id,
            before=before_snapshot,
            after=_user_snapshot(user),
            request=request,
        )
        return user

    def reset_password(
        self,
        db: Session,
        user_id: str,
        password_data: PasswordResetRequest,
        *,
        operator_id: str | None = None,
        request: Request | None = None,
    ) -> dict:
        """重置密码."""
        user = self.get_user_by_id(db, user_id)
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
    ) -> dict:
        """删除用户."""
        if user_id == current_user_id:
            msg = "不能删除自己"
            raise ValidationError(msg)

        user = self.get_user_by_id(db, user_id)
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

    def change_password(self, db: Session, current_user: User, password_data: PasswordChange) -> dict:
        """修改密码."""
        if not verify_password(password_data.current_password, current_user.password):
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
        return {"message": "密码修改成功"}

    def check_phone_taken_by_other(self, db: Session, phone: str, exclude_user_id: int) -> None:
        """检查手机号是否已被其他用户绑定.

        Args:
            db: 数据库会话
            phone: 手机号
            exclude_user_id: 排除的用户ID

        Raises:
            ValidationError: 手机号已被其他账号绑定

        """
        phone_hash_value = hash_phone(phone)
        existing = db.query(User).filter(User.phone_hash == phone_hash_value, User.id != exclude_user_id).first()
        if existing:
            msg = "手机号已被其他账号绑定"
            raise ValidationError(msg)

    def update_nickname(self, db: Session, user: User, nickname: str) -> User:
        """更新用户昵称.

        Args:
            db: 数据库会话
            user: 用户对象
            nickname: 新昵称

        Returns:
            User: 更新后的用户对象

        """
        user.nickname = nickname
        db.commit()
        db.refresh(user)
        return user

    def update_phone(self, db: Session, user: User, phone: str) -> User:
        """更新用户手机号.

        Args:
            db: 数据库会话
            user: 用户对象
            phone: 新手机号

        Returns:
            User: 更新后的用户对象

        """
        user.phone = phone
        user.phone_hash = hash_phone(phone) if phone else None
        db.commit()
        db.refresh(user)
        return user

    def update_phone_with_verification(self, db: Session, user: User, phone: str, password: str) -> User:
        """验证密码后更新用户手机号.

        Args:
            db: 数据库会话
            user: 当前用户对象
            phone: 新手机号
            password: 当前密码（用于身份确认）

        Returns:
            User: 更新后的用户对象

        Raises:
            AuthenticationError: 密码错误
            ValidationError: 手机号已被其他账号绑定

        """
        if not verify_password(password, user.password):
            msg = "密码错误"
            raise AuthenticationError(msg)

        self.check_phone_taken_by_other(db, phone, user.id)
        return self.update_phone(db, user, phone)

    def set_initial_phone(self, db: Session, user: User, phone: str) -> User:
        """首次设置用户手机号（仅在用户尚未绑定手机号时可用）.

        已绑定手机号的用户需走 update_phone_with_verification 流程，
        避免绕过密码验证覆盖已有手机号。

        Args:
            db: 数据库会话
            user: 当前用户对象
            phone: 新手机号

        Returns:
            User: 更新后的用户对象

        Raises:
            ValidationError: 用户已绑定手机号 或 手机号已被其他账号绑定

        """
        if user.phone:
            msg = "已绑定手机号，修改请使用密码验证"
            raise ValidationError(msg)

        self.check_phone_taken_by_other(db, phone, user.id)
        return self.update_phone(db, user, phone)

    def list_users_simple(
        self,
        db: Session,
        nickname: str | None = None,
        status: str | None = None,
    ) -> list[dict]:
        """获取简化用户列表（仅id/nickname/username），用于下拉选择.

        仅返回后台角色用户（admin/operator/user），排除 C 端 customer 角色，
        角色集合与 AuthService.BACKEND_ROLE_CODES 对齐。
        """
        from sqlalchemy import or_  # noqa: PLC0415

        query = (
            db.query(User.id, User.nickname, User.username)
            .join(Role, Role.id == User.role_id)
            .filter(Role.code.in_(AuthService.BACKEND_ROLE_CODES))
        )

        if status:
            query = query.filter(User.status == status)

        if nickname:
            query = query.filter(
                or_(
                    func.lower(User.nickname).like(f"%{escape_like(nickname).lower()}%", escape="\\"),
                    func.lower(User.username).like(f"%{escape_like(nickname).lower()}%", escape="\\"),
                ),
            )

        users = query.all()
        return [{"id": u.id, "nickname": u.nickname, "username": u.username} for u in users]


# 全局服务实例
user_service = UserService()
