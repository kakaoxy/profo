#!/usr/bin/env python3
"""
修复管理员用户密码哈希

功能:
- 删除现有管理员用户
- 重新创建管理员用户，使用有效的bcrypt哈希

使用方法:
    python fix_admin.py
"""
import sys
from pathlib import Path

# 添加当前目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

from db import SessionLocal
from models.user import User, Role
from utils.auth import get_password_hash

def fix_admin_user():
    """
    修复管理员用户密码哈希
    """
    print("=" * 60)
    print("🚀 开始修复管理员用户密码哈希...")
    print("=" * 60)
    
    # 获取数据库会话
    db = SessionLocal()
    
    try:
        # 查找管理员角色
        admin_role = db.query(Role).filter(Role.code == "admin").first()
        if not admin_role:
            print("❌ 未找到管理员角色")
            return False
        
        # 删除现有管理员用户
        existing_admin = db.query(User).filter(User.username == "admin").first()
        if existing_admin:
            print("📋 删除现有管理员用户...")
            db.delete(existing_admin)
            db.commit()
            print("✅ 现有管理员用户已删除")
        
        # 创建新的管理员用户，使用有效的bcrypt哈希
        print("📋 创建新的管理员用户...")
        
        # 生成有效的bcrypt哈希
        valid_password_hash = get_password_hash("admin123")
        print(f"   生成的哈希: {valid_password_hash}")
        
        # 创建新用户
        new_admin = User(
            username="admin",
            password=valid_password_hash,
            nickname="系统管理员",
            role_id=admin_role.id,
            status="active"
        )
        
        db.add(new_admin)
        db.commit()
        
        print("✅ 新的管理员用户已创建")
        print(f"   用户名: admin")
        print(f"   密码: admin123")
        print(f"   角色: 管理员")
        print(f"   权限: 所有权限")
        
        print("\n" + "=" * 60)
        print("✨ 管理员用户修复完成！")
        print("=" * 60)
        print("💡 使用以下凭证登录系统:")
        print("   用户名: admin")
        print("   密码: admin123")
        print("   角色: 管理员")
        print("=" * 60)
        
        return True
        
    except Exception as e:
        print(f"\n❌ 修复失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()

if __name__ == "__main__":
    success = fix_admin_user()
    sys.exit(0 if success else 1)
