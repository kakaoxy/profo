from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from typing import Optional, List

from models.user import Role
from schemas.user import RoleCreate, RoleUpdate

class RoleService:
    def get_roles(
        self, 
        db: Session, 
        name: Optional[str] = None,
        code: Optional[str] = None,
        is_active: Optional[bool] = None,
        page: int = 1,
        page_size: int = 50
    ) -> tuple[int, List[Role]]:
        query = db.query(Role)
        
        if name:
            query = query.filter(Role.name.like(f"%{name}%"))
        if code:
            query = query.filter(Role.code.like(f"%{code}%"))
        if is_active is not None:
            query = query.filter(Role.is_active == is_active)
        
        total = query.count()
        offset = (page - 1) * page_size
        roles = query.order_by(Role.name).offset(offset).limit(page_size).all()
        
        return total, roles

    def get_role_by_id(self, db: Session, role_id: str) -> Optional[Role]:
        return db.query(Role).filter(Role.id == role_id).first()

    def create_role(self, db: Session, role_data: RoleCreate) -> Role:
        # Check name existence
        existing_name = db.query(Role).filter(Role.name == role_data.name).first()
        if existing_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="角色名称已存在"
            )
        
        # Check code existence
        existing_code = db.query(Role).filter(Role.code == role_data.code).first()
        if existing_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="角色代码已存在"
            )
        
        db_role = Role(**role_data.model_dump())
        db.add(db_role)
        db.commit()
        db.refresh(db_role)
        return db_role

    def update_role(self, db: Session, role_id: str, role_data: RoleUpdate) -> Role:
        role = self.get_role_by_id(db, role_id)
        if not role:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="角色不存在"
            )
        
        # Check name uniqueness
        if role_data.name and role_data.name != role.name:
            existing_name = db.query(Role).filter(
                Role.name == role_data.name,
                Role.id != role_id
            ).first()
            if existing_name:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="角色名称已存在"
                )
        
        # Check code uniqueness
        if role_data.code and role_data.code != role.code:
            existing_code = db.query(Role).filter(
                Role.code == role_data.code,
                Role.id != role_id
            ).first()
            if existing_code:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="角色代码已存在"
                )
        
        update_data = role_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(role, field, value)
        
        db.commit()
        db.refresh(role)
        return role

    def delete_role(self, db: Session, role_id: str) -> dict:
        role = self.get_role_by_id(db, role_id)
        if not role:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="角色不存在"
            )
        
        if role.users:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="角色下存在用户，无法删除"
            )
        
        db.delete(role)
        db.commit()
        return {"message": "角色删除成功"}

role_service = RoleService()
