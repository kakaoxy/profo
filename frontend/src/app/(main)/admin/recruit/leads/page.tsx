import { fetchMockLeads, fetchMockCampaigns } from "../_lib/mock-recruit";
import { LeadsView } from "./_components/leads-view";

/**
 * 线索列表页（招募管理 · 区域伙伴招募计划）
 *
 * Server Component：并行获取全量线索与活动列表后交给客户端 LeadsView
 * 做筛选/分页/状态流转（mock 阶段为纯前端行为，二期替换为真实接口：
 * GET /api/v1/admin/recruit/leads、GET /api/v1/admin/recruit/campaigns）。
 */
export default async function RecruitLeadsPage() {
  // 并行获取数据，避免请求瀑布
  const [leads, campaigns] = await Promise.all([
    fetchMockLeads(),
    fetchMockCampaigns(),
  ]);

  return (
    <div className="min-h-screen bg-fog">
      <div className="w-full max-w-300 mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <LeadsView leads={leads} campaigns={campaigns} />
      </div>
    </div>
  );
}
