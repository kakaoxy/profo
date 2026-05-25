"""失败记录处理模块.

负责保存失败记录和生成失败记录 CSV 文件.
"""

import csv
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from services.system import save_failed_record

logger = logging.getLogger(__name__)


class FailedRecordHandler:
    """失败记录处理器."""

    def __init__(self, upload_dir: str) -> None:
        """初始化处理器."""
        self.upload_dir = upload_dir

    def save_failed_record_sync(self, row: dict, error: str, _task_id: str) -> None:
        """同步保存失败记录到数据库."""
        try:
            save_failed_record(
                data=row,
                error_message=error,
                failure_type="csv_validation_error",
                data_source=row.get("数据源"),
            )
        except Exception:  # noqa: BLE001
            logger.warning("保存失败记录时出错: %s", error)

    def generate_failed_csv(
        self,
        failed_records: list[dict[str, Any]],
        original_headers: list[str],
        task_id: str,
    ) -> str | None:
        """生成失败记录 CSV 文件.

        Args:
            failed_records: 失败记录列表
            original_headers: 原始 CSV 表头
            task_id: 任务ID

        Returns:
            失败文件下载 URL，如果没有失败记录则返回 None

        """
        if not failed_records:
            return None

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"failed_records_{task_id}_{timestamp}.csv"
        filepath = Path(self.upload_dir) / filename

        fieldnames = self._build_fieldnames(failed_records, original_headers)

        try:
            self._write_csv_file(filepath, fieldnames, failed_records)
        except Exception:
            logger.exception("生成失败记录文件失败")
            return None
        else:
            return f"/api/v1/upload/download/{filename}"

    def _build_fieldnames(
        self,
        failed_records: list[dict[str, Any]],
        original_headers: list[str],
    ) -> list[str]:
        """构建 CSV 字段名列表."""
        all_keys: set = set()
        for rec in failed_records:
            all_keys.update(rec["data"].keys())
        all_keys.discard(None)

        if original_headers:
            data_keys = [h for h in original_headers if h in all_keys]
        else:
            data_keys = sorted([k for k in all_keys if k is not None])

        return ["行号", "错误原因", *data_keys]

    def _write_csv_file(
        self,
        filepath: Path,
        fieldnames: list[str],
        failed_records: list[dict[str, Any]],
    ) -> None:
        """写入 CSV 文件."""
        with filepath.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            for record in failed_records:
                out_row = {
                    "行号": record["row_number"],
                    "错误原因": record["error"],
                }
                for key in fieldnames[2:]:
                    out_row[key] = record["data"].get(key, "")
                writer.writerow(out_row)

        logger.info("失败记录文件已生成: %s", filepath)
