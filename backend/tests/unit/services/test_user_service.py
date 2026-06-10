"""UserService 单元测试."""

import pytest

from models import User
from schemas.user import PasswordChange, PasswordResetRequest, UserCreate, UserUpdate
from services.system.exceptions import ConflictError, ResourceNotFoundError, ValidationError
from services.system.user import UserService


# ---------------------------------------------------------------------------
# get_users
# ---------------------------------------------------------------------------


class TestGetUsers:
    """get_users 测试."""

    def test_returns_all_users(self, seeded_db: dict) -> None:
        """无筛选条件应返回所有用户."""
        db = seeded_db["session"]
        svc = UserService()
        total, users = svc.get_users(db)
        assert total == 2
        assert len(users) == 2

    def test_filters_by_username(self, seeded_db: dict) -> None:
        """按用户名模糊筛选."""
        db = seeded_db["session"]
        svc = UserService()
        total, users = svc.get_users(db, username="admin")
        assert total == 1
        assert users[0].username == "admin"

    def test_filters_by_nickname(self, seeded_db: dict) -> None:
        """按昵称模糊筛选."""
        db = seeded_db["session"]
        svc = UserService()
        total, users = svc.get_users(db, nickname="测试")
        assert total == 1
        assert users[0].nickname == "测试用户"

    def test_filters_by_role_id(self, seeded_db: dict) -> None:
        """按角色ID精确筛选."""
        db = seeded_db["session"]
        svc = UserService()
        total, users = svc.get_users(db, role_id="user-role")
        assert total == 1
        assert users[0].role_id == "user-role"

    def test_filters_by_status(self, seeded_db: dict) -> None:
        """按状态精确筛选."""
        db = seeded_db["session"]
        svc = UserService()
        total, users = svc.get_users(db, user_status="active")
        assert total == 2

    def test_pagination(self, seeded_db: dict) -> None:
        """分页参数应正确生效."""
        db = seeded_db["session"]
        svc = UserService()
        total, page1 = svc.get_users(db, page=1, page_size=1)
        assert total == 2
        assert len(page1) == 1
        total2, page2 = svc.get_users(db, page=2, page_size=1)
        assert total2 == 2
        assert len(page2) == 1
        assert page1[0].id != page2[0].id


# ---------------------------------------------------------------------------
# get_user_by_id
# ---------------------------------------------------------------------------


class TestGetUserById:
    """get_user_by_id 测试."""

    def test_existing_user_returns_user(self, seeded_db: dict) -> None:
        """存在的用户ID应返回 User 对象."""
        db = seeded_db["session"]
        svc = UserService()
        user = svc.get_user_by_id(db, "admin-user")
        assert user is not None
        assert user.username == "admin"

    def test_non_existent_returns_none(self, seeded_db: dict) -> None:
        """不存在的用户ID应返回 None."""
        db = seeded_db["session"]
        svc = UserService()
        user = svc.get_user_by_id(db, "non-existent-id")
        assert user is None


# ---------------------------------------------------------------------------
# create_user
# ---------------------------------------------------------------------------


class TestCreateUser:
    """create_user 测试."""

    def test_success(self, seeded_db: dict) -> None:
        """正常创建用户应成功."""
        db = seeded_db["session"]
        svc = UserService()
        user_data = UserCreate(
            username="newuser",
            password="NewUser123!",
            nickname="新用户",
            role_id="user-role",
        )
        user = svc.create_user(db, user_data)
        assert user.username == "newuser"
        assert user.nickname == "新用户"
        assert user.role_id == "user-role"
        assert user.password != "NewUser123!"

    def test_duplicate_username_raises_conflict_error(self, seeded_db: dict) -> None:
        """重复用户名应抛出 ConflictError."""
        db = seeded_db["session"]
        svc = UserService()
        user_data = UserCreate(
            username="admin",
            password="Admin123!",
            nickname="重复用户名",
            role_id="admin-role",
        )
        with pytest.raises(ConflictError, match="用户名已存在"):
            svc.create_user(db, user_data)

    def test_duplicate_phone_raises_conflict_error(self, seeded_db: dict) -> None:
        """重复手机号应抛出 ConflictError."""
        db = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        admin.phone = "13800000001"
        db.commit()

        svc = UserService()
        user_data = UserCreate(
            username="uniqueuser",
            password="Unique123!",
            nickname="重复手机号",
            role_id="user-role",
            phone="13800000001",
        )
        with pytest.raises(ConflictError, match="手机号已被使用"):
            svc.create_user(db, user_data)

    def test_weak_password_raises_validation_error(self, seeded_db: dict) -> None:
        """弱密码应抛出 ValidationError（缺少大写字母和特殊字符）."""
        db = seeded_db["session"]
        svc = UserService()
        user_data = UserCreate(
            username="weakpwduser",
            password="aaaaaaaa1",
            nickname="弱密码用户",
            role_id="user-role",
        )
        with pytest.raises(ValidationError):
            svc.create_user(db, user_data)


# ---------------------------------------------------------------------------
# update_user
# ---------------------------------------------------------------------------


