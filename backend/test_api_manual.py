#!/usr/bin/env python3
"""
手动API测试脚本
"""
import requests
import json
import time


BASE_URL = "http://localhost:8000"
API_BASE = f"{BASE_URL}/api/v1"


def test_health_check():
    """测试健康检查"""
    print("🔍 测试健康检查...")
    response = requests.get(f"{BASE_URL}/health")
    print(f"状态码: {response.status_code}")
    print(f"响应: {response.json()}")
    assert response.status_code == 200
    print("✅ 健康检查通过\n")


def test_root_endpoint():
    """测试根端点"""
    print("🔍 测试根端点...")
    response = requests.get(BASE_URL)
    print(f"状态码: {response.status_code}")
    print(f"响应: {response.json()}")
    assert response.status_code == 200
    print("✅ 根端点测试通过\n")


def test_user_registration_and_login():
    """测试用户注册和登录"""
    print("🔍 测试用户注册...")
    
    # 注册用户
    user_data = {
        "username": "testuser",
        "password": "testpassword123",
        "nickname": "测试用户"
    }
    
    response = requests.post(f"{API_BASE}/auth/register", json=user_data)
    print(f"注册状态码: {response.status_code}")
    
    if response.status_code == 200:
        register_data = response.json()
        print(f"注册成功，用户ID: {register_data['user']['id']}")
        token = register_data["access_token"]
        print("✅ 用户注册成功")
        
        # 测试登录
        print("\n🔍 测试用户登录...")
        login_data = {
            "username": user_data["username"],
            "password": user_data["password"]
        }
        
        response = requests.post(f"{API_BASE}/auth/login", json=login_data)
        print(f"登录状态码: {response.status_code}")
        
        if response.status_code == 200:
            login_response = response.json()
            print(f"登录成功，用户: {login_response['user']['username']}")
            print("✅ 用户登录成功")
            return login_response["access_token"]
        else:
            print(f"❌ 登录失败: {response.text}")
            return token
    else:
        print(f"❌ 注册失败: {response.text}")
        return None


def test_protected_endpoints(token):
    """测试受保护的端点"""
    if not token:
        print("❌ 没有有效令牌，跳过受保护端点测试")
        return
    
    headers = {"Authorization": f"Bearer {token}"}
    
    print("\n🔍 测试城市管理...")
    
    # 创建城市
    city_data = {"name": "上海"}
    response = requests.post(f"{API_BASE}/cities/", json=city_data, headers=headers)
    print(f"创建城市状态码: {response.status_code}")
    
    if response.status_code == 200:
        city = response.json()
        city_id = city["id"]
        print(f"城市创建成功，ID: {city_id}")
        
        # 获取城市列表
        response = requests.get(f"{API_BASE}/cities/", headers=headers)
        print(f"获取城市列表状态码: {response.status_code}")
        if response.status_code == 200:
            cities = response.json()
            print(f"城市列表长度: {len(cities)}")
            print("✅ 城市管理测试通过")
        
        return city_id
    else:
        print(f"❌ 城市创建失败: {response.text}")
        return None


def test_property_management(token, city_id):
    """测试房源管理"""
    if not token or not city_id:
        print("❌ 缺少必要参数，跳过房源管理测试")
        return
    
    headers = {"Authorization": f"Bearer {token}"}
    
    print("\n🔍 测试房源管理...")
    
    # 先创建中介公司
    agency_data = {"name": "链家"}
    response = requests.post(f"{API_BASE}/agencies/", json=agency_data, headers=headers)
    if response.status_code != 200:
        print(f"❌ 创建中介公司失败: {response.text}")
        return
    agency_id = response.json()["id"]
    
    # 创建小区
    community_data = {
        "city_id": city_id,
        "name": "汇成一村",
        "district": "徐汇",
        "business_circle": "上海南站"
    }
    response = requests.post(f"{API_BASE}/communities/", json=community_data, headers=headers)
    if response.status_code != 200:
        print(f"❌ 创建小区失败: {response.text}")
        return
    community_id = response.json()["id"]
    
    # 创建房源
    property_data = {
        "community_id": community_id,
        "status": "在售",
        "layout_bedrooms": 2,
        "layout_living_rooms": 1,
        "layout_bathrooms": 1,
        "area_sqm": 55.0,
        "orientation": "双南",
        "floor_level": "中楼层",
        "total_floors": 6,
        "build_year": 1993,
        "listing_price_wan": 240.0
    }
    
    response = requests.post(f"{API_BASE}/properties/", json=property_data, headers=headers)
    print(f"创建房源状态码: {response.status_code}")
    
    if response.status_code == 200:
        property_obj = response.json()
        property_id = property_obj["id"]
        print(f"房源创建成功，ID: {property_id}")
        
        # 获取房源列表
        response = requests.get(f"{API_BASE}/properties/", headers=headers)
        print(f"获取房源列表状态码: {response.status_code}")
        if response.status_code == 200:
            properties = response.json()
            print(f"房源列表长度: {len(properties)}")
            print("✅ 房源管理测试通过")
        
        return property_id
    else:
        print(f"❌ 房源创建失败: {response.text}")
        return None


def main():
    """主函数"""
    print("🚀 开始手动API测试...\n")
    
    try:
        # 基础端点测试
        test_health_check()
        test_root_endpoint()
        
        # 用户认证测试
        token = test_user_registration_and_login()
        
        # 受保护端点测试
        city_id = test_protected_endpoints(token)
        
        # 房源管理测试
        property_id = test_property_management(token, city_id)
        
        print("\n🎉 所有手动测试完成！")
        
    except Exception as e:
        print(f"\n❌ 测试过程中出现错误: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
