/**
 * 商圈下钻页（Level 2）—— Server Component。
 *
 * 框架与 Level 1（market/page.tsx）一致：
 * TopFilterBar（隐藏地区选择器）+ SubFilterBar + KpiCards + TrendChart
 * + PriceDistributionChart + CommunityTable + ReportsFooter。
 *
 * 差异点：
 * - 数据范围缩小到指定 `business_circles`（来自 URL，由 Level 1 跳转设置）
 * - TopFilterBar 隐藏"地区"搜索框，仅保留范围/来源
 * - BusinessDistrictTable 替换为 CommunityTable
 * - 无 `business_circles` 时渲染引导卡片
 *
 * URL 状态来源（与 Level 1 对齐）：
 * - 顶层筛选（TopFilterBar）：range / sources / business_circles / q
 * - 次级筛选（SubFilterBar）：status / rooms / floor_levels
 */
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { fetchClient } from "@/lib/api-server";
import { logger } from "@/lib/logger";
import type {
  CommunityRow,
  DistributionBucket,
  Granularity,
  KpiData,
  PriceBucket,
  PropertyStatus,
  RangeOption,
  TrendDataPoint,
} from "../_lib/types";
import { buildRoomsUrl, parseRoomsUrl } from "../market/_components/url-helpers";
import { CommunityTable } from "./_components/community-table";
import { DistributionChart } from "../market/_components/distribution-chart";
import { KpiCards } from "../market/_components/kpi-cards";
import { ReportsFooter } from "../market/_components/reports-footer";
import { SubFilterBar } from "../market/_components/sub-filter-bar";
import { TopFilterBar } from "../market/_components/top-filter-bar";
import { TrendChart } from "../market/_components/trend-chart";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const VALID_RANGES: readonly RangeOption[] = ["4w", "8w", "6m", "12m", "24m"];
const VALID_STATUS: readonly PropertyStatus[] = ["在售", "成交"];
const VALID_TREND_DIMS = ["overall", "rooms", "floor", "price"] as const;

