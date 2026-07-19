"use client";

import { memo, useCallback } from "react";
import { useRouter } from "next/navigation";

import type { RawDashboardLead } from "../types";
import { getStatusStyleConfig } from "@/lib/status-colors";
import { formatPriceWan, safeFormatDate } from "@/lib/formatters";

interface DashboardLeadsCardListProps {
  leads: RawDashboardLead[];
}

interface LeadCardProps {
  lead: RawDashboardLead;
  onClick: (id: string) => void;
}

const LeadCard = memo(function LeadCard({ lead, onClick }: LeadCardProps) {
  const config = getStatusStyleConfig(lead.status);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(lead.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(lead.id);
        }
      }}
      className="active:opacity-70 cursor-pointer transition rounded-lg border border-border bg-card p-3 flex flex-col gap-1"
    >
      <div className="truncate font-medium text-sm text-foreground">
        {lead.community}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-error font-bold tabular-nums">
            {formatPriceWan(lead.totalPrice)}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            评估: {formatPriceWan(lead.evalPrice)}
          </span>
        </div>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${config.className}`}
        >
          {config.label}
        </span>
      </div>
      <div className="text-xs text-muted-foreground tabular-nums">
        {safeFormatDate(lead.updatedAt, "MM/dd")}
      </div>
    </div>
  );
});

export function DashboardLeadsCardList({
  leads,
}: DashboardLeadsCardListProps) {
  const router = useRouter();

  const handleClick = useCallback(
    (id: string) => {
      router.push(`/admin/leads/${id}`);
    },
    [router],
  );

  if (leads.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/40 py-12 text-center text-sm text-muted-foreground">
        暂无线索数据
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {leads.map((lead) => (
        <LeadCard key={lead.id} lead={lead} onClick={handleClick} />
      ))}
    </div>
  );
}
