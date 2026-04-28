import { fetchClient } from "@/lib/api-server";
import Link from "next/link";
import { LayoutDashboard, Plus, Filter, SortAsc } from "lucide-react";
import {
  ProjectCard,
  ProjectOverviewCard,
  LeadsFunnelCard,
  AlertCard,
  DashboardLeadsTable,
} from "./_components";
import { MOCK_LEADS } from "./_lib/dashboard-data";
import type { components } from "@/lib/api-types";
import type { Project } from "./types";

type ProjectStatsResponse = components["schemas"]["ProjectStatsResponse"];
type ProjectResponse = components["schemas"]["ProjectResponse"];
type SalesRecordResponse = components["schemas"]["SalesRecordResponse"];
type CompetitorResponse = components["schemas"]["CompetitorResponse"];
type MarketSentimentResponse = components["schemas"]["MarketSentimentResponse"];

async function getDashboardData() {
  const client = await fetchClient();

  const [propertiesRes, projectsStatsRes, pendingLeadsRes, funnelRes, projectsRes] =
    await Promise.all([
      client.GET("/api/v1/properties", {
        params: { query: { page: 1, page_size: 1 } },
      }),
      client.GET("/api/v1/projects/stats", {}),
      client.GET("/api/v1/leads/", {
        params: {
          query: { page: 1, page_size: 5, statuses: ["pending_assessment"] },
        },
      }),
      client.GET("/api/v1/leads/stats/funnel", {}),
      client.GET("/api/v1/projects", {
        params: { query: { page: 1, page_size: 10 } },
      }),
    ]);

  return {
    projectStats: projectsStatsRes.data || {},
    pendingLeadsTotal: pendingLeadsRes.data?.total || 0,
    funnelData: funnelRes.data || { total: 0, evaluating: 0, rejected: 0, visiting: 0, signed: 0 },
    projectsData: projectsRes.data,
  };
}

async function getProjectDetails(projectId: string, communityName: string | null | undefined) {
  const client = await fetchClient();

  const safeCommunityName = communityName ?? null;

  const [salesRecordsRes, marketSentimentRes, competitorsRes] = await Promise.all([
    client.GET("/api/v1/projects/{project_id}/selling/records", {
      params: { path: { project_id: projectId } },
    }),
    safeCommunityName
      ? client.GET("/api/v1/monitor/communities/{community_id}/sentiment", {
          params: { path: { community_id: safeCommunityName } },
        })
      : Promise.resolve({ data: null }),
    safeCommunityName
      ? client.GET("/api/v1/monitor/communities/{community_id}/competitors", {
          params: { path: { community_id: safeCommunityName } },
        })
      : Promise.resolve({ data: null }),
  ]);

  return {
    salesRecords: salesRecordsRes.data?.items || [],
    marketSentiment: marketSentimentRes.data ?? null,
    competitors: competitorsRes.data || [],
  };
}

function calculateWeeklyViewTrend(records: SalesRecordResponse[]) {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const currentWeekCount = records.filter((r) => {
    if (r.record_type !== "viewing") return false;
    const date = new Date(r.record_date);
    return date >= oneWeekAgo;
  }).length;

  const lastWeekCount = records.filter((r) => {
    if (r.record_type !== "viewing") return false;
    const date = new Date(r.record_date);
    return date >= twoWeeksAgo && date < oneWeekAgo;
  }).length;

  return {
    current: currentWeekCount,
    last: lastWeekCount,
    isUp: currentWeekCount >= lastWeekCount,
  };
}

