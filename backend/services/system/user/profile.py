"""用户资料与手机号服务（C 端）.

处理 C 端用户的基本资料更新与手机号绑定/变更，含临时账号合并检测。
"""

from sqlalchemy.orm import Session

from models import User
from services.system.exceptions import (
    AuthenticationError,
    BusinessLogicError,
    PhoneTakenByMainAccountError,
    ValidationError,
)
from utils.auth import verify_password
from utils.crypto import hash_phone
from utils.formatters import mask_phone


class UserProfileService:
    """用户资料与手机号服务（C 端）."""

    def check_phone_taken_by_other(self, db: Session, phone: str, exclude_user_id: str) -> User | None:
        """检查手机号是否已被其他用户绑定，返回占用的用户（无则 None）.

        Args:
            db: 数据库会话
            phone: 手机号
            exclude_user_id: 排除的用户ID

        Returns:
            User | None: 占用该手机号的其他用户；无占用则返回 None

        """
        phone_hash_value = hash_phone(phone)
        return db.query(User).filter(User.phone_hash == phone_hash_value, User.id != exclude_user_id).first()

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
        if not verify_password(password, user.password)[0]:
            msg = "密码错误"
            raise AuthenticationError(msg)

        if self.check_phone_taken_by_other(db, phone, user.id):
            msg = "手机号已被其他账号绑定"
            raise ValidationError(msg)
        return self.update_phone(db, user, phone)

    def set_initial_phone(self, db: Session, user: User, phone: str) -> User:
        """首次设置用户手机号（仅在用户尚未绑定手机号时可用）.

        已绑定手机号的用户需走 update_phone_with_verification 流程，
        避免绕过密码验证覆盖已有手机号。

        手机号占用检测分支：
        - 被其他 is_temporary=False 的主账号占用 → 抛 PhoneTakenByMainAccountError
          （路由层捕获后返回 40901 合并冲突响应，前端展示合并确认视图）
        - 被其他 is_temporary=True 的临时账号占用 → 抛 BusinessLogicError
          （提示用户联系客服，不自动合并两个临时账号）

        绑定成功后：若 user.is_temporary=True 则置 False（临时账号转正）。

        Args:
            db: 数据库会话
            user: 当前用户对象
            phone: 新手机号

        Returns:
            User: 更新后的用户对象

        Raises:
            ValidationError: 用户已绑定手机号
            PhoneTakenByMainAccountError: 手机号已被主账号占用（40901）
            BusinessLogicError: 手机号已被其他临时账号占用

        """
        if user.phone:
            msg = "已绑定手机号，修改请使用密码验证"
            raise ValidationError(msg)

        existing = self.check_phone_taken_by_other(db, phone, user.id)
        if existing:
            if not existing.is_temporary:
                # 手机号已被主账号占用 → 触发合并流程
                raise PhoneTakenByMainAccountError(
                    target_user_hint={
                        "nickname": existing.nickname or existing.username,
                        "phone_masked": mask_phone(existing.phone) or "",
                    },
                )
            # 手机号已被其他临时账号占用 → 不自动合并，提示联系客服
            msg = "该手机号已被其他临时账号占用，请联系客服"
            raise BusinessLogicError(msg)

        user.phone = phone
        user.phone_hash = hash_phone(phone)
        if user.is_temporary:
            user.is_temporary = False
        db.commit()
        db.refresh(user)
        return user

    def bind_phone_via_wechat(self, db: Session, user: User, wx_code: str) -> dict[str, bool]:
        """用 wx.getPhoneNumber 的 code 换取手机号并绑定.

        1. 调用微信 getPhoneNumber API 换取手机号
        2. 复用 set_initial_phone 的绑定/合并检测逻辑
        3. 返回 {"success": True}；若手机号被主账号占用则抛 PhoneTakenByMainAccountError
           （由路由层捕获后返回 40901 合并冲突响应）

        Args:
            db: 数据库会话
            user: 当前用户对象
            wx_code: wx.getPhoneNumber 回调的 code

        Returns:
            {"success": True} 绑定成功

        Raises:
            ValidationError: 微信接口返回错误 或 用户已绑定手机号
            PhoneTakenByMainAccountError: 手机号已被主账号占用（40901）
            BusinessLogicError: 手机号已被其他临时账号占用

        """
        # 延迟导入避免循环依赖（wechat.py 不依赖 user 子包，但保持防御性）
        from services.system.wechat import WeChatAuthService

        phone_info = WeChatAuthService.fetch_wechat_phone_number(wx_code)
        phone = phone_info.get("phoneNumber")
        if not phone:
            msg = "微信手机号授权未返回手机号"
            raise ValidationError(msg)

        self.set_initial_phone(db, user, str(phone))
        return {"success": True}


# 全局服务实例
user_profile_service = UserProfileService()
