"""项目待办看板响应 Schema.

规则引擎实时计算签约+装修阶段项目待办，不落库、只读快照。
rule_code（R1~R10，R8 扩展为「R8·工序名」）与 anchor 为前后端稳定契约。
规则阈值配置（todo_board_rules）存储于 system_configs，见
docs/2026-10-02-待办看板规则配置-spec.md。
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from constants.project_todo import BASIC_INFO_FIELD_NAMES, MILESTONE_STAGES

TodoPriority = Literal["p0", "p1", "p2"]

# 详情页分区锚点代码（前端映射到 PROJECT_SECTION_IDS）
TodoAnchor = Literal["overview", "documents", "renovation_contract", "renovation_progress"]

# 阈值天数允许范围（与前端步进器一致）
MAX_RULE_DAYS = 999

# R2 字段三态
TodoFieldLevel = Literal["core", "minor", "off"]


class TodoItemOut(BaseModel):
    """单条待办."""

    rule_code: str = Field(description="规则编号 R1~R10，稳定契约（业务界面不展示）")
    priority: TodoPriority = Field(description="优先级：p0 阻塞/逾期，p1 重要滞后，p2 易遗忘项")
    title: str = Field(description="待办名称")
    hint: str | None = Field(None, description="卡片灰色短语（单行上下文）")
    items: list[str] = Field(default_factory=list, description="弹窗缺失明细（前端不拼文案）")
    days_label: str | None = Field(None, description="右侧天数徽标文案，如「逾期 12 天」「剩 21 天」")
    days_hot: bool = Field(default=False, description="天数是否 Rust 强调（逾期/超期/停滞/已超）")
    overdue_days: int | None = Field(None, description="逾期/滞后天数数值口径；临近类为 null")
    anchor: TodoAnchor = Field(description="详情页分区锚点代码")


class TodoManagerBrief(BaseModel):
    """项目负责人简要信息."""

    id: str = Field(description="用户ID")
    name: str | None = Field(None, description="姓名（nickname，缺省回退 username）")

    model_config = ConfigDict(from_attributes=True)


class TodoProjectCard(BaseModel):
    """单项目待办卡片."""

    project_id: UUID = Field(description="项目ID")
    community_name: str = Field(description="小区名称（含门牌识别靠 community_name+contract_no）")
    contract_no: str | None = Field(None, description="合同编号")
    status: Literal["signing", "renovating"] = Field(description="项目阶段")
    renovation_stage: str | None = Field(None, description="装修当前工序（中文枚举）；签约阶段为 null")
    renovation_company: str | None = Field(None, description="合作装修公司（施工方）；未填写为 null")
    business_form: Literal["agent", "wholesale"] | None = Field(
        None, description="业务形式；null 时卡片显示「业务形式未设置」并命中 R3a"
    )
    manager: TodoManagerBrief | None = Field(None, description="项目负责人")
    todo_count: int = Field(description="规则命中总条数（截断前）")
    p0_count: int = Field(description="P0 条数（≥1 时前端显示计数徽章）")
    todos: list[TodoItemOut] = Field(description="待办列表（已排序，≤6 条）")
    todo_overflow: int = Field(0, description="被折叠条数（超出每卡上限）")


class TodoBoardSummary(BaseModel):
    """看板统计（全量口径，不随前端筛选变化）."""

    project_count: int = Field(description="有待办的项目数")
    todo_count: int = Field(description="待办总条数（截断前）")
    p0_count: int = Field(description="P0 待办总条数")
    max_overdue_days: int | None = Field(None, description="最深逾期天数；无逾期类待办时 null")


class ProjectTodoBoardResponse(BaseModel):
    """项目待办看板聚合响应."""

    generated_at: datetime = Field(description="规则快照服务端时间")
    summary: TodoBoardSummary
    projects: list[TodoProjectCard] = Field(description="项目卡片（已按 P0 多→P1 多→滞后深排序）")


# ── 规则阈值配置（system_configs 键 todo_board_rules） ────────────────────


class TodoBoardRulesData(BaseModel):
    """规则阈值配置主体（GET 响应与 PUT 请求共用结构；PUT 全量提交）."""

    milestone_days: dict[str, int] = Field(description="R8 工序里程碑：{工序: 交房后 N 天内须完成}")
    milestone_p0_overdue_days: int = Field(ge=1, le=999, description="R8 里程碑逾期超 N 天 P1→P0")
    basic_info_grace_days: int = Field(ge=1, le=999, description="R2：签约后 N 天仍缺基础信息才提示")
    basic_info_fields: dict[str, TodoFieldLevel] = Field(description="R2 字段集：{字段: core|minor|off}")
    company_grace_days: int = Field(ge=1, le=999, description="R6：进入装修后未安排施工方宽限天数")
    start_grace_days: int = Field(ge=1, le=999, description="R7：进入装修后未实际开工宽限天数")
    archive_overdue_days: int = Field(ge=1, le=999, description="R4：签署后超 N 天未归档升 P1")
    commission_near_days: int = Field(ge=1, le=999, description="R10：委托期结束前 N 天进入临近窗口")
    delivery_total_days: int = Field(ge=1, le=999, description="详情页 KPI 交付倒计时：交房日 + N 天 = 交付截止")
    delivery_near_days: int = Field(ge=1, le=999, description="交付倒计时剩余 ≤ N 天橙色提示")
    delivery_urgent_days: int = Field(ge=1, le=999, description="交付倒计时剩余 < N 天红色脉冲（判断优先于橙色）")

    @model_validator(mode="after")
    def _check_keys_and_ranges(self) -> "TodoBoardRulesData":
        """工序/字段键集合必须齐全且天数在 1~999（前端全量提交自 GET 响应）."""
        errors: list[str] = []
        missing_stages = [s for s in MILESTONE_STAGES if s not in self.milestone_days]
        extra_stages = [k for k in self.milestone_days if k not in MILESTONE_STAGES]
        if missing_stages:
            errors.append(f"milestone_days 缺少工序键: {missing_stages}")
        if extra_stages:
            errors.append(f"milestone_days 含未知工序键: {extra_stages}")
        bad_days = {k: v for k, v in self.milestone_days.items() if not 1 <= v <= MAX_RULE_DAYS}
        if bad_days:
            errors.append(f"milestone_days 天数须在 1~{MAX_RULE_DAYS}: {bad_days}")
        missing_fields = [f for f in BASIC_INFO_FIELD_NAMES if f not in self.basic_info_fields]
        extra_fields = [k for k in self.basic_info_fields if k not in BASIC_INFO_FIELD_NAMES]
        if missing_fields:
            errors.append(f"basic_info_fields 缺少字段键: {missing_fields}")
        if extra_fields:
            errors.append(f"basic_info_fields 含未知字段键: {extra_fields}")
        if errors:
            msg = "；".join(errors)
            raise ValueError(msg)
        return self


class TodoBoardRulesResponse(TodoBoardRulesData):
    """GET /todo-board/config 响应：当前生效值 + 元信息 + 出厂默认值."""

    updated_at: datetime | None = Field(None, description="最后保存时间；从未保存（缺行回退默认）为 null")
    updated_by_name: str | None = Field(None, description="最后修改人姓名；从未保存为 null")
    defaults: TodoBoardRulesData = Field(description="代码内出厂默认值（供前端「恢复默认」，避免前后端镜像漂移）")


class TodoBoardRulesUpdateRequest(TodoBoardRulesData):
    """PUT /todo-board/config 请求体：全量提交."""
