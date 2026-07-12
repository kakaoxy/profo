"""数据库连接和会话管理."""

import logging
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import QueuePool

from settings import settings

logger = logging.getLogger(__name__)

# 创建数据库引擎（PostgreSQL）
# 使用 QueuePool 支持更好的并发访问

engine = create_engine(
    settings.database_url,
    echo=settings.database_echo,
    poolclass=QueuePool,  # 使用队列连接池支持并发
    pool_size=10,  # 连接池大小
    max_overflow=20,  # 最大溢出连接数
    pool_pre_ping=True,  # 在使用连接前检查连接是否有效
    pool_recycle=3600,  # 每小时回收连接，防止连接过期
    # 查询优化
    execution_options={
        "compiled_cache": {},  # 启用编译缓存以提高查询性能
    },
)

# 创建会话工厂
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def get_db() -> Generator[Session, None, None]:
    """获取数据库会话的依赖注入函数.

    用法:
        @app.get("/items")
        def read_items(db: Session = Depends(get_db)):
            return db.query(Item).all()

    Yields:
        Session: 数据库会话对象

    """
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db() -> None:
    """初始化数据库 - 创建所有表.

    注意: 这个函数应该在应用启动时调用一次
    """
    from models import Base  # noqa: PLC0415

    Base.metadata.create_all(bind=engine)

    logger.info("Database tables created successfully")


def drop_all_tables() -> None:
    """删除所有表 (谨慎使用!).

    仅用于开发和测试环境
    """
    from models import Base  # noqa: PLC0415

    Base.metadata.drop_all(bind=engine)
    logger.warning("⚠️  所有表已删除")


def reset_db() -> None:
    """重置数据库 - 删除所有表并重新创建.

    仅用于开发和测试环境
    """
    drop_all_tables()
    init_db()
    logger.info("🔄 数据库已重置")
