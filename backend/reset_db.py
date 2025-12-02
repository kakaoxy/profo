#!/usr/bin/env python3
"""
数据库重置脚本

功能:
- 删除所有数据库表
- 重新创建所有表
- 显示重置结果

使用方法:
    python reset_db.py
"""
import sys
from pathlib import Path

# 添加当前目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

from db import reset_db

if __name__ == "__main__":
    print("=" * 60)
    print("🔄 开始重置 Profo 房产数据中心数据库...")
    print("=" * 60)
    
    try:
        reset_db()
        print("✅ 数据库重置完成！")
        print("=" * 60)
        sys.exit(0)
    except Exception as e:
        print(f"❌ 数据库重置失败: {str(e)}")
        print("=" * 60)
        sys.exit(1)
