"""微信 OAuth 服务（从 services/system/auth.py 拆分）.

处理微信网页授权、小程序登录、state 管理（防 CSRF）与临时令牌交换。
核心认证（用户名密码、JWT 生命周期）仍保留在 auth.py 的 AuthService 中。

设计：
- 方法保持 static/classmethod 风格，与原 AuthService 一致，无需实例化。
- state / temp_code 存储在 Redis（带 TTL，原子 GETDEL 消费），支持多 Worker 部署；
  原 DB 表（WeChatOAuthState / WeChatTempCode）保留一轮过渡期后移除。
"""

import json
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from redis.exceptions import RedisError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import Role, User
from settings import settings
from utils.auth import get_password_hash
from utils.redis_client import get_redis_client

from .exceptions import AuthenticationError, ResourceNotFoundError, ValidationError

logger = logging.getLogger(__name__)

_STATE_TTL_SECONDS = 600  # 10 分钟
_CODE_TTL_SECONDS = 60
# 小程序全局 access_token 缓存 TTL：微信默认 7200s 过期，留出余量（-300s）避免用到过期 token
_MINIAPP_TOKEN_CACHE_TTL = 6900

# Redis key 前缀，避免与其他模块的 key 冲突
_STATE_KEY_PREFIX = "wechat:state:"
_TEMPCODE_KEY_PREFIX = "wechat:tempcode:"
_MINIAPP_TOKEN_KEY = "wechat:miniapp_access_token"  # noqa: S105 - Redis key，非密码


