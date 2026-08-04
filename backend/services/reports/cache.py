"""报表服务 5 分钟缓存装饰器（Redis 后端）.

为相同参数组合的聚合查询结果提供 TTL 缓存（Redis 存储），
避免在 5 分钟内重复执行昂贵的 SQL 聚合查询，多 worker 共享缓存。

参考 spec §5 分钟内存缓存（Requirement: 5 分钟内存缓存）.
"""

from __future__ import annotations

import functools
import hashlib
import json
import logging
from collections.abc import Callable
from typing import Any, TypeVar

from pydantic import BaseModel
from redis import Redis
from redis.exceptions import RedisError
from sqlalchemy.orm import Session

from schemas.reports.common import KpiCard
from schemas.reports.communities import CommunityRow
from schemas.reports.market import (
    BusinessDistrictRow,
    ComparisonData,
    ComparisonFloorStructure,
    ComparisonRoomStructure,
    ComparisonSummaryRow,
    ComparisonTrendPoint,
    DistributionBucket,
    KpiData,
    PriceBucket,
    TrendDataPoint,
)
from utils.redis_client import get_redis_client

logger = logging.getLogger(__name__)

T = TypeVar("T")

# 默认 TTL：5 分钟（spec §5 分钟内存缓存要求）
_DEFAULT_TTL_SECONDS = 300

# Redis key 前缀，避免与其他 Redis key 冲突
_CACHE_PREFIX = "reports:cache:"

# Pydantic 模型注册表: 类名 -> 类, 用于 JSON 反序列化时恢复类型.
# 缓存值可能包含嵌套的 Pydantic 模型 (如 KpiData / list[TrendDataPoint] /
# dict 含 list[PriceBucket] 等), 用类名标记保证反序列化后类型保真.
_PYDANTIC_REGISTRY: dict[str, type[BaseModel]] = {
    cls.__name__: cls
    for cls in (
        KpiCard,
        KpiData,
        TrendDataPoint,
        PriceBucket,
        DistributionBucket,
        BusinessDistrictRow,
        CommunityRow,
        ComparisonData,
        ComparisonSummaryRow,
        ComparisonTrendPoint,
        ComparisonFloorStructure,
        ComparisonRoomStructure,
    )
}

# Pydantic 模型在 JSON 中的类型标记键 (与普通 dict 区分, 避免误判)
# 使用 dunder 前缀降低与业务字段碰撞概率
_PYDANTIC_MARKER = "__pydantic__"

# 标记 payload 的键数量 (仅 __pydantic__ + data), 用于精确识别模型 dict
_PYDANTIC_PAYLOAD_LEN = 2


class _PydanticEncoder(json.JSONEncoder):
    """JSON 编码器: 将 Pydantic BaseModel 实例包装为带类型标记的 dict.

    输出形如 ``{"__pydantic__": "KpiData", "data": {...}}``,
    反序列化时通过 ``_PYDANTIC_REGISTRY`` 恢复为对应模型实例.
    """

    def default(self, o: Any) -> Any:
        if isinstance(o, BaseModel):
            return {
                _PYDANTIC_MARKER: o.__class__.__name__,
                "data": o.model_dump(mode="json"),
            }
        return super().default(o)


def _pydantic_object_hook(obj: dict[str, Any]) -> Any:
    """JSON object_hook: 检测带 ``__pydantic__`` 标记的 dict 并恢复为对应模型实例.

    仅当 dict 恰好包含 ``__pydantic__`` 与 ``data`` 两个键时触发,
    避免与业务字段冲突. object_hook 自底向上调用, 内层模型先被重建,
    外层 model_validate 接收的 dict 中已包含模型实例, Pydantic v2 原生支持.
    """
    if len(obj) == _PYDANTIC_PAYLOAD_LEN and _PYDANTIC_MARKER in obj and "data" in obj:
        cls = _PYDANTIC_REGISTRY.get(obj[_PYDANTIC_MARKER])
        if cls is not None:
            return cls.model_validate(obj["data"])
    return obj