/** 防御性解析：string | string[] | undefined → string | undefined */
function asString(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

/** 将 string | string[] | undefined 解析为 string[]（按逗号切分，过滤空串） */
function asCsvArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  const raw = Array.isArray(value) ? value.join(",") : value;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseRange(value: string | undefined): RangeOption {
  if (value && (VALID_RANGES as readonly string[]).includes(value)) {
    return value as RangeOption;
  }
  return "4w";
}

function parseStatus(value: string | undefined): PropertyStatus {
  if (value && (VALID_STATUS as readonly string[]).includes(value)) {
    return value as PropertyStatus;
  }
  return "成交";
}

function parseTrendDim(value: string | undefined): (typeof VALID_TREND_DIMS)[number] {
  if (value && (VALID_TREND_DIMS as readonly string[]).includes(value)) {
    return value as (typeof VALID_TREND_DIMS)[number];
  }
  return "overall";
}

export default async function CommunitiesPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const params = await searchParams;

  const range = parseRange(asString(params.range));
  const sources = asCsvArray(params.sources);
  const q = asString(params.q) || null;
  const businessCircles = asCsvArray(params.business_circles);
  const status = parseStatus(asString(params.status));
  const roomsUrl = asString(params.rooms) ?? "";
  const floor_levels = asCsvArray(params.floor_levels);
  const trend_dim = parseTrendDim(asString(params.trend_dim));

  // rooms URL 解析；filterQuery.rooms 使用 "4plus" 哨兵 CSV 形式（后端契约）
  const roomsState = parseRoomsUrl(roomsUrl);
  const roomsCsv = buildRoomsUrl(roomsState);

  // 无 business_circles 引导分支（spec：缺失时显示引导文案）
  if (businessCircles.length === 0) {
    return (
      <div className="min-h-screen bg-muted">
        <div className="w-full max-w-400 mx-auto flex flex-col gap-6 py-6 px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-1">
            <Link
              href="/admin/reports/market"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              返回商圈分析报表
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">小区明细</h1>
          </div>
          <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
            请从
            <Link
              href="/admin/reports/market"
              className="mx-1 text-primary underline-offset-2 hover:underline"
            >
              商圈分析报表
            </Link>
            选择一个商圈下钻
          </div>
        </div>
      </div>
    );
  }

  // 后端 API 筛选 Query（omit 空数组 / null，避免 openapi-fetch 发送）
  // Level 2 进入此分支时 businessCircles 必非空
  const businessCirclesCsv = businessCircles.join(",");
  const filterQuery = {
    range,
    sources: sources.length > 0 ? sources.join(",") : undefined,
    business_circles: businessCirclesCsv,
    community_name: q ?? undefined,
    status,
    rooms: roomsCsv || undefined,
    floor_levels: floor_levels.length > 0 ? floor_levels.join(",") : undefined,
  };

  const granularity: Granularity = range === "4w" || range === "8w" ? "week" : "month";

  const client = await fetchClient();

  // 并行拉取所有数据（AGENTS.md §2 消除请求瀑布）
  const [
    kpiRes,
    trendRes,
    priceDistRes,
    roomsDistRes,
    floorDistRes,
    communitiesRes,
    dataSourcesRes,
    lastUpdatedRes,
  ] = await Promise.all([
    client.GET("/api/v1/reports/market/kpi", {
      params: { query: filterQuery },
    }),
    client.GET("/api/v1/reports/market/trend", {
      params: { query: { ...filterQuery, trend_dim } },
    }),
    client.GET("/api/v1/reports/market/price-distribution", {
      params: { query: filterQuery },
    }),
    client.GET("/api/v1/reports/market/rooms-distribution", {
      params: { query: filterQuery },
    }),
    client.GET("/api/v1/reports/market/floor-distribution", {
      params: { query: filterQuery },
    }),
    client.GET("/api/v1/reports/communities/", {
      // Level 2 为商圈下钻视图, 用户已显式选择某商圈, 应展示该商圈下所有小区
      // (即使 sold_count=1 也展示), 避免稀疏数据商圈显示空列表
      params: {
        query: { ...filterQuery, business_circles: businessCirclesCsv, min_sold_count: 1 },
      },
    }),
    client.GET("/api/v1/reports/market/dictionaries", {
      params: { query: { dict_type: "data_source" } },
    }),
    client.GET("/api/v1/reports/market/dictionaries", {
      params: { query: { dict_type: "last_updated" } },
    }),
  ]);

  // 聚合端点失败 → throw 触发 error.tsx（与 Level 1 一致）
  if (kpiRes.error) {
    logger.error("KPI endpoint failed", kpiRes.error);
    throw new Error("Failed to fetch KPI data");
  }
  if (trendRes.error) {
    logger.error("Trend endpoint failed", trendRes.error);
    throw new Error("Failed to fetch trend data");
  }
  if (priceDistRes.error) {
    logger.error("Price distribution endpoint failed", priceDistRes.error);
    throw new Error("Failed to fetch price distribution data");
  }
  if (roomsDistRes.error) {
    logger.error("Rooms distribution endpoint failed", roomsDistRes.error);
    throw new Error("Failed to fetch rooms distribution data");
  }
  if (floorDistRes.error) {
    logger.error("Floor distribution endpoint failed", floorDistRes.error);
    throw new Error("Failed to fetch floor distribution data");
  }
  if (communitiesRes.error) {
    logger.error("Communities endpoint failed", communitiesRes.error);
    throw new Error("Failed to fetch communities data");
  }

  // 字典端点失败 → 降级（不阻塞主数据渲染）
  if (dataSourcesRes.error) {
    logger.warn("data_source dictionary failed", dataSourcesRes.error);
  }
  if (lastUpdatedRes.error) {
    logger.warn("last_updated dictionary failed", lastUpdatedRes.error);
  }

  // 聚合数据（已通过 error 检查，data 非 null）
  const kpiData = kpiRes.data as KpiData;
  const trendData = trendRes.data as TrendDataPoint[];
  const priceDistData = priceDistRes.data as {
    buckets: PriceBucket[];
    total: number;
  };
  const roomsDistData = roomsDistRes.data as {
    buckets: DistributionBucket[];
    total: number;
  };
  const floorDistData = floorDistRes.data as {
    buckets: DistributionBucket[];
    total: number;
  };
  const communitiesData = communitiesRes.data as {
    items: CommunityRow[];
    total: number;
  };

  // 字典数据降级处理
  const dataSources = dataSourcesRes.data?.items ?? [];
  const lastUpdated = lastUpdatedRes.data?.items?.[0] ?? new Date().toISOString();

  return (
    <div className="min-h-screen bg-muted">
      <div className="w-full max-w-400 mx-auto flex flex-col gap-6 py-6 px-4 sm:px-6 lg:px-8">
        <TopFilterBar hideLocationSelector dataSources={dataSources} lastUpdated={lastUpdated} />
        <SubFilterBar />
        <KpiCards data={kpiData} />
        <TrendChart data={trendData} granularity={granularity} dimension={trend_dim} />
        <DistributionChart
          title="成交价格分布图"
          bucketLabelHeader="价格区间(万)"
          buckets={priceDistData.buckets}
          total={priceDistData.total}
          viewKey="price_view"
        />
        {/* 桌面端户型/楼层分布图并排（桶数少，全宽过稀疏）；移动端单列堆叠 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <DistributionChart
            title="户型分布图"
            bucketLabelHeader="户型"
            buckets={roomsDistData.buckets}
            total={roomsDistData.total}
            viewKey="rooms_view"
          />
          <DistributionChart
            title="楼层分布图"
            bucketLabelHeader="楼层"
            buckets={floorDistData.buckets}
            total={floorDistData.total}
            viewKey="floor_view"
          />
        </div>
        <CommunityTable items={communitiesData.items} total={communitiesData.total} />
        <ReportsFooter lastUpdated={lastUpdated} />
      </div>
    </div>
  );
}
