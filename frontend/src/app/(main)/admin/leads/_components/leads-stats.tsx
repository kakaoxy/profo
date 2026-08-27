"use client";

import { ClipboardList, CalendarClock, Eye, CheckCircle2, XCircle } from "lucide-react";
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

interface StatEntry {
  tab: LeadStatus;
  label: string;
  icon: typeof ClipboardList;
  warm?: boolean;
}

const STAT_ENTRIES: StatEntry[] = [
  { tab: LeadStatus.PENDING_ASSESSMENT, label: "待评估", icon: ClipboardList },
  { tab: LeadStatus.PENDING_VISIT, label: "待看房", icon: CalendarClock },
  { tab: LeadStatus.VISITED, label: "已看房", icon: Eye },
  { tab: LeadStatus.SIGNED, label: "已签约", icon: CheckCircle2, warm: true },
  { tab: LeadStatus.REJECTED, label: "已放弃", icon: XCircle },
];

export function LeadsStats({ stats, activeTab, onItemSelect }: LeadsStatsProps) {
  const isRejectedTabActive =
    activeTab === LeadStatus.REJECTED || activeTab === LeadStatus.LOST_TO_COMPETITOR;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      {STAT_ENTRIES.map((item) => {
        const Icon = item.icon;
        // 「已放弃」卡在 rejected 或 lost_to_competitor 任一激活态下都高亮
        const isActive =
          item.tab === LeadStatus.REJECTED ? isRejectedTabActive : activeTab === item.tab;
        // 已放弃 = rejected + lost_to_competitor（他司成交归属到放弃）
        const value =
          item.tab === LeadStatus.REJECTED
            ? (stats.rejected || 0) + (stats.lost_to_competitor || 0)
            : (stats[item.tab as keyof LeadStats] ?? 0);
        return (
          <button
            key={item.tab}
            type="button"
            aria-label={`${item.label} ${value}`}
            aria-pressed={isActive}
            onClick={() => onItemSelect?.(item.tab)}
            className={cn(
              "rounded-cards shadow-steep-sm p-5 cursor-pointer text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink",
              item.warm ? "bg-apricot-wash" : "bg-pure-white",
              isActive ? "ring-2 ring-ink" : "hover:shadow-steep",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-graphite">{item.label}</span>
              <Icon className="h-4 w-4 text-graphite" />
            </div>
            <div
              className={cn(
                "mt-3 text-2xl font-medium tabular-nums",
                item.warm ? "text-rust" : "text-ink",
              )}
            >
              {value}
            </div>
          </button>
        );
      })}
    </div>
  );
}
