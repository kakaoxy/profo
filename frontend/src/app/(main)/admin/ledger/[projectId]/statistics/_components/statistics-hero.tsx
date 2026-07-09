import type { components } from "@/lib/api-types";
import { formatCurrency, formatNumber, formatPercent } from "./format";

type SummaryStats = components["schemas"]["LedgerStatisticsSummary"];

interface StatisticsHeroProps {
  summary: SummaryStats;
}

/**
 * 资金账本 Hero 区
 * - 居中标题 (Signifier 44px) + 副标题
 * - 8 个 KPI 卡片，2 行 × 4 列
 * - Row1: 总支出/前期投入/毛利/净利 (Apricot Wash 渐变)
 * - Row2: 资金占用时间/投资回报率/年化回报率/项目收入 (白底)
 */
export function StatisticsHero({ summary }: StatisticsHeroProps) {
  return (
    <div className="text-center">
      {/* 标题 */}
      <div className="mb-12 animate-in" style={{ animationDelay: "0.1s" }}>
        <h1
          className="font-display text-[44px] leading-[1.1] tracking-[-0.66px] mb-4 text-ink text-balance"
        >
          项目资金账本
        </h1>
        <p className="text-[18px] leading-[1.35] text-ash">
          财务数据实时追踪与统计分析
        </p>
      </div>

      {/* Row 1: Apricot Wash 渐变 KPI */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 animate-in"
        style={{ animationDelay: "0.15s" }}
      >
        <KpiCard
          label="项目总支出"
          value={formatCurrency(summary.total_expense)}
          variant="warm"
          accent="rust"
        />
        <KpiCard
          label="项目前期投入"
          value={formatCurrency(summary.initial_investment)}
          variant="warm"
          accent="rust"
        />
        <KpiCard
          label="项目毛利"
          value={formatCurrency(summary.gross_profit)}
          variant="warm"
          accent="ink"
        />
        <KpiCard
          label="项目净利"
          value={formatCurrency(summary.net_profit)}
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
          label="资金占用时间"
          value={formatNumber(summary.occupy_days)}
          suffix="天"
          variant="plain"
          accent="ink"
        />
        <KpiCard
          label="投资回报率"
          value={formatPercent(summary.roi)}
          variant="plain"
          accent="ink"
        />
        <KpiCard
          label="年化回报率"
          value={formatPercent(summary.annual_roi)}
          variant="plain"
          accent="ink"
        />
        <KpiCard
          label="项目收入"
          value={formatCurrency(summary.project_income)}
          variant="plain"
          accent="rust"
        />
      </div>
    </div>
  );
}

type KpiVariant = "warm" | "plain";
type KpiAccent = "ink" | "rust";

interface KpiCardProps {
  label: string;
  value: string;
  suffix?: string;
  variant: KpiVariant;
  accent: KpiAccent;
}

function KpiCard({ label, value, suffix, variant, accent }: KpiCardProps) {
  const cardBg =
    variant === "warm"
      ? "linear-gradient(135deg, #fbe1d1 0%, rgba(251, 225, 209, 0.5) 100%)"
      : "#ffffff";
  const valueColor = accent === "rust" ? "#5d2a1a" : "#17191c";

  return (
    <div
      className="text-center px-5 py-7 rounded-[20px] shadow-[rgba(4,23,43,0.04)_0px_0px_0px_1px,rgba(0,0,0,0.06)_0px_12px_16px_-4px] transition-transform duration-300 hover:-translate-y-1"
      style={{ background: cardBg }}
    >
      <p className="text-[14px] mb-2 text-graphite leading-[1.5]">{label}</p>
      <p
        className="text-[32px] leading-[1.1] tabular-nums"
        style={{ color: valueColor }}
      >
        {value}
        {suffix ? (
          <span className="text-[16px] ml-1 text-ash">{suffix}</span>
        ) : null}
      </p>
    </div>
  );
}
