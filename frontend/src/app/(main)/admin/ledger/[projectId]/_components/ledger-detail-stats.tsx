import { TrendingUp, TrendingDown, Wallet, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { toNumber } from "@/lib/number-utils";
import { formatYuanToWan, formatYuanToWanSigned } from "@/lib/format-amount";
import type { components } from "@/lib/api-types";

type CashFlowRecordResponse = components["schemas"]["CashFlowRecordResponse"];

interface LedgerDetailStatsProps {
  data: CashFlowRecordResponse[];
}

/**
 * 顶部统计卡（Steep）：流入合计 / 流出合计 / 净现金流 / 进损益流出。
 *
 * - 净现金流为唯一 Apricot 暖卡（与列表页统计卡同构，且与上方 HeaderStats 的
 *   「净现金流用 Rust」口径一致）
 * - 图标改为单色描边，替代原 emerald / amber / blue / red 彩色图标圆
 * - 金额统一按「万」缩写（对齐 DESIGN.md 与 HeaderStats）
 */
export function LedgerDetailStats({ data }: LedgerDetailStatsProps) {
  let inflow = 0;
  let outflow = 0;
  let pnlOut = 0;
  for (const r of data) {
    const infl = toNumber(r.inflow) ?? 0;
    const out = toNumber(r.outflow) ?? 0;
    inflow += infl;
    outflow += out;
    if (r.subject?.pnl && out > 0) pnlOut += out;
  }
  const net = inflow - outflow;

  // 颜色规则（中国习惯）：流入红、流出绿；净现金流用暖卡 Rust 承载
  const cards = [
    {
      label: "流入合计",
      value: `+${formatYuanToWan(inflow)}`,
      icon: TrendingUp,
      valueClass: "text-money-positive",
      warm: false,
    },
    {
      label: "流出合计",
      value: `−${formatYuanToWan(outflow)}`,
      icon: TrendingDown,
      valueClass: "text-money-negative",
      warm: false,
    },
    {
      label: "净现金流",
      value: formatYuanToWanSigned(net),
      icon: Wallet,
      // 与 HeaderStats 口径一致：非负用 Rust 强调，为负回落到 Ink
      valueClass: net >= 0 ? "text-rust" : "text-ink",
      warm: true,
    },
    {
      label: "进损益流出",
      value: formatYuanToWan(pnlOut),
      icon: Receipt,
      valueClass: "text-money-negative",
      warm: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => {
        const Icon = c.icon;
        const tone = c.warm ? "text-rust" : "text-graphite";
        return (
          <div
            key={c.label}
            className={cn(
              "rounded-cards p-5 shadow-steep-sm",
              c.warm ? "bg-apricot-wash" : "bg-white",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={cn("text-[12.5px]", tone)}>{c.label}</span>
              <Icon className={cn("h-4 w-4", tone)} aria-hidden="true" />
            </div>
            <div
              className={cn(
                "mt-2.5 truncate font-mono text-[30px] leading-[1.1] font-[450] tabular-nums",
                c.valueClass,
              )}
            >
              {c.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default LedgerDetailStats;
