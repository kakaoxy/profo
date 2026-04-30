"use client";

import { useState, useEffect } from "react";
import {
  getMarketSentimentAction,
  getMarketSentimentByCommunityAction,
} from "../../../actions/monitor-lib/sentiment";
import type { FloorStats } from "../../../actions/monitor-lib/types";

interface UseSentimentDataProps {
  projectId?: string;
  communityId?: string;
}

interface UseSentimentDataReturn {
  floorStats: FloorStats[];
  inventoryMonths: number;
  loading: boolean;
  error: string | null;
}

export function useSentimentData({
  projectId,
  communityId,
}: UseSentimentDataProps): UseSentimentDataReturn {
  const [floorStats, setFloorStats] = useState<FloorStats[]>([]);
  const [inventoryMonths, setInventoryMonths] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        const result = projectId
          ? await getMarketSentimentAction(projectId)
          : communityId
            ? await getMarketSentimentByCommunityAction(communityId)
            : { success: false, message: "缺少参数" };

        if (!result.success) {
          setError(result.message || "获取市场情绪失败");
          return;
        }

        setFloorStats(result.data?.floor_stats || []);
        setInventoryMonths(result.data?.inventory_months || 0);
      } catch (e) {
        console.error("获取市场情绪数据失败:", e);
        setError("网络错误，请稍后重试");
      } finally {
        setLoading(false);
      }
    }

    if (projectId || communityId) {
      fetchData();
    } else {
      // 当缺少参数时，直接结束加载状态
      setLoading(false);
      setError("缺少必要参数");
    }
  }, [projectId, communityId]);

  return { floorStats, inventoryMonths, loading, error };
}
