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
  const hasParam = Boolean(projectId || communityId);
  const [isLoading, setIsLoading] = useState(hasParam);
  const [error, setError] = useState<string | null>(
    hasParam ? null : "缺少必要参数"
  );
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
          : { success: false, message: "缺少必要参数" };

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
    }

    return () => {
      isMounted = false;
    };
  }, [projectId, communityId, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  return { competitors, loading: isLoading, error, refresh };
}
