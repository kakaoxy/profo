import type { components } from "@/lib/api-types";
import { WidgetHead } from "./widget-head";
import { WgKpi } from "./wg-kpi";

type MonthlySummary = components["schemas"]["LedgerMonthlySummaryResponse"];
type ProjectProfitItem = components["schemas"]["ProjectProfitItem"];

interface FinanceSummaryCardProps {
  summary: MonthlySummary | null;
}

/** 项目状态 → 中文名 */
const STATUS_LABELS: Record<string, string> = {
  signing: "签约",
  renovating: "装修中",
  selling: "在售",
  sold: "已成交",
  ended: "已下架",
};

/** 元 → 万元，保留 1 位小数 */
function toWan(amount: number): string {
  const wan = amount / 10000;
  return Math.abs(wan) >= 100 ? wan.toFixed(0) : wan.toFixed(1);
}

/**
 * 工作台「资金概览」卡（span 6，仅 admin，设计稿屏 01 第 6 卡）。
 *
 * 版式对齐 hifi `.kpi-3` + `.wg-split`（1fr / 1fr）：
 * 上排三指标，下排左「项目损益（万元）」mini-list、右「本月现金流（万元）」8 段柱 + W 轴。
 *
 * 全部指标对应真实数据源（SPEC D-02/D-02a/D-02b/D-02c）：
 * - 净现金流 = 本月 inflow − outflow
 * - 在投金额 = 未结算且装修/在售项目的累计支出
 * - 本月回款 = 本月 income 类型流水合计
 *
 * ⚠️ 不含「已到账 100%」等业务中不存在的概念（原设计稿有，已按 D-02 移除）。
 */
export function FinanceSummaryCard({ summary }: FinanceSummaryCardProps) {
  const weeks = summary?.week_cash_flows ?? [];
  const profitItems: ProjectProfitItem[] = summary?.top_profits ?? [];
  const maxWeek = Math.max(1, ...weeks.map((v) => Math.abs(v)));
  const netCashFlow = summary?.net_cash_flow ?? 0;

  return (
    <div
      className="flex min-w-0 flex-1 flex-col rounded-cards bg-white px-[22px] py-5 shadow-steep-sm"
      role="region"
      aria-label="资金概览"
    >
      <WidgetHead title="资金概览" sub="本月" link="资金账本" href="/admin/ledger" />

      <div className="mt-[18px] grid grid-cols-3 gap-4">
        <WgKpi
          label="净现金流"
          value={
            <>
              {netCashFlow >= 0 ? "+" : ""}
              {toWan(netCashFlow)}
            </>
          }
          unit="万"
          detail="本月流入 − 流出"
          valueClassName={netCashFlow >= 0 ? "text-money-positive" : "text-money-negative"}
        />
        <WgKpi
          label="在投金额"
          value={toWan(summary?.invested_amount ?? 0)}
          unit="万"
          detail={`装修/在售 · ${summary?.invested_project_count ?? 0} 个项目`}
        />
        <WgKpi
          label="本月回款"
          value={toWan(summary?.month_receipts ?? 0)}
          unit="万"
          detail="本月收入类流水"
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-1 text-xs text-graphite">项目损益（万元）</p>
          <ul>
            {profitItems.map((item) => (
              <li
                key={item.project_id}
                className="flex items-center gap-2.5 border-b border-dove/18 py-[9px] last:border-b-0"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-[450] text-ink">
                    {item.community_name ?? "未命名项目"}
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-graphite">
                    {STATUS_LABELS[item.status] ?? item.status} ·{" "}
                    {item.settled ? "已结算" : "未结算"}
                  </span>
                </span>
                <span
                  className={`ml-auto shrink-0 text-[12.5px] tabular-nums ${
                    item.net_cash_flow >= 0 ? "text-money-positive" : "text-money-negative"
                  }`}
                >
                  {item.net_cash_flow >= 0 ? "+" : ""}
                  {toWan(item.net_cash_flow)}
                </span>
              </li>
            ))}
            {profitItems.length === 0 && (
              <li className="py-2 text-xs text-dove">暂无项目损益数据</li>
            )}
          </ul>
        </div>

        <div className="min-w-0">
          <p className="mb-1 text-xs text-graphite">本月现金流（万元）</p>
          <div className="flex h-[92px] items-end gap-2" aria-hidden="true">
            {weeks.map((value, index) => (
              <div key={index} className="flex h-full flex-1 flex-col justify-end">
                <i
                  className="block rounded-t-[5px] rounded-b-[2px]"
                  style={{
                    height: `${Math.max(4, (Math.abs(value) / maxWeek) * 100)}%`,
                    backgroundColor: index === 6 ? "var(--color-rust)" : "var(--color-ink)",
                    opacity: index === 6 ? 1 : 0.16,
                  }}
                />
              </div>
            ))}
            {weeks.length === 0 && <span className="text-xs text-dove">暂无流水</span>}
          </div>
          <div className="mt-2 flex gap-2">
            {weeks.map((_, index) => (
              <span key={index} className="flex-1 text-center text-[10.5px] text-dove">
                W{index + 1}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
