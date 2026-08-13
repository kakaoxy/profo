import { fetchMockEmployees, fetchMockCampaigns } from "../_lib/mock-recruit";
import { FunnelView } from "./_components/funnel-view";

/**
 * 招募计划 · 漏斗看板页（F3）。
 *
 * 第一期：员工/活动维度数据来自本地 mock 数据层；
 * 二期替换为真实接口（GET /api/v1/admin/recruit/employees、
 * GET /api/v1/admin/recruit/campaigns、GET /api/v1/admin/recruit/leads/funnel）。
 * 本页为只读看板，路径权限（recruit:read）已由 /admin/recruit 拦截层保护。
 */
export default async function RecruitFunnelPage() {
  // 并行获取员工与活动列表，避免请求瀑布
  const [employees, campaigns] = await Promise.all([
    fetchMockEmployees(),
    fetchMockCampaigns(),
  ]);

  return (
    <div className="min-h-screen bg-fog">
      <div className="w-full max-w-300 mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <FunnelView employees={employees} campaigns={campaigns} />
      </div>
    </div>
  );
}
