"""
用户模型测试
"""
import pytest
from datetime import datetime
from sqlalchemy.orm import Session

from app.models.user import User
from app.core.security import get_password_hash, verify_password


class TestUserModel:
    """用户模型测试类"""
    
    def test_create_user_with_password(self, db: Session):
        """测试创建带密码的用户"""
        password = "testpassword123"
        hashed_password = get_password_hash(password)
        
        user = User(
            username="testuser",
            hashed_password=hashed_password,
            nickname="测试用户",
            is_active=True
        )
        
        db.add(user)
        db.commit()
        db.refresh(user)
        
        assert user.id is not None
        assert user.username == "testuser"
        assert user.nickname == "测试用户"
        assert user.is_active is True
        assert user.is_superuser is False
        assert user.hashed_password == hashed_password
        assert user.created_at is not None
        assert user.updated_at is not None
        assert isinstance(user.created_at, datetime)
        assert isinstance(user.updated_at, datetime)
        
        # 验证密码
        assert verify_password(password, user.hashed_password)
        assert not verify_password("wrongpassword", user.hashed_password)
    
    def test_create_user_with_wechat(self, db: Session):
        """测试创建微信用户"""
        user = User(
            wx_openid="test_openid_123",
            wx_unionid="test_unionid_456",
            nickname="微信用户",
            avatar_url="https://example.com/avatar.jpg",
            is_active=True
        )
        
        db.add(user)
        db.commit()
        db.refresh(user)
        
        assert user.id is not None
        assert user.username is None
        assert user.hashed_password is None
        assert user.wx_openid == "test_openid_123"
        assert user.wx_unionid == "test_unionid_456"
        assert user.nickname == "微信用户"
        assert user.avatar_url == "https://example.com/avatar.jpg"
        assert user.is_active is True
    
    def test_user_unique_constraints(self, db: Session):
        """测试用户唯一约束"""
        # 创建第一个用户
        user1 = User(
            username="testuser",
            hashed_password="hash1",
            nickname="用户1"
        )
        db.add(user1)
        db.commit()
        
        # 尝试创建相同用户名的用户
        user2 = User(
            username="testuser",  # 相同用户名
            hashed_password="hash2",
            nickname="用户2"
        )
        db.add(user2)
        
        with pytest.raises(Exception):  # 应该抛出唯一约束异常
            db.commit()
        
        db.rollback()
        
        # 测试微信openid唯一约束
        user3 = User(
            wx_openid="same_openid",
            nickname="微信用户1"
        )
        db.add(user3)
        db.commit()
        
        user4 = User(
            wx_openid="same_openid",  # 相同openid
            nickname="微信用户2"
        )
        db.add(user4)
        
        with pytest.raises(Exception):  # 应该抛出唯一约束异常
            db.commit()
    
    def test_user_default_values(self, db: Session):
        """测试用户默认值"""
        user = User(username="testuser")
        
        db.add(user)
        db.commit()
        db.refresh(user)
        
        assert user.is_active is True
        assert user.is_superuser is False
        assert user.nickname is None
        assert user.avatar_url is None
        assert user.phone is None
        assert user.wx_openid is None
        assert user.wx_unionid is None
        assert user.created_at is not None
        assert user.updated_at is not None
    
    def test_user_optional_fields(self, db: Session):
        """测试用户可选字段"""
        user = User(
            username="testuser",
            nickname="测试用户",
            avatar_url="https://example.com/avatar.jpg",
            phone="13812345678",
            is_superuser=True
        )
        
        db.add(user)
        db.commit()
        db.refresh(user)
        
        assert user.nickname == "测试用户"
        assert user.avatar_url == "https://example.com/avatar.jpg"
        assert user.phone == "13812345678"
        assert user.is_superuser is True
