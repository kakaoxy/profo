"""用户微信绑定与账号合并服务.

处理微信资料完善、账号合并（临时账号 → 主账号）、微信解绑等敏感操作。
"""

import logging
import secrets

from fastapi import Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import Lead, PropertyCurrent, RefreshToken, User
from services.system.exceptions import (
    AccountAlreadyMergedError,
    ConflictError,
    ResourceNotFoundError,
    TargetHasWechatError,
    WeChatNotBoundError,
)
from services.system.operation_log import operation_log_service
from utils.security_logger import log_auth_event

from .core import _user_snapshot, user_service

logger = logging.getLogger(__name__)


class UserWechatService:
    """用户微信绑定与账号合并服务."""

    def update_wechat_profile(
        self,
        db: Session,
        current_user: User,
        nickname: str | None = None,
        avatar_url: str | None = None,
        *,
        request: Request | None = None,
    ) -> User:
        """微信小程序用户完善资料：更新 nickname 和/或 avatar，并按需派生 username.

        - nickname 提供时：派生 username（=nickname，若已被其他用户占用则追加 6 位随机 hex 后缀），更新 nickname
        - avatar_url 提供时：仅更新 avatar
        - 二者至少一个非空（由 Schema 层 model_validator 强制）
        - 保留原 wechat_openid/wechat_unionid/is_temporary 等字段不变
        - 不影响后续手机号绑定/账号合并流程
        - 不更新 last_login_at（完善资料非登录行为，避免污染登录统计）
        - username 变更（敏感标识符）写入审计日志

        Args:
            db: 数据库会话
            current_user: 当前用户对象
            nickname: 微信昵称（可选）
            avatar_url: 已上传到 /public/files/upload 的图片访问 URL（可选）
            request: FastAPI Request 对象，用于审计日志记录 IP/UA

        Returns:
            User: 更新后的用户对象

        Raises:
            ConflictError: 并发场景下 username 唯一冲突重试仍失败（409）

        """
        before_snapshot = _user_snapshot(current_user) if nickname is not None else None
        username_changed = False

        if nickname is not None:
            # username 派生：若与当前用户自身 username 相同则无需变更
            if nickname != current_user.username:
                current_user.username = self._derive_unique_username(db, nickname, current_user.id)
                username_changed = True
            current_user.nickname = nickname

        if avatar_url is not None:
            current_user.avatar = avatar_url

        # 并发场景下预查询通过但仍可能触发 UNIQUE 约束，捕获后重新生成后缀重试一次
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            if not username_changed:
                raise
            # 重新应用字段（rollback 后内存对象状态被还原）并用新后缀重试
            current_user.username = self._derive_unique_username(db, nickname, current_user.id)
            current_user.nickname = nickname
            if avatar_url is not None:
                current_user.avatar = avatar_url
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                msg = "用户名冲突，请稍后重试"
                raise ConflictError(msg) from None

        db.refresh(current_user)

        # username 变更属于敏感操作（登录标识符），写入审计日志
        # nickname/avatar 变更不记录（与 update_nickname 保持一致，避免审计噪声）
        if username_changed:
            operation_log_service.log_action(
                db,
                user_id=current_user.id,
                action="update_wechat_profile",
                resource_type="user",
                resource_id=str(current_user.id),
                before=before_snapshot,
                after=_user_snapshot(current_user),
                request=request,
            )

        return current_user

    @staticmethod
    def _derive_unique_username(db: Session, nickname: str, exclude_user_id: str) -> str:
        """根据 nickname 派生唯一 username.

        - 若 nickname 未被其他用户占用，直接使用 nickname
        - 若已被占用，追加 ``_<6位hex>`` 后缀（共 7 字符）
        - nickname 最大 100 字符，加后缀后可能超 User.username String(100) 上限；
          先截断到 93 字符再加后缀，保证总长 ≤ 100，避免 DataError 500

        Args:
            db: 数据库会话
            nickname: 微信昵称（已通过 Schema max_length=100 校验）
            exclude_user_id: 排除的当前用户 ID（允许保留自身 username）

        Returns:
            派生后的 username（≤100 字符）

        """
        # 93 + 1("_") + 6(hex) = 100，恰好不超限
        base = nickname[:93]
        existing = (
            db.query(User)
            .filter(
                User.username == base,
                User.id != exclude_user_id,
            )
            .first()
        )
        if existing:
            return f"{base}_{secrets.token_hex(3)}"
        return base

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
        target_user = user_service.get_user_by_id(db, user_id)
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


# 全局服务实例
user_wechat_service = UserWechatService()
