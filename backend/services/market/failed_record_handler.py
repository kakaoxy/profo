"""
失败记录处理模块
负责保存失败记录和生成失败记录 CSV 文件
"""
import os
import csv
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional

from services.system import save_failed_record

logger = logging.getLogger(__name__)


class FailedRecordHandler:
    """失败记录处理器"""
    
    def __init__(self, upload_dir: str):
        self.upload_dir = upload_dir
    
    def save_failed_record_sync(self, row: dict, error: str, task_id: str) -> None:
        """同步保存失败记录到数据库"""
        try:
            save_failed_record(
                data=row,
                error_message=error,
                failure_type='csv_validation_error',
                data_source=row.get('数据源')
            )
        except Exception as e:
            logger.warning(f"保存失败记录时出错: {e}")
    
    def generate_failed_csv(
        self, 
        failed_records: List[Dict[str, Any]], 
        original_headers: List[str],
        task_id: str
    ) -> Optional[str]:
        """
        生成失败记录 CSV 文件
        
        Args:
            failed_records: 失败记录列表
            original_headers: 原始 CSV 表头
            task_id: 任务ID
            
        Returns:
            失败文件下载 URL，如果没有失败记录则返回 None
        """
        if not failed_records:
            return None
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"failed_records_{task_id}_{timestamp}.csv"
        filepath = os.path.join(self.upload_dir, filename)
        
        # 确定字段顺序
        fieldnames = self._build_fieldnames(failed_records, original_headers)
        
        try:
            self._write_csv_file(filepath, fieldnames, failed_records)
            return f"/api/v1/upload/download/{filename}"
        except Exception as e:
            logger.error(f"生成失败记录文件失败: {e}")
            return None
    
    def _build_fieldnames(
        self, 
        failed_records: List[Dict[str, Any]], 
        original_headers: List[str]
    ) -> List[str]:
        """构建 CSV 字段名列表"""
        # 收集所有数据字段
        all_keys: set = set()
        for rec in failed_records:
            all_keys.update(rec['data'].keys())
        all_keys.discard(None)
        
        # 优先使用原始表头顺序
        if original_headers:
            data_keys = [h for h in original_headers if h in all_keys]
        else:
            data_keys = sorted([k for k in all_keys if k is not None])
        
        return ['行号', '错误原因'] + data_keys
    
    def _write_csv_file(
        self, 
        filepath: str, 
        fieldnames: List[str], 
        failed_records: List[Dict[str, Any]]
    ) -> None:
        """写入 CSV 文件"""
        with open(filepath, 'w', encoding='utf-8-sig', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
            writer.writeheader()
            for record in failed_records:
                out_row = {
                    '行号': record['row_number'], 
                    '错误原因': record['error']
                }
                for key in fieldnames[2:]:  # 跳过 '行号' 和 '错误原因'
                    out_row[key] = record['data'].get(key, '')
                writer.writerow(out_row)
        
        logger.info(f"失败记录文件已生成: {filepath}")
