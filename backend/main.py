"""
FastAPI 应用入口
"""
import sys
import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.exceptions import HTTPException, RequestValidationError
from sqlalchemy.exc import SQLAlchemyError
from slowapi.errors import RateLimitExceeded

from settings import settings
from db import init_db
from common import limiter
from routers.market import properties_router, communities_router
from routers.leads import leads_router
from routers.projects import core_router, cashflow_router as project_cashflow_router
from routers.marketing import projects_router as marketing_projects_router, import_router as marketing_import_router
from routers.system import auth_router, users_router, roles_router
from routers.common import files_router, upload_router, push_router
from routers.monitor import monitor_router
from routers.public import public_auth_router, public_users_router, public_projects_router, public_leads_router, public_communities_router
from services.system.exceptions import ServiceException
from error_handlers import (
    service_exception_handler,
    validation_exception_handler,
    sqlalchemy_exception_handler,
    http_exception_handler,
    general_exception_handler
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期管理
    在应用启动时初始化数据库和验证配置
    """
    logger.info("Starting Profo Real Estate Data Center...")

    app.state.limiter = limiter
    logger.info("速率限制器已初始化")

    try:
        from utils.jwt_validator import check_jwt_configuration
        check_jwt_configuration()
        logger.info("JWT配置验证通过")
    except SystemExit:
        logger.error("JWT配置验证失败，应用无法启动")
        sys.exit(1)
    except Exception as e:
        logger.error(f"JWT配置验证失败: {e}")
        sys.exit(1)

    init_db()
    logger.info(f"Application started successfully: {settings.app_name} v{settings.app_version}")

    yield

    logger.info("Application is shutting down...")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="轻量级、本地化、高性能的房产数据仓库系统",
    lifespan=lifespan,
)


if not os.path.exists("static"):
    os.makedirs("static")
app.mount("/static", StaticFiles(directory="static"), name="static")


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


API_V1_PREFIX = f"{settings.api_prefix}/v1"

app.include_router(properties_router, prefix=f"{API_V1_PREFIX}/properties", tags=["properties"])
app.include_router(communities_router, prefix=f"{API_V1_PREFIX}/admin", tags=["communities"])
app.include_router(leads_router, prefix=f"{API_V1_PREFIX}", tags=["leads"])
app.include_router(core_router, prefix=f"{API_V1_PREFIX}", tags=["projects"])
app.include_router(project_cashflow_router, prefix=f"{API_V1_PREFIX}", tags=["cashflow"])
app.include_router(marketing_projects_router, prefix=f"{API_V1_PREFIX}", tags=["l4-marketing"])
app.include_router(marketing_import_router, prefix=f"{API_V1_PREFIX}", tags=["l4-marketing-import"])
app.include_router(auth_router, prefix=API_V1_PREFIX, tags=["auth"])
app.include_router(users_router, prefix=API_V1_PREFIX, tags=["users"])
app.include_router(roles_router, prefix=API_V1_PREFIX, tags=["roles"])
app.include_router(upload_router, prefix=f"{API_V1_PREFIX}/upload", tags=["upload"])
app.include_router(push_router, prefix=f"{API_V1_PREFIX}/push", tags=["push"])
app.include_router(files_router, prefix=f"{API_V1_PREFIX}/files", tags=["files"])
app.include_router(monitor_router, prefix=f"{API_V1_PREFIX}", tags=["monitor"])
app.include_router(public_auth_router, prefix=API_V1_PREFIX)
app.include_router(public_users_router, prefix=API_V1_PREFIX)
app.include_router(public_projects_router, prefix=API_V1_PREFIX)
app.include_router(public_leads_router, prefix=API_V1_PREFIX)
app.include_router(public_communities_router, prefix=API_V1_PREFIX)

app.add_exception_handler(ServiceException, service_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(SQLAlchemyError, sqlalchemy_exception_handler)
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    """处理速率限制异常"""
    return JSONResponse(
        status_code=429,
        content={
            "detail": "请求过于频繁，请稍后重试"
        },
        headers={"Retry-After": str(exc.retry_after)}
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug
    )
