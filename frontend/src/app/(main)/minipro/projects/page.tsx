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
      <div className="min-h-screen bg-slate-50/50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm font-semibold text-red-500">{message}</div>
          {statusCode ? (
            <div className="mt-2 text-xs text-slate-500">
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
    <div className="min-h-screen bg-slate-50/50">
      <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-8 py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            营销内容管理
          </h1>
          <p className="text-sm text-slate-500">
            管理L4营销层的项目内容、发布状态与排序，打造专业的房源展示。
          </p>
        </div>

        {/* Stats */}
        <MarketingStats stats={stats} />

        {/* Main Content */}
        <MarketingView data={items} total={total} />
      </div>
    </div>
  );
}
