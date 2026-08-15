"use client";

import { cn } from "@/lib/utils";

/** KPI 卡趋势行：up=红涨 / down=绿跌 / 不传=灰色描述文本（对齐设计稿 kpi-trend） */
export interface RecruitKpiTrend {
  text: string;
  tone?: "up" | "down";
}

export interface RecruitKpiItem {
  /** 圆点颜色类（bg-ink / bg-graphite / bg-rust / bg-apricot-wash / bg-sky-wash） */
  dotClass: string;
  label: string;
  value: string;
  trend?: RecruitKpiTrend;
}

/**
 * 设计稿 KPI 概览卡：左上圆点 + 标签，32px 数值，底部趋势行。
 * 4 列网格（移动端 2 列），卡片为 Steep 白底圆角 + 投影。
 */
export function RecruitKpiGrid({ items }: { items: RecruitKpiItem[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
      {items.map((item) => (
        <div key={item.label} className="bg-white rounded-cards shadow-steep px-6 py-5">
          <div className="flex items-center gap-2 text-[13px] text-graphite">
            <span
              className={cn("h-2 w-2 rounded-full shrink-0", item.dotClass)}
              aria-hidden="true"
            />
            {item.label}
          </div>
          <div className="mt-2.5 text-[32px] font-medium leading-none tabular-nums tracking-[-0.5px] text-ink">
            {item.value}
          </div>
          {item.trend && (
            <div
              className={cn(
                "mt-2 text-xs flex items-center gap-1",
                item.trend.tone === "up"
                  ? "text-[#b91c1c]"
                  : item.trend.tone === "down"
                    ? "text-[#15803d]"
                    : "text-slate",
              )}
            >
              {item.trend.text}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
