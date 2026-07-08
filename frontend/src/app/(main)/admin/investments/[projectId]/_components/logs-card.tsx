"use client";

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
import {
  type InvestmentActionType,
  type InvestmentLogResponse,
  type InvestmentResponse,
} from "./shared";

/** 操作日志内容：action_type 翻译为中文 + detail 摘要 */
function formatLogContent(
  actionType: InvestmentActionType,
  detail: { [key: string]: unknown } | undefined,
): string {
  const d = detail ?? {};
  const str = (v: unknown): string => (v == null ? "" : String(v));
  switch (actionType) {
    case "create":
      return `创建跟投记录${
        d.total_investment ? `，投资总额 ${formatCNY(str(d.total_investment))}` : ""
      }`;
    case "status_change":
      return `状态变更${d.action === "soft_delete" ? "（软删除）" : ""}`;
    case "ratio_adjust":
    case "distribution_adjust":
      return `调整分配比例${d.count ? `，共 ${d.count} 项` : ""}`;
    case "investor_add":
      return `添加投资方：${d.name ?? "-"}${
        d.share_ratio ? `（${d.share_ratio}%）` : ""
      }${d.sub_count ? `，含 ${d.sub_count} 位子投资人` : ""}`;
    case "investor_edit":
      return `编辑投资方：${d.name ?? "-"}`;
    case "investor_delete":
      return `删除投资方：${d.name ?? "-"}`;
    case "sub_investor_add":
      return `添加子投资人${d.name ? `：${d.name}` : ""}`;
    case "sub_investor_edit":
      return `编辑子投资人${d.name ? `：${d.name}` : ""}`;
    case "sub_investor_delete":
      return `删除子投资人${d.name ? `：${d.name}` : ""}`;
    case "total_investment_change": {
      const ti = d.total_investment as { from?: string; to?: string } | undefined;
      return `修改投资总额${
        ti ? `：${formatCNY(ti.from)} → ${formatCNY(ti.to)}` : ""
      }`;
    }
    case "total_return_change": {
      const tr = d.total_return as { from?: string; to?: string } | undefined;
      return `修改收益总额${
        tr ? `：${formatCNY(tr.from)} → ${formatCNY(tr.to)}` : ""
      }`;
    }
    case "settle":
      return `结算跟投记录${
        d.settled_date ? `，结算日期 ${d.settled_date}` : ""
      }`;
    case "unsettle":
      return `反结算：${d.reason ?? "-"}`;
    default:
      return actionType;
  }
}

/** 操作日志卡：时间、操作人、操作内容 */
export function LogsCard({ investment }: { investment: InvestmentResponse }) {
  const logs = investment.logs ?? [];

  return (
    <Card>
      <CardContent className="space-y-5">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <span>📝</span>
            操作日志
          </h2>
        </div>
        {logs.length === 0 ? (
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
                {logs.map((log: InvestmentLogResponse) => (
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
