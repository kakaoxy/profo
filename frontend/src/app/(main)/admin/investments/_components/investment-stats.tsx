import { Building2, Coins, TrendingUp, Percent, AlertCircle } from "lucide-react";
import type { components } from "@/lib/api-types";
import { formatCNY, formatPercent } from "@/lib/formatters";
import { StatCardGrid, type StatItem } from "@/app/(main)/admin/_components/stat-card-grid";

type InvestmentStatsResponse = components["schemas"]["InvestmentStatsResponse"];

interface InvestmentStatsProps {
  stats: InvestmentStatsResponse;
}

export function InvestmentStats({ stats }: InvestmentStatsProps) {
  const avgRatio = stats.avg_return_ratio ?? 0;
  const ratioColorClass =
    avgRatio > 0 ? "text-money-positive" : avgRatio < 0 ? "text-money-negative" : "text-graphite";

  const items: StatItem[] = [
    {
      label: "总项目",
      value: String(stats.total_projects ?? 0),
      unit: "个",
      icon: <Building2 className="h-4 w-4" />,
    },
    {
      label: "投资总额",
      value: formatCNY(stats.total_investment),
      icon: <Coins className="h-4 w-4" />,
    },
    {
      label: "收益总额",
      value: formatCNY(stats.total_return),
      icon: <TrendingUp className="h-4 w-4" />,
    },
    {
      label: "加权平均回报率",
      value: formatPercent(avgRatio),
      icon: <Percent className="h-4 w-4" />,
      valueClassName: ratioColorClass,
    },
    {
      label: "未结算",
      value: String(stats.unsettled_count ?? 0),
      unit: "个",
      icon: <AlertCircle className="h-4 w-4" />,
    },
  ];

  return <StatCardGrid items={items} columns={5} />;
}
