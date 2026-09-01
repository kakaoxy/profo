"use client";

import { AlertTriangle } from "lucide-react";

import type { GrowthFunnelCompareData } from "../../_lib/funnel-data";
import type { GrowthModule } from "../../types";
import { GROWTH_MODULE_META, GROWTH_MODULE_ORDER } from "../../types";

interface FunnelCompareProps {
  /** 四模块对比数据（uv_percent / leads_percent 为真实百分比、可 >100） */
  data: GrowthFunnelCompareData;
}

/** 各模块留资级行标签（对齐设计稿：估价=留资 / 预约=预约 / 房源单=承接留资 / 招募=留资） */
const LEADS_ROW_LABEL: Record<GrowthModule, string> = {
  valuation: "留资",
  booking: "预约",
  sheet: "承接留资",
  recruit: "留资",
};

/** 药丸 Badge 基础样式（与设计稿 .badge 一致） */
const BADGE_BASE =
  "inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-0.5 rounded-full whitespace-nowrap";

/** 对比条形配色（对齐设计稿 cmp-row：分享 Ink / 打开UV Graphite / 留资 Rust） */
const ROW_BAR_COLORS = ["bg-ink", "bg-graphite", "bg-rust"] as const;

/** 对比行：条形宽度按 100% 封顶渲染，百分比文本显示真实值（可 >100%） */
function CompareRow({
  label,
  percent,
  index,
}: {
  label: string;
  percent: number | null;
  index: number;
}) {
  const width = Math.min(percent ?? 0, 100);
  return (
    <div className="grid grid-cols-[52px_1fr_42px] gap-2 items-center mt-2">
      <span className="text-[11px] text-graphite whitespace-nowrap">{label}</span>
      <div className="h-4 rounded-full bg-fog overflow-hidden">
        <i
          className={`block h-full rounded-full ${ROW_BAR_COLORS[index]} transition-all duration-300`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-[11px] text-slate text-right tabular-nums">
        {percent === null ? "—" : `${percent}%`}
      </span>
    </div>
  );
}

/**
 * 全部对比 · 归一化漏斗卡（对齐设计稿 Screen 3 对比区）：
 * 四模块并排（各模块分享 = 100% 基准），打开 UV 超 100% 时条形封顶、
 * 百分比文本显示真实值；底部警示条标注 UV 口径差异。
 */
export function FunnelCompare({ data }: FunnelCompareProps) {
  // 按 GROWTH_MODULE_ORDER 固定顺序渲染（估价 → 房源预约 → 房源单 → 招募）
  const rows = GROWTH_MODULE_ORDER.map((module) =>
    data.modules.find((row) => row.module === module),
  ).filter((row) => row !== undefined);

  return (
    <div className="bg-white rounded-cards shadow-steep p-6">
      {/* 头部 */}
      <div className="pb-5 border-b border-fog">
        <div className="text-[15px] font-medium text-ink">全部对比 · 归一化漏斗</div>
        <div className="mt-0.5 text-[13px] text-graphite">
          以各模块分享 = 100% 基准 · 打开 UV 超 100% 时条形封顶、百分比标注真实值
        </div>
      </div>

      {/* 四模块并排归一化条形 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 pt-5">
        {rows.map((row) => {
          const meta = GROWTH_MODULE_META[row.module];
          return (
            <div key={row.module} className="border border-[#f0f1f3] rounded-2xl p-4">
              <div className="flex flex-col gap-1.5 mb-2.5">
                <span className={`${BADGE_BASE} ${meta.badge}`}>{meta.label}</span>
                <span className="text-xs text-slate tabular-nums">
                  分享 {row.share_count.toLocaleString()} · 基准 100%
                </span>
              </div>
              <CompareRow label="分享" percent={100} index={0} />
              <CompareRow label="打开UV" percent={row.uv_percent} index={1} />
              <CompareRow
                label={LEADS_ROW_LABEL[row.module]}
                percent={row.leads_percent}
                index={2}
              />
            </div>
          );
        })}
      </div>

      {/* UV 口径差异警示条（对齐设计稿 .warn-bar） */}
      <div className="mt-5 flex gap-2.5 items-start rounded-[14px] px-4 py-3.5 bg-[#fef3c7] border border-[#f5d97a] text-[#92400e] text-[13px] leading-[1.7]">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          {
            "口径提示：招募 UV 为登录态 openid_hash，其余模块为匿名 visitor_id，UV / 转化率不可跨模块横向对比，对比仅看相对趋势。"
          }
        </span>
      </div>
    </div>
  );
}
