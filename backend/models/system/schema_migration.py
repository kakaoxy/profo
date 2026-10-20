"""迁移版本账本与补偿审计模型（迭代一）。

两张表**不继承** ``BaseModel``：
- ``schema_migrations`` 以 ``version``（整数）为主键，无 UUID / updated_at 语义；
- ``migration_compensations`` 以 ``BIGSERIAL`` 为主键，为纯追加的审计流水。

建表方式豁免「必须登记为迁移」（总纲 C2 唯一豁免）：它们由
``migrations.runner.ensure_version_tables()`` 在执行器建表阶段用
``CREATE TABLE IF NOT EXISTS`` 创建——否则「版本表自己的版本」形成自举悖论。
理由已写入 ``docs/Base/migrations-runbook.md`` §0。
"""

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import Base


class SchemaMigration(Base):
    """迁移版本账本（每版本一行，主键为 version）."""

    __tablename__ = "schema_migrations"

    version: Mapped[int] = mapped_column(Integer, primary_key=True, comment="迁移版本号（1 起严格递增）")
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True, comment="迁移唯一名（登记后不可改）")
    checksum: Mapped[str] = mapped_column(String(64), nullable=False, comment="迁移函数源码归一化 sha256")
    kind: Mapped[str] = mapped_column(String(20), nullable=False, comment="schema / data / seed")
    risk: Mapped[str] = mapped_column(String(2), nullable=False, comment="风险等级 A/B/C/D")
    status: Mapped[str] = mapped_column(String(20), nullable=False, comment="applied / failed")
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        comment="开始时间（UTC，Python 侧写入）",
    )
    applied_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        comment="成功完成时间（仅 status=applied 写入）",
    )
    duration_ms: Mapped[int | None] = mapped_column(Integer, comment="耗时毫秒")
    app_version: Mapped[str | None] = mapped_column(String(32), comment="执行时的应用版本")
    worker: Mapped[str | None] = mapped_column(String(100), comment="hostname:pid（多 worker 追溯）")
    backup_path: Mapped[str | None] = mapped_column(Text, comment="迁移前备份文件绝对路径")
    backup_sha256: Mapped[str | None] = mapped_column(String(64), comment="备份文件 sha256")
    backup_scope: Mapped[str | None] = mapped_column(String(10), comment="none / table / full")
    backup_client: Mapped[str | None] = mapped_column(
        String(20),
        comment="产出该备份的 pg_dump 版本（恢复必须用同大版本客户端）",
    )
    error: Mapped[str | None] = mapped_column(Text, comment="失败堆栈（截断 4000 字符）")
    notes: Mapped[str | None] = mapped_column(Text, comment="备注")


class MigrationCompensation(Base):
    """补偿 / 恢复 / 重基线 / 重试 / 基线的审计流水（仅追加）."""

    __tablename__ = "migration_compensations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True, comment="自增主键")
    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        index=True,
        comment="逻辑外键 → schema_migrations.version（无 DB 外键，项目约定）",
    )
    action: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="compensate / restore / rebaseline / retry / baseline",
    )
    operator: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="操作者（os user@host:pid 或 MIGRATION_OPERATOR）",
    )
    dry_run: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, comment="是否演练（不执行 DML）")
    reason: Mapped[str | None] = mapped_column(Text, comment="操作原因")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, comment="开始时间")
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), comment="结束时间")
    duration_ms: Mapped[int | None] = mapped_column(Integer, comment="耗时毫秒")
    result: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="success / failed / dry_run / aborted",
    )
    affected_rows: Mapped[int | None] = mapped_column(Integer, comment="影响行数")
    notes: Mapped[str | None] = mapped_column(Text, comment="备注")
