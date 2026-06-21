"""角色服务.

处理角色管理的业务逻辑.
"""

from sqlalchemy.orm import Session

from models import Role
from schemas.user import RoleCreate, RoleUpdate
from settings import settings

from .exceptions import ConflictError, ResourceNotFoundError

# 允许更新的角色字段白名单（防止设置 id 等敏感字段）
_ROLE_ALLOWED_FIELDS = {"name", "code", "description", "permissions", "is_active"}


class RoleService:
    """角色服务."""

    def get_roles(  # noqa: PLR0913
        self,
        db: Session,
        name: str | None = None,
        code: str | None = None,
        is_active: bool | None = None,  # noqa: FBT001
        page: int = 1,
        page_size: int | None = None,
    ) -> tuple[int, list[Role]]:
        """获取角色列表."""
        effective_page_size = page_size if page_size is not None else settings.default_page_size
        query = db.query(Role)

        if name:
            query = query.filter(Role.name.like(f"%{name}%"))
        if code:
            query = query.filter(Role.code.like(f"%{code}%"))
        if is_active is not None:
            query = query.filter(Role.is_active == is_active)

        total = query.count()
        offset = (page - 1) * effective_page_size
        roles = query.order_by(Role.name).offset(offset).limit(effective_page_size).all()

        return total, roles

    def get_role_by_id(self, db: Session, role_id: str) -> Role | None:
        """根据ID获取角色."""
        return db.query(Role).filter(Role.id == role_id).first()

    def create_role(self, db: Session, role_data: RoleCreate) -> Role:
        """创建角色."""
        # Check name existence
        existing_name = db.query(Role).filter(Role.name == role_data.name).first()
        if existing_name:
            msg = "角色名称已存在"
            raise ConflictError(msg)

        # Check code existence
        existing_code = db.query(Role).filter(Role.code == role_data.code).first()
        if existing_code:
            msg = "角色代码已存在"
            raise ConflictError(msg)

        db_role = Role(**role_data.model_dump())
        db.add(db_role)
        db.commit()
        db.refresh(db_role)
        return db_role

    def update_role(self, db: Session, role_id: str, role_data: RoleUpdate) -> Role:
        """更新角色."""
        role = self.get_role_by_id(db, role_id)
        if not role:
            msg = "角色不存在"
            raise ResourceNotFoundError(msg)

        # Check name uniqueness
        if role_data.name and role_data.name != role.name:
            existing_name = (
                db.query(Role)
                .filter(
                    Role.name == role_data.name,
                    Role.id != role_id,
                )
                .first()
            )
            if existing_name:
                msg = "角色名称已存在"
                raise ConflictError(msg)

        # Check code uniqueness
        if role_data.code and role_data.code != role.code:
            existing_code = (
                db.query(Role)
                .filter(
                    Role.code == role_data.code,
                    Role.id != role_id,
                )
                .first()
            )
            if existing_code:
                msg = "角色代码已存在"
                raise ConflictError(msg)

        update_data = role_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if field in _ROLE_ALLOWED_FIELDS:
                setattr(role, field, value)

        db.commit()
        db.refresh(role)
        return role

    def delete_role(self, db: Session, role_id: str) -> dict:
        """删除角色（逻辑删除，停用角色）."""
        role = self.get_role_by_id(db, role_id)
        if not role:
            msg = "角色不存在"
            raise ResourceNotFoundError(msg)

        if role.users:
            msg = "角色下存在用户，无法删除"
            raise ConflictError(msg)

        role.is_active = False
        db.commit()
        return {"message": "角色删除成功"}


# 全局服务实例
role_service = RoleService()
