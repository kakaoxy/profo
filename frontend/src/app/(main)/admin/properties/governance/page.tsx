import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { extractPaginatedData } from "@/lib/api-helpers";
import type { components } from "@/lib/api-types";
import { GovernanceView } from "./governance-view";
import { PageContainer, PageHeader } from "@/app/(main)/admin/_components";
import { pickCommunityFields } from "./pick-community-fields";

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

  const { data, error, response } = await client.GET("/api/v1/admin/communities", {
    params: {
      query: {
        page: page,
        page_size: pageSize,
        search: search || undefined,
      },
    },
  });

  if (error || !data) {
    const status = response?.status;
    logger.error("加载数据失败:", { status, error });
    return (
      <div className="p-8 text-center text-error">
        {status === 401 ? "登录状态已失效，请刷新页面重新登录" : "加载数据失败，请检查网络或权限。"}
      </div>
    );
  }

  const { items, total } = extractPaginatedData<components["schemas"]["CommunityResponse"]>(data);

  // RSC 序列化精简：仅保留前端实际使用的字段，剔除 city_id / avg_price_wan
  // 规则: server-serialization（最小化传给客户端组件的数据）
  const minimalItems = items.map(pickCommunityFields);

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <PageHeader
          title="数据治理"
          description="合并重复的小区名称，清洗脏数据。合并操作将迁移关联的房源数据，操作不可撤销。"
        />

        {/* 核心治理视图 */}
        <GovernanceView data={minimalItems} total={total || 0} page={page} pageSize={pageSize} />
      </PageContainer>
    </div>
  );
}
