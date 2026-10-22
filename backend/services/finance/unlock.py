"""资金账户模块入口锁（服务层）.

为什么密码必须在后端验（设计稿 §08-06 / SPEC §4.5）：
只在浏览器挡一层等于没挡——拿到登录态直接调 `/admin/accounts` 就绕过去了。
所以解锁令牌由后端签发、后端校验，前端只负责倒计时与观感。

实现要点：
- 密码哈希复用 ``utils/auth/password.py``（Argon2），存 ``system_configs``：
  key = ``fund_accounts.password_hash``，``updated_by_id`` 记录最后修改人。
- 解锁令牌不落库，只存 Redis：
  - ``fund_accounts:unlock:<user_id>:<sha256(token)>`` value ``1``，``EX 1800``；
  - 每次受保护请求通过校验后 ``EXPIRE`` 重置 = 30 分钟滑动过期。
- 失败计数与锁定（SPEC D2 已定：**5 次 / 锁 15 分钟**）：
  - ``fund_accounts:fail:<user_id>`` 自增，TTL 与锁定时长一致；
  - 达上限写 ``fund_accounts:lock:<user_id>``，TTL = 900 秒；
  - 锁定期内**正确的密码也拒绝**（E2E V5 断言）。
- Redis 不可用：解锁链路抛 ``ServiceUnavailableError`` → 503，不降级放行（Fail Loud）。
"""

import hashlib
import logging
import secrets

from redis import Redis
from redis.exceptions import RedisError
from sqlalchemy.orm import Session

from models import SystemConfig
from schemas.finance import (
    FundAccountLockStateResponse,
    FundAccountPasswordSetRequest,
    FundAccountUnlockRequest,
    FundAccountUnlockResponse,
)
from services.system.exceptions import ServiceException, ValidationError
from utils.auth.password import get_password_hash, verify_password
from utils.redis_client import get_redis_client

logger = logging.getLogger(__name__)

PASSWORD_CONFIG_KEY = "fund_accounts.password_hash"  # noqa: S105

# 解锁令牌有效期（秒）：30 分钟滑动过期
# 注：上一行 noqa 是必要的——S105 会把名为 *_KEY 且值为字符串的常量误判为硬编码密码，
# 这里存的是 system_configs 的配置键名，不是密码本身（密码哈希值在数据库中）。
UNLOCK_TTL_SECONDS = 30 * 60
# 允许的最大失败次数（达到即锁定）
MAX_ATTEMPTS = 5
# 达到上限后的锁定时长（秒）：15 分钟
LOCK_SECONDS = 15 * 60

_KEY_PREFIX = "fund_accounts"
_MIN_LEN = 6


class AccountUnlockUnavailableError(ServiceException):
    """解锁服务不可用（Redis 故障）——HTTP 503."""

    def __init__(self) -> None:
        """初始化异常消息."""
        super().__init__("解锁服务暂不可用，请稍后重试", status_code=503)


class AccountLockedError(ServiceException):
    """密码错误次数过多，模块处于锁定状态——HTTP 429.

    剩余锁定秒数通过标准 ``Retry-After`` 响应头下发（``error_handlers`` 白名单透传），
    body 的 ``code`` 沿用框架口径（= HTTP 状态码），避免引入平行响应结构。
    """

    def __init__(self, retry_after_seconds: int) -> None:
        """初始化异常消息.

        Args:
            retry_after_seconds: 锁定剩余秒数

        """
        self.retry_after_seconds = retry_after_seconds
        super().__init__(
            "密码输错次数过多，请 15 分钟后再试",
            status_code=429,
            headers={"Retry-After": str(retry_after_seconds)},
        )


class AccountPasswordError(ServiceException):
    """模块密码不正确（未达失败上限）——HTTP 400.

    ⚠️ 为什么**不能**用 401（2026-10-22 缺陷修复）：
    ``frontend/src/lib/api-server.ts::fetchWithAutoRefresh`` 把任何 401 都当成
    「access_token 过期」，会自动刷新令牌并**重放同一个请求**。模块密码错误若返回
    401，用户输错 1 次 → 服务端收到 2 次 POST /unlock → 失败计数 +2，
    「剩余尝试」显示与实际不符，5 次上限在 3 次输入后就被触发（E2E 已复现）。
    改用 400（业务参数错误）语义准确，且不会触发令牌刷新重放。
    """

    def __init__(self, attempts_left: int) -> None:
        """初始化异常消息.

        Args:
            attempts_left: 剩余尝试次数

        """
        self.attempts_left = attempts_left
        super().__init__(f"密码不正确，还可尝试 {attempts_left} 次", status_code=400)


def _redis() -> Redis:
    """获取 Redis 客户端；不可用时抛 503（不降级放行）."""
    try:
        return get_redis_client()
    except RedisError as exc:
        logger.exception("资金账户解锁：Redis 不可用")
        raise AccountUnlockUnavailableError from exc


