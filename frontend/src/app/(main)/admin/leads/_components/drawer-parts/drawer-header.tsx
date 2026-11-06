import React from "react";
import { Pencil } from "lucide-react";
import { Lead, LeadStatus } from "../../types";
import { LEAD_STATUS_META } from "../../_lib/lead-status-meta";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { HasPermission } from "@/components/has-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";

interface Props {
  lead: Lead;
  onEdit?: () => void;
}

export const DrawerHeader: React.FC<Props> = ({ lead, onEdit }) => {
  return (
    <div className="flex items-center justify-between border-b border-dove p-6 pr-12 bg-white shrink-0">
      <div className="min-w-0 pr-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-normal text-graphite tracking-wide">Case #{lead.id}</span>
          <LeadStatusBadge status={lead.status} />
        </div>
        <h2 className="font-display font-medium text-xl text-ink tracking-tight truncate">
          {lead.communityName}
        </h2>
      </div>
      {onEdit ? (
        <HasPermission code={PERMISSION_CODES.LEAD_WRITE}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 rounded-full"
            aria-label="编辑线索"
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
            编辑线索
          </Button>
        </HasPermission>
      ) : null}
    </div>
  );
};

const LeadStatusBadge = ({ status }: { status: LeadStatus }) => {
  const config = LEAD_STATUS_META[status];
  return (
    <span className={cn("px-2 py-0.5 text-[10px] font-medium", config.badgeClass)}>
      {config.label}
    </span>
  );
};
