import { Suspense } from "react";
import { fetchClient } from "@/lib/api-server";
import { ProjectStats } from "./_components/project-stats";
import { ProjectView } from "./_components/project-view";
import { Project } from "./types";
import { CashFlowSheet } from "./[projectId]/cashflow/_components/cashflow-sheet";
import { MonitorSheet } from "./_components/monitor/monitor-sheet";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    status?: string;
    page?: string;
    community_name?: string;
    cashflow_id?: string;
  }>;
}

interface QueryParams {
  page: number;
  page_size: number;
  status?: string;
  community_name?: string;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

interface ProjectStats {
  signing: number;
  renovating: number;
  selling: number;
  sold: number;
}

export default async function ProjectsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;

  const queryParams: QueryParams = {
    page: page,
    page_size: 20,
  };

  if (params.status && params.status !== "all") {
    queryParams.status = params.status;
  }

  if (params.community_name && params.community_name.trim() !== "") {
    queryParams.community_name = params.community_name.trim();
  }

  const client = await fetchClient();

  const [statsRes, listRes] = await Promise.all([
    client.GET("/api/v1/projects/stats", {}),
    client.GET("/api/v1/projects", {
      params: { query: queryParams },
    }),
  ]);

  const projectData: Project[] = (listRes.data as unknown as PaginatedResponse<Project>)?.items || [];
  const total = (listRes.data as unknown as PaginatedResponse<Project>)?.total || 0;

  const stats = (statsRes.data as unknown as ProjectStats) || {
    signing: 0,
    renovating: 0,
    selling: 0,
    sold: 0,
  };

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-8 py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            项目管理
          </h1>
          <p className="text-sm text-slate-500">
            全生命周期管理您的房源资产，从签约到售出的每一分钱。
          </p>
        </div>

        <ProjectStats stats={stats} />

        <ProjectView data={projectData} total={total} />

        <Suspense fallback={null}>
          <CashFlowSheet />
          <MonitorSheet />
        </Suspense>
      </div>
    </div>
  );
}
