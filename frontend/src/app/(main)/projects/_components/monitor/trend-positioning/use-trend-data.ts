"use client";

import { useState, useEffect } from "react";
import {
  getTrendPositioningAction,
  getTrendPositioningByCommunityAction,
} from "../../../actions/monitor-lib/trend";
import type { TrendData } from "../../../actions/monitor-lib/types";

interface UseTrendDataProps {
  projectId?: string;
  communityName?: string;
  myOverridePrice?: number;
}

interface UseTrendDataReturn {
  data: TrendData[];
  myPricing: number;
  loading: boolean;
  error: string | null;
}

export function useTrendData({
  projectId,
  communityName,
  myOverridePrice,
}: UseTrendDataProps): UseTrendDataReturn {
  const [data, setData] = useState<TrendData[]>([]);
  const [myPricing, setMyPricing] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        const res = projectId
          ? await getTrendPositioningAction(projectId)
          : communityName
            ? await getTrendPositioningByCommunityAction(
                communityName,
                myOverridePrice || 0,
              )
            : { success: false, message: "缺少参数" };

        if (res.success && res.data) {
          setData(res.data);
          if (res.myPrice !== undefined) {
            setMyPricing(res.myPrice);
          } else if (myOverridePrice !== undefined) {
            setMyPricing(myOverridePrice);
          }
        } else {
          setError(res.message || "获取走势数据失败");
        }
      } catch (e) {
        console.error("加载趋势数据失败:", e);
        setError("加载失败");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [projectId, communityName, myOverridePrice]);

  return { data, myPricing, loading, error };
}
