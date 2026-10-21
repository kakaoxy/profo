"use client";

import React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SCORE_LABELS,
  daysSummary,
  daysTier,
  daysTierLabel,
  scoreLabel,
  scoreStars,
} from "@/lib/lead-verdict";

/**
 * 评估结论徽标组：房源条件分 + 装修后可售周期.
 *
 * admin 评估历史行与小程序列表卡共用同一套口径（前端 → admin；小程序侧用 .vchip 同名类）。
 *
 * 纪律：
 * - 存量记录（字段为空）**显式降级**为灰底「未评分 / 周期待补」——不隐藏、不补默认值，
 *   缺口本身就是待办信息；
 * - 只有「≤30 天（快）」使用深底强色块；列表里每张卡都有强色块等于都没有。
 */

interface ScoreBadgesProps {
  score?: number | null;
  days?: number | null;
  /** 紧凑模式（列表行内，字号更小） */
  compact?: boolean;
}

/** 五星（只读）：实心=得分，空心=未得；颜色之外还有填充差异，不依赖颜色可读。 */
export const Stars: React.FC<{ score?: number | null; size?: "sm" | "md" }> = ({
  score,
  size = "sm",
}) => {
  const filled = scoreStars(score);
  return (
    <span
      className={cn("inline-flex items-center", size === "sm" ? "gap-[1.5px]" : "gap-[2px]")}
      aria-hidden="true"
    >
      {filled.map((on, i) => (
        <Star
          key={i}
          className={cn(
            size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3",
            on ? "fill-rust text-rust" : "fill-transparent text-[#f2d0ba]",
          )}
        />
      ))}
    </span>
  );
};

export const ScoreBadges: React.FC<ScoreBadgesProps> = ({ score, days, compact }) => {
  const hasScore = typeof score === "number" && scoreLabel(score) != null;
  const tier = daysTier(days);

  return (
    <span className={cn("inline-flex flex-wrap items-center", compact ? "gap-1" : "gap-1.5")}>
      {/* 房源条件分 */}
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full font-medium",
          compact ? "h-[22px] px-2 text-[10px]" : "h-[26px] px-2.5 text-[11px]",
          hasScore ? "bg-apricot-wash text-rust" : "bg-fog text-graphite",
        )}
        title={
          hasScore
            ? `房源条件分 ${score} / 5 · ${SCORE_LABELS[score as 1 | 2 | 3 | 4 | 5]}`
            : "尚未录入房源条件分"
        }
      >
        <Stars score={hasScore ? score : null} />
        {hasScore ? `${score}.0 ${SCORE_LABELS[score as 1 | 2 | 3 | 4 | 5]}` : "未评分"}
      </span>

      {/* 装修后可售周期 */}
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full font-medium tabular-nums",
          compact ? "h-[22px] px-2 text-[10px]" : "h-[26px] px-2.5 text-[11px]",
          tier === "rush"
            ? "bg-rust text-white"
            : tier === "slow"
              ? "bg-[#eef0f3] text-graphite"
              : tier === "slowish" || tier === "normal"
                ? "bg-fog text-ash"
                : "bg-fog text-dove",
        )}
        title={
          tier == null
            ? "尚未录入装修后可售周期"
            : `装修后预计 ${days} 天可售出（${daysTierLabel(days)}）`
        }
      >
        {daysSummary(days)}
      </span>
    </span>
  );
};
