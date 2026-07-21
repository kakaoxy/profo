/**
 * 小区成交分析详情页（Level 3）—— Server Component。
 *
 * 框架与 Level 1/2 对齐：TopFilterBar（隐藏地区选择器）+ SubFilterBar + KpiCards
 * + TrendChart + DistributionChart（价格/户型/楼层）+ CommunityTable + ReportsFooter。
 *
 * 数据来源：
 * - 主数据：`/api/v1/reports/communities/{community_id}/analysis`，透传完整筛选参数
 *   （range/sources/business_circles/community_name/status/rooms/floor_levels）
 * - 同商圈小区列表：`/api/v1/reports/communities/`，依赖 analysis 返回的 business_circle
 *
 * URL 状态：
 * - 顶层筛选（TopFilterBar）：range / sources / business_circles / q
 * - 次级筛选（SubFilterBar）：status / rooms / floor_levels
 * - 路径参数：communityId（小区 UUID）
 *
 * 样本量 < 5 时在趋势图上方提示「样本量不足，仅供参考」。
 */
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
} from "../../_lib/types";
import { buildRoomsUrl, parseRoomsUrl } from "../../market/_components/url-helpers";
import { DistributionChart } from "../../market/_components/distribution-chart";
import { KpiCards } from "../../market/_components/kpi-cards";
import { ReportsFooter } from "../../market/_components/reports-footer";
import { SubFilterBar } from "../../market/_components/sub-filter-bar";
import { TopFilterBar } from "../../market/_components/top-filter-bar";
import { TrendChart } from "../../market/_components/trend-chart";
import { CommunityTable } from "../_components/community-table";

