"use client";

import { useState, useEffect, useMemo } from "react";
import {
  getCompetitorsBrawlAction,
  getCompetitorsBrawlByCommunityAction,
} from "../../../actions/monitor-lib/brawl";
import type { BrawlItem } from "../../../actions/monitor-lib/types";
import type { SortConfig } from "./types";

interface UseCompetitorsProps {
  projectId?: string;
  communityName?: string;
}

interface UseCompetitorsReturn {
  allItems: BrawlItem[];
  counts: { on_sale: number; sold: number };
  loading: boolean;
  error: string | null;
}

export function useCompetitors({
  projectId,
  communityName,
}: UseCompetitorsProps): UseCompetitorsReturn {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allItems, setAllItems] = useState<BrawlItem[]>([]);
  const [counts, setCounts] = useState({ on_sale: 0, sold: 0 });

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        const res = projectId
          ? await getCompetitorsBrawlAction(projectId)
          : communityName
            ? await getCompetitorsBrawlByCommunityAction(communityName)
            : { success: false, message: "缺少参数" };

        if (res.success && res.data) {
          setAllItems(res.data.items);
          setCounts(res.data.counts);
        } else {
          setError(res.message || "获取竞品列表失败");
        }
      } catch (e) {
        console.error("加载竞品数据失败:", e);
        setError("加载失败");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [projectId, communityName]);

  return { allItems, counts, loading, error };
}

// 辅助函数：解析户型中的室数
function getRoomCount(layoutStr: string): number {
  const match = layoutStr.match(/^(\d+)室/);
  return match ? parseInt(match[1], 10) : 0;
}

interface UseFilteredItemsProps {
  allItems: BrawlItem[];
  statusFilters: ("on_sale" | "sold")[];
  layoutFilters: string[];
  searchQuery: string;
  sortConfig: SortConfig;
}

export function useFilteredItems({
  allItems,
  statusFilters,
  layoutFilters,
  searchQuery,
  sortConfig,
}: UseFilteredItemsProps): BrawlItem[] {
  return useMemo(() => {
    // 1. 前端过滤
    let items = allItems.filter((item) => {
      // 状态筛选
      let matchStatus = false;
      if (statusFilters.includes("on_sale") && item.status === "on_sale")
        matchStatus = true;
      if (statusFilters.includes("sold") && item.status === "sold")
        matchStatus = true;
      if (!matchStatus) return false;

      // 户型筛选
      if (layoutFilters.length > 0) {
        const roomCount = getRoomCount(item.layout);
        const matchLayout = layoutFilters.some((filter) => {
          if (filter === "4室+") {
            return roomCount >= 4;
          }
          const filterCount = parseInt(filter, 10);
          return roomCount === filterCount;
        });
        if (!matchLayout) return false;
      }

      // 搜索筛选
      if (searchQuery) {
        if (!item.community.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false;
        }
      }

      return true;
    });

    // 2. 排序逻辑
    if (sortConfig.key && sortConfig.direction) {
      items = [...items].sort((a, b) => {
        // 始终优先显示 is_current
        if (a.is_current && !b.is_current) return -1;
        if (!a.is_current && b.is_current) return 1;

        const valA = a[sortConfig.key!];
        const valB = b[sortConfig.key!];

        if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
        if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return items;
  }, [allItems, statusFilters, layoutFilters, searchQuery, sortConfig]);
}
