import type { components } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "./format";

type Kpi = components["schemas"]["LedgerStatisticsKPI"];

interface StatisticsHeroProps {
  kpi: Kpi;
}

/**
 * 资金账本 Hero 区
 * - 居中标题 + 副标题 + 流水笔数 chip
 * - 8 张 KPI 卡(2 行 × 4 列)
 * - Row1: 项目收入/毛利/净利/总支出进损益(Apricot Wash 渐变)
 * - Row2: 现金流入/现金流出/净现金流/流水笔数(白底)
 */
export function StatisticsHero({ kpi }: StatisticsHeroProps) {
  const netCashSign = kpi.net_cashflow >= 0 ? "+" : "−";

  return (
    <div className="text-center">
      {/* 标题 */}
      <div className="mb-10 animate-in" style={{ animationDelay: "0.1s" }}>
        <h1 className="font-display text-[44px] leading-[1.1] tracking-[-0.66px] mb-4 text-ink text-balance">
          项目资金账本
        </h1>
        <p className="text-[18px] leading-[1.35] text-ash">
          全周期资金追踪 · 数据从交易流水实时计算
        </p>
        <div className="mt-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-apricot-wash/60 text-rust text-sm">
            📊 {formatNumber(kpi.record_count)} 笔流水
          </span>
        </div>
      </div>

      {/* Row 1: Apricot Wash 渐变 KPI */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 animate-in"
        style={{ animationDelay: "0.15s" }}
      >
        <KpiCard
          label="项目收入"
          value={formatCurrency(kpi.project_income)}
          variant="warm"
          accent="rust"
        />
        <KpiCard
          label="毛利"
          value={formatCurrency(kpi.gross_profit)}
          variant="warm"
          accent="ink"
        />
        <KpiCard
          label="净利"
          value={formatCurrency(kpi.net_profit)}
          variant="warm"
          accent="rust"
        />
        <KpiCard
          label="总支出(进损益)"
          value={formatCurrency(kpi.total_pnl_outflow)}
          variant="warm"
          accent="ink"
        />
      </div>

      {/* Row 2: 白底 KPI */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-in"
        style={{ animationDelay: "0.2s" }}
      >
        <KpiCard
          label="现金流入"
          value={`+${formatCurrency(kpi.cash_inflow)}`}
          variant="plain"
          accent="in"
        />
        <KpiCard
          label="现金流出"
          value={`−${formatCurrency(kpi.cash_outflow)}`}
          variant="plain"
          accent="out"
        />
        <KpiCard
          label="净现金流"
          value={`${netCashSign}${formatCurrency(Math.abs(kpi.net_cashflow))}`}
          variant="plain"
          accent="rust"
        />
        <KpiCard
          label="流水笔数"
          value={formatNumber(kpi.record_count)}
          suffix="笔"
          variant="plain"
          accent="ink"
        />
      </div>
    </div>
  );
}

type KpiVariant = "warm" | "plain";
type KpiAccent = "ink" | "rust" | "in" | "out";

interface KpiCardProps {
  label: string;
  value: string;
  suffix?: string;
  variant: KpiVariant;
  accent: KpiAccent;
  className?: string;
}

function KpiCard({
  label,
  value,
  suffix,
  variant,
  accent,
  className,
}: KpiCardProps) {
  const cardBg =
    variant === "warm"
      ? "linear-gradient(135deg, #fbe1d1 0%, rgba(251, 225, 209, 0.5) 100%)"
      : "#ffffff";
  const valueColor: Record<KpiAccent, string> = {
    ink: "#17191c",
    rust: "#5d2a1a",
    in: "#1f7a4d",
    out: "#b03a1a",
  };

  return (
    <div
      className={cn(
        "text-center px-5 py-7 rounded-[20px] shadow-[rgba(4,23,43,0.04)_0px_0px_0px_1px,rgba(0,0,0,0.06)_0px_12px_16px_-4px] transition-transform duration-300 hover:-translate-y-1",
        className,
      )}
      style={{ background: cardBg }}
    >
      <p className="text-[14px] mb-2 text-graphite leading-[1.5]">{label}</p>
      <p
        className="text-[32px] leading-[1.1] tabular-nums tracking-[-0.3px]"
        style={{ color: valueColor[accent] }}
      >
        {value}
        {suffix ? (
          <span className="text-[16px] ml-1 text-ash">{suffix}</span>
        ) : null}
      </p>
    </div>
  );
}
