"""商圈分析报表 Schema.

包含 KPI、趋势、价格分布、商圈行、对比等模型.
字段名对齐前端 types.ts.
"""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from schemas.reports.common import KpiCard


class KpiData(BaseModel):
    """报表页 4 张 KPI 卡片聚合."""

    sold_count: KpiCard = Field(description="成交套数卡片")
    avg_price_wan: KpiCard = Field(description="平均总价(万)卡片")
    avg_unit_price: KpiCard = Field(description="平均单价(元/㎡)卡片")
    on_sale_count: KpiCard = Field(description="在售套数卡片")

    model_config = ConfigDict(from_attributes=True)


class TrendDataPoint(BaseModel):
    """趋势数据点（周/月粒度）."""

    period: str = Field(description="周期起始日期 YYYY-MM-DD")
    volume: int = Field(description="成交套数")
    avg_price_wan: float | None = Field(None, description="平均总价(万)")
    avg_unit_price: float | None = Field(None, description="平均单价(元/㎡)")
    volume_qoq: float | None = Field(None, description="量环比(%)；首期或上期样本不足时为 null")
    price_qoq: float | None = Field(None, description="价环比(%)；首期或上期样本不足时为 null")
    dim_breakdown: dict[str, dict[str, Any]] | None = Field(
        None,
        description="维度下钻（户型/楼层/价格段）；overall 维度无此字段",
    )

    model_config = ConfigDict(from_attributes=True)


class PriceBucket(BaseModel):
    """价格分布桶."""

    label: str = Field(description="桶标签（如 '150-200万' 或 '<150' 或 '350+'）")
    lower: int = Field(description="下限(万元)；最低桶为 0")
    upper: int | None = Field(None, description="上限(万元)；最高桶为 null（开放区间）")
    count: int = Field(description="桶内成交套数")
    avg_area: float | None = Field(None, description="桶内平均面积(㎡)")
    avg_unit_price: float | None = Field(None, description="桶内平均单价(元/㎡)")

    model_config = ConfigDict(from_attributes=True)


class PriceDistributionResponse(BaseModel):
    """价格分布响应."""

    buckets: list[PriceBucket] = Field(description="价格桶列表")
    total: int = Field(description="成交样本总数")

    model_config = ConfigDict(from_attributes=True)


class DistributionBucket(BaseModel):
    """通用分布桶 (户型/楼层等)."""

    label: str = Field(description="桶标签 (如 '1室' / '4室+' / '低楼层')")
    count: int = Field(description="桶内成交套数")
    avg_area: float | None = Field(None, description="桶内平均面积(㎡)")
    avg_unit_price: float | None = Field(None, description="桶内平均单价(元/㎡)")

    model_config = ConfigDict(from_attributes=True)


class DistributionResponse(BaseModel):
    """通用分布响应 (户型/楼层等)."""

    buckets: list[DistributionBucket] = Field(description="分布桶列表")
    total: int = Field(description="成交样本总数")

    model_config = ConfigDict(from_attributes=True)


class BusinessDistrictRow(BaseModel):
    """商圈列表行."""

    business_circle: str = Field(description="商圈名")
    district: str | None = Field(None, description="主要行政区（众数）")
    sold_count: int = Field(description="成交套数")
    avg_price_wan: float | None = Field(None, description="平均总价(万)")
    avg_unit_price: float | None = Field(None, description="平均单价(元/㎡)")
    on_sale_count: int = Field(description="在售套数")
    absorption_months: float | None = Field(None, description="去化周期(月)；分母为 0 时为 null")
    price_qoq: float | None = Field(None, description="价格环比(%)")
    volume_qoq: float | None = Field(None, description="成交量环比(%)")

    model_config = ConfigDict(from_attributes=True)


class BusinessDistrictListResponse(BaseModel):
    """商圈列表响应."""

    items: list[BusinessDistrictRow] = Field(description="商圈行列表")
    total: int = Field(description="商圈总数")


class ComparisonSummaryRow(BaseModel):
    """对比汇总行：行=指标，列=商圈（与 business_circles 对齐）."""

    metric: str = Field(description="指标名称")
    values: list[float | None] = Field(description="各商圈对应值；与 business_circles 对齐")


class ComparisonTrendPoint(BaseModel):
    """多商圈对比趋势点：周期 + 各商圈值.

    除 period 外，其他键为商圈名，值为对应数值或 null.
    使用 extra='allow' 接收动态商圈键.
    """

    period: str = Field(description="周期起始日期 YYYY-MM-DD")

    model_config = ConfigDict(extra="allow")


class ComparisonFloorStructure(BaseModel):
    """对比楼层结构（成交套数）."""

    business_circle: str = Field(description="商圈名")
    low: int = Field(description="低楼层成交套数")
    mid: int = Field(description="中楼层成交套数")
    high: int = Field(description="高楼层成交套数")


class ComparisonRoomStructure(BaseModel):
    """对比户型结构（成交套数）."""

    business_circle: str = Field(description="商圈名")
    r1: int = Field(description="1室成交套数")
    r2: int = Field(description="2室成交套数")
    r3: int = Field(description="3室成交套数")
    r4plus: int = Field(description="4室及以上成交套数")


class ComparisonData(BaseModel):
    """多商圈对比数据."""

    business_circles: list[str] = Field(description="对比商圈名列表")
    summary: list[ComparisonSummaryRow] = Field(description="汇总行列表（7 行指标）")
    volume_trend: list[ComparisonTrendPoint] = Field(description="成交量趋势；键为商圈名")
    price_trend: list[ComparisonTrendPoint] = Field(description="均价趋势；键为商圈名")
    floor_structure: list[ComparisonFloorStructure] = Field(description="楼层结构列表")
    room_structure: list[ComparisonRoomStructure] = Field(description="户型结构列表")

    model_config = ConfigDict(from_attributes=True)


__all__ = [
    "BusinessDistrictListResponse",
    "BusinessDistrictRow",
    "ComparisonData",
    "ComparisonFloorStructure",
    "ComparisonRoomStructure",
    "ComparisonSummaryRow",
    "ComparisonTrendPoint",
    "DistributionBucket",
    "DistributionResponse",
    "KpiData",
    "PriceBucket",
    "PriceDistributionResponse",
    "TrendDataPoint",
]
