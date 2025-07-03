#!/usr/bin/env python3
"""
快速启动服务器脚本
"""
import subprocess
import sys
import os


def main():
    """启动开发服务器"""
    print("🚀 启动Profo Backend开发服务器...")
    
    # 确保在正确的目录
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    # 检查依赖是否已安装
    try:
        import fastapi
        import uvicorn
        print("✅ 依赖检查通过")
    except ImportError as e:
        print(f"❌ 缺少依赖: {e}")
        print("请先运行: pip install -e .")
        sys.exit(1)
    
    # 启动服务器
    print("🌐 服务器将在 http://localhost:8000 启动")
    print("📚 API文档: http://localhost:8000/docs")
    print("🔍 健康检查: http://localhost:8000/health")
    print("\n按 Ctrl+C 停止服务器\n")
    
    try:
        subprocess.run([
            sys.executable, "main.py"
        ], check=True)
    except KeyboardInterrupt:
        print("\n👋 服务器已停止")
    except subprocess.CalledProcessError as e:
        print(f"\n❌ 服务器启动失败: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
