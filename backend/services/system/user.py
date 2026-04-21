"""
用户服务
处理用户管理的业务逻辑
"""
from sqlalchemy.orm import Session

from models import User
from schemas.user import UserCreate, UserUpdate, PasswordResetRequest, PasswordChange
from utils.auth import get_password_hash, verify_password, validate_password_strength
from .exceptions import ResourceNotFoundError, ConflictError, ValidationError


class UserService:
    """用户服务"""

    def get_users(
        self,
        db: Session,
        username: str | None = None,
        nickname: str | None = None,
        role_id: str | None = None,
        user_status: str | None = None,
        page: int = 1,
        page_size: int = 50
    ) -> tuple[int, list[User]]:
        """获取用户列表"""
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
        offset = (page - 1) * page_size
        users = query.order_by(User.created_at.desc()).offset(offset).limit(page_size).all()
        
        return total, users

    def get_user_by_id(self, db: Session, user_id: str) -> User | None:
        """根据ID获取用户"""
        return db.query(User).filter(User.id == user_id).first()

    def create_user(self, db: Session, user_data: UserCreate) -> User:
        """创建用户"""
        # Check username existence
        existing_user = db.query(User).filter(User.username == user_data.username).first()
        if existing_user:
            raise ConflictError("用户名已存在")
        
        # Check phone existence
        if user_data.phone:
            existing_phone = db.query(User).filter(User.phone == user_data.phone).first()
            if existing_phone:
                raise ConflictError("手机号已被使用")
        
        # Validate password strength
        is_valid, error_msg = validate_password_strength(user_data.password)
        if not is_valid:
            raise ValidationError(error_msg)
        
        # Create user
        db_user = User(
            **user_data.model_dump(exclude={"password"}),
            password=get_password_hash(user_data.password)
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        
        return db_user

    def update_user(self, db: Session, user_id: str, user_data: UserUpdate) -> User:
        """更新用户"""
        user = self.get_user_by_id(db, user_id)
        if not user:
            raise ResourceNotFoundError("用户不存在")
        
        # Check phone uniqueness
        if user_data.phone and user_data.phone != user.phone:
            existing_phone = db.query(User).filter(
                User.phone == user_data.phone,
                User.id != user_id
            ).first()
            if existing_phone:
                raise ConflictError("手机号已被使用")
        
        update_data = user_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(user, field, value)
        
        db.commit()
        db.refresh(user)
        return user

    def reset_password(self, db: Session, user_id: str, password_data: PasswordResetRequest) -> dict:
        """重置密码"""
        user = self.get_user_by_id(db, user_id)
        if not user:
            raise ResourceNotFoundError("用户不存在")
        
        is_valid, error_msg = validate_password_strength(password_data.password)
        if not is_valid:
            raise ValidationError(error_msg)
        
        user.password = get_password_hash(password_data.password)
        db.commit()
        return {"message": "密码重置成功"}

    def delete_user(self, db: Session, user_id: str, current_user_id: str) -> dict:
        """删除用户"""
        if user_id == current_user_id:
            raise ValidationError("不能删除自己")
        
        user = self.get_user_by_id(db, user_id)
        if not user:
            raise ResourceNotFoundError("用户不存在")
        
        db.delete(user)
        db.commit()
        return {"message": "用户删除成功"}

    def change_password(self, db: Session, current_user: User, password_data: PasswordChange) -> dict:
        """修改密码"""
        if not verify_password(password_data.current_password, current_user.password):
            raise ValidationError("当前密码错误")
        
        is_valid, error_msg = validate_password_strength(password_data.new_password)
        if not is_valid:
            raise ValidationError(error_msg)
        
        current_user.password = get_password_hash(password_data.new_password)
        current_user.must_change_password = False
        db.commit()
        return {"message": "密码修改成功"}


# 全局服务实例
user_service = UserService()
