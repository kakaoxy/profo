import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { components } from "@/lib/api-types";
import type { GrowthModule } from "../../types";
import { GROWTH_MODULE_META, GROWTH_MODULE_ORDER, PHASE_1_LABEL, PHASE_2_LABEL } from "../../types";
import { RecruitKpiGrid, type RecruitKpiItem } from "../../_components/recruit-kpi";
import { TrendChart } from "./trend-chart";

type GrowthOverviewKpiResponse = components["schemas"]["GrowthOverviewKpiResponse"];
type SourceBreakdownResponse = components["schemas"]["SourceBreakdownResponse"];
type TrendResponse = components["schemas"]["TrendResponse"];
type FunnelCompareResponse = components["schemas"]["FunnelCompareResponse"];
type EmployeeTopResponse = components["schemas"]["EmployeeTopResponse"];

export interface OverviewViewProps {
  kpi: GrowthOverviewKpiResponse;
  breakdown: SourceBreakdownResponse;
  trend: TrendResponse;
  compare: FunnelCompareResponse;
  top: EmployeeTopResponse;
}

/** 药丸 Badge 基础样式（与设计稿 .badge 一致） */
const badgeBase =
  "inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-0.5 rounded-full whitespace-nowrap";

/** 分期药丸标注（对齐设计稿 .phase-tag） */
function PhaseTag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-fog text-graphite ring-1 ring-inset ring-[#ececee] whitespace-nowrap">
      {label}
    </span>
  );
}

/** 二期角标小字（对齐设计稿 .mini-tag） */
function MiniTag() {
  return <span className="text-[11px] text-slate whitespace-nowrap">{PHASE_2_LABEL}</span>;
}

/** 卡片头：标题 + 副文案（对齐设计稿 .card-head） */
function CardHead({ title, sub, extra }: { title: ReactNode; sub?: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-fog">
      <div>
        <div className="flex items-center gap-2 flex-wrap text-[15px] font-medium text-ink">
          {title}
          {extra}
        </div>
        {sub && <div className="mt-0.5 text-[13px] text-graphite">{sub}</div>}
      </div>
    </div>
  );
}

/** 迷你漏斗卡末级行文案（各模块承接动作不同） */
const LAST_STEP_LABEL: Record<GrowthModule, string> = {
  valuation: "留资",
  booking: "预约",
  sheet: "承接留资",
  recruit: "留资",
};

/**
 * 获客总览视图（对齐设计稿 Screen 1）：
 * 页头 + KPI 4 卡 + 来源构成/趋势两列卡 + 四模块漏斗对比 + 员工 TOP 榜 + 口径脚注。
 * 纯展示 Server Component，数据由页面层并行获取后传入。
 */
