"""应收应付参考表聚合方法."""

import uuid
from decimal import Decimal

from sqlalchemy import func

from models import (
    FinanceRecord,
    Investment,
    Project,
    ProjectContract,
    ProjectRenovation,
    ProjectSale,
)
from models.common import CashFlowCategory, CashFlowType
from schemas.project.finance import ReceivablePayableItem, ReceivablePayableResponse
from services.system.exceptions import ResourceNotFoundError

# 应收应付参考表元数据：覆盖 spec 中全部 34 个科目。
# 各 dict 字段说明：
#   - type              CashFlowType 枚举
#   - business_type     general / agent / wholesale
#   - stage             签约 / 装修 / 在售 / 已售 / 其他
#   - category          CashFlowCategory 枚举成员
#   - category_label    前端显示名（与枚举 value 部分不同，详见 spec 映射表）
#   - calculation_logic 计算逻辑文本（前端展示）
#   - calc_type         none / fixed / signing_price_pct / sold_price_pct /
#                       vas_pct / vas / renovation / investment / bond
#   - calc_param        计算参数（Decimal 或字段名字符串或 None）
RECEIVABLE_PAYABLE_METADATA: list[dict[str, object]] = [
    # ===== 支出（expense）26 项 =====
    # --- 通用 ---
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "general",
        "stage": "签约",
        "category": CashFlowCategory.CHANNEL_COMMISSION,
        "category_label": "渠道佣金",
        "calculation_logic": "签约价格*0.01（最高40000）",
        "calc_type": "signing_price_pct",
        "calc_param": Decimal("0.01"),
        "calc_cap": Decimal(40000),
    },
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "general",
        "stage": "装修",
        "category": CashFlowCategory.HARD_DECORATION,
        "category_label": "硬装",
        "calculation_logic": "装修合同中",
        "calc_type": "renovation",
        "calc_param": "hard_contract_amount",
    },
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "general",
        "stage": "装修",
        "category": CashFlowCategory.SOFT_DECORATION,
        "category_label": "软装",
        "calculation_logic": "装修合同中",
        "calc_type": "renovation",
        "calc_param": "soft_budget",
    },
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "general",
        "stage": "装修",
        "category": CashFlowCategory.CUSTOM_CABINET_DECORATION,
        "category_label": "定制柜",
        "calculation_logic": "装修合同中",
        "calc_type": "renovation",
        "calc_param": "custom_cabinet_amount",
    },
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "general",
        "stage": "装修",
        "category": CashFlowCategory.WINDOW_DECORATION,
        "category_label": "窗户",
        "calculation_logic": "装修合同中",
        "calc_type": "renovation",
        "calc_param": "window_amount",
    },
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "general",
        "stage": "装修",
        "category": CashFlowCategory.WALL_DECORATION,
        "category_label": "墙面",
        "calculation_logic": "装修合同中",
        "calc_type": "renovation",
        "calc_param": "wall_treatment_amount",
    },
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "general",
        "stage": "装修",
        "category": CashFlowCategory.OTHER_DECORATION,
        "category_label": "其他装修",
        "calculation_logic": "装修合同中",
        "calc_type": "renovation",
        "calc_param": ["design_fee", "demolition_fee", "garbage_fee", "other_extra_fee"],
    },
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "general",
        "stage": "在售",
        "category": CashFlowCategory.MARKETING_ADVANCE,
        "category_label": "营销费垫付",
        "calculation_logic": "无",
        "calc_type": "none",
        "calc_param": None,
    },
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "general",
        "stage": "已售",
        "category": CashFlowCategory.INVESTMENT_PRINCIPAL_RETURN,
        "category_label": "跟投本金退还",
        "calculation_logic": "项目跟投款",
        "calc_type": "investment",
        "calc_param": None,
    },
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "general",
        "stage": "已售",
        "category": CashFlowCategory.INVESTOR_PROFIT_DISTRIBUTION,
        "category_label": "投资人利润分配",
        "calculation_logic": "—",
        "calc_type": "none",
        "calc_param": None,
    },
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "general",
        "stage": "已售",
        "category": CashFlowCategory.MARKETING_PROMOTION,
        "category_label": "营销推广费",
        "calculation_logic": "成交总价*0.005",
        "calc_type": "sold_price_pct",
        "calc_param": Decimal("0.005"),
    },
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "general",
        "stage": "已售",
        "category": CashFlowCategory.OPERATION_FEE,
        "category_label": "运营费",
        "calculation_logic": "成交总价*0.01（最高40000）",
        "calc_type": "sold_price_pct",
        "calc_param": Decimal("0.01"),
        "calc_cap": Decimal(40000),
    },
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "general",
        "stage": "已售",
        "category": CashFlowCategory.FINANCE_TAX_COST,
        "category_label": "财税成本",
        "calculation_logic": "增值服务费*1%",
        "calc_type": "vas_pct",
        "calc_param": Decimal("0.01"),
    },
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "general",
        "stage": "已售",
        "category": CashFlowCategory.PROJECT_INCENTIVE,
        "category_label": "项目激励",
        "calculation_logic": "无",
        "calc_type": "none",
        "calc_param": None,
    },
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "general",
        "stage": "其他",
        "category": CashFlowCategory.PROJECT_RESERVE,
        "category_label": "项目备用金",
        "calculation_logic": "无",
        "calc_type": "none",
        "calc_param": None,
    },
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "general",
        "stage": "其他",
        "category": CashFlowCategory.OTHER_EXPENSE,
        "category_label": "其他支出",
        "calculation_logic": "无",
        "calc_type": "none",
        "calc_param": None,
    },
    # --- 代理 ---
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "agent",
        "stage": "签约",
        "category": CashFlowCategory.PERFORMANCE_BOND,
        "category_label": "履约保证金",
        "calculation_logic": "20000",
        "calc_type": "fixed",
        "calc_param": Decimal(20000),
    },
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "agent",
        "stage": "已售",
        "category": CashFlowCategory.PAID_COMMISSION,
        "category_label": "代付佣金",
        "calculation_logic": "无",
        "calc_type": "none",
        "calc_param": None,
    },
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "agent",
        "stage": "已售",
        "category": CashFlowCategory.TAX_COMMISSION_DIFF,
        "category_label": "税费及佣金差额",
        "calculation_logic": "增值服务费*1%",
        "calc_type": "vas_pct",
        "calc_param": Decimal("0.01"),
    },
    # --- 收购 ---
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "wholesale",
        "stage": "签约",
        "category": CashFlowCategory.PURCHASE_DEPOSIT,
        "category_label": "购房款-定金",
        "calculation_logic": "无",
        "calc_type": "none",
        "calc_param": None,
    },
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "wholesale",
        "stage": "签约",
        "category": CashFlowCategory.PURCHASE_DOWNPAYMENT,
        "category_label": "购房款-首付",
        "calculation_logic": "无",
        "calc_type": "none",
        "calc_param": None,
    },
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "wholesale",
        "stage": "签约",
        "category": CashFlowCategory.PROPERTY_TAX,
        "category_label": "购房款-税费",
        "calculation_logic": "签约价格*0.01",
        "calc_type": "signing_price_pct",
        "calc_param": Decimal("0.01"),
    },
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "wholesale",
        "stage": "签约",
        "category": CashFlowCategory.QUOTA_FEE,
        "category_label": "名额费",
        "calculation_logic": "10000",
        "calc_type": "fixed",
        "calc_param": Decimal(10000),
    },
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "wholesale",
        "stage": "签约",
        "category": CashFlowCategory.HOLDING_COST_MONTHLY,
        "category_label": "持有月供",
        "calculation_logic": "无",
        "calc_type": "none",
        "calc_param": None,
    },
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "wholesale",
        "stage": "已售",
        "category": CashFlowCategory.SELLING_COMMISSION,
        "category_label": "卖房佣金",
        "calculation_logic": "成交总价*0.01",
        "calc_type": "sold_price_pct",
        "calc_param": Decimal("0.01"),
    },
    {
        "type": CashFlowType.EXPENSE,
        "business_type": "wholesale",
        "stage": "已售",
        "category": CashFlowCategory.SELLING_TAX,
        "category_label": "卖房税费",
        "calculation_logic": "无",
        "calc_type": "none",
        "calc_param": None,
    },
    # ===== 收入（income）8 项 =====
    # --- 通用 ---
    {
        "type": CashFlowType.INCOME,
        "business_type": "general",
        "stage": "在售",
        "category": CashFlowCategory.PROJECT_INVESTMENT,
        "category_label": "项目跟投款",
        "calculation_logic": "无",
        "calc_type": "none",
        "calc_param": None,
    },
    {
        "type": CashFlowType.INCOME,
        "business_type": "general",
        "stage": "已售",
        "category": CashFlowCategory.MARKETING_PROMOTION_DEDUCTION,
        "category_label": "营销推广费抵扣",
        "calculation_logic": "无",
        "calc_type": "none",
        "calc_param": None,
    },
    {
        "type": CashFlowType.INCOME,
        "business_type": "general",
        "stage": "其他",
        "category": CashFlowCategory.OTHER_INCOME,
        "category_label": "其他费用",
        "calculation_logic": "无",
        "calc_type": "none",
        "calc_param": None,
    },
    {
        "type": CashFlowType.INCOME,
        "business_type": "general",
        "stage": "其他",
        "category": CashFlowCategory.RESERVE_RECOVERY,
        "category_label": "备用金回收",
        "calculation_logic": "无",
        "calc_type": "none",
        "calc_param": None,
    },
    # --- 代理 ---
    {
        "type": CashFlowType.INCOME,
        "business_type": "agent",
        "stage": "已售",
        "category": CashFlowCategory.BOND_RECOVERY,
        "category_label": "保证金回收",
        "calculation_logic": "履约保证金",
        "calc_type": "bond",
        "calc_param": None,
    },
    {
        "type": CashFlowType.INCOME,
        "business_type": "agent",
        "stage": "已售",
        "category": CashFlowCategory.VALUE_ADDED_SERVICE,
        "category_label": "增值服务费",
        "calculation_logic": "成交总价-签约价格",
        "calc_type": "vas",
        "calc_param": None,
    },
    {
        "type": CashFlowType.INCOME,
        "business_type": "agent",
        "stage": "已售",
        "category": CashFlowCategory.OWNER_COMMISSION,
        "category_label": "业主佣金",
        "calculation_logic": "无",
        "calc_type": "none",
        "calc_param": None,
    },
    # --- 收购 ---
    {
        "type": CashFlowType.INCOME,
        "business_type": "wholesale",
        "stage": "已售",
        "category": CashFlowCategory.SALE_PRICE,
        "category_label": "房价款",
        "calculation_logic": "无",
        "calc_type": "none",
        "calc_param": None,
    },
]


