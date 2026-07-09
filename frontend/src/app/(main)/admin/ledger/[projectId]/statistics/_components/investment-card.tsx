import type { components } from "@/lib/api-types";
import { formatCurrency, formatPercent } from "./format";

type InvestmentStats = components["schemas"]["LedgerStatisticsInvestment"];
type Investor = components["schemas"]["LedgerStatisticsInvestor"];

interface InvestmentCardProps {
  data: InvestmentStats;
}

const AVATAR_BG = ["bg-apricot-wash", "bg-sky-wash", "bg-[#d1f4e1]"];

/**
 * 投资情况卡片
 * - 投资人列表 (sub-card 16px radius): avatar + 姓名 + 跟投比例 + 跟投金额 + 实付金额 + 付款进度条
 * - 底部 4 列汇总: 总投资 / 总实付 / 待付 / 付款进度
 */
export function InvestmentCard({ data }: InvestmentCardProps) {
  const investors = data.investors ?? [];
  const payProgress = data.pay_progress ?? 0;

  return (
    <div
      className="bg-white rounded-cards p-6 shadow-[rgba(4,23,43,0.04)_0px_0px_0px_1px,rgba(0,0,0,0.06)_0px_12px_16px_-4px] h-full animate-in"
      style={{ animationDelay: "0.3s" }}
    >
      {/* Section header */}
      <div className="mb-5 pb-4 border-b border-dove/25">
        <h2 className="text-[26px] leading-[1.18] tracking-[-0.23px] text-ink text-balance">
          投资情况
        </h2>
        <p className="text-[14px] leading-normal mt-1 text-graphite">
          Investment Overview
        </p>
      </div>

      {/* Investor list */}
      {investors.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {investors.map((inv, idx) => (
            <InvestorCard key={`${inv.name}-${idx}`} investor={inv} index={idx} />
          ))}
        </div>
      ) : (
        <p className="text-[14px] text-graphite py-4">暂无投资人数据</p>
      )}

      {/* Bottom summary */}
      <div className="mt-6 pt-6 border-t border-dove/25">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          <SummaryItem
            label="总投资金额"
            value={formatCurrency(data.total_investment)}
            valueColor="text-rust"
          />
          <SummaryItem
            label="总实付金额"
            value={formatCurrency(data.total_paid)}
            valueColor="text-ink"
          />
          <SummaryItem
            label="待付金额"
            value={formatCurrency(data.total_unpaid)}
            valueColor="text-graphite"
          />
          <SummaryItem
            label="付款进度"
            value={formatPercent(payProgress)}
            valueColor="text-ink"
          />
        </div>
      </div>
    </div>
  );
}

function InvestorCard({ investor, index }: { investor: Investor; index: number }) {
  const name = investor.name || "匿名";
  const ratio = investor.share_ratio ?? 0;
  const amount = investor.invest_amount ?? 0;
  const paid = investor.paid_amount ?? 0;
  const payRatio = amount > 0 ? Math.min(100, Math.round((paid / amount) * 100)) : 0;

  return (
    <div className="bg-white rounded-inputs p-5 shadow-[rgba(4,23,43,0.04)_0px_0px_0px_1px,rgba(0,0,0,0.04)_0px_8px_12px_-3px]">
      <div className="flex items-start justify-between mb-4 gap-2">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-medium text-ink shrink-0 ${AVATAR_BG[index % AVATAR_BG.length]}`}
          >
            {name.charAt(0)}
          </div>
          <span className="text-[15px] font-medium text-ink wrap-break-word leading-snug">
            {name}
          </span>
        </div>
        <span className="text-[18px] font-medium text-rust tabular-nums shrink-0">
          {ratio}%
        </span>
      </div>
      <div className="space-y-2 text-[14px]">
        <div className="flex justify-between">
          <span className="text-graphite">跟投金额</span>
          <span className="text-ink tabular-nums">
            {formatCurrency(amount)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-graphite">跟投实付</span>
          <span className="text-rust tabular-nums">
            {formatCurrency(paid)}
          </span>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-[13px] mb-2">
            <span className="text-graphite">付款进度</span>
            <span className="text-ash tabular-nums">{payRatio}%</span>
          </div>
          <div className="h-1.5 bg-ink/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-rust transition-[width] duration-700"
              style={{ width: `${payRatio}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor: string;
}) {
  return (
    <div>
      <p className="text-[14px] mb-1 text-graphite">{label}</p>
      <p className={`text-[26px] font-medium tabular-nums ${valueColor}`}>
        {value}
      </p>
    </div>
  );
}
