import { fetchClient } from "@/lib/api-server";
import { ProjectStats } from "./_components/project-stats";
import { ProjectView } from "./_components/project-view";
import { Project } from "./types";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    status?: string;
    page?: string;
    community_name?: string;
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
  items: Project[];     // 当前命中的字段
  list?: Project[];     // 备用字段 (防止后端改回去)
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
    // [修复 1] 删除了 @ts-expect-error
    // 因为有了 QueryParams 接口，TS 现在认为这个调用是合法的
    client.GET("/api/v1/projects", {
      params: { query: queryParams },
    }),
  ]);

  // 2. 类型安全的提取逻辑
  const response = listRes.data as unknown as BaseResponse;
  
  // [修复 2] 移除了 as any
  // 因为我们在 ApiResponseData 接口里定义了可选的 list?，所以这里直接访问是安全的
  const projectData: Project[] = 
    response?.data?.items || 
    response?.data?.list || 
    [];
    
  const total = response?.data?.total || 0;

  // 3. 统计数据提取
  const statsResponse = statsRes.data as unknown as { data: Record<string, number> };
  const stats = statsResponse?.data || { signing: 0, renovating: 0, selling: 0, sold: 0 };

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-8 py-8 px-4 sm:px-6 lg:px-8">
        
        {/* 标题区：增加间距 */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">项目管理</h1>
          <p className="text-sm text-slate-500">
            全生命周期管理您的房源资产，从签约到售出的每一分钱。
          </p>
        </div>

        <ProjectStats stats={stats} />
        
        {/* ProjectView 内部自带了白色容器，放在灰色背景上会很好看 */}
        <ProjectView data={projectData} total={total} />
      </div>
    </div>
  );
}