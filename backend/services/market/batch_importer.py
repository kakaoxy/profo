"""CSV 批量导入服务.

处理 CSV 文件的解析、验证 and 批量导入逻辑.
"""

import csv
import io
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dateutil import parser as dateparser
from fastapi import UploadFile
from pydantic import ValidationError
from sqlalchemy.orm import Session

from schemas import PropertyIngestionModel, UploadResult
from services.system import save_failed_record
from services.system.exceptions import FileProcessingError
from utils.error_formatters import format_validation_error

from .importer import PropertyImporter

logger = logging.getLogger(__name__)

_BATCH_SIZE = 100
_MIN_DATE_PARTS = 3


def _normalize_date(date_string: str) -> str:
    """从多种日期格式规范化为 ISO 格式 YYYY-MM-DD."""
    try:
        normalized = (
            date_string.replace("年", "-")
            .replace("月", "-")
            .replace("日", "")
            .replace(".", "-")
            .replace("/", "-")
            .strip()
        )
        parts = [p.strip() for p in normalized.split("-") if p.strip()]
        if len(parts) >= _MIN_DATE_PARTS:
            year, month, day = parts[0], parts[1].zfill(2), parts[2].zfill(2)
            iso_str = f"{year}-{month}-{day}"
            datetime.fromisoformat(iso_str)
            return iso_str
    except (ValueError, IndexError):
        logger.debug("日期解析失败，尝试 dateutil: %s", date_string)

    try:
        dt = dateparser.parse(date_string, fuzzy=True)
        return dt.strftime("%Y-%m-%d")
    except Exception:  # noqa: BLE001
        logger.warning("日期解析失败，保留原值: %s", date_string)
        return date_string


