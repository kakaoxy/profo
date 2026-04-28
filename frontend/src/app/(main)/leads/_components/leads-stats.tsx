"use client";

import { Card } from "@/components/ui/card";
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

  const items = [
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

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <Card
            key={index}
            className="p-4 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer shadow-sm"
            role="button"
            aria-label={`${item.label} ${item.value}`}
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {item.label}
                </p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {item.value}
                </p>
              </div>
              <div
                className={`h-10 w-10 rounded-full flex items-center justify-center ${item.color} text-white`}
                aria-hidden="true"
              >
                <Icon className="w-5 h-5" strokeWidth={1.75} />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
