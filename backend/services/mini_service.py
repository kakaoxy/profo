"""
小程序项目管理服务
"""
from typing import List, Tuple, Optional, Dict
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import select, and_

from models import (
    MiniProject, Project, PropertyCurrent, Consultant, Community, 
    MiniProjectPhoto, RenovationPhoto, ProjectStatus
)
from schemas.mini import MiniProjectCreate, MiniProjectUpdate, ConsultantCreate, ConsultantUpdate

class MiniProjectService:
    def __init__(self, db: Session):
        self.db = db

    def get_projects(self, skip=0, limit=20, is_published=None) -> Tuple[List[MiniProject], int]:
        query = self.db.query(MiniProject)
        if is_published is not None:
            query = query.filter(MiniProject.is_published == is_published)
        
        total = query.count()
        items = query.order_by(
            MiniProject.sort_order.desc(), 
            MiniProject.published_at.desc().nullslast(),
            MiniProject.created_at.desc()
        ).offset(skip).limit(limit).all()
        return items, total

    def get_project(self, id: str) -> Optional[MiniProject]:
        return self.db.query(MiniProject).filter(MiniProject.id == id).first()

    def create_project(self, data: MiniProjectCreate) -> MiniProject:
        db_obj = MiniProject(**data.model_dump())
        self.db.add(db_obj)
        self.db.commit()
        self.db.refresh(db_obj)
        return db_obj

    def update_project(self, id: str, data: MiniProjectUpdate) -> Optional[MiniProject]:
        db_obj = self.get_project(id)
        if not db_obj:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_obj, field, value)
        
        if 'is_published' in update_data and update_data['is_published']:
            if not db_obj.published_at:
                db_obj.published_at = datetime.utcnow()
            
        self.db.commit()
        self.db.refresh(db_obj)
        return db_obj

    def sync_projects_from_main(self) -> dict:
        """从主项目增量同步"""
        existing_pids_query = self.db.query(MiniProject.project_id).filter(MiniProject.project_id.isnot(None))
        existing_pids = set(p[0] for p in existing_pids_query.all())
        
        # 只同步未删除的项目(status != deleted)
        new_projects = self.db.query(Project).filter(
            Project.id.notin_(existing_pids),
            Project.status != ProjectStatus.DELETED.value
        ).all()
        
        created_count = 0
        for p in new_projects:
            # 尝试查找关联小区的房源信息 (取第一个匹配的)
            prop = None
            if p.community_name:
                prop = self.db.query(PropertyCurrent).join(Community).filter(
                    Community.name == p.community_name
                ).first()
            
            mini = MiniProject(
                project_id=p.id,
                title=p.name,
                address=f"{p.community_name} {p.address}" if p.community_name else p.address,
                area=p.area,
                price=p.signing_price,
                layout=f"{prop.rooms}室{prop.halls}厅{prop.baths}卫" if prop else None,
                orientation=prop.orientation if prop else None,
                is_published=False
            )
            self.db.add(mini)
            created_count += 1
        
        self.db.commit()
        return {"total_synced": created_count}

    def refresh_project_basics(self, id: str) -> bool:
        mini = self.get_project(id)
        if not mini or not mini.project_id:
            return False
        
        project = self.db.query(Project).filter(Project.id == mini.project_id).first()
        if not project:
            return False
            
        mini.address = f"{project.community_name} {project.address}" if project.community_name else project.address
        mini.area = project.area
        mini.price = project.signing_price
        
        if project.community_name:
            prop = self.db.query(PropertyCurrent).join(Community).filter(
                Community.name == project.community_name
            ).first()
            if prop:
                mini.layout = f"{prop.rooms}室{prop.halls}厅{prop.baths}卫"
                mini.orientation = prop.orientation
            
        self.db.commit()
        self.db.refresh(mini)
        return True

    # --- Consultant Methods ---
    def get_consultants(self, skip=0, limit=20) -> Tuple[List[Consultant], int]:
        query = self.db.query(Consultant).order_by(Consultant.created_at.desc())
        total = query.count()
        items = query.offset(skip).limit(limit).all()
        return items, total

    def create_consultant(self, data: ConsultantCreate) -> Consultant:
        db_obj = Consultant(**data.model_dump())
        self.db.add(db_obj)
        self.db.commit()
        self.db.refresh(db_obj)
        return db_obj

    def update_consultant(self, id: str, data: ConsultantUpdate) -> Optional[Consultant]:
        db_obj = self.db.query(Consultant).filter(Consultant.id == id).first()
        if not db_obj:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_obj, field, value)
            
        self.db.commit()
        self.db.refresh(db_obj)
        return db_obj

    # --- Photo Methods ---
    def get_source_photos(self, mini_project_id: str) -> List[RenovationPhoto]:
        """获取主项目的所有原始照片"""
        mini = self.get_project(mini_project_id)
        if not mini or not mini.project_id:
            return []
        return self.db.query(RenovationPhoto).filter(
            RenovationPhoto.project_id == mini.project_id,
            RenovationPhoto.deleted_at.is_(None)
        ).all()

    def get_mini_photos(self, mini_project_id: str) -> List[MiniProjectPhoto]:
        """获取小程序项目照片"""
        return self.db.query(MiniProjectPhoto).filter(
            MiniProjectPhoto.mini_project_id == mini_project_id
        ).order_by(MiniProjectPhoto.sort_order).all()

    def create_photo_record(self, data: dict) -> MiniProjectPhoto:
        """创建照片记录"""
        db_obj = MiniProjectPhoto(**data)
        self.db.add(db_obj)
        self.db.commit()
        self.db.refresh(db_obj)
        return db_obj
    
    def delete_photo_record(self, photo_id: str) -> bool:
        """删除照片记录"""
        db_obj = self.db.query(MiniProjectPhoto).filter(MiniProjectPhoto.id == photo_id).first()
        if db_obj:
            self.db.delete(db_obj)
            self.db.commit()
            return True
        return False
