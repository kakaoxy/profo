import React from "react";
import { Lead, LeadStatus } from "../../types";
import { LEAD_STATUS_META } from "../../_lib/lead-status-meta";
import { cn } from "@/lib/utils";

interface Props {
  lead: Lead;
}

export const DrawerHeader: React.FC<Props> = ({ lead }) => {
  return (
    <div className="flex items-center justify-between border-b border-dove p-6 bg-card shrink-0">
      <div className="min-w-0 pr-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-normal text-graphite tracking-wide">
            Case #{lead.id}
          </span>
          <LeadStatusBadge status={lead.status} />
        </div>
        <h2 className="font-display font-medium text-xl text-ink tracking-tight truncate">
          {lead.communityName}
        </h2>
      </div>
    </div>
  );
};

const LeadStatusBadge = ({ status }: { status: LeadStatus }) => {
  const config = LEAD_STATUS_META[status];
  return (
    <span
      className={cn(
        "px-2 py-0.5 text-[10px] font-medium",
        config.badgeClass,
      )}
    >
      {config.label}
    </span>
  );
};
