import type { components } from "@/lib/api-types";
import { formatCurrency } from "./format";

type MarketingStats = components["schemas"]["LedgerStatisticsMarketing"];

interface MarketingCardProps {
  data: MarketingStats;
}

/**
 * 营销推广费卡片
 * - 营销推广费 / 营销费垫付(-) / 营销推广费抵扣(+)
 * - 合计 = marketing_fee - advance + deduction
 */
export function MarketingCard({ data }: MarketingCardProps) {
  const fee = data.marketing_fee ?? 0;
  const advance = data.advance ?? 0;
  const deduction = data.deduction ?? 0;
  const total = fee - advance + deduction;

  return (
    <div
      className="bg-white rounded-cards p-6 shadow-[rgba(4,23,43,0.04)_0px_0px_0px_1px,rgba(0,0,0,0.06)_0px_12px_16px_-4px] h-full animate-in"
      style={{ animationDelay: "0.5s" }}
    >
      {/* Section header */}
      <div className="mb-5 pb-4 border-b border-dove/25">
        <h2 className="text-[26px] leading-[1.18] tracking-[-0.23px] text-ink text-balance">
          营销推广费
        </h2>
        <p className="text-[14px] leading-normal mt-1 text-graphite">
          Marketing Expense
        </p>
      </div>

      <div className="space-y-3">
        <DataRow
          label="营销推广费"
          value={formatCurrency(fee)}
          valueColor="text-ink"
        />
        <DataRow
          label="营销费垫付"
          value={`-${formatCurrency(advance)}`}
          valueColor="text-graphite"
        />
        <DataRow
          label="营销推广费抵扣"
          value={`+${formatCurrency(deduction)}`}
          valueColor="text-rust"
        />

        {/* Total row */}
        <div className="flex justify-between items-center py-3 px-4 rounded-images bg-rust/6 border-l-[3px] border-rust">
          <span className="text-[14px] font-medium text-rust">合计</span>
          <span className="text-[18px] font-medium text-rust tabular-nums">
            {formatCurrency(total)}
          </span>
        </div>
      </div>
    </div>
  );
}

function DataRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor: string;
}) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-dove/25 last:border-b-0">
      <span className="text-[14px] text-graphite">{label}</span>
      <span className={`text-[15px] font-medium tabular-nums ${valueColor} wrap-break-word`}>
        {value}
      </span>
    </div>
  );
}
