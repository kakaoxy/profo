"""
JSON 推送 API 路由
处理 JSON 数组的批量房源数据推送
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from pydantic import ValidationError
import logging
import json

from db import get_db
from schemas import PropertyIngestionModel, PushResult
from services.importer import PropertyImporter
from models import FailedRecord
from exceptions import ValidationException, BusinessLogicException
from error_handlers import ErrorHandler


logger = logging.getLogger(__name__)

router = APIRouter()


class JSONBatchImporter:
    """JSON 批量导入处理器"""
    
    def __init__(self):
        self.importer = PropertyImporter()
    
    def batch_import_json(self, properties: List[dict], db: Session) -> PushResult:
        """
        批量导入 JSON 数组
        
        流程:
        1. 遍历 JSON 数组
        2. 逐条验证并导入
        3. 收集失败记录和错误详情
        4. 返回处理结果统计
        
        Args:
            properties: 原始房源数据字典列表
            db: 数据库会话
        
        Returns:
            PushResult: 推送结果统计
        """
        total = len(properties)
        success = 0
        failed = 0
        errors = []
        
        logger.info(f"开始处理 JSON 推送，共 {total} 条记录")
        
        # 逐条处理
        for index, raw_data in enumerate(properties):
            try:
                # 验证数据
                validated_data = PropertyIngestionModel(**raw_data)
                
                # 导入数据
                result = self.importer.import_property(validated_data, db)
                
                if result.success:
                    success += 1
                else:
                    failed += 1
                    errors.append({
                        'index': index,
                        'source_property_id': raw_data.get('房源ID', raw_data.get('source_property_id', 'unknown')),
                        'reason': result.error
                    })
                    
                    # 记录到 failed_records 表
                    self._save_failed_record_raw(raw_data, result.error, db)
            
            except ValidationError as e:
                failed += 1
                error_msg = self._format_validation_error(e)
                errors.append({
                    'index': index,
                    'source_property_id': raw_data.get('房源ID', raw_data.get('source_property_id', 'unknown')),
                    'reason': error_msg
                })
                
                # 记录到 failed_records 表
                self._save_failed_record_raw(raw_data, error_msg, db)
                
                logger.warning(f"第 {index} 条记录验证失败: {error_msg}")
            
            except Exception as e:
                failed += 1
                error_msg = f"处理失败: {str(e)}"
                errors.append({
                    'index': index,
                    'source_property_id': raw_data.get('房源ID', raw_data.get('source_property_id', 'unknown')),
                    'reason': error_msg
                })
                
                # 记录到 failed_records 表
                self._save_failed_record_raw(raw_data, error_msg, db)
                
                logger.error(f"第 {index} 条记录处理失败: {error_msg}")
        
        logger.info(f"JSON 推送处理完成: 总数={total}, 成功={success}, 失败={failed}")
        
        return PushResult(
            total=total,
            success=success,
            failed=failed,
            errors=errors
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
    
    def _save_failed_record_raw(self, raw_data: dict, error: str, db: Session):
        """
        保存失败记录到数据库（使用统一的错误处理器）
        
        Args:
            raw_data: 原始数据字典
            error: 错误信息
            db: 数据库会话
        """
        # 使用统一的错误处理器保存失败记录
        ErrorHandler.save_failed_record(
            data=raw_data,
            error_message=error,
            failure_type='json_validation_error',
            data_source=raw_data.get('数据源', raw_data.get('data_source'))
        )


@router.post("", response_model=PushResult)
def push_properties(
    properties: List[dict],
    db: Session = Depends(get_db)
):
    """
    JSON 数据推送接口
    
    接收 JSON 数组，批量导入房源数据
    
    Args:
        properties: 房源数据列表（原始字典）
        db: 数据库会话
    
    Returns:
        PushResult: 推送结果统计
    
    Raises:
        HTTPException: 数据验证失败或处理失败
    """
    if not properties:
        raise ValidationException(
            message="请求体不能为空",
            details={"received": "empty array"}
        )
    
    if len(properties) > 10000:
        raise ValidationException(
            message="单次推送最多支持 10000 条记录",
            details={"received": len(properties), "max_allowed": 10000}
        )
    
    logger.info(f"接收到 JSON 推送请求，包含 {len(properties)} 条记录")
    
    try:
        # 处理推送
        importer = JSONBatchImporter()
        result = importer.batch_import_json(properties, db)
        
        return result
    
    except Exception as e:
        logger.error(f"JSON 推送处理失败: {str(e)}")
        raise BusinessLogicException(
            message=f"推送处理失败: {str(e)}",
            details={"total_records": len(properties)}
        )
