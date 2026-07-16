import type { components } from "@/lib/api-types";
import { formatCurrency, formatNumber } from "./format";

type RenovationStats = components["schemas"]["LedgerStatisticsRenovation"];

interface RenovationCardProps {
  data: RenovationStats;
}

/**
 * 装修预算卡片
 * - 装修公司 (col-span-full) + 装修费用高亮行 (Rust 左边框/底色)
 * - 硬装 / 硬装单价 / 定制柜 / 窗户 / 墙面 / 其他装修 / 装修天数
 */
export function RenovationCard({ data }: RenovationCardProps) {
  return (
    <div
      className="bg-white rounded-[24px] p-6 shadow-[rgba(4,23,43,0.04)_0px_0px_0px_1px,rgba(0,0,0,0.06)_0px_12px_16px_-4px] h-full animate-in"
      style={{ animationDelay: "0.35s" }}
    >
      {/* Section header */}
      <div className="mb-5 pb-4 border-b border-dove/25">
        <h2 className="text-[26px] leading-[1.18] tracking-[-0.23px] text-ink text-balance">
          装修预算
        </h2>
        <p className="text-[14px] leading-[1.5] mt-1 text-graphite">
          Decoration Budget
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-1">
        {/* 装修公司 (full width) */}
        <div className="col-span-full flex justify-between items-center py-2.5 border-b border-dove/25 min-w-0">
          <span className="text-[14px] text-graphite">装修公司</span>
          <span className="text-[15px] font-medium text-ink text-right truncate">
            {data.company || "-"}
          </span>
        </div>

        {/* 装修费用 (highlight total-row) */}
        <div className="col-span-full flex justify-between items-center py-3 px-4 rounded-[12px] bg-rust/[0.06] border-l-[3px] border-rust my-1">
          <span className="text-[14px] font-medium text-rust">装修费用</span>
          <span className="text-[18px] font-medium text-rust tabular-nums">
            {formatCurrency(data.total_fee)}
          </span>
        </div>

        <DataRow label="硬装" value={formatCurrency(data.hard_amount)} />
        <DataRow
          label="硬装单价"
          value={`${formatCurrency(data.hard_unit_price)}/m²`}
        />
        <DataRow label="定制柜" value={formatCurrency(data.custom_cabinet)} />
        <DataRow label="窗户" value={formatCurrency(data.window)} />
        <DataRow
          label="墙面"
          value={formatCurrency(data.wall_treatment)}
        />
        <DataRow label="其他装修" value={formatCurrency(data.other_decoration)} />
        <DataRow label="装修天数" value={`${formatNumber(data.days)}\u00A0天`} />
      </div>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-dove/25 last:border-b-0">
      <span className="text-[14px] text-graphite">{label}</span>
      <span className="text-[15px] font-medium text-ink tabular-nums text-right break-words">
        {value}
      </span>
    </div>
  );
}
