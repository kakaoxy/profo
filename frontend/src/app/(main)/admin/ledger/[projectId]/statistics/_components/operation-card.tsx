import type { components } from "@/lib/api-types";
import { formatCurrency } from "./format";

type OperationStats = components["schemas"]["LedgerStatisticsOperation"];

interface OperationCardProps {
  data: OperationStats;
}

/**
 * 运营成本卡片
 * - 运营费 / 维修预留 / 财税成本
 * - 合计 = operation_fee + maintenance_reserve + tax_cost
 */
export function OperationCard({ data }: OperationCardProps) {
  const fee = data.operation_fee ?? 0;
  const reserve = data.maintenance_reserve ?? 0;
  const tax = data.tax_cost ?? 0;
  const total = fee + reserve + tax;

  return (
    <div
      className="bg-white rounded-[24px] p-6 shadow-[rgba(4,23,43,0.04)_0px_0px_0px_1px,rgba(0,0,0,0.06)_0px_12px_16px_-4px] h-full animate-in"
      style={{ animationDelay: "0.55s" }}
    >
      {/* Section header */}
      <div className="mb-5 pb-4 border-b border-dove/25">
        <h2 className="text-[26px] leading-[1.18] tracking-[-0.23px] text-ink text-balance">
          运营成本
        </h2>
        <p className="text-[14px] leading-[1.5] mt-1 text-graphite">
          Operation Cost
        </p>
      </div>

      <div className="space-y-3">
        <DataRow
          label="运营费"
          value={formatCurrency(fee)}
          valueColor="text-ink"
        />
        <DataRow
          label="维修预留"
          value={formatCurrency(reserve)}
          valueColor="text-ink"
        />
        <DataRow
          label="财税成本"
          value={formatCurrency(tax)}
          valueColor="text-ink"
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
