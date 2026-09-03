"""获客中心统一状态流转矩阵（叶子模块）.

「我的客户」（小程序员工侧）与管理端统一线索页共用的统一 5 态状态机
常量与校验器。作为叶子模块仅依赖 schemas 层与系统异常定义，
禁止 import 任何业务 services/models 模块——供 ``my_customers_flow``
与 ``admin_flow`` / ``recruit`` 等上层模块安全复用，防止循环依赖。
"""

from schemas.growth_center import UnifiedLeadStatus
from services.system.exceptions import BusinessLogicError, ConflictError

# 统一状态流转矩阵（目标状态集合；converted 为终态（空集，含流转到自身一律拒绝）；
# eliminated 非终态，仅可重新激活至 contacted，remark 必填）
TRANSITIONS: dict[UnifiedLeadStatus, set[UnifiedLeadStatus]] = {
    UnifiedLeadStatus.NEW: {
        UnifiedLeadStatus.CONTACTED,
        UnifiedLeadStatus.HIGH_INTENT,
        UnifiedLeadStatus.CONVERTED,
        UnifiedLeadStatus.ELIMINATED,
    },
    UnifiedLeadStatus.CONTACTED: {
        UnifiedLeadStatus.HIGH_INTENT,
        UnifiedLeadStatus.CONVERTED,
        UnifiedLeadStatus.ELIMINATED,
    },
    UnifiedLeadStatus.HIGH_INTENT: {UnifiedLeadStatus.CONVERTED, UnifiedLeadStatus.ELIMINATED},
    UnifiedLeadStatus.CONVERTED: set(),
    UnifiedLeadStatus.ELIMINATED: {UnifiedLeadStatus.CONTACTED},
}

# 统一状态中文名（系统跟进记录/通知文案）
UNIFIED_STATUS_LABELS: dict[UnifiedLeadStatus, str] = {
    UnifiedLeadStatus.NEW: "新线索",
    UnifiedLeadStatus.CONTACTED: "已联系",
    UnifiedLeadStatus.HIGH_INTENT: "意向高",
    UnifiedLeadStatus.CONVERTED: "已转化",
    UnifiedLeadStatus.ELIMINATED: "已淘汰",
}


def ensure_transition_allowed(current: UnifiedLeadStatus, target: UnifiedLeadStatus) -> None:
    """统一状态矩阵校验（终态/回退/非法跳转 → 409）.

    Raises:
        ConflictError: 不允许的流转（含终态流转到自身）

    """
    if target not in TRANSITIONS[current]:
        msg = f"不允许从「{UNIFIED_STATUS_LABELS[current]}」流转为「{UNIFIED_STATUS_LABELS[target]}」"
        raise ConflictError(msg)


def ensure_reactivation_remark(
    current: UnifiedLeadStatus,
    target: UnifiedLeadStatus,
    remark: str | None,
) -> None:
    """重新激活旁路（eliminated → contacted）remark 必填（其余流转不校验）.

    Raises:
        BusinessLogicError: 重新激活时 remark 缺失（422）

    """
    if (
        current == UnifiedLeadStatus.ELIMINATED
        and target == UnifiedLeadStatus.CONTACTED
        and not (remark and remark.strip())
    ):
        msg = "重新激活必须填写备注"
        raise BusinessLogicError(msg)
