"""
最终测试脚本
"""
import requests
import json
from datetime import datetime

# API基础URL
BASE_URL = "http://localhost:8000"

def main():
    """主测试函数"""
    print("=== 最终功能测试 ===")

    # 1. 获取项目统计（应该为空）
    print("\n1. 获取项目统计...")
    response = requests.get(f"{BASE_URL}/api/v1/projects/stats")
    if response.status_code == 200:
        stats = response.json()["data"]
        print(f"项目统计: {stats}")
    else:
        print(f"获取项目统计失败: {response.text}")

    # 2. 创建项目
    print("\n2. 创建项目...")
    project_data = {
        "name": "测试项目",
        "community_name": "测试小区",
        "address": "测试地址123号",
        "owner_name": "张三",
        "owner_phone": "13800138000",
        "notes": "测试项目"
    }

    response = requests.post(f"{BASE_URL}/api/v1/projects", json=project_data)
    if response.status_code == 200:
        project = response.json()["data"]
        project_id = project["id"]
        print(f"项目创建成功，ID: {project_id}, 状态: {project['status']}")
    else:
        print(f"创建项目失败: {response.text}")
        return

    # 3. 测试现金流功能
    print("\n3. 测试现金流功能...")

    # 添加支出记录
    expense_data = {
        "type": "expense",
        "category": "装修费",
        "amount": 100000,
        "date": datetime.now().isoformat(),
        "description": "装修费用"
    }

    response = requests.post(f"{BASE_URL}/api/v1/projects/{project_id}/cashflow", json=expense_data)
    if response.status_code == 200:
        print("支出记录创建成功")
    else:
        print(f"支出记录创建失败: {response.text}")

    # 添加收入记录
    income_data = {
        "type": "income",
        "category": "售房款",
        "amount": 1500000,
        "date": datetime.now().isoformat(),
        "description": "售房收入"
    }

    response = requests.post(f"{BASE_URL}/api/v1/projects/{project_id}/cashflow", json=income_data)
    if response.status_code == 200:
        print("收入记录创建成功")
    else:
        print(f"收入记录创建失败: {response.text}")

    # 获取现金流汇总
    response = requests.get(f"{BASE_URL}/api/v1/projects/{project_id}/cashflow")
    if response.status_code == 200:
        cashflow_data = response.json()["data"]
        summary = cashflow_data["summary"]
        print(f"现金流汇总:")
        print(f"  总收入: {summary['total_income']}")
        print(f"  总支出: {summary['total_expense']}")
        print(f"  净现金流: {summary['net_cash_flow']}")
        print(f"  投资回报率: {summary['roi']:.2%}")
    else:
        print(f"获取现金流汇总失败: {response.text}")

    # 4. 测试状态流转
    print("\n4. 测试状态流转...")

    # 签约 -> 改造
    status_update = {"status": "renovating"}
    response = requests.put(f"{BASE_URL}/api/v1/projects/{project_id}/status", json=status_update)
    if response.status_code == 200:
        print("状态流转到改造阶段成功")
    else:
        print(f"状态流转失败: {response.text}")

    # 改造 -> 在售
    status_update = {"status": "selling"}
    response = requests.put(f"{BASE_URL}/api/v1/projects/{project_id}/status", json=status_update)
    if response.status_code == 200:
        print("状态流转到在售阶段成功")
    else:
        print(f"状态流转失败: {response.text}")

    # 在售 -> 已售
    complete_data = {
        "sold_price": 1500000,
        "sold_date": datetime.now().isoformat()
    }
    response = requests.post(f"{BASE_URL}/api/v1/projects/{project_id}/complete", json=complete_data)
    if response.status_code == 200:
        print("项目完成成功")
    else:
        print(f"项目完成失败: {response.text}")

    # 5. 验证最终状态
    print("\n5. 验证最终状态...")
    response = requests.get(f"{BASE_URL}/api/v1/projects/{project_id}")
    if response.status_code == 200:
        project = response.json()["data"]
        print(f"项目最终状态: {project['status']}")
        print(f"售出价格: {project['sale_price']}")
    else:
        print(f"获取项目详情失败: {response.text}")

    # 6. 获取项目统计
    print("\n6. 获取项目统计...")
    response = requests.get(f"{BASE_URL}/api/v1/projects/stats")
    if response.status_code == 200:
        stats = response.json()["data"]
        print(f"项目统计: {stats}")
    else:
        print(f"获取项目统计失败: {response.text}")

    print("\n=== 最终功能测试完成 ===")

if __name__ == "__main__":
    main()