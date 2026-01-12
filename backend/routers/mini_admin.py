"""
小程序管理后台路由
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db import get_db
from schemas.mini import (
    MiniProjectCreate, MiniProjectUpdate, MiniProjectResponse, MiniProjectListResponse,
    ConsultantCreate, ConsultantUpdate, ConsultantResponse, ConsultantListResponse,
    MiniProjectPhotoCreate, MiniProjectPhotoResponse
)
from schemas.project_renovation import RenovationPhotoResponse
from services.mini_service import MiniProjectService

from dependencies.auth import get_current_operator_user

router = APIRouter(
    prefix="/admin/mini", 
    tags=["Admin-MiniProgram"],
    dependencies=[Depends(get_current_operator_user)]
)

def get_service(db: Session = Depends(get_db)):
    return MiniProjectService(db)

# --- Projects ---

@router.get("/projects", response_model=MiniProjectListResponse, summary="获取项目列表")
async def list_projects(
    page: int = 1, 
    page_size: int = 20, 
    is_published: bool = None,
    service: MiniProjectService = Depends(get_service)
):
    skip = (page - 1) * page_size
    items, total = service.get_projects(skip=skip, limit=page_size, is_published=is_published)
    return {"items": items, "total": total}

@router.post("/projects", response_model=MiniProjectResponse, summary="创建独立项目")
async def create_project(data: MiniProjectCreate, service: MiniProjectService = Depends(get_service)):
    return service.create_project(data)

@router.get("/projects/{id}", response_model=MiniProjectResponse, summary="获取项目详情")
async def get_project(id: str, service: MiniProjectService = Depends(get_service)):
    item = service.get_project(id)
    if not item:
        raise HTTPException(status_code=404, detail="Project not found")
    return item

@router.put("/projects/{id}", response_model=MiniProjectResponse, summary="更新项目信息")
async def update_project(id: str, data: MiniProjectUpdate, service: MiniProjectService = Depends(get_service)):
    item = service.update_project(id, data)
    if not item:
        raise HTTPException(status_code=404, detail="Project not found")
    return item

@router.post("/projects/sync", summary="同步新项目")
async def sync_projects(service: MiniProjectService = Depends(get_service)):
    return service.sync_projects_from_main()

@router.put("/projects/{id}/refresh", summary="刷新硬字段")
async def refresh_project(id: str, service: MiniProjectService = Depends(get_service)):
    success = service.refresh_project_basics(id)
    if not success:
        raise HTTPException(status_code=400, detail="Refresh failed")
    return {"success": True}

# --- Photos ---

@router.get("/projects/{id}/source-photos", response_model=List[RenovationPhotoResponse], summary="获取主项目素材库")
async def get_source_photos(id: str, service: MiniProjectService = Depends(get_service)):
    return service.get_source_photos(id)

@router.get("/projects/{id}/photos", response_model=List[MiniProjectPhotoResponse], summary="获取小程序项目照片")
async def get_mini_photos(id: str, service: MiniProjectService = Depends(get_service)):
    return service.get_mini_photos(id)

@router.post("/projects/{id}/photos", response_model=MiniProjectPhotoResponse, summary="添加照片记录")
async def add_mini_photo(id: str, data: MiniProjectPhotoCreate, service: MiniProjectService = Depends(get_service)):
    payload = data.model_dump()
    payload['mini_project_id'] = id
    # sort_order auto increment could be handled here or in service, for now default 0
    return service.create_photo_record(payload)

@router.delete("/photos/{photo_id}", summary="删除照片记录")
async def delete_mini_photo(photo_id: str, service: MiniProjectService = Depends(get_service)):
    if not service.delete_photo_record(photo_id):
        raise HTTPException(status_code=404, detail="Photo not found")
    return {"success": True}

# --- Consultants ---

@router.get("/consultants", response_model=ConsultantListResponse, summary="获取顾问列表")
async def list_consultants(
    page: int = 1, 
    page_size: int = 20, 
    service: MiniProjectService = Depends(get_service)
):
    skip = (page - 1) * page_size
    items, total = service.get_consultants(skip=skip, limit=page_size)
    return {"items": items, "total": total}

@router.post("/consultants", response_model=ConsultantResponse, summary="创建顾问")
async def create_consultant(data: ConsultantCreate, service: MiniProjectService = Depends(get_service)):
    return service.create_consultant(data)

@router.put("/consultants/{id}", response_model=ConsultantResponse, summary="更新顾问")
async def update_consultant(id: str, data: ConsultantUpdate, service: MiniProjectService = Depends(get_service)):
    item = service.update_consultant(id, data)
    if not item:
        raise HTTPException(status_code=404, detail="Consultant not found")
    return item
