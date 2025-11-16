"""
FastAPI 应用入口
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from settings import settings
from db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期管理
    在应用启动时初始化数据库
    """
    # 启动时执行
    print("🚀 正在启动 Profo 房产数据中心...")
    init_db()
    print(f"✅ 应用启动成功: {settings.app_name} v{settings.app_version}")
    
    yield
    
    # 关闭时执行
    print("👋 应用正在关闭...")


# 创建 FastAPI 应用实例
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="轻量级、本地化、高性能的房产数据仓库系统",
    lifespan=lifespan,
)


# 配置 CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== 根路由 ====================
@app.get("/")
async def root():
    """根路径 - 健康检查"""
    return {
        "app": settings.app_name,
        "version": settings.app_version,
        "status": "running",
        "message": "欢迎使用 Profo 房产数据中心 API"
    }


@app.get("/health")
async def health_check():
    """健康检查端点"""
    return {
        "status": "healthy",
        "database": "connected"
    }


# ==================== 路由注册 ====================
from routers import upload, push, properties, admin

app.include_router(upload.router, prefix=f"{settings.api_prefix}/upload", tags=["upload"])
app.include_router(push.router, prefix=f"{settings.api_prefix}/push", tags=["push"])
app.include_router(properties.router, prefix=f"{settings.api_prefix}/properties", tags=["properties"])
app.include_router(admin.router, prefix=f"{settings.api_prefix}/admin", tags=["admin"])


# ==================== 全局异常处理 ====================
from fastapi.exceptions import RequestValidationError, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from exceptions import ProfoException
from error_handlers import (
    profo_exception_handler,
    validation_exception_handler,
    sqlalchemy_exception_handler,
    http_exception_handler,
    general_exception_handler
)

# 注册异常处理器
app.add_exception_handler(ProfoException, profo_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(SQLAlchemyError, sqlalchemy_exception_handler)
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)


# ==================== 启动命令 ====================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug
    )