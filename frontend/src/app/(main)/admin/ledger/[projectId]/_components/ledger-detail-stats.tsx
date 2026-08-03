"use client";

import { TrendingUp, TrendingDown, Wallet, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { formatCNY } from "@/lib/formatters";
import type { LedgerRecord } from "./ledger-detail-table-row";

interface LedgerDetailStatsProps {
  data: LedgerRecord[];
}

function toNumber(v: number | null | undefined): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

/**
 * 顶部统计卡：流入合计 / 流出合计 / 净现金流 / 进损益流出。
 * 进损益流出 = subject.pnl=true 的记录 outflow 合计。
 */
export function LedgerDetailStats({ data }: LedgerDetailStatsProps) {
  let inflow = 0;
  let outflow = 0;
  let pnlOut = 0;
  for (const r of data) {
    const infl = toNumber(r.inflow);
    const out = toNumber(r.outflow);
    inflow += infl;
    outflow += out;
    if (r.subject?.pnl && out > 0) pnlOut += out;
  }
  const net = inflow - outflow;

  const cards = [
    {
      label: "流入合计",
      value: `+${formatCNY(inflow)}`,
      icon: TrendingUp,
      iconBg: "bg-emerald-500",
      valueClass: "text-success",
    },
    {
      label: "流出合计",
      value: `−${formatCNY(outflow)}`,
      icon: TrendingDown,
      iconBg: "bg-amber-500",
      valueClass: "text-error",
    },
    {
      label: "净现金流",
      value: `${net >= 0 ? "+" : "−"}${formatCNY(Math.abs(net))}`,
      icon: Wallet,
      iconBg: "bg-blue-500",
      valueClass: net >= 0 ? "text-success" : "text-error",
    },
    {
      label: "进损益流出",
      value: formatCNY(pnlOut),
      icon: Receipt,
      iconBg: "bg-red-500",
      valueClass: "text-error",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card key={c.label} className="p-4 bg-card border-border shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1 min-w-0 flex-1">
                <p className="text-[11px] font-medium text-muted-foreground truncate">
                  {c.label}
                </p>
                <p
                  className={cn(
                    "text-xl font-bold tabular-nums truncate",
                    c.valueClass,
                  )}
                >
                  {c.value}
                </p>
              </div>
              <div
                className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center shrink-0 text-white",
                  c.iconBg,
                )}
                aria-hidden="true"
              >
                <Icon className="w-4 h-4" strokeWidth={1.75} />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export default LedgerDetailStats;
