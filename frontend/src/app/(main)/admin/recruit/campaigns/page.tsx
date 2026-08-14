import { format, subDays } from "date-fns";
import { getRecruitCampaigns, getRecruitEmployees, getRecruitFunnel } from "../_lib/recruit-data";
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
 * 活动配置页（招募管理）。
 * Server Component：并行获取活动列表与漏斗统计（近 30 天 / 上 30 天），
 * 供页面头部 KPI 概览使用；列表增删改由客户端 CampaignsView 调用 Server Actions。
 */
export default async function RecruitCampaignsPage() {
  const today = new Date();
  // 消除请求瀑布：活动列表 + 当前/上一周期漏斗统计并行获取
  const [campaigns, cur, prev, employees] = await Promise.all([
    getRecruitCampaigns(),
    getRecruitFunnel({
      start_date: toDateStr(subDays(today, 29)),
      end_date: toDateStr(today),
    }),
    getRecruitFunnel({
      start_date: toDateStr(subDays(today, 59)),
      end_date: toDateStr(subDays(today, 30)),
    }),
    getRecruitEmployees(),
  ]);

  const curShared = cur?.share_count ?? 0;
  const curAuthed = cur?.authed ?? 0;
  const curValid = cur?.valid_leads ?? 0;
  const prevShared = prev?.share_count ?? 0;
  const prevAuthed = prev?.authed ?? 0;

  const conversion = curShared > 0 ? (curValid / curShared) * 100 : 0;
  const prevConversion =
    prevShared > 0 ? ((prev?.valid_leads ?? 0) / prevShared) * 100 : 0;

  const stats: CampaignStats = {
    shared: curShared,
    authed: curAuthed,
    conversion,
    sharedTrend: trendText(curShared, prevShared),
    authedTrend: trendText(curAuthed, prevAuthed),
    conversionTrend: trendText(conversion, prevConversion),
  };

  return (
    <div className="min-h-screen bg-fog">
      <div className="w-full max-w-300 mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <CampaignsView campaigns={campaigns} stats={stats} employees={employees} />
      </div>
    </div>
  );
}
