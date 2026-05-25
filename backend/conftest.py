"""测试配置模块."""

import os
from pathlib import Path

import pytest

import db


@pytest.fixture(scope="session", autouse=True)
def _profo_test_env() -> None:
    os.environ.setdefault("JWT_SECRET_KEY", "0123456789abcdef0123456789abcdef")
    os.environ.setdefault("WECHAT_APPID", "test")
    os.environ.setdefault("WECHAT_SECRET", "test")

    db_path = (Path(__file__).parent / "test.db").resolve()
    if db_path.exists():
        db_path.unlink()

    os.environ["DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"
    yield

    try:
        db.engine.dispose()
    except Exception:  # noqa: BLE001
        return

    if db_path.exists():
        try:
            db_path.unlink()
        except PermissionError:
            return
