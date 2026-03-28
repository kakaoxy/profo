import { Lead, LeadStatus } from "../types";
import { components } from "@/lib/api-types";

type BackendLead = components["schemas"]["LeadResponse"];

export function mapBackendToFrontend(backendLead: BackendLead): Lead {
  return {
    id: backendLead.id,
    communityName: backendLead.community_name,
    layout: backendLead.layout ?? "",
    orientation: backendLead.orientation ?? "",
    floorInfo: backendLead.floor_info ?? "",
    area: backendLead.area ?? 0,
    totalPrice: backendLead.total_price ?? 0,
    unitPrice: backendLead.unit_price ?? 0,
    status: backendLead.status as LeadStatus,
    evalPrice: backendLead.eval_price ?? undefined,
    auditReason: backendLead.audit_reason ?? undefined,
    auditorId: backendLead.auditor_id?.toString() ?? undefined,
    auditTime: backendLead.audit_time ?? undefined,
    images: backendLead.images || [],
    district: backendLead.district ?? "",
    businessArea: backendLead.business_area ?? "",
    remarks: backendLead.remarks ?? "",
    creatorName: backendLead.creator_name ?? "未知",
    lastFollowUpAt: backendLead.last_follow_up_at ?? undefined,
    createdAt: new Date(backendLead.created_at).toLocaleString(),
  };
}
