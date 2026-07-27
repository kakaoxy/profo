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
  const [leadResponse, followUpsResult] = await Promise.all([
    client.GET("/api/v1/leads/{lead_id}", {
      params: { path: { lead_id: leadId } },
    }),
    getLeadFollowUpsAction(leadId),
  ]);

  const { data, error, response } = leadResponse;
  if (error || !data) {
    logger.error("获取线索详情失败", { leadId, error });
    // 仅 404 走 notFound()；其他错误（403/500/网络）交由 error boundary 处理
    if (response.status === 404) {
      notFound();
    }
    throw new Error(`获取线索详情失败: ${response.status}`);
  }

  const lead = mapBackendToFrontend(data);

  // 跟进记录获取失败时降级为空数组，UI 不阻塞
  if (!followUpsResult.success) {
    logger.error("获取跟进记录失败", { leadId, error: followUpsResult.error });
  }
  const followUps = followUpsResult.success ? followUpsResult.data : [];

  return <LeadDetailView lead={lead} initialFollowUps={followUps} />;
}
