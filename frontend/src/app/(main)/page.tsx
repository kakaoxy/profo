import { fetchClient } from "@/lib/api-server";
import { LayoutDashboard, Plus, Filter, SortAsc } from "lucide-react";
import {
  ProjectCard,
  ProjectOverviewCard,
  LeadsFunnelCard,
  AlertCard,
  DashboardLeadsTable,
} from "./_components";
import { CreateProjectDialog } from "./projects/_components/create-project";
import type { components } from "@/lib/api-types";
import type { FunnelData, DashboardLead } from "./types";

type ProjectStatsResponse = components["schemas"]["ProjectStatsResponse"];
type ProjectResponse = components["schemas"]["ProjectResponse"];
type LeadListItem = components["schemas"]["LeadListItem"];
type LeadStatus = components["schemas"]["LeadStatus"];

/**
 * 将 LeadStatus 转换为中文显示文本
 */
function getStatusText(status: LeadStatus): string {
  const statusMap: Record<string, string> = {
    pending_assessment: "待评估",
    pending_visit: "待看房",
    rejected: "已驳回",
    visited: "已看房",
    signed: "已签约",
  };
  return statusMap[status] || status;
}

/**
 * 将 API 返回的 LeadListItem 转换为 DashboardLead 格式
 */
function transformLeadToDashboard(lead: LeadListItem): DashboardLead {
  return {
    id: lead.id,
    community: lead.community_name,
    unitType: lead.layout || "-",
    area: lead.area ? `${lead.area}㎡` : "-",
    floor: lead.floor_info || "-",
    totalPrice: lead.total_price ? `${lead.total_price}万` : "-",
    unitPrice: lead.unit_price ? `${lead.unit_price}万/㎡` : "-",
    status: getStatusText(lead.status),
    region: lead.district || lead.business_area || "-",
    creator: lead.creator_name || "-",
    updatedTime: lead.updated_at
      ? new Date(lead.updated_at).toLocaleString("zh-CN", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "-",
  };
}

async function getDashboardData() {
  const client = await fetchClient();

  const [projectsStatsRes, pendingLeadsRes, funnelRes, projectsRes, leadsRes] =
    await Promise.all([
      client.GET("/api/v1/projects/stats", {}),
      client.GET("/api/v1/leads/", {
        params: {
          query: { page: 1, page_size: 5, statuses: ["pending_assessment"] },
        },
      }),
      client.GET("/api/v1/leads/stats/funnel", {}),
      client.GET("/api/v1/projects", {
        params: {
          query: { page: 1, page_size: 10 },
        },
      }),
      client.GET("/api/v1/leads/", {
        params: {
          query: { page: 1, page_size: 10 },
        },
      }),
    ]);

  const funnelData: FunnelData = funnelRes.data
    ? (funnelRes.data as FunnelData)
    : { total: 0, evaluating: 0, rejected: 0, visiting: 0, signed: 0 };

  const leads = (leadsRes.data?.items || []) as LeadListItem[];
  const dashboardLeads = leads.map(transformLeadToDashboard);

  return {
    projectStats: projectsStatsRes.data || {},
    pendingLeadsTotal: pendingLeadsRes.data?.total || 0,
    funnelData,
    projects: (projectsRes.data?.items || []) as ProjectResponse[],
    leads: dashboardLeads,
  };
}

export default async function DashboardPage() {
  const {
    projectStats,
    pendingLeadsTotal,
    funnelData,
    projects,
    leads,
  } = await getDashboardData();

  const stats = projectStats as ProjectStatsResponse;
  const signingCount = stats?.signing ?? 0;
  const renovatingCount = stats?.renovating ?? 0;
  const sellingCount = stats?.selling ?? 0;
  const soldCount = stats?.sold ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-4 md:p-8 min-w-0 overflow-x-hidden">
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
      <div className="grid grid-cols-12 gap-4 lg:gap-6 mb-8 min-w-0">
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

        <div className="flex gap-4 overflow-x-auto pb-4 pt-2 custom-scrollbar">
          {projects.map((project) => (
            <div key={project.id} className="w-[280px] shrink-0">
              <ProjectCard project={project} />
            </div>
          ))}

          <CreateProjectDialog
            trigger={
              <div className="w-[280px] shrink-0 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center p-6 text-center group cursor-pointer hover:bg-white dark:hover:bg-slate-800 hover:border-primary/40 transition-all min-h-[400px]">
                <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 mb-5 group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
                  <Plus className="w-8 h-8" />
                </div>
                <h4 className="text-lg font-bold text-slate-500 group-hover:text-primary dark:text-slate-400 dark:group-hover:text-primary">
                  添加新项目
                </h4>
                <p className="text-xs text-slate-400 mt-2 max-w-[140px]">
                  快速录入房源或新建开发项目
                </p>
              </div>
            }
          />
        </div>
      </section>

      {/* Leads Table Section */}
      <DashboardLeadsTable leads={leads} />
    </div>
  );
}