class WeChatAuthService:
    """微信 OAuth 服务层.

    提供微信网页授权 URL 生成、access_token/userinfo 获取、小程序 session、
    用户登录/注册、state 校验（防 CSRF）与临时令牌交换。
    """

    @staticmethod
    def generate_wechat_auth_url(db: Session, redirect_uri: str | None = None) -> tuple[str, str]:  # noqa: ARG004
        """生成微信授权 URL 与随机 state.

        返回 (auth_url, state)。state 同时写入 Redis（TTL 600s），回调时必须校验。
        避免固定 state 导致的 CSRF / 登录态劫持。

        db 参数保留以维持签名兼容（其余方法仍需 DB 查询），本方法不再写 DB。
        """
        callback_url = redirect_uri or settings.wechat_redirect_uri
        state = secrets.token_urlsafe(16)
        now = datetime.now(timezone.utc)
        # session 数据：保留原 DB 行字段（state/created_at/expires_at），expires_at 仅供审计，
        # 实际过期由 Redis TTL 强制。
        session_data = {
            "state": state,
            "created_at": now.isoformat(),
            "expires_at": (now + timedelta(seconds=_STATE_TTL_SECONDS)).isoformat(),
        }
        redis_client = get_redis_client()
        redis_client.set(
            f"{_STATE_KEY_PREFIX}{state}",
            json.dumps(session_data).encode("utf-8"),
            ex=_STATE_TTL_SECONDS,
        )
        params = {
            "appid": settings.wechat_appid,
            "redirect_uri": callback_url,
            "response_type": "code",
            "scope": "snsapi_userinfo",
            "state": state,
            "connect_redirect": 1,
        }
        return settings.wechat_auth_url_base + "?" + urlencode(params) + "#wechat_redirect", state

    @staticmethod
    def consume_wechat_state(db: Session, state: str | None) -> dict[str, object] | None:  # noqa: ARG004
        """校验并消费微信 OAuth state（一次性，原子 GETDEL）.

        Returns:
            反序列化的 session 数据（state 有效且已被消费）；None 表示无效/过期/缺失/数据损坏。

        """
        if not state:
            return None
        redis_client = get_redis_client()
        data = redis_client.getdel(f"{_STATE_KEY_PREFIX}{state}")
        if data is None:
            return None
        try:
            return json.loads(data)
        except json.JSONDecodeError:
            # 数据损坏（外部篡改/写入部分失败）：视为 state 无效，避免请求崩溃
            logger.warning("wechat state 反序列化失败，数据损坏", exc_info=True)
            return None

    @staticmethod
    def store_temp_token(db: Session, access_token: str, refresh_token: str) -> str:  # noqa: ARG004
        """存储临时令牌到 Redis（TTL 60s）并返回临时授权码."""
        code = str(uuid.uuid4())
        token_data = {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        redis_client = get_redis_client()
        redis_client.set(
            f"{_TEMPCODE_KEY_PREFIX}{code}",
            json.dumps(token_data).encode("utf-8"),
            ex=_CODE_TTL_SECONDS,
        )
        return code

    @staticmethod
    def exchange_temp_code(db: Session, code: str) -> dict[str, object] | None:  # noqa: ARG004
        """用临时授权码换取令牌（原子 GETDEL）.

        Returns:
            反序列化的 token 数据；None 表示授权码无效/过期/缺失/数据损坏。
            调用方需自行处理 None（如抛 AuthenticationError 返回 401）。

        """
        redis_client = get_redis_client()
        data = redis_client.getdel(f"{_TEMPCODE_KEY_PREFIX}{code}")
        if data is None:
            return None
        try:
            return json.loads(data)
        except json.JSONDecodeError:
            # 数据损坏（外部篡改/写入部分失败）：视为授权码无效，避免请求崩溃
            logger.warning("wechat temp_code 反序列化失败，数据损坏", exc_info=True)
            return None

    @staticmethod
    async def fetch_wechat_access_token(code: str) -> dict[str, object]:
        """获取微信 Access Token (Async - IO Bound)."""
        params = {
            "appid": settings.wechat_appid,
            "secret": settings.wechat_secret,
            "code": code,
            "grant_type": "authorization_code",
        }
        async with httpx.AsyncClient(trust_env=False) as client:
            response = await client.get(settings.wechat_token_url, params=params)
            data = response.json()

        if data.get("errcode", 0) != 0:
            msg = f"微信授权失败: {data.get('errmsg')}"
            raise ValidationError(msg)
        return data

    @staticmethod
    async def fetch_wechat_user_info(access_token: str, openid: str) -> dict[str, object]:
        """获取微信用户信息 (Async - IO Bound)."""
        params = {
            "access_token": access_token,
            "openid": openid,
            "lang": "zh_CN",
        }
        async with httpx.AsyncClient(trust_env=False) as client:
            response = await client.get(settings.wechat_userinfo_url, params=params)
            data = response.json()

        if data.get("errcode", 0) != 0:
            msg = f"获取微信用户信息失败: {data.get('errmsg')}"
            raise ValidationError(msg)
        return data

    @staticmethod
    async def fetch_wechat_miniapp_session(code: str) -> dict[str, object]:
        """获取微信小程序 Session (Async - IO Bound)."""
        params = {
            "appid": settings.wechat_appid,
            "secret": settings.wechat_secret,
            "js_code": code,
            "grant_type": "authorization_code",
        }
        async with httpx.AsyncClient(trust_env=False) as client:
            try:
                response = await client.get(settings.wechat_jscode2session_url, params=params)
                response.raise_for_status()
                data = response.json()
            except httpx.HTTPError as e:
                msg = f"微信登录请求失败: {e}"
                raise AuthenticationError(msg) from e
            except (ValueError, KeyError) as e:
                msg = f"微信登录响应解析失败: {e}"
                raise AuthenticationError(msg) from e

        if "errcode" in data and data["errcode"] != 0:
            msg = f"微信登录失败: {data.get('errmsg')}"
            raise AuthenticationError(msg)
        return data

    @staticmethod
    def _resolve_merged_target(
        db: Session,
        user: User,
        *,
        session_key: str | None,
    ) -> User | None:
        """若 user 已合并（status='merged'），跟随 merged_to_user_id 返回目标主账号.

        merge_accounts 不转移 wechat_openid 到目标账号（保留在临时账号上供登录重定向），
        微信登录命中已合并的临时账号时通过本方法解析到目标账号，更新其 session_key
        与 last_login_at 后返回。目标账号缺失（数据异常）时返回 None，调用方按新用户处理。

        Args:
            db: 数据库会话
            user: 通过 openid/unionid 查到的用户（可能已合并）
            session_key: 本次微信登录的 session_key，写入目标账号

        Returns:
            目标主账号（已更新 session_key/last_login_at）；非合并用户或目标缺失返回 None

        """
        if user.status != "merged" or not user.merged_to_user_id:
            return None
        target = db.query(User).filter(User.id == user.merged_to_user_id).first()
        if target is None:
            logger.warning("合并用户 %s 的目标账号 %s 不存在", user.id, user.merged_to_user_id)
            return None
        if session_key:
            target.wechat_session_key = session_key
        target.last_login_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(target)
        return target

    @staticmethod
    def login_or_register_wechat_user(
        db: Session,
        openid: str,
        unionid: str | None,
        user_info: dict[str, object] | None = None,
        session_key: str | None = None,
    ) -> User:
        """处理微信用户登录/注册 (Sync - Blocking DB).

        微信用户统一归入 C 端 customer 角色体系，禁止分配后台角色。
        新用户创建为临时账号（is_temporary=True），绑定主账号后合并。
        若 openid 未命中但 unionid 命中已有用户，复用该用户（更新其 openid 与 session_key）。

        已合并的临时账号（status='merged'）通过 merged_to_user_id 重定向到目标主账号：
        merge_accounts 不转移 wechat_openid 到目标账号（避免目标账号被 authenticate_user
        的占位密码检查拦截而无法走密码登录），微信登录命中已合并临时账号时跟随
        merged_to_user_id 返回目标账号。
        """
        user = db.query(User).filter(User.wechat_openid == openid).first()

        # 已合并的临时账号（openid 命中）→ 重定向到目标主账号
        if user:
            target = WeChatAuthService._resolve_merged_target(db, user, session_key=session_key)
            if target:
                return target

        # unionid 兜底查询：openid 未命中但 unionid 存在且命中已有用户，复用该用户
        if not user and unionid:
            user = db.query(User).filter(User.wechat_unionid == unionid).first()
            if user:
                # 已合并的临时账号（unionid 命中）→ 更新 openid 供后续查询，然后重定向
                if user.status == "merged" and user.merged_to_user_id:
                    user.wechat_openid = openid
                    target = WeChatAuthService._resolve_merged_target(db, user, session_key=session_key)
                    if target:
                        return target
                    # 目标账号缺失（数据异常）→ 不创建新用户（openid 已被合并账号占用，
                    # 创建会触发唯一约束冲突），fall through 到下方「更新现有用户」分支，
                    # 更新 session_key/last_login_at 后返回已合并账号（降级处理，不崩溃）
                else:
                    # 复用已有用户，更新 openid 与 session_key（unionid 已一致无需更新）
                    user.wechat_openid = openid
                    if session_key:
                        user.wechat_session_key = session_key
                    if user_info:
                        user.nickname = user_info.get("nickname", user.nickname)
                        user.avatar = user_info.get("headimgurl", user.avatar)
                    user.last_login_at = datetime.now(timezone.utc)
                    db.commit()
                    db.refresh(user)
                    return user

        if not user:
            # 注册新用户 - 统一分配 customer 角色（C 端用户），标记为临时账号
            role = db.query(Role).filter(Role.code == "customer").first()
            if not role:
                msg = "系统未初始化 customer 角色"
                raise ResourceNotFoundError(msg)

            nickname = user_info.get("nickname", "微信用户") if user_info else "微信用户"
            avatar = user_info.get("headimgurl") if user_info else None

            user = User(
                username=f"temp_wx_{openid[:8]}_{secrets.token_hex(3)}",
                password=get_password_hash(openid),
                nickname=nickname,
                avatar=avatar,
                wechat_openid=openid,
                wechat_unionid=unionid,
                wechat_session_key=session_key,
                role_id=role.id,
                status="active",
                is_temporary=True,
            )
            db.add(user)
            try:
                db.commit()
            except IntegrityError:
                # 并发首次登录：同一 openid/unionid 的唯一约束冲突（如双击微信登录按钮、
                # 或 Web OAuth 与小程序对同一新用户同时登录）。回滚后按 openid 重新查询，
                # 若并发请求已创建该用户则直接复用，避免未处理异常导致登录接口 500。
                db.rollback()
                existing = db.query(User).filter(User.wechat_openid == openid).first()
                if existing is not None:
                    return existing
                msg = "微信登录冲突，请重试"
                raise ValidationError(msg) from None
            db.refresh(user)
        else:
            # 更新现有信息
            if user_info:
                user.nickname = user_info.get("nickname", user.nickname)
                user.avatar = user_info.get("headimgurl", user.avatar)
            if unionid:
                user.wechat_unionid = unionid
            if session_key:
                user.wechat_session_key = session_key

            user.last_login_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(user)

        return user

    @staticmethod
    def fetch_wechat_miniapp_access_token() -> str:
        """获取小程序全局 access_token (Sync - 供 run_in_threadpool 调用).

        调用 cgi-bin/token 接口获取小程序服务端 access_token，
        用于调用 getPhoneNumber 等服务端接口。

        微信对该接口有调用频率限制，故用 Redis 缓存并复用（TTL 略短于 expires_in）；
        Redis 不可用时降级为直接调用微信接口，保证功能不受影响。

        Returns:
            access_token 字符串

        Raises:
            ValidationError: 微信接口返回错误

        """
        # 命中缓存直接返回，避免每次绑定手机号都请求微信 token 接口
        try:
            redis_client = get_redis_client()
            cached = redis_client.get(_MINIAPP_TOKEN_KEY)
            if cached:
                return cached.decode("utf-8")
        except RedisError:
            # Redis 不可达：降级直接获取，不影响微信绑定功能
            logger.warning("读取微信 access_token 缓存失败，降级直接获取", exc_info=True)
            redis_client = None

        params = {
            "grant_type": "client_credential",
            "appid": settings.wechat_appid,
            "secret": settings.wechat_secret,
        }
        with httpx.Client(trust_env=False) as client:
            response = client.get(settings.wechat_miniapp_token_url, params=params)
            response.raise_for_status()
            data = response.json()

        if "access_token" not in data:
            # errmsg 含上游 API 细节（如 appid 错误、IP 白名单缺失），不能直接回传给用户；
            # 仅服务端日志记录，对用户返回通用错误消息
            logger.error("获取小程序 access_token 失败：errmsg=%s, errcode=%s", data.get("errmsg"), data.get("errcode"))
            msg = "微信服务暂不可用，请稍后重试"
            raise ValidationError(msg)

        token = str(data["access_token"])
        # 写入缓存（Redis 不可用时忽略，不影响功能）
        if redis_client is not None:
            try:
                redis_client.set(_MINIAPP_TOKEN_KEY, token.encode("utf-8"), ex=_MINIAPP_TOKEN_CACHE_TTL)
            except RedisError:
                logger.warning("写入微信 access_token 缓存失败，忽略", exc_info=True)
        return token

    @staticmethod
    def fetch_wechat_phone_number(code: str) -> dict[str, object]:
        """用 wx.getPhoneNumber 的 code 换取手机号 (Sync - 供 run_in_threadpool 调用).

        调用 wxa/business/getuserphonenumber 接口，需先获取小程序全局 access_token。

        Args:
            code: wx.getPhoneNumber 回调的 code（动态令牌）

        Returns:
            微信响应中 phone_info 字典，含 phoneNumber/purePhoneNumber/countryCode 等字段

        Raises:
            ValidationError: 微信接口返回错误

        """
        access_token = WeChatAuthService.fetch_wechat_miniapp_access_token()
        params = {"access_token": access_token}
        payload = {"code": code}
        with httpx.Client(trust_env=False) as client:
            response = client.post(settings.wechat_phone_url, params=params, json=payload)
            response.raise_for_status()
            data = response.json()

        if data.get("errcode", 0) != 0:
            # errmsg 含上游 API 细节（如 code 已使用、appsecret 错误），不能直接回传给用户；
            # 仅服务端日志记录，对用户返回通用错误消息
            logger.error("获取微信手机号失败：errmsg=%s, errcode=%s", data.get("errmsg"), data.get("errcode"))
            msg = "微信手机号授权失败，请重新获取"
            raise ValidationError(msg)
        return dict(data.get("phone_info", {}))

    @staticmethod
    def fetch_miniapp_unlimited_qrcode(scene: str, page: str | None = None) -> bytes:
        """生成小程序码（getwxacodeunlimit）.

        调用 wxa/getwxacodeunlimit 接口，需先获取小程序全局 access_token。
        scene 参数长度 ≤ 32 字符，page 为小程序页面路径（可选，默认跳转招募详情页）。

        Args:
            scene: 场景值（≤32 字符，含短码 code）
            page: 小程序页面路径（可选，不传时默认跳转招募详情页）

        Returns:
            图片 bytes（直接返回微信接口的二进制响应体）

        Raises:
            ValidationError: 微信接口返回错误

        """
        access_token = WeChatAuthService.fetch_wechat_miniapp_access_token()
        params = {"access_token": access_token}
        payload: dict[str, object] = {
            "scene": scene,
            "check_path": False,
        }
        if page:
            payload["page"] = page
        with httpx.Client(trust_env=False) as client:
            try:
                response = client.post(settings.wechat_miniapp_qrcode_url, params=params, json=payload)
                response.raise_for_status()
                content_type = response.headers.get("content-type", "")
                if "image" in content_type:
                    # 成功返回图片二进制
                    return response.content
                data = response.json()
            except (httpx.HTTPError, ValueError) as e:
                # 网络/HTTP 状态错误（httpx.HTTPError）与非 JSON 响应体（json.JSONDecodeError 属 ValueError）
                # 统一转为业务校验错误，避免以通用 500 冒泡
                logger.exception("生成小程序码请求异常")
                msg = "小程序码生成失败，请检查微信配置"
                raise ValidationError(msg) from e
            logger.error("生成小程序码失败：errmsg=%s, errcode=%s", data.get("errmsg"), data.get("errcode"))
            msg = "小程序码生成失败，请检查微信配置"
            raise ValidationError(msg)

    @staticmethod
    def send_subscribe_message(openid: str, template_id: str, data: dict, page: str | None = None) -> None:
        """发送小程序订阅消息 (Sync - 供 run_in_threadpool 调用).

        调用 cgi-bin/message/subscribe/send 接口，需先获取小程序全局 access_token。
        miniprogram_state 默认 formal（正式版），跳转页面通过 page 指定（可选）。

        Args:
            openid: 接收者（员工）的 openid
            template_id: 订阅消息模板 ID
            data: 模板内容，格式为 ``{"字段名": {"value": "xxx"}}``
            page: 点击消息跳转的小程序页面路径（含 query，可选）

        Raises:
            ValidationError: 微信接口返回错误（细节仅记日志，不回传用户）；
                43101（用户未订阅/拒收）与 40003（openid 无效）属预期业务态，
                仅 warning 留痕后正常返回，不抛出

        """
        access_token = WeChatAuthService.fetch_wechat_miniapp_access_token()
        params = {"access_token": access_token}
        payload: dict[str, object] = {
            "touser": openid,
            "template_id": template_id,
            "data": data,
            "miniprogram_state": "formal",
        }
        if page:
            payload["page"] = page
        with httpx.Client(trust_env=False) as client:
            try:
                response = client.post(settings.wechat_subscribe_send_url, params=params, json=payload)
                response.raise_for_status()
                result: dict[str, object] = response.json()
            except (httpx.HTTPError, ValueError) as e:
                # 网络/HTTP 状态错误与非 JSON 响应体统一转为业务校验错误，
                # 避免以通用 500 冒泡（与 fetch_miniapp_unlimited_qrcode 一致）
                logger.exception("发送订阅消息请求异常")
                msg = "订阅消息发送失败"
                raise ValidationError(msg) from e
        if result.get("errcode", 0) != 0:
            # errmsg 含上游 API 细节（如用户未订阅、模板非法），不能直接回传给用户；
            # 仅服务端日志记录，对用户返回通用错误消息
            errcode = result.get("errcode")
            errmsg = result.get("errmsg")
            if errcode in (43101, 40003):
                # 43101=用户未订阅/拒收（一次性订阅额度未授权或已用尽），
                # 40003=openid 无效（如员工已解绑）：均属预期业务态，重试亦无意义，
                # warning 留痕后正常返回，避免调用方按异常处理产生 ERROR 噪音
                logger.warning("订阅消息未送达（预期业务态）：errcode=%s, errmsg=%s", errcode, errmsg)
                return
            logger.error("发送订阅消息失败：errcode=%s, errmsg=%s", errcode, errmsg)
            msg = "订阅消息发送失败"
            raise ValidationError(msg)
