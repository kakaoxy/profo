#!/usr/bin/env python3
"""
检查角色是否正确创建
"""
from db import SessionLocal
from models.user import Role

db = SessionLocal()
try:
    roles = db.query(Role).all()
    print("已创建角色列表:")
    for role in roles:
        print(f"  - {role.name} ({role.code}): {role.description}")
    print(f"\n共创建了 {len(roles)} 个角色")
finally:
    db.close()
