"""业务字典模型.

运营可配的枚举字典（品牌口径见 spec ``techdebt-config-unify`` D1/D2）：
以 ``dict_code`` 分组，组内 ``code`` 唯一，``label`` 为展示名。

为何不复用 ``system_configs`` KV：KV 只能存「单键全量 JSON」，列表项没有稳定
主键，无法排序/停用/引用计数；本表参照 ``finance_subjects``（唯一约束 + 预置标记
+ 软删除同语义）建模。

语义约定：
- ``is_builtin``：种子预置项（与 ``FinanceSubject.system`` 同语义），仅作来源标记；
- ``enabled=False``：停用不删（D6），历史单据仍按存储值原样展示；
- ``category``：仅 ``document_template`` 使用（对齐 ``project_documents.category``），
  其余字典组为 NULL；
- ``business_form``：仅 ``document_template`` 使用（agent/wholesale 分组）。
"""

from sqlalchemy import Boolean, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import BaseModel


class BizDictItem(BaseModel):
    """业务字典条目表（运营可配枚举字典）."""

    __tablename__ = "biz_dict_items"

    dict_code: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="字典组编码(lead_attr_channel/recruit_source/document_template/renovation_stage_alias)",
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False, comment="条目编码(组内唯一，存量枚举值原样)")
    label: Mapped[str] = mapped_column(String(100), nullable=False, comment="展示名")
    business_form: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
        comment="业务形式(仅 document_template 使用: agent/wholesale)",
    )
    category: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        comment="文书分类(仅 document_template 使用，对齐 project_documents.category)",
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, comment="排序值(升序)")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, comment="启用标记(停用不删)")
    is_builtin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, comment="是否种子预置")
    remark: Mapped[str | None] = mapped_column(String(200), nullable=True, comment="备注")

    __table_args__ = (
        Index("uq_biz_dict_items", "dict_code", "code", unique=True),
        Index("idx_biz_dict_items_dict", "dict_code", "enabled", "sort_order"),
    )

    def __repr__(self) -> str:
        """返回字符串表示."""
        return f"<BizDictItem(dict_code='{self.dict_code}', code='{self.code}')>"
