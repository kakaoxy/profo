"""工作台布局 Schema（迭代二 SPEC §6.2）."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# 布局来源（K11 三级 fallback 对外可见）
LayoutSource = Literal["user", "role", "fallback"]

# 角色码（仅内置三角色可配置默认布局）
WorkbenchRole = Literal["admin", "operator", "user"]


class WorkbenchWidgetEntry(BaseModel):
    """布局中的单个 widget 条目（K14：只存 key/order/enabled）."""

    key: str = Field(description="widget 注册表 key")
    order: int = Field(description="排序值，间隔 10")
    enabled: bool = Field(description="是否显示")


class WorkbenchConfigResponse(BaseModel):
    """当前用户生效布局."""

    source: LayoutSource = Field(description="来源：user=个人覆盖 / role=角色默认 / fallback=代码兜底")
    widgets: list[WorkbenchWidgetEntry] = Field(description="已按权限过滤并按 order 排序")


class WorkbenchLayoutUpdateRequest(BaseModel):
    """保存个人布局请求."""

    widgets: list[WorkbenchWidgetEntry] = Field(description="全量提交；未注册 key 会被后端丢弃")


class WorkbenchWidgetInfo(BaseModel):
    """widget 注册表条目（管理端展示用）."""

    key: str = Field(description="widget key")
    label: str = Field(description="中文名")
    description: str = Field(description="说明")
    permission: str | None = Field(None, description="所需权限码；None 表示仅需登录")
    default_span: int = Field(description="注册表默认栅格宽度（仅展示，不入布局 JSON）")
    model_config = ConfigDict(from_attributes=True)


class WorkbenchRoleLayoutsResponse(BaseModel):
    """三角色默认布局 + widget 注册表."""

    roles: dict[str, list[WorkbenchWidgetEntry]] = Field(description="角色 → 条目列表")
    widgets: list[WorkbenchWidgetInfo] = Field(description="12 个 widget 的注册信息")


class WorkbenchRoleLayoutsUpdateRequest(BaseModel):
    """保存角色默认布局请求（管理员）."""

    roles: dict[str, list[WorkbenchWidgetEntry]] = Field(description="角色 → 条目列表")


__all__ = [
    "LayoutSource",
    "WorkbenchConfigResponse",
    "WorkbenchLayoutUpdateRequest",
    "WorkbenchRole",
    "WorkbenchRoleLayoutsResponse",
    "WorkbenchRoleLayoutsUpdateRequest",
    "WorkbenchWidgetEntry",
    "WorkbenchWidgetInfo",
]
