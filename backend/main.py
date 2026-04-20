"""
FastAPI 应用入口
"""
import sys
import os
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.exceptions import HTTPException
from contextlib import asynccontextmanager
from settings import settings
from db import init_db
from common import limiter

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)


# ==================== 路由注册 ====================
# 按业务模块组织的路由导入
from routers.market import properties_router, communities_router
from routers.leads import leads_router
from routers.projects import core_router, renovation_router, sales_router, cashflow_router as project_cashflow_router
from routers.marketing import projects_router as marketing_projects_router, import_router as marketing_import_router
from routers.system import auth_router, users_router, roles_router
from routers.common import files_router, upload_router, push_router
from routers.monitor import monitor_router, community_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期管理
    在应用启动时初始化数据库和验证配置
    """
    # 启动时执行
    print("Starting Profo Real Estate Data Center...")
    
    # 初始化速率限制器
    app.state.limiter = limiter
    print("速率限制器已初始化")
    
    # 验证JWT配置
    try:
        from utils.jwt_validator import check_jwt_configuration
        check_jwt_configuration()
        print("JWT配置验证通过")
    except SystemExit:
        # JWT配置验证失败，应用无法启动
        print("JWT配置验证失败，应用无法启动", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"JWT配置验证失败: {e}", file=sys.stderr)
        sys.exit(1)
    
    # 初始化数据库
    init_db()
    print(f"Application started successfully: {settings.app_name} v{settings.app_version}")

    yield

    # 关闭时执行
    print("Application is shutting down...")


# 创建 FastAPI 应用实例
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="轻量级、本地化、高性能的房产数据仓库系统",
    lifespan=lifespan,
)



# 挂载静态文件目录
if not os.path.exists("static"):
    os.makedirs("static")
app.mount("/static", StaticFiles(directory="static"), name="static")


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
        "message": "Welcome to Profo Real Estate Data Center API"
    }


@app.get("/health")
async def health_check():
    """健康检查端点"""
    return {
        "status": "healthy",
        "database": "connected"
    }



# 统一使用 /api/v1 前缀，确保 OpenAPI 类型生成一致
API_V1_PREFIX = f"{settings.api_prefix}/v1"

# ==================== 市场情报模块 (Market) ====================
app.include_router(properties_router, prefix=f"{API_V1_PREFIX}/properties", tags=["properties"])
app.include_router(communities_router, prefix=f"{API_V1_PREFIX}", tags=["communities"])

# ==================== 线索管理模块 (Leads) ====================
app.include_router(leads_router, prefix=f"{API_V1_PREFIX}", tags=["leads"])

# ==================== 项目管理模块 (Projects) ====================
app.include_router(core_router, prefix=f"{API_V1_PREFIX}", tags=["projects"])
app.include_router(project_cashflow_router, prefix=f"{API_V1_PREFIX}", tags=["cashflow"])

# ==================== 市场营销模块 (Marketing) ====================
app.include_router(marketing_projects_router, prefix=f"{API_V1_PREFIX}", tags=["l4-marketing"])
app.include_router(marketing_import_router, prefix=f"{API_V1_PREFIX}", tags=["l4-marketing-import"])

# ==================== 系统管理模块 (System) ====================
app.include_router(auth_router, prefix=f"{API_V1_PREFIX}/auth", tags=["auth"])
app.include_router(users_router, prefix=f"{API_V1_PREFIX}", tags=["users"])
app.include_router(roles_router, prefix=f"{API_V1_PREFIX}", tags=["roles"])

# ==================== 通用功能模块 (Common) ====================
app.include_router(upload_router, prefix=f"{API_V1_PREFIX}/upload", tags=["upload"])
app.include_router(push_router, prefix=f"{API_V1_PREFIX}/push", tags=["push"])
app.include_router(files_router, prefix=f"{API_V1_PREFIX}/files", tags=["files"])

# ==================== 监控模块 (Monitor) ====================
app.include_router(monitor_router, prefix=f"{API_V1_PREFIX}", tags=["monitor"])
app.include_router(community_router, prefix=f"{API_V1_PREFIX}", tags=["communities"])


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
from slowapi.errors import RateLimitExceeded

# 注册异常处理器
app.add_exception_handler(ProfoException, profo_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(SQLAlchemyError, sqlalchemy_exception_handler)
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)


# ==================== 速率限制响应 ====================
@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    """处理速率限制异常"""
    return JSONResponse(
        status_code=429,
        content={
            "detail": f"请求过于频繁，请稍后重试"
        },
        headers={"Retry-After": str(exc.retry_after)}
    )


# ==================== 启动命令 ====================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug
    )