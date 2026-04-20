"use client";

import { useState, useMemo, useTransition, useRef, useCallback } from "react";
import { useDebouncedCallback } from "use-debounce";
import { Lead, FilterState, LeadStatus } from "../types";
import { getLeadsAction } from "../actions";

export function useLeadsFilter(initialLeads: Lead[]) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [filters, setFiltersState] = useState<FilterState>({
    search: "",
    statuses: [],
    district: "",
    creator: "",
    layouts: [],
    floors: [],
  });
  const [isPending, startTransition] = useTransition();
  const latestFetchIdRef = useRef(0);

  const getFloorCategory = useCallback((floorInfo: string): string => {
    try {
      const match = floorInfo.match(/(\d+)\/(\d+)层/);
      if (!match) return "未知";
      const current = parseInt(match[1]);
      const total = parseInt(match[2]);
      const ratio = current / total;
      if (ratio <= 0.33) return "低";
      if (ratio <= 0.66) return "中";
      return "高";
    } catch {
      return "未知";
    }
  }, []);

  const getLayoutRooms = useCallback((layout: string): string => {
    const match = layout.match(/(\d+)室/);
    if (!match) return "其他";
    const rooms = parseInt(match[1]);
    return rooms >= 5 ? "4+" : rooms.toString();
  }, []);

  const debouncedRefetch = useDebouncedCallback((nextFilters: FilterState) => {
    const fetchId = ++latestFetchIdRef.current;
    startTransition(async () => {
      const data = await getLeadsAction(nextFilters);
      if (latestFetchIdRef.current !== fetchId) return;
      setLeads(data);
    });
  }, 300);

  const setFilters = useCallback((
    action: React.SetStateAction<FilterState>
  ) => {
    setFiltersState((prevFilters) => {
      const newFilters =
        typeof action === "function" ? action(prevFilters) : action;

      const serverFiltersChanged =
        newFilters.search !== prevFilters.search ||
        JSON.stringify(newFilters.statuses) !==
          JSON.stringify(prevFilters.statuses) ||
        newFilters.district !== prevFilters.district;

      if (serverFiltersChanged) {
        debouncedRefetch(newFilters);
      }

      return newFilters;
    });
  }, [debouncedRefetch]);

  /**
   * 统一的客户端过滤逻辑
   * 将之前分散在 leads-view.tsx 中的 activeTab 和 searchQuery 过滤整合到这里
   * 消除双重过滤问题
   */
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      // 搜索过滤 - 支持小区名称、区域、商圈
      const searchLower = filters.search.toLowerCase().trim();
      const searchMatch =
        !searchLower ||
        lead.communityName?.toLowerCase().includes(searchLower) ||
        lead.district?.toLowerCase().includes(searchLower) ||
        lead.businessArea?.toLowerCase().includes(searchLower);

      // 状态过滤 - 支持多选状态（从原 activeTab 逻辑迁移）
      const statusMatch =
        filters.statuses.length === 0 ||
        filters.statuses.includes(lead.status);

      // 创建者过滤
      const creatorMatch =
        !filters.creator ||
        lead.creatorName.toLowerCase().includes(filters.creator.toLowerCase());

      // 户型过滤
      const layoutMatch =
        filters.layouts.length === 0 ||
        filters.layouts.includes(getLayoutRooms(lead.layout));

      // 楼层过滤
      const floorMatch =
        filters.floors.length === 0 ||
        filters.floors.includes(getFloorCategory(lead.floorInfo));

      return searchMatch && statusMatch && creatorMatch && layoutMatch && floorMatch;
    });
  }, [leads, filters, getLayoutRooms, getFloorCategory]);

  /**
   * 设置活动 Tab（状态过滤）
   * 提供向后兼容的接口，将单选状态转换为多选状态数组
   */
  const setActiveTab = useCallback((tabValue: string) => {
    setFiltersState((prev) => {
      const newStatuses = tabValue === "all" ? [] : [tabValue as LeadStatus];
      const newFilters = { ...prev, statuses: newStatuses };
      
      // 检查是否需要触发服务端重新获取
      const serverFiltersChanged =
        JSON.stringify(newStatuses) !== JSON.stringify(prev.statuses);

      if (serverFiltersChanged) {
        debouncedRefetch(newFilters);
      }

      return newFilters;
    });
  }, [debouncedRefetch]);

  /**
   * 获取当前活动 Tab 值
   */
  const activeTab = useMemo(() => {
    return filters.statuses.length === 0 ? "all" : filters.statuses[0];
  }, [filters.statuses]);

  /**
   * 设置搜索查询
   * 提供向后兼容的接口
   */
  const setSearchQuery = useCallback((query: string) => {
    setFiltersState((prev) => {
      const newFilters = { ...prev, search: query };
      
      // 搜索改变需要触发服务端重新获取
      if (query !== prev.search) {
        debouncedRefetch(newFilters);
      }

      return newFilters;
    });
  }, [debouncedRefetch]);

  /**
   * 获取当前搜索查询
   */
  const searchQuery = useMemo(() => filters.search, [filters.search]);

  const resetFilters = useCallback(() => {
    const resetFilters: FilterState = {
      search: "",
      statuses: [],
      district: "",
      creator: "",
      layouts: [],
      floors: [],
    };
    setFiltersState(resetFilters);
    debouncedRefetch.cancel();
    startTransition(async () => {
      const data = await getLeadsAction(resetFilters);
      setLeads(data);
    });
  }, [debouncedRefetch]);

  const refreshLeads = useCallback(async () => {
    const data = await getLeadsAction(filters);
    setLeads(data);
  }, [filters]);

  return {
    leads,
    setLeads,
    filters,
    setFilters,
    filteredLeads,
    isPending,
    resetFilters,
    refreshLeads,
    // 提供向后兼容的接口
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
  };
}
