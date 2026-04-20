import { Suspense } from "react";
import { fetchClient } from "@/lib/api-server";
import { MarketingStats } from "./_components/marketing-stats";
import { MarketingView } from "./_components/marketing-view";
import type { L4MarketingProject } from "./types";
import type { operations } from "@/lib/api-types";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

type L4MarketingProjectsQuery =
  operations["list_marketing_projects_api_v1_admin_l4_marketing_projects_get"]["parameters"]["query"] & {
    search?: string;
  };

/** API 错误接口 */
interface ApiError {
  status?: number;
  detail?: string;
  message?: string;
}

/** 类型守卫：检查是否为 ApiError */
function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    ("status" in error || "detail" in error || "message" in error)
  );
}

/** 获取错误状态码 */
function getErrorStatusCode(error: unknown): number | undefined {
  if (!isApiError(error)) return undefined;
  const status = error.status;
  return typeof status === "number" ? status : undefined;
}

function getSearchParam(
  value: string | string[] | undefined,
  fallback = "",
): string {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

// 静态错误状态组件 - 提取到组件外部避免重复创建
function ErrorState({ message, statusCode }: { message: string; statusCode?: number }) {
  return (
    <div className="min-h-screen bg-slate-50/50 flex items-center justify-center">
      <div className="text-center">
        <div className="text-sm font-semibold text-red-600">{message}</div>
        {statusCode ? (
          <div className="mt-2 text-xs text-slate-500">
            状态码: {statusCode}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// 页面头部骨架屏
function HeaderSkeleton() {
  return (
    <div className="flex flex-col gap-1">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-64 mt-2" />
    </div>
  );
}

// 统计数据骨架屏
function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg border border-slate-200 p-4">
          <Skeleton className="h-4 w-16 mb-2" />
          <Skeleton className="h-8 w-12" />
        </div>
      ))}
    </div>
  );
}

// 主内容区域骨架屏
function ContentSkeleton() {
  return (
    <div className="space-y-4">
      {/* Toolbar Skeleton */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row w-full lg:w-auto gap-3 items-center">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-64" />
        </div>
        <div className="flex w-full lg:w-auto gap-3">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-4 border-b border-slate-100 last:border-0">
              <Skeleton className="h-12 w-12 rounded-lg" />
              <div className="flex-1">
                <Skeleton className="h-4 w-48 mb-2" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-8 w-8" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 异步数据获取组件
async function ProjectsDataFetcher({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const page = Number(getSearchParam(searchParams?.page, "1")) || 1;
  const size = Number(getSearchParam(searchParams?.size, "20")) || 20;
  const publishStatus = getSearchParam(searchParams?.publish_status, "");
  const projectStatus = getSearchParam(searchParams?.project_status, "");
  const consultantId = getSearchParam(searchParams?.consultant_id, "");
  const communityId = getSearchParam(searchParams?.community_id, "");

  const client = await fetchClient();
  const { data, error } = await client.GET("/api/v1/admin/l4-marketing/projects", {
    params: {
      query: {
        page,
        page_size: size,
        publish_status: publishStatus || undefined,
        project_status: projectStatus || undefined,
        consultant_id: consultantId || undefined,
        community_id: communityId || undefined,
      } satisfies L4MarketingProjectsQuery,
    },
  });

  if (error || !data) {
    const statusCode = getErrorStatusCode(error);
    const message =
      statusCode === 401 || statusCode === 403
        ? "没有权限访问营销项目列表（请重新登录或联系管理员开通权限）"
        : "获取营销项目列表失败，请稍后重试";
    return <ErrorState message={message} statusCode={statusCode} />;
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
    <>
      <MarketingStats stats={stats} />
      <MarketingView
        data={items}
        total={total}
        currentPage={page}
        pageSize={size}
      />
    </>
  );
}

export default async function MarketingProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-8 py-8 px-4 sm:px-6 lg:px-8">
        {/* Header - 立即渲染 */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            营销项目管理
          </h1>
          <p className="text-sm text-slate-500">
            管理房源营销信息，发布和编辑房源展示内容。
          </p>
        </div>

        {/* Stats and Content - 使用 Suspense 渐进加载 */}
        <Suspense fallback={
          <>
            <StatsSkeleton />
            <ContentSkeleton />
          </>
        }>
          <ProjectsDataFetcher searchParams={params} />
        </Suspense>
      </div>
    </div>
  );
}
