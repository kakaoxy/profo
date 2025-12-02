#!/usr/bin/env python3
"""
测试登录功能

功能:
- 测试管理员用户登录
- 验证JWT令牌生成

使用方法:
    python test_login.py
"""
import sys
from pathlib import Path

# 添加当前目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

from fastapi.testclient import TestClient
from main import app

def test_admin_login():
    """
    测试管理员用户登录
    """
    print("=" * 60)
    print("🚀 开始测试管理员登录...")
    print("=" * 60)
    
    client = TestClient(app)
    
    # 测试登录请求
    login_data = {
        "username": "admin",
        "password": "admin123"
    }
    
    print(f"📋 发送登录请求: {login_data}")
    response = client.post("/api/auth/login", json=login_data)
    
    print(f"📋 登录响应状态码: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print("✅ 登录成功！")
        print(f"   访问令牌: {data.get('access_token', 'N/A')[:20]}...")
        print(f"   刷新令牌: {data.get('refresh_token', 'N/A')[:20]}...")
        print(f"   令牌类型: {data.get('token_type', 'N/A')}")
        print(f"   过期时间: {data.get('expires_in', 'N/A')}秒")
        print(f"   用户信息: {data.get('user', {}).get('username', 'N/A')} ({data.get('user', {}).get('role', {}).get('code', 'N/A')})")
        return True
    else:
        print(f"❌ 登录失败！")
        print(f"   错误信息: {response.text}")
        return False

if __name__ == "__main__":
    success = test_admin_login()
    sys.exit(0 if success else 1)
