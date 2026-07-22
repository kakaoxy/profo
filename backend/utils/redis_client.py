"""Redis 客户端单例.

提供同步 Redis 连接，用于 slowapi 限流与报表缓存。
启动期 ping 失败时抛出 RedisError，由调用方（lifespan）决定是否 sys.exit(1)；
cached_report 装饰器捕获后降级为直接计算。
多 worker 下每个 worker 进程独立持有客户端实例。
"""

import logging
from urllib.parse import urlparse, urlunparse

from redis import Redis
from redis.exceptions import RedisError

from settings import settings

logger = logging.getLogger(__name__)

_redis_client: Redis | None = None


def _redact_redis_url(url: str) -> str:
    """脱敏 Redis URL 中的凭据（redis://user:pass@host -> redis://***@host）.

    无 userinfo 时原样返回（host:port 保留以便排障）。
    """
    parsed = urlparse(url)
    if parsed.password is not None or parsed.username:
        host = parsed.hostname or ""
        port = f":{parsed.port}" if parsed.port else ""
        parsed = parsed._replace(netloc=f"***@{host}{port}")
    return urlunparse(parsed)


def get_redis_client() -> Redis:
    """获取 Redis 客户端单例.

    首次调用时创建连接并 ping 验证，失败则抛出 RedisError。
    调用方（如 lifespan 启动检查）负责捕获并决定是否 sys.exit(1)；
    cached_report 装饰器捕获后降级为直接计算，避免在 threadpool 中
    调用 sys.exit(1) 导致 worker 线程静默死亡、主线程永久阻塞。
    多 worker 下每个 worker 进程独立持有客户端实例。
    """
    global _redis_client  # noqa: PLW0603
    if _redis_client is not None:
        return _redis_client

    _redis_client = Redis.from_url(
        settings.redis_url,
        decode_responses=False,
        socket_connect_timeout=5,
        socket_timeout=5,
    )
    try:
        _redis_client.ping()
    except RedisError as e:
        # 重置为 None，使后续调用可重试
        _redis_client = None
        logger.error("Redis 连接失败 (url=%s): %s", _redact_redis_url(settings.redis_url), e)  # noqa: TRY400
        raise
    logger.info("Redis 连接成功 (url=%s)", _redact_redis_url(settings.redis_url))
    return _redis_client
