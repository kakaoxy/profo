# 审计日志可读性改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **本仓库工作区规则（AGENTS.md）**：禁止 agent 执行 `git commit` / `git push`。因此所有 Task **不含提交步骤**——完成全部 Task 后整理变更清单与验证证据，由人工审核提交。测试策略遵循 AGENTS：不写单元测试，以 E2E 作为唯一测试机制并在收尾执行。

**Goal:** 审计日志页一眼看懂：操作人显示昵称/用户名（而非 UUID 截断）、操作对象显示人类可读名称（项目名/角色名等）、操作人筛选从「粘贴用户ID」改为「下拉选人」，并按《Don't Make Me Think》重写全部文案。

**Architecture:** 后端在 Service 层批量解析可读名称（每类资源一次 IN 查询，无 N+1），Pydantic 响应模型新增 `operator_name` / `resource_name` 两个可空字段；Router 层组装（遵循本仓库「Service 不 import schemas」分层惯例）。前端复用现有 `/users/simple` 接口做操作人下拉，表格列「操作者/操作/资源类型/资源ID」合并精简为「操作人/动作/对象」。契约变更先改 Pydantic → `pnpm gen-api` 同步前端类型。

**Tech Stack:** FastAPI + SQLAlchemy(sync Session) + Pydantic v2；Next.js Server Component + shadcn/ui；Playwright E2E。

---

## 现状与问题（改前）