class TestUpdateUser:
    """update_user 测试."""

    def test_success(self, seeded_db: dict) -> None:
        """正常更新用户应成功."""
        db = seeded_db["session"]
        svc = UserService()
        user_data = UserUpdate(nickname="新昵称")
        user = svc.update_user(db, "admin-user", user_data)
        assert user.nickname == "新昵称"

    def test_non_existent_user_raises_resource_not_found_error(self, seeded_db: dict) -> None:
        """更新不存在的用户应抛出 ResourceNotFoundError."""
        db = seeded_db["session"]
        svc = UserService()
        user_data = UserUpdate(nickname="不存在")
        with pytest.raises(ResourceNotFoundError, match="用户不存在"):
            svc.update_user(db, "non-existent-id", user_data)

    def test_duplicate_phone_raises_conflict_error(self, seeded_db: dict) -> None:
        """更新为已占用的手机号应抛出 ConflictError."""
        db = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        admin.phone = "13800000001"
        db.commit()

        svc = UserService()
        user_data = UserUpdate(phone="13800000001")
        with pytest.raises(ConflictError, match="手机号已被使用"):
            svc.update_user(db, "normal-user", user_data)


# ---------------------------------------------------------------------------
# reset_password
# ---------------------------------------------------------------------------


class TestResetPassword:
    """reset_password 测试."""

    def test_success(self, seeded_db: dict) -> None:
        """正常重置密码应成功."""
        db = seeded_db["session"]
        svc = UserService()
        password_data = PasswordResetRequest(password="ResetPass123!")
        result = svc.reset_password(db, "admin-user", password_data)
        assert result["message"] == "密码重置成功"

        # 验证密码确实被修改
        user = svc.get_user_by_id(db, "admin-user")
        from utils.auth import verify_password

        assert verify_password("ResetPass123!", user.password)

    def test_non_existent_user_raises_resource_not_found_error(self, seeded_db: dict) -> None:
        """重置不存在用户的密码应抛出 ResourceNotFoundError."""
        db = seeded_db["session"]
        svc = UserService()
        password_data = PasswordResetRequest(password="ResetPass123!")
        with pytest.raises(ResourceNotFoundError, match="用户不存在"):
            svc.reset_password(db, "non-existent-id", password_data)

    def test_weak_password_raises_validation_error(self, seeded_db: dict) -> None:
        """弱密码应抛出 ValidationError（缺少大写字母和特殊字符）."""
        db = seeded_db["session"]
        svc = UserService()
        password_data = PasswordResetRequest(password="aaaaaaaa1")
        with pytest.raises(ValidationError):
            svc.reset_password(db, "admin-user", password_data)


# ---------------------------------------------------------------------------
# delete_user
# ---------------------------------------------------------------------------


class TestDeleteUser:
    """delete_user 测试."""

    def test_success(self, seeded_db: dict) -> None:
        """正常删除用户应成功."""
        db = seeded_db["session"]
        svc = UserService()
        result = svc.delete_user(db, "normal-user", "admin-user")
        assert result["message"] == "用户删除成功"
        assert svc.get_user_by_id(db, "normal-user") is None

    def test_deleting_self_raises_validation_error(self, seeded_db: dict) -> None:
        """删除自己应抛出 ValidationError."""
        db = seeded_db["session"]
        svc = UserService()
        with pytest.raises(ValidationError, match="不能删除自己"):
            svc.delete_user(db, "admin-user", "admin-user")

    def test_non_existent_user_raises_resource_not_found_error(self, seeded_db: dict) -> None:
        """删除不存在的用户应抛出 ResourceNotFoundError."""
        db = seeded_db["session"]
        svc = UserService()
        with pytest.raises(ResourceNotFoundError, match="用户不存在"):
            svc.delete_user(db, "non-existent-id", "admin-user")


# ---------------------------------------------------------------------------
# change_password
# ---------------------------------------------------------------------------


class TestChangePassword:
    """change_password 测试."""

    def test_success(self, seeded_db: dict) -> None:
        """正常修改密码应成功."""
        db = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        svc = UserService()
        password_data = PasswordChange(current_password="Admin123!", new_password="NewPass123!")
        result = svc.change_password(db, admin, password_data)
        assert result["message"] == "密码修改成功"

        from utils.auth import verify_password

        assert verify_password("NewPass123!", admin.password)

    def test_wrong_current_password_raises_validation_error(self, seeded_db: dict) -> None:
        """当前密码错误应抛出 ValidationError."""
        db = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        svc = UserService()
        password_data = PasswordChange(current_password="WrongPass123!", new_password="NewPass123!")
        with pytest.raises(ValidationError, match="当前密码错误"):
            svc.change_password(db, admin, password_data)

    def test_weak_new_password_raises_validation_error(self, seeded_db: dict) -> None:
        """弱新密码应抛出 ValidationError（缺少大写字母和特殊字符）."""
        db = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        svc = UserService()
        password_data = PasswordChange(current_password="Admin123!", new_password="aaaaaaaa1")
        with pytest.raises(ValidationError):
            svc.change_password(db, admin, password_data)


# ---------------------------------------------------------------------------
# list_users_simple
# ---------------------------------------------------------------------------


class TestListUsersSimple:
    """list_users_simple 测试."""

    def test_returns_simplified_list(self, seeded_db: dict) -> None:
        """无筛选条件应返回简化用户列表."""
        db = seeded_db["session"]
        svc = UserService()
        users = svc.list_users_simple(db)
        assert len(users) == 2
        for u in users:
            assert "id" in u
            assert "nickname" in u
            assert "username" in u

    def test_filters_by_status(self, seeded_db: dict) -> None:
        """按状态筛选."""
        db = seeded_db["session"]
        svc = UserService()
        users = svc.list_users_simple(db, status="active")
        assert len(users) == 2

    def test_filters_by_nickname(self, seeded_db: dict) -> None:
        """按昵称模糊筛选（同时匹配 nickname 和 username）."""
        db = seeded_db["session"]
        svc = UserService()
        users = svc.list_users_simple(db, nickname="admin")
        assert len(users) == 1
        assert users[0]["username"] == "admin"
