"""
数据库连接和会话管理
"""
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from typing import Generator
from settings import settings


# 创建数据库引擎（优化版本）
# 对于 SQLite，使用 StaticPool 以支持多线程访问
# 添加性能优化配置


def _enable_sqlite_fk(dbapi_conn, connection_record):
    """启用 SQLite 外键约束"""
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


engine = create_engine(
    settings.database_url,
    echo=settings.database_echo,
    connect_args={
        "check_same_thread": False,  # SQLite 特定配置
        # SQLite 性能优化参数
        "timeout": 30,  # 增加超时时间到30秒
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

# 监听连接事件，启用外键约束
event.listen(engine, "connect", _enable_sqlite_fk)

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

    # 注释掉不存在的migrations模块调用
    # from migrations.runtime import (
    #     ensure_project_snake_case_columns,
    #     ensure_project_physical_fields,
    #     ensure_projects_roi_numeric,
    #     ensure_leads_area_numeric,
    #     ensure_property_current_numeric_fields,
    #     ensure_leads_source_property_soft_ref,
    #     ensure_mini_projects_project_soft_ref,
    # )
    # ensure_project_snake_case_columns(engine)
    # ensure_project_physical_fields(engine)
    # ensure_projects_roi_numeric(engine)
    # ensure_leads_area_numeric(engine)
    # ensure_property_current_numeric_fields(engine)
    # ensure_leads_source_property_soft_ref(engine)
    # ensure_mini_projects_project_soft_ref(engine)

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
