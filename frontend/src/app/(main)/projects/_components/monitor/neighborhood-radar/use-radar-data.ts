"use client";

import { useState, useEffect } from "react";
import {
  getNeighborhoodRadarAction,
  getNeighborhoodRadarByCommunityAction,
} from "../../../actions/monitor-lib/radar";
import type { NeighborhoodRadarItem } from "../../../actions/monitor-lib/types";

interface UseRadarDataProps {
  projectId?: string;
  communityId?: string;
}

interface UseRadarDataReturn {
  competitors: NeighborhoodRadarItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useRadarData({
  projectId,
  communityId,
}: UseRadarDataProps): UseRadarDataReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [competitors, setCompetitors] = useState<NeighborhoodRadarItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      const result = projectId
        ? await getNeighborhoodRadarAction(projectId)
        : communityId
          ? await getNeighborhoodRadarByCommunityAction(communityId)
          : { success: false, message: "缺少参数" };

      if (isMounted) {
        if (result.success && result.data) {
          setCompetitors(result.data.items || []);
        } else {
          setError(result.message || "加载失败");
        }
        setIsLoading(false);
      }
    };

    if (projectId || communityId) {
      loadData();
    } else {
      // 当缺少参数时，推迟到下一个微任务更新状态，避免级联渲染
      queueMicrotask(() => {
        setIsLoading(false);
        setError("缺少必要参数");
      });
    }
    return () => {
      isMounted = false;
    };
  }, [projectId, communityId, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  return { competitors, loading: isLoading, error, refresh };
}
