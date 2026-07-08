"use client";

import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { safeFormatDate } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  TableCell,
  TableRow,
} from "@/components/ui/table";
import type { components } from "@/lib/api-types";

type CashFlowRecordResponse = components["schemas"]["CashFlowRecordResponse"];

interface LedgerDetailTableRowProps {
  record: CashFlowRecordResponse;
  isSettled: boolean;
  onDelete: (record: CashFlowRecordResponse) => void;
}

export function LedgerDetailTableRow({
  record,
  isSettled,
  onDelete,
}: LedgerDetailTableRowProps) {
  return (
    <TableRow key={record.id} className="group text-xs hover:bg-muted">
      <TableCell className="px-4 py-3">
        <span className="font-medium text-foreground">
          {record.date
            ? safeFormatDate(record.date, "yyyy-MM-dd")
            : "-"}
        </span>
      </TableCell>
      <TableCell className="px-4 py-3 text-center">
        <Badge
          variant="outline"
          className={cn(
            "font-normal",
            record.type === "income"
              ? "border-error/30 text-red-700 bg-error-container/30"
              : "border-emerald-200 text-emerald-700 bg-success-container/30",
          )}
        >
          {record.type === "income" ? "收入" : "支出"}
        </Badge>
      </TableCell>
      <TableCell className="px-4 py-3">
        <span
          className="text-muted-foreground truncate block"
          title={record.counterparty ?? ""}
        >
          {record.counterparty || "-"}
        </span>
      </TableCell>
      <TableCell className="px-4 py-3">
        <span
          className="text-foreground truncate block"
          title={record.category ?? ""}
        >
          {record.category || "-"}
        </span>
      </TableCell>
      <TableCell className="px-4 py-3 text-right">
        <span
          className={cn(
            "font-mono font-medium text-sm tabular-nums",
            record.type === "income"
              ? "text-error"
              : "text-success",
          )}
        >
          {record.type === "income" ? "+" : "-"}
          {Number(record.amount).toLocaleString("en-US", {
            minimumFractionDigits: 2,
          })}
        </span>
      </TableCell>
      <TableCell className="px-4 py-3 text-center">
        {record.receipt_urls && record.receipt_urls.length > 0 ? (
          <div className="flex items-center justify-center gap-1 flex-wrap">
            {record.receipt_urls.map((url, idx) => (
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
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell className="px-4 py-3">
        <div
          className="truncate text-muted-foreground"
          title={record.description ?? ""}
        >
          {record.description || "-"}
        </div>
      </TableCell>
      <TableCell className="px-4 py-3 text-center">
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
          aria-label={`删除 ${record.category} 记录`}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
