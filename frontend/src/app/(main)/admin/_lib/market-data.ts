import { fetchClient } from "@/lib/api-server";
import { isRedirectError } from "@/lib/auth/server/session";
import type { components } from "@/lib/api-types";
import type { paths } from "@/lib/api-types";

type ClientType = ReturnType<typeof import("openapi-fetch").default<paths>>;

type CommunityMarketStatsResponse =
  components["schemas"]["CommunityMarketStatsResponse"];

export interface MarketDataMap {
  [communityId: string]: CommunityMarketStatsResponse | null;
}

interface MarketDataResult {
  data: MarketDataMap;
  errors: string[];
}

/**
 * 批量获取小区市场数据
 * 使用 Promise.all 并发获取所有需要的市场数据，避免 N+1 请求瀑布
 * @param communityIds 小区ID数组
 * @param client 可选的API客户端，避免重复创建fetchClient
 */
export async function batchGetMarketData(
  communityIds: (string | null | undefined)[],
  client?: ClientType
): Promise<MarketDataResult> {
  const apiClient = client || (await fetchClient());

  // 去重并过滤掉无效ID
  const uniqueIds = Array.from(new Set(communityIds)).filter(
    (id): id is string => !!id
  );

  if (uniqueIds.length === 0) {
    return { data: {}, errors: [] };
  }

  const results = await Promise.allSettled(
    uniqueIds.map(async (communityId) => {
      const response = await apiClient.GET(
        "/api/v1/monitor/communities/{community_id}/market-stats",
        {
          params: {
            path: { community_id: communityId },
          },
        }
      );
      return { communityId, response };
    })
  );

  const data: MarketDataMap = {};
  const errors: string[] = [];

  // Task 8: 放行 NEXT_REDIRECT 错误，与 dashboard-data.ts 保持一致。
  // Promise.allSettled 会将 fetchClient 抛出的 NEXT_REDIRECT 捕获为 rejected，
  // 若不放行会落入下方 else 分支被当作普通错误吞掉，导致刷新跳转不触发。
  for (const result of results) {
    if (result.status === "rejected" && isRedirectError(result.reason)) {
      throw result.reason;
    }
  }

  results.forEach((result) => {
    if (result.status === "fulfilled") {
      const { communityId, response } = result.value;
      if (response.error) {
        data[communityId] = null;
        if (response.response?.status !== 404) {
          errors.push(`小区 ${communityId} 市场数据获取失败`);
        }
      } else {
        data[communityId] = response.data || null;
      }
    } else {
      errors.push(result.reason?.message || "未知错误");
    }
  });

  return { data, errors };
}
