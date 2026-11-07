import React from "react";
import { Pencil, X } from "lucide-react";
import { Lead, LeadStatus } from "../../types";
import { LEAD_STATUS_META } from "../../_lib/lead-status-meta";
import { cn } from "@/lib/utils";
import { safeFormatDate } from "@/lib/formatters";
import { formatBuildingLabel } from "@/lib/dict-display";
import { HasPermission } from "@/components/has-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";

interface Props {
  lead: Lead;
  onEdit?: () => void;
  onClose?: () => void;
}

export const DrawerHeader: React.FC<Props> = ({ lead, onEdit, onClose }) => {
  const address = [
    lead.buildingNo ? formatBuildingLabel(lead.buildingNo) : "",
    lead.roomNo ? `${lead.roomNo}室` : "",
    lead.district,
    lead.businessArea,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="shrink-0 px-6 pt-[22px] sm:px-7">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2 text-[10.5px] text-dove">
          <span>线索详情</span>
          <b className="truncate font-mono text-[9px] font-normal tracking-normal text-graphite">
            LD-{lead.id.slice(0, 8).toUpperCase()}
          </b>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {onEdit ? (
            <HasPermission code={PERMISSION_CODES.LEAD_WRITE}>
              <button
                type="button"
                aria-label="编辑资料"
                onClick={onEdit}
                className="flex h-8 w-8 items-center justify-center rounded-full text-graphite transition-colors hover:bg-fog hover:text-ink"
              >
                <Pencil className="h-[15px] w-[15px]" strokeWidth={1.8} />
              </button>
            </HasPermission>
          ) : null}
          {onClose ? (
            <button
              type="button"
              aria-label="关闭线索详情"
              onClick={onClose}
              className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-graphite transition-colors hover:bg-fog hover:text-ink"
            >
              <X className="h-[17px] w-[17px]" strokeWidth={1.8} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <h2 className="min-w-0 truncate text-[30px] font-[480] leading-[1.18] tracking-[-0.028em] text-ink">
          {lead.communityName}
        </h2>
        <LeadStatusBadge status={lead.status} />
      </div>
      <p className="mt-1.5 truncate text-[12.5px] text-graphite">{address || "地址待补充"}</p>
      <p className="mt-1 text-[10.5px] text-dove">
        创建 {safeFormatDate(lead.createdAt, "yyyy-MM-dd HH:mm")} · 更新{" "}
        {safeFormatDate(lead.updatedAt, "yyyy-MM-dd HH:mm")} · 录入人 {lead.creatorName || "—"}
      </p>
    </div>
  );
};

const LeadStatusBadge = ({ status }: { status: LeadStatus }) => {
  const config = LEAD_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex h-[25px] shrink-0 items-center justify-center whitespace-nowrap rounded-full px-2.5 text-[10.5px] font-medium",
        config.badgeClass,
      )}
    >
      {config.label}
    </span>
  );
};