export function OverviewView({ kpi, breakdown, trend, compare, top }: OverviewViewProps) {
  // KPI 4 卡（口径以 /overview/kpi 响应为准）
  const kpiItems: RecruitKpiItem[] = [
    {
      dotClass: "bg-ink",
      label: "今日线索",
      value: kpi.today_leads.toLocaleString(),
      trend: { text: "今日留资" },
    },
    {
      dotClass: "bg-sky-wash",
      label: "待跟进",
      value: kpi.pending_followups.toLocaleString(),
      trend: { text: "状态 = 新线索" },
    },
    {
      dotClass: "bg-apricot-wash",
      label: "有效新客",
      value: kpi.valid_new_customers.toLocaleString(),
      trend: { text: "近 30 天 · 已剔除内部" },
    },
    {
      dotClass: "bg-rust",
      label: "整体转化率",
      value: kpi.conversion_rate == null ? "—" : `${kpi.conversion_rate.toFixed(1)}%`,
      trend: { text: "有效新客 ÷ 分享次数" },
    },
  ];

  // 来源构成：按模块固定顺序取数（缺省模块计 0）
  const byModule = new Map(breakdown.items.map((item) => [item.module, item]));
  const breakdownRows = GROWTH_MODULE_ORDER.map((m) => {
    const item = byModule.get(m);
    return {
      module: m,
      count: item?.count ?? 0,
      percent: item?.percent ?? null,
    };
  });

  // 趋势副文案：窗口起止 + 日均
  const trendPoints = trend.points;
  const trendTotal = trendPoints.reduce((sum, p) => sum + p.count, 0);
  const trendSub =
    trendPoints.length > 0
      ? `${trendPoints[0].date} ~ ${trendPoints[trendPoints.length - 1].date} · 日均 ${(
          trendTotal / trendPoints.length
        ).toFixed(1)} 条`
      : "近 30 天";

  // 漏斗对比：按模块固定顺序渲染
  const compareByModule = new Map(compare.modules.map((row) => [row.module, row]));
  const compareRows = GROWTH_MODULE_ORDER.map((m) => compareByModule.get(m)).filter(
    (row) => row !== undefined,
  );

  return (
    <div className="flex flex-col gap-6">
      {/* 页头 */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
        <div>
          <h1 className="flex items-center gap-2.5 flex-wrap text-[26px] font-medium tracking-[-0.23px] text-ink">
            获客总览
            <PhaseTag label={PHASE_1_LABEL} />
          </h1>
          <p className="mt-1.5 text-[15px] text-graphite">四条分享获客链路的统一经营视图</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            disabled
            className="h-[38px] px-[18px] rounded-[12px] bg-ink text-white text-[14px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-35 disabled:cursor-not-allowed"
          >
            导出周报
          </button>
          <MiniTag />
        </div>
      </div>

      {/* KPI 4 卡 */}
      <RecruitKpiGrid items={kpiItems} />

      {/* 来源构成 + 趋势 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 线索来源构成 */}
        <div className="bg-white rounded-cards shadow-steep">
          <CardHead
            title="线索来源构成"
            sub={`近 30 天 · 共 ${breakdown.total.toLocaleString()} 条 · 含直接进入`}
          />
          <div className="p-6">
            {breakdown.total === 0 ? (
              <div className="h-6 rounded-full bg-fog" />
            ) : (
              <div className="flex h-6 rounded-full overflow-hidden">
                {breakdownRows.map((row) =>
                  row.percent != null && row.percent > 0 ? (
                    <div
                      key={row.module}
                      className={cn(
                        "h-full flex items-center justify-center text-[10.5px] font-medium min-w-0 overflow-hidden whitespace-nowrap",
                        GROWTH_MODULE_META[row.module].badge,
                      )}
                      style={{ width: `${Math.min(row.percent, 100)}%` }}
                    >
                      {row.percent >= 1 ? `${Math.round(row.percent)}%` : null}
                    </div>
                  ) : null,
                )}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 gap-x-5 mt-[18px]">
              {breakdownRows.map((row) => (
                <div key={row.module} className="flex items-center gap-2 text-[13px]">
                  <span className={`${badgeBase} ${GROWTH_MODULE_META[row.module].badge}`}>
                    {GROWTH_MODULE_META[row.module].label}
                  </span>
                  <span className="ml-auto text-graphite tabular-nums whitespace-nowrap">
                    {row.count.toLocaleString()} 条 ·{" "}
                    {row.percent == null ? "—" : `${Math.round(row.percent)}%`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 近 30 天线索趋势 */}
        <div className="bg-white rounded-cards shadow-steep">
          <CardHead
            title="近 30 天线索趋势"
            sub={<span className="tabular-nums">{trendSub}</span>}
          />
          <div className="px-4 pt-4 pb-2">
            <TrendChart points={trendPoints} />
          </div>
        </div>
      </div>

      {/* 四模块漏斗对比缩略 */}
      <div className="bg-white rounded-cards shadow-steep">
        <CardHead
          title="四模块漏斗对比"
          sub="近 30 天 · 条形以各模块最大级为基准 · 转化率 = 末级 ÷ 分享次数"
        />
        <div className="p-6">
          {compareRows.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-slate">暂无数据</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {compareRows.map((row) => {
                const base = Math.max(row.share_count, row.uv, row.leads, 1);
                const rows = [
                  { label: "分享", value: row.share_count, barClass: "bg-ink" },
                  { label: "打开UV", value: row.uv, barClass: "bg-graphite" },
                  { label: LAST_STEP_LABEL[row.module], value: row.leads, barClass: "bg-rust" },
                ];
                return (
                  <div key={row.module} className="border border-[#f0f1f3] rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className={`${badgeBase} ${GROWTH_MODULE_META[row.module].badge}`}>
                        {GROWTH_MODULE_META[row.module].label}
                      </span>
                      <span className="text-[13px] font-medium text-ink tabular-nums">
                        {row.leads_percent == null ? "—" : `${row.leads_percent.toFixed(1)}%`}
                      </span>
                    </div>
                    {rows.map((r) => (
                      <div
                        key={r.label}
                        className="grid grid-cols-[56px_1fr_44px] gap-2 items-center mt-2"
                      >
                        <span className="text-[11px] text-graphite whitespace-nowrap">
                          {r.label}
                        </span>
                        <div className="h-2.5 rounded-full bg-fog overflow-hidden">
                          <div
                            className={cn("block h-full rounded-full", r.barClass)}
                            style={{ width: `${Math.min((r.value / base) * 100, 100)}%` }}
                          />
                        </div>
                        <span className="text-[11.5px] text-slate text-right tabular-nums whitespace-nowrap">
                          {r.value.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 员工获客 TOP 榜 */}
      <div className="bg-white rounded-cards shadow-steep overflow-hidden">
        <CardHead
          title="员工获客 TOP 榜"
          extra={<PhaseTag label={PHASE_1_LABEL} />}
          sub="近 30 天 · 分享归因线索 · 转化率 = 线索数 ÷ 分享次数"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[14px]">
            <thead>
              <tr className="text-left text-[13px] font-medium text-graphite whitespace-nowrap">
                <th className="px-5 py-3 border-b border-fog w-14">排名</th>
                <th className="px-5 py-3 border-b border-fog">员工名</th>
                <th className="px-5 py-3 border-b border-fog text-right">分享次数</th>
                <th className="px-5 py-3 border-b border-fog text-right">线索数</th>
                <th className="px-5 py-3 border-b border-fog">转化率</th>
              </tr>
            </thead>
            <tbody>
              {top.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-[13px] text-slate">
                    暂无数据
                  </td>
                </tr>
              ) : (
                top.items.map((item, index) => (
                  <tr key={item.employee_id} className="hover:bg-fog transition-colors">
                    <td className="px-5 py-3.5 border-b border-fog align-middle text-slate tabular-nums">
                      {index + 1}
                    </td>
                    <td className="px-5 py-3.5 border-b border-fog align-middle">
                      <div className="font-medium text-ink whitespace-nowrap">
                        {item.employee_name ?? "—"}
                      </div>
                      <div className="mt-0.5 text-[12.5px] text-graphite">
                        员工ID: {item.employee_id}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 border-b border-fog align-middle text-right tabular-nums whitespace-nowrap">
                      {item.share_count.toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 border-b border-fog align-middle text-right tabular-nums whitespace-nowrap">
                      {item.lead_count.toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 border-b border-fog align-middle">
                      {item.conversion_rate == null ? (
                        <span className="text-[13px] text-slate">—</span>
                      ) : (
                        <span
                          className={`${badgeBase} tabular-nums ${
                            index === 0 ? "bg-apricot-wash text-rust" : "bg-fog text-graphite"
                          }`}
                        >
                          {item.conversion_rate.toFixed(1)}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 口径脚注（照设计稿 Screen 1） */}
      <footer className="text-[12px] text-slate leading-[1.9] pt-1">
        ① 有效新客：授权留资后剔除内部员工标记与无效线索，按留资人次统计；② 整体转化率 = 有效新客 ÷
        分享次数（近 30 天，分享归因口径）；③ 来源构成含「直接进入」线索；各模块转化率 = 末级 ÷
        分享次数，UV 口径差异详见漏斗看板脚注
      </footer>
    </div>
  );
}
