"""
简单的API测试脚本
"""
import requests
import json
from datetime import datetime

# API基础URL
BASE_URL = "http://localhost:8000"

def test_create_project():
    """测试创建项目"""
    project_data = {
        "name": "测试项目",
        "community_name": "测试小区",
        "address": "测试地址123号",
        "owner_name": "张三",
        "owner_phone": "13800138000",
        "notes": "这是一个测试项目"
    }

    try:
        response = requests.post(f"{BASE_URL}/api/v1/projects", json=project_data)
        print(f"创建项目响应状态码: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"项目创建成功，项目ID: {data['data']['id']}")
            return data['data']['id']
        else:
            print(f"创建项目失败: {response.text}")
            return None
    except Exception as e:
        print(f"连接失败: {e}")
        return None

def test_get_project_stats():
    """测试获取项目统计"""
    try:
        response = requests.get(f"{BASE_URL}/api/v1/projects/stats")
        print(f"获取统计响应状态码: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"项目统计: {data['data']}")
        else:
            print(f"获取统计失败: {response.text}")
    except Exception as e:
        print(f"连接失败: {e}")

def test_create_cashflow_record(project_id):
    """测试创建现金流记录"""
    if not project_id:
        return

    cashflow_data = {
        "type": "expense",
        "category": "装修费",
        "amount": 50000,
        "date": datetime.now().isoformat(),
        "description": "装修费用",
        "related_stage": "改造阶段"
    }

    try:
        response = requests.post(f"{BASE_URL}/api/v1/projects/{project_id}/cashflow", json=cashflow_data)
        print(f"创建现金流记录响应状态码: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"现金流记录创建成功")
        else:
            print(f"创建现金流记录失败: {response.text}")
    except Exception as e:
        print(f"连接失败: {e}")

def main():
    """主测试函数"""
    print("=== 开始API测试 ===")

    # 测试获取项目统计
    print("\n1. 测试获取项目统计...")
    test_get_project_stats()

    # 测试创建项目
    print("\n2. 测试创建项目...")
    project_id = test_create_project()

    # 测试现金流记录
    if project_id:
        print(f"\n3. 测试创建现金流记录 (项目ID: {project_id})...")
        test_create_cashflow_record(project_id)

    print("\n=== API测试完成 ===")

if __name__ == "__main__":
    main()