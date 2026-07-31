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
    category: str


# 文书分类：contract_agreement 签约合同 / property_rights 产权 / identity_account 身份与账户
#           finance_tax 财务税务 / handover 交接 / other 其他
AGENT_DOCUMENTS: tuple[DocumentTemplate, ...] = (
    DocumentTemplate(document_name="签约合同", display_order=1, category="contract_agreement"),
    DocumentTemplate(document_name="装修合同", display_order=2, category="contract_agreement"),
    DocumentTemplate(document_name="合作房源确认函", display_order=3, category="contract_agreement"),
    DocumentTemplate(document_name="门店跟投协议书", display_order=4, category="contract_agreement"),
    DocumentTemplate(document_name="增值服务确认书", display_order=5, category="contract_agreement"),
    DocumentTemplate(document_name="产证", display_order=6, category="property_rights"),
    DocumentTemplate(document_name="产调", display_order=7, category="property_rights"),
    DocumentTemplate(document_name="业主身份证", display_order=8, category="identity_account"),
    DocumentTemplate(document_name="业主银行卡", display_order=9, category="identity_account"),
    DocumentTemplate(document_name="收款收据", display_order=10, category="finance_tax"),
    DocumentTemplate(document_name="房屋交接书", display_order=11, category="handover"),
    DocumentTemplate(document_name="其他", display_order=12, category="other"),
)

WHOLESALE_DOCUMENTS: tuple[DocumentTemplate, ...] = (
    DocumentTemplate(document_name="定金协议", display_order=1, category="contract_agreement"),
    DocumentTemplate(document_name="佣金确认书", display_order=2, category="contract_agreement"),
    DocumentTemplate(document_name="买卖合同", display_order=3, category="contract_agreement"),
    DocumentTemplate(document_name="贷款合同", display_order=4, category="contract_agreement"),
    DocumentTemplate(document_name="原产证", display_order=5, category="property_rights"),
    DocumentTemplate(document_name="新产证", display_order=6, category="property_rights"),
    DocumentTemplate(document_name="收件收据", display_order=7, category="property_rights"),
    DocumentTemplate(document_name="原业主证件", display_order=8, category="identity_account"),
    DocumentTemplate(document_name="原业主银行卡", display_order=9, category="identity_account"),
    DocumentTemplate(document_name="新业主证件", display_order=10, category="identity_account"),
    DocumentTemplate(document_name="新业主银行卡", display_order=11, category="identity_account"),
    DocumentTemplate(document_name="收款收据", display_order=12, category="finance_tax"),
    DocumentTemplate(document_name="购房发票", display_order=13, category="finance_tax"),
    DocumentTemplate(document_name="契税单", display_order=14, category="finance_tax"),
    DocumentTemplate(document_name="房产税认定通知书", display_order=15, category="finance_tax"),
    DocumentTemplate(document_name="还款计划表", display_order=16, category="finance_tax"),
    DocumentTemplate(document_name="房屋交接书", display_order=17, category="handover"),
    DocumentTemplate(document_name="其他", display_order=18, category="other"),
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
