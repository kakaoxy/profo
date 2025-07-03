"""
Profo Backend - 房源信息管理后台API服务
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.api import api_router
from app.core.config import settings
from app.core.database import create_db_and_tables

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理器"""
    # 启动时创建数据库表
    create_db_and_tables()
    yield

# 创建FastAPI应用实例（包含生命周期配置）
app = FastAPI(
    title=settings.PROJECT_NAME,
    description="房源信息管理后台API服务",
    version="1.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# 配置CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 在生产环境中应该设置具体的域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 包含API路由
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
async def root():
    """根路径"""
    return {
        "message": "欢迎使用Profo Backend API",
        "version": "1.0.0",
        "docs_url": "/docs",
        "api_v1": settings.API_V1_STR
    }

@app.get("/health")
async def health_check():
    """健康检查端点"""
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    )
