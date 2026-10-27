import { Lead, LeadStatus } from "../types";
import type { LeadLatestFollowUp } from "../types";
import { components } from "@/lib/api-types";

import type { FollowUpConclusion } from "../types";

/**
 * 列表项与详情项共同的后端形态：详情（LeadResponse）不回 latest_follow_up
 * （仅列表 LeadListItem 回填），此处取交集避免对详情路径伪造空摘要。
 */
type BackendLead = Omit<components["schemas"]["LeadListItem"], "latest_follow_up"> &
  Partial<Pick<components["schemas"]["LeadListItem"], "latest_follow_up">>;

export function mapBackendToFrontend(backendLead: BackendLead): Lead {
  return {
    id: backendLead.id,
    communityName: backendLead.community_name,
    communityId: backendLead.community_id ?? undefined,
    // 楼盘字典四级地址（M3 / FR-18）+ 解析名称（surface-dict-binding-info）
    buildingId: backendLead.building_id ?? null,
    roomId: backendLead.room_id ?? null,
    dictStatus: (backendLead.dict_status as Lead["dictStatus"]) ?? null,
    buildingNo: backendLead.building_no ?? null,
    roomNo: backendLead.room_no ?? null,
    layout: backendLead.layout ?? "",
    orientation: backendLead.orientation ?? "",
    floorInfo: backendLead.floor_info ?? "",
    area: backendLead.area ?? 0,
    totalPrice: backendLead.total_price ?? 0,
    unitPrice: backendLead.unit_price ?? 0,
    status: backendLead.status as LeadStatus,
    evalPrice: backendLead.eval_price ?? undefined,
    expectedPrice: backendLead.expected_price ?? undefined,
    auditReason: backendLead.audit_reason ?? undefined,
    auditorId: backendLead.auditor_id?.toString() ?? undefined,
    auditTime: backendLead.audit_time ?? undefined,
    // createdAt / updatedAt 均保留原始 ISO 字符串，由展示层统一格式化
    updatedAt: backendLead.updated_at ?? undefined,
    images: backendLead.images || [],
    district: backendLead.district ?? "",
    businessArea: backendLead.business_area ?? "",
    remarks: backendLead.remarks ?? "",
    creatorName: backendLead.creator_name ?? "未知",
    referrerId: backendLead.referrer_id ?? undefined,
    referrerName: backendLead.referrer_name ?? undefined,
    lastFollowUpAt: backendLead.last_follow_up_at ?? undefined,
    latestFollowUp: backendLead.latest_follow_up
      ? ({
          method: backendLead.latest_follow_up.method,
          content: backendLead.latest_follow_up.content,
          conclusion: (backendLead.latest_follow_up.conclusion ??
            null) as FollowUpConclusion | null,
          followedAt: backendLead.latest_follow_up.followed_at,
          createdByName: backendLead.latest_follow_up.created_by_name ?? null,
        } satisfies LeadLatestFollowUp)
      : null,
    createdAt: backendLead.created_at ?? "",
  };
}
