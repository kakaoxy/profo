import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import {
  PageContainer,
  PageHeader,
} from "@/app/(main)/admin/_components";
import { BdOverviewClient } from "./_components/overview-client";
import { BdOverviewHeaderActions } from "./_components/overview-header-actions";

export const dynamic = "force-dynamic";

interface BuildingDictionaryPageProps {
  searchParams: Promise<{
    page?: string;
    keyword?: string;
    district?: string;
    ring?: string;
    type?: string;
    era_from?: string;
    era_to?: string;
    has_project_link?: string;
  }>;
}

/**
 * 楼盘字典总览页（FR-01 / Task 5）.
 *
 * KPI hero（Apricot 暖卡唯一）+ 筛选栏 + 小区表格 + 20 条/页；
 * 行点击打开详情抽屉（_components/community-drawer）；页头动作
 * （overview-header-actions）：＋新增小区 / 审核池（徽标计数）/ 导入数据。
 */
export default async function BuildingDictionaryPage(props: BuildingDictionaryPageProps) {
  const searchParams = await props.searchParams;
  const page = Number(searchParams.page) || 1;
  const keyword = searchParams.keyword || "";
  const district = searchParams.district || "";
  const ring = searchParams.ring || "";
  const propertyType = searchParams.type || "";
  const eraFrom = searchParams.era_from ? Number(searchParams.era_from) || undefined : undefined;
  const eraTo = searchParams.era_to ? Number(searchParams.era_to) || undefined : undefined;
  const hasProjectLink =
    searchParams.has_project_link === "true"
      ? true
      : searchParams.has_project_link === "false"
        ? false
        : undefined;

  const client = await fetchClient();

  // KPI 与列表无依赖，并行请求（消除瀑布）
  const [kpiResult, listResult] = await Promise.all([
    client.GET("/api/v1/admin/building-dictionary/kpi", {}),
    client.GET("/api/v1/admin/building-dictionary/communities", {
      params: {
        query: {
          page,
          page_size: 20,
          keyword: keyword || undefined,
          district: district || undefined,
          ring: ring || undefined,
          property_type: propertyType || undefined,
          era_from: eraFrom,
          era_to: eraTo,
          has_project_link: hasProjectLink,
        },
      },
    }),
  ]);

  if (kpiResult.error || !kpiResult.data || listResult.error || !listResult.data) {
    const status = listResult.response?.status;
    logger.error("楼盘字典数据加载失败:", { status, kpiError: kpiResult.error, listError: listResult.error });
    return (
      <PageContainer>
        <PageHeader title="楼盘字典" description="小区 → 楼栋 → 楼层 → 户室 四级结构化字典" />
        <div className="p-8 text-center text-error">
          {status === 401 ? "登录状态已失效，请刷新页面重新登录" : "加载数据失败，请检查网络或权限。"}
        </div>
      </PageContainer>
    );
  }

  // M4 修复：直接消费生成类型（fetchClient 泛型已绑定 OpenAPI schema），不再强转
  const kpi = kpiResult.data;
  const list = listResult.data;

  return (
    <PageContainer>
      <PageHeader
        title="楼盘字典"
        description="上海 1.97 万个小区，逐级看楼栋和户室 · 点击行看详情"
        actions={<BdOverviewHeaderActions pendingCount={kpi.pending_count} />}
      />
      <BdOverviewClient
        kpi={kpi}
        list={list}
        keyword={keyword}
        district={district}
        ring={ring}
        propertyType={propertyType}
        eraFrom={eraFrom}
        eraTo={eraTo}
        hasProjectLink={hasProjectLink}
        page={page}
      />
    </PageContainer>
  );
}
