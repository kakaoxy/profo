"""商户管理域枚举常量（V02–V05 共用）.

状态码使用稳定英文标识，落库只存 code；展示名由业务字典（V01）维护。
"""

from enum import Enum


class MerchantCompanyStatus(str, Enum):
    """公司状态."""

    NORMAL = "normal"
    DISABLED = "disabled"


class MerchantStoreStatus(str, Enum):
    """门店状态（V02 8.1、Q12）."""

    NORMAL = "normal"
    DISABLED = "disabled"
    MERGED = "merged"
    RELOCATED = "relocated"


class MerchantStoreReviewStatus(str, Enum):
    """门店审核状态（m02721）."""

    PENDING = "pending"
    APPROVED = "approved"
    MERGED = "merged"


class MerchantStoreSource(str, Enum):
    """门店来源."""

    EMPLOYEE = "employee"
    BACKOFFICE = "backoffice"
    IMPORT = "import"
    BROKER = "broker"


MERCHANT_STORE_SOURCE_LABELS: dict[str, str] = {
    MerchantStoreSource.EMPLOYEE.value: "员工建档",
    MerchantStoreSource.BACKOFFICE.value: "后台新增",
    MerchantStoreSource.IMPORT.value: "批量导入",
    MerchantStoreSource.BROKER.value: "经纪人创建",
}


class MerchantCooperationStatus(str, Enum):
    """门店合作状态（字典 merchant_cooperation_status）."""

    NOT_COOPERATED = "not_cooperated"
    NEGOTIATING = "negotiating"
    COOPERATED = "cooperated"
    PAUSED = "paused"
    TERMINATED = "terminated"


class MerchantVisitResult(str, Enum):
    """拜访结果（字典 merchant_visit_result）."""

    NOT_MET = "not_met"
    INTERESTED = "interested"
    COOPERATED = "cooperated"
    OTHER = "other"


class MerchantVisitSource(str, Enum):
    """拜访来源（V03 6.1）."""

    FIRST = "first"
    REGULAR = "regular"
    BACKFILL = "backfill"
    BACKOFFICE = "backoffice"


class MerchantLocationStatus(str, Enum):
    """拜访定位状态（V03 Q05）."""

    NORMAL = "normal"
    DEGRADED = "degraded"
    MISSING = "missing"


class MerchantLocationFailureType(str, Enum):
    """定位失败类型（V03 AC-V03-007）：仅弱网/超时允许降级提交."""

    AUTH_DENIED = "auth_denied"
    TIMEOUT = "timeout"
    UNAVAILABLE = "unavailable"


class MerchantBindStatus(str, Enum):
    """经纪人绑定状态（V04 8.2）."""

    UNBOUND = "unbound"
    PENDING = "pending"
    BOUND = "bound"
    UNBOUND_AFTER = "unbound_after"
    DISABLED = "disabled"


class MerchantBindingRecordStatus(str, Enum):
    """绑定记录状态（V04 8.3）."""

    PENDING = "pending"
    ACTIVE = "active"
    REJECTED = "rejected"
    UNBOUND = "unbound"


class MerchantBindSource(str, Enum):
    """绑定来源（m02721）."""

    QRCODE = "qrcode"
    SHARE = "share"
    MANUAL = "manual"
    BACKOFFICE = "backoffice"
    NONE = "none"


__all__ = [
    "MerchantBindSource",
    "MerchantBindStatus",
    "MerchantBindingRecordStatus",
    "MerchantCompanyStatus",
    "MerchantCooperationStatus",
    "MerchantLocationStatus",
    "MerchantStoreReviewStatus",
    "MerchantStoreSource",
    "MerchantStoreStatus",
    "MerchantVisitResult",
    "MerchantVisitSource",
]
