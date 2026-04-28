"use client";

import { useEffect, useState, useRef } from "react";
import type { components } from "@/lib/api-types";
import { client } from "@/lib/api-client";

type CommunityMarketStatsResponse = components["schemas"]["CommunityMarketStatsResponse"];

export function useMarketData(communityId: string | null | undefined) {
  const [marketData, setMarketData] = useState<CommunityMarketStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 使用 ref 存储当前请求的唯一标识
  const requestIdRef = useRef<number>(0);

  useEffect(() => {
    // 生成新的请求ID
    const currentRequestId = ++requestIdRef.current;

    // 如果没有 communityId，立即清空数据
    if (!communityId) {
      setMarketData(null);
      setIsLoading(false);
      return;
    }

    // 创建 AbortController 用于取消请求
    const abortController = new AbortController();

    const fetchMarketData = async () => {
      setIsLoading(true);

      try {
        const { data, error, response } = await client.GET(
          "/api/v1/monitor/communities/{community_id}/market-stats",
          {
            params: {
              path: { community_id: communityId },
            },
            signal: abortController.signal,
          }
        );

        // 如果请求已过期，丢弃结果
        if (currentRequestId !== requestIdRef.current) {
          return;
        }

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
          setMarketData(null);
          return;
        }

        setMarketData(data || null);
      } catch (error) {
        // 如果请求被取消或已过期，忽略错误
        if (abortController.signal.aborted || currentRequestId !== requestIdRef.current) {
          return;
        }

        console.error(
          "Failed to fetch market data:",
          error instanceof Error ? error.message : String(error)
        );
        setMarketData(null);
      } finally {
        // 只有当前请求是最新的才更新 loading 状态
        if (!abortController.signal.aborted && currentRequestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    };

    fetchMarketData();

    return () => {
      abortController.abort();
    };
  }, [communityId]);

  return { marketData, isLoading };
}
