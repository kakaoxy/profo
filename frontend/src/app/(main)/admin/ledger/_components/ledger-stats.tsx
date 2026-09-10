import { Building2, TrendingUp, TrendingDown, Wallet, Receipt } from "lucide-react";
import type { components } from "@/lib/api-types";
import { formatYuanToWan, formatYuanToWanSigned } from "@/lib/format-amount";

type LedgerStatsResponse = components["schemas"]["LedgerStatsResponse"];

interface LedgerStatsProps {
  stats: LedgerStatsResponse;
}

interface StatCard {
  label: string;
  value: string;
  suffix?: string;
  icon: typeof Building2;
  /** 暖卡：整屏仅净现金流一张，承载唯一的彩色强调（Apricot 底） */
  warm?: boolean;
  /** 数值配色覆盖；缺省时暖卡用 Rust、白卡用 Ink */
  valueClass?: string;
}

/**
 * 资金账本统计卡（Steep）
 *
 * - 白底卡片 + rounded-cards + shadow-steep-sm，无边框
 * - 图标为单色描边（Graphite / Rust），替代原 emerald/amber/blue/purple 彩色图标圆
 * - 净现金流为唯一 Apricot 暖卡
 */
export function LedgerStats({ stats }: LedgerStatsProps) {
  const netCashFlow = stats.net_cash_flow ?? 0;

  const cards: StatCard[] = [
    {
      label: "项目总数",
      value: String(stats.total_projects ?? 0),
      suffix: "个",
      icon: Building2,
    },
    {
      label: "总收入",
      value: formatYuanToWan(stats.total_income),
      icon: TrendingUp,
    },
    {
      label: "总支出",
      value: formatYuanToWan(stats.total_expense),
      icon: TrendingDown,
    },
    {
      label: "净现金流",
      value: formatYuanToWanSigned(netCashFlow),
      icon: Wallet,
      warm: true,
      // 与明细页 HeaderStats 口径一致：非负用 Rust 强调，为负回落到 Ink
      valueClass: netCashFlow >= 0 ? "text-rust" : "text-ink",
    },
    {
      label: "流水记录数",
      value: String(stats.total_records ?? 0),
      suffix: "条",
      icon: Receipt,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon;
        const isWarm = Boolean(card.warm);
        const tone = isWarm ? "text-rust" : "text-graphite";
        return (
          <div
            key={card.label}
            className={`rounded-cards p-6 shadow-steep-sm ${isWarm ? "bg-apricot-wash" : "bg-white"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-sm ${tone}`}>{card.label}</span>
              <Icon className={`h-4 w-4 ${tone}`} aria-hidden="true" />
            </div>
            <div
              className={`mt-3 text-[30px] leading-[1.1] font-[450] tabular-nums ${
                card.valueClass ?? (isWarm ? "text-rust" : "text-ink")
              }`}
            >
              {card.value}
              {card.suffix ? (
                <span className="ml-1 text-sm text-graphite">{card.suffix}</span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