class CSVBatchImporter:
    """CSV 批量导入处理器."""

    def __init__(self) -> None:
        """初始化导入器."""
        self.importer = PropertyImporter()

    def _decode_file_content(self, content: bytes) -> str:
        """解码文件内容，尝试多种编码格式."""
        if content.startswith(b"\xef\xbb\xbf"):
            encodings = ["utf-8-sig", "utf-8"]
        elif content.startswith((b"\xff\xfe", b"\xfe\xff")):
            encodings = ["utf-16"]
        else:
            encodings = ["utf-8", "gbk", "gb2312", "latin1"]

        for encoding in encodings:
            try:
                decoded = content.decode(encoding)
            except UnicodeDecodeError:  # noqa: PERF203
                continue
            else:
                logger.info("文件解码成功，使用编码: %s", encoding)
                return decoded

        logger.warning("所有编码尝试失败，使用 UTF-8 忽略错误模式")
        return content.decode("utf-8", errors="ignore")

    def parse_csv_file(self, file_content: str) -> tuple[list[dict[str, Any]], list[str]]:  # noqa: C901
        """安全解析 CSV 内容，容忍字段缺失或格式异常.

        返回解析后的行数据和原始字段顺序.
        """
        try:
            f = io.StringIO(file_content)
            sample = f.read(1024)
            f.seek(0)

            sniffer = csv.Sniffer()
            delimiter = ","
            try:
                if sniffer.has_header(sample):
                    delimiter = sniffer.sniff(sample, delimiters=",;\t").delimiter
            except csv.Error:
                pass

            reader = csv.reader(f, delimiter=delimiter)
            headers = next(reader, None)
            if not headers:
                msg = "CSV 文件无表头"
                raise FileProcessingError(msg)  # noqa: TRY301

            clean_headers = []
            for h in headers:
                key = (h or "").lstrip("\ufeff").strip()
                clean_headers.append(key)

            rows = []
            for _line_num, raw_row in enumerate(reader, start=2):
                padded_row = raw_row + [""] * (len(clean_headers) - len(raw_row))
                trimmed_row = padded_row[: len(clean_headers)]

                row_dict = {}
                for key, value in zip(clean_headers, trimmed_row, strict=False):
                    if key == "":
                        continue
                    val = value.strip() if isinstance(value, str) else value
                    row_dict[key] = None if val == "" else val

                for date_key in ["上架时间", "成交时间"]:
                    if date_key in row_dict and isinstance(row_dict[date_key], str):
                        row_dict[date_key] = _normalize_date(row_dict[date_key])

                rows.append(row_dict)

        except Exception:
            logger.exception("CSV 解析失败")
            msg = "CSV 文件格式无效或内容损坏"
            raise FileProcessingError(msg) from None
        else:
            return rows, clean_headers

    def batch_import_csv(  # noqa: C901, PLR0912, PLR0915
        self,
        file: UploadFile,
        db: Session,
        user_id: str = "",
    ) -> UploadResult:
        """批量导入 CSV 文件."""
        total = 0
        success = 0
        failed = 0
        failed_records = []
        original_headers = []

        try:
            content = file.file.read()
            if not content:
                msg = "上传的 CSV 文件为空"
                raise FileProcessingError(msg)  # noqa: TRY301

            file_content = self._decode_file_content(content)
            rows, original_headers = self.parse_csv_file(file_content)
            total = len(rows)

            logger.info("开始处理 CSV 文件，共 %s 条记录", total)

            for batch_start in range(0, total, _BATCH_SIZE):
                batch_end = min(batch_start + _BATCH_SIZE, total)
                batch_rows = rows[batch_start:batch_end]
                validated_batch = []

                for idx_in_batch, row in enumerate(batch_rows):
                    global_index = batch_start + idx_in_batch + 1
                    try:
                        validated_data = PropertyIngestionModel(**row)
                        validated_batch.append((global_index, validated_data, row))
                    except ValidationError as e:
                        failed += 1
                        error_msg = self._format_validation_error(e)
                        failed_records.append(
                            {
                                "row_number": global_index,
                                "data": row,
                                "error": error_msg,
                            }
                        )
                        self._save_failed_record(row, error_msg, db)
                        logger.warning("第 %s 行验证失败: %s", global_index, error_msg)
                    except Exception as e:
                        failed += 1
                        error_msg = f"数据验证异常: {e!s}"
                        failed_records.append(
                            {
                                "row_number": global_index,
                                "data": row,
                                "error": error_msg,
                            }
                        )
                        self._save_failed_record(row, error_msg, db)
                        logger.exception("第 %s 行验证异常: %s", global_index, error_msg)

                batch_success_count = 0
                batch_failed_count = 0
                batch_failed_records = []

                try:
                    for global_index, validated_data, original_row in validated_batch:
                        try:
                            effective_user_id = user_id or "system"
                            result = self.importer.import_property(validated_data, db, effective_user_id)
                            if result.success:
                                batch_success_count += 1
                            else:
                                batch_failed_count += 1
                                batch_failed_records.append(
                                    {
                                        "row_number": global_index,
                                        "data": original_row,
                                        "error": result.error,
                                    }
                                )
                        except Exception as e:  # noqa: PERF203
                            batch_failed_count += 1
                            error_msg = f"导入异常: {e!s}"
                            batch_failed_records.append(
                                {
                                    "row_number": global_index,
                                    "data": original_row,
                                    "error": error_msg,
                                }
                            )
                            logger.exception("第 %s 行导入异常: %s", global_index, error_msg)

                    db.commit()
                    logger.info(
                        "批次 %s-%s 提交成功: 成功=%s, 失败=%s",
                        batch_start,
                        batch_end,
                        batch_success_count,
                        batch_failed_count,
                    )

                    success += batch_success_count
                    failed += batch_failed_count
                    for failed_record in batch_failed_records:
                        failed_records.append(failed_record)
                        self._save_failed_record(failed_record["data"], failed_record["error"], db)

                except Exception as e:
                    db.rollback()
                    logger.exception("批次 %s-%s 处理失败，已回滚", batch_start, batch_end)

                    failed += batch_success_count + batch_failed_count
                    success = max(0, success - batch_success_count)

                    for _global_index, _validated_data, original_row in validated_batch:
                        error_msg = f"批次处理失败: {e!s}"
                        failed_records.append(
                            {
                                "row_number": _global_index,
                                "data": original_row,
                                "error": error_msg,
                            }
                        )
                        try:
                            self._save_failed_record(original_row, error_msg, db)
                        except Exception:  # noqa: BLE001
                            logger.warning("保存失败记录时出错: %s", error_msg)

            failed_file_url = None
            if failed_records:
                try:
                    failed_file_url = self._generate_failed_csv(failed_records, original_headers)
                    logger.info("失败记录文件已生成: %s", failed_file_url)
                except Exception:
                    logger.exception("生成失败记录文件失败")

            logger.info("CSV 处理完成: 总数=%s, 成功=%s, 失败=%s", total, success, failed)
            return UploadResult(
                total=total,
                success=success,
                failed=failed,
                failed_file_url=failed_file_url,
            )

        except FileProcessingError:
            raise
        except Exception:
            logger.exception("CSV 文件处理失败")
            failed_file_url = None
            if failed_records:
                try:
                    failed_file_url = self._generate_failed_csv(failed_records, original_headers)
                    logger.info("全局异常后，失败记录文件已生成: %s", failed_file_url)
                except Exception:
                    logger.exception("全局异常后，生成失败记录文件失败")

            return UploadResult(
                total=total,
                success=success,
                failed=failed,
                failed_file_url=failed_file_url,
            )

    def _format_validation_error(self, error: ValidationError) -> str:
        return format_validation_error(error)

    def _save_failed_record(self, row: dict, error: str, _db: Session) -> None:
        save_failed_record(
            data=row,
            error_message=error,
            failure_type="csv_validation_error",
            data_source=row.get("数据源"),
        )

    def _generate_failed_csv(self, failed_records: list[dict], original_headers: list[str] | None = None) -> str | None:
        try:
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            filename = f"failed_records_{timestamp}.csv"
            temp_dir = Path.cwd() / "temp"
            temp_dir.mkdir(parents=True, exist_ok=True)
            filepath = temp_dir / filename

            if not failed_records:
                return None

            if original_headers:
                all_keys = set()
                for rec in failed_records:
                    all_keys.update(rec["data"].keys())

                data_keys = [h for h in original_headers if h in all_keys and h is not None]
            else:
                all_keys = set()
                for rec in failed_records:
                    all_keys.update(rec["data"].keys())
                all_keys.discard(None)
                data_keys = sorted([k for k in all_keys if k is not None])

            fieldnames = ["行号", "错误原因", *data_keys]

            with filepath.open("w", encoding="utf-8-sig", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
                writer.writeheader()
                for record in failed_records:
                    out_row = {"行号": record["row_number"], "错误原因": record["error"]}
                    for k in data_keys:
                        out_row[k] = record["data"].get(k, "")
                    writer.writerow(out_row)

            return f"/api/v1/upload/download/{filename}"  # noqa: TRY300

        except Exception:
            logger.exception("生成失败 CSV 出错")
            return None
