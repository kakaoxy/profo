"""
数据库连接和会话管理
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from typing import Generator
from settings import settings


# 创建数据库引擎（优化版本）
# 对于 SQLite，使用 StaticPool 以支持多线程访问
# 添加性能优化配置
engine = create_engine(
    settings.database_url,
    echo=settings.database_echo,
    connect_args={
        "check_same_thread": False,  # SQLite 特定配置
        # SQLite 性能优化参数
        "timeout": 30,  # 增加超时时间到30秒
        "isolation_level": None,  # 使用自动提交模式以提高并发性能
    },
    poolclass=StaticPool,  # 使用静态连接池
    # 连接池优化配置
    pool_pre_ping=True,  # 在使用连接前检查连接是否有效
    pool_recycle=3600,  # 每小时回收连接，防止连接过期
    # 查询优化
    execution_options={
        "compiled_cache": {},  # 启用编译缓存以提高查询性能
    }
)

# 创建会话工厂
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


def get_db() -> Generator[Session, None, None]:
    """
    获取数据库会话的依赖注入函数
    
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
    finally:
        db.close()


def init_db():
    """
    初始化数据库 - 创建所有表
    
    注意: 这个函数应该在应用启动时调用一次
    """
    from models import Base
    Base.metadata.create_all(bind=engine)
    print("Database tables created successfully")


def drop_all_tables():
    """
    删除所有表 (谨慎使用!)
    
    仅用于开发和测试环境
    """
    from models import Base
    Base.metadata.drop_all(bind=engine)
    print("⚠️  所有表已删除")


def reset_db():
    """
    重置数据库 - 删除所有表并重新创建
    
    仅用于开发和测试环境
    """
    drop_all_tables()
    init_db()
    print("🔄 数据库已重置")
