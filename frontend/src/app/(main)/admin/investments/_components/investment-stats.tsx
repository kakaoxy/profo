import { Card } from "@/components/ui/card";
import { Building2, Coins, TrendingUp, Percent, AlertCircle } from "lucide-react";
import type { components } from "@/lib/api-types";
import { formatCNY, formatPercent } from "@/lib/formatters";

type InvestmentStatsResponse = components["schemas"]["InvestmentStatsResponse"];

interface InvestmentStatsProps {
  stats: InvestmentStatsResponse;
}

interface CardConfig {
  label: string;
  value: string;
  subValue?: string;
  icon: typeof Building2;
  iconBg: string;
  valueClass?: string;
}

export function InvestmentStats({ stats }: InvestmentStatsProps) {
  const avgRatio = stats.avg_return_ratio ?? 0;
  const ratioColorClass =
    avgRatio > 0
      ? "text-money-positive"
      : avgRatio < 0
        ? "text-money-negative"
        : "text-muted-foreground";

  const cards: CardConfig[] = [
    {
      label: "总项目",
      value: String(stats.total_projects ?? 0),
      subValue: "个",
      icon: Building2,
      iconBg: "bg-primary",
    },
    {
      label: "投资总额",
      value: formatCNY(stats.total_investment),
      icon: Coins,
      iconBg: "bg-amber-500",
      valueClass: "tabular-nums",
    },
    {
      label: "收益总额",
      value: formatCNY(stats.total_return),
      icon: TrendingUp,
      iconBg: "bg-emerald-500",
      valueClass: "tabular-nums",
    },
    {
      label: "加权平均回报率",
      value: formatPercent(avgRatio),
      icon: Percent,
      iconBg: "bg-blue-500",
      valueClass: `tabular-nums ${ratioColorClass}`,
    },
    {
      label: "未结算",
      value: String(stats.unsettled_count ?? 0),
      subValue: "个",
      icon: AlertCircle,
      iconBg: "bg-red-500",
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
                <p className="text-xs font-medium text-muted-foreground truncate">{card.label}</p>
                <div className="flex items-baseline gap-1.5">
                  <p
                    className={`text-xl font-bold text-foreground truncate ${card.valueClass ?? ""}`}
                  >
                    {card.value}
                  </p>
                  {card.subValue && (
                    <span className="text-xs text-muted-foreground">{card.subValue}</span>
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
