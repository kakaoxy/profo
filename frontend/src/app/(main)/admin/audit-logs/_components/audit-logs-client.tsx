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
