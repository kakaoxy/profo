"""CSV 导出工具.

提供通用的 CSV 生成与流响应封装，供 Router 层调用.
"""

import csv
import io
import logging
from collections.abc import Sequence
from datetime import datetime, timezone

from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)


def generate_csv_response(
    headers: Sequence[str],
    rows: Sequence[Sequence[object]],
    filename_prefix: str,
) -> StreamingResponse:
    """生成 CSV 文件流响应.

    Args:
        headers: CSV 表头列表
        rows: 数据行列表，每行为字段值序列
        filename_prefix: 文件名前缀，如 "properties_export"

    Returns:
        StreamingResponse: UTF-8-SIG 编码的 CSV 流响应

    """
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)

    csv_content = output.getvalue()
    output.close()

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"{filename_prefix}_{timestamp}.csv"

    logger.info("导出完成: %s 条记录, 文件名: %s", len(rows), filename)

    return StreamingResponse(
        iter([csv_content.encode("utf-8-sig")]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Type": "text/csv; charset=utf-8",
        },
    )
