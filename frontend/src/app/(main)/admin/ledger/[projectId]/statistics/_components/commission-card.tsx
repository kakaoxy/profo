import type { components } from "@/lib/api-types";
import { formatCurrency } from "./format";

type CommissionStats = components["schemas"]["LedgerStatisticsCommission"];

interface CommissionCardProps {
  data: CommissionStats;
}

/**
 * 渠道佣金及税费卡片
 * - 渠道佣金 / 代付佣金(-) / 业主佣金(Rust) / 税费及佣金差额(-)
 * - 合计 = owner_commission - agent_commission - channel_commission - tax_diff
 *   (Rust 高亮, 左边框, 浅色底)
 */
export function CommissionCard({ data }: CommissionCardProps) {
  const channel = data.channel_commission ?? 0;
  const agent = data.agent_commission ?? 0;
  const owner = data.owner_commission ?? 0;
  const taxDiff = data.tax_diff ?? 0;
  const total = owner - agent - channel - taxDiff;

  return (
    <div
      className="bg-white rounded-[24px] p-6 shadow-[rgba(4,23,43,0.04)_0px_0px_0px_1px,rgba(0,0,0,0.06)_0px_12px_16px_-4px] h-full animate-in"
      style={{ animationDelay: "0.4s" }}
    >
      {/* Section header */}
      <div className="mb-5 pb-4 border-b border-dove/25">
        <h2 className="text-[26px] leading-[1.18] tracking-[-0.23px] text-ink text-balance">
          渠道佣金及税费
        </h2>
        <p className="text-[14px] leading-[1.5] mt-1 text-graphite">
          Commission &amp; Tax
        </p>
      </div>

      <div className="space-y-3">
        <DataRow
          label="渠道佣金"
          value={formatCurrency(channel)}
          valueColor="text-ink"
        />
        <DataRow
          label="代付佣金"
          value={`-${formatCurrency(agent)}`}
          valueColor="text-graphite"
        />
        <DataRow
          label="业主佣金"
          value={formatCurrency(owner)}
          valueColor="text-rust"
        />
        <DataRow
          label="税费及佣金差额"
          value={`-${formatCurrency(taxDiff)}`}
          valueColor="text-graphite"
        />

        {/* Total row */}
        <div className="flex justify-between items-center py-3 px-4 rounded-[12px] bg-rust/[0.06] border-l-[3px] border-rust">
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
      <span className={`text-[15px] font-medium tabular-nums ${valueColor} break-words`}>
        {value}
      </span>
    </div>
  );
}
