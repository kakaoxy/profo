import type { components } from "@/lib/api-types";
import { formatCurrency, formatDate } from "./format";

type DepositStats = components["schemas"]["LedgerStatisticsDeposit"];

interface DepositCardProps {
  data: DepositStats;
}

/**
 * 履约保证金卡片
 * - 履约保证金 / 支付时间 / 保证金回收(Rust) / 收款时间 / 是否退还(徽章)
 * - 差额块 = |amount - recovery|, Rust 高亮底
 *
 * 是否退还语义:
 *   - 无 amount 或 amount=0 → "未支付"
 *   - recovery >= amount    → "已退还"
 *   - 否则                  → "部分退还"
 */
export function DepositCard({ data }: DepositCardProps) {
  const amount = data.amount ?? 0;
  const recovery = data.recovery ?? 0;
  const diff = Math.abs(amount - recovery);

  const refundLabel =
    amount <= 0 ? "未支付" : recovery >= amount ? "已退还" : "部分退还";

  return (
    <div
      className="bg-white rounded-cards p-6 shadow-[rgba(4,23,43,0.04)_0px_0px_0px_1px,rgba(0,0,0,0.06)_0px_12px_16px_-4px] h-full animate-in"
      style={{ animationDelay: "0.45s" }}
    >
      {/* Section header */}
      <div className="mb-5 pb-4 border-b border-dove/25">
        <h2 className="text-[26px] leading-[1.18] tracking-[-0.23px] text-ink text-balance">
          履约保证金
        </h2>
        <p className="text-[14px] leading-normal mt-1 text-graphite">
          Performance Bond
        </p>
      </div>

      <div className="space-y-3">
        <DataRow
          label="履约保证金"
          value={formatCurrency(amount)}
          valueColor="text-ink"
        />
        <DataRow
          label="支付时间"
          value={formatDate(data.pay_date, "—")}
          valueColor="text-ink"
        />
        <DataRow
          label="保证金回收"
          value={formatCurrency(recovery)}
          valueColor="text-rust"
        />
        <DataRow
          label="收款时间"
          value={formatDate(data.receive_date, "—")}
          valueColor="text-ink"
        />

        {/* 是否退还 (badge) */}
        <div className="flex justify-between items-center py-2.5 border-b border-dove/25">
          <span className="text-[14px] text-graphite">是否退还</span>
          <span className="inline-flex items-center px-3 py-1 rounded-[6px] text-[13px] font-medium bg-rust/8 text-rust">
            {refundLabel}
          </span>
        </div>

        {/* 差额块 */}
        <div className="mt-4 p-4 rounded-cards bg-rust/8">
          <div className="flex justify-between items-center">
            <span className="text-[14px] text-graphite">差额</span>
            <span className="text-[18px] font-medium text-rust tabular-nums">
              {formatCurrency(diff)}
            </span>
          </div>
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
