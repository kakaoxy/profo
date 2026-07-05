"""投资管理（跟投管理）Pydantic Schema.

按 AGENTS.md 规范：直接返回 Pydantic 模型，分 Create/Update/Response/Filter。
所有 schema 使用 ConfigDict(from_attributes=True) 以支持从 ORM 模型转换。
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from models.common import (
    InvestmentActionType,
    InvestorType,
    ProjectStatus,
    SettlementStatus,
)


# ==================== 跟投记录 ====================


class InvestmentCreate(BaseModel):
    """创建跟投记录请求."""

    project_id: str = Field(description="关联项目ID")
    total_investment: Decimal = Field(gt=0, description="投资总额(元)")
    total_return: Decimal | None = Field(None, description="收益总额(元)")
    remark: str | None = Field(None, description="备注")

    model_config = ConfigDict(from_attributes=True)


class InvestmentUpdate(BaseModel):
    """更新跟投记录请求（仅 unsettled 可改）."""

    total_investment: Decimal | None = Field(None, gt=0, description="投资总额(元)")
    total_return: Decimal | None = Field(None, description="收益总额(元)")
    remark: str | None = Field(None, description="备注")

    model_config = ConfigDict(from_attributes=True)


class InvestmentFilter(BaseModel):
    """跟投记录筛选参数."""

    search: str | None = Field(None, description="模糊搜索: 项目编号/小区/地址")
    project_status: ProjectStatus | None = Field(None, description="项目状态筛选")
    settlement_status: SettlementStatus | None = Field(None, description="跟投状态筛选")

    model_config = ConfigDict(from_attributes=True)


class InvestmentStatsResponse(BaseModel):
    """跟投汇总卡片统计响应."""

    total_projects: int = Field(description="总项目数")
    total_investment: Decimal = Field(description="投资总额合计(元)")
    total_return: Decimal = Field(description="收益总额合计(元)")
    avg_return_ratio: float = Field(description="加权平均回报率(%)")
    unsettled_count: int = Field(description="未结算项目数")

    model_config = ConfigDict(from_attributes=True)


# ==================== 子投资人 / 投资方 ====================


class SubInvestorCreate(BaseModel):
    """创建子投资人请求（属于某母投资方，内部占比）."""

    name: str = Field(min_length=1, max_length=200, description="子投资人姓名")
    share_ratio: Decimal = Field(gt=0, le=100, description="内部占比(%)")
    remark: str | None = Field(None, description="备注")

    model_config = ConfigDict(from_attributes=True)


class SubInvestorUpdate(BaseModel):
    """更新子投资人请求."""

    name: str | None = Field(None, min_length=1, max_length=200, description="子投资人姓名")
    share_ratio: Decimal | None = Field(None, gt=0, le=100, description="内部占比(%)")
    remark: str | None = Field(None, description="备注")

    model_config = ConfigDict(from_attributes=True)


class InvestorResponse(BaseModel):
    """投资方响应（含嵌套子投资人）."""

    id: str = Field(description="投资方ID")
    investment_id: str = Field(description="关联跟投记录ID")
    name: str = Field(description="投资方名称")
    type: InvestorType = Field(description="投资方类型")
    share_ratio: Decimal = Field(description="占比(母:占项目比例; 子:内部占比)")
    invest_amount: Decimal = Field(description="投资金额(元)")
    parent_id: str | None = Field(None, description="母投资方ID")
    sort_order: int | None = Field(None, description="排序序号")
    remark: str | None = Field(None, description="备注")
    sub_investors: list[InvestorResponse] = Field(default_factory=list, description="子投资人列表")

    model_config = ConfigDict(from_attributes=True)


class InvestorCreate(BaseModel):
    """创建投资方请求（母投资方）."""

    name: str = Field(min_length=1, max_length=200, description="投资方名称")
    type: InvestorType = Field(description="投资方类型: enterprise/individual")
    share_ratio: Decimal = Field(gt=0, le=100, description="占项目总投资额比例(%)")
    remark: str | None = Field(None, description="备注")
    sub_investors: list[SubInvestorCreate] | None = Field(None, description="子投资人列表")

    model_config = ConfigDict(from_attributes=True)


class InvestorUpdate(BaseModel):
    """更新投资方请求（仅 unsettled 可改）."""

    name: str | None = Field(None, min_length=1, max_length=200, description="投资方名称")
    type: InvestorType | None = Field(None, description="投资方类型")
    share_ratio: Decimal | None = Field(None, gt=0, le=100, description="占项目总投资额比例(%)")
    remark: str | None = Field(None, description="备注")
    sub_investors: list[SubInvestorCreate] | None = Field(None, description="子投资人列表(整体替换)")

    model_config = ConfigDict(from_attributes=True)


# ==================== 回报率调整 ====================


class ReturnAdjustmentItem(BaseModel):
    """单条回报率调整项."""

    investor_id: str = Field(description="投资方ID")
    adjusted_return_ratio: Decimal = Field(ge=0, description="调整后回报率(%)")
    remark: str | None = Field(None, description="调整备注")

    model_config = ConfigDict(from_attributes=True)


class ReturnAdjustmentBatchRequest(BaseModel):
    """批量回报率调整请求."""

    adjustments: list[ReturnAdjustmentItem] = Field(min_length=1, description="调整项列表")

    model_config = ConfigDict(from_attributes=True)


class ReturnAdjustmentResponse(BaseModel):
    """回报率调整记录响应."""

    id: str = Field(description="调整记录ID")
    investment_id: str = Field(description="关联跟投记录ID")
    investor_id: str = Field(description="关联投资方ID")
    default_return_ratio: Decimal = Field(description="默认回报率(%)")
    adjusted_return_ratio: Decimal = Field(description="调整后回报率(%)")
    adjusted_amount: Decimal = Field(description="调整后收益金额(元)")
    adjusted_by: str = Field(description="调整人ID")
    adjusted_at: datetime = Field(description="调整时间")
    remark: str | None = Field(None, description="调整备注")

    model_config = ConfigDict(from_attributes=True)


# ==================== 结算 / 反结算 / 复制 ====================


class SettlementChangeRequest(BaseModel):
    """结算请求（unsettled → settled）."""

    settled_note: str | None = Field(None, description="结算说明")
    settled_date: date = Field(description="结算日期")

    model_config = ConfigDict(from_attributes=True)


class UnsettleRequest(BaseModel):
    """反结算请求（settled → unsettled）."""

    reason: str = Field(min_length=1, description="反结算原因")

    model_config = ConfigDict(from_attributes=True)


class CopyInvestmentRequest(BaseModel):
    """复制跟投配置到目标项目请求."""

    target_project_id: str = Field(description="目标项目ID")

    model_config = ConfigDict(from_attributes=True)


# ==================== 操作日志 ====================


class InvestmentLogResponse(BaseModel):
    """操作日志响应.

    operator_id / operator_name 为冗余字段，由 Service 层联表 User 填充。
    """

    id: str = Field(description="日志ID")
    investment_id: str = Field(description="关联跟投记录ID")
    action_type: InvestmentActionType = Field(description="操作类型")
    detail: dict = Field(default_factory=dict, description="操作详情(JSON)")
    operator_id: str = Field(
        description="操作人ID",
        validation_alias=AliasChoices("operator_id", "operator"),
    )
    operator_name: str | None = Field(None, description="操作人名称(冗余)")
    created_at: datetime = Field(description="操作时间")

    model_config = ConfigDict(from_attributes=True)


# ==================== 跟投记录响应（完整 + 列表项） ====================


class InvestmentResponse(BaseModel):
    """跟投记录完整响应（详情页）."""

    id: str = Field(description="跟投记录ID")
    project_id: str = Field(description="关联项目ID")
    project_code: str = Field(description="项目编号(冗余)")
    project_name: str = Field(description="项目名称(冗余)")
    total_investment: Decimal = Field(description="投资总额(元)")
    total_return: Decimal | None = Field(None, description="收益总额(元)")
    settlement_status: SettlementStatus = Field(description="结算状态")
    settled_date: date | None = Field(None, description="结算日期")
    settled_note: str | None = Field(None, description="结算说明")
    remark: str | None = Field(None, description="备注")
    created_by: str = Field(description="创建人ID")
    created_at: datetime = Field(description="创建时间")
    updated_at: datetime = Field(description="更新时间")
    investors: list[InvestorResponse] = Field(default_factory=list, description="母投资方列表(含嵌套子投资人)")
    logs: list[InvestmentLogResponse] | None = Field(None, description="操作日志列表(可选)")

    model_config = ConfigDict(from_attributes=True)


class InvestmentListItemResponse(BaseModel):
    """跟投记录列表项响应（精简版）."""

    id: str = Field(description="跟投记录ID")
    project_id: str = Field(description="关联项目ID")
    project_code: str = Field(description="项目编号(冗余)")
    project_name: str = Field(description="项目名称(冗余)")
    project_address: str | None = Field(None, description="物业地址(来自关联Project)")
    project_status: ProjectStatus | None = Field(None, description="项目状态(来自关联Project)")
    settlement_status: SettlementStatus = Field(description="跟投状态")
    total_investment: Decimal = Field(description="投资总额(元)")
    total_return: Decimal | None = Field(None, description="收益总额(元)")
    return_ratio: float = Field(description="回报率(%)")
    investor_count: int = Field(description="投资方数量")

    model_config = ConfigDict(from_attributes=True)


class InvestmentListResponse(BaseModel):
    """跟投记录列表分页响应."""

    items: list[InvestmentListItemResponse] = Field(description="跟投记录列表")
    total: int = Field(description="总记录数")
    page: int = Field(description="当前页码")
    page_size: int = Field(description="每页数量")

    model_config = ConfigDict(from_attributes=True)


# 解析嵌套自引用（InvestorResponse.sub_investors）
InvestorResponse.model_rebuild()
InvestmentResponse.model_rebuild()
