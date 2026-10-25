import type { components } from "@/lib/api-types";
import { WidgetHead } from "./widget-head";
import { WgKpi } from "./wg-kpi";

type GrowthKpi = components["schemas"]["GrowthOverviewKpiResponse"];
type TrendPoint = components["schemas"]["TrendPoint"];
type SourceItem = components["schemas"]["SourceBreakdownItem"];

interface GrowthOverviewCardProps {
  kpi: GrowthKpi | null;
  trend: TrendPoint[];
  sources: SourceItem[];
}

/** 模块 → 中文名（与后端 /overview/source-breakdown 的 4 模块一致） */
const MODULE_LABELS: Record<string, string> = {
  valuation: "估价",
  booking: "预约",
  sheet: "房源单",
  recruit: "招募",
};

/** YYYY-MM-DD → MM-DD（设计稿 x 轴「10-04」样式） */
function toAxisLabel(date: string): string {
  return date.slice(5);
}

/**
 * 工作台「获客总览」卡（span 6，设计稿屏 01 第 5 卡）。
 *
 * 版式严格对齐 hifi `.wg-split.narrow-right`（3fr / 2fr）：
 * 左栏 = 3 个 KPI（`.kpi-3`）+ 14 日趋势柱（`.spark`）+ 日期轴（`.spark-x`）；
 * 右栏 = 「线索来源（按模块）」4 行胶囊条（首行 Rust 实色，其余 Ink 28%）。
 *
 * 指标全部对应真实数据源（SPEC D-04）：
 * - 新增线索 = 近 30 天有效新客（`valid_new_customers`）
 * - 整体转化率 = 有效新客 ÷ 分享次数（后端既有 `conversion_rate` 口径）
 * - 分享带来 = 带分享归因的线索数（`share_sourced_leads`）
 *
 * ⚠️ 不含「到访转化」：业务无「到访」概念，已按 SPEC D-04 移除。
 */
export function GrowthOverviewCard({ kpi, trend, sources }: GrowthOverviewCardProps) {
  const total = kpi?.valid_new_customers ?? 0;
  const conversionRate = kpi?.conversion_rate;
  const shareSourced = kpi?.share_sourced_leads ?? 0;
  const sharePct = total > 0 ? Math.round((shareSourced / total) * 1000) / 10 : null;
  const maxTrend = Math.max(1, ...trend.map((p) => p.count));
  const sourceTotal = sources.reduce((sum, item) => sum + item.count, 0);
  // 日期轴取 5 个等距刻度（设计稿 10-04 / 10-07 / 10-10 / 10-13 / 10-17）
  const axisPoints =
    trend.length === 0
      ? []
      : Array.from(new Set([0, 0.25, 0.5, 0.75, 1].map((r) => Math.round((trend.length - 1) * r))));

  return (
    <div
      className="flex min-w-0 flex-1 flex-col rounded-cards bg-white px-[22px] py-5 shadow-steep-sm"
      role="region"
      aria-label="获客总览"
    >
      <WidgetHead title="获客总览" sub="近 14 日" link="获客中心" href="/admin/growth-center" />

      <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0">
          <div className="grid grid-cols-3 gap-4">
            <WgKpi label="新增线索" value={total} unit="条" detail="近 30 天" large />
            <WgKpi
              label="整体转化率"
              value={conversionRate == null ? "—" : conversionRate}
              unit={conversionRate == null ? undefined : "%"}
              detail="有效新客 ÷ 分享次数"
              large
            />
            <WgKpi
              label="分享带来"
              value={shareSourced}
              unit="条"
              detail={sharePct == null ? "占比 —" : `占 ${sharePct}%`}
              large
            />
          </div>

          {/* 14 日趋势柱：末 3 日 Rust 强调（设计稿 .spark i.hot） */}
          <div className="mt-[22px] flex h-[74px] items-end gap-1" aria-hidden="true">
            {trend.length === 0 ? (
              <span className="text-xs text-dove">暂无趋势数据</span>
            ) : (
              trend.map((point, index) => (
                <i
                  key={point.date}
                  className="flex-1 rounded-t-[4px] rounded-b-[2px]"
                  style={{
                    height: `${Math.max(4, (point.count / maxTrend) * 100)}%`,
                    backgroundColor:
                      index >= trend.length - 3 ? "var(--color-rust)" : "var(--color-sky-wash)",
                  }}
                />
              ))
            )}
          </div>
          <div className="mt-[7px] flex gap-1" aria-hidden="true">
            {axisPoints.map((index) => (
              <span key={index} className="flex-1 text-center text-[10.5px] text-dove">
                {toAxisLabel(trend[index].date)}
              </span>
            ))}
          </div>
          <span className="sr-only">
            近 14 日线索趋势，共 {trend.reduce((sum, p) => sum + p.count, 0)} 条
          </span>
        </div>

        <div className="min-w-0">
          <p className="mb-2.5 text-xs text-graphite">线索来源（按模块）</p>
          <ul>
            {sources.map((item, index) => {
              const pct = sourceTotal > 0 ? Math.round((item.count / sourceTotal) * 100) : 0;
              return (
                <li key={item.module} className="flex items-center gap-2.5 py-[7px]">
                  <span className="w-[72px] shrink-0 text-[12.5px] text-ash">
                    {MODULE_LABELS[item.module] ?? item.module}
                  </span>
                  <span className="h-[7px] min-w-0 flex-1 overflow-hidden rounded-full bg-fog">
                    <i
                      className="block h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: index === 0 ? "var(--color-rust)" : "var(--color-ink)",
                        opacity: index === 0 ? 1 : 0.28,
                      }}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-right text-[12.5px] tabular-nums text-ink">
                    {item.count}
                  </span>
                </li>
              );
            })}
            {sources.length === 0 && <li className="text-xs text-dove">暂无来源数据</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
