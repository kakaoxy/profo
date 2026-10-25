import { Suspense } from "react";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import {
  PageContainer,
  PageHeader,
} from "@/app/(main)/admin/_components";
import { BdOverviewClient } from "./_components/overview-client";
import { BdKpiHero } from "./_components/kpi-hero";
import { BdOverviewHeaderActions } from "./_components/overview-header-actions";

export const dynamic = "force-dynamic";

interface BuildingDictionaryPageProps {
  searchParams: Promise<{
    page?: string;
    keyword?: string;
    district?: string;
    business_circle?: string;
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
 *
 * 性能（慢查询报告 2026-10-25 §6.1.2）：KPI 与列表渲染**解耦**。
 * 原实现把 `/kpi` 与列表放进同一个 `Promise.all`，整页 SSR 等最慢者——
 * 而 `/kpi` 的 `count(*) FROM bd_rooms`（735 万行）生产实测 6.3~9s，
 * 于是每次搜索/翻页都被 KPI 拖住。现在主链路只等「列表 + 筛选选项」
 * （均毫秒级），KPI 由 `<Suspense>` 独立流式渲染，其失败/变慢都不阻塞表格。
 * 后端侧另有 Redis 计数缓存（§6.1a）把 KPI 本身降到毫秒级，两层独立生效。
 */
export default async function BuildingDictionaryPage(props: BuildingDictionaryPageProps) {
  const searchParams = await props.searchParams;
  const page = Number(searchParams.page) || 1;
  const keyword = searchParams.keyword || "";
  const district = searchParams.district || "";
  const businessCircle = searchParams.business_circle || "";
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

  // 主链路：列表 + 筛选选项（无依赖，并行；两者均毫秒级）。
  // KPI 不在此处等待——它有自己的 Suspense 边界（见下方 <BdKpiHero />）。
  const [listResult, optionsResult] = await Promise.all([
    client.GET("/api/v1/admin/building-dictionary/communities", {
      params: {
        query: {
          page,
          page_size: 20,
          keyword: keyword || undefined,
          district: district || undefined,
          business_circle: businessCircle || undefined,
          ring: ring || undefined,
          property_type: propertyType || undefined,
          era_from: eraFrom,
          era_to: eraTo,
          has_project_link: hasProjectLink,
        },
      },
    }),
    client.GET("/api/v1/admin/building-dictionary/filter-options", {
      params: { query: { district: district || undefined } },
    }),
  ]);

  if (listResult.error || !listResult.data || optionsResult.error || !optionsResult.data) {
    const status = listResult.response?.status;
    logger.error("楼盘字典数据加载失败:", {
      status,
      listError: listResult.error,
      optionsError: optionsResult.error,
    });
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
  const list = listResult.data;

  return (
    <PageContainer>
      <PageHeader
        title="楼盘字典"
        description="上海 1.97 万个小区，逐级看楼栋和户室 · 点击行看详情"
        actions={
          <Suspense fallback={<BdOverviewHeaderActions pendingCount={0} />}>
            <BdKpiHero section="actions" />
          </Suspense>
        }
      />
      {/* KPI hero 独立边界：数字迟到/失败都不影响表格与筛选交互 */}
      <Suspense fallback={<BdKpiHero section="skeleton" />}>
        <BdKpiHero section="hero" />
      </Suspense>
      <BdOverviewClient
        list={list}
        keyword={keyword}
        district={district}
        businessCircle={businessCircle}
        districtOptions={optionsResult.data.districts ?? []}
        businessCircleOptions={optionsResult.data.business_circles ?? []}
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
