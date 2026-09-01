"use client";

import type { GrowthFunnelData } from "../../_lib/funnel-data";

interface FunnelStatsProps {
  /** 单模块漏斗数据（steps 由后端按模块实际层级下发，前端不写死层级） */
  data: GrowthFunnelData;
  /** 日期区间展示，如「2026-08-02 ~ 2026-09-01」 */
  dateRange: string;
}

/** 漏斗各级英文副标题（设计稿展示用，后端无此字段） */
const STEP_EN_LABELS: Record<string, string> = {
  share: "Share Events",
  pv: "Open PV",
  uv: "Open UV",
  deep_view: "Deep View",
  clicked_auth: "Click Auth",
  leads: "Leads",
  valid_leads: "Valid New",
};

/** 漏斗条灰阶配色（首级 Ink → 深灰过渡，末级 Rust 收尾，对齐设计稿） */
const FUNNEL_BAR_LADDER = ["bg-ink", "bg-[#3a3d42]", "bg-graphite", "bg-slate", "bg-dove"] as const;

function barColor(index: number, total: number): string {
  if (index === total - 1) return "bg-rust";
  return FUNNEL_BAR_LADDER[Math.min(index, FUNNEL_BAR_LADDER.length - 1)];
}

/** 转化率格式化：null（分母为 0）时显示「—」 */
function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${rate.toFixed(1)}%`;
}

/**
 * 单模块转化漏斗卡（对齐设计稿 Screen 3 漏斗区）：
 * 头部标题 + 日期区间 + 图例（整体转化率 + 关键率），
 * 漏斗行（标签中英文 → 渐窄条形 → 数值 + 逐级转化率），
 * 条形区下方渲染后端下发的 UV 口径标识与口径说明（notes）。
 */
export function FunnelStats({ data, dateRange }: FunnelStatsProps) {
  const { steps, uv_metric, notes } = data;
  const first = steps[0];
  const last = steps[steps.length - 1];

  // 条形宽度基准：以首级（分享）为 100%，全 0 时兜底为 1
  const maxBarValue = Math.max(first?.value ?? 0, 1);
  // 图例：整体转化率 = 末级 ÷ 首级；关键率 = 末级相对上一级转化率（后端下发）
  const overallRate =
    first && last && first.value > 0 ? ((last.value / first.value) * 100).toFixed(1) : null;

  return (
    <div className="bg-white rounded-cards shadow-steep p-6">
      {/* 头部：标题 + 日期区间 + 图例 */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-5 border-b border-fog">
        <div>
          <div className="text-[15px] font-medium text-ink">转化漏斗 · 近 {data.days} 天</div>
          <div className="mt-0.5 text-[13px] text-graphite">
            近 {data.days} 天：{dateRange}
          </div>
        </div>
        <div className="flex flex-wrap gap-5 text-[13px] text-graphite">
          <span className="inline-flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-[3px] bg-ink inline-block" />
            整体转化率 {overallRate === null ? "—" : `${overallRate}%`}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-[3px] bg-slate inline-block" />
            关键率 {last ? formatRate(last.conversion) : "—"}
          </span>
        </div>
      </div>

      {/* 漏斗条（层级由响应 steps 驱动：招募 7 级，其余模块 4 级） */}
      <div className="flex flex-col gap-3.5 pt-2">
        {steps.map((step, index) => {
          const widthPercent = (step.value / maxBarValue) * 100;
          return (
            <div
              key={step.key}
              className="grid grid-cols-1 md:grid-cols-[200px_1fr_118px] gap-2 md:gap-4 items-center"
            >
              <div className="flex flex-col gap-0.5 text-[14px] font-medium text-ink">
                {step.label}
                {STEP_EN_LABELS[step.key] && (
                  <span className="text-xs text-slate font-normal">{STEP_EN_LABELS[step.key]}</span>
                )}
              </div>
              <div className="h-10.5 flex items-center">
                <div
                  className={`h-10.5 ${barColor(index, steps.length)} rounded-[14px] flex items-center justify-end pr-3.5 text-white text-[15px] font-medium tabular-nums min-w-14 transition-all duration-300`}
                  style={{ width: `${widthPercent}%` }}
                >
                  {step.value.toLocaleString()}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[14px] font-medium text-ink tabular-nums">
                  {step.value.toLocaleString()}
                </div>
                <div className="text-xs text-slate mt-0.5 font-normal">
                  {index === 0 ? "— 基准" : `转化率 ${formatRate(step.conversion)}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 口径说明：UV 口径标识 + 后端口径文案 */}
      <div className="mt-4 pt-3.5 border-t border-fog text-xs text-slate leading-[1.8]">
        <p>UV 口径：{uv_metric}</p>
        <p>{notes}</p>
      </div>
    </div>
  );
}
