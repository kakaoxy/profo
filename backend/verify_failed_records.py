"""
验证失败记录
"""
from db import SessionLocal
from models import FailedRecord


def verify_failed_records():
    """验证失败记录"""
    db = SessionLocal()
    
    try:
        # 统计数据
        failed_count = db.query(FailedRecord).count()
        
        print(f"✅ 失败记录统计:")
        print(f"   失败记录总数: {failed_count}")
        print()
        
        # 显示失败记录详情
        print("📋 失败记录列表:")
        for record in db.query(FailedRecord).all():
            print(f"   - ID: {record.id}")
            print(f"     数据源: {record.data_source}")
            print(f"     失败类型: {record.failure_type}")
            print(f"     失败原因: {record.failure_reason[:100]}...")
            print(f"     发生时间: {record.occurred_at}")
            print(f"     是否已处理: {record.is_handled}")
            print()
    
    finally:
        db.close()


if __name__ == "__main__":
    print("=" * 60)
    print("验证失败记录")
    print("=" * 60)
    verify_failed_records()
