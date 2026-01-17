"""
共享依赖和配置
用于避免循环导入
"""
from slowapi import Limiter
from slowapi.util import get_remote_address


# ==================== 速率限制器 ====================
limiter = Limiter(key_func=get_remote_address, default_limits=["200/day", "50/hour"])
