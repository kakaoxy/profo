"""权限服务.

处理权限点管理与角色-权限关联的业务逻辑.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import Permission, Role, User, role_permissions
from models.user.permission import PermissionCategory
from schemas.permission import (
    PermissionCreate,
    PermissionFilter,
    PermissionUpdate,
)
from settings import settings

from .exceptions import ConflictError, ResourceNotFoundError, ValidationError


class PermissionService:
    """权限服务."""

    def list_permissions(
        self,
        db: Session,
        filter: PermissionFilter | None = None,  # noqa: A002
        page: int = 1,
        page_size: int | None = None,
    ) -> tuple[int, list[Permission]]:
        """获取权限点列表（支持按 module/category/is_system 过滤）."""
        effective_page_size = page_size if page_size is not None else settings.default_page_size
        query = db.query(Permission)

        if filter:
            if filter.module:
                query = query.filter(Permission.module == filter.module)
            if filter.category:
                # category 是字符串，需要转换为枚举
                query = query.filter(Permission.category == PermissionCategory(filter.category))
            if filter.is_system is not None:
                query = query.filter(Permission.is_system == filter.is_system)

        total = query.count()
        offset = (page - 1) * effective_page_size
        perms = query.order_by(Permission.module, Permission.sort_order).offset(offset).limit(effective_page_size).all()
        return total, perms

    def list_permissions_grouped_by_module(self, db: Session) -> dict[str, list[Permission]]:
        """获取按模块分组的权限字典（用于前端权限选择器）.

        Returns:
            dict[module_name, list[Permission]]

        """
        perms = db.query(Permission).order_by(Permission.module, Permission.sort_order).all()
        grouped: dict[str, list[Permission]] = {}
        for p in perms:
            grouped.setdefault(p.module, []).append(p)
        return grouped

    def get_permission_by_id(self, db: Session, permission_id: str) -> Permission | None:
        """根据 ID 获取权限点."""
        return db.query(Permission).filter(Permission.id == permission_id).first()

    def get_permission_by_code(self, db: Session, code: str) -> Permission | None:
        """根据 code 获取权限点."""
        return db.query(Permission).filter(Permission.code == code).first()

    def create_permission(self, db: Session, perm_data: PermissionCreate) -> Permission:
        """创建权限点."""
        existing = self.get_permission_by_code(db, perm_data.code)
        if existing:
            msg = "权限代码已存在"
            raise ConflictError(msg)

        # category 字符串转枚举
        data = perm_data.model_dump()
        data["category"] = PermissionCategory(data["category"])
        perm = Permission(**data)
        db.add(perm)
        db.commit()
        db.refresh(perm)
        return perm

    def update_permission(self, db: Session, permission_id: str, perm_data: PermissionUpdate) -> Permission:
        """更新权限点（系统权限点的 is_system 字段不可修改）."""
        perm = self.get_permission_by_id(db, permission_id)
        if not perm:
            msg = "权限不存在"
            raise ResourceNotFoundError(msg)

        update_data = perm_data.model_dump(exclude_unset=True)
        if "category" in update_data and update_data["category"] is not None:
            update_data["category"] = PermissionCategory(update_data["category"])

        for field, value in update_data.items():
            setattr(perm, field, value)

        db.commit()
        db.refresh(perm)
        return perm

    def delete_permission(self, db: Session, permission_id: str) -> dict:
        """删除权限点（系统权限点禁止删除，返回 409）."""
        perm = self.get_permission_by_id(db, permission_id)
        if not perm:
            msg = "权限不存在"
            raise ResourceNotFoundError(msg)

        if perm.is_system:
            msg = "系统权限点不可删除"
            raise ConflictError(msg)

        # 逻辑外键关联：先删除 role_permissions 中的关联记录
        db.execute(role_permissions.delete().where(role_permissions.c.permission_id == permission_id))
        db.delete(perm)
        db.commit()
        return {"message": "权限删除成功"}

    def get_role_permission_codes(self, db: Session, role_id: str) -> list[str]:
        """获取角色的权限代码列表."""
        # 通过 role_permissions 关联表查询
        result = db.execute(
            select(Permission.code)
            .join(role_permissions, role_permissions.c.permission_id == Permission.id)
            .where(role_permissions.c.role_id == role_id)
        ).fetchall()
        return [row[0] for row in result]

    def set_role_permissions(self, db: Session, role_id: str, permission_codes: list[str]) -> list[str]:
        """全量替换角色权限（删除未传入的、新增传入的）.

        Args:
            db: 数据库会话
            role_id: 角色 ID
            permission_codes: 权限代码列表（全量替换）

        Returns:
            最新的权限代码列表

        Raises:
            ResourceNotFoundError: 角色不存在
            ValidationError: 传入的权限代码包含不存在的代码

        """
        # 校验角色存在
        role = db.query(Role).filter(Role.id == role_id).first()
        if not role:
            msg = "角色不存在"
            raise ResourceNotFoundError(msg)

        # 校验权限码存在性
        if permission_codes:
            existing_perms = db.query(Permission).filter(Permission.code.in_(permission_codes)).all()
            existing_codes = {p.code for p in existing_perms}
            invalid_codes = set(permission_codes) - existing_codes
            if invalid_codes:
                msg = f"权限代码不存在: {', '.join(sorted(invalid_codes))}"
                raise ValidationError(msg)
            perm_id_by_code = {p.code: p.id for p in existing_perms}
        else:
            perm_id_by_code = {}

        # 全量替换：先删除该角色所有关联，再插入新关联
        db.execute(role_permissions.delete().where(role_permissions.c.role_id == role_id))

        for code in permission_codes:
            perm_id = perm_id_by_code.get(code)
            if perm_id:
                db.execute(role_permissions.insert().values(role_id=role_id, permission_id=perm_id))

        # 同步更新 Role.permissions JSON 字段（向后兼容）
        role.permissions = list(permission_codes) if permission_codes else None
        db.commit()

        return list(permission_codes)

    def get_user_permission_codes(self, db: Session, user: User) -> set[str]:
        """获取用户的有效权限集（主角色 + 附加角色权限并集）.

        Args:
            db: 数据库会话
            user: 用户对象（需有 role 与 roles 关系）

        Returns:
            权限代码集合（set，便于并集运算）

        """
        role_ids: set[str] = set()
        if user.role_id:
            role_ids.add(user.role_id)
        # user.roles 是附加角色关系（Role 对象列表）
        for r in user.roles or []:
            if r.id:
                role_ids.add(r.id)

        if not role_ids:
            return set()

        # 一次性查询所有角色的权限
        result = db.execute(
            select(Permission.code)
            .join(role_permissions, role_permissions.c.permission_id == Permission.id)
            .where(role_permissions.c.role_id.in_(role_ids))
        ).fetchall()
        return {row[0] for row in result}


# 全局服务实例
permission_service = PermissionService()
