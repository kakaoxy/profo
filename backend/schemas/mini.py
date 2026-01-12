"""
小程序项目管理 Schema
"""
from typing import Optional, List, Any
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from .common import GenericBaseResponse

# --- Consultant Schemas ---

class ConsultantBase(BaseModel):
    """顾问基础模型"""
    name: str = Field(..., description="姓名")
    avatar_url: Optional[str] = Field(None, description="头像URL")
    role: Optional[str] = Field(None, description="职位")
    phone: Optional[str] = Field(None, description="联系电话")
    wx_qr_code: Optional[str] = Field(None, description="微信二维码")
    intro: Optional[str] = Field(None, description="个人简介")

class ConsultantCreate(ConsultantBase):
    """创建顾问"""
    pass

class ConsultantUpdate(BaseModel):
    """更新顾问"""
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    role: Optional[str] = None
    phone: Optional[str] = None
    wx_qr_code: Optional[str] = None
    intro: Optional[str] = None
    is_active: Optional[bool] = None

class ConsultantResponse(ConsultantBase):
    """顾问响应"""
    id: str
    rating: float
    completed_projects: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class ConsultantListResponse(BaseModel):
    """顾问列表响应"""
    items: List[ConsultantResponse]
    total: int


# --- Photo Schemas ---

class MiniProjectPhotoBase(BaseModel):
    """照片基础模型"""
    renovation_stage: Optional[str] = Field(None, description="改造阶段")
    description: Optional[str] = Field(None, description="描述")
    sort_order: int = Field(0, description="排序")

class MiniProjectPhotoCreate(MiniProjectPhotoBase):
    """创建照片"""
    origin_photo_id: Optional[str] = Field(None, description="原项目照片ID")
    image_url: Optional[str] = Field(None, description="直接上传的URL")

class MiniProjectPhotoResponse(MiniProjectPhotoBase):
    """照片响应"""
    id: str
    mini_project_id: str
    origin_photo_id: Optional[str]
    image_url: Optional[str]
    created_at: datetime
    
    # 辅助字段：最终展示的URL (需在 Service 层计算)
    final_url: Optional[str] = None 

    model_config = ConfigDict(from_attributes=True)


# --- Mini Project Schemas ---

class MiniProjectBase(BaseModel):
    """小程序项目基础模型"""
    title: str = Field(..., description="营销标题")
    cover_image: Optional[str] = None
    style: Optional[str] = None
    description: Optional[str] = None
    marketing_tags: Optional[List[str]] = None
    share_title: Optional[str] = None
    share_image: Optional[str] = None
    consultant_id: Optional[str] = None

class MiniProjectCreate(MiniProjectBase):
    """创建小程序项目 (独立)"""
    pass

class MiniProjectUpdate(BaseModel):
    """更新小程序项目"""
    title: Optional[str] = None
    cover_image: Optional[str] = None
    style: Optional[str] = None
    description: Optional[str] = None
    marketing_tags: Optional[List[str]] = None
    share_title: Optional[str] = None
    share_image: Optional[str] = None
    consultant_id: Optional[str] = None
    
    # 状态更新
    sort_order: Optional[int] = None
    is_published: Optional[bool] = None

class MiniProjectResponse(MiniProjectBase):
    """小程序项目响应"""
    id: str
    project_id: Optional[str]
    
    # 物理数据 (只读)
    address: Optional[str]
    area: Optional[float]
    price: Optional[float]
    layout: Optional[str]
    orientation: Optional[str]
    floor_info: Optional[str]
    
    view_count: int
    sort_order: int
    is_published: bool
    published_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    consultant: Optional[ConsultantResponse] = None

    model_config = ConfigDict(from_attributes=True)

class MiniProjectListResponse(BaseModel):
    """项目列表响应"""
    items: List[MiniProjectResponse]
    total: int


# --- C-side & Interaction ---

class RenovationStageInfo(BaseModel):
    """改造阶段详情"""
    stage: str
    title: str
    completed: bool
    completed_at: Optional[datetime]
    description: str
    images: List[str]

class MiniRenovationResponse(BaseModel):
    """改造进度响应"""
    project_id: str
    stages: List[RenovationStageInfo]
    progress: int

class ConsultationRequest(BaseModel):
    """咨询请求"""
    project_id: str
    consultant_id: str
    user_name: str
    user_phone: str
    message: Optional[str] = None

class ConsultationResponse(BaseModel):
    """咨询响应"""
    success: bool
    message: str
