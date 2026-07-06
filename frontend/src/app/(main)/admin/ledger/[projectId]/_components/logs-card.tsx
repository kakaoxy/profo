"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCNY, safeFormatDate } from "@/lib/formatters";
import type { components } from "@/lib/api-types";
import { fetchLogs } from "../../actions";

type FinanceLogResponse = components["schemas"]["FinanceLogResponse"];
type FinanceActionType = components["schemas"]["FinanceActionType"];

interface LogsCardProps {
  projectId: string;
}

/** 操作日志内容：action_type 翻译为中文 + detail 摘要（分类 + 金额，如有） */
function formatLogContent(
  actionType: FinanceActionType,
  detail: { [key: string]: unknown } | undefined,
): string {
  const d = detail ?? {};
  const category = d.category != null ? String(d.category) : "";
  const amount = d.amount != null ? formatCNY(String(d.amount)) : "";

  let action: string;
  switch (actionType) {
    case "create":
      action = "创建记录";
      break;
    case "delete":
      action = "删除记录";
      break;
    default:
      action = actionType;
  }

  const summary = [category, amount].filter(Boolean).join(" · ");
  return summary ? `${action} · ${summary}` : action;
}

export function LogsCard({ projectId }: LogsCardProps) {
  const [logs, setLogs] = useState<FinanceLogResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchLogs(projectId);
        if (active) {
          setLogs(res.success ? res.data : []);
        }
      } catch {
        if (active) setLogs([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [projectId]);

  return (
    <Card className="rounded-3xl border-border shadow-sm">
      <CardContent className="space-y-5 p-6">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <span aria-hidden="true">📝</span>
            操作日志
          </h2>
        </div>
        {loading ? (
          <div
            className="flex items-center justify-center py-10 text-sm text-muted-foreground"
            aria-live="polite"
          >
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            加载中…
          </div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            暂无操作日志
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="min-w-[150px] text-muted-foreground font-medium">
                    时间
                  </TableHead>
                  <TableHead className="min-w-[130px] text-muted-foreground font-medium">
                    操作人
                  </TableHead>
                  <TableHead className="min-w-[280px] text-muted-foreground font-medium">
                    操作内容
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {safeFormatDate(log.created_at, "yyyy-MM-dd HH:mm")}
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.operator_name || log.operator_id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatLogContent(log.action_type, log.detail)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
