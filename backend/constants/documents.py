"""默认文书清单常量.

按业务形式维护默认文书模板，用于项目创建/业务形式变更时初始化文书签收清单.
"""

from dataclasses import dataclass

from models.common.base import BusinessForm


@dataclass(frozen=True)
class DocumentTemplate:
    """文书模板."""

    document_name: str
    display_order: int


AGENT_DOCUMENTS: tuple[DocumentTemplate, ...] = (
    DocumentTemplate(document_name="美房独家委托出售协议", display_order=1),
    DocumentTemplate(document_name="房屋交接书", display_order=2),
    DocumentTemplate(document_name="收款收据", display_order=3),
    DocumentTemplate(document_name="合作房源确认函", display_order=4),
    DocumentTemplate(document_name="收款账户确认书", display_order=5),
    DocumentTemplate(document_name="跟投协议书", display_order=6),
    DocumentTemplate(document_name="装修合同", display_order=7),
    DocumentTemplate(document_name="业主身份证", display_order=8),
    DocumentTemplate(document_name="产证", display_order=9),
    DocumentTemplate(document_name="增值服务确认书", display_order=10),
    DocumentTemplate(document_name="分配协议", display_order=11),
    DocumentTemplate(document_name="其他资料", display_order=12),
)

WHOLESALE_DOCUMENTS: tuple[DocumentTemplate, ...] = (
    DocumentTemplate(document_name="合作协议（名义持有）", display_order=1),
    DocumentTemplate(document_name="房屋交接书", display_order=2),
    DocumentTemplate(document_name="跟投协议书", display_order=3),
    DocumentTemplate(document_name="装修合同", display_order=4),
    DocumentTemplate(document_name="增值服务确认书", display_order=5),
    DocumentTemplate(document_name="其他资料", display_order=6),
    DocumentTemplate(document_name="分配协议", display_order=7),
)


def get_documents_for_business_form(form: BusinessForm | None) -> list[DocumentTemplate]:
    """根据业务形式返回默认文书清单.

    Args:
        form: 业务形式枚举，None 表示未设置.

    Returns:
        对应业务形式的文书清单副本；form=None 返回空列表.
    """
    if form is None:
        return []
    if form is BusinessForm.AGENT:
        return list(AGENT_DOCUMENTS)
    if form is BusinessForm.WHOLESALE:
        return list(WHOLESALE_DOCUMENTS)
    return []
