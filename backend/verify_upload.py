"""
验证 CSV 上传结果
"""
from db import SessionLocal
from models import PropertyCurrent, Community


def verify_upload():
    """验证上传的数据"""
    db = SessionLocal()
    
    try:
        # 统计数据
        property_count = db.query(PropertyCurrent).count()
        community_count = db.query(Community).count()
        
        print(f"✅ 数据库统计:")
        print(f"   房源总数: {property_count}")
        print(f"   小区总数: {community_count}")
        print()
        
        # 显示房源详情
        print("📋 房源列表:")
        for p in db.query(PropertyCurrent).all():
            price = p.listed_price_wan if p.status.value == "在售" else p.sold_price_wan
            print(f"   - {p.source_property_id} ({p.data_source})")
            print(f"     状态: {p.status.value}")
            print(f"     小区: {p.community.name}")
            print(f"     户型: {p.rooms}室{p.halls}厅{p.baths}卫")
            print(f"     面积: {p.build_area}㎡")
            print(f"     价格: {price}万")
            print(f"     楼层: {p.floor_original} (级别: {p.floor_level})")
            print()
    
    finally:
        db.close()


if __name__ == "__main__":
    print("=" * 60)
    print("验证 CSV 上传结果")
    print("=" * 60)
    verify_upload()