def _unlock_key(user_id: str, token: str) -> str:
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    return f"{_KEY_PREFIX}:unlock:{user_id}:{digest}"


def _fail_key(user_id: str) -> str:
    return f"{_KEY_PREFIX}:fail:{user_id}"


def _lock_key(user_id: str) -> str:
    return f"{_KEY_PREFIX}:lock:{user_id}"


def _validate_digits(password: str, *, field: str) -> None:
    """校验密码格式：恰好 6 位纯数字，且不是 6 位相同数字."""
    if len(password) != _MIN_LEN or not password.isdigit():
        msg = f"{field}需为 6 位数字"
        raise ValidationError(msg)
    if len(set(password)) == 1:
        msg = f"{field}不要使用 6 位相同数字"
        raise ValidationError(msg)


class AccountUnlockService:
    """资金账户模块入口锁服务."""

    def __init__(self, db: Session) -> None:
        """初始化服务.

        Args:
            db: SQLAlchemy 会话

        """
        self.db = db

    # ==================== 密码存取 ====================

    def _get_password_hash(self) -> str | None:
        """读取模块密码哈希（未设置返回 None）."""
        row = self.db.query(SystemConfig.value).filter(SystemConfig.key == PASSWORD_CONFIG_KEY).scalar()
        return row or None

    def has_password(self) -> bool:
        """是否已设置模块密码."""
        return bool(self._get_password_hash())

    def set_password(self, data: FundAccountPasswordSetRequest, operator_id: str) -> None:
        """设置或重设模块密码（幂等 upsert）.

        Raises:
            ValidationError: 密码格式不合规、重设时原密码错误或新密码与旧密码相同

        """
        _validate_digits(data.new_password, field="新密码")

        existing = self._get_password_hash()
        if existing:
            if not data.old_password:
                msg = "请输入原密码"
                raise ValidationError(msg)
            # verify_password 返回 (是否匹配, 升级后哈希)：必须取 [0]，否则非空元组恒为真
            old_ok, _ = verify_password(data.old_password, existing)
            if not old_ok:
                msg = "原密码不正确"
                raise ValidationError(msg)
            same_as_old, _ = verify_password(data.new_password, existing)
            if same_as_old:
                msg = "新密码不能与当前密码相同"
                raise ValidationError(msg)

        new_hash = get_password_hash(data.new_password)
        row = self.db.query(SystemConfig).filter(SystemConfig.key == PASSWORD_CONFIG_KEY).first()
        if row is None:
            self.db.add(
                SystemConfig(key=PASSWORD_CONFIG_KEY, value=new_hash, updated_by_id=operator_id),
            )
        else:
            row.value = new_hash
            row.updated_by_id = operator_id
        self.db.commit()

        # ⚠️ 改密后必须吊销全部已签发令牌（2026-10-22 高危缺陷修复）：
        # 令牌校验只查 Redis 里「这个 hash 是否存在」，与密码哈希无关；此前改密
        # **不清令牌**，于是改密前解锁的会话（含另一台设备、另一个标签页）在剩余
        # 30 分钟内仍可继续读取全部余额——「改密码」在最需要它的场景（密码泄露）
        # 完全无效。实测：改密后用旧令牌请求 GET /admin/accounts 仍返回 200。
        #
        # 为什么必须按前缀扫描而不是只删当前用户的：令牌键含 user_id
        # （fund_accounts:unlock:<user_id>:<hash>），而「改密」是全局动作（密码是
        # 全模块共用的一份），任何用户持有的令牌都必须失效。
        revoked = self._revoke_all_tokens()
        logger.info("资金账户模块密码已更新（operator=%s，已吊销 %d 个解锁令牌）", operator_id, revoked)

    def _revoke_all_tokens(self) -> int:
        """吊销全部解锁令牌（改密后调用；返回删除数量）.

        用 ``SCAN`` 而非 ``KEYS``：生产 Redis 上 ``KEYS`` 会阻塞事件循环。
        """
        redis = _redis()
        pattern = f"{_KEY_PREFIX}:unlock:*"
        deleted = 0
        try:
            for key in redis.scan_iter(match=pattern, count=100):
                deleted += int(redis.delete(key))
        except RedisError as exc:
            # 改密本身已成功落库，令牌吊销失败不能回滚密码；但必须 Loud：
            # 记 error 并向上抛 503，让调用方知道「密码已改但旧令牌可能仍有效」。
            logger.exception("资金账户解锁：吊销令牌失败（密码已更新）")
            raise AccountUnlockUnavailableError from exc
        return deleted

    # ==================== 状态与解锁 ====================

    def _lock_remaining(self, user_id: str) -> int:
        """返回锁定剩余秒数（未锁定返回 0）."""
        redis = _redis()
        try:
            ttl = redis.ttl(_lock_key(user_id))
        except RedisError as exc:
            logger.exception("资金账户解锁：读取锁定状态失败")
            raise AccountUnlockUnavailableError from exc
        return max(int(ttl), 0)

    def _attempts_left(self, user_id: str) -> int:
        """返回剩余尝试次数."""
        redis = _redis()
        try:
            raw = redis.get(_fail_key(user_id))
        except RedisError as exc:
            logger.exception("资金账户解锁：读取失败次数失败")
            raise AccountUnlockUnavailableError from exc
        used = int(raw) if raw else 0
        return max(MAX_ATTEMPTS - used, 0)

    def get_lock_state(self, user_id: str, token: str | None) -> FundAccountLockStateResponse:
        """读取模块锁状态（未解锁也可调用，供锁屏渲染）."""
        has_password = self.has_password()
        lock_remaining = self._lock_remaining(user_id)
        if not has_password:
            return FundAccountLockStateResponse(
                has_password=False,
                unlocked=False,
                seconds_left=0,
                attempts_left=MAX_ATTEMPTS,
                retry_after_seconds=None,
            )

        unlocked, seconds_left = self.check_token(user_id, token)
        return FundAccountLockStateResponse(
            has_password=True,
            unlocked=unlocked,
            seconds_left=seconds_left,
            attempts_left=MAX_ATTEMPTS if lock_remaining else self._attempts_left(user_id),
            retry_after_seconds=lock_remaining or None,
        )

    def check_token(self, user_id: str, token: str | None) -> tuple[bool, int]:
        """校验令牌并滑动续期.

        Returns:
            (是否有效, 续期后的剩余秒数)

        """
        if not token:
            return False, 0
        redis = _redis()
        key = _unlock_key(user_id, token)
        try:
            exists = redis.exists(key)
            if not exists:
                return False, 0
            # 滑动过期：每次受保护请求都重置 30 分钟
            redis.expire(key, UNLOCK_TTL_SECONDS)
            ttl = redis.ttl(key)
        except RedisError as exc:
            logger.exception("资金账户解锁：校验令牌失败")
            raise AccountUnlockUnavailableError from exc
        return True, max(int(ttl), 0)

    def revoke_token(self, user_id: str, token: str | None) -> None:
        """手动锁定：删除当前令牌（幂等，令牌不存在也不报错）."""
        if not token:
            return
        redis = _redis()
        try:
            redis.delete(_unlock_key(user_id, token))
        except RedisError as exc:
            logger.exception("资金账户解锁：删除令牌失败")
            raise AccountUnlockUnavailableError from exc

    def unlock(self, data: FundAccountUnlockRequest, user_id: str) -> FundAccountUnlockResponse:
        """校验模块密码并签发解锁令牌.

        Raises:
            ValidationError: 尚未设置模块密码
            AccountLockedError: 处于锁定期（正确密码也拒绝）
            AccountPasswordError: 密码错误且未达上限

        """
        stored = self._get_password_hash()
        if not stored:
            msg = "尚未设置模块密码，请先设置"
            raise ValidationError(msg)

        lock_remaining = self._lock_remaining(user_id)
        if lock_remaining:
            raise AccountLockedError(lock_remaining)

        matched, _ = verify_password(data.password, stored)
        if not matched:
            redis = _redis()
            try:
                # A-3：INCR 与 EXPIRE 包进 MULTI/EXEC 事务（pipeline(transaction=True)），
                # 避免两命令之间进程被杀导致 fail 键无 TTL 永久驻留。
                with redis.pipeline(transaction=True) as pipe:
                    pipe.incr(_fail_key(user_id))
                    pipe.expire(_fail_key(user_id), LOCK_SECONDS)
                    results = pipe.execute()
                used = int(results[0])
                if used >= MAX_ATTEMPTS:
                    redis.set(_lock_key(user_id), 1, ex=LOCK_SECONDS)
                    redis.delete(_fail_key(user_id))
            except RedisError as exc:
                logger.exception("资金账户解锁：记录失败次数失败")
                raise AccountUnlockUnavailableError from exc
            if int(used) >= MAX_ATTEMPTS:
                logger.warning("资金账户模块密码连续输错 %d 次，锁定 %d 秒（user=%s）", used, LOCK_SECONDS, user_id)
                raise AccountLockedError(LOCK_SECONDS)
            raise AccountPasswordError(MAX_ATTEMPTS - int(used))

        token = secrets.token_urlsafe(32)
        redis = _redis()
        try:
            redis.set(_unlock_key(user_id, token), 1, ex=UNLOCK_TTL_SECONDS)
            # 密码正确即清空失败计数，让「偶尔输错」不影响下次
            redis.delete(_fail_key(user_id))
        except RedisError as exc:
            logger.exception("资金账户解锁：签发令牌失败")
            raise AccountUnlockUnavailableError from exc

        logger.info("资金账户模块已解锁（user=%s）", user_id)
        return FundAccountUnlockResponse(
            unlocked=True,
            token=token,
            seconds_left=UNLOCK_TTL_SECONDS,
            attempts_left=MAX_ATTEMPTS,
            retry_after_seconds=None,
        )
