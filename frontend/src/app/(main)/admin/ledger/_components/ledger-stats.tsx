import { Card } from "@/components/ui/card";
import {
  Building2,
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
} from "lucide-react";
import type { components } from "@/lib/api-types";
import { formatCNY } from "@/lib/formatters";

type LedgerStatsResponse = components["schemas"]["LedgerStatsResponse"];

interface LedgerStatsProps {
  stats: LedgerStatsResponse;
}

interface CardConfig {
  label: string;
  value: string;
  subValue?: string;
  icon: typeof Building2;
  iconBg: string;
  valueClass?: string;
}

export function LedgerStats({ stats }: LedgerStatsProps) {
  const netCashFlow = stats.net_cash_flow ?? 0;
  const netColorClass =
    netCashFlow > 0
      ? "text-money-positive"
      : netCashFlow < 0
        ? "text-money-negative"
        : "text-muted-foreground";

  const cards: CardConfig[] = [
    {
      label: "项目总数",
      value: String(stats.total_projects ?? 0),
      subValue: "个",
      icon: Building2,
      iconBg: "bg-primary",
    },
    {
      label: "总收入",
      value: formatCNY(stats.total_income),
      icon: TrendingUp,
      iconBg: "bg-emerald-500",
      valueClass: "tabular-nums",
    },
    {
      label: "总支出",
      value: formatCNY(stats.total_expense),
      icon: TrendingDown,
      iconBg: "bg-amber-500",
      valueClass: "tabular-nums",
    },
    {
      label: "净现金流",
      value: formatCNY(netCashFlow),
      icon: Wallet,
      iconBg: "bg-blue-500",
      valueClass: `tabular-nums ${netColorClass}`,
    },
    {
      label: "流水记录数",
      value: String(stats.total_records ?? 0),
      subValue: "条",
      icon: Receipt,
      iconBg: "bg-purple-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card
            key={card.label}
            className="p-4 bg-card border-border shadow-sm transition-colors hover:bg-muted/50"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1 min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground truncate">
                  {card.label}
                </p>
                <div className="flex items-baseline gap-1.5">
                  <p
                    className={`text-xl font-bold text-foreground truncate ${card.valueClass ?? ""}`}
                  >
                    {card.value}
                  </p>
                  {card.subValue && (
                    <span className="text-xs text-muted-foreground">
                      {card.subValue}
                    </span>
                  )}
                </div>
              </div>
              <div
                className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${card.iconBg} text-white`}
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
