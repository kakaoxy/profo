"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { components } from "@/lib/api-types";
import { client } from "@/lib/api-client";

type CommunityMarketStatsResponse = components["schemas"]["CommunityMarketStatsResponse"];

// 全局请求缓存，避免重复请求相同小区
// 使用对象包装 Promise 和时间戳，用于控制缓存过期
interface CacheEntry {
  promise: Promise<CommunityMarketStatsResponse | null>;
  timestamp: number;
}

const requestCache = new Map<string, CacheEntry>();

// 缓存有效期：5秒
const CACHE_TTL = 5000;

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
        const now = Date.now();
        const cacheEntry = requestCache.get(communityId);
        let requestPromise: Promise<CommunityMarketStatsResponse | null> | undefined;
        
        // 如果缓存存在且未过期，复用缓存的 Promise
        if (cacheEntry && now - cacheEntry.timestamp < CACHE_TTL) {
          requestPromise = cacheEntry.promise;
        }
        
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
              // 延迟删除缓存，避免竞态：让后续相同请求有机会复用缓存
              // 缓存会在 TTL 后自然过期，或者在下一次请求时检查时间戳后替换
              setTimeout(() => {
                const entry = requestCache.get(communityId);
                // 只有时间戳匹配时才删除（确保删除的是自己创建的缓存）
                if (entry && now === entry.timestamp) {
                  requestCache.delete(communityId);
                }
              }, CACHE_TTL);
            }
          })();
          
          requestCache.set(communityId, { promise: requestPromise, timestamp: now });
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
