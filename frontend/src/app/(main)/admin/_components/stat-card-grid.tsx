import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** KPI 卡底部趋势 / 说明行 */
export interface StatTrend {
  /** 趋势文案，可为富文本（如「活跃 3 · 累计线索 12」） */
  text: ReactNode;
  /** 语义色调：up=上涨（红）/ down=下跌（绿）/ neutral=中性（Graphite，默认） */
  tone?: "up" | "down" | "neutral";
}

export interface StatItem {
  /** 卡片标签 */
  label: ReactNode;
  /** 主数值 */
  value: ReactNode;
  /** 数值单位（渲染为主值右侧小字） */
  unit?: string;
  /** 右上角图标节点（如 `<Users className="h-4 w-4" />`） */
  icon?: ReactNode;
  /** 标签左侧圆点颜色类（bg-ink / bg-rust / bg-apricot-wash / bg-sky-wash）；不传则无圆点 */
  dotColor?: string;
  /** 底部趋势 / 说明行 */
  trend?: StatTrend;
  /** 暖色卡（Apricot Wash 底）；整屏建议最多一张，承载唯一彩色强调 */
  warm?: boolean;
  /** 主数值附加类（如 text-rust 语义色覆盖） */
  valueClassName?: string;
  /** 单卡附加类 */
  className?: string;
}

export interface StatCardGridProps {
  items: StatItem[];
  /** 桌面端列数，默认 4；移动端固定 2 列 */
  columns?: 2 | 3 | 4 | 5;
  className?: string;
}

const COLUMN_CLASS: Record<NonNullable<StatCardGridProps["columns"]>, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
};

const TREND_TONE_CLASS: Record<NonNullable<StatTrend["tone"]>, string> = {
  up: "text-money-positive",
  down: "text-money-negative",
  neutral: "text-graphite",
};

/**
 * 后台统一 KPI 卡网格（Steep 体系）。
 *
 * 卡片壳固定为 `bg-white rounded-cards shadow-steep px-6 py-5`（暖卡为 `bg-apricot-wash`），
 * 主数值 30px / weight 450 / leading 1.1 / tabular-nums（DESIGN.md Metric 口径）。
 *
 * 各页面历史上自研的私有 KPI/统计卡实现一律收敛到本组件，不再保留页面级私有 KPI 样式。
 * Server Component 可渲染，无浏览器 API / hooks 依赖。
 */
export function StatCardGrid({ items, columns = 4, className }: StatCardGridProps) {
  return (
    <div className={cn("grid gap-5", COLUMN_CLASS[columns], className)}>
      {items.map((item, index) => (
        <div
          key={index}
          className={cn(
            "rounded-cards shadow-steep px-6 py-5",
            item.warm ? "bg-apricot-wash" : "bg-white",
            item.className,
          )}
        >
          <div className="flex items-center justify-between gap-2 text-[13px]">
            <div className="flex min-w-0 items-center gap-2">
              {item.dotColor ? (
                <span
                  className={cn("h-2 w-2 shrink-0 rounded-full", item.dotColor)}
                  aria-hidden="true"
                />
              ) : null}
              <span className={cn("truncate", item.warm ? "text-rust" : "text-graphite")}>
                {item.label}
              </span>
            </div>
            {item.icon ? (
              <span
                className={cn("shrink-0", item.warm ? "text-rust" : "text-dove")}
                aria-hidden="true"
              >
                {item.icon}
              </span>
            ) : null}
          </div>

          <div
            className={cn(
              "mt-2.5 text-[30px] font-[450] leading-[1.1] tabular-nums",
              item.warm ? "text-rust" : "text-ink",
              item.valueClassName,
            )}
          >
            {item.value}
            {item.unit ? (
              <span className="ml-1 text-[15px] font-normal text-graphite">{item.unit}</span>
            ) : null}
          </div>

          {item.trend ? (
            <div className={cn("mt-2 text-xs", TREND_TONE_CLASS[item.trend.tone ?? "neutral"])}>
              {item.trend.text}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
