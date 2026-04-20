"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  getCompetitorsAction,
  getCompetitorsByCommunityAction,
  addCompetitorAction,
  removeCompetitorAction,
} from "../../../actions/monitor-lib/competitors";
import type { CompetitorItem } from "../../../actions/monitor-lib/types";

interface UseCompetitorsProps {
  projectId?: string;
  communityName?: string;
  isOpen: boolean;
}

interface UseCompetitorsReturn {
  competitors: CompetitorItem[];
  communityId: string | null;
  loading: boolean;
  deletingId: string | null;
  refresh: () => void;
  addCompetitor: (competitorId: string) => Promise<void>;
  removeCompetitor: (competitorId: string) => Promise<void>;
}

export function useCompetitors({
  projectId,
  communityName,
  isOpen,
}: UseCompetitorsProps): UseCompetitorsReturn {
  const [competitors, setCompetitors] = useState<CompetitorItem[]>([]);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const loadData = async () => {
      setIsLoading(true);

      const result = projectId
        ? await getCompetitorsAction(projectId)
        : communityName
          ? await getCompetitorsByCommunityAction(communityName)
          : { success: false, message: "缺少参数" };

      if (isMounted && result.success && result.data) {
        setCompetitors(result.data);
        setCommunityId(result.communityId ?? null);
      }
      if (isMounted) setIsLoading(false);
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, projectId, communityName, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const addCompetitor = useCallback(
    async (competitorId: string) => {
      if (!communityId) {
        toast.error("未获取到当前小区信息，无法添加");
        return;
      }
      const result = await addCompetitorAction(communityId, competitorId);
      if (result.success) {
        refresh();
      }
    },
    [communityId, refresh]
  );

  const removeCompetitor = useCallback(
    async (competitorId: string) => {
      if (!communityId) return;
      setDeletingId(competitorId);
      const result = await removeCompetitorAction(communityId, competitorId);
      if (result.success) {
        refresh();
      }
      setDeletingId(null);
    },
    [communityId, refresh]
  );

  return {
    competitors,
    communityId,
    loading: isLoading,
    deletingId,
    refresh,
    addCompetitor,
    removeCompetitor,
  };
}
