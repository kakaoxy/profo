"""
认证服务测试
"""
import pytest
from datetime import datetime, timedelta
from jose import jwt

from app.core.security import (
    create_access_token,
    verify_token,
    verify_password,
    get_password_hash
)
from app.core.config import settings


class TestAuthService:
    """认证服务测试类"""
    
    def test_password_hashing(self):
        """测试密码哈希"""
        password = "testpassword123"
        hashed = get_password_hash(password)
        
        assert hashed != password
        assert verify_password(password, hashed)
        assert not verify_password("wrongpassword", hashed)
    
    def test_create_access_token(self):
        """测试创建访问令牌"""
        user_id = 123
        token = create_access_token(subject=user_id)
        
        assert token is not None
        assert isinstance(token, str)
        
        # 验证令牌内容
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        assert payload["sub"] == str(user_id)
        assert "exp" in payload
    
    def test_create_access_token_with_custom_expiry(self):
        """测试创建带自定义过期时间的访问令牌"""
        user_id = 123
        expires_delta = timedelta(minutes=60)
        token = create_access_token(subject=user_id, expires_delta=expires_delta)
        
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        exp_timestamp = payload["exp"]
        exp_datetime = datetime.fromtimestamp(exp_timestamp)
        
        # 验证过期时间大约是60分钟后
        expected_exp = datetime.utcnow() + expires_delta
        time_diff = abs((exp_datetime - expected_exp).total_seconds())
        assert time_diff < 5  # 允许5秒误差
    
    def test_verify_token_valid(self):
        """测试验证有效令牌"""
        user_id = 123
        token = create_access_token(subject=user_id)
        
        verified_user_id = verify_token(token)
        assert verified_user_id == str(user_id)
    
    def test_verify_token_invalid(self):
        """测试验证无效令牌"""
        invalid_token = "invalid.token.here"
        result = verify_token(invalid_token)
        assert result is None
    
    def test_verify_token_expired(self):
        """测试验证过期令牌"""
        user_id = 123
        # 创建已过期的令牌
        expired_time = datetime.utcnow() - timedelta(minutes=1)
        payload = {
            "sub": str(user_id),
            "exp": expired_time
        }
        expired_token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        
        result = verify_token(expired_token)
        assert result is None
    
    def test_verify_token_wrong_secret(self):
        """测试使用错误密钥的令牌"""
        user_id = 123
        payload = {
            "sub": str(user_id),
            "exp": datetime.utcnow() + timedelta(minutes=30)
        }
        wrong_secret_token = jwt.encode(payload, "wrong_secret", algorithm=settings.ALGORITHM)
        
        result = verify_token(wrong_secret_token)
        assert result is None
    
    def test_password_hash_different_each_time(self):
        """测试相同密码每次哈希结果不同"""
        password = "testpassword123"
        hash1 = get_password_hash(password)
        hash2 = get_password_hash(password)
        
        assert hash1 != hash2
        assert verify_password(password, hash1)
        assert verify_password(password, hash2)
    
    def test_password_verification_case_sensitive(self):
        """测试密码验证区分大小写"""
        password = "TestPassword123"
        hashed = get_password_hash(password)
        
        assert verify_password(password, hashed)
        assert not verify_password("testpassword123", hashed)
        assert not verify_password("TESTPASSWORD123", hashed)
    
    def test_empty_password_handling(self):
        """测试空密码处理"""
        empty_password = ""
        hashed = get_password_hash(empty_password)
        
        assert hashed != empty_password
        assert verify_password(empty_password, hashed)
        assert not verify_password("notempty", hashed)
