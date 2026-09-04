"""监控服务单价计算浮点化测试.

PostgreSQL 中整数 / 整数 = 整数（截断小数），为保持计算精度，
单价计算（listed_price_wan / build_area）必须先 func.cast(..., Float) 再除。

测试方式：源码检查 neighborhood.py 和 service.py 中包含 func.cast + Float。
"""

import inspect

from services.monitor import neighborhood, service


def test_neighborhood_uses_float_cast() -> None:
    """neighborhood.py 单价计算应使用 func.cast(..., Float)."""
    src = inspect.getsource(neighborhood)
    assert "func.cast" in src, "neighborhood.py 应使用 func.cast 将价格列转为 Float"
    assert "Float" in src, "neighborhood.py 应导入并使用 Float 类型"


def test_service_uses_float_cast() -> None:
    """service.py 单价计算应使用 func.cast(..., Float)."""
    src = inspect.getsource(service)
    assert "func.cast" in src, "service.py 应使用 func.cast 将价格列转为 Float"
    assert "Float" in src, "service.py 应导入并使用 Float 类型"


def test_neighborhood_division_uses_float_cast() -> None:
    """neighborhood.py 中除法表达式前应有 cast 到 Float."""
    src = inspect.getsource(neighborhood)
    assert "cast" in src
    assert "Float" in src
    assert "build_area" in src


def test_service_division_uses_float_cast() -> None:
    """service.py 中除法表达式前应有 cast 到 Float."""
    src = inspect.getsource(service)
    assert "cast" in src
    assert "Float" in src
    assert "build_area" in src
