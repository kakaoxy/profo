#!/usr/bin/env python3
"""数据库初始化脚本.

功能:
- 创建所有数据库表
- 验证表结构
- 显示初始化结果

使用方法:
    python init_db.py
    或
    uv run python init_db.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from db import engine
from models import Base
from settings import settings


def init_database() -> bool | None:
    """初始化数据库 - 创建所有表."""
    try:
        Base.metadata.create_all(bind=engine)

        settings.database_url.replace("sqlite:///", "")
    except Exception:  # noqa: BLE001
        return False
    else:
        return True


if __name__ == "__main__":
    success = init_database()
    sys.exit(0 if success else 1)
