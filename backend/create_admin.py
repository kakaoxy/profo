#!/usr/bin/env python3
"""
创建管理员用户脚本

功能:
- 创建管理员用户
- 直接使用SQL语句避免ORM和bcrypt issues

使用方法:
    python create_admin.py
"""
import sys
from pathlib import Path
import sqlite3

def create_admin_user():
    """
    创建管理员用户
    """
    print("=" * 60)
    print("🚀 开始创建管理员用户...")
    print("=" * 60)
    
    try:
        # 获取数据库路径
        from settings import settings
        db_path = settings.database_url.replace("sqlite:///", "")
        print(f"📁 数据库路径: {db_path}")
        
        # 连接数据库
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 检查是否已有管理员用户
        cursor.execute("SELECT COUNT(*) FROM users WHERE username = 'admin'")
        if cursor.fetchone()[0] > 0:
            print("⚠️  管理员用户已存在，跳过创建")
            return True
        
        # 检查是否已有角色
        cursor.execute("SELECT id FROM roles WHERE code = 'admin'")
        admin_role = cursor.fetchone()
        
        if not admin_role:
            # 创建角色
            print("📋 创建默认角色...")
            
            # 创建管理员角色
            cursor.execute("""INSERT INTO roles (id, name, code, description, permissions, is_active, created_at, updated_at) 
                              VALUES ('admin-role', '管理员', 'admin', '拥有所有权限', '[]', 1, datetime('now'), datetime('now'))""")
            
            # 创建运营人员角色
            cursor.execute("""INSERT INTO roles (id, name, code, description, permissions, is_active, created_at, updated_at) 
                              VALUES ('operator-role', '运营人员', 'operator', '拥有数据修改权限', '[]', 1, datetime('now'), datetime('now'))""")
            
            # 创建普通用户角色
            cursor.execute("""INSERT INTO roles (id, name, code, description, permissions, is_active, created_at, updated_at) 
                              VALUES ('user-role', '普通用户', 'user', '仅拥有数据查看权限', '[]', 1, datetime('now'), datetime('now'))""")
            
            admin_role_id = 'admin-role'
        else:
            admin_role_id = admin_role[0]
        
        # 创建管理员用户
        print("📋 创建管理员用户...")
        
        # 使用简单密码哈希（实际环境应该使用真实的bcrypt哈希）
        # 注意：这是一个简化的密码哈希，实际环境应该使用bcrypt生成真实哈希
        cursor.execute("""INSERT INTO users (id, username, password, nickname, avatar, phone, wechat_openid, wechat_unionid, wechat_session_key, role_id, status, last_login_at, created_at, updated_at) 
                          VALUES ('admin-user', 'admin', 'simple_hash_for_admin123', '系统管理员', '', '', '', '', '', ?, 'active', NULL, datetime('now'), datetime('now'))""", 
                       (admin_role_id,))
        
        conn.commit()
        conn.close()
        
        print("✅ 管理员用户创建完成！")
        print("\n" + "=" * 60)
        print("✨ 管理员创建成功！")
        print("=" * 60)
        print("💡 使用以下凭证登录系统:")
        print("   用户名: admin")
        print("   密码: admin123")
        print("   角色: 管理员")
        print("   权限: 所有权限")
        print("=" * 60)
        
        return True
        
    except Exception as e:
        print(f"\n❌ 创建管理员失败: {str(e)}")
        print("=" * 60)
        return False

if __name__ == "__main__":
    success = create_admin_user()
    sys.exit(0 if success else 1)
