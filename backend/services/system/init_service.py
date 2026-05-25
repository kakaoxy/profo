"""系统初始化服务.

提供角色和默认管理员用户的创建逻辑.
"""

import logging
import secrets
import string

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from models import Role, User
from utils.auth import get_password_hash

logger = logging.getLogger(__name__)


class SystemInitService:
    """系统初始化服务."""

    def initialize(self, db: Session) -> dict:
        """初始化系统数据，包括默认角色和管理员用户。幂等操作。."""
        existing_roles = db.query(Role).count()
        existing_users = db.query(User).filter(User.username == "admin").count()
        if existing_roles > 0 and existing_users > 0:
            return {"message": "系统数据已初始化"}

        roles_data = [
            {
                "id": "admin-role",
                "name": "管理员",
                "code": "admin",
                "description": "拥有所有权限，包括用户管理、权限配置",
                "permissions": ["view_data", "edit_data", "manage_users", "manage_roles"],
            },
            {
                "id": "operator-role",
                "name": "运营人员",
                "code": "operator",
                "description": "拥有数据修改权限，包括项目、房源的增删改查",
                "permissions": ["view_data", "edit_data"],
            },
            {
                "id": "user-role",
                "name": "普通用户",
                "code": "user",
                "description": "仅拥有数据查看权限",
                "permissions": ["view_data"],
            },
            {
                "id": "customer-role",
                "name": "C端用户",
                "code": "customer",
                "description": "C端注册用户，可浏览房源、提交估价",
                "permissions": ["view_data"],
            },
        ]

        try:
            roles = []
            for role_data in roles_data:
                role = Role(**role_data)
                db.add(role)
                roles.append(role)

            admin_role = next(r for r in roles if r.code == "admin")

            alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
            temp_password = "".join(secrets.choice(alphabet) for _ in range(12))
            temp_password = "Temp" + temp_password + "9!"

            admin_user = User(
                id="admin-user",
                username="admin",
                password=get_password_hash(temp_password),
                nickname="系统管理员",
                role_id=admin_role.id,
                status="active",
                must_change_password=True,
            )

            db.add(admin_user)
            db.commit()
        except SQLAlchemyError as e:
            db.rollback()
            logger.exception("系统初始化失败")
            return {"error": "系统初始化失败", "details": str(e)}

        return {
            "message": "系统数据初始化成功",
            "warning": "请立即使用临时密码登录并修改密码",
            "temp_admin": {
                "username": "admin",
                "temp_password": temp_password,
                "note": "此密码仅显示一次，请妥善保存。首次登录必须修改密码。",
            },
        }


init_service = SystemInitService()