interface PageProps {
  params: Promise<{ communityId: string }>;
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

/** 时间范围 → 趋势粒度：4w/8w=周，其余=月 */
function rangeToGranularity(range: RangeOption): Granularity {
  return range === "4w" || range === "8w" ? "week" : "month";
}

export default async function CommunityDetailPage({
  params,
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  // params 与 searchParams 无依赖，并行 await
  const [{ communityId }, sp] = await Promise.all([params, searchParams]);

  // 无效 ID → 回退 UI
  if (!communityId) {
    return (
      <div className="min-h-screen bg-muted">
        <div className="w-full max-w-400 mx-auto flex flex-col gap-6 py-6 px-4 sm:px-6 lg:px-8">
          <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
            小区ID无效，请从小区列表进入。
          </div>
        </div>
      </div>
    );
  }

  const range = parseRange(asString(sp.range));
  const sources = asCsvArray(sp.sources);
  const q = asString(sp.q) || null;
  const businessCircles = asCsvArray(sp.business_circles);
  const status = parseStatus(asString(sp.status));
  const roomsUrl = asString(sp.rooms) ?? "";
  const floor_levels = asCsvArray(sp.floor_levels);
  const trend_dim = parseTrendDim(asString(sp.trend_dim));

  // rooms URL 解析；filterQuery.rooms 使用 "4plus" 哨兵 CSV 形式（后端契约）
  const roomsState = parseRoomsUrl(roomsUrl);
  const roomsCsv = buildRoomsUrl(roomsState);

  // 后端 API 筛选 Query（omit 空数组 / null）
  const filterQuery = {
    range,
    sources: sources.length > 0 ? sources.join(",") : undefined,
    business_circles: businessCircles.length > 0 ? businessCircles.join(",") : undefined,
    community_name: q ?? undefined,
    status,
    rooms: roomsCsv || undefined,
    floor_levels: floor_levels.length > 0 ? floor_levels.join(",") : undefined,
  };

  const granularity = rangeToGranularity(range);

  const client = await fetchClient();

  // 并行拉取：analysis 主数据 + 字典端点（data_source / last_updated）
  const [analysisRes, dataSourcesRes, lastUpdatedRes] = await Promise.all([
    client.GET("/api/v1/reports/communities/{community_id}/analysis", {
      params: {
        path: { community_id: communityId },
        query: { ...filterQuery, trend_dim },
      },
    }),
    client.GET("/api/v1/reports/market/dictionaries", {
      params: { query: { dict_type: "data_source" } },
    }),
    client.GET("/api/v1/reports/market/dictionaries", {
      params: { query: { dict_type: "last_updated" } },
    }),
  ]);

  const { data: rawData, error, response } = analysisRes;

  if (error || !rawData) {
    // 404 小区不存在 → 回退 UI
    if (response.status === 404) {
      return (
        <div className="min-h-screen bg-muted">
          <div className="w-full max-w-400 mx-auto flex flex-col gap-6 py-6 px-4 sm:px-6 lg:px-8">
            <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
              未找到该小区，请从小区列表进入。
            </div>
          </div>
        </div>
      );
    }
    // 其他错误（401/403/500 等）→ 记录日志并触发 error.tsx
    logger.error("Failed to fetch community detail", {
      communityId,
      status: response.status,
      error,
    });
    throw new Error("Failed to fetch community detail");
  }

  // 字典端点失败 → 降级（不阻塞主数据渲染）
  if (dataSourcesRes.error) {
    logger.warn("data_source dictionary failed", dataSourcesRes.error);
  }
  if (lastUpdatedRes.error) {
    logger.warn("last_updated dictionary failed", lastUpdatedRes.error);
  }

  // API schema 中 community 为 `{ [key: string]: unknown }`，这里收敛为前端所需字段
  const community = rawData.community as {
    community_id: string;
    community_name: string;
    business_circle: string;
    district: string;
  };

  // analysis 请求成功后，基于 business_circle 拉取同商圈小区列表
  // （此请求依赖 analysis 返回的 business_circle，无法与 analysis 并行）
  let peersList: { items: CommunityRow[]; total: number } | null = null;
  if (community.business_circle) {
    const peersListRes = await client.GET("/api/v1/reports/communities/", {
      params: {
        query: {
          business_circles: community.business_circle,
          min_sold_count: 1,
        },
      },
    });
    if (peersListRes.error) {
      logger.warn("peers community list failed", peersListRes.error);
    }
    peersList = peersListRes.data as {
      items: CommunityRow[];
      total: number;
    } | null;
  }

  const detail = {
    community,
    kpi: rawData.kpi as KpiData,
    trend: rawData.trend as TrendDataPoint[],
    price_distribution: rawData.price_distribution as {
      buckets: PriceBucket[];
      total: number;
    },
    rooms_distribution: rawData.rooms_distribution as {
      buckets: DistributionBucket[];
      total: number;
    },
    floor_distribution: rawData.floor_distribution as {
      buckets: DistributionBucket[];
      total: number;
    },
    main_layout: rawData.main_layout ?? null,
  };

  // 全周期成交量样本量（spec §11.3：< 5 套需提示）
  const totalVolume = detail.trend.reduce((sum, t) => sum + t.volume, 0);

  // 字典数据降级处理
  const dataSources = dataSourcesRes.data?.items ?? [];
  const lastUpdated =
    lastUpdatedRes.data?.items?.[0] ?? new Date().toISOString();

  return (
    <div className="min-h-screen bg-muted">
      <div className="w-full max-w-400 mx-auto flex flex-col gap-6 py-6 px-4 sm:px-6 lg:px-8">
        <TopFilterBar
          hideLocationSelector
          dataSources={dataSources}
          lastUpdated={lastUpdated}
        />
        <SubFilterBar />

        {/* KPI 卡片 */}
        <KpiCards
          data={detail.kpi}
          variant="community"
          mainLayout={detail.main_layout}
        />

        {/* 样本量提示 + 成交趋势图 */}
        <section className="flex flex-col gap-3">
          {totalVolume < 5 && (
            <Alert>
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>样本量不足，仅供参考</AlertDescription>
            </Alert>
          )}
          <TrendChart
            data={detail.trend}
            granularity={granularity}
            dimension={trend_dim}
          />
        </section>

        {/* 分布图：价格 / 户型 / 楼层 */}
        <DistributionChart
          title="成交价格分布图"
          bucketLabelHeader="价格区间(万)"
          buckets={detail.price_distribution.buckets}
          total={detail.price_distribution.total}
          viewKey="price_view"
        />
        {/* 桌面端户型/楼层分布图并排（桶数少，全宽过稀疏）；移动端单列堆叠 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <DistributionChart
            title="户型分布图"
            bucketLabelHeader="户型"
            buckets={detail.rooms_distribution.buckets}
            total={detail.rooms_distribution.total}
            viewKey="rooms_view"
          />
          <DistributionChart
            title="楼层分布图"
            bucketLabelHeader="楼层"
            buckets={detail.floor_distribution.buckets}
            total={detail.floor_distribution.total}
            viewKey="floor_view"
          />
        </div>

        {/* 同商圈小区列表 */}
        {peersList && peersList.items.length > 0 && (
          <CommunityTable
            items={peersList.items}
            total={peersList.total}
            currentCommunityId={communityId}
          />
        )}

        <ReportsFooter lastUpdated={lastUpdated} />
      </div>
    </div>
  );
}
