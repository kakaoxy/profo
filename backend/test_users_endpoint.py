#!/usr/bin/env python3
"""
测试用户管理接口

功能:
- 测试获取用户列表接口
- 验证修复后的端点是否正常工作

使用方法:
    python test_users_endpoint.py
"""
import sys
from pathlib import Path

# 添加当前目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

from fastapi.testclient import TestClient
from main import app

def test_get_users():
    """
    测试获取用户列表接口
    """
    print("=" * 60)
    print("🚀 开始测试用户列表接口...")
    print("=" * 60)
    
    client = TestClient(app)
    
    # 首先登录获取令牌
    print("📋 登录管理员账户...")
    login_data = {
        "username": "admin",
        "password": "admin123"
    }
    login_response = client.post("/api/auth/login", json=login_data)
    
    if login_response.status_code != 200:
        print(f"❌ 登录失败: {login_response.status_code} {login_response.text}")
        return False
    
    token = login_response.json().get("access_token")
    print("✅ 登录成功，获取到访问令牌")
    
    # 测试获取用户列表
    print("📋 测试 /api/users/users 端点...")
    users_response = client.get("/api/users/users", headers={
        "Authorization": f"Bearer {token}"
    })
    
    print(f"📋 响应状态码: {users_response.status_code}")
    
    if users_response.status_code == 200:
        data = users_response.json()
        print("✅ 用户列表接口测试成功！")
        print(f"   总用户数: {data.get('total', 0)}")
        print(f"   返回用户数: {len(data.get('items', []))}")
        for user in data.get('items', [])[:3]:  # 只显示前3个用户
            print(f"   - {user.get('username')} ({user.get('role', {}).get('name')})")
        return True
    else:
        print(f"❌ 用户列表接口测试失败: {users_response.status_code} {users_response.text}")
        return False

if __name__ == "__main__":
    success = test_get_users()
    sys.exit(0 if success else 1)
