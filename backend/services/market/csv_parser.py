"""
CSV 文件解析模块
负责 CSV 文件的读取、解码和解析
"""
import csv
import io
import logging
from datetime import datetime
from typing import List, Dict, Any, Tuple

logger = logging.getLogger(__name__)


class CSVParser:
    """CSV 文件解析器"""
    
    def parse_file(self, file_path: str) -> Tuple[List[Dict[str, Any]], List[str]]:
        """
        解析 CSV 文件
        
        Args:
            file_path: CSV 文件路径
            
        Returns:
            Tuple of (rows as list of dicts, list of header names)
            
        Raises:
            ValueError: 当 CSV 文件格式不正确时
        """
        # 读取文件内容
        with open(file_path, 'rb') as f:
            content = f.read()
        
        # 解码
        decoded = self._decode_content(content)
        
        # 解析 CSV
        return self._parse_csv_content(decoded)
    
    def _decode_content(self, content: bytes) -> str:
        """解码文件内容，尝试多种编码"""
        if content.startswith(b'\xef\xbb\xbf'):
            encodings = ['utf-8-sig', 'utf-8']
        else:
            encodings = ['utf-8', 'gbk', 'gb2312', 'latin1']
        
        for encoding in encodings:
            try:
                return content.decode(encoding)
            except UnicodeDecodeError:
                continue
        
        # 如果所有编码都失败，使用 utf-8 并忽略错误
        logger.warning("无法确定文件编码，使用 utf-8 并忽略错误字符")
        return content.decode('utf-8', errors='ignore')
    
    def _parse_csv_content(self, content: str) -> Tuple[List[Dict[str, Any]], List[str]]:
        """解析 CSV 内容"""
        f = io.StringIO(content)
        sample = f.read(1024)
        f.seek(0)
        
        # 检测分隔符
        delimiter = self._detect_delimiter(sample)
        
        reader = csv.reader(f, delimiter=delimiter)
        headers = next(reader, None)
        if not headers:
            raise ValueError("CSV 文件无表头")
        
        clean_headers = [h.lstrip('\ufeff').strip() if h else '' for h in headers]
        
        rows = []
        for raw_row in reader:
            row_dict = self._process_row(raw_row, clean_headers)
            rows.append(row_dict)
        
        return rows, clean_headers
    
    def _detect_delimiter(self, sample: str) -> str:
        """检测 CSV 分隔符"""
        try:
            sniffer = csv.Sniffer()
            if sniffer.has_header(sample):
                return sniffer.sniff(sample, delimiters=',;\t').delimiter
        except Exception:
            pass
        return ','
    
    def _process_row(self, raw_row: List[str], headers: List[str]) -> Dict[str, Any]:
        """处理单行数据"""
        # 补齐或截断列数
        padded_row = raw_row + [''] * (len(headers) - len(raw_row))
        trimmed_row = padded_row[:len(headers)]
        
        row_dict: Dict[str, Any] = {}
        for key, value in zip(headers, trimmed_row):
            if key == '':
                continue
            val = value.strip() if isinstance(value, str) else value
            row_dict[key] = None if val == '' else val
        
        # 规范化日期字段
        for date_key in ['上架时间', '成交时间']:
            if date_key in row_dict and isinstance(row_dict[date_key], str):
                row_dict[date_key] = self._normalize_date_string(row_dict[date_key])
        
        return row_dict
    
    def _normalize_date_string(self, date_string: str) -> str:
        """规范化日期字符串为 ISO 格式"""
        if not date_string:
            return date_string
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
        except Exception:
            pass
        return date_string
