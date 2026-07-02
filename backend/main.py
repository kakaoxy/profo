"""FastAPI 应用入口."""

import logging
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException, RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from sqlalchemy.exc import SQLAlchemyError

from utils.common import limiter
from db import engine, init_db
from error_handlers import (
    general_exception_handler,
    http_exception_handler,
    service_exception_handler,
    sqlalchemy_exception_handler,
    validation_exception_handler,
)
from routers.common import files_router, push_router, upload_router
from routers.leads import leads_router
from routers.market import communities_router, properties_router
from routers.marketing import import_router as marketing_import_router
from routers.marketing import projects_router as marketing_projects_router
from routers.monitor import monitor_router
from routers.projects import core_router
from routers.public import (
    public_auth_router,
    public_communities_router,
    public_files_router,
    public_leads_router,
    public_projects_router,
    public_users_router,
)
from routers.system import auth_router, roles_router, users_router
from services.system.exceptions import ServiceException
from settings import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """应用生命周期管理.

    在应用启动时初始化数据库和验证配置.
    """
    logger.info("Starting Profo Real Estate Data Center...")

    app.state.limiter = limiter
    logger.info("速率限制器已初始化")

    try:
        from utils.jwt_validator import check_jwt_configuration  # noqa: PLC0415

        check_jwt_configuration()
        logger.info("JWT配置验证通过")
    except SystemExit:
        logger.exception("JWT配置验证失败，应用无法启动")
        sys.exit(1)
    except Exception:
        logger.exception("JWT配置验证失败")
        sys.exit(1)

    init_db()

    # 执行启动时数据迁移（新增列、加密已存明文手机号等），幂等
    from migrations import run_startup_migrations  # noqa: PLC0415

    run_startup_migrations(engine)

    logger.info("Application started successfully: %s v%s", settings.app_name, settings.app_version)

    yield

    logger.info("Application is shutting down...")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="轻量级、本地化、高性能的房产数据仓库系统",
    lifespan=lifespan,
    openapi_tags=[
        {"name": "projects", "description": "项目管理 - 签约、装修、销售全流程"},
        {"name": "cashflow", "description": "现金流管理"},
        {"name": "renovation", "description": "装修阶段管理"},
        {"name": "sales", "description": "销售记录管理"},
        {"name": "properties", "description": "市场情报 - 房源查询与导出"},
        {"name": "communities", "description": "市场情报 - 小区管理与合并"},
        {"name": "leads", "description": "线索管理 - 卖房估价"},
        {"name": "lead-followups", "description": "线索跟进记录"},
        {"name": "lead-prices", "description": "线索价格历史"},
        {"name": "l4-marketing", "description": "L4 市场营销 - 营销房源管理"},
        {"name": "l4-marketing-import", "description": "L4 市场营销 - 数据导入"},
        {"name": "auth", "description": "认证授权 - 登录、令牌、API Key"},
        {"name": "users", "description": "用户管理"},
        {"name": "roles", "description": "角色管理"},
        {"name": "upload", "description": "文件上传与导入任务"},
        {"name": "push", "description": "JSON 数据推送"},
        {"name": "files", "description": "文件管理"},
        {"name": "monitor", "description": "市场监控与竞品分析"},
        {"name": "public-auth", "description": "C端公开 - 认证"},
        {"name": "public-users", "description": "C端公开 - 用户资料"},
        {"name": "public-projects", "description": "C端公开 - 房源展示"},
        {"name": "public-leads", "description": "C端公开 - 卖房估价"},
        {"name": "public-communities", "description": "C端公开 - 小区搜索"},
        {"name": "public-files", "description": "C端公开 - 文件上传"},
    ],
    contact={
        "name": "ProFo Team",
    },
)


upload_dir_abs = Path(settings.upload_dir).resolve()
upload_dir_abs.mkdir(parents=True, exist_ok=True)
# 始终从代码目录挂载 static，uploads 子目录通过软链指向持久化目录（生产）或直接存在（开发）
static_root = Path(__file__).resolve().parent / "static"
app.mount("/static", StaticFiles(directory=str(static_root), follow_symlink=True), name="static")


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root() -> dict[str, str]:
    """根路径 - 健康检查."""
    return {
        "app": settings.app_name,
        "version": settings.app_version,
        "status": "running",
        "message": "Welcome to Profo Real Estate Data Center API",
    }


@app.get("/health")
async def health_check() -> dict[str, str]:
    """健康检查端点."""
    return {
        "status": "healthy",
        "database": "connected",
    }


API_V1_PREFIX = f"{settings.api_prefix}/v1"

app.include_router(properties_router, prefix=API_V1_PREFIX)
app.include_router(communities_router, prefix=API_V1_PREFIX)
app.include_router(leads_router, prefix=API_V1_PREFIX)
app.include_router(core_router, prefix=API_V1_PREFIX)
app.include_router(marketing_projects_router, prefix=API_V1_PREFIX)
app.include_router(marketing_import_router, prefix=API_V1_PREFIX)
app.include_router(auth_router, prefix=API_V1_PREFIX)
app.include_router(users_router, prefix=API_V1_PREFIX)
app.include_router(roles_router, prefix=API_V1_PREFIX)
app.include_router(upload_router, prefix=API_V1_PREFIX)
app.include_router(push_router, prefix=API_V1_PREFIX)
app.include_router(files_router, prefix=API_V1_PREFIX)
app.include_router(monitor_router, prefix=API_V1_PREFIX)
app.include_router(public_auth_router, prefix=API_V1_PREFIX)
app.include_router(public_users_router, prefix=API_V1_PREFIX)
app.include_router(public_projects_router, prefix=API_V1_PREFIX)
app.include_router(public_leads_router, prefix=API_V1_PREFIX)
app.include_router(public_files_router, prefix=API_V1_PREFIX)
app.include_router(public_communities_router, prefix=API_V1_PREFIX)

app.add_exception_handler(ServiceException, service_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(SQLAlchemyError, sqlalchemy_exception_handler)
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(_request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """处理速率限制异常."""
    return JSONResponse(
        status_code=429,
        content={
            "detail": "请求过于频繁，请稍后重试",
        },
        headers={"Retry-After": str(exc.retry_after)},
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",  # noqa: S104
        port=8000,
        reload=settings.debug,
        proxy_headers=True,
        forwarded_allow_ips="127.0.0.1",
    )
