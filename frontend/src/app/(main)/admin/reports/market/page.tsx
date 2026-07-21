/**
 * 商圈分析报表主页（Server Component）。
 *
 * 职责：解析 URL searchParams → 构建 filterQuery → 并行调用后端 4 个聚合端点 +
 * 2 个字典端点 → 将结果作为 props 传递给各 Client/Server 子组件。
 * 页面标题与品牌图标由 TopFilterBar 内部渲染，本页面不重复输出。
 *
 * URL 状态来源：
 * - 顶层筛选（TopFilterBar）：range / sources / business_circles / q
 * - 次级筛选（SubFilterBar）：status / rooms / floor_levels
 * - 表格自管（BusinessDistrictTable）：sort_by / sort_order / page / page_size / compare_ids
 *
 * 数据获取：
 * - 4 个聚合端点（kpi/trend/price-distribution/business-districts）失败 → throw 触发 error.tsx
 * - 字典端点（data_source/last_updated）失败 → 降级为空数组 / 当前 ISO 时间
 */
import { fetchClient } from "@/lib/api-server";
import { logger } from "@/lib/logger";
import type {
  BusinessDistrictRow,
  DistributionBucket,
  Granularity,
  KpiData,
  PriceBucket,
  PropertyStatus,
  RangeOption,
  TrendDataPoint,
} from "../_lib/types";
import { buildRoomsUrl, parseRoomsUrl } from "./_components/url-helpers";
import { BusinessDistrictTable } from "./_components/business-district-table";
import { ComparisonPool } from "./_components/comparison-pool";
import { DistributionChart } from "./_components/distribution-chart";
import { KpiCards } from "./_components/kpi-cards";
import { ReportsFooter } from "./_components/reports-footer";
import { SubFilterBar } from "./_components/sub-filter-bar";
import { TopFilterBar } from "./_components/top-filter-bar";
import { TrendChart } from "./_components/trend-chart";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const VALID_RANGES: readonly RangeOption[] = ["4w", "8w", "6m", "12m", "24m"];
const VALID_STATUS: readonly PropertyStatus[] = ["在售", "成交"];
const VALID_TREND_DIMS = ["overall", "rooms", "floor", "price"] as const;
const VALID_SORT_KEYS = [
  "sold_count",
  "avg_price_wan",
  "avg_unit_price",
  "on_sale_count",
  "absorption_months",
  "price_qoq",
  "volume_qoq",
] as const;

const DEFAULT_PAGE_SIZE = 20;

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

function parseSortBy(value: string | undefined): (typeof VALID_SORT_KEYS)[number] {
  if (value && (VALID_SORT_KEYS as readonly string[]).includes(value)) {
    return value as (typeof VALID_SORT_KEYS)[number];
  }
  return "sold_count";
}

function parseTrendDim(value: string | undefined): (typeof VALID_TREND_DIMS)[number] {
  if (value && (VALID_TREND_DIMS as readonly string[]).includes(value)) {
    return value as (typeof VALID_TREND_DIMS)[number];
  }
  return "overall";
}

function parseSortOrder(value: string | undefined): "asc" | "desc" {
  return value === "asc" ? "asc" : "desc";
}

function parsePage(value: string | undefined): number {
  if (!value) return 1;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return 1;
  return n;
}

function parsePageSize(value: string | undefined): number {
  if (!value) return DEFAULT_PAGE_SIZE;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return n;
}

export default async function MarketReportsPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;

  const range = parseRange(asString(params.range));
  const sources = asCsvArray(params.sources);
  const q = asString(params.q) || null;
  const businessCircles = asCsvArray(params.business_circles);
  const status = parseStatus(asString(params.status));
  const roomsUrl = asString(params.rooms) ?? "";
  const floor_levels = asCsvArray(params.floor_levels);
  const sort_by = parseSortBy(asString(params.sort_by));
  const sort_order = parseSortOrder(asString(params.sort_order));
  const page = parsePage(asString(params.page));
  const page_size = parsePageSize(asString(params.page_size));
  const compareIds = asCsvArray(params.compare_ids);
  const trend_dim = parseTrendDim(asString(params.trend_dim));

  // rooms URL 解析；filterQuery.rooms 使用 "4plus" 哨兵 CSV 形式（后端契约）
  const roomsState = parseRoomsUrl(roomsUrl);
  const roomsCsv = buildRoomsUrl(roomsState);

  // 后端 API 筛选 Query（omit 空数组 / null，避免 openapi-fetch 发送）
  const filterQuery = {
    range,
    sources: sources.length > 0 ? sources.join(",") : undefined,
    business_circles: businessCircles.length > 0 ? businessCircles.join(",") : undefined,
    community_name: q ?? undefined,
    status,
    rooms: roomsCsv || undefined,
    floor_levels: floor_levels.length > 0 ? floor_levels.join(",") : undefined,
  };

  const granularity: Granularity =
    range === "4w" || range === "8w" ? "week" : "month";

  const client = await fetchClient();

  // 并行拉取所有数据（AGENTS.md §2 消除请求瀑布）
  const [
    kpiRes,
    trendRes,
    priceDistRes,
    roomsDistRes,
    floorDistRes,
    bdRowsRes,
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
    client.GET("/api/v1/reports/market/business-districts", {
      params: {
        query: { ...filterQuery, sort_by, sort_order, page, page_size },
      },
    }),
    client.GET("/api/v1/reports/market/dictionaries", {
      params: { query: { dict_type: "data_source" } },
    }),
    client.GET("/api/v1/reports/market/dictionaries", {
      params: { query: { dict_type: "last_updated" } },
    }),
  ]);

  // 聚合端点失败 → throw 触发 error.tsx（spec: API 错误兜底）
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
  if (bdRowsRes.error) {
    logger.error("Business districts endpoint failed", bdRowsRes.error);
    throw new Error("Failed to fetch business districts data");
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
  const bdRowsData = bdRowsRes.data as {
    items: BusinessDistrictRow[];
    total: number;
  };

  // 字典数据降级处理
  const dataSources = dataSourcesRes.data?.items ?? [];
  const lastUpdated =
    lastUpdatedRes.data?.items?.[0] ?? new Date().toISOString();

  return (
    <div className="min-h-screen bg-muted">
      <div className="w-full max-w-400 mx-auto flex flex-col gap-6 py-6 px-4 sm:px-6 lg:px-8">
        <TopFilterBar
          dataSources={dataSources}
          lastUpdated={lastUpdated}
        />
        <SubFilterBar />
        <ComparisonPool />
        <KpiCards data={kpiData} />
        <TrendChart
          data={trendData}
          granularity={granularity}
          dimension={trend_dim}
        />
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
        <BusinessDistrictTable
          initialItems={bdRowsData.items}
          initialTotal={bdRowsData.total}
          compareIds={compareIds}
        />
        <ReportsFooter lastUpdated={lastUpdated} />
      </div>
    </div>
  );
}
