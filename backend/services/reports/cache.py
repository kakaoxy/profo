"""报表服务 5 分钟内存缓存装饰器.

为相同参数组合的聚合查询结果提供 TTL 内存缓存，
避免在 5 分钟内重复执行昂贵的 SQL 聚合查询.

参考 spec §5 分钟内存缓存（Requirement: 5 分钟内存缓存）.
"""

from __future__ import annotations

import functools
import threading
import time
from collections.abc import Callable
from typing import Any, TypeVar

from sqlalchemy.orm import Session

T = TypeVar("T")

# 默认 TTL：5 分钟（spec §5 分钟内存缓存要求）
_DEFAULT_TTL_SECONDS = 300

# 单个缓存字典最大条目数，超限时清除所有过期条目，仍超限则 LRU 淘汰最旧条目
_MAX_CACHE_SIZE = 256

# 全局缓存注册表：记录每个被装饰函数的缓存字典与锁，
# 供 invalidate_reports_cache() 统一清空
_cache_registry: list[tuple[dict[Any, tuple[float, Any]], threading.Lock]] = []
_registry_lock = threading.Lock()


def cached_report(ttl_seconds: int = _DEFAULT_TTL_SECONDS) -> Callable[[Callable[..., T]], Callable[..., T]]:
    """5 分钟内存缓存装饰器.

    基于 dict + 时间戳过期检查实现 TTL（functools.lru_cache 不支持 TTL，故自定义实现）.

    - key 由函数 args/kwargs 序列化：
      - ReportsFilter 等 Pydantic 模型用 ``model_dump_json()``
      - 其他参数用 ``repr()``
    - 相同参数组合在 TTL 内命中缓存
    - TTL 过期后失效并重新查询
    - 任意参数变化视为不同 key
    - 使用 ``threading.Lock`` 保证多线程并发安全（同步 SQLAlchemy Session 决策）

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
        cache: dict[Any, tuple[float, Any]] = {}
        lock = threading.Lock()

        # 注册到全局表，供 invalidate_reports_cache 清空
        with _registry_lock:
            _cache_registry.append((cache, lock))

        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> T:  # noqa: ANN401
            key = _make_cache_key(args, kwargs)
            now = time.monotonic()

            with lock:
                cached = cache.get(key)
                if cached is not None:
                    timestamp, value = cached
                    if now - timestamp < ttl_seconds:
                        return value
                    # 过期：删除后重新计算
                    del cache[key]

            # 在锁外计算避免长时间阻塞其他线程
            result = func(*args, **kwargs)

            with lock:
                # 容量保护：超限时先清除过期条目，仍超限则淘汰最旧条目
                if len(cache) >= _MAX_CACHE_SIZE:
                    _evict_expired(cache, ttl_seconds)
                    if len(cache) >= _MAX_CACHE_SIZE:
                        _evict_oldest(cache)
                cache[key] = (time.monotonic(), result)
            return result

        return wrapper

    return decorator


def invalidate_reports_cache() -> None:
    """清空所有报表缓存.

    供批量导入完成后调用（可选，本期不强制集成到 PropertyImportTask）.
    """
    with _registry_lock:
        for cache, lock in _cache_registry:
            with lock:
                cache.clear()


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


def _evict_expired(cache: dict[Any, tuple[float, Any]], ttl_seconds: int) -> None:
    """清除所有已过期的缓存条目（调用方需持有锁）."""
    now = time.monotonic()
    expired_keys = [k for k, (ts, _) in cache.items() if now - ts >= ttl_seconds]
    for k in expired_keys:
        del cache[k]


def _evict_oldest(cache: dict[Any, tuple[float, Any]]) -> None:
    """淘汰时间戳最旧的条目（LRU 近似，调用方需持有锁）."""
    if not cache:
        return
    oldest_key = min(cache, key=lambda k: cache[k][0])
    del cache[oldest_key]


__all__ = ["cached_report", "invalidate_reports_cache"]
