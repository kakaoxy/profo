"""
CSV 批量导入服务
处理 CSV 文件的解析、验证 and 批量导入逻辑
"""
import csv
import io
import os
import logging
from datetime import datetime
from typing import List, Dict, Any

from fastapi import UploadFile
from sqlalchemy.orm import Session
from pydantic import ValidationError

from schemas import PropertyIngestionModel, UploadResult
from services.importer import PropertyImporter
from models import FailedRecord
from exceptions import FileProcessingException
from error_handlers import ErrorHandler

logger = logging.getLogger(__name__)

class CSVBatchImporter:
    """CSV 批量导入处理器"""

    def __init__(self):
        self.importer = PropertyImporter()

    def _decode_file_content(self, content: bytes) -> str:
        """
        解码文件内容，尝试多种编码格式
        """
        # 检测常见 BOM
        if content.startswith(b'\xef\xbb\xbf'):
            encodings = ['utf-8-sig', 'utf-8']
        elif content.startswith(b'\xff\xfe') or content.startswith(b'\xfe\xff'):
            encodings = ['utf-16']
        else:
            encodings = ['utf-8', 'gbk', 'gb2312', 'latin1']

        for encoding in encodings:
            try:
                decoded = content.decode(encoding)
                logger.info(f"文件解码成功，使用编码: {encoding}")
                return decoded
            except UnicodeDecodeError:
                continue

        # 最终 fallback
        logger.warning("所有编码尝试失败，使用 UTF-8 忽略错误模式")
        return content.decode('utf-8', errors='ignore')

    def _normalize_date_string(self, date_string: str) -> str:
        """从多种日期格式规范化为 ISO 格式 YYYY-MM-DD"""
        try:
            normalized = (
                date_string.replace('年', '-')
                .replace('月', '-')
                .replace('日', '')
                .replace('.', '-')
                .replace('/', '-')
                .strip()
            )
            parts = [p.strip() for p in normalized.split('-') if p.strip()]
            if len(parts) >= 3:
                year, month, day = parts[0], parts[1].zfill(2), parts[2].zfill(2)
                iso_str = f"{year}-{month}-{day}"
                datetime.fromisoformat(iso_str)
                return iso_str
            else:
                raise ValueError("日期部分不足")
        except Exception:
            try:
                from dateutil import parser as dateparser
                dt = dateparser.parse(date_string, fuzzy=True)
                return dt.strftime('%Y-%m-%d')
            except Exception:
                logger.warning(f"日期解析失败，保留原值: {date_string}")
                return date_string

    def parse_csv_file(self, file_content: str) -> tuple[List[Dict[str, Any]], List[str]]:
        """
        安全解析 CSV 内容，容忍字段缺失或格式异常
        返回解析后的行数据和原始字段顺序
        """
        try:
            f = io.StringIO(file_content)
            sample = f.read(1024)
            f.seek(0)

            # 自动检测分隔符（兼容非逗号分隔）
            sniffer = csv.Sniffer()
            delimiter = ','
            try:
                if sniffer.has_header(sample):
                    delimiter = sniffer.sniff(sample, delimiters=',;\t').delimiter
            except:
                pass  # fallback to comma

            reader = csv.reader(f, delimiter=delimiter)
            headers = next(reader, None)
            if not headers:
                raise FileProcessingException("CSV 文件无表头")

            # 清理 header 并保留原始顺序
            clean_headers = []
            for h in headers:
                key = (h or '').lstrip('\ufeff').strip()
                clean_headers.append(key)

            rows = []
            for line_num, raw_row in enumerate(reader, start=2):
                # 确保行长度与 header 一致
                padded_row = raw_row + [''] * (len(clean_headers) - len(raw_row))
                trimmed_row = padded_row[:len(clean_headers)]

                row_dict = {}
                for key, value in zip(clean_headers, trimmed_row):
                    if key == '':  # 跳过空列名
                        continue
                    val = value.strip() if isinstance(value, str) else value
                    row_dict[key] = None if val == '' else val

                # 规范化日期字段
                for date_key in ['上架时间', '成交时间']:
                    if date_key in row_dict and isinstance(row_dict[date_key], str):
                        row_dict[date_key] = self._normalize_date_string(row_dict[date_key])

                rows.append(row_dict)

            return rows, clean_headers

        except Exception as e:
            logger.error(f"CSV 解析失败: {e}", exc_info=True)
            raise FileProcessingException(
                message="CSV 文件格式无效或内容损坏",
                details={"error": str(e)}
            )

    def batch_import_csv(self, file: UploadFile, db: Session) -> UploadResult:
        total = 0
        success = 0
        failed = 0
        failed_records = []
        original_headers = []
        BATCH_SIZE = 100

        try:
            content = file.file.read()
            if not content:
                raise FileProcessingException("上传的 CSV 文件为空")

            file_content = self._decode_file_content(content)
            rows, original_headers = self.parse_csv_file(file_content)
            total = len(rows)

            logger.info(f"开始处理 CSV 文件，共 {total} 条记录")

            for batch_start in range(0, total, BATCH_SIZE):
                batch_end = min(batch_start + BATCH_SIZE, total)
                batch_rows = rows[batch_start:batch_end]
                validated_batch = []

                for idx_in_batch, row in enumerate(batch_rows):
                    global_index = batch_start + idx_in_batch + 1  # 行号从1开始（含header）
                    try:
                        validated_data = PropertyIngestionModel(**row)
                        validated_batch.append((global_index, validated_data, row))
                    except ValidationError as e:
                        failed += 1
                        error_msg = self._format_validation_error(e)
                        failed_records.append({
                            'row_number': global_index,
                            'data': row,
                            'error': error_msg
                        })
                        self._save_failed_record(row, error_msg, db)
                        logger.warning(f"第 {global_index} 行验证失败: {error_msg}")
                    except Exception as e:
                        failed += 1
                        error_msg = f"数据验证异常: {str(e)}"
                        failed_records.append({
                            'row_number': global_index,
                            'data': row,
                            'error': error_msg
                        })
                        self._save_failed_record(row, error_msg, db)
                        logger.error(f"第 {global_index} 行验证异常: {error_msg}")

                # 导入验证通过的数据
                for global_index, validated_data, original_row in validated_batch:
                    try:
                        result = self.importer.import_property(validated_data, db)
                        if result.success:
                            success += 1
                        else:
                            failed += 1
                            failed_records.append({
                                'row_number': global_index,
                                'data': original_row,
                                'error': result.error
                            })
                            self._save_failed_record(original_row, result.error, db)
                    except Exception as e:
                        failed += 1
                        error_msg = f"导入异常: {str(e)}"
                        failed_records.append({
                            'row_number': global_index,
                            'data': original_row,
                            'error': error_msg
                        })
                        self._save_failed_record(original_row, error_msg, db)
                        logger.error(f"第 {global_index} 行导入异常: {error_msg}")

                try:
                    db.commit()
                except Exception as e:
                    db.rollback()
                    logger.error(f"数据库提交失败: {e}")

            failed_file_url = self._generate_failed_csv(failed_records, original_headers) if failed_records else None

            logger.info(f"CSV 处理完成: 总数={total}, 成功={success}, 失败={failed}")
            return UploadResult(
                total=total,
                success=success,
                failed=failed,
                failed_file_url=failed_file_url
            )

        except Exception as e:
            logger.error(f"CSV 文件处理失败: {e}", exc_info=True)
            raise FileProcessingException(
                message=f"CSV 文件处理失败: {str(e)}",
                details={"filename": getattr(file, 'filename', 'unknown')}
            )

    def _format_validation_error(self, error: ValidationError) -> str:
        return ErrorHandler.format_validation_error(error)

    def _save_failed_record(self, row: dict, error: str, db: Session):
        # 注意：此处仍使用独立 session 避免事务冲突
        ErrorHandler.save_failed_record(
            data=row,
            error_message=error,
            failure_type='csv_validation_error',
            data_source=row.get('数据源')
        )

    def _generate_failed_csv(self, failed_records: List[dict], original_headers: List[str] = None) -> str:
        try:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"failed_records_{timestamp}.csv"
            temp_dir = os.path.join(os.getcwd(), 'temp')
            os.makedirs(temp_dir, exist_ok=True)
            filepath = os.path.join(temp_dir, filename)

            if not failed_records:
                return None

            # 确定字段顺序：优先使用原始字段顺序，如果没有则使用排序后的顺序
            if original_headers:
                # 使用原始字段顺序，但只包含在失败记录中出现的字段
                all_keys = set()
                for rec in failed_records:
                    all_keys.update(rec['data'].keys())
                
                # 按照原始顺序过滤字段
                data_keys = [h for h in original_headers if h in all_keys and h is not None]
            else:
                # 回退到排序后的顺序
                all_keys = set()
                for rec in failed_records:
                    all_keys.update(rec['data'].keys())
                all_keys.discard(None)
                data_keys = sorted([k for k in all_keys if k is not None])
            
            fieldnames = ['行号', '错误原因'] + data_keys

            with open(filepath, 'w', encoding='utf-8-sig', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
                writer.writeheader()
                for record in failed_records:
                    out_row = {'行号': record['row_number'], '错误原因': record['error']}
                    for k in data_keys:
                        out_row[k] = record['data'].get(k, '')
                    writer.writerow(out_row)

            return f"/api/upload/download/{filename}"

        except Exception as e:
            logger.error(f"生成失败 CSV 出错: {e}")
            return None
