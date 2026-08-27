import React from "react";
import {
  Ruler,
  Home,
  MapPin,
  ArrowRightLeft,
  Clock,
  User,
  Building,
  History,
  Layers,
} from "lucide-react";
import { Lead, LeadStatus, FollowUp, FollowUpMethod } from "../../types";
import { safeFormatDate } from "@/lib/formatters";
import { KpiRow } from "./kpi-row";
import { OwnerNotesSection } from "./owner-notes-section";
import { ImagesStrip } from "./images-strip";
import { LeadAuditPanel } from "./lead-audit-panel";
import { FollowUpTimeline } from "./follow-up-timeline";

interface InfoTabProps {
  lead: Lead;
  onAudit: (leadId: string, status: LeadStatus, evalPrice?: number, reason?: string) => void;
  followUps: FollowUp[];
  onAddFollowUp: (leadId: string, method: FollowUpMethod, content: string) => void;
  onRefreshFollowUps: (updated: FollowUp[]) => void;
  onImagesUpdate?: (images: string[]) => void;
}

const formatDateTime = (raw?: string): string => {
  return safeFormatDate(raw, "yyyy-MM-dd HH:mm", "—");
};

interface ParamCell {
  icon: React.ElementType;
  label: string;
  value: string;
}

interface ParamsSectionProps {
  lead: Lead;
}

const ParamsSection: React.FC<ParamsSectionProps> = ({ lead }) => {
  const params: ParamCell[] = [
    { icon: Ruler, label: "面积", value: `${lead.area}㎡` },
    { icon: Home, label: "户型", value: lead.layout },
    { icon: ArrowRightLeft, label: "朝向", value: lead.orientation },
    { icon: Building, label: "楼层", value: lead.floorInfo },
    {
      icon: MapPin,
      label: "商圈",
      value: `${lead.district} · ${lead.businessArea}`,
    },
    { icon: User, label: "录入人", value: lead.referrerName || lead.creatorName },
    { icon: Clock, label: "建档时间", value: formatDateTime(lead.createdAt) },
    {
      icon: History,
      label: "最近跟进",
      value: lead.lastFollowUpAt ? formatDateTime(lead.lastFollowUpAt) : "—",
    },
  ];

  return (
    <section className="bg-pure-white rounded-cards shadow-steep-sm overflow-hidden">
      <div className="bg-fog px-4 py-2.5 border-b border-dove flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Layers className="h-3 w-3 text-graphite" />
          <span className="text-xs font-medium text-graphite">房屋参数</span>
        </div>
        <span className="text-xs text-graphite font-medium">{params.length} 项</span>
      </div>
      <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {params.map((p) => (
          <div key={p.label} className="flex flex-col gap-1 min-w-0">
            <span className="text-xs text-graphite flex items-center gap-1">
              <p.icon className="h-3 w-3 shrink-0" />
              {p.label}
            </span>
            <span className="text-sm text-ink font-medium tabular-nums truncate">{p.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

export const InfoTab: React.FC<InfoTabProps> = ({
  lead,
  onAudit,
  followUps,
  onAddFollowUp,
  onRefreshFollowUps,
  onImagesUpdate,
}) => (
  <div className="space-y-4 animate-in fade-in duration-300">
    <KpiRow lead={lead} />
    <ParamsSection lead={lead} />
    <OwnerNotesSection lead={lead} />
    <ImagesStrip images={lead.images} onImagesChange={onImagesUpdate} />
    <LeadAuditPanel lead={lead} onAudit={onAudit} />
    <FollowUpTimeline
      lead={lead}
      followUps={followUps}
      onAddFollowUp={onAddFollowUp}
      onRefreshFollowUps={onRefreshFollowUps}
    />
  </div>
);
