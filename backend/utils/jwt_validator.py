"""
JWT密钥验证和初始化工具
"""
import os
import sys
import secrets
from typing import Optional
import sys
import os
import secrets
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def validate_jwt_secret_key() -> bool:
    """
    验证JWT密钥是否满足安全要求
    
    Returns:
        bool: 密钥是否有效
    """
    # 延迟导入，避免在模块加载时就实例化settings
    from settings import settings
    
    secret_key = settings.jwt_secret_key
    
    # 检查密钥是否存在
    if not secret_key or secret_key.strip() == "":
        print("JWT_SECRET_KEY 未设置", file=sys.stderr)
        return False
    
    # 检查是否为开发环境的默认值（仅用于开发环境）
    if secret_key == "your-secret-key-here-minimum-32-characters-for-production":
        print("警告：正在使用开发环境默认JWT密钥", file=sys.stderr)
        print("   建议：生产环境请设置强随机密钥", file=sys.stderr)
        return True  # 开发环境允许使用默认值
    
    # 生产环境密钥强度检查
    key_length = len(secret_key)
    
    if key_length < 32:
        print(f"JWT密钥长度不足：当前{key_length}字符，要求至少32字符", file=sys.stderr)
        return False
    
    # 检查密钥复杂度
    has_upper = any(c.isupper() for c in secret_key)
    has_lower = any(c.islower() for c in secret_key)
    has_digit = any(c.isdigit() for c in secret_key)
    has_special = any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in secret_key)
    
    if not (has_upper and has_lower and has_digit and has_special):
        print("警告：JWT密钥复杂度建议包含大小写字母、数字和特殊字符", file=sys.stderr)
        # 不强制要求，仅警告
    
    return True

def generate_secure_jwt_key(length: int = 64) -> str:
    """
    生成安全的JWT密钥
    
    Args:
        length: 密钥长度（默认64字符）
        
    Returns:
        str: 生成的安全密钥
    """
    # 使用secrets模块生成加密安全的随机字符串
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?"
    return ''.join(secrets.choice(alphabet) for _ in range(length))

def check_jwt_configuration() -> None:
    """
    检查JWT配置并在启动时提供有用的提示
    """
    # 延迟导入，避免在模块加载时就实例化settings
    from settings import settings
    
    print("检查JWT密钥配置...")
    
    if not validate_jwt_secret_key():
        print("\nJWT密钥配置无效，应用无法启动", file=sys.stderr)
        print("\n解决方案：", file=sys.stderr)
        print("1. 设置环境变量 JWT_SECRET_KEY", file=sys.stderr)
        print("2. 或在 .env 文件中添加：", file=sys.stderr)
        print("   JWT_SECRET_KEY=your-secure-random-key-here", file=sys.stderr)
        print("\n生成安全密钥命令：", file=sys.stderr)
        print(f"   python -c \"from utils.jwt_validator import generate_secure_jwt_key; print(generate_secure_jwt_key())\"", file=sys.stderr)
        sys.exit(1)
    
    print("JWT密钥配置验证通过")
    
    # 检查密钥轮换配置
    if settings.jwt_key_rotation_enabled:
        if not settings.jwt_secret_key_old:
            print("警告：启用了密钥轮换但未设置旧密钥", file=sys.stderr)
        else:
            print("JWT密钥轮换已启用")

if __name__ == "__main__":
    # 命令行工具：生成安全密钥
    import argparse
    
    parser = argparse.ArgumentParser(description="JWT密钥管理工具")
    parser.add_argument("--generate", "-g", type=int, default=64, 
                       help="生成指定长度的安全密钥（默认64字符）")
    parser.add_argument("--check", "-c", action="store_true",
                       help="检查当前JWT配置")
    
    args = parser.parse_args()
    
    if args.check:
        check_jwt_configuration()
    else:
        key = generate_secure_jwt_key(args.generate)
        print(f"生成的JWT密钥（{args.generate}字符）：")
        print(key)