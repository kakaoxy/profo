#!/usr/bin/env python3
"""初始化管理员用户和角色脚本.

功能:
- 创建默认角色（管理员、运营人员、普通用户）
- 创建默认管理员用户

使用方法:
    python init_admin.py
"""

import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from db import SessionLocal, init_db
from services.system.init_service import init_service


def init_admin_user() -> bool | None:
    """初始化管理员用户和角色."""
    init_db()

    db = None
    try:
        db = SessionLocal()
        result = init_service.initialize(db)

        if result.get("error"):
            if result.get("details"):
                pass
            return False

        message = result.get("message", "")

        if "已初始化" in message:
            pass
        else:
            result.get("temp_admin", {})

        if "temp_admin" in result:
            pass
    except Exception:  # noqa: BLE001
        traceback.print_exc()
        return False
    else:
        return True
    finally:
        if db is not None:
            db.close()


if __name__ == "__main__":
    success = init_admin_user()
    sys.exit(0 if success else 1)
