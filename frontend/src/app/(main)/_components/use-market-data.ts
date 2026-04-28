"use client";

import { useEffect, useState } from "react";
import type { components } from "@/lib/api-types";
import { client } from "@/lib/api-client";

type CommunityMarketStatsResponse = components["schemas"]["CommunityMarketStatsResponse"];

export function useMarketData(communityId: string | null | undefined) {
  const [marketData, setMarketData] = useState<CommunityMarketStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();

    const fetchMarketData = async () => {
      if (!communityId) return;

      setIsLoading(true);
      try {
        const { data, error, response } = await client.GET("/api/v1/monitor/communities/{community_id}/market-stats", {
          params: {
            path: { community_id: communityId },
          },
          signal: abortController.signal,
        });

        if (!isMounted) return;

        if (error) {
          if (response?.status === 404) {
            console.log(`[useMarketData] 小区 ${communityId} 暂无市场数据`);
          } else {
            console.warn("[useMarketData] 获取市场数据失败:", {
              status: response?.status,
              statusText: response?.statusText,
              communityId,
            });
          }
        } else if (data) {
          setMarketData(data);
        }
      } catch (error) {
        if (!isMounted) return;
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        console.error("Failed to fetch market data:", error instanceof Error ? error.message : String(error));
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchMarketData();

    return () => {
      isMounted = false;
      abortController.abort(new DOMException("Component unmounted", "AbortError"));
    };
  }, [communityId]);

  return { marketData, isLoading };
}
