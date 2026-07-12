"""JSON 批量导入服务.

处理 JSON 数组的批量房源数据推送.
"""

import logging

from pydantic import ValidationError
from sqlalchemy.orm import Session

from schemas import PropertyIngestionModel, PushResult
from services.market import PropertyImporter
from services.system import save_failed_record
from utils.error_formatters import format_validation_error

logger = logging.getLogger(__name__)

MAX_BATCH_SIZE = 10000


class JSONBatchImporter:
    """JSON 批量导入处理器."""

    def __init__(self) -> None:
        """初始化导入器."""
        self.importer = PropertyImporter()

    def batch_import_json(self, properties: list[dict], db: Session, user_id: str) -> PushResult:
        """批量导入 JSON 数组.

        流程:
        1. 校验批量大小
        2. 遍历 JSON 数组
        3. 逐条验证并导入
        4. 收集失败记录和错误详情
        5. 返回处理结果统计

        Args:
            properties: 原始房源数据字典列表
            db: 数据库会话
            user_id: 推送用户的ID，将保存到房源的owner_id字段

        Returns:
            PushResult: 推送结果统计

        Raises:
            ValueError: 批量大小超过限制

        """
        total = len(properties)
        if total > MAX_BATCH_SIZE:
            msg = f"单次推送最多支持 {MAX_BATCH_SIZE} 条记录，当前 {total} 条"
            raise ValueError(msg)
        success = 0
        failed = 0
        errors = []

        logger.info("开始处理 JSON 推送，共 %s 条记录", total)

        try:
            for index, raw_data in enumerate(properties):
                try:
                    # 使用 SAVEPOINT 隔离每条记录：单条失败只回滚该条，不影响其他记录
                    with db.begin_nested():
                        validated_data = PropertyIngestionModel(**raw_data)
                        result = self.importer.import_property(validated_data, db, user_id)
                        if not result.success:
                            # 业务失败：主动抛异常让 SAVEPOINT 回滚
                            msg = result.error or "导入失败"
                            raise ValueError(msg)
                    success += 1

                except ValidationError as e:  # noqa: PERF203
                    failed += 1
                    error_msg = self._format_validation_error(e)
                    errors.append(
                        {
                            "index": index,
                            "source_property_id": self._extract_source_id(raw_data),
                            "reason": error_msg,
                        },
                    )

                    self._save_failed_record_raw(raw_data, error_msg)

                    logger.warning("第 %s 条记录验证失败: %s", index, error_msg)

                except ValueError as e:
                    # 业务失败（result.success=False）：SAVEPOINT 已自动回滚
                    failed += 1
                    error_msg = str(e)
                    errors.append(
                        {
                            "index": index,
                            "source_property_id": self._extract_source_id(raw_data),
                            "reason": error_msg,
                        },
                    )

                    self._save_failed_record_raw(raw_data, error_msg)

                except Exception as e:
                    # 未预期异常：SAVEPOINT 已自动回滚，外层事务继续
                    failed += 1
                    error_msg = f"处理失败: {e!s}"
                    errors.append(
                        {
                            "index": index,
                            "source_property_id": self._extract_source_id(raw_data),
                            "reason": error_msg,
                        },
                    )

                    self._save_failed_record_raw(raw_data, error_msg)

                    logger.exception("第 %s 条记录处理失败", index)

            db.commit()
            logger.info("JSON 推送处理完成并已提交: 总数=%s, 成功=%s, 失败=%s", total, success, failed)

        except Exception as e:
            db.rollback()
            logger.exception(
                "JSON 推送提交失败，已回滚全部数据 (原始统计: 成功=%s, 失败=%s)",
                success,
                failed,
            )

            failed = total
            success = 0
            errors = [
                {
                    "index": idx,
                    "source_property_id": self._extract_source_id(raw_data),
                    "reason": f"批次提交失败(原成功记录已回滚): {e!s}",
                }
                for idx, raw_data in enumerate(properties)
            ]

        return PushResult(
            total=total,
            success=success,
            failed=failed,
            errors=errors,
        )

    def _extract_source_id(self, raw_data: dict) -> str:
        return raw_data.get("房源ID", raw_data.get("source_property_id", "unknown"))

    def _format_validation_error(self, error: ValidationError) -> str:
        """格式化验证错误信息（使用统一的错误处理器）.

        Args:
            error: Pydantic 验证错误

        Returns:
            str: 格式化的错误信息

        """
        return format_validation_error(error)

    def _save_failed_record_raw(self, raw_data: dict, error: str) -> None:
        """保存失败记录到数据库（使用统一的错误处理器）.

        Args:
            raw_data: 原始数据字典
            error: 错误信息

        """
        save_failed_record(
            data=raw_data,
            error_message=error,
            failure_type="json_validation_error",
            data_source=raw_data.get("数据源", raw_data.get("data_source")),
        )
