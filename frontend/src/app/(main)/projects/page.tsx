import { Suspense } from "react";
import { fetchClient } from "@/lib/api-server";
import { ProjectStats } from "./_components/project-stats";
import { ProjectView } from "./_components/project-view";
import { Project } from "./types";
// [新增] 引入资金账本抽屉组件
// 注意：路径根据之前的文件夹结构，指向 [projectId]/cashflow/_components/cashflow-sheet
import { CashFlowSheet } from "./[projectId]/cashflow/_components/cashflow-sheet";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    status?: string;
    page?: string;
    community_name?: string;
    // [新增] 虽然这里不需要显式处理 cashflow_id (由客户端组件处理)，但为了类型完整可以加上
    cashflow_id?: string;
  }>;
}

interface QueryParams {
  page: number;
  page_size: number;
  status?: string;
  community_name?: string;
}

// 1. 完善接口定义，包含 items 和 list (兼容不同后端结构)
interface ApiResponseData {
  items: Project[]; // 当前命中的字段
  list?: Project[]; // 备用字段 (防止后端改回去)
  total: number;
  page: number;
  page_size: number;
}

interface BaseResponse {
  code: number;
  msg: string;
  data: ApiResponseData;
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
    client.GET("/api/v1/projects/stats"),
    client.GET("/api/v1/projects", {
      params: { query: queryParams },
    }),
  ]);

  // 2. 类型安全的提取逻辑
  const response = listRes.data as unknown as BaseResponse;

  // 兼容性提取
  const projectData: Project[] =
    response?.data?.items || response?.data?.list || [];

  const total = response?.data?.total || 0;

  // 3. 统计数据提取
  const statsResponse = statsRes.data as unknown as {
    data: Record<string, number>;
  };
  const stats = statsResponse?.data || {
    signing: 0,
    renovating: 0,
    selling: 0,
    sold: 0,
  };

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-8 py-8 px-4 sm:px-6 lg:px-8">
        {/* 标题区 */}
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

        {/* [新增] 挂载资金账本抽屉 */}
        {/* 使用 Suspense 包裹，因为 CashFlowSheet 内部使用了 useSearchParams */}
        <Suspense fallback={null}>
          <CashFlowSheet />
        </Suspense>
      </div>
    </div>
  );
}
