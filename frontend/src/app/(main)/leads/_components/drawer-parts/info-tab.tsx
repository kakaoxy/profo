import React from "react";
import {
  Ruler,
  Home,
  MapPin,
  ArrowRightLeft,
  Clock,
  User,
} from "lucide-react";
import { Lead, LeadStatus } from "../../types";
import { MonitorCard } from "./monitor-card";
import { LeadInfoCards } from "./lead-info-cards";
import { LeadAuditPanel } from "./lead-audit-panel";
import { DetailBadge } from "./lead-detail-badge";
import { useMarketSentiment } from "./use-market-sentiment";

interface InfoTabProps {
  lead: Lead;
  onAudit: (
    leadId: string,
    status: LeadStatus,
    evalPrice?: number,
    reason?: string
  ) => void;
  onViewMonitor: (lead: Lead) => void;
}

export const InfoTab: React.FC<InfoTabProps> = ({ lead, onAudit, onViewMonitor }) => {
  const { sentiment, loading: sentimentLoading } = useMarketSentiment(lead.communityName);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Key House Params */}
      <LeadInfoCards lead={lead} />

      {/* House Config Details */}
      <div className="grid grid-cols-3 gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <DetailBadge
          icon={<Ruler className="h-3 w-3" />}
          label="面积"
          value={`${lead.area}㎡`}
        />
        <DetailBadge
          icon={<Home className="h-3 w-3" />}
          label="户型"
          value={lead.layout}
        />
        <DetailBadge
          icon={<MapPin className="h-3 w-3" />}
          label="商圈"
          value={`${lead.district} - ${lead.businessArea}`}
        />
        <DetailBadge
          icon={<ArrowRightLeft className="h-3 w-3" />}
          label="朝向"
          value={lead.orientation}
        />
        <DetailBadge
          icon={<Clock className="h-3 w-3" />}
          label="楼层"
          value={lead.floorInfo}
        />
        <DetailBadge
          icon={<User className="h-3 w-3" />}
          label="录入人"
          value={lead.creatorName}
        />
      </div>

      {/* Real-time Market Monitoring */}
      <MonitorCard
        lead={lead}
        sentiment={sentiment}
        loading={sentimentLoading}
        onViewMonitor={onViewMonitor}
      />

      {/* Action Panels per Status */}
      <LeadAuditPanel lead={lead} onAudit={onAudit} />
    </div>
  );
};
