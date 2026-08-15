"use client";

import { StatsCardGrid, type StatItem } from "@/components/common";
import { ClipboardList, CalendarClock, CheckCircle2, XCircle, Eye } from "lucide-react";

export interface LeadStats {
  pending_assessment: number;
  pending_visit: number;
  visited: number;
  signed: number;
  rejected: number;
}

interface LeadsStatsProps {
  stats: LeadStats;
}

export function LeadsStats({ stats }: LeadsStatsProps) {
  const items: StatItem[] = [
    {
      label: "待评估",
      value: stats.pending_assessment,
      icon: ClipboardList,
      color: "bg-primary",
    },
    {
      label: "待看房",
      value: stats.pending_visit,
      icon: CalendarClock,
      color: "bg-tertiary",
    },
    {
      label: "已看房",
      value: stats.visited,
      icon: Eye,
      color: "bg-on-surface",
    },
    {
      label: "已签约",
      value: stats.signed,
      icon: CheckCircle2,
      color: "bg-primary",
    },
    {
      label: "已驳回",
      value: stats.rejected,
      icon: XCircle,
      color: "bg-error",
    },
  ];

  return <StatsCardGrid items={items} columns={5} />;
}