def _dumps(value: Any) -> bytes:
    """将缓存值序列化为 JSON bytes.

    Pydantic 模型实例会被包装为 ``{"__pydantic__": "ClassName", "data": {...}}``
    以保留类型信息, 反序列化时通过 ``_PYDANTIC_REGISTRY`` 恢复.
    """
    return json.dumps(value, cls=_PydanticEncoder, ensure_ascii=False).encode("utf-8")


def _loads(data: bytes) -> Any:
    """从 JSON bytes 反序列化缓存值, 恢复嵌套的 Pydantic 模型实例."""
    return json.loads(data, object_hook=_pydantic_object_hook)


def cached_report(ttl_seconds: int = _DEFAULT_TTL_SECONDS) -> Callable[[Callable[..., T]], Callable[..., T]]:
    """5 分钟缓存装饰器（Redis 后端）.

    基于 Redis get/set + TTL 实现缓存，多 worker 共享。

    - key 格式：``reports:cache:{module}.{qualname}:{sha256(args/kwargs)[:32]}``，
      包含函数限定名以避免不同函数同签名时 key 碰撞；
      args 部分取 SHA256 前 32 位（128bit）固定长度，避免 filter 含大量
      community_ids 时 key 长达数 KB 浪费 Redis 内存
    - 命中：``redis.get(key)`` → JSON 反序列化（异常时删除损坏 key 并回退重算）
    - 未命中：执行函数 → ``redis.set(key, _dumps(result), ex=ttl_seconds)``
    - 缓存值可能是 Pydantic 模型、list、dict 等任意 Python 对象，
      通过自定义 JSON 编解码器保留 Pydantic 类型保真

    安全性：使用 JSON 替代 pickle，避免 Redis 被注入恶意 pickle 字节导致的 RCE 风险。

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
        def wrapper(*args: Any, **kwargs: Any) -> T:
            # 获取 Redis 客户端：连接失败时降级为直接计算
            # （避免在 threadpool 中 sys.exit 导致 worker 静默死亡）
            try:
                redis_client: Redis = get_redis_client()
            except RedisError:
                logger.warning("Redis 客户端初始化失败，跳过报表缓存")
                return func(*args, **kwargs)

            # 缓存键包含函数限定名，避免不同函数同签名时 key 碰撞
            # （如 get_kpi_data 与 get_price_distribution 均接受 (db, filter)）
            # args 部分做 SHA256 hash 固定长度，避免 filter 含大量 community_ids 时
            # key 过长浪费 Redis 内存（32MB 限制）
            raw_key = repr(_make_cache_key(args, kwargs))
            key_hash = hashlib.sha256(raw_key.encode()).hexdigest()[:32]
            key = f"{_CACHE_PREFIX}{func.__module__}.{func.__qualname__}:{key_hash}"

            # 读取缓存：Redis 故障时降级为直接计算（缓存是优化手段，不应导致业务 500）
            try:
                cached = redis_client.get(key)
                if cached is not None:
                    try:
                        return _loads(cached)
                    except Exception:
                        # 捕获所有反序列化异常（JSONDecodeError/ValidationError/
                        # KeyError 等），删除损坏 key 并回退重算.
                        # 同时兼容历史 pickle 缓存: 切换到 JSON 后首次读取
                        # pickle 字节会触发异常, 自动失效并重算.
                        logger.warning("缓存反序列化失败，key=%s，将重新计算", key, exc_info=True)
                        redis_client.delete(key)
            except RedisError:
                logger.warning("报表缓存读取失败，降级为直接计算 (key=%s)", key, exc_info=True)

            result = func(*args, **kwargs)

            # 写入缓存：Redis 故障时跳过（不影响返回值）
            try:
                redis_client.set(key, _dumps(result), ex=ttl_seconds)
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
    try:
        cursor = 0
        while True:
            cursor, keys = redis_client.scan(cursor=cursor, match=f"{_CACHE_PREFIX}*", count=100)
            if keys:
                redis_client.delete(*keys)
            if cursor == 0:
                break
    except RedisError:
        # SCAN 中途 Redis 断开：已删除的 key 生效，剩余 key 将在 TTL 后自然过期。
        # 缓存清空是优化手段，不应导致业务数据变更操作返回 500。
        logger.warning("报表缓存清空中途 Redis 断开，剩余 key 将在 TTL 后自然过期", exc_info=True)


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


def _serialize_arg(arg: Any) -> Any:
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