function calculateOfferStats(records: SalesRecordResponse[]) {
  const offers = records.filter((r) => r.record_type === "offer" && r.price);
  const offerCount = offers.length;

  let maxOffer = 0;
  let lastOffer = 0;

  if (offerCount > 0) {
    const prices = offers
      .map((o) => (o.price ? parseFloat(o.price) : 0))
      .filter((p) => p > 0);
    maxOffer = prices.length > 0 ? Math.max(...prices) : 0;

    const sortedByDate = [...offers].sort(
      (a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime()
    );
    lastOffer = sortedByDate[0]?.price ? parseFloat(sortedByDate[0].price) : 0;
  }

  return { offerCount, maxOffer, lastOffer };
}

function calculateMarketData(
  sentiment: MarketSentimentResponse | null,
  competitors: CompetitorResponse[],
  projectArea: string | null | undefined
) {
  const onSale = sentiment?.floor_stats?.reduce((sum, s) => sum + (s.current_count || 0), 0) || 0;

  const totalDealPrice = sentiment?.floor_stats?.reduce(
    (sum, s) => sum + (s.deal_avg_price || 0) * (s.deals_count || 0),
    0
  ) || 0;
  const totalDeals = sentiment?.floor_stats?.reduce((sum, s) => sum + (s.deals_count || 0), 0) || 0;
  const avgPriceNum = totalDeals > 0 ? totalDealPrice / totalDeals : 0;

  let avgPrice = "--";
  if (avgPriceNum > 0) {
    const area = projectArea ? parseFloat(projectArea) : 100;
    avgPrice = `${(avgPriceNum / 10000 / area).toFixed(1)}万/㎡`;
  }

  const volume30d = sentiment?.floor_stats?.reduce((sum, s) => sum + (s.deals_count || 0), 0) || 0;

  let priceTrend30d = "持平";
  let isPriceUp: boolean | null = null;
  if (sentiment?.floor_stats && sentiment.floor_stats.length >= 2) {
    const midStats = sentiment.floor_stats.find((s) => s.type === "mid");
    if (midStats) {
      const trend = midStats.current_avg_price - midStats.deal_avg_price;
      if (Math.abs(trend) > 1000) {
        const percent = ((trend / midStats.deal_avg_price) * 100).toFixed(1);
        isPriceUp = trend > 0;
        priceTrend30d = `${isPriceUp ? "+" : ""}${percent}% ${isPriceUp ? "↑" : "↓"}`;
      }
    }
  }

  return {
    onSale,
    avgPrice,
    volume30d,
    priceTrend30d,
    isPriceUp,
  };
}

async function transformProjectToCardFormat(
  project: ProjectResponse,
  salesRecords: SalesRecordResponse[],
  sentiment: MarketSentimentResponse | null,
  competitors: CompetitorResponse[]
): Promise<Project> {
  const viewTotal = salesRecords.filter((r) => r.record_type === "viewing").length;
  const viewTrend = calculateWeeklyViewTrend(salesRecords);
  const { offerCount, maxOffer, lastOffer } = calculateOfferStats(salesRecords);
  const market = calculateMarketData(sentiment, competitors, project.area);

  return {
    id: project.id,
    code: project.contract_no || project.id.slice(-4).toUpperCase(),
    name: project.name || project.community_name || "未命名项目",
    location: project.address?.split("区")[0] + "区" || "未知区域",
    specs: `${project.area || "--"}㎡ · ${project.layout || "--"}`,
    stats: {
      viewTotal,
      viewTrend,
      offerCount,
      maxOffer,
      lastOffer,
    },
    market,
  };
}

async function getMonitorProjects(projectsData: { items?: ProjectResponse[] } | null): Promise<Project[]> {
  if (!projectsData?.items || projectsData.items.length === 0) {
    return [];
  }

  const projects = projectsData.items.slice(0, 5);

  const projectDetailsPromises = projects.map(async (project) => {
    try {
      const { salesRecords, marketSentiment, competitors } = await getProjectDetails(
        project.id,
        project.community_name
      );
      return transformProjectToCardFormat(project, salesRecords, marketSentiment, competitors);
    } catch (error) {
      console.error(`获取项目 ${project.id} 详情失败:`, error);
      return transformProjectToCardFormat(project, [], null, []);
    }
  });

  return Promise.all(projectDetailsPromises);
}

export default async function DashboardPage() {
  const {
    projectStats,
    pendingLeadsTotal,
    funnelData,
    projectsData,
  } = await getDashboardData();

  const stats = projectStats as ProjectStatsResponse;
  const signingCount = stats?.signing ?? 0;
  const renovatingCount = stats?.renovating ?? 0;
  const sellingCount = stats?.selling ?? 0;
  const soldCount = stats?.sold ?? 0;

  const monitorProjects = await getMonitorProjects(projectsData as { items?: ProjectResponse[] } | null);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-4 md:p-8">
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
          <LayoutDashboard className="w-6 h-6 text-slate-700 dark:text-slate-200" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            工作台
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            欢迎回来，这是您今日的数据概览
          </p>
        </div>
      </div>

      {/* Top Row - Three Column Layout */}
      <div className="grid grid-cols-12 gap-6 mb-8">
        <ProjectOverviewCard
          signingCount={signingCount}
          renovatingCount={renovatingCount}
          sellingCount={sellingCount}
          soldCount={soldCount}
        />
        <LeadsFunnelCard funnelData={funnelData} />
        <AlertCard count={pendingLeadsTotal} />
      </div>

      {/* Monitor Projects Section */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-on-surface dark:text-white">
            重点监控项目 Monitor Projects
          </h3>
          <div className="flex gap-2">
            <button className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-primary transition-colors hover:shadow-sm">
              <Filter className="w-4 h-4" />
            </button>
            <button className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-primary transition-colors hover:shadow-sm">
              <SortAsc className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex gap-6 overflow-x-auto pb-6 pt-2 -mx-4 px-4 custom-scrollbar">
          {monitorProjects.length > 0 ? (
            monitorProjects.map((project) => (
              <div key={project.id} className="w-[320px] shrink-0">
                <ProjectCard project={project} />
              </div>
            ))
          ) : (
            <div className="w-full text-center py-8 text-slate-400">
              暂无在售项目
            </div>
          )}

          <Link
            href="/projects/new"
            className="w-[320px] shrink-0 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center p-8 text-center group cursor-pointer hover:bg-white dark:hover:bg-slate-800 hover:border-primary/40 transition-all min-h-[440px]"
          >
            <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 mb-5 group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
              <Plus className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-bold text-slate-500 group-hover:text-primary dark:text-slate-400 dark:group-hover:text-primary">
              添加新项目
            </h4>
            <p className="text-xs text-slate-400 mt-2 max-w-[140px]">
              快速录入房源或新建开发项目
            </p>
          </Link>
        </div>
      </section>

      {/* Leads Table Section */}
      <DashboardLeadsTable leads={MOCK_LEADS} />
    </div>
  );
}
