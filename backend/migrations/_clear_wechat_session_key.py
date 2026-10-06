"""微信 session_key 停止收集迁移.

背景：小程序手机号绑定已切换为 phonenumber.getPhoneNumber 新式动态令牌（code）
方案，不再需要 session_key 解密；全后端亦无其他 session_key 读取方。按个人信息
最小必要原则停止收集：登录链路停写（见 services/system/wechat.py），本脚本
一次性清空存量 wechat_session_key，使存储状态与隐私政策声明一致。

列本身保留一版过渡（models/user/user.py 注释已标注），后续版本再删除列。

幂等性：UPDATE ... WHERE col IS NOT NULL 天然幂等，重复执行为 no-op；
_column_exists 守卫兼容 users 表尚未建列的极端环境。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations._helpers import _column_exists

logger = logging.getLogger(__name__)


def clear_wechat_session_key(engine: Engine) -> None:
    """清空 users.wechat_session_key 存量数据（幂等）."""
    if not _column_exists(engine, "users", "wechat_session_key"):
        return
    with engine.begin() as conn:
        result = conn.execute(text("UPDATE users SET wechat_session_key = NULL WHERE wechat_session_key IS NOT NULL"))
        if result.rowcount:
            logger.info("迁移：清空 users.wechat_session_key 存量数据 %d 行", result.rowcount)
