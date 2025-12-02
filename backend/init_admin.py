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
import datetime

# 添加当前目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy.orm import Session
from models.user import User, Role
from db import SessionLocal, init_db
from utils.auth import get_password_hash

def init_admin_user():
    """
    初始化管理员用户和角色
    """
    print("=" * 60)
    print("🚀 开始初始化管理员用户和角色...")
    print("=" * 60)
    
    # 确保数据库表已创建
    init_db()
    
    # 获取数据库会话
    db: Session = SessionLocal()
    
    try:
        # 检查是否已初始化
        existing_roles = db.query(Role).count()
        existing_users = db.query(User).count()
        
        if existing_roles > 0:
            print("⚠️  角色已存在，跳过角色创建")
        else:
            # 创建默认角色
            print("📋 创建默认角色...")
            
            # 使用直接SQL插入避免ORM issues
            from db import engine
            from sqlalchemy import text
            
            with engine.begin() as conn:
                # 创建管理员角色
                conn.execute(text("""
                    INSERT INTO roles (id, name, code, description, permissions, is_active, created_at, updated_at)
                    VALUES (:id, :name, :code, :description, :permissions, :is_active, :created_at, :updated_at)
                """), {
                    "id": "admin-role",
                    "name": "管理员",
                    "code": "admin",
                    "description": "拥有所有权限，包括用户管理、权限配置",
                    "permissions": '["view_data", "edit_data", "manage_users", "manage_roles"]',
                    "is_active": True,
                    "created_at": datetime.datetime.now(),
                    "updated_at": datetime.datetime.now()
                })
                print("   ✅ 创建角色: 管理员 (admin)")
                
                # 创建运营人员角色
                conn.execute(text("""
                    INSERT INTO roles (id, name, code, description, permissions, is_active, created_at, updated_at)
                    VALUES (:id, :name, :code, :description, :permissions, :is_active, :created_at, :updated_at)
                """), {
                    "id": "operator-role",
                    "name": "运营人员",
                    "code": "operator",
                    "description": "拥有数据修改权限，包括项目、房源的增删改查",
                    "permissions": '["view_data", "edit_data"]',
                    "is_active": True,
                    "created_at": datetime.datetime.now(),
                    "updated_at": datetime.datetime.now()
                })
                print("   ✅ 创建角色: 运营人员 (operator)")
                
                # 创建普通用户角色
                conn.execute(text("""
                    INSERT INTO roles (id, name, code, description, permissions, is_active, created_at, updated_at)
                    VALUES (:id, :name, :code, :description, :permissions, :is_active, :created_at, :updated_at)
                """), {
                    "id": "user-role",
                    "name": "普通用户",
                    "code": "user",
                    "description": "仅拥有数据查看权限",
                    "permissions": '["view_data"]',
                    "is_active": True,
                    "created_at": datetime.datetime.now(),
                    "updated_at": datetime.datetime.now()
                })
                print("   ✅ 创建角色: 普通用户 (user)")
            
            print("✅ 默认角色创建完成")
        
        if existing_users > 0:
            print("⚠️  用户已存在，跳过用户创建")
        else:
            # 获取管理员角色
            admin_role = db.query(Role).filter(Role.code == "admin").first()
            if not admin_role:
                print("❌ 未找到管理员角色")
                return False
            
            # 创建默认管理员用户
            print("📋 创建默认管理员用户...")
            
            # 使用直接SQL插入避免ORM issues
            from db import engine
            from sqlalchemy import text
            
            with engine.begin() as conn:
                # 使用正确的bcrypt哈希生成方式
                # 先生成有效的bcrypt哈希
                from utils.auth import get_password_hash
                valid_password_hash = get_password_hash("admin123")
                
                conn.execute(text("""
                    INSERT INTO users (id, username, password, nickname, role_id, status, created_at, updated_at)
                    VALUES (:id, :username, :password, :nickname, :role_id, :status, :created_at, :updated_at)
                """), {
                    "id": "admin-user",
                    "username": "admin",
                    "password": valid_password_hash,  # 使用有效的bcrypt哈希
                    "nickname": "系统管理员",
                    "role_id": admin_role.id,
                    "status": "active",
                    "created_at": datetime.datetime.now(),
                    "updated_at": datetime.datetime.now()
                })
            
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
        import traceback
        traceback.print_exc()
        print("=" * 60)
        return False
    finally:
        db.close()

if __name__ == "__main__":
    success = init_admin_user()
    sys.exit(0 if success else 1)
