import { fetchClient } from "@/lib/api-server";
import { DataTable } from "@/components/ui/data-table";
import { columns } from "./columns";
import { SyncButton } from "./sync-button";
import { ProjectFilters } from "./project-filters";
import type { MiniProject } from "./types";
import Link from "next/link";
import type { operations } from "@/lib/api-types";

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

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#f8f9fa]">
      <header className="px-8 py-6 bg-white border-b border-gray-100">
        <div className="flex items-center gap-4 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">小程序内容管理</h1>
        </div>
        <p className="text-sm text-gray-500 ml-0">这是所有小程序项目列表</p>
      </header>

      <main className="p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <ProjectFilters initialQuery={query} initialStatus={status} />

          <div className="flex items-center gap-3">
            <SyncButton />
            <button className="flex items-center gap-2 px-6 py-2.5 bg-[#137fec] text-white font-semibold text-sm rounded-xl shadow-[0_2px_12px_0_rgba(0,0,0,0.05)] hover:bg-blue-600 transition-colors">
              <span className="material-symbols-outlined text-lg">add</span>
              新建独立项目
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-[0_2px_12px_0_rgba(0,0,0,0.05)] border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 bg-red-500 rounded-full"></div>
              <h2 className="text-base font-bold text-gray-900">项目列表</h2>
            </div>
            <Link
              href="#"
              className="text-sm text-gray-400 flex items-center gap-1 hover:text-[#137fec] transition-colors"
            >
              查看全部
            </Link>
          </div>

          <div className="overflow-x-auto">
            <DataTable columns={columns} data={items} />
          </div>

          <div className="px-6 py-4 border-t border-gray-50 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              显示第 {(page - 1) * pageSize + 1} 至{" "}
              {Math.min(page * pageSize, total)} 项，共 {total} 项
            </p>
            <div className="flex items-center gap-2">
              <Link
                href={`/minipro/projects?page=${Math.max(1, page - 1)}`}
                className={`p-1.5 rounded-lg border border-gray-100 text-gray-400 hover:bg-gray-50 transition-colors ${page <= 1 ? "pointer-events-none opacity-50" : ""}`}
              ></Link>
              <button className="px-3 py-1 bg-[#137fec] text-white text-xs font-bold rounded-lg">
                {page}
              </button>
              {total > page * pageSize && (
                <Link
                  href={`/minipro/projects?page=${page + 1}`}
                  className="px-3 py-1 text-gray-500 text-xs font-bold hover:bg-gray-50 rounded-lg transition-colors"
                >
                  {page + 1}
                </Link>
              )}
              <Link
                href={`/minipro/projects?page=${page + 1}`}
                className={`p-1.5 rounded-lg border border-gray-100 text-gray-400 hover:bg-gray-50 transition-colors ${total <= page * pageSize ? "pointer-events-none opacity-50" : ""}`}
              ></Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
