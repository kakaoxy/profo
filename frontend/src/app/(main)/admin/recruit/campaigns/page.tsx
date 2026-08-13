import { format, subDays } from "date-fns";
import { fetchMockCampaigns, fetchMockFunnel } from "../_lib/mock-recruit";
import { CampaignsView, type CampaignStats } from "./_components/campaigns-view";

/** 将 Date 格式化为 YYYY-MM-DD */
function toDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** 环比趋势文本：无基线时返回 null（展示描述性文案） */
function trendText(cur: number, prev: number): { text: string; tone: "up" | "down" } | null {
  if (!prev) return null;
  const pct = ((cur - prev) / prev) * 100;
  return {
    text: `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}% 较上周`,
    tone: pct >= 0 ? "up" : "down",
  };
}

/**
 * 活动配置页（招募管理 · 第一期）。
 * Server Component：并行获取活动列表与漏斗统计（近 30 天 / 上 30 天），
 * 供页面头部 KPI 概览使用；列表增删改查由客户端 CampaignsView 本地模拟。
 * 二期替换为真实接口：GET /api/v1/admin/recruit/campaigns
 */
export default async function RecruitCampaignsPage() {
  const today = new Date();
  // 消除请求瀑布：活动列表 + 当前/上一周期漏斗统计并行获取
  const [campaigns, cur, prev] = await Promise.all([
    fetchMockCampaigns(),
    fetchMockFunnel({
      start_date: toDateStr(subDays(today, 29)),
      end_date: toDateStr(today),
      campaign_id: null,
      employee_id: null,
    }),
    fetchMockFunnel({
      start_date: toDateStr(subDays(today, 59)),
      end_date: toDateStr(subDays(today, 30)),
      campaign_id: null,
      employee_id: null,
    }),
  ]);

  const conversion = cur.shared > 0 ? (cur.valid_new / cur.shared) * 100 : 0;
  const prevConversion =
    prev.shared > 0 ? (prev.valid_new / prev.shared) * 100 : 0;

  const stats: CampaignStats = {
    shared: cur.shared,
    authed: cur.authed,
    conversion,
    sharedTrend: trendText(cur.shared, prev.shared),
    authedTrend: trendText(cur.authed, prev.authed),
    conversionTrend: trendText(conversion, prevConversion),
  };

  return (
    <div className="min-h-screen bg-fog">
      <div className="w-full max-w-300 mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <CampaignsView initialCampaigns={campaigns} stats={stats} />
      </div>
    </div>
  );
}
