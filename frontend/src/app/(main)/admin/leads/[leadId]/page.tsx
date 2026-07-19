import { notFound } from "next/navigation";

import { fetchClient } from "@/lib/api-server";
import { logger } from "@/lib/logger";
import { mapBackendToFrontend } from "../lib/utils";
import { getLeadFollowUpsAction } from "../actions/follow-up-actions";
import { LeadDetailView } from "./_components/lead-detail-view";

interface PageProps {
  params: Promise<{ leadId: string }>;
}

export default async function LeadDetailPage({ params }: PageProps) {
  const { leadId } = await params;

  const client = await fetchClient();

  // 并行拉取线索详情 + 跟进记录，消除请求瀑布
  const [leadResponse, followUps] = await Promise.all([
    client.GET("/api/v1/leads/{lead_id}", {
      params: { path: { lead_id: leadId } },
    }),
    getLeadFollowUpsAction(leadId),
  ]);

  const { data, error } = leadResponse;
  if (error || !data) {
    // notFound() 返回 404，但实际可能是 403/500 等；记录原始错误便于排障
    logger.error("获取线索详情失败", { leadId, error });
    notFound();
  }

  const lead = mapBackendToFrontend(data);

  return <LeadDetailView lead={lead} initialFollowUps={followUps} />;
}