前端 [audit-logs-client.tsx](file:///Users/bugco/Desktop/profo/frontend/src/app/(main)/admin/audit-logs/_components/audit-logs-client.tsx) 表格列：时间 | 操作者(截断UUID) | 操作 | 资源类型 | 资源ID(截断UUID) | IP | 变更详情；筛选区要求手输「操作者用户ID」。后端 [operation_log.py](file:///Users/bugco/Desktop/profo/backend/services/system/operation_log.py) 不联表，[OperationLogResponse](file:///Users/bugco/Desktop/profo/backend/schemas/operation_log.py#L11-L26) 只有 `user_id` / `resource_id`。

## 文案重写对照表（产品决策，已定稿）

| 位置 | 改前 | 改后 | 理由（DMNT） |
|---|---|---|---|
| 页头描述 | 记录后台关键操作，支持按用户、动作与资源类型追溯 | 后台每一步操作都有记录：谁改的、改了什么、什么时候改的 | 「追溯/动作/资源类型」是术语；改后一句话说清页面价值 |
| 筛选·操作者 | 操作者用户ID + 手输 UUID | 操作人 + 下拉选人（昵称（用户名）） | 让人粘贴 UUID 是最坏的交互 |
| 筛选·操作类型 | 操作类型 | 动作 | 与表头一致，见列名即知筛选项 |
| 筛选·资源类型 | 资源类型 | 对象 | 「资源」是工程师语言，「对象」更日常 |
| 表头 | 操作者/操作/资源类型/资源ID | 操作人/动作/对象(类型徽章+名称)/IP/详情 | 类型徽章+名称同格，消除「资源ID」裸列 |
| 动作标签 | 创建/更新/删除/敏感数据访问/退出登录 | 新增/修改/删除/查看敏感信息/退出登录 | 动词口语化；「敏感数据访问」→「查看敏感信息」 |
| 空状态 | 暂无审计日志 | 没有找到相关记录，试试调整筛选条件或时间范围 | 说明下一步怎么做 |
| 无变更提示 | 无变更记录 | 这条记录没有内容变化 | 说人话 |
| 未识别的枚举值 | 显示原始值(如 `biz_dict_item`) | 显示中文标签 | 标签映射补全到全部已知类型 |

**资源类型 → 可读名称解析注册表（后端）**：

| resource_type | 名称来源 | 备注 |
|---|---|---|
| user | `User.nickname or username` | 复用操作人解析 |
| role | `Role.name` | Role.id 是 String(36)，无需 UUID 转换 |
| project | `Project.name` | Uuid 主键 |
| project_sales | `ProjectSale → join Project → name` | 子资源二跳取项目名 |
| project_document | `ProjectDocument.document_name` | Uuid 主键 |
| project_renovation | `ProjectRenovation → join Project → name` | 二跳 |
| project_finance | `FinanceRecord → join Project → name` | 二跳；finance_records.id 为 Uuid，str 必须 `uuid.UUID()` 转换（PostgreSQL 无 uuid↔varchar 隐式转换） |
| owner_bank_card | `ProjectOwner.owner_name` | 可空，为空则回退 |
| 其余类型（auth/community/property/fund_account/api_key/biz_dict_item/…） | 不注册，`resource_name=null` | 前端回退显示短 ID + 悬停完整 ID |

---

### Task 1: 后端——响应模型加可读名称字段

**Files:**
- Modify: `backend/schemas/operation_log.py:11-26`

- [ ] **Step 1: OperationLogResponse 增加两个字段**

```python
class OperationLogResponse(BaseModel):
    """操作审计日志响应模型."""

    id: UUID4 = Field(description="日志ID")
    user_id: str | None = Field(None, description="操作者用户ID(逻辑外键)")
    # 可读名称由 Router 层批量解析后填充；用户/资源已删除或类型未注册时为 None
    operator_name: str | None = Field(None, description="操作人可读名称(昵称优先，无则用户名)")
    action: str = Field(description="操作类型：create/update/delete/sensitive_data_access等")
    resource_type: str = Field(description="资源类型：user/role/permission/project等")
    resource_id: str | None = Field(None, description="资源ID")
    resource_name: str | None = Field(None, description="资源可读名称(项目名/角色名等)，无法解析时为None")
    ip: str | None = Field(None, description="操作者IP地址(IPv4/IPv6)")
    user_agent: str | None = Field(None, description="User-Agent")
    before: dict[str, Any] | None = Field(None, description="变更前快照")
    after: dict[str, Any] | None = Field(None, description="变更后快照")
    created_at: datetime = Field(description="创建时间")
    updated_at: datetime = Field(description="更新时间")

    model_config = ConfigDict(from_attributes=True)
```

- [ ] **Step 2: 语法自检**

Run: `cd backend && .venv/bin/python -c "import schemas.operation_log"`
Expected: 无输出（导入成功）

---

### Task 2: 后端——Service 层批量解析可读名称

**Files:**
- Modify: `backend/services/system/operation_log.py`（文件头 import 区 + 文件末尾、`operation_log_service` 实例之前新增两个模块级函数）

- [ ] **Step 1: 文件头新增 import**

```python
import uuid

from models.project import (
    FinanceRecord,
    Project,
    ProjectDocument,
    ProjectOwner,
    ProjectRenovation,
    ProjectSale,
)
from models.user.user import Role, User
```

（`models.project.__init__` 已导出上述全部模型；`models/user/user.py` 同时定义 Role/User。）

- [ ] **Step 2: 在 `operation_log_service = OperationLogService()` 之前新增解析函数**

```python
def _safe_uuid(value: str | None) -> uuid.UUID | None:
    """operation_logs.resource_id 是 String(36)，查询 Uuid 主键列前必须转成 uuid.UUID.

    PostgreSQL 不存在 uuid↔varchar 隐式转换，直接传 str 会报错；
    历史脏值/非法值返回 None 跳过，不让解析失败影响主流程。
    """
    if not value:
        return None
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


def _collect_ids(logs: list[OperationLog], resource_type: str) -> set[uuid.UUID]:
    """收集指定 resource_type 的全部合法 UUID 资源ID，非法值跳过。"""
    return {
        u
        for u in (_safe_uuid(log.resource_id) for log in logs if log.resource_type == resource_type and log.resource_id)
        if u is not None
    }


def resolve_operator_names(db: Session, logs: list[OperationLog]) -> dict[str, str]:
    """批量解析操作人可读名称（昵称优先，无昵称用用户名）.

    一次 IN 查询 users 表，返回 {user_id: 名称}；已删除用户不出现在结果中。
    """
    user_ids = {log.user_id for log in logs if log.user_id}
    if not user_ids:
        return {}
    rows = db.query(User.id, User.nickname, User.username).filter(User.id.in_(user_ids)).all()
    return {row.id: (row.nickname or row.username) for row in rows}


def resolve_resource_names(db: Session, logs: list[OperationLog]) -> dict[str, dict[str, str]]:
    """按 resource_type 分组批量解析资源可读名称.

    每个类型至多一次 IN 查询（子资源经 project_id 二跳 join 项目名），
    每页 20 条日志的解析开销恒定，无 N+1。
    返回 {resource_type: {resource_id: 名称}}；未注册类型不出现在结果中。
    """
    if not logs:
        return {}

    result: dict[str, dict[str, str]] = {}

    # ── 字符串主键表（无需 UUID 转换）──
    user_ids = {log.resource_id for log in logs if log.resource_type == "user" and log.resource_id}
    if user_ids:
        rows = db.query(User.id, User.nickname, User.username).filter(User.id.in_(user_ids)).all()
        result["user"] = {r.id: (r.nickname or r.username) for r in rows}

    role_ids = {log.resource_id for log in logs if log.resource_type == "role" and log.resource_id}
    if role_ids:
        rows = db.query(Role.id, Role.name).filter(Role.id.in_(role_ids)).all()
        result["role"] = {r.id: r.name for r in rows}

    # ── Uuid 主键表（str → uuid.UUID 后才能 IN）──
    project_ids = _collect_ids(logs, "project")
    if project_ids:
        rows = db.query(Project.id, Project.name).filter(Project.id.in_(project_ids)).all()
        result["project"] = {str(r.id): r.name for r in rows}

    sale_ids = _collect_ids(logs, "project_sales")
    if sale_ids:
        rows = (
            db.query(ProjectSale.id, Project.name)
            .join(Project, Project.id == ProjectSale.project_id)
            .filter(ProjectSale.id.in_(sale_ids))
            .all()
        )
        result["project_sales"] = {str(r.id): r.name for r in rows}

    renovation_ids = _collect_ids(logs, "project_renovation")
    if renovation_ids:
        rows = (
            db.query(ProjectRenovation.id, Project.name)
            .join(Project, Project.id == ProjectRenovation.project_id)
            .filter(ProjectRenovation.id.in_(renovation_ids))
            .all()
        )
        result["project_renovation"] = {str(r.id): r.name for r in rows}

    finance_ids = _collect_ids(logs, "project_finance")
    if finance_ids:
        rows = (
            db.query(FinanceRecord.id, Project.name)
            .join(Project, Project.id == FinanceRecord.project_id)
            .filter(FinanceRecord.id.in_(finance_ids))
            .all()
        )
        result["project_finance"] = {str(r.id): r.name for r in rows}

    document_ids = _collect_ids(logs, "project_document")
    if document_ids:
        rows = db.query(ProjectDocument.id, ProjectDocument.document_name).filter(ProjectDocument.id.in_(document_ids)).all()
        result["project_document"] = {str(r.id): r.document_name for r in rows}

    owner_ids = _collect_ids(logs, "owner_bank_card")
    if owner_ids:
        rows = db.query(ProjectOwner.id, ProjectOwner.owner_name).filter(ProjectOwner.id.in_(owner_ids)).all()
        result["owner_bank_card"] = {str(r.id): r.owner_name for r in rows if r.owner_name}

    return result
```

- [ ] **Step 3: ruff 与导入自检**

Run: `cd backend && ruff check services/system/operation_log.py && ruff format services/system/operation_log.py && .venv/bin/python -c "from services.system.operation_log import resolve_operator_names, resolve_resource_names"`
Expected: 全部通过，无输出报错

---

### Task 3: 后端——Router 组装可读名称

**Files:**
- Modify: `backend/routers/system/operation_logs.py:33-67`

- [ ] **Step 1: list_operation_logs 组装**

```python
@router.get("")
def list_operation_logs(
    db: DbSessionDep,
    _current_user: OperationLogReadPermDep,
    pagination: PaginationDep,
    user_id: Annotated[str | None, Query(max_length=36, description="按操作者用户ID过滤")] = None,
    action: Annotated[str | None, Query(max_length=50, description="按操作类型过滤: create/update/delete等")] = None,
    resource_type: Annotated[
        str | None,
        Query(max_length=50, description="按资源类型过滤: user/role/permission/project等"),
    ] = None,
    start_time: Annotated[datetime | None, Query(description="起始时间过滤(>=, ISO 8601)")] = None,
    end_time: Annotated[datetime | None, Query(description="结束时间过滤(<=, ISO 8601)")] = None,
) -> OperationLogListResponse:
    """分页查询操作审计日志.

    支持按 user_id/action/resource_type/时间范围筛选，按 created_at 倒序排列。
    每条日志附带 operator_name / resource_name 两个可读名称字段（批量解析，无 N+1）。
    需要 ``operation_log:read`` 权限。
    """
    total, logs = operation_log_service.list_operation_logs(
        db,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        start_time=start_time,
        end_time=end_time,
        page=pagination.page,
        page_size=pagination.page_size,
    )
    operator_names = operation_log_service.resolve_operator_names(db, logs)
    resource_names = operation_log_service.resolve_resource_names(db, logs)
    items = [
        OperationLogResponse.model_validate(
            log,
            update={
                "operator_name": operator_names.get(log.user_id) if log.user_id else None,
                "resource_name": resource_names.get(log.resource_type, {}).get(log.resource_id or ""),
            },
        )
        for log in logs
    ]
    return OperationLogListResponse(
        items=items,
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
    )
```

（Router 已 import `operation_log_service`；`model_validate(obj, update=...)` 为 Pydantic v2 标准用法。）

- [ ] **Step 2: ruff 检查**

Run: `cd backend && ruff check routers/system/operation_logs.py && ruff format routers/system/operation_logs.py`
Expected: 通过

- [ ] **Step 3: 启动后端并 curl 验证（临时验证，凭据走环境变量，严禁写入任何文件）**

```bash
# 后端以调试模式运行（若已在跑则 --reload 自动生效，跳过启动）
# cd backend && .venv/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8000

TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"$TEST_USERNAME\", \"password\": \"$TEST_PASSWORD\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -s -H "Authorization: Bearer $TOKEN" \
  'http://127.0.0.1:8000/api/v1/operation-logs?page=1&page_size=5' \
  | python3 -m json.tool | head -60
```

Expected: 每条 item 多出 `"operator_name"`（有 user_id 的行非空）与 `"resource_name"`（project/role 等注册类型非空，如项目名/角色名）。
⚠️ 若数据库前 5 条全是不带 user_id/resource_id 的行（如 auth 登录流），翻页多看几页确认。

- [ ] **Step 4: 验证脚本清理**

确认未新增任何临时脚本文件；若过程创建了 `tmp/` 下脚本，用完即删。

---

### Task 4: 前端类型同步（pnpm gen-api）

**Files:**
- Modify（生成，不手改）: `frontend/src/lib/api-types.ts`（或生成机制对应的输出文件）

- [ ] **Step 1: 生成**

Run: `cd frontend && pnpm gen-api`
Expected: 生成成功，`OperationLogResponse` 出现 `operator_name` / `resource_name`

- [ ] **Step 2: 确认生成结果**

Run: `cd frontend && grep -n "operator_name" src/lib/api-types.ts | head -3`
Expected: 出现在 `OperationLogResponse` schema 定义中

- [ ] **Step 3: 基线 tsc**

Run: `cd frontend && pnpm exec tsc --noEmit`
Expected: 0 错误（新字段为可选，现有代码不受影响）

---

### Task 5: 前端——页面与文案改造（page.tsx）

**Files:**
- Modify: `frontend/src/app/(main)/admin/audit-logs/page.tsx`

- [ ] **Step 1: 全文替换为**

```tsx
import { Suspense } from "react";
import { Loader2 } from "lucide-react";

import { getOperationLogsAction } from "./actions/audit-log-actions";
import { getUsersSimpleAction } from "../users/actions/user-actions";
import { PageContainer, PageHeader } from "@/app/(main)/admin/_components";
import { AuditLogsClient } from "./_components/audit-logs-client";

/**
 * 审计日志页面（Server Component）。
 * 仅具备 operation_log:read 权限的用户可访问（PATH_PERMISSION_MAP 在 layout 层拦截）。
 * 操作人下拉数据来自 /users/simple（登录态即可访问），与日志列表并行请求，消除瀑布。
 */
export default async function AuditLogsPage(props: {
  searchParams: Promise<{
    page?: string;
    page_size?: string;
    user_id?: string;
    action?: string;
    resource_type?: string;
    start_time?: string;
    end_time?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const page = Number(searchParams.page) || 1;
  const page_size = Number(searchParams.page_size) || 20;
  const user_id = searchParams.user_id || undefined;
  const action = searchParams.action || undefined;
  const resource_type = searchParams.resource_type || undefined;
  // 时间范围：input[type=date] 产生 yyyy-MM-dd，转为 ISO datetime 传给后端
  const start_time = searchParams.start_time ? `${searchParams.start_time}T00:00:00` : undefined;
  const end_time = searchParams.end_time ? `${searchParams.end_time}T23:59:59` : undefined;

  // 无依赖请求必须并行（AGENTS §2 消除请求瀑布）；人员列表失败不阻塞日志页，降级为空下拉
  const [logsResult, usersResult] = await Promise.all([
    getOperationLogsAction({ page, page_size, user_id, action, resource_type, start_time, end_time }),
    getUsersSimpleAction(),
  ]);

  if (!logsResult.success) {
    return <div className="p-4 text-error">获取审计日志失败: {logsResult.message}</div>;
  }

  const operators = usersResult.success
    ? usersResult.data.items.map((u) => ({ id: u.id, nickname: u.nickname, username: u.username }))
    : [];

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <PageHeader
          title="审计日志"
          description="后台每一步操作都有记录：谁改的、改了什么、什么时候改的"
        />

        <Suspense
          fallback={
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          }
        >
          <AuditLogsClient
            initialData={logsResult.data}
            operators={operators}
            filters={{
              user_id,
              action,
              resource_type,
              start_time: searchParams.start_time,
              end_time: searchParams.end_time,
            }}
          />
        </Suspense>
      </PageContainer>
    </div>
  );
}
```

⚠️ 已知边界：`getUsersSimpleAction()` 后端默认 `page_size=100`，内部用户超过 100 时下拉不完整——当前规模可接受，超出时再扩展该 action 的分页参数（YAGNI）。

---

### Task 6: 前端——客户端组件改造（筛选下拉 + 表格 + 文案）

**Files:**
- Modify: `frontend/src/app/(main)/admin/audit-logs/_components/audit-logs-client.tsx`

- [ ] **Step 1: 全文替换为**

```tsx
"use client";

import { Fragment, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, RotateCcw, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/common/pagination";
import { safeFormatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";

import type { OperationLogListResponse, OperationLogResponse } from "../actions/audit-log-actions";

// ─── 筛选选项常量 ─────────────────────────────────────────────────────────────

const ACTION_OPTIONS = [
  { value: "create", label: "新增" },
  { value: "update", label: "修改" },
  { value: "delete", label: "删除" },
  { value: "sensitive_data_access", label: "查看敏感信息" },
  { value: "assign_permissions", label: "分配权限" },
  { value: "assign_role", label: "分配角色" },
  { value: "remove_role", label: "移除角色" },
  { value: "login_success", label: "登录成功" },
  { value: "login_failure", label: "登录失败" },
  { value: "logout", label: "退出登录" },
  { value: "revoke", label: "撤销" },
] as const;

// 仅高频类型进筛选下拉；全部已知类型的展示标签必须完整（见下方映射）
const RESOURCE_TYPE_FILTER_OPTIONS = [
  { value: "user", label: "用户" },
  { value: "role", label: "角色" },
  { value: "permission", label: "权限" },
  { value: "project", label: "项目" },
  { value: "project_sales", label: "项目销售" },
  { value: "project_document", label: "项目文书" },
  { value: "project_renovation", label: "项目装修" },
  { value: "project_finance", label: "项目账本" },
  { value: "owner_bank_card", label: "业主银行卡" },
] as const;

// 展示用标签映射：覆盖全部真实写入的 resource_type（含筛选下拉未收录的低频类型）
const RESOURCE_TYPE_LABELS: Record<string, string> = {
  user: "用户",
  role: "角色",
  permission: "权限",
  project: "项目",
  project_sales: "项目销售",
  project_document: "项目文书",
  project_renovation: "项目装修",
  project_finance: "项目账本",
  owner_bank_card: "业主银行卡",
  auth: "账号",
  community: "小区",
  property: "房源",
  building_dict: "楼盘字典",
  building_dict_pending: "字典审核",
  building_dict_config: "字典配置",
  fund_account: "资金账户",
  fund_account_adjustment: "资金调整",
  api_key: "API密钥",
  biz_dict_item: "业务字典",
  lead_evaluator_contact: "评估人联系方式",
  workbench: "工作台",
  system: "系统",
};

const ALL_VALUE = "all";

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────

/** 未知类型兜底：截断 UUID 等长字符串，保留前 8 位。 */
function truncateId(id: string | null | undefined): string {
  if (!id) return "-";
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

/** 根据动作类型返回对应 Badge 变体。 */
function getActionBadgeVariant(
  action: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (action) {
    case "create":
      return "default";
    case "update":
      return "secondary";
    case "delete":
      return "destructive";
    case "sensitive_data_access":
      return "outline";
    case "assign_permissions":
      return "secondary";
    default:
      return "outline";
  }
}

/** 根据动作值返回中文标签。 */
function getActionLabel(action: string): string {
  return ACTION_OPTIONS.find((o) => o.value === action)?.label ?? action;
}

/** 根据对象类型返回中文标签，未知类型显示原值。 */
function getResourceTypeLabel(resourceType: string): string {
  return RESOURCE_TYPE_LABELS[resourceType] ?? resourceType;
}

// ─── 变更详情子组件 ───────────────────────────────────────────────────────────

/**
 * 以 JSON 形式展示变更前/后快照。
 * - 两者均为空 → 显示「这条记录没有内容变化」
 * - 仅 before（如删除）→ 只展示变更前
 * - 仅 after（如新增）→ 只展示变更后
 * - 两者均有 → 并排展示
 * ⚠️ 快照 JSON 的键名仍是后端字段名（技术快照），中文化属于独立迭代，不在本次范围。
 */
function ChangesDisplay({
  before,
  after,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  if (!before && !after) {
    return <span className="text-sm text-graphite">这条记录没有内容变化</span>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {before && (
        <div>
          <div className="text-xs font-medium text-graphite mb-1">变更前</div>
          <pre className="rounded-inputs bg-fog p-3 text-xs overflow-auto max-h-60 whitespace-pre-wrap break-all">
            {JSON.stringify(before, null, 2)}
          </pre>
        </div>
      )}
      {after && (
        <div>
          <div className="text-xs font-medium text-graphite mb-1">变更后</div>
          <pre className="rounded-inputs bg-fog p-3 text-xs overflow-auto max-h-60 whitespace-pre-wrap break-all">
            {JSON.stringify(after, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

interface AuditLogsClientProps {
  initialData: OperationLogListResponse;
  /** 操作人下拉数据（服务端取自 /users/simple） */
  operators: { id: string; nickname: string | null; username: string }[];
  filters: {
    user_id?: string;
    action?: string;
    resource_type?: string;
    start_time?: string;
    end_time?: string;
  };
}

export function AuditLogsClient({ initialData, operators, filters }: AuditLogsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 筛选表单本地状态（初始化自 URL 参数）
  const [userId, setUserId] = useState(filters.user_id ?? "");
  const [action, setAction] = useState(filters.action ?? ALL_VALUE);
  const [resourceType, setResourceType] = useState(filters.resource_type ?? ALL_VALUE);
  const [startTime, setStartTime] = useState(filters.start_time ?? "");
  const [endTime, setEndTime] = useState(filters.end_time ?? "");

  // 当前展开的变更详情行 ID
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /** 提交筛选：将筛选条件同步到 URL 并重置到第 1 页。 */
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);

    if (userId) params.set("user_id", userId);
    else params.delete("user_id");

    if (action && action !== ALL_VALUE) params.set("action", action);
    else params.delete("action");

    if (resourceType && resourceType !== ALL_VALUE) params.set("resource_type", resourceType);
    else params.delete("resource_type");

    if (startTime) params.set("start_time", startTime);
    else params.delete("start_time");

    if (endTime) params.set("end_time", endTime);
    else params.delete("end_time");

    params.set("page", "1");
    router.replace(`${pathname}?${params.toString()}`);
  };

  /** 重置所有筛选条件。 */
  const handleReset = () => {
    setUserId("");
    setAction(ALL_VALUE);
    setResourceType(ALL_VALUE);
    setStartTime("");
    setEndTime("");
    const params = new URLSearchParams(searchParams);
    params.delete("user_id");
    params.delete("action");
    params.delete("resource_type");
    params.delete("start_time");
    params.delete("end_time");
    params.set("page", "1");
    router.replace(`${pathname}?${params.toString()}`);
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 筛选表单 */}
      <form
        onSubmit={handleSearch}
        className="flex flex-col gap-3 rounded-cards bg-white p-6 shadow-steep"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-graphite">操作人</label>
            <Select
              value={userId || ALL_VALUE}
              onValueChange={(v) => setUserId(v === ALL_VALUE ? "" : v)}
            >
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder="全部人员" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>全部人员</SelectItem>
                {operators.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nickname ? `${o.nickname}（${o.username}）` : o.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-graphite">动作</label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="全部动作" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>全部动作</SelectItem>
                {ACTION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-graphite">对象</label>
            <Select value={resourceType} onValueChange={setResourceType}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="全部对象" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>全部对象</SelectItem>
                {RESOURCE_TYPE_FILTER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-graphite">开始日期</label>
            <Input
              type="date"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="h-9 w-[150px]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-graphite">结束日期</label>
            <Input
              type="date"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="h-9 w-[150px]"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" className="h-9 gap-1.5">
              <Search className="h-4 w-4" />
              查询
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={handleReset}
            >
              <RotateCcw className="h-4 w-4" />
              重置
            </Button>
          </div>
        </div>
      </form>

      {/* 表格 */}
      <div className="rounded-cards bg-white shadow-steep overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">时间</TableHead>
              <TableHead className="w-[140px]">操作人</TableHead>
              <TableHead className="w-[120px]">动作</TableHead>
              <TableHead className="w-[240px]">对象</TableHead>
              <TableHead className="w-[140px]">IP</TableHead>
              <TableHead className="w-[100px]">详情</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialData.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-graphite">
                  没有找到相关记录，试试调整筛选条件或时间范围
                </TableCell>
              </TableRow>
            ) : (
              initialData.items.map((log: OperationLogResponse) => {
                const isExpanded = expandedId === log.id;
                const hasChanges = log.before != null || log.after != null;
                return (
                  <Fragment key={log.id}>
                    <TableRow>
                      <TableCell className="text-sm text-graphite">
                        {safeFormatDate(log.created_at, "yyyy-MM-dd HH:mm:ss")}
                      </TableCell>
                      <TableCell
                        className={cn("text-sm", !log.operator_name && "font-mono")}
                        title={log.user_id ?? undefined}
                      >
                        {log.operator_name ?? (log.user_id ? truncateId(log.user_id) : "—")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getActionBadgeVariant(log.action)}>
                          {getActionLabel(log.action)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{getResourceTypeLabel(log.resource_type)}</Badge>
                          <span
                            className={cn(
                              "text-sm truncate max-w-[160px]",
                              !log.resource_name && "font-mono",
                            )}
                            title={log.resource_id ?? undefined}
                          >
                            {log.resource_name ?? (log.resource_id ? truncateId(log.resource_id) : "—")}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-graphite">{log.ip ?? "-"}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 px-2"
                          onClick={() => toggleExpand(log.id)}
                          disabled={!hasChanges}
                        >
                          <ChevronRight
                            className={cn(
                              "h-4 w-4 transition-transform",
                              isExpanded && "rotate-90",
                            )}
                          />
                          查看
                        </Button>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-fog/60">
                          <ChangesDisplay before={log.before ?? null} after={log.after ?? null} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* 分页 */}
      <Pagination
        mode="url"
        totalItems={initialData.total}
        pageParamName="page"
        sizeParamName="page_size"
        defaultPageSize={20}
        showPageSizeSelector
        showFirstLastButtons
      />
    </div>
  );
}
```

- [ ] **Step 2: 类型与 lint**

Run: `cd frontend && pnpm exec tsc --noEmit && pnpm lint`
Expected: 0 错误

---

### Task 7: E2E 验证（唯一测试机制，收尾执行）

**Files:**
- Create: `frontend/e2e/admin-audit-logs-readable.spec.ts`

- [ ] **Step 1: 写 E2E（可复验工件）**

```ts
// 审计日志可读性 E2E：操作人/对象显示人类可读名称，筛选支持下拉选人。
// 前置：后端 :8000 + 前端 :3000 运行；E2E_ADMIN_USER / E2E_ADMIN_PASSWORD 由环境变量提供。
// 运行（凭据从 .env 读 TEST_USERNAME/TEST_PASSWORD，严禁硬编码）：
//   set -a; source ../.env; set +a
//   export E2E_ADMIN_USER=$TEST_USERNAME E2E_ADMIN_PASSWORD=$TEST_PASSWORD
//   npx playwright test e2e/admin-audit-logs-readable.spec.ts --reporter=line

import { test, expect } from "@playwright/test";
import { createApiContext, loginPage, FRONTEND_BASE } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

test("API 契约：user_id 非空的行 operator_name 可读，resource_name 非 UUID", async () => {
  const { ctx, dispose } = await createApiContext();
  const res = await ctx.get("/api/v1/operation-logs?page=1&page_size=20");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  await dispose();

  expect(body.items.length).toBeGreaterThan(0);
  for (const item of body.items) {
    // 操作人：已存在用户必须解析出名称；名称一旦存在则不能是 UUID 形态
    if (item.user_id) {
      expect(
        item.operator_name === null ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.operator_name),
        `user_id=${item.user_id} 的 operator_name 应为可读名称或 null，实际: ${item.operator_name}`,
      ).toBeTruthy();
    }
    // 对象：注册类型（如 project/role）应解析出名称；任何 resource_name 都不能是 UUID
    expect(
      item.resource_name === null ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.resource_name),
      `resource_id=${item.resource_id} 的 resource_name 不应为 UUID，实际: ${item.resource_name}`,
    ).toBeTruthy();
  }
});

test("UI：表头新文案 + 首行操作人显示名称 + 操作人下拉可选人", async ({ page }) => {
  await loginPage(page);

  const { ctx, dispose } = await createApiContext();
  const res = await ctx.get("/api/v1/operation-logs?page=1&page_size=20");
  const body = await res.json();
  await dispose();

  await page.goto(`${FRONTEND_BASE}/admin/audit-logs`);
  await expect(page.getByRole("columnheader", { name: "操作人" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "动作" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "对象" })).toBeVisible();
  // 旧文案不得残留
  await expect(page.getByRole("columnheader", { name: "资源ID" })).toHaveCount(0);

  // 首行操作人与 API 一致（有可读名称时）
  const firstOperator = body.items.find((i: { user_id: string | null }) => i.user_id)?.operator_name;
  if (firstOperator) {
    await expect(
      page.locator("tbody tr").filter({ has: page.getByText(firstOperator, { exact: true }) }).first(),
    ).toBeVisible();
  }

  // 操作人筛选是下拉而非 ID 输入框：点开后能看到人员昵称选项
  const operatorTrigger = page.locator("form").getByRole("combobox").first();
  await operatorTrigger.click();
  const anyOperator = body.items.map((i: { operator_name: string | null }) => i.operator_name).find(Boolean);
  if (anyOperator) {
    await expect(page.getByRole("option").filter({ hasText: anyOperator }).first()).toBeVisible();
  }
});

test("UI：空状态引导文案", async ({ page }) => {
  await loginPage(page);
  await page.goto(`${FRONTEND_BASE}/admin/audit-logs?user_id=00000000-0000-0000-0000-000000000000`);
  await expect(page.getByText("没有找到相关记录，试试调整筛选条件或时间范围")).toBeVisible();
});
```

- [ ] **Step 2: 运行本 spec（不跑全套）**

Run:
```bash
cd frontend
set -a; source ../.env; set +a
export E2E_ADMIN_USER=$TEST_USERNAME E2E_ADMIN_PASSWORD=$TEST_PASSWORD
npx playwright test e2e/admin-audit-logs-readable.spec.ts --reporter=line
```
Expected: 3 passed

- [ ] **Step 3: 提交前全局自检（不 commit）**

Run: `cd backend && ruff check . && ruff format --check .`
Run: `cd frontend && pnpm exec tsc --noEmit && pnpm lint`
Expected: 全部通过

- [ ] **Step 4: 整理变更清单与验证证据，交人工审核提交（禁止执行 git commit/push）**

---

## ⚠️ 未覆盖 / 范围外（显式标注）

1. **变更详情 JSON 键名中文化**：`before/after` 快照键是后端字段名（如 `listing_date`），中文化需要逐字段的字段字典，属于独立迭代；本次仅改外围文案。
2. **未注册资源类型**（community/property/fund_account/api_key/biz_dict_item/workbench/lead_evaluator_contact/building_dict*/auth/system）不解析名称，前端回退显示短 ID + 悬停完整 ID；后续按需在注册表中补一行即可。
3. **操作人下拉上限 100 人**（`/users/simple` 默认页大小），内部用户超限时需扩展该 action 的分页参数。
4. **用户被物理删除**的历史日志：`operator_name=null`，前端回退短 ID（可追溯性由悬停完整 ID 保留）。
5. 筛选下拉仅保留现有 9 类高频对象，避免选项爆炸；全部类型的**展示**标签已补全。

## DESIGN.md 合规自检

- 仅使用既有 token：`text-graphite`、`bg-fog`、`rounded-cards`、`shadow-steep`、`rounded-inputs`、`font-mono`、Badge 既有 variant；无新增色值/间距/圆角/阴影。
- 响应式：筛选区 `flex-wrap` 保持；对象列名称 `truncate` 防溢出。
- 键盘焦点：Select/Input 均为 shadcn 原生组件，自带焦点环。
- 暗色模式：DESIGN.md 未定义 admin 暗色规范，不涉及。
