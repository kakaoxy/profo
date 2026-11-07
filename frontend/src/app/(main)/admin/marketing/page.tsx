import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { fetchClient, isTransientNetworkError } from "@/lib/api-server";
import { isRedirectError } from "@/lib/auth/server/session";
import { PageContainer } from "@/app/(main)/admin/_components";
import { MarketingStats } from "./_components/marketing-stats";
import { MarketingView } from "./_components/marketing-view";
import { MarketingPageActions } from "./_components/marketing-page-actions";
import type { operations } from "@/lib/api-types";
import { Skeleton } from "@/components/ui/skeleton";

type L4MarketingProjectsQuery =
  operations["list_marketing_projects_api_v1_admin_marketing_projects_get"]["parameters"]["query"] & {
    search?: string;
  };

interface ApiError {
  status?: number;
  message?: string;
}

function isApiError(error: unknown): error is ApiError {
  return typeof error === "object" && error !== null && ("status" in error || "message" in error);
}

function getErrorStatusCode(error: unknown): number | undefined {
  if (!isApiError(error)) return undefined;
  const status = error.status;
  return typeof status === "number" ? status : undefined;
}

function getSearchParam(value: string | string[] | undefined, fallback = ""): string {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function ErrorState({ message, statusCode }: { message: string; statusCode?: number }) {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-cards bg-white shadow-steep-sm">
      <div className="text-center">
        <div className="text-sm font-semibold text-error">{message}</div>
        {statusCode ? <div className="mt-2 text-xs text-graphite">状态码: {statusCode}</div> : null}
      </div>
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="overflow-hidden rounded-cards bg-white shadow-steep-sm">
      <div className="grid gap-6 p-6 lg:grid-cols-[minmax(250px,0.9fr)_minmax(0,2.2fr)] lg:gap-0">
        <div className="border-b border-dove/30 pb-5 lg:border-r lg:border-b-0 lg:pr-8">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-16 w-32" />
          <Skeleton className="mt-4 h-4 w-56" />
        </div>
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4 lg:pl-8">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index}>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-4 h-11 w-20" />
              <Skeleton className="mt-3 h-3 w-24" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-4 border-t border-dove/30 bg-fog/60 px-6 py-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="ml-auto h-3 w-72" />
      </div>
    </div>
  );
}

function ContentSkeleton() {
  return (
    <div className="overflow-hidden rounded-cards bg-white shadow-steep-sm">
      <div className="flex flex-col gap-4 px-6 pt-6 lg:flex-row lg:items-center lg:justify-between">
        <Skeleton className="h-11 w-full max-w-[360px]" />
        <Skeleton className="h-10 w-20" />
      </div>
      <div className="mt-5 flex flex-col gap-3 border-t border-dove/30 px-6 pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-10 w-80" />
          <div className="ml-auto flex gap-2">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
      </div>
      <div className="mt-4 border-y border-dove/30 bg-fog/60 px-6 py-3">
        <Skeleton className="h-3 w-full" />
      </div>
      <div className="divide-y divide-dove/20">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 px-6 py-4">
            <Skeleton className="h-14 w-[72px] rounded-images" />
            <div className="flex-1">
              <Skeleton className="h-4 w-52" />
              <Skeleton className="mt-2 h-3 w-32" />
            </div>
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-dove/30 px-6 py-4">
        <Skeleton className="h-3 w-44" />
        <Skeleton className="h-8 w-64" />
      </div>
    </div>
  );
}

function MarketingPageHeader() {
  return (
    <header className="flex flex-col gap-5 pt-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-1.5 text-[11px] text-graphite">
          <span>营销中心</span>
          <ChevronRight className="h-3 w-3 text-dove" />
          <span className="text-ash">营销项目</span>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <span className="h-px w-7 bg-rust" />
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-graphite">
            Listing desk <span className="text-dove">/</span> 房源营销台
          </span>
        </div>
        <h1 className="page-title mt-3 text-[44px] text-ink">房源营销</h1>
        <p className="mt-2 max-w-[620px] text-[15px] leading-relaxed text-graphite">
          把房源资料、发布状态与价格变化放在同一张桌上管理。找到需要处理的房源，再进入档案完成编辑。
        </p>
      </div>
      <MarketingPageActions />
    </header>
  );
}

async function fetchMarketingProjects(searchParams: {
  [key: string]: string | string[] | undefined;
}) {
  const page = Number(getSearchParam(searchParams?.page, "1")) || 1;
  const size = Number(getSearchParam(searchParams?.size, "20")) || 20;
  const publishStatus = getSearchParam(searchParams?.publish_status, "") || undefined;
  const projectStatus = getSearchParam(searchParams?.project_status, "") || undefined;
  const consultantId = getSearchParam(searchParams?.consultant_id, "") || undefined;
  const communityId = getSearchParam(searchParams?.community_id, "") || undefined;
  const badgeFilter = getSearchParam(searchParams?.badge_filter, "");
  const isNewListing = badgeFilter === "new" ? true : undefined;
  const hasPriceChange = badgeFilter === "price" ? true : undefined;

  const client = await fetchClient();
  return client.GET("/api/v1/admin/marketing/projects", {
    params: {
      query: {
        page,
        page_size: size,
        publish_status: publishStatus as L4MarketingProjectsQuery["publish_status"],
        project_status: projectStatus as L4MarketingProjectsQuery["project_status"],
        consultant_id: consultantId,
        community_id: communityId,
        is_new_listing: isNewListing,
        has_price_change: hasPriceChange,
      } satisfies L4MarketingProjectsQuery,
    },
  });
}

async function ProjectsDataFetcher({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  let result: Awaited<ReturnType<typeof fetchMarketingProjects>>;
  try {
    result = await fetchMarketingProjects(searchParams);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (!isTransientNetworkError(error)) throw error;
    return <ErrorState message="获取营销项目列表失败，请稍后重试" />;
  }

  const { data, error } = result;

  if (error || !data) {
    const statusCode = getErrorStatusCode(error);
    const message =
      statusCode === 401 || statusCode === 403
        ? "没有权限访问营销项目列表（请重新登录或联系管理员开通权限）"
        : "获取营销项目列表失败，请稍后重试";
    return <ErrorState message={message} statusCode={statusCode} />;
  }

  const items = data.items || [];
  const total = data.total || 0;
  const summary = data.summary;

  const stats = {
    total: summary?.total ?? total,
    published: summary?.published ?? 0,
    draft: summary?.draft ?? 0,
    for_sale: summary?.for_sale ?? 0,
    sold: summary?.sold ?? 0,
    in_progress: summary?.in_progress ?? 0,
    total_views: summary?.total_views ?? 0,
  };

  return (
    <>
      <MarketingStats stats={stats} />
      <MarketingView data={items} total={total} summary={stats} />
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
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <MarketingPageHeader />
        <Suspense
          fallback={
            <>
              <StatsSkeleton />
              <ContentSkeleton />
            </>
          }
        >
          <ProjectsDataFetcher searchParams={params} />
        </Suspense>
      </PageContainer>
    </div>
  );
}
