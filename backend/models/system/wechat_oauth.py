"""微信 OAuth 临时状态模型.

存储微信网页授权的 state（防 CSRF）与临时授权码（换取令牌）。
这些记录短暂存活（state 600s，temp_code 60s），由服务层在写入时顺带清理过期记录。
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import Base


# @deprecated 已迁移至 Redis，保留表结构一轮过渡期
class WeChatOAuthState(Base):
    """微信 OAuth state 记录（防 CSRF）.

    每次发起微信授权时生成随机 state 并存储，回调时一次性消费校验。
    TTL 600 秒（10 分钟），过期由服务层清理。
    """

    __tablename__ = "wechat_oauth_states"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    state: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


# @deprecated 已迁移至 Redis，保留表结构一轮过渡期
class WeChatTempCode(Base):
    """微信登录临时授权码.

    微信回调成功后，将 access_token / refresh_token 存入临时码，
    前端用临时码换取令牌对。TTL 60 秒，过期由服务层清理。
    """

    __tablename__ = "wechat_temp_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
