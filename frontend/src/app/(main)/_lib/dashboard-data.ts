import { fetchClient } from "@/lib/api-server";
import type { components } from "@/lib/api-types";
import type { FunnelData, RawDashboardLead } from "../types";
import { getStatusLabel } from "../leads/constants/status-config";

type ProjectStatsResponse = components["schemas"]["ProjectStatsResponse"];
type ProjectResponse = components["schemas"]["ProjectResponse"];
type LeadListItem = components["schemas"]["LeadListItem"];
type LeadStatus = components["schemas"]["LeadStatus"];

export interface DashboardDataResult {
  projectStats: ProjectStatsResponse | null;
  pendingLeadsTotal: number;
  funnelData: FunnelData;
  projects: ProjectResponse[];
  leads: RawDashboardLead[];
  errors: {
    projectStats?: string;
    pendingLeads?: string;
    funnel?: string;
    projects?: string;
    leads?: string;
  };
}

const defaultFunnelData: FunnelData = {
  total: 0,
  evaluating: 0,
  rejected: 0,
  visiting: 0,
  signed: 0,
};

function isValidFunnelData(data: unknown): data is FunnelData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.total === "number" &&
    typeof d.evaluating === "number" &&
    typeof d.rejected === "number" &&
    typeof d.visiting === "number" &&
    typeof d.signed === "number"
  );
}

function validateFunnelData(data: unknown): FunnelData {
  if (isValidFunnelData(data)) {
    return data;
  }
  return defaultFunnelData;
}

function validateLeadListItems(data: unknown): LeadListItem[] {
  if (!data || !Array.isArray(data)) return [];
  return data.filter((item): item is LeadListItem => {
    if (!item || typeof item !== "object") return false;
    return typeof item.id === "string";
  });
}

function validateProjectResponseList(data: unknown): ProjectResponse[] {
  if (!data || !Array.isArray(data)) return [];
  return data.filter((item): item is ProjectResponse => {
    if (!item || typeof item !== "object") return false;
    return typeof item.id === "string";
  });
}

export function getStatusText(status: LeadStatus): string {
  return getStatusLabel(status);
}

export function transformLeadToDashboard(lead: LeadListItem): RawDashboardLead {
  return {
    id: lead.id,
    community: lead.community_name,
    unitType: lead.layout || "-",
    area: lead.area ?? null,
    floor: lead.floor_info || "-",
    totalPrice: lead.total_price ?? null,
    unitPrice: lead.unit_price ?? null,
    status: lead.status,
    region: lead.district || lead.business_area || "-",
    creator: lead.creator_name || "-",
    updatedAt: lead.updated_at,
  };
}

export async function getDashboardData(): Promise<DashboardDataResult> {
  const client = await fetchClient();

  const results = await Promise.allSettled([
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

  const errors: DashboardDataResult["errors"] = {};

  const [projectStatsRes, pendingLeadsRes, funnelRes, projectsRes, leadsRes] = results;

  const projectStats =
    projectStatsRes.status === "fulfilled" && projectStatsRes.value.data
      ? (projectStatsRes.value.data as ProjectStatsResponse)
      : null;
  if (projectStatsRes.status === "rejected") {
    errors.projectStats = "获取项目统计失败";
    console.error("[Dashboard] 项目统计获取失败:", projectStatsRes.reason);
  }

  const pendingLeadsTotal =
    pendingLeadsRes.status === "fulfilled" && pendingLeadsRes.value.data
      ? pendingLeadsRes.value.data.total || 0
      : 0;
  if (pendingLeadsRes.status === "rejected") {
    errors.pendingLeads = "获取待处理线索失败";
    console.error("[Dashboard] 待处理线索获取失败:", pendingLeadsRes.reason);
  }

  const funnelData =
    funnelRes.status === "fulfilled"
      ? validateFunnelData(funnelRes.value.data)
      : defaultFunnelData;
  if (funnelRes.status === "rejected") {
    errors.funnel = "获取线索漏斗失败";
    console.error("[Dashboard] 线索漏斗获取失败:", funnelRes.reason);
  }

  const projects =
    projectsRes.status === "fulfilled" && projectsRes.value.data
      ? validateProjectResponseList(projectsRes.value.data.items)
      : [];
  if (projectsRes.status === "rejected") {
    errors.projects = "获取项目列表失败";
    console.error("[Dashboard] 项目列表获取失败:", projectsRes.reason);
  }

  const leadItems =
    leadsRes.status === "fulfilled" && leadsRes.value.data
      ? validateLeadListItems(leadsRes.value.data.items)
      : [];
  if (leadsRes.status === "rejected") {
    errors.leads = "获取线索列表失败";
    console.error("[Dashboard] 线索列表获取失败:", leadsRes.reason);
  }

  const rawLeads = leadItems.map(transformLeadToDashboard);

  return {
    projectStats,
    pendingLeadsTotal,
    funnelData,
    projects,
    leads: rawLeads,
    errors,
  };
}
