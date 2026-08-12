"""用户服务.

处理用户管理的业务逻辑.
"""

import logging
from typing import Any

from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from constants.role_codes import RoleCode
from models import Lead, PropertyCurrent, RefreshToken, Role, User, UserRole
from schemas.user import PasswordChange, PasswordResetRequest, UserCreate, UserUpdate
from settings import settings
from utils.auth import get_password_hash, validate_password_strength, verify_password
from utils.crypto import hash_phone
from utils.formatters import escape_like, mask_phone
from utils.security_logger import log_auth_event

from .auth import AuthService
from .exceptions import (
    AccountAlreadyMergedError,
    AuthenticationError,
    BusinessLogicError,
    ConflictError,
    PhoneTakenByMainAccountError,
    ResourceNotFoundError,
    TargetHasWechatError,
    ValidationError,
    WeChatNotBoundError,
)
from .operation_log import operation_log_service

logger = logging.getLogger(__name__)

# 允许更新的用户字段白名单（防止设置 password/wechat_*/id 等敏感字段）
_USER_ALLOWED_FIELDS = {"nickname", "phone", "avatar", "role_id", "status"}

# 排序字段白名单 → SQLAlchemy 列/表达式（leads_count 由子查询单独处理）
_SORT_FIELDS: dict[str, Any] = {
    "nickname": User.nickname,
    # joinedload(User.role) 会把 roles 表别名为 roles_1，直接用 Role.code 会生成
    # ORDER BY roles.code，引用未别名的 roles 表导致 PostgreSQL UndefinedTable 错误。
    # 改用相关标量子查询（自带 FROM roles），避免与 joinedload 别名冲突。
    "role": select(Role.code).where(Role.id == User.role_id).scalar_subquery(),
    "last_login_at": User.last_login_at,
    "created_at": User.created_at,
}


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
        sort: str | None = None,
        sort_dir: str | None = None,
    ) -> tuple[int, list[User]]:
        """获取用户列表，支持搜索、筛选和排序.

        通过相关子查询在单条 SQL 中填充 leads_count（避免 LEFT JOIN + GROUP BY
        与 joinedload(User.role) 冲突——PostgreSQL 严格要求 GROUP BY 包含
        所有非聚合列，而 joinedload 会向 SELECT 注入 roles 表的列）。
        total 为匹配筛选条件的用户数（不含 lead 子查询）。

        sort 白名单：nickname/role/leads_count/last_login_at/created_at，
        None 或非法值时回退到 created_at；sort_dir 默认 desc。
        """
        effective_page_size = page_size if page_size is not None else settings.default_page_size
        query = db.query(User).options(joinedload(User.role), selectinload(User.roles))

        if username:
            query = query.filter(User.username.like(f"%{escape_like(username)}%", escape="\\"))
        if nickname:
            query = query.filter(User.nickname.like(f"%{escape_like(nickname)}%", escape="\\"))

        if role_id:
            query = query.filter(User.role_id == role_id)
        if user_status:
            query = query.filter(User.status == user_status)

        # total 为匹配筛选条件的用户数（不含 lead 子查询）
        total = query.count()
        offset = (page - 1) * effective_page_size

        # 单条 SQL：相关子查询计算 leads_count，避免 N+1（不引入 LEFT JOIN + GROUP BY）
        # 必须过滤 is_deleted，与线索列表页查询保持一致
        leads_count_subq = (
            db.query(func.count(Lead.id))
            .filter(Lead.creator_id == User.id, Lead.is_deleted.is_(False))
            .scalar_subquery()
            .label("leads_count")
        )

        # 排序方向：仅 asc 降序反转为升序，其余一律按 desc 处理（fail-closed）
        direction = "asc" if sort_dir == "asc" else "desc"
        # 排序字段白名单校验：非法值回退到 created_at
        order_expr = leads_count_subq if sort == "leads_count" else _SORT_FIELDS.get(sort, User.created_at)
        order_clause = order_expr.asc() if direction == "asc" else order_expr.desc()

        rows = (
            query.with_entities(User, leads_count_subq)
            .order_by(order_clause)
            .offset(offset)
            .limit(effective_page_size)
            .all()
        )
        # 每行返回 (User, leads_count_int)，将聚合值挂到 User 实例上，
        # Pydantic from_attributes=True 会自动拾取该属性
        users: list[User] = []
        for user, leads_count in rows:
            user.leads_count = int(leads_count or 0)
            users.append(user)

        # 批量填充 wechat_bound，避免 N+1（单条 SQL 查询所有间接绑定的目标用户ID）
        self._attach_wechat_bound(db, users)

        return total, users

    def attach_leads_count(self, db: Session, user: User) -> User:
        """查询并设置 user.leads_count，供 UserResponse.from_attributes 拾取.

        用于 get_user_by_id/create_user/update_user/get_current_user 等需要
        返回 UserResponse 的场景，保持 leads_count 在所有响应路径一致。
        """
        leads_count = (
            db.query(func.count(Lead.id)).filter(Lead.creator_id == user.id, Lead.is_deleted.is_(False)).scalar() or 0
        )
        user.leads_count = int(leads_count)
        return user

    def _attach_wechat_bound(self, db: Session, users: list[User]) -> None:
        """批量计算并 setattr user.wechat_bound，避免 N+1.

        wechat_bound 计算规则：
        - user.wechat_openid IS NOT NULL → True（直接绑定）
        - 否则若存在任一 User.merged_to_user_id == user.id AND wechat_openid IS NOT NULL → True（间接绑定）
        - 否则 False

        实现单条 SQL 查询所有间接绑定的目标用户ID集合，O(1) 查表填充每个 user。
        """
        if not users:
            return
        user_ids = [u.id for u in users]
        # 单条查询：所有作为 merged_to_user_id 目标、且其临时账号仍持有 wechat_openid 的用户ID
        indirect_bound_ids = {
            row[0]
            for row in db.query(User.merged_to_user_id)
            .filter(
                User.merged_to_user_id.in_(user_ids),
                User.wechat_openid.isnot(None),
            )
            .distinct()
            .all()
        }
        for user in users:
            user.wechat_bound = (user.wechat_openid is not None) or (user.id in indirect_bound_ids)

    def get_user_by_id(self, db: Session, user_id: str) -> User | None:
        """根据ID获取用户.

        单独查询该用户的 leads_count 并 setattr 到返回的 User 实例上，
        供 UserResponse.from_attributes 拾取。同时填充 wechat_bound。
        """
        user = (
            db.query(User).options(joinedload(User.role), selectinload(User.roles)).filter(User.id == user_id).first()
        )
        if user is None:
            return None
        self.attach_leads_count(db, user)
        self._attach_wechat_bound(db, [user])
        return user

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

        # 校验主角色 code != "customer"
        # 主动用 user.role_id 查询而非 user.role 关系：update_user 中先 setattr(user, "role_id", ...)
        # 再调用本方法，已加载的 user.role relationship 不会自动刷新，仍指向旧角色，
        # 会误判主角色为 customer。用 role_id 主动查询可读到最新主角色。
        main_role = db.query(Role).filter(Role.id == user.role_id).first()
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
        # 新用户无线索，显式置 0 保持响应一致性
        db_user.leads_count = 0
        # 新用户无微信绑定，显式置 False 保持响应一致性
        db_user.wechat_bound = False
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
            ValidationError: 附加角色校验失败 / 自提权防护触发

        """
        # 自提权防护：操作者不能修改自身的角色/状态/附加角色
        # admin 同样受限——纵深防御：admin 账号被盗也无法立即提权或锁死其他管理员
        if operator_id is not None and user_id == operator_id:
            update_data_preview = user_data.model_dump(exclude_unset=True)
            forbidden_fields = {"role_id", "status"} & update_data_preview.keys()
            if forbidden_fields or additional_role_ids is not None:
                msg = "不能修改自身的角色、状态或附加角色"
                raise ValidationError(msg)

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

        # 判断是否需要因角色变更撤销 Token
        # role_id 在 update_data 中 或 additional_role_ids 显式传入（含空列表）均视为变更
        needs_token_invalidation: bool = "role_id" in update_data or additional_role_ids is not None

        # 用户由启用变为禁用 或 角色变更时，调用 invalidate_user_tokens 原子地
        # 递增 token_version 并撤销所有未撤销 refresh_token，与密码修改/重置行为一致。
        # 角色变更后旧 access_token 凭 token_version 立即失效，refresh_token 也无法
        # 再换取新 access_token，避免旧凭据在新角色权限下继续访问。
        # invalidate_user_tokens 内部 commit，需先 commit 当前 user 变更再调用
        if (was_active and user.status != "active") or needs_token_invalidation:
            db.commit()
            AuthService.invalidate_user_tokens(db, user)
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
        # 补齐 leads_count 与 wechat_bound，保持与 get_user_by_id 响应一致
        self.attach_leads_count(db, user)
        self._attach_wechat_bound(db, [user])
        return user

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
    ) -> dict[str, str]:
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

    def change_password(self, db: Session, current_user: User, password_data: PasswordChange) -> dict[str, str]:
        """修改密码."""
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
        return {"message": "密码修改成功"}

    def check_phone_taken_by_other(self, db: Session, phone: str, exclude_user_id: int) -> User | None:
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
        from sqlalchemy import or_

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

    @staticmethod
    def merge_accounts(db: Session, temp_user: User, target_user: User) -> None:
        """将临时账号合并到目标主账号（事务内执行）.

        操作步骤：
        0. 行级锁 temp_user + target_user（SELECT ... FOR UPDATE）防并发合并：
           两个并发合并请求（同一 temp_user → 不同 target）会在锁上串行化，
           后到事务重新读取 temp_user.status 后发现已 'merged' → 抛
           AccountAlreadyMergedError（40903），避免「数据迁到 A、
           merged_to_user_id 指向 B」的不一致。
        1. 校验目标账号未绑定其他微信（否则抛 TargetHasWechatError, 40902）
        2. 迁移业务数据（按 user_id/creator_id/owner_id 批量 UPDATE）
        3. 临时账号 is_temporary=False，status='merged'，
           merged_to_user_id=target_user.id
        4. 失效临时账号已签发令牌（token_version+1，撤销 refresh_token 跟踪记录）
        5. 失败回滚

        ⚠️ wechat 字段保留在临时账号上，不转移至目标账号：
        authenticate_user 对 wechat_openid is not None 的用户拒绝密码登录
        （防占位哈希爆破）。若转移 openid 到目标账号，内部员工合并后将无法
        走密码登录后台。微信登录通过 login_or_register_wechat_user 中的
        merged 重定向（follow merged_to_user_id）解析到目标账号。

        ⚠️ 令牌失效：合并后临时账号 status='merged'，但 authenticate_by_token
        不校验 status，必须显式递增 token_version 才能让旧 JWT 立即失效，
        防止临时账号令牌被截获后继续访问 /public/* 接口。
        此处将 token_version 递增与 refresh_token 撤销并入合并事务，与数据迁移
        原子提交，避免「合并已提交但令牌失效失败」导致旧 JWT 残留的窗口。

        业务数据迁移覆盖的表：
        - leads（creator_id）：C 端用户提交的估价线索
        - property_current（owner_id）：C 端用户推送的房源

        ⚠️ 未覆盖 viewing_records/renovation_records/user_favorites：
        这些表在当前代码库中不存在（spec 假设的表名）。
        若未来新增此类表且含 user_id 外键，需在此方法补充迁移逻辑。

        ⚠️ 冲突处理：leads/property_current 无 (user_id, 业务列) 唯一约束，
        不会产生迁移冲突；若未来新增含唯一约束的表，需先查后跳过并日志记录冲突 ID。

        Args:
            db: 数据库会话
            temp_user: 临时账号（is_temporary=True）
            target_user: 目标主账号

        Raises:
            TargetHasWechatError: 目标账号已绑定其他微信（40902）
            AccountAlreadyMergedError: 临时账号已被并发合并（40903）

        """
        # 0. 行级锁 temp_user + target_user，串行化同一 temp_user 的并发合并请求。
        #    populate_existing() 强制从 DB 重读最新状态（默认 identity map 会复用
        #    内存中已加载的 temp_user 实例，不反映并发事务的提交）。
        db.query(User).filter(User.id == temp_user.id).with_for_update().populate_existing().first()
        db.query(User).filter(User.id == target_user.id).with_for_update().populate_existing().first()

        # 锁获取后重新检查：若并发事务已将 temp_user 合并，则当前事务必须放弃，
        # 避免覆盖 merged_to_user_id 造成「数据在 A、重定向指向 B」的不一致。
        if temp_user.status == "merged":
            logger.warning("临时账号 %s 已被并发合并，当前合并请求放弃", temp_user.id)
            raise AccountAlreadyMergedError

        # 校验目标账号未绑定其他微信
        if target_user.wechat_openid is not None and target_user.wechat_openid != temp_user.wechat_openid:
            raise TargetHasWechatError

        migrated_leads = 0
        migrated_props = 0
        try:
            # 1. 迁移 leads（creator_id）
            migrated_leads = (
                db.query(Lead)
                .filter(Lead.creator_id == temp_user.id)
                .update({Lead.creator_id: target_user.id}, synchronize_session=False)
            )
            if migrated_leads:
                logger.info("合并账号 %s → %s：迁移 %d 条 leads", temp_user.id, target_user.id, migrated_leads)

            # 2. 迁移 property_current（owner_id）
            migrated_props = (
                db.query(PropertyCurrent)
                .filter(PropertyCurrent.owner_id == temp_user.id)
                .update({PropertyCurrent.owner_id: target_user.id}, synchronize_session=False)
            )
            if migrated_props:
                logger.info(
                    "合并账号 %s → %s：迁移 %d 条 property_current",
                    temp_user.id,
                    target_user.id,
                    migrated_props,
                )

            # 3. 临时账号标记已合并（wechat 字段保留在临时账号上，供微信登录重定向）
            temp_user.is_temporary = False
            temp_user.status = "merged"
            temp_user.merged_to_user_id = target_user.id

            # 4. 失效临时账号已签发令牌（旧 JWT 不可再用）：
            #    原子递增 token_version + 撤销未过期 refresh_token，与数据迁移同一事务提交，
            #    避免「合并已提交但令牌失效失败」导致旧 JWT 残留的窗口。
            db.query(User).filter(User.id == temp_user.id).update(
                {User.token_version: User.token_version + 1}, synchronize_session=False
            )
            db.query(RefreshToken).filter(
                RefreshToken.user_id == temp_user.id,
                RefreshToken.revoked.is_(False),
            ).update({RefreshToken.revoked: True})

            db.commit()
        except Exception:
            db.rollback()
            raise

        # 令牌失效审计（仅记录，事务已提交；reason 由合并场景语义隐含）
        log_auth_event("token_invalidated", user_id=temp_user.id)
        logger.info(
            "账号合并完成：%s → %s（leads=%d, property_current=%d）",
            temp_user.id,
            target_user.id,
            migrated_leads,
            migrated_props,
        )

    def unbind_wechat(
        self,
        db: Session,
        user_id: str,
        *,
        operator_id: str | None = None,
        request: Request | None = None,
    ) -> dict[str, str]:
        """解绑用户微信账号（事务内执行）.

        支持两种绑定场景的清理：
        - 直接绑定：target_user.wechat_openid IS NOT NULL → 清空 target_user 的 wechat_* 字段
        - 间接绑定（经合并临时账号）：存在 temp_carrier.merged_to_user_id == target_user.id
          AND wechat_openid IS NOT NULL → 清空所有满足条件的 temp_carrier 的 wechat_* 字段
          （temp_carrier 的 merged_to_user_id 与 status='merged' 保持不变，仅清空 wechat 字段；
          遍历所有匹配记录以处理同一目标账号被多个临时账号间接绑定的场景）

        无论清理发生在哪条记录，都递增 target_user.token_version 并撤销其 RefreshToken，
        失效目标账号现有令牌。

        并发串行化：行级锁 target_user（SELECT ... FOR UPDATE），后到事务获取锁后
        重新检查发现 wechat 字段已清空且无 temp_carrier → 抛 WeChatNotBoundError，
        不重复执行清理。

        Args:
            db: 数据库会话
            user_id: 目标用户ID
            operator_id: 操作者用户ID（用于审计日志，可选）
            request: FastAPI Request 对象（用于审计日志提取 IP/UA，可选）

        Returns:
            {"message": "微信账号已解绑"}

        Raises:
            ResourceNotFoundError: 用户不存在
            WeChatNotBoundError: 目标账号未绑定微信（40904）

        """
        # 1. 加载 target_user（校验存在性）
        target_user = self.get_user_by_id(db, user_id)
        if target_user is None:
            msg = "用户不存在"
            raise ResourceNotFoundError(msg)

        original_ver = target_user.token_version

        # 审计快照：在解绑前记录
        before_snapshot = _user_snapshot(target_user)

        cleanup_targets: list[User] = []
        try:
            # 2. 行级锁 target_user，串行化并发解绑请求。
            #    populate_existing() 强制从 DB 重读最新状态（防 identity map 复用旧值）。
            db.query(User).filter(User.id == target_user.id).with_for_update().populate_existing().first()

            # 3. 反向查找所有间接绑定的临时账号（merged_to_user_id 指向 target_user 且仍持有 wechat_openid）
            #    使用 .all() 遍历全部匹配记录，避免同一目标账号被多个临时账号间接绑定时遗漏清理
            temp_carriers = (
                db.query(User)
                .filter(
                    User.merged_to_user_id == target_user.id,
                    User.wechat_openid.isnot(None),
                )
                .with_for_update()
                .all()
            )

            # 4. 决定清理目标
            if target_user.wechat_openid is not None:
                # 直接绑定：清空 target_user 的 wechat 字段
                target_user.wechat_openid = None
                target_user.wechat_unionid = None
                target_user.wechat_session_key = None
                cleanup_targets = [target_user]
            elif temp_carriers:
                # 间接绑定：清空所有 temp_carrier 的 wechat 字段（merged_to_user_id 与 status 不变）
                for carrier in temp_carriers:
                    carrier.wechat_openid = None
                    carrier.wechat_unionid = None
                    carrier.wechat_session_key = None
                cleanup_targets = temp_carriers
            else:
                # 锁获取后重新检查：并发事务已先完成解绑，当前事务放弃
                raise WeChatNotBoundError

            # 5. 原子递增 target_user.token_version（防并发 read-modify-write 竞态）
            db.query(User).filter(User.id == target_user.id).update(
                {User.token_version: User.token_version + 1}, synchronize_session=False
            )

            # 6. 撤销 target_user 的未撤销 RefreshToken
            db.query(RefreshToken).filter(
                RefreshToken.user_id == target_user.id,
                RefreshToken.revoked.is_(False),
            ).update({RefreshToken.revoked: True})

            # 7. 提交事务
            db.commit()
        except WeChatNotBoundError:
            db.rollback()
            raise
        except Exception:
            db.rollback()
            raise

        # 刷新 target_user 以读取最新 token_version
        db.refresh(target_user)
        # 重新填充 wechat_bound（解绑后应为 False）
        target_user.wechat_bound = False

        # 8. 审计日志
        log_auth_event("wechat_unbound", user_id=target_user.id)
        operation_log_service.log_action(
            db,
            user_id=operator_id,
            action="unbind_wechat",
            resource_type="user",
            resource_id=str(target_user.id),
            before=before_snapshot,
            after=_user_snapshot(target_user),
            request=request,
        )

        logger.info(
            "微信解绑完成：target=%s, cleanup_on=%s, token_version %d → %d",
            target_user.id,
            [c.id for c in cleanup_targets],
            original_ver,
            target_user.token_version,
        )

        return {"message": "微信账号已解绑"}

    @staticmethod
    def bind_phone_via_wechat(db: Session, user: User, wx_code: str) -> dict[str, bool]:
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
        # 延迟导入避免循环依赖（wechat.py 不依赖 user.py，但保持防御性）
        from .wechat import WeChatAuthService

        phone_info = WeChatAuthService.fetch_wechat_phone_number(wx_code)
        phone = phone_info.get("phoneNumber")
        if not phone:
            msg = "微信手机号授权未返回手机号"
            raise ValidationError(msg)

        user_service.set_initial_phone(db, user, str(phone))
        return {"success": True}


# 全局服务实例
user_service = UserService()
