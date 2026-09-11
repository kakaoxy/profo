import { Building2, TrendingUp, TrendingDown, Wallet, Receipt } from "lucide-react";
import type { components } from "@/lib/api-types";
import { formatYuanToWan, formatYuanToWanSigned } from "@/lib/format-amount";
import { StatCardGrid, type StatItem } from "@/app/(main)/admin/_components/stat-card-grid";

type LedgerStatsResponse = components["schemas"]["LedgerStatsResponse"];

interface LedgerStatsProps {
  stats: LedgerStatsResponse;
}

/**
 * 资金账本统计卡（Steep，走共享 StatCardGrid）
 *
 * - 白底卡片 + rounded-cards + shadow-steep，无边框
 * - 图标为单色描边（Graphite / Rust），替代原 emerald/amber/blue/purple 彩色图标圆
 * - 净现金流为唯一 Apricot 暖卡（warm），承载整屏唯一彩色强调
 */
export function LedgerStats({ stats }: LedgerStatsProps) {
  const netCashFlow = stats.net_cash_flow ?? 0;

  const items: StatItem[] = [
    {
      label: "项目总数",
      value: String(stats.total_projects ?? 0),
      unit: "个",
      icon: <Building2 className="h-4 w-4" />,
    },
    {
      label: "总收入",
      value: formatYuanToWan(stats.total_income),
      icon: <TrendingUp className="h-4 w-4" />,
    },
    {
      label: "总支出",
      value: formatYuanToWan(stats.total_expense),
      icon: <TrendingDown className="h-4 w-4" />,
    },
    {
      label: "净现金流",
      value: formatYuanToWanSigned(netCashFlow),
      icon: <Wallet className="h-4 w-4" />,
      warm: true,
      // 与明细页 HeaderStats 口径一致：非负用 Rust 强调，为负回落到 Ink
      valueClassName: netCashFlow >= 0 ? "text-rust" : "text-ink",
    },
    {
      label: "流水记录数",
      value: String(stats.total_records ?? 0),
      unit: "条",
      icon: <Receipt className="h-4 w-4" />,
    },
  ];

  return <StatCardGrid items={items} columns={5} />;
}
