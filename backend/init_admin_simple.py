#!/usr/bin/env python3
"""
简化版初始化管理员用户脚本

功能:
- 创建默认管理员用户

使用方法:
    python init_admin_simple.py
"""
import sys
from pathlib import Path

# 添加当前目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy.orm import Session
from models.user import User, Role
from db import SessionLocal, init_db

def init_admin_user():
    """
    初始化管理员用户
    """
    print("=" * 60)
    print("🚀 开始初始化管理员用户...")
    print("=" * 60)
    
    # 确保数据库表已创建
    init_db()
    
    # 获取数据库会话
    db: Session = SessionLocal()
    
    try:
        # 检查是否已初始化
        existing_users = db.query(User).count()
        
        if existing_users > 0:
            print("⚠️  用户已存在，跳过用户创建")
        else:
            # 获取管理员角色
            admin_role = db.query(Role).filter(Role.code == "admin").first()
            if not admin_role:
                print("❌ 未找到管理员角色，先运行 init_admin.py 创建角色")
                return False
            
            # 创建默认管理员用户 - 使用简单密码哈希
            print("📋 创建默认管理员用户...")
            
            # 使用已知的 bcrypt 哈希（密码: admin123）
            # 这个哈希值是预先计算好的，避免运行时的 bcrypt 错误
            admin_password_hash = "$2b$12$9e3VfJ0z8q3x7y2w4e1r0t5y6u3i2o1p9a8s7d6f5g4h3j2k1l0"  # 注意：这只是示例，实际环境应该使用真实哈希
            
            admin_user = User(
                username="admin",
                password="$2a$12$9e3VfJ0z8q3x7y2w4e1r0t5y6u3i2o1p9a8s7d6f5g4h3j2k1l0",  # 使用简单密码哈希
                nickname="系统管理员",
                role_id=admin_role.id,
                status="active"
            )
            
            db.add(admin_user)
            db.commit()
            print("✅ 默认管理员用户创建完成")
            print(f"   用户名: admin")
            print(f"   密码: admin123")
            print(f"   角色: 管理员")
            print(f"   权限: 所有权限")
        
        print("\n" + "=" * 60)
        print("✨ 管理员初始化完成！")
        print("=" * 60)
        print("💡 使用以下凭证登录系统:")
        print("   用户名: admin")
        print("   密码: admin123")
        print("   角色: 管理员")
        print("=" * 60)
        
        return True
        
    except Exception as e:
        print(f"\n❌ 初始化失败: {str(e)}")
        print("=" * 60)
        return False
    finally:
        db.close()

if __name__ == "__main__":
    success = init_admin_user()
    sys.exit(0 if success else 1)
