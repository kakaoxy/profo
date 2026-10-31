"""商户通知任务 Schemas（V09）."""

from datetime import datetime

from pydantic import BaseModel, Field


class MerchantNotifyTypeStats(BaseModel):
    """单类通知任务的扫描/生成统计."""

    scanned: int = Field(default=0, description="扫描到的候选数")
    created: int = Field(default=0, description="新建通知数")
    deduped: int = Field(default=0, description="dedupe_key 命中跳过数")
    skipped: int = Field(default=0, description="业务条件不满足跳过数")
    failed: int = Field(default=0, description="单条失败数（不中断整批）")
    errors: list[str] = Field(default_factory=list, description="失败明细（脱敏，最多 20 条）")


class MerchantNotifyRunResponse(BaseModel):
    """一次商户通知任务执行结果."""

    run_date: str = Field(description="任务日期（Asia/Shanghai，YYYY-MM-DD）")
    started_at: datetime
    finished_at: datetime
    duration_ms: int
    locked: bool = Field(default=False, description="是否因并发锁未执行")
    agreements: MerchantNotifyTypeStats
    visits: MerchantNotifyTypeStats


class MerchantNotifyRunRecord(BaseModel):
    """历史任务执行记录（operation_logs 读取）."""

    id: str
    created_at: datetime
    stats: MerchantNotifyRunResponse | None = None


__all__ = [
    "MerchantNotifyRunRecord",
    "MerchantNotifyRunResponse",
    "MerchantNotifyTypeStats",
]
