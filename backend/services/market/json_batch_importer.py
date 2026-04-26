"""
JSON 批量导入服务
处理 JSON 数组的批量房源数据推送
"""
import logging
from typing import List

from pydantic import ValidationError
from sqlalchemy.orm import Session

from schemas import PropertyIngestionModel, PushResult
from services.market import PropertyImporter
from services.system import save_failed_record
from utils.error_formatters import format_validation_error

logger = logging.getLogger(__name__)


class JSONBatchImporter:
    """JSON 批量导入处理器"""

    def __init__(self):
        self.importer = PropertyImporter()

    def batch_import_json(self, properties: List[dict], db: Session, user_id: str) -> PushResult:
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
            user_id: 推送用户的ID，将保存到房源的owner_id字段

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

                # 导入数据，传递用户ID
                result = self.importer.import_property(validated_data, db, user_id)

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
                    self._save_failed_record_raw(raw_data, result.error)

            except ValidationError as e:
                failed += 1
                error_msg = self._format_validation_error(e)
                errors.append({
                    'index': index,
                    'source_property_id': raw_data.get('房源ID', raw_data.get('source_property_id', 'unknown')),
                    'reason': error_msg
                })

                # 记录到 failed_records 表
                self._save_failed_record_raw(raw_data, error_msg)

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
                self._save_failed_record_raw(raw_data, error_msg)

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
        return format_validation_error(error)

    def _save_failed_record_raw(self, raw_data: dict, error: str) -> None:
        """
        保存失败记录到数据库（使用统一的错误处理器）

        Args:
            raw_data: 原始数据字典
            error: 错误信息
        """
        # 使用统一的错误处理器保存失败记录
        save_failed_record(
            data=raw_data,
            error_message=error,
            failure_type='json_validation_error',
            data_source=raw_data.get('数据源', raw_data.get('data_source'))
        )
