#!/usr/bin/env python3
"""
初始化管理员用户和角色脚本

功能:
- 创建默认角色（管理员、运营人员、普通用户）
- 创建默认管理员用户

使用方法:
    python init_admin.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from db import SessionLocal, init_db
from services.system.init_service import init_service


def init_admin_user():
    """
    初始化管理员用户和角色
    """
    print("=" * 60)
    print("  开始初始化管理员用户和角色...")
    print("=" * 60)

    init_db()

    db = None
    try:
        db = SessionLocal()
        result = init_service.initialize(db)

        if result.get("error"):
            print(f"\n  初始化失败: {result['error']}")
            if result.get("details"):
                print(f"   详情: {result['details']}")
            print("=" * 60)
            return False

        message = result.get("message", "")

        if "已初始化" in message:
            print("  角色和用户已存在，跳过创建")
        else:
            print("  默认角色创建完成")
            print("  默认管理员用户创建完成")

            temp_admin = result.get("temp_admin", {})
            print(f"   用户名: {temp_admin.get('username', 'admin')}")
            print(f"   密码: {temp_admin.get('temp_password', '')}")
            print("   角色: 管理员")
            print("   权限: 所有权限")

        print()
        print("=" * 60)
        print("  管理员初始化完成！")
        print("=" * 60)
        print("  使用以下凭证登录系统:")
        print(f"   用户名: {temp_admin.get('username', 'admin')}" if 'temp_admin' in result else "   用户名: admin")
        if 'temp_admin' in result:
            print(f"   密码: {result['temp_admin']['temp_password']}")
        print("   角色: 管理员")
        print("=" * 60)
        print("   ⚠️  安全提醒：请立即登录系统修改此临时密码！")
        print("   ⚠️  此密码仅在本次终端会话中可见，不会再次显示。")
        print("   ⚠️  如密码遗失，请重新运行本脚本重置。")
        print("=" * 60)

        return True

    except Exception as e:
        print(f"\n  初始化失败: {str(e)}")
        import traceback
        traceback.print_exc()
        print("=" * 60)
        return False
    finally:
        if db is not None:
            db.close()


if __name__ == "__main__":
    success = init_admin_user()
    sys.exit(0 if success else 1)