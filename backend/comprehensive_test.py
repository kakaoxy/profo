"""
综合API测试脚本
"""
import requests
import json
from datetime import datetime

# API基础URL
BASE_URL = "http://localhost:8000"

def test_complete_workflow():
    """测试完整的项目工作流程"""
    print("=== 开始完整工作流程测试 ===")

    # 1. 创建项目
    print("\n1. 创建项目...")
    project_data = {
        "name": "阳光花园改造项目",
        "community_name": "阳光花园",
        "address": "北京市朝阳区阳光街123号",
        "owner_name": "李四",
        "owner_phone": "13900139000",
        "notes": "高品质装修项目"
    }

    response = requests.post(f"{BASE_URL}/api/v1/projects", json=project_data)
    if response.status_code != 200:
        print(f"创建项目失败: {response.text}")
        return

    project_id = response.json()["data"]["id"]
    print(f"项目创建成功，项目ID: {project_id}")

    # 2. 获取项目详情
    print(f"\n2. 获取项目详情 (ID: {project_id})...")
    response = requests.get(f"{BASE_URL}/api/v1/projects/{project_id}")
    if response.status_code == 200:
        project = response.json()["data"]
        print(f"项目名称: {project['name']}, 状态: {project['status']}")
    else:
        print(f"获取项目详情失败: {response.text}")

    # 3. 更新项目信息（签约阶段）
    print(f"\n3. 更新项目信息...")
    update_data = {"notes": "更新备注：这是一个高品质装修项目"}
    response = requests.put(f"{BASE_URL}/api/v1/projects/{project_id}", json=update_data)
    if response.status_code == 200:
        print("项目信息更新成功")
    else:
        print(f"更新项目信息失败: {response.text}")

    # 4. 添加现金流记录
    print(f"\n4. 添加现金流记录...")
    cashflow_records = [
        {
            "type": "expense",
            "category": "履约保证金",
            "amount": 50000,
            "date": datetime.now().isoformat(),
            "description": "履约保证金"
        },
        {
            "type": "expense",
            "category": "装修费",
            "amount": 150000,
            "date": datetime.now().isoformat(),
            "description": "装修费用"
        }
    ]

    for record in cashflow_records:
        response = requests.post(f"{BASE_URL}/api/v1/projects/{project_id}/cashflow", json=record)
        if response.status_code == 200:
            print(f"现金流记录创建成功: {record['category']} {record['amount']}")
        else:
            print(f"现金流记录创建失败: {response.text}")

    # 5. 获取现金流汇总
    print(f"\n5. 获取现金流汇总...")
    response = requests.get(f"{BASE_URL}/api/v1/projects/{project_id}/cashflow")
    if response.status_code == 200:
        cashflow_data = response.json()["data"]
        summary = cashflow_data["summary"]
        print(f"现金流汇总:")
        print(f"  总支出: {summary['total_expense']}")
        print(f"  净现金流: {summary['net_cash_flow']}")
    else:
        print(f"获取现金流汇总失败: {response.text}")

    # 6. 更新项目状态到改造阶段
    print(f"\n6. 更新项目状态到改造阶段...")
    status_update = {"status": "renovating"}
    response = requests.put(f"{BASE_URL}/api/v1/projects/{project_id}/status", json=status_update)
    if response.status_code == 200:
        print("项目状态更新成功")
    else:
        print(f"项目状态更新失败: {response.text}")

    # 7. 更新改造阶段
    print(f"\n7. 更新改造阶段...")
    renovation_data = {
        "renovation_stage": "水电",
        "stage_completed_at": datetime.now().isoformat()
    }
    response = requests.put(f"{BASE_URL}/api/v1/projects/{project_id}/renovation", json=renovation_data)
    if response.status_code == 200:
        print("改造阶段更新成功")
    else:
        print(f"改造阶段更新失败: {response.text}")

    # 8. 上传改造照片
    print(f"\n8. 上传改造照片...")
    photo_data = {
        "stage": "水电",
        "url": "https://example.com/water_electric.jpg",
        "filename": "water_electric.jpg",
        "description": "水电改造完成照片"
    }
    response = requests.post(f"{BASE_URL}/api/v1/projects/{project_id}/renovation/photos", params=photo_data)
    if response.status_code == 200:
        print("改造照片上传成功")
    else:
        print(f"改造照片上传失败: {response.text}")

    # 9. 更新项目状态到在售阶段
    print(f"\n9. 更新项目状态到在售阶段...")
    status_update = {"status": "selling"}
    response = requests.put(f"{BASE_URL}/api/v1/projects/{project_id}/status", json=status_update)
    if response.status_code == 200:
        print("项目状态更新到在售成功")
    else:
        print(f"项目状态更新失败: {response.text}")

    # 10. 更新销售角色
    print(f"\n10. 更新销售角色...")
    roles_data = {
        "property_agent": "王五(房源维护人)",
        "client_agent": "赵六(客源维护人)",
        "first_viewer": "孙七(首看人)"
    }
    response = requests.put(f"{BASE_URL}/api/v1/projects/{project_id}/selling/roles", json=roles_data)
    if response.status_code == 200:
        print("销售角色更新成功")
    else:
        print(f"销售角色更新失败: {response.text}")

    # 11. 创建销售记录
    print(f"\n11. 创建销售记录...")
    sales_records = [
        {
            "record_type": "viewing",
            "customer_name": "客户张三",
            "customer_phone": "13800138001",
            "record_date": datetime.now().isoformat(),
            "notes": "客户对户型很满意"
        },
        {
            "record_type": "offer",
            "customer_name": "客户张三",
            "customer_phone": "13800138001",
            "record_date": datetime.now().isoformat(),
            "price": 1200000,
            "notes": "客户出价120万"
        }
    ]

    for record in sales_records:
        if record["record_type"] == "viewing":
            response = requests.post(f"{BASE_URL}/api/v1/projects/{project_id}/selling/viewings", json=record)
        elif record["record_type"] == "offer":
            response = requests.post(f"{BASE_URL}/api/v1/projects/{project_id}/selling/offers", json=record)

        if response.status_code == 200:
            print(f"销售记录创建成功: {record['record_type']}")
        else:
            print(f"销售记录创建失败: {response.text}")

    # 12. 获取销售记录
    print(f"\n12. 获取销售记录...")
    response = requests.get(f"{BASE_URL}/api/v1/projects/{project_id}/selling/records")
    if response.status_code == 200:
        records = response.json()["data"]
        print(f"销售记录数量: {len(records)}")
        for record in records:
            print(f"  - {record['record_type']}: {record['customer_name']}")
    else:
        print(f"获取销售记录失败: {response.text}")

    # 13. 完成项目（已售）
    print(f"\n13. 完成项目（已售）...")
    complete_data = {
        "sold_price": 1250000,
        "sold_date": datetime.now().isoformat()
    }
    response = requests.post(f"{BASE_URL}/api/v1/projects/{project_id}/complete", json=complete_data)
    if response.status_code == 200:
        print("项目完成成功")
        print(f"售出价格: {complete_data['sold_price']}")
    else:
        print(f"项目完成失败: {response.text}")

    # 14. 获取项目报告
    print(f"\n14. 获取项目报告...")
    response = requests.get(f"{BASE_URL}/api/v1/projects/{project_id}/report")
    if response.status_code == 200:
        report = response.json()["data"]
        print("项目报告:")
        print(f"  项目名称: {report['project_name']}")
        print(f"  项目状态: {report['status']}")
        print(f"  总投入: {report['total_investment']}")
        print(f"  总收入: {report['total_income']}")
        print(f"  净利润: {report['net_profit']}")
        print(f"  投资回报率: {report['roi']:.2%}")
    else:
        print(f"获取项目报告失败: {response.text}")

    # 15. 获取项目统计
    print(f"\n15. 获取项目统计...")
    response = requests.get(f"{BASE_URL}/api/v1/projects/stats")
    if response.status_code == 200:
        stats = response.json()["data"]
        print("项目统计:")
        print(f"  签约阶段: {stats['signing']}")
        print(f"  改造阶段: {stats['renovating']}")
        print(f"  在售阶段: {stats['selling']}")
        print(f"  已售阶段: {stats['sold']}")
    else:
        print(f"获取项目统计失败: {response.text}")

    print("\n=== 完整工作流程测试完成 ===")

if __name__ == "__main__":
    test_complete_workflow()