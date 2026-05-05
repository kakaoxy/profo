"use client";

import { StatsCardGrid, type StatItem } from "@/components/common";
import {
  ClipboardList,
  CalendarClock,
  CheckCircle2,
  XCircle,
  Eye,
} from "lucide-react";
import { Lead, LeadStatus } from "../types";

interface LeadsStatsProps {
  leads: Lead[];
}

export function LeadsStats({ leads }: LeadsStatsProps) {
  const stats = {
    pendingAssessment: leads.filter((l) => l.status === LeadStatus.PENDING_ASSESSMENT).length,
    pendingVisit: leads.filter((l) => l.status === LeadStatus.PENDING_VISIT).length,
    visited: leads.filter((l) => l.status === LeadStatus.VISITED).length,
    signed: leads.filter((l) => l.status === LeadStatus.SIGNED).length,
    rejected: leads.filter((l) => l.status === LeadStatus.REJECTED).length,
  };

  const items: StatItem[] = [
    {
      label: "待评估",
      value: stats.pendingAssessment,
      icon: ClipboardList,
      color: "bg-primary",
    },
    {
      label: "待看房",
      value: stats.pendingVisit,
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