class _ReceivablePayableMixin:
    """应收应付参考表聚合方法."""

    def get_receivable_payable(self, project_id: uuid.UUID) -> ReceivablePayableResponse:
        """获取项目应收应付参考表数据（预期金额 vs 实际金额对比）.

        预期金额按业务规则计算（签约价/成交价/装修合同/跟投款/固定值），
        实际金额从 FinanceRecord 按 (type, category) 聚合 sum(amount)。
        """
        # 1. 一次 JOIN 获取项目+合同+销售+装修
        row = (
            self.db.query(Project, ProjectContract, ProjectSale, ProjectRenovation)
            .outerjoin(ProjectContract, ProjectContract.project_id == Project.id)
            .outerjoin(ProjectSale, ProjectSale.project_id == Project.id)
            .outerjoin(ProjectRenovation, ProjectRenovation.project_id == Project.id)
            .filter(Project.id == project_id, Project.is_deleted.is_(False))
            .first()
        )
        if not row:
            msg = "项目不存在"
            raise ResourceNotFoundError(msg)

        _project, contract, sale, renovation = row

        # 2. 查询跟投记录
        investment = (
            self.db.query(Investment)
            .filter(Investment.project_id == project_id, Investment.deleted_at.is_(None))
            .first()
        )

        # 3. 聚合 FinanceRecord by (type, category)
        agg_rows = (
            self.db.query(
                FinanceRecord.type,
                FinanceRecord.category,
                func.sum(FinanceRecord.amount).label("total"),
            )
            .filter(
                FinanceRecord.project_id == project_id,
                FinanceRecord.is_deleted.is_(False),
            )
            .group_by(FinanceRecord.type, FinanceRecord.category)
            .all()
        )
        agg: dict[tuple[str, str], Decimal] = {}
        for r in agg_rows:
            type_key = r.type.value if hasattr(r.type, "value") else str(r.type)
            cat_key = r.category.value if hasattr(r.category, "value") else str(r.category)
            agg[(type_key, cat_key)] = r.total or Decimal(0)

        # 4. 计算各科目预期金额并构建响应项
        signing_price: Decimal | None = contract.signing_price if contract else None
        sold_price: Decimal | None = sale.sold_price if sale else None

        items: list[ReceivablePayableItem] = []
        for meta in RECEIVABLE_PAYABLE_METADATA:
            expected = self._calc_expected_amount(
                meta["calc_type"],
                meta["calc_param"],
                signing_price,
                sold_price,
                renovation,
                investment,
            )
            expected = self._apply_cap(expected, meta.get("calc_cap"))
            actual = agg.get(
                (meta["type"].value, meta["category"].value),
                Decimal(0),
            )
            difference = expected - actual if expected is not None else None

            items.append(
                ReceivablePayableItem(
                    type=meta["type"],
                    business_type=meta["business_type"],
                    stage=meta["stage"],
                    category=meta["category"],
                    category_label=meta["category_label"],
                    calculation_logic=meta["calculation_logic"],
                    expected_amount=expected,
                    actual_amount=actual,
                    difference=difference,
                ),
            )

        return ReceivablePayableResponse(items=items)

    @staticmethod
    def _calc_expected_amount(  # noqa: PLR0911
        calc_type: str,
        calc_param: object,
        signing_price: Decimal | None,
        sold_price: Decimal | None,
        renovation: ProjectRenovation | None,
        investment: Investment | None,
    ) -> Decimal | None:
        """根据计算类型与参数计算单个科目的预期金额.

        单位约定：signing_price / sold_price 单位为"万"，需 × 10000 转为元；
        装修字段、跟投款、固定值均为元，无需转换。
        """
        if calc_type == "none":
            return None
        if calc_type == "fixed":
            return calc_param
        if calc_type == "signing_price_pct":
            if signing_price is None:
                return None
            return signing_price * calc_param * Decimal(10000)
        if calc_type == "sold_price_pct":
            if sold_price is None:
                return None
            return sold_price * calc_param * Decimal(10000)
        if calc_type == "vas_pct":
            if signing_price is None or sold_price is None:
                return None
            return (sold_price - signing_price) * Decimal(10000) * calc_param
        if calc_type == "vas":
            if signing_price is None or sold_price is None:
                return None
            return (sold_price - signing_price) * Decimal(10000)
        if calc_type == "renovation":
            if renovation is None:
                return None
            if isinstance(calc_param, list):
                return sum((getattr(renovation, p, None) or Decimal(0)) for p in calc_param)
            value = getattr(renovation, str(calc_param), None)
            return value if isinstance(value, Decimal) else None
        if calc_type == "investment":
            if investment is None:
                return None
            return investment.total_investment
        if calc_type == "bond":
            return Decimal(20000)
        return None

    @staticmethod
    def _apply_cap(value: Decimal | None, cap: Decimal | None) -> Decimal | None:
        """对计算结果应用上限：value 或 cap 为 None 时原样返回."""
        if value is None or cap is None:
            return value
        return min(value, cap)
