"use client";

import React, { useState } from "react";
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
import { Lead, LeadStatus, FollowUp, FollowUpConclusion, FollowUpMethod } from "../../types";
import { formatBuildingLabel } from "@/lib/dict-display";
import { safeFormatDate } from "@/lib/formatters";
import { KpiRow } from "./kpi-row";
import { AssessmentSummary } from "./assessment-summary";
import { OwnerNotesSection } from "./owner-notes-section";
import { ImagesStrip } from "./images-strip";
import { LeadAuditPanel } from "./lead-audit-panel";
import { FollowUpTimeline } from "./follow-up-timeline";
import { LeadAttributionCard } from "./lead-attribution-card";

interface InfoTabProps {
  lead: Lead;
  onAudit: (leadId: string, status: LeadStatus, evalPrice?: number, reason?: string) => void;
  followUps: FollowUp[];
  onAddFollowUp: (
    leadId: string,
    method: FollowUpMethod,
    content: string,
    conclusion?: FollowUpConclusion | null,
  ) => void;
  onRefreshFollowUps: (updated: FollowUp[]) => void;
  onImagesUpdate?: (images: string[]) => void;
  onOpenAssessment?: () => void;
}

const formatDateTime = (raw?: string): string => {
  return safeFormatDate(raw, "yyyy-MM-dd HH:mm", "—");
};

interface ParamCell {
  icon: React.ElementType;
  label: string;
  value: string;
}

const ParamsSection: React.FC<{ lead: Lead }> = ({ lead }) => {
  const pending = lead.dictStatus === "pending";
  const dictCells: ParamCell[] = [];
  if (lead.buildingNo || lead.buildingId) {
    dictCells.push({
      icon: Building,
      label: "楼栋",
      value: lead.buildingNo
        ? `${formatBuildingLabel(lead.buildingNo)}${pending ? "（未审核）" : ""}`
        : `ID:${lead.buildingId}`,
    });
  }
  if (lead.roomNo || lead.roomId) {
    dictCells.push({
      icon: Building,
      label: "户室",
      value: lead.roomNo ? `${lead.roomNo}室${pending ? "（未审核）" : ""}` : `ID:${lead.roomId}`,
    });
  }
  const baseCells: ParamCell[] = [
    { icon: Ruler, label: "面积", value: lead.area > 0 ? `${lead.area}㎡` : "—" },
    { icon: Home, label: "户型", value: lead.layout || "—" },
    { icon: ArrowRightLeft, label: "朝向", value: lead.orientation || "—" },
    { icon: Building, label: "楼层", value: lead.floorInfo || "—" },
    {
      icon: MapPin,
      label: "商圈",
      value: [lead.district, lead.businessArea].filter(Boolean).join(" · ") || "—",
    },
  ];
  const params: ParamCell[] = [
    ...baseCells.slice(0, 4),
    ...dictCells,
    ...baseCells.slice(4),
    { icon: User, label: "录入人", value: lead.creatorName || "—" },
    { icon: Clock, label: "建档时间", value: formatDateTime(lead.createdAt) },
    {
      icon: History,
      label: "最近跟进",
      value: lead.lastFollowUpAt ? formatDateTime(lead.lastFollowUpAt) : "—",
    },
  ];

  return (
    <section className="overflow-hidden rounded-[16px] border border-dove/35 bg-pure-white">
      <div className="flex items-center justify-between border-b border-dove/25 px-5 py-3">
        <span className="inline-flex items-center gap-2 text-[12px] font-[500] text-ink">
          <Layers className="h-3.5 w-3.5 text-graphite" strokeWidth={1.7} />
          房屋参数
        </span>
        <span className="text-[10px] text-dove">{params.length} 项</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4">
        {params.map((p) => (
          <div
            key={p.label}
            className="min-w-0 border-b border-r border-dove/15 px-4 py-3 last:border-r-0 sm:px-5"
          >
            <span className="flex items-center gap-1 text-[9.5px] text-dove">
              <p.icon className="h-3 w-3 shrink-0" strokeWidth={1.6} />
              {p.label}
            </span>
            <span className="mt-1 block truncate text-[11.5px] font-[450] tabular-nums text-ink">
              {p.value}
            </span>
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
  onOpenAssessment,
}) => {
  const [evalRefreshKey, setEvalRefreshKey] = useState(0);

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <KpiRow lead={lead} />
      <AssessmentSummary
        lead={lead}
        refreshKey={evalRefreshKey}
        onOpenAssessment={onOpenAssessment}
      />
      <ParamsSection lead={lead} />
      <OwnerNotesSection lead={lead} />
      <LeadAttributionCard lead={lead} />
      <ImagesStrip images={lead.images} onImagesChange={onImagesUpdate} />
      {lead.status !== LeadStatus.PENDING_ASSESSMENT ? (
        <LeadAuditPanel
          lead={lead}
          onAudit={onAudit}
          onOpenAssessment={onOpenAssessment}
          onEvalAdjusted={() => setEvalRefreshKey((value) => value + 1)}
        />
      ) : null}
      <FollowUpTimeline
        lead={lead}
        followUps={followUps}
        onAddFollowUp={onAddFollowUp}
        onRefreshFollowUps={onRefreshFollowUps}
      />
    </div>
  );
};
