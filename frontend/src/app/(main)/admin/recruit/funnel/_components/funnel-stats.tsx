"use client";

import type { RecruitFunnelData } from "../../types";

interface FunnelStatsProps {
  /** 6 级漏斗数据（后端接口返回） */
  data: RecruitFunnelData;
  /** 区间文案，如「近 30 天」/「自定义区间」 */
  rangeLabel: string;
  /** 日期区间展示，如「2026-07-15 ~ 2026-08-13」 */
  dateRange: string;
}

interface FunnelStage {
  key: string;
  label: string;
  en: string;
  /** 条形宽度使用的数值（第 2 级取 PV） */
  barValue: number;
  /** 右侧数值展示文本（第 2 级为 "PV / UV"） */
  display: string;
  /** 底部转化率文案 */
  rateLabel: string;
  /** 条形颜色（设计稿 6 级灰阶 + Rust 收尾） */
  barColor: string;
}

/** 转化率格式化：分母为 0 时显示「—」 */
function formatRate(numerator: number, denominator: number): string {
  if (denominator <= 0) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

/**
 * 转化漏斗主卡（对齐设计稿 F3）：
 * 头部标题 + 日期区间 + 图例（整体转化率 / 授权转化率），
 * 下方 6 级漏斗条：左侧标签（中文 + EN）、中间渐窄条形（数值内嵌）、右侧数值 + 转化率。
 */
export function FunnelStats({ data, rangeLabel, dateRange }: FunnelStatsProps) {
  const { share_count, pv, uv, deep_view, clicked_auth, authed, valid_leads } = data;

  const stages: FunnelStage[] = [
    {
      key: "share_count",
      label: "分享次数",
      en: "Share Events",
      barValue: share_count,
      display: share_count.toLocaleString(),
      rateLabel: "— 基准",
      barColor: "bg-ink",
    },
    {
      key: "pv-uv",
      label: "打开 · PV / UV",
      en: "Open PV / UV",
      barValue: pv,
      display: `${pv.toLocaleString()} / ${uv.toLocaleString()}`,
      rateLabel: `打开率 ${formatRate(pv, share_count)}`,
      barColor: "bg-[#3a3d42]",
    },
    {
      key: "deep_view",
      label: "深度浏览 ≥3s",
      en: "Deep View",
      barValue: deep_view,
      display: deep_view.toLocaleString(),
      rateLabel: `深度率 ${formatRate(deep_view, pv)}`,
      barColor: "bg-graphite",
    },
    {
      key: "clicked_auth",
      label: "点击授权按钮",
      en: "Click Auth",
      barValue: clicked_auth,
      display: clicked_auth.toLocaleString(),
      rateLabel: `点击率 ${formatRate(clicked_auth, deep_view)}`,
      barColor: "bg-dove",
    },
    {
      key: "authed",
      label: "授权成功（留资）",
      en: "Leads",
      barValue: authed,
      display: authed.toLocaleString(),
      rateLabel: `授权成功率 ${formatRate(authed, clicked_auth)}`,
      barColor: "bg-slate",
    },
    {
      key: "valid_leads",
      label: "有效新客",
      en: "Valid New",
      barValue: valid_leads,
      display: valid_leads.toLocaleString(),
      rateLabel: `有效占比 ${formatRate(valid_leads, authed)}`,
      barColor: "bg-rust",
    },
  ];

  // 条形宽度基准：以首级（分享次数）为 100%，全 0 时兜底为 1
  const maxBarValue = Math.max(share_count, 1);

  // 图例：整体转化率 = 有效新客 ÷ 分享次数；授权转化率 = 留资 ÷ 点击授权
  const overallRate = formatRate(valid_leads, share_count);
  const authRate = formatRate(authed, clicked_auth);

  return (
    <div className="bg-white rounded-cards shadow-steep p-6">
      {/* 头部：标题 + 日期区间 + 图例 */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-5 border-b border-fog">
        <div>
          <div className="text-[15px] font-medium text-ink">
            转化漏斗 · {rangeLabel}
          </div>
          <div className="mt-0.5 text-[13px] text-graphite">{dateRange}</div>
        </div>
        <div className="flex flex-wrap gap-5 text-[13px] text-graphite">
          <span className="flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded bg-ink inline-block" />
            整体转化率 {overallRate}
          </span>
          <span className="flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded bg-slate inline-block" />
            授权转化率 {authRate}
          </span>
        </div>
      </div>

      {/* 6 级漏斗条 */}
      <div className="flex flex-col gap-3.5 pt-2">
        {stages.map((stage) => {
          const widthPercent = (stage.barValue / maxBarValue) * 100;
          return (
            <div
              key={stage.key}
              className="grid grid-cols-1 md:grid-cols-[200px_1fr_118px] gap-2 md:gap-4 items-center"
            >
              <div className="flex flex-col gap-0.5 text-[14px] font-medium text-ink">
                {stage.label}
                <span className="text-xs text-slate font-normal">{stage.en}</span>
              </div>
              <div className="h-10.5 flex items-center">
                <div
                  className={`h-10.5 ${stage.barColor} rounded-[14px] flex items-center justify-end pr-3.5 text-white text-[15px] font-medium tabular-nums min-w-14 transition-all duration-300`}
                  style={{ width: `${widthPercent}%` }}
                >
                  {stage.display}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[14px] font-medium text-ink tabular-nums">
                  {stage.display}
                </div>
                <div className="text-xs text-slate mt-0.5 font-normal">
                  {stage.rateLabel}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
