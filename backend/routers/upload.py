"""
CSV 文件上传路由
处理 CSV 文件的上传、解析和批量导入
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
import csv
import io
import os
import tempfile
from datetime import datetime
from pydantic import ValidationError
import logging

from db import get_db
from schemas import PropertyIngestionModel, UploadResult
from services.importer import PropertyImporter
from models import FailedRecord
from exceptions import DateFormatException, DateParsingException, DateProcessingException, FileProcessingException
from error_handlers import ErrorHandler


logger = logging.getLogger(__name__)

router = APIRouter()


class CSVBatchImporter:
    """CSV 批量导入处理器"""
    
    def __init__(self):
        self.importer = PropertyImporter()
    
    def parse_csv_file(self, file_content: str) -> List[dict]:
        """
        解析 CSV 文件内容
        
        Args:
            file_content: CSV 文件内容字符串
        
        Returns:
            List[dict]: 解析后的数据行列表
        """
        csv_reader = csv.DictReader(io.StringIO(file_content))
        rows = []
        for row in csv_reader:
            cleaned_row = {}
            for raw_key, raw_value in row.items():
                # 清理键名（移除 BOM/空白）
                key = (raw_key or '')
                if key.startswith('\ufeff'):
                    key = key.lstrip('\ufeff')
                key = key.strip()

                # 将空字符串转换为 None，并去除值首尾空格
                if raw_value is None:
                    value = None
                else:
                    value = raw_value.strip() if isinstance(raw_value, str) else raw_value
                    if value == '':
                        value = None

                cleaned_row[key] = value

            # 规范化日期字段
            for date_key in ['上架时间', '成交时间']:
                date_value = cleaned_row.get(date_key)
                if isinstance(date_value, str) and date_value:
                    normalized = self._normalize_date_string(date_value)
                    cleaned_row[date_key] = normalized

            rows.append(cleaned_row)
        return rows

    def _decode_file_content(self, content: bytes) -> str:
        """
        解码文件内容，尝试多种编码格式

        Args:
            content: 文件内容的字节数组

        Returns:
            str: 解码后的字符串

        Raises:
            FileProcessingException: 当所有编码尝试都失败时
        """
        encoding_attempts = ['utf-8-sig', 'utf-8', 'gbk']

        for encoding in encoding_attempts:
            try:
                return content.decode(encoding)
            except UnicodeDecodeError:
                continue

        # 所有编码尝试都失败，使用错误忽略模式
        logger.warning(f"文件编码检测失败，使用UTF-8错误忽略模式解码")
        try:
            return content.decode('utf-8', errors='ignore')
        except Exception as e:
            raise FileProcessingException(
                f"文件编码解码失败",
                details={"error": str(e), "encoding_attempts": encoding_attempts}
            )

    def _normalize_date_string(self, date_string: str) -> str:
        """将多种日期格式规范化为 ISO 格式 YYYY-MM-DD"""
        try:
            normalized_date = date_string.replace('年', '-').replace('月', '-').replace('日', '')
            normalized_date = normalized_date.replace('.', '-').replace('/', '-')
            normalized_date = normalized_date.strip()
            date_parts = normalized_date.split('-')
            if len(date_parts) >= 3:
                year = date_parts[0]
                month = date_parts[1].zfill(2)
                day = date_parts[2].zfill(2)
                normalized_date = f"{year}-{month}-{day}"
            dt = datetime.fromisoformat(normalized_date)
            return dt.strftime('%Y-%m-%d')
        except ValueError as e:
            # ISO格式解析失败，使用dateutil解析
            try:
                from dateutil import parser as dateparser
                dt = dateparser.parse(date_string)
                return dt.strftime('%Y-%m-%d')
            except ValueError:
                # 日期解析失败，返回原始字符串
                logger.warning(f"日期解析失败: {date_string}")
                return date_string
        except Exception as e:
            # 其他异常，记录日志并返回原始字符串
            logger.warning(f"日期规范化失败: {date_string}, 错误: {str(e)}")
            return date_string
    
    def batch_import_csv(self, file: UploadFile, db: Session) -> UploadResult:
        """
        批量导入 CSV 文件（优化版本，使用批量操作）
        
        流程:
        1. 解析 CSV 文件
        2. 批量验证数据
        3. 批量导入（减少数据库往返）
        4. 收集失败记录
        5. 生成失败记录 CSV
        
        Args:
            file: 上传的 CSV 文件
            db: 数据库会话
        
        Returns:
            UploadResult: 上传结果统计
        """
        total = 0
        success = 0
        failed = 0
        failed_records = []
        
        # Batch processing configuration
        BATCH_SIZE = 100  # Process 100 records at a time
        
        try:
            # 读取文件内容
            content = file.file.read()

            # 尝试不同的编码（优先 utf-8-sig 去除 BOM）
            file_content = self._decode_file_content(content)
            
            # 解析 CSV
            rows = self.parse_csv_file(file_content)
            total = len(rows)
            
            logger.info(f"开始处理 CSV 文件，共 {total} 条记录，批量大小: {BATCH_SIZE}")
            
            # 批量处理
            for batch_start in range(0, total, BATCH_SIZE):
                batch_end = min(batch_start + BATCH_SIZE, total)
                batch_rows = rows[batch_start:batch_end]
                
                logger.info(f"处理批次 {batch_start + 1}-{batch_end}/{total}")
                
                # 验证批次中的所有数据
                validated_batch = []
                for index, row in enumerate(batch_rows, start=batch_start + 1):
                    try:
                        # 验证数据
                        validated_data = PropertyIngestionModel(**row)
                        validated_batch.append((index, validated_data, row))
                    
                    except ValidationError as e:
                        failed += 1
                        error_msg = self._format_validation_error(e)
                        failed_records.append({
                            'row_number': index,
                            'data': row,
                            'error': error_msg
                        })
                        
                        # 记录到 failed_records 表
                        self._save_failed_record(row, error_msg, db)
                        
                        logger.warning(f"第 {index} 行验证失败: {error_msg}")
                    
                    except Exception as e:
                        failed += 1
                        error_msg = f"验证失败: {str(e)}"
                        failed_records.append({
                            'row_number': index,
                            'data': row,
                            'error': error_msg
                        })
                        
                        self._save_failed_record(row, error_msg, db)
                        logger.error(f"第 {index} 行验证失败: {error_msg}")
                
                # 批量导入验证通过的数据
                for index, validated_data, original_row in validated_batch:
                    try:
                        # 导入数据
                        result = self.importer.import_property(validated_data, db)
                        
                        if result.success:
                            success += 1
                        else:
                            failed += 1
                            failed_records.append({
                                'row_number': index,
                                'data': original_row,
                                'error': result.error
                            })
                            
                            # 记录到 failed_records 表
                            self._save_failed_record(original_row, result.error, db)
                    
                    except Exception as e:
                        failed += 1
                        error_msg = f"导入失败: {str(e)}"
                        failed_records.append({
                            'row_number': index,
                            'data': original_row,
                            'error': error_msg
                        })
                        
                        self._save_failed_record(original_row, error_msg, db)
                        logger.error(f"第 {index} 行导入失败: {error_msg}")
                
                # 每个批次后提交一次（减少事务开销）
                try:
                    db.commit()
                except Exception as e:
                    db.rollback()
                    logger.error(f"批次提交失败: {str(e)}")
            
            # 生成失败记录 CSV 文件
            failed_file_url = None
            if failed_records:
                failed_file_url = self._generate_failed_csv(failed_records)
            
            logger.info(f"CSV 处理完成: 总数={total}, 成功={success}, 失败={failed}")
            
            return UploadResult(
                total=total,
                success=success,
                failed=failed,
                failed_file_url=failed_file_url
            )
        
        except Exception as e:
            logger.error(f"CSV 文件处理失败: {str(e)}")
            raise FileProcessingException(
                message=f"CSV 文件处理失败: {str(e)}",
                details={"filename": file.filename if hasattr(file, 'filename') else 'unknown'}
            )
    
    def _format_validation_error(self, error: ValidationError) -> str:
        """
        格式化验证错误信息（使用统一的错误处理器）
        
        Args:
            error: Pydantic 验证错误
        
        Returns:
            str: 格式化的错误信息
        """
        return ErrorHandler.format_validation_error(error)
    
    def _save_failed_record(self, row: dict, error: str, db: Session):
        """
        保存失败记录到数据库（使用统一的错误处理器）
        
        Args:
            row: 原始数据行
            error: 错误信息
            db: 数据库会话
        """
        # 使用统一的错误处理器保存失败记录
        # 注意：这里不使用传入的 db session，而是让 ErrorHandler 创建新的 session
        # 这样可以避免事务冲突
        ErrorHandler.save_failed_record(
            data=row,
            error_message=error,
            failure_type='csv_validation_error',
            data_source=row.get('数据源')
        )
    
    def _generate_failed_csv(self, failed_records: List[dict]) -> str:
        """
        生成失败记录 CSV 文件
        
        Args:
            failed_records: 失败记录列表
        
        Returns:
            str: 失败记录文件的 URL 路径
        """
        try:
            # 创建临时文件
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"failed_records_{timestamp}.csv"
            
            # 确保 temp 目录存在
            temp_dir = os.path.join(os.getcwd(), 'temp')
            os.makedirs(temp_dir, exist_ok=True)
            
            filepath = os.path.join(temp_dir, filename)
            
            # 写入 CSV
            with open(filepath, 'w', encoding='utf-8-sig', newline='') as f:
                if failed_records:
                    # 获取所有字段名
                    first_record = failed_records[0]
                    data_keys = [k for k in first_record['data'].keys() if k is not None]
                    fieldnames = ['行号', '错误原因'] + data_keys
                    
                    writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
                    writer.writeheader()
                    
                    for record in failed_records:
                        row_data = {
                            '行号': record['row_number'],
                            '错误原因': record['error']
                        }
                        # 只添加非 None 的键
                        for key, value in record['data'].items():
                            if key is not None:
                                row_data[key] = value if value is not None else ''
                        writer.writerow(row_data)
            
            # 返回下载 URL
            return f"/api/upload/download/{filename}"
        
        except Exception as e:
            logger.error(f"生成失败记录 CSV 时出错: {str(e)}")
            return None


@router.post("/csv", response_model=UploadResult)
async def upload_csv(
    file: UploadFile = File(..., description="CSV 文件"),
    db: Session = Depends(get_db)
):
    """
    CSV 文件上传接口
    
    接收 CSV 文件，解析并批量导入房源数据
    
    Args:
        file: 上传的 CSV 文件
        db: 数据库会话
    
    Returns:
        UploadResult: 上传结果统计
    
    Raises:
        HTTPException: 文件格式错误或处理失败
    """
    # 验证文件类型
    if not file.filename.endswith('.csv'):
        raise FileProcessingException(
            message="只支持 CSV 文件格式",
            details={"filename": file.filename, "allowed_formats": [".csv"]}
        )
    
    logger.info(f"接收到 CSV 文件: {file.filename}")
    
    # 处理上传
    importer = CSVBatchImporter()
    result = importer.batch_import_csv(file, db)
    
    return result


@router.get("/download/{filename}")
async def download_failed_records(filename: str):
    """
    下载失败记录 CSV 文件
    
    Args:
        filename: 文件名
    
    Returns:
        FileResponse: CSV 文件流
    
    Raises:
        HTTPException: 文件不存在
    """
    temp_dir = os.path.join(os.getcwd(), 'temp')
    filepath = os.path.join(temp_dir, filename)
    
    if not os.path.exists(filepath):
        from exceptions import ResourceNotFoundException
        raise ResourceNotFoundException(
            message="文件不存在或已过期",
            details={"filename": filename}
        )
    
    return FileResponse(
        path=filepath,
        filename=filename,
        media_type='text/csv',
        headers={
            'Content-Disposition': f'attachment; filename="{filename}"'
        }
    )
