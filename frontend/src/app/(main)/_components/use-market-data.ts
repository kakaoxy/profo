"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { components } from "@/lib/api-types";
import { client } from "@/lib/api-client";

type CommunityMarketStatsResponse = components["schemas"]["CommunityMarketStatsResponse"];

// 全局请求缓存，避免重复请求相同小区
const requestCache = new Map<string, Promise<CommunityMarketStatsResponse | null>>();

export function useMarketData(communityId: string | null | undefined) {
  const [marketData, setMarketData] = useState<CommunityMarketStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // 使用 ref 存储当前请求的序列号，用于处理竞态
  const requestSeqRef = useRef(0);

  useEffect(() => {
    // 增加序列号，标记新的请求周期
    const currentSeq = ++requestSeqRef.current;

    // 如果没有 communityId，立即清空数据
    if (!communityId) {
      setMarketData(null);
      setIsLoading(false);
      return;
    }

    const abortController = new AbortController();

    const fetchMarketData = async () => {
      setIsLoading(true);
      setMarketData(null); // 开始新请求前清空旧数据

      try {
        // 检查是否有正在进行的相同请求，避免重复请求
        let requestPromise = requestCache.get(communityId);
        
        if (!requestPromise) {
          // 创建新请求
          requestPromise = (async () => {
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
                return null;
              }
              
              return data || null;
            } finally {
              // 请求完成后从缓存中移除
              requestCache.delete(communityId);
            }
          })();
          
          requestCache.set(communityId, requestPromise);
        }

        const data = await requestPromise;

        // 检查序列号是否匹配，如果不匹配说明已有新请求，丢弃当前结果
        if (currentSeq !== requestSeqRef.current) {
          console.log(`[useMarketData] 请求 ${currentSeq} 已过期，丢弃结果`);
          return;
        }

        setMarketData(data);
      } catch (error) {
        // 检查序列号是否匹配
        if (currentSeq !== requestSeqRef.current) {
          return;
        }

        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        console.error(
          "Failed to fetch market data:",
          error instanceof Error ? error.message : String(error)
        );
      } finally {
        // 只有当前请求是最新的才更新 loading 状态
        if (currentSeq === requestSeqRef.current) {
          setIsLoading(false);
        }
      }
    };

    fetchMarketData();

    return () => {
      abortController.abort(new DOMException("Effect cleanup", "AbortError"));
    };
  }, [communityId]);

  return { marketData, isLoading };
}
