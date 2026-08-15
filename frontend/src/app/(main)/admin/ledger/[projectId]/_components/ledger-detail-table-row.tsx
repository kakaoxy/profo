"use client";

import { Paperclip, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { safeFormatDate, formatCNY } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { TableCell, TableRow } from "@/components/ui/table";
import type { components } from "@/lib/api-types";
import { toNumber } from "@/lib/number-utils";
import { LayerPill } from "./layer-pill";

type CashFlowRecordResponse = components["schemas"]["CashFlowRecordResponse"];

interface LedgerDetailTableRowProps {
  record: CashFlowRecordResponse;
  isSettled: boolean;
  onDelete: (record: CashFlowRecordResponse) => void;
  onSupplementVoucher: (record: CashFlowRecordResponse) => void;
}

export function LedgerDetailTableRow({
  record,
  isSettled,
  onDelete,
  onSupplementVoucher,
}: LedgerDetailTableRowProps) {
  const hasVoucher = !!(record.receipt_urls && record.receipt_urls.length > 0);
  const outflow = toNumber(record.outflow) ?? 0;
  const inflow = toNumber(record.inflow) ?? 0;
  const subject = record.subject;
  const summary = record.description || record.remark || "-";

  return (
    <TableRow key={record.id} className="group text-xs hover:bg-muted">
      {/* 日期 */}
      <TableCell className="px-4 py-3">
        <span className="font-medium text-foreground tabular-nums">
          {record.date ? safeFormatDate(record.date, "yyyy-MM-dd") : "-"}
        </span>
      </TableCell>
      {/* 科目分类（名称 + LayerPill） */}
      <TableCell className="px-4 py-3">
        {subject ? (
          <div className="flex flex-col gap-1">
            <span className="font-medium text-foreground truncate text-xs" title={subject.name}>
              {subject.name}
            </span>
            <LayerPill level={subject.level} />
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      {/* 付款方 */}
      <TableCell className="px-4 py-3">
        <span className="text-muted-foreground truncate block" title={record.payer ?? ""}>
          {record.payer || "-"}
        </span>
      </TableCell>
      {/* 收款方 */}
      <TableCell className="px-4 py-3">
        <span className="text-muted-foreground truncate block" title={record.payee ?? ""}>
          {record.payee || "-"}
        </span>
      </TableCell>
      {/* 流出（绿色，中国习惯） */}
      <TableCell className="px-4 py-3 text-right">
        {outflow > 0 ? (
          <span className="font-mono font-medium text-sm tabular-nums text-money-negative">
            −{formatCNY(outflow)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      {/* 流入（红色，中国习惯） */}
      <TableCell className="px-4 py-3 text-right">
        {inflow > 0 ? (
          <span className="font-mono font-medium text-sm tabular-nums text-money-positive">
            +{formatCNY(inflow)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      {/* 凭证 */}
      <TableCell className="px-4 py-3 text-center">
        {hasVoucher ? (
          <div className="flex items-center justify-center gap-1 flex-wrap">
            {record.receipt_urls!.map((url, idx) => (
              <HoverCard key={url + idx}>
                <HoverCardTrigger asChild>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`查看票据 ${idx + 1}`}
                    aria-label={`查看票据 ${idx + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`票据 ${idx + 1}`}
                      width={28}
                      height={28}
                      loading="lazy"
                      className="size-7 rounded object-cover border border-border"
                    />
                  </a>
                </HoverCardTrigger>
                <HoverCardContent className="p-1 w-auto">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`票据 ${idx + 1}`}
                    className="rounded-lg border max-w-[320px] h-auto"
                  />
                </HoverCardContent>
              </HoverCard>
            ))}
          </div>
        ) : (
          <Badge
            variant="outline"
            className="font-normal border-amber-300 text-amber-700 bg-amber-50"
          >
            缺凭证
          </Badge>
        )}
      </TableCell>
      {/* 摘要（移至凭证和操作之间） */}
      <TableCell className="px-4 py-3">
        <span className="text-foreground truncate block" title={summary}>
          {summary}
        </span>
      </TableCell>
      {/* 操作 */}
      <TableCell className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 w-7 p-0 text-muted-foreground hover:text-foreground transition-opacity",
              isSettled
                ? "opacity-0 pointer-events-none"
                : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            )}
            onClick={() => onSupplementVoucher(record)}
            disabled={isSettled}
            aria-label="补充凭证"
            title="补充凭证"
          >
            <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 w-7 p-0 text-muted-foreground hover:text-destructive transition-opacity",
              isSettled
                ? "opacity-0 pointer-events-none"
                : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            )}
            onClick={() => onDelete(record)}
            disabled={isSettled}
            aria-label="删除记录"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
