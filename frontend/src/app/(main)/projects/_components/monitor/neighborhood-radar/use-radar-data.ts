"use client";

import { useState, useEffect } from "react";
import {
  getNeighborhoodRadarAction,
  getNeighborhoodRadarByCommunityAction,
} from "../../../actions/monitor-lib/radar";
import type { NeighborhoodRadarItem } from "../../../actions/monitor-lib/types";

interface UseRadarDataProps {
  projectId?: string;
  communityName?: string;
}

interface UseRadarDataReturn {
  competitors: NeighborhoodRadarItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useRadarData({
  projectId,
  communityName,
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
        : communityName
          ? await getNeighborhoodRadarByCommunityAction(communityName)
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

    loadData();
    return () => {
      isMounted = false;
    };
  }, [projectId, communityName, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  return { competitors, loading: isLoading, error, refresh };
}
