"""报表服务 5 分钟缓存装饰器（Redis 后端）.

为相同参数组合的聚合查询结果提供 TTL 缓存（Redis 存储），
避免在 5 分钟内重复执行昂贵的 SQL 聚合查询，多 worker 共享缓存。

参考 spec §5 分钟内存缓存（Requirement: 5 分钟内存缓存）.
"""

from __future__ import annotations

import functools
import logging
import pickle
from collections.abc import Callable
from typing import Any, TypeVar

from redis import Redis
from redis.exceptions import RedisError
from sqlalchemy.orm import Session

from utils.redis_client import get_redis_client

logger = logging.getLogger(__name__)

T = TypeVar("T")

# 默认 TTL：5 分钟（spec §5 分钟内存缓存要求）
_DEFAULT_TTL_SECONDS = 300

# Redis key 前缀，避免与其他 Redis key 冲突
_CACHE_PREFIX = "reports:cache:"


def cached_report(ttl_seconds: int = _DEFAULT_TTL_SECONDS) -> Callable[[Callable[..., T]], Callable[..., T]]:
    """5 分钟缓存装饰器（Redis 后端）.

    基于 Redis get/set + TTL 实现缓存，多 worker 共享。

    - key 格式：``reports:cache:{module}.{qualname}:{repr(args/kwargs 序列化)}``，
      包含函数限定名以避免不同函数同签名时 key 碰撞
    - 命中：``redis.get(key)`` → pickle 反序列化（异常时删除损坏 key 并回退重算）
    - 未命中：执行函数 → ``redis.set(key, pickle.dumps(result), ex=ttl_seconds)``
    - 缓存值可能是 Pydantic 模型、list、dict 等任意 Python 对象，用 pickle 序列化

    Args:
        ttl_seconds: 缓存存活秒数，默认 300（5 分钟）

    Returns:
        Callable: 装饰器函数

    Raises:
        ValueError: ``ttl_seconds <= 0`` 时

    """
    if ttl_seconds <= 0:
        # 显式 fail loud：非法 TTL 不静默回退
        msg = f"ttl_seconds 必须为正整数，实际收到: {ttl_seconds}"
        raise ValueError(msg)

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> T:  # noqa: ANN401
            # 获取 Redis 客户端：连接失败时降级为直接计算
            # （避免在 threadpool 中 sys.exit 导致 worker 静默死亡）
            try:
                redis_client: Redis = get_redis_client()
            except RedisError:
                logger.warning("Redis 客户端初始化失败，跳过报表缓存")
                return func(*args, **kwargs)

            # 缓存键包含函数限定名，避免不同函数同签名时 key 碰撞
            # （如 get_kpi_data 与 get_price_distribution 均接受 (db, filter)）
            key = f"{_CACHE_PREFIX}{func.__module__}.{func.__qualname__}:{_make_cache_key(args, kwargs)!r}"

            # 读取缓存：Redis 故障时降级为直接计算（缓存是优化手段，不应导致业务 500）
            try:
                cached = redis_client.get(key)
                if cached is not None:
                    try:
                        return pickle.loads(cached)  # noqa: S301
                    except Exception:  # noqa: BLE001
                        # 捕获所有反序列化异常（UnpicklingError/EOFError/AttributeError/
                        # TypeError/ModuleNotFoundError 等），删除损坏 key 并回退重算
                        logger.warning("缓存反序列化失败，key=%s，将重新计算", key, exc_info=True)
                        redis_client.delete(key)
            except RedisError:
                logger.warning("报表缓存读取失败，降级为直接计算 (key=%s)", key, exc_info=True)

            result = func(*args, **kwargs)

            # 写入缓存：Redis 故障时跳过（不影响返回值）
            try:
                redis_client.set(key, pickle.dumps(result), ex=ttl_seconds)
            except RedisError:
                logger.warning("报表缓存写入失败，跳过缓存 (key=%s)", key, exc_info=True)
            return result

        return wrapper

    return decorator


def invalidate_reports_cache() -> None:
    """清空所有报表缓存.

    通过 SCAN 匹配 ``reports:cache:*`` 并批量 DELETE，跨 worker 生效。
    SCAN 循环直到游标为 0，DELETE 支持批量删除。
    Redis 不可用时静默跳过（缓存自然过期，不影响业务正确性）。
    """
    try:
        redis_client: Redis = get_redis_client()
    except RedisError:
        logger.warning("Redis 不可用，跳过报表缓存清空")
        return
    cursor = 0
    while True:
        cursor, keys = redis_client.scan(cursor=cursor, match=f"{_CACHE_PREFIX}*", count=100)
        if keys:
            redis_client.delete(*keys)
        if cursor == 0:
            break


def _make_cache_key(args: tuple, kwargs: dict) -> tuple:
    """将 args/kwargs 序列化为可哈希的 key.

    Args:
        args: 位置参数元组
        kwargs: 关键字参数字典

    Returns:
        tuple: 可哈希的缓存 key

    """
    key_parts: list[Any] = [_serialize_arg(arg) for arg in args]
    # kwargs 排序保证顺序无关
    key_parts.extend((k, _serialize_arg(kwargs[k])) for k in sorted(kwargs))
    return tuple(key_parts)


def _serialize_arg(arg: Any) -> Any:  # noqa: ANN401, PLR0911
    """将单个参数序列化为可哈希的 key 组件.

    Args:
        arg: 任意参数

    Returns:
        Any: 可哈希的 key 组件（tuple / 标量）

    """
    if isinstance(arg, Session):
        # Session 对象不参与 key 计算：所有 Session 视为等价，
        # 避免 repr 中的内存地址导致缓存永远不命中
        return ("__session__",)
    if hasattr(arg, "model_dump_json"):
        # Pydantic 模型（如 ReportsFilter）：序列化为 JSON 字符串保证字段顺序稳定
        return (type(arg).__name__, arg.model_dump_json())
    if isinstance(arg, bool | int | float | str | None.__class__):
        # 标量类型：附加类型名避免 int/float 误判（如 1 == 1.0）
        return (type(arg).__name__, arg)
    if isinstance(arg, list | tuple):
        # 序列类型：递归序列化每个元素
        return ("seq", tuple(_serialize_arg(item) for item in arg))
    if isinstance(arg, dict):
        # 字典类型：按键排序后递归序列化
        return (
            "dict",
            tuple((str(k), _serialize_arg(v)) for k, v in sorted(arg.items(), key=lambda item: str(item[0]))),
        )
    if hasattr(arg, "__tablename__") and hasattr(arg, "id"):
        # ORM 模型对象：用表名+主键作为 key 组件，避免 repr 含内存地址
        return ("orm", arg.__tablename__, arg.id)
    # 其他类型：回退到 repr()
    return (type(arg).__name__, repr(arg))


__all__ = ["cached_report", "invalidate_reports_cache"]
