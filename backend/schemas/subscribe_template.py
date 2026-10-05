"""小程序订阅消息模板 ID 配置 Schema.

模板 ID 存储于 system_configs KV 表（单键 JSON 全量），DB 值优先、
留空回退 env 兜底（``settings.wechat_*_template_id``）。
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# 生效来源：db=数据库配置值 / env=环境变量兜底 / none=均未配置（功能关闭）
SubscribeTemplateSource = Literal["db", "env", "none"]


class SubscribeTemplateValue(BaseModel):
    """单个模板 ID 的配置与生效状态."""

    db_value: str = ""  # DB 配置值（""=未设置）
    env_value: str = ""  # env 兜底值（只读展示）
    effective_value: str = ""  # 生效值 = db_value or env_value
    source: SubscribeTemplateSource = "none"  # 生效来源


class SubscribeTemplatesResponse(BaseModel):
    """订阅消息模板配置读取响应."""

    recruit_lead: SubscribeTemplateValue
    valuation_price: SubscribeTemplateValue
    customer_lead: SubscribeTemplateValue
    # 房源频道订阅（上新/调价）：C 端房源列表页订阅提醒 + 营销管理通知链路
    project_new: SubscribeTemplateValue
    project_price_change: SubscribeTemplateValue
    updated_at: datetime | None = None  # 行级审计（三键同行）
    updated_by_name: str | None = None


class SubscribeTemplatesUpdateRequest(BaseModel):
    """订阅消息模板配置保存请求（全量提交，留空 = 清除 DB 值回退 env）."""

    recruit_lead: str = Field("", max_length=128)
    valuation_price: str = Field("", max_length=128)
    customer_lead: str = Field("", max_length=128)
    # 房源频道订阅（上新/调价）：C 端房源列表页订阅提醒 + 营销管理通知链路
    project_new: str = Field("", max_length=128)
    project_price_change: str = Field("", max_length=128)
