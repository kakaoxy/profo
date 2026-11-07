"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LeadStatus, LeadTabValue } from "../types";

export interface LeadStats {
  pending_assessment: number;
  pending_visit: number;
  visited: number;
  signed: number;
  rejected: number;
  lost_to_competitor: number;
}

interface LeadsStatsProps {
  stats: LeadStats;
  activeTab?: LeadTabValue;
  onItemSelect?: (tab: LeadTabValue) => void;
}

interface StageEntry {
  tab: LeadStatus;
  no: string;
  label: string;
  description: string;
}

const STAGES: StageEntry[] = [
  {
    tab: LeadStatus.PENDING_ASSESSMENT,
    no: "01",
    label: "待评估",
    description: "等待给出评估结论",
  },
  {
    tab: LeadStatus.PENDING_VISIT,
    no: "02",
    label: "待看房",
    description: "已批准，等待实勘",
  },
  {
    tab: LeadStatus.VISITED,
    no: "03",
    label: "已看房",
    description: "实勘完成，谈判中",
  },
  {
    tab: LeadStatus.SIGNED,
    no: "04",
    label: "已签约",
    description: "合同已签，完成收房",
  },
];

/**
 * 线索漏斗：用一段连续的收房路径替代五张并列统计卡。
 * 点击任一阶段即切换列表状态筛选；「已放弃」作为独立出口放在标题右侧。
 */
export function LeadsStats({ stats, activeTab, onItemSelect }: LeadsStatsProps) {
  const rejectedCount = (stats.rejected || 0) + (stats.lost_to_competitor || 0);
  const total = STAGES.reduce((sum, stage) => sum + (stats[stage.tab] || 0), 0) + rejectedCount;
  const isRejectedActive =
    activeTab === LeadStatus.REJECTED || activeTab === LeadStatus.LOST_TO_COMPETITOR;

  return (
    <section className="mt-7 overflow-hidden rounded-cards bg-pure-white shadow-steep">
      <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-7">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-[15px] font-medium text-ink">收房漏斗</h2>
          <span className="text-[11.5px] tabular-nums text-graphite">{total} 条线索</span>
        </div>
        <button
          type="button"
          aria-pressed={isRejectedActive}
          onClick={() => onItemSelect?.(LeadStatus.REJECTED)}
          className={cn(
            "inline-flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[11.5px] font-[450] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20",
            isRejectedActive
              ? "bg-ink text-white"
              : "bg-fog text-graphite hover:bg-ink/5 hover:text-ink",
          )}
        >
          <X className="h-3 w-3" />
          已放弃
          <b className={cn("font-[480] tabular-nums", isRejectedActive ? "text-white" : "text-ink")}>
            {rejectedCount}
          </b>
        </button>
      </div>

      <div className="grid grid-cols-2 border-t border-dove/25 lg:grid-cols-4">
        {STAGES.map((stage) => {
          const isActive = activeTab === stage.tab;
          const value = stats[stage.tab] || 0;
          return (
            <button
              key={stage.tab}
              type="button"
              aria-label={`${stage.label} ${value}`}
              aria-pressed={isActive}
              onClick={() => onItemSelect?.(stage.tab)}
              className={cn(
                "relative flex min-h-[112px] flex-col items-start border-dove/25 px-5 py-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink/20 sm:px-6",
                "border-b lg:border-b-0 [&:nth-child(2)]:border-l [&:nth-child(4)]:border-l lg:[&:nth-child(3)]:border-l",
                isActive ? "bg-apricot-wash" : "hover:bg-fog",
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-[10.5px] tabular-nums tracking-[0.02em]",
                    isActive ? "text-rust/55" : "text-dove",
                  )}
                >
                  {stage.no}
                </span>
                <span
                  className={cn(
                    "text-[12.5px] font-[450]",
                    isActive ? "text-rust" : "text-graphite",
                  )}
                >
                  {stage.label}
                </span>
              </span>
              <span
                className={cn(
                  "mt-2 text-[32px] font-[480] leading-none tracking-[-0.02em] tabular-nums",
                  isActive ? "text-rust" : "text-ink",
                )}
              >
                {value}
              </span>
              <span
                className={cn(
                  "mt-2 text-[10.5px] leading-none",
                  isActive ? "text-rust/70" : "text-graphite",
                )}
              >
                {stage.description}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
