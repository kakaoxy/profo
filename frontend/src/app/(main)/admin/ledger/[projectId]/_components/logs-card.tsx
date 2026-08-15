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

type FinanceLogResponse = components["schemas"]["FinanceLogResponse"];
type FinanceActionType = components["schemas"]["FinanceActionType"];

interface LogsCardProps {
  logs: FinanceLogResponse[];
}

/**
 * 操作日志 detail 字段的结构(后端 finance.py 各 action 写入):
 * - create/delete: { category, amount(str), type, counterparty, date }
 * - settle: { settled_date, settled_note }
 * - unsettle: { reason }
 * 后端 amount 为 str(record.amount),即字符串形式。
 */
interface LogDetail {
  category?: string | null;
  amount?: string | null;
  type?: string | null;
  counterparty?: string;
  date?: string | null;
  settled_date?: string | null;
  settled_note?: string | null;
  reason?: string | null;
  [key: string]: unknown;
}

/** 操作日志内容：action_type 翻译为中文 + detail 摘要 */
function formatLogContent(
  actionType: FinanceActionType,
  detail: { [key: string]: unknown } | undefined,
): string {
  const d = (detail ?? {}) as LogDetail;

  let action: string;
  let summary = "";

  switch (actionType) {
    case "create":
      action = "创建记录";
      summary = [d.category ?? "", d.amount != null ? formatCNY(d.amount) : ""]
        .filter(Boolean)
        .join(" · ");
      break;
    case "delete":
      action = "删除记录";
      summary = [d.category ?? "", d.amount != null ? formatCNY(d.amount) : ""]
        .filter(Boolean)
        .join(" · ");
      break;
    case "settle":
      action = "结算";
      summary = [d.settled_date ?? "", d.settled_note ?? ""].filter(Boolean).join(" · ");
      break;
    case "unsettle":
      action = "反结算";
      summary = d.reason ?? "";
      break;
    default:
      action = actionType;
      summary = "";
  }

  return summary ? `${action} · ${summary}` : action;
}

export function LogsCard({ logs }: LogsCardProps) {
  return (
    <Card className="rounded-cards border-0 shadow-steep-sm">
      <CardContent className="space-y-5 p-6">
        <div>
          <h2 className="text-base font-semibold text-ink flex items-center gap-2">
            <span aria-hidden="true">📝</span>
            操作日志
          </h2>
        </div>
        {logs.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-sm text-graphite">
            暂无操作日志
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-dove/40 hover:bg-transparent">
                  <TableHead className="min-w-[150px] text-graphite font-medium">时间</TableHead>
                  <TableHead className="min-w-[130px] text-graphite font-medium">操作人</TableHead>
                  <TableHead className="min-w-[280px] text-graphite font-medium">
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
