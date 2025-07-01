#!/usr/bin/env python3
"""
测试运行脚本
"""
import subprocess
import sys
import os


def run_tests():
    """运行所有测试"""
    print("🚀 开始运行Profo Backend测试套件...")
    
    # 确保在正确的目录
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    # 运行测试命令
    cmd = [
        sys.executable, "-m", "pytest",
        "tests/",
        "-v",  # 详细输出
        "--tb=short",  # 简短的错误回溯
        "--cov=app",  # 代码覆盖率
        "--cov-report=term-missing",  # 显示未覆盖的行
        "--cov-report=html:htmlcov",  # 生成HTML覆盖率报告
    ]
    
    try:
        result = subprocess.run(cmd, check=True)
        print("\n✅ 所有测试通过！")
        print("📊 覆盖率报告已生成到 htmlcov/ 目录")
        return True
    except subprocess.CalledProcessError as e:
        print(f"\n❌ 测试失败，退出码: {e.returncode}")
        return False


def run_specific_tests(test_path):
    """运行特定测试"""
    print(f"🎯 运行特定测试: {test_path}")
    
    cmd = [
        sys.executable, "-m", "pytest",
        test_path,
        "-v",
        "--tb=short"
    ]
    
    try:
        subprocess.run(cmd, check=True)
        print(f"\n✅ 测试 {test_path} 通过！")
        return True
    except subprocess.CalledProcessError as e:
        print(f"\n❌ 测试 {test_path} 失败，退出码: {e.returncode}")
        return False


def main():
    """主函数"""
    if len(sys.argv) > 1:
        # 运行特定测试
        test_path = sys.argv[1]
        success = run_specific_tests(test_path)
    else:
        # 运行所有测试
        success = run_tests()
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
