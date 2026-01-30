import { fetchClient } from "@/lib/api-server";
import { extractPaginatedData } from "@/lib/api-helpers";
import type { components } from "@/lib/api-types";
import { GovernanceView } from "./governance-view";

// 强制动态渲染，确保每次进来数据都是新的
export const dynamic = "force-dynamic";

interface GovernancePageProps {
  searchParams: Promise<{
    page?: string;
    search?: string;
  }>;
}

export default async function GovernancePage(props: GovernancePageProps) {
  const searchParams = await props.searchParams;
  const page = Number(searchParams.page) || 1;
  const search = searchParams.search || "";
  const pageSize = 20;

  const client = await fetchClient();

  const { data, error } = await client.GET("/api/v1/admin/communities", {
    params: {
      query: {
        page: page,
        page_size: pageSize,
        search: search || undefined,
      },
    },
  });

  if (error || !data) {
    console.error("连接后端失败:", error);
    return (
      <div className="p-8 text-center text-red-500">
        加载数据失败，请检查网络或权限。
      </div>
    );
  }

  const { items, total } =
    extractPaginatedData<components["schemas"]["CommunityResponse"]>(data);

  return (
    <div className="container h-full flex flex-col gap-4 sm:gap-6 p-4 sm:p-8 m-x-8">
      <div className="flex flex-col gap-1 sm:gap-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          数据治理
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          合并重复的小区名称，清洗脏数据。合并操作将迁移关联的房源数据，操作不可撤销。
        </p>
      </div>

      {/* 核心治理视图 */}
      <GovernanceView
        data={items}
        total={total || 0}
        page={page}
        pageSize={pageSize}
      />
    </div>
  );
}
