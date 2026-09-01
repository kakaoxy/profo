import {
  getGrowthCampaigns,
  getGrowthCampaignStats,
  getGrowthEmployees,
} from "../_lib/campaign-data";
import { CampaignsView } from "./_components/campaigns-view";

/**
 * 获客中心 · 活动配置页（对齐设计稿 Screen 4）。
 * 一期仅招募 Tab 可交互完整呈现，活动写路径沿用现有招募活动后端契约。
 */
export default async function GrowthCampaignsPage() {
  // 消除请求瀑布：活动列表 + KPI 统计 + 员工下拉并行获取
  const [campaigns, stats, employees] = await Promise.all([
    getGrowthCampaigns(),
    getGrowthCampaignStats(),
    getGrowthEmployees(),
  ]);

  return (
    <div className="min-h-screen bg-fog">
      <div className="w-full max-w-300 mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <CampaignsView campaigns={campaigns} stats={stats} employees={employees} />
      </div>
    </div>
  );
}
