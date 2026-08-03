"""资金账本统计 breakdown 构造器(纯函数，无副作用).

按五层法构建计算明细：收入层 → 毛利层 → 净利层 + 现金流专属 + 配对项。
每层列出该层包含的科目明细(科目名 + 净额)。
"""

from dataclasses import dataclass
from decimal import Decimal

from models.common import BusinessForm
from schemas.project.ledger_statistics import (
    LedgerStatisticsCalcBreakdown,
    LedgerStatisticsCalcItem,
    LedgerStatisticsCalcSection,
)


@dataclass
class SubjectDetail:
    """科目明细(用于 breakdown 分组)."""

    name: str
    level: str
    net: Decimal


@dataclass
class CalcBreakdownContext:
    """build_calc_breakdown 所需的全部已计算值."""

    business_form: BusinessForm | None
    income: Decimal
    direct_cost: Decimal
    gross: Decimal
    opex: Decimal
    finance_cost: Decimal
    net: Decimal
    subject_details: list[SubjectDetail]


def build_calc_breakdown(ctx: CalcBreakdownContext) -> LedgerStatisticsCalcBreakdown:
    """构建五层法计算明细."""

    def _item(label: str, amount: Decimal) -> LedgerStatisticsCalcItem:
        return LedgerStatisticsCalcItem(label=label, sign="", amount=float(amount))

    # 按 level 分组科目明细
    by_level: dict[str, list[SubjectDetail]] = {}
    for sd in ctx.subject_details:
        by_level.setdefault(sd.level, []).append(sd)

    def _level_items(levels: list[str]) -> list[LedgerStatisticsCalcItem]:
        items: list[LedgerStatisticsCalcItem] = []
        for lv in levels:
            for sd in by_level.get(lv, []):
                items.append(_item(sd.name, sd.net))
        return items

    def _section(
        title: str,
        formula: str,
        items: list[LedgerStatisticsCalcItem],
        result: Decimal,
    ) -> LedgerStatisticsCalcSection:
        return LedgerStatisticsCalcSection(
            title=title,
            formula=formula,
            items=items,
            result=float(result),
            result_type="currency",
        )

    sections: list[LedgerStatisticsCalcSection] = [
        _section(
            "收入层(⑥收入项)",
            "level=6 的 (inflow - outflow) 合计",
            _level_items(["6"]),
            ctx.income,
        ),
        _section(
            "直接成本层(①取得成本+②直接改造成本)",
            "level∈{1,2} 的 (inflow - outflow) 合计",
            _level_items(["1", "2"]),
            ctx.direct_cost,
        ),
        _section(
            "毛利层",
            "收入层 + 直接成本层",
            [_item("收入层", ctx.income), _item("直接成本层", ctx.direct_cost)],
            ctx.gross,
        ),
        _section(
            "运营费用层(③交易费用)",
            "level=3 的 (inflow - outflow) 合计",
            _level_items(["3"]),
            ctx.opex,
        ),
        _section(
            "融资成本层(④资金成本)",
            "level=4 的 (inflow - outflow) 合计",
            _level_items(["4"]),
            ctx.finance_cost,
        ),
        _section(
            "净利层",
            "毛利层 + 运营费用层 + 融资成本层",
            [_item("毛利层", ctx.gross), _item("运营费用层", ctx.opex), _item("融资成本层", ctx.finance_cost)],
            ctx.net,
        ),
    ]

    # 现金流专属(level=5，不进损益)
    level5 = by_level.get("5")
    if level5:
        sections.append(
            _section(
                "现金流专属(⑤·不进损益)",
                "level=5 的 (inflow - outflow) 合计",
                _level_items(["5"]),
                sum((sd.net for sd in level5), Decimal(0)),
            ),
        )

    # 配对项(level=7，净额归零)
    level7 = by_level.get("7")
    if level7:
        sections.append(
            _section(
                "配对项(⑦·净额归零)",
                "level=7 的 (inflow - outflow) 合计",
                _level_items(["7"]),
                sum((sd.net for sd in level7), Decimal(0)),
            ),
        )

    return LedgerStatisticsCalcBreakdown(
        business_form=ctx.business_form.value if ctx.business_form else None,
        sections=sections,
    )
