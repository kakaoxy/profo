"""用户服务.

处理用户管理的业务逻辑.
"""

from sqlalchemy.orm import Session

from models import User
from schemas.user import PasswordChange, PasswordResetRequest, UserCreate, UserUpdate
from settings import settings
from utils.auth import get_password_hash, validate_password_strength, verify_password
from utils.crypto import hash_phone

from .auth import AuthService
from .exceptions import AuthenticationError, ConflictError, ResourceNotFoundError, ValidationError

# 允许更新的用户字段白名单（防止设置 password/wechat_*/id 等敏感字段）
_USER_ALLOWED_FIELDS = {"nickname", "phone", "avatar", "role_id", "status"}


class UserService:
    """用户服务."""

    def get_users(  # noqa: PLR0913
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
            query = query.filter(User.username.like(f"%{username}%"))
        if nickname:
            query = query.filter(User.nickname.like(f"%{nickname}%"))
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

    def create_user(self, db: Session, user_data: UserCreate) -> User:
        """创建用户."""
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

        # Create user
        db_user = User(
            **user_data.model_dump(exclude={"password"}),
            phone_hash=phone_hash_value,
            password=get_password_hash(user_data.password),
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)

        return db_user

    def update_user(self, db: Session, user_id: str, user_data: UserUpdate) -> User:
        """更新用户."""
        user = self.get_user_by_id(db, user_id)
        if not user:
            msg = "用户不存在"
            raise ResourceNotFoundError(msg)

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

        # 用户由启用变为禁用时，立即撤销已签发 Token，避免旧 Token 在过期前继续访问
        if was_active and user.status != "active":
            db.commit()
            AuthService.invalidate_user_tokens(db, user)
        else:
            db.commit()
        db.refresh(user)
        return user

    def reset_password(self, db: Session, user_id: str, password_data: PasswordResetRequest) -> dict:
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
        return {"message": "密码重置成功"}

    def delete_user(self, db: Session, user_id: str, current_user_id: str) -> dict:
        """删除用户."""
        if user_id == current_user_id:
            msg = "不能删除自己"
            raise ValidationError(msg)

        user = self.get_user_by_id(db, user_id)
        if not user:
            msg = "用户不存在"
            raise ResourceNotFoundError(msg)

        user.status = "inactive"
        db.commit()
        # 禁用后立即撤销已签发 Token，避免过期前继续访问
        AuthService.invalidate_user_tokens(db, user)
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
        existing = (
            db.query(User)
            .filter(User.phone_hash == phone_hash_value, User.id != exclude_user_id)
            .first()
        )
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
        """获取简化用户列表（仅id/nickname/username），用于下拉选择."""
        from sqlalchemy import or_  # noqa: PLC0415

        query = db.query(User.id, User.nickname, User.username)

        if status:
            query = query.filter(User.status == status)

        if nickname:
            query = query.filter(
                or_(
                    User.nickname.ilike(f"%{nickname}%"),
                    User.username.ilike(f"%{nickname}%"),
                ),
            )

        users = query.all()
        return [{"id": u.id, "nickname": u.nickname, "username": u.username} for u in users]


# 全局服务实例
user_service = UserService()
