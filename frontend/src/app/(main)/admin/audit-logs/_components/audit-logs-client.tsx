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
  { value: "create", label: "创建" },
  { value: "update", label: "更新" },
  { value: "delete", label: "删除" },
  { value: "sensitive_data_access", label: "敏感数据访问" },
  { value: "assign_permissions", label: "分配权限" },
] as const;

const RESOURCE_TYPE_OPTIONS = [
  { value: "user", label: "用户" },
  { value: "role", label: "角色" },
  { value: "permission", label: "权限" },
  { value: "project", label: "项目" },
  { value: "owner_bank_card", label: "业主银行卡" },
] as const;

const ALL_VALUE = "all";

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────

/** 截断 UUID 等长字符串，保留前 8 位用于表格展示。 */
function truncateId(id: string | null | undefined): string {
  if (!id) return "-";
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

/** 根据操作类型返回对应 Badge 变体。 */
function getActionBadgeVariant(action: string): "default" | "secondary" | "destructive" | "outline" {
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

/** 根据 action 值返回中文标签。 */
function getActionLabel(action: string): string {
  return ACTION_OPTIONS.find((o) => o.value === action)?.label ?? action;
}

/** 根据 resource_type 值返回中文标签。 */
function getResourceTypeLabel(resourceType: string): string {
  return RESOURCE_TYPE_OPTIONS.find((o) => o.value === resourceType)?.label ?? resourceType;
}

// ─── before/after 变更展示子组件 ──────────────────────────────────────────────

/**
 * 以 JSON 形式展示变更前/后快照。
 * - 两者均为空 → 显示「无变更记录」
 * - 仅 before（如 delete）→ 只展示变更前
 * - 仅 after（如 create）→ 只展示变更后
 * - 两者均有 → 并排展示
 */
function ChangesDisplay({
  before,
  after,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  if (!before && !after) {
    return <span className="text-sm text-muted-foreground">无变更记录</span>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {before && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">变更前</div>
          <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-60 whitespace-pre-wrap break-all">
            {JSON.stringify(before, null, 2)}
          </pre>
        </div>
      )}
      {after && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">变更后</div>
          <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-60 whitespace-pre-wrap break-all">
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
  filters: {
    user_id?: string;
    action?: string;
    resource_type?: string;
    start_time?: string;
    end_time?: string;
  };
}

export function AuditLogsClient({ initialData, filters }: AuditLogsClientProps) {
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
        className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">操作者用户ID</label>
            <Input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="输入用户ID"
              className="h-9 w-56"
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">操作类型</label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="全部操作" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>全部操作</SelectItem>
                {ACTION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">资源类型</label>
            <Select value={resourceType} onValueChange={setResourceType}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="全部资源" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>全部资源</SelectItem>
                {RESOURCE_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">开始日期</label>
            <Input
              type="date"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="h-9 w-[150px]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">结束日期</label>
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
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">时间</TableHead>
              <TableHead className="w-[120px]">操作者</TableHead>
              <TableHead className="w-[110px]">操作</TableHead>
              <TableHead className="w-[110px]">资源类型</TableHead>
              <TableHead className="w-[120px]">资源ID</TableHead>
              <TableHead className="w-[140px]">IP</TableHead>
              <TableHead className="w-[100px]">变更详情</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialData.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  暂无审计日志
                </TableCell>
              </TableRow>
            ) : (
              initialData.items.map((log: OperationLogResponse) => {
                const isExpanded = expandedId === log.id;
                const hasChanges = log.before != null || log.after != null;
                return (
                  <Fragment key={log.id}>
                    <TableRow>
                      <TableCell className="text-sm text-muted-foreground">
                        {safeFormatDate(log.created_at, "yyyy-MM-dd HH:mm:ss")}
                      </TableCell>
                      <TableCell className="text-sm font-mono" title={log.user_id ?? undefined}>
                        {truncateId(log.user_id)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getActionBadgeVariant(log.action)}>
                          {getActionLabel(log.action)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{getResourceTypeLabel(log.resource_type)}</Badge>
                      </TableCell>
                      <TableCell className="text-sm font-mono" title={log.resource_id ?? undefined}>
                        {truncateId(log.resource_id)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{log.ip ?? "-"}</TableCell>
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
                        <TableCell colSpan={7} className="bg-muted/30">
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
