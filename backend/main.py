"""FastAPI 应用入口."""

import logging
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException

from db import engine, init_db
from error_handlers import (
    general_exception_handler,
    http_exception_handler,
    rate_limit_handler,
    service_exception_handler,
    sqlalchemy_exception_handler,
    validation_exception_handler,
)
from routers.common import files_router, push_router, upload_router
from routers.finance import ledger_router
from routers.investment import investment_router
from routers.leads import leads_router
from routers.market import communities_router, properties_router
from routers.marketing import import_router as marketing_import_router
from routers.marketing import projects_router as marketing_projects_router
from routers.monitor import monitor_router
from routers.projects import core_router
from routers.projects.cashflow import router as cashflow_router
from routers.public import (
    public_auth_router,
    public_communities_router,
    public_files_router,
    public_leads_router,
    public_projects_router,
    public_users_router,
)
from routers.system import (
    auth_router,
    operation_logs_router,
    permissions_router,
    roles_router,
    users_router,
)
from services.system.exceptions import ServiceException
from settings import settings
from utils.common import limiter

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:  # noqa: ARG001
    """应用生命周期管理.

    在应用启动时初始化数据库和验证配置.
    """
    logger.info("Starting Profo Real Estate Data Center...")

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
        {"name": "documents", "description": "文书签收管理"},
        {"name": "renovation", "description": "装修阶段管理"},
        {"name": "sales", "description": "销售记录管理"},
        {"name": "properties", "description": "市场情报 - 房源查询与导出"},
        {"name": "communities", "description": "市场情报 - 小区管理与合并"},
        {"name": "leads", "description": "线索管理 - 卖房估价"},
        {"name": "lead-followups", "description": "线索跟进记录"},
        {"name": "lead-prices", "description": "线索价格历史"},
        {"name": "l4-marketing", "description": "L4 市场营销 - 营销房源管理"},
        {"name": "l4-marketing-import", "description": "L4 市场营销 - 数据导入"},
        {"name": "investment", "description": "财务管理 - 跟投管理"},
        {"name": "finance-ledger", "description": "财务管理 - 资金账本"},
        {"name": "auth", "description": "认证授权 - 登录、令牌、API Key"},
        {"name": "users", "description": "用户管理"},
        {"name": "roles", "description": "角色管理"},
        {"name": "permissions", "description": "权限管理"},
        {"name": "operation-logs", "description": "操作审计日志"},
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
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    openapi_url="/openapi.json" if settings.debug else None,
)


upload_dir_abs = Path(settings.upload_dir).resolve()
upload_dir_abs.mkdir(parents=True, exist_ok=True)
# 始终从代码目录挂载 static，uploads 子目录通过软链指向持久化目录（生产）或直接存在（开发）
# 生产环境 bind mount（非符号链接）不需要 follow_symlink；开发环境 soft link 需要
static_root = Path(__file__).resolve().parent / "static"
app.mount("/static", StaticFiles(directory=str(static_root), follow_symlink=settings.debug), name="static")


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key", "X-Request-ID", "X-Requested-With"],
)
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


@app.middleware("http")
async def csrf_protect(request: Request, call_next):  # noqa: ANN001, ANN201
    """CSRF 防护：纯 Cookie 认证的非安全方法请求必须携带 X-Requested-With 头。

    Server Actions / API Key 请求使用 Authorization / X-API-Key 头认证，
    不依赖 Cookie，不受此中间件影响。浏览器跨站表单无法设置自定义头，
    因此 X-Requested-With 可有效区分 legitimate 请求与 CSRF 攻击。
    """  # noqa: D400, D415
    safe_methods = {"GET", "HEAD", "OPTIONS"}
    if request.method in safe_methods:
        return await call_next(request)

    has_cookie = request.cookies.get("access_token") or request.cookies.get("c_access_token")
    has_auth_header = request.headers.get("authorization")
    has_api_key = request.headers.get("X-API-Key")

    # 仅当依赖 Cookie 认证（无 Authorization / X-API-Key 头）时校验
    if has_cookie and not has_auth_header and not has_api_key and not request.headers.get("X-Requested-With"):
        return JSONResponse(
            status_code=403,
            content={"code": 403, "message": "缺少 CSRF 防护头"},
        )
    return await call_next(request)


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
@limiter.exempt
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
app.include_router(cashflow_router, prefix=API_V1_PREFIX)
app.include_router(marketing_projects_router, prefix=API_V1_PREFIX)
app.include_router(marketing_import_router, prefix=API_V1_PREFIX)
app.include_router(investment_router, prefix=API_V1_PREFIX)
app.include_router(ledger_router, prefix=API_V1_PREFIX)
app.include_router(auth_router, prefix=API_V1_PREFIX)
app.include_router(users_router, prefix=API_V1_PREFIX)
app.include_router(roles_router, prefix=API_V1_PREFIX)
app.include_router(permissions_router, prefix=API_V1_PREFIX)
app.include_router(operation_logs_router, prefix=API_V1_PREFIX)
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
app.add_exception_handler(RateLimitExceeded, rate_limit_handler)
app.add_exception_handler(Exception, general_exception_handler)


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
