import { fetchClient } from "@/lib/api-server";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { columns } from "./columns";
import { SyncButton } from "./sync-button";
import { ProjectFilters } from "./project-filters";
import type { MiniProject } from "./types";
import Link from "next/link";
import type { operations } from "@/lib/api-types";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { MiniproPageHeader, MiniproShell } from "../_components/minipro-shell";

export const dynamic = "force-dynamic";

type MiniProjectsQuery =
  operations["list_projects_api_v1_admin_mini_projects_get"]["parameters"]["query"] & {
    search?: string;
  };

function getSearchParam(
  value: string | string[] | undefined,
  fallback = "",
): string {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const page = Number(getSearchParam(params?.page, "1")) || 1;
  const pageSize = Number(getSearchParam(params?.page_size, "20")) || 20;
  const query = getSearchParam(params?.query, "");
  const status = getSearchParam(params?.status, "all");

  const client = await fetchClient();
  const { data, error } = await client.GET("/api/v1/admin/mini/projects", {
    params: {
      query: {
        page,
        page_size: pageSize,
        is_published:
          status === "published"
            ? true
            : status === "draft"
              ? false
              : undefined,
        search: query || undefined,
      } satisfies MiniProjectsQuery,
    },
  });

  if (error || !data) {
    const statusCode =
      typeof error === "object" && error && "status" in error
        ? Number((error as { status?: unknown }).status)
        : undefined;
    const message =
      statusCode === 401 || statusCode === 403
        ? "没有权限访问小程序项目列表（请重新登录或联系管理员开通权限）"
        : "获取小程序项目列表失败，请稍后重试";
    return (
      <div className="p-8 text-center text-red-500">
        <div className="text-sm font-semibold">{message}</div>
        {statusCode ? (
          <div className="mt-2 text-xs text-slate-500">
            状态码: {statusCode}
          </div>
        ) : null}
      </div>
    );
  }

  const items: MiniProject[] = data.items || [];
  const total = data.total || 0;
  const hasNextPage = total > page * pageSize;

  const buildHref = (nextPage: number) => {
    const nextParams = new URLSearchParams();
    nextParams.set("page", String(nextPage));
    nextParams.set("page_size", String(pageSize));
    if (query) nextParams.set("query", query);
    if (status && status !== "all") nextParams.set("status", status);
    return `/minipro/projects?${nextParams.toString()}`;
  };

  return (
    <MiniproShell>
      <MiniproPageHeader
        title="小程序内容管理"
        description="管理小程序端的项目内容、发布状态与排序。"
        actions={
          <>
            <SyncButton />
            <Button type="button" disabled>
              <Plus />
              新建独立项目
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <ProjectFilters initialQuery={query} initialStatus={status} />
      </div>

      <div className="rounded-md border bg-background">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              项目列表
            </h2>
            <p className="text-xs text-muted-foreground">共 {total} 项</p>
          </div>
          <div className="text-xs text-muted-foreground">
            显示第 {(page - 1) * pageSize + 1} 至{" "}
            {Math.min(page * pageSize, total)} 项
          </div>
        </div>

        <DataTable columns={columns} data={items} container={false} />

        <div className="px-4 py-3 border-t flex items-center justify-end gap-2">
          {page <= 1 ? (
            <Button variant="outline" size="icon-sm" disabled>
              <ChevronLeft />
            </Button>
          ) : (
            <Button variant="outline" size="icon-sm" asChild>
              <Link href={buildHref(page - 1)} aria-label="上一页">
                <ChevronLeft />
              </Link>
            </Button>
          )}
          <Button variant="outline" size="sm" disabled>
            {page}
          </Button>
          {hasNextPage ? (
            <Button variant="outline" size="icon-sm" asChild>
              <Link href={buildHref(page + 1)} aria-label="下一页">
                <ChevronRight />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="icon-sm" disabled>
              <ChevronRight />
            </Button>
          )}
        </div>
      </div>
    </MiniproShell>
  );
}
