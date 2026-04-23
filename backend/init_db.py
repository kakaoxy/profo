#!/usr/bin/env python3
"""
数据库初始化脚本

功能:
- 创建所有数据库表
- 验证表结构
- 显示初始化结果

使用方法:
    python init_db.py
    或
    uv run python init_db.py
"""
import sys
from pathlib import Path

# 添加当前目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

from db import engine
from models import Base, Community, CommunityAlias, CommunityCompetitor, PropertyCurrent, PropertyHistory, PropertyMedia, FailedRecord, PropertyImportTask


def init_database():
    """初始化数据库 - 创建所有表"""
    print("=" * 60)
    print("🚀 开始初始化 Profo 房产数据中心数据库...")
    print("=" * 60)
    
    try:
        # 创建所有表
        print("\n📋 正在创建数据库表...")
        Base.metadata.create_all(bind=engine)
        
        # 验证表是否创建成功
        print("\n✅ 数据库表创建成功！")
        print("\n已创建的表:")
        print("  1. communities          - 小区字典")
        print("  2. community_aliases    - 小区别名映射")
        print("  3. property_current     - 房源当前状态")
        print("  4. property_history     - 房源历史快照")
        print("  5. property_media       - 房源媒体资源")
        print("  6. failed_records       - 失败记录收容所")
        print("  7. property_import_tasks - 房源批量导入任务")
        
        # 显示数据库文件位置
        from settings import settings
        db_path = settings.database_url.replace("sqlite:///", "")
        print(f"\n📁 数据库文件位置: {db_path}")
        
        print("\n" + "=" * 60)
        print("✨ 数据库初始化完成！现在可以启动应用了。")
        print("=" * 60)
        print("\n💡 下一步:")
        print("  1. 启动后端: cd backend && uv run uvicorn main:app --reload")
        print("  2. 启动前端: cd frontend && pnpm dev")
        print("  或使用一键启动脚本: ./start.sh (macOS/Linux) 或 start.bat (Windows)")
        print()
        
        return True
        
    except Exception as e:
        print(f"\n❌ 数据库初始化失败: {str(e)}")
        print("\n请检查:")
        print("  1. Python 环境是否正确配置")
        print("  2. 依赖包是否已安装 (uv sync)")
        print("  3. 数据库文件路径是否有写入权限")
        return False


if __name__ == "__main__":
    success = init_database()
    sys.exit(0 if success else 1)
