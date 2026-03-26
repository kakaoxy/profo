import { fetchClient } from "@/lib/api-server";
import { MarketingStats } from "./_components/marketing-stats";
import { MarketingView } from "./_components/marketing-view";
import type { L4MarketingProject } from "./types";
import type { operations } from "@/lib/api-types";

export const dynamic = "force-dynamic";

type L4MarketingProjectsQuery =
  operations["list_marketing_projects_api_v1_admin_l4_marketing_projects_get"]["parameters"]["query"] & {
    search?: string;
  };

function getSearchParam(
  value: string | string[] | undefined,
  fallback = "",
): string {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

export default async function MarketingProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const page = Number(getSearchParam(params?.page, "1")) || 1;
  const size = Number(getSearchParam(params?.size, "20")) || 20;
  const publishStatus = getSearchParam(params?.publish_status, "");
  const projectStatus = getSearchParam(params?.project_status, "");

  const client = await fetchClient();
  const { data, error } = await client.GET("/api/v1/admin/l4-marketing/projects", {
    params: {
      query: {
        page,
        size,
        publish_status: publishStatus || undefined,
        project_status: projectStatus || undefined,
      } satisfies L4MarketingProjectsQuery,
    },
  });

  if (error || !data) {
    const statusCode =
      typeof error === "object" && error && "status" in error
        ? Number((error as { status?: unknown }).status)
        : undefined;
    const message =
      statusCode === 401 || statusCode === 403
        ? "没有权限访问营销项目列表（请重新登录或联系管理员开通权限）"
        : "获取营销项目列表失败，请稍后重试";
    return (
      <div className="min-h-screen bg-[#f8f9ff] flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm font-semibold text-[#ba1a1a]">{message}</div>
          {statusCode ? (
            <div className="mt-2 text-xs text-[#707785]">
              状态码: {statusCode}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const items: L4MarketingProject[] = data.items || [];
  const total = data.total || 0;

  // 计算统计数据
  const stats = {
    total: total,
    published: items.filter((p) => p.publish_status === "发布").length,
    draft: items.filter((p) => p.publish_status === "草稿").length,
    for_sale: items.filter((p) => p.project_status === "在售").length,
    sold: items.filter((p) => p.project_status === "已售").length,
    in_progress: items.filter((p) => p.project_status === "在途").length,
  };

  return (
    <div className="min-h-screen bg-[#f8f9ff]">
      <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-8 py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-[#707785] font-bold block mb-1">
              Estate Logic Inventory
            </span>
            <h1 className="text-3xl font-extrabold text-[#0b1c30] leading-tight">
              房源列表 <span className="text-[#005daa] font-normal text-lg ml-2">/ Property Portfolio</span>
            </h1>
          </div>
          <div className="flex gap-3">
            <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-[#c0c7d6]/50 text-[#0b1c30] font-medium hover:bg-[#e5eeff] transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
              <span>批量导出</span>
            </button>
            <a
              href="/minipro/projects/new"
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#005daa] text-white font-semibold shadow-lg shadow-[#005daa]/20 hover:opacity-95 transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="16"/><line x1="8" x2="16" y1="12" y2="12"/></svg>
              <span>新增房源</span>
            </a>
          </div>
        </div>

        {/* Stats */}
        <MarketingStats stats={stats} />

        {/* Main Content */}
        <MarketingView data={items} total={total} />
      </div>
    </div>
  );
}
