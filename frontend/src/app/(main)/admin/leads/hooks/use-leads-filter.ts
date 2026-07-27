"use client";

import { useState, useMemo, useCallback } from "react";
import { useDebouncedCallback } from "use-debounce";
import { useRouter, useSearchParams } from "next/navigation";
import { Lead, FilterState, LeadTabValue } from "../types";

/** 解析楼层信息，返回"低"/"中"/"高"/"未知" */
export function getFloorCategory(floorInfo: string): string {
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
}

/** 解析户型信息，返回房间数分类 */
export function getLayoutRooms(layout: string): string {
  const match = layout.match(/(\d+)室/);
  if (!match) return "其他";
  const rooms = parseInt(match[1]);
  return rooms >= 5 ? "4+" : rooms.toString();
}

/**
 * 线索过滤 Hook。
 *
 * 服务端筛选（search/statuses/district）通过 URL searchParams 驱动，
 * 变化时更新 URL 并重置到第 1 页，由 RSC 重新拉取数据。
 * 客户端筛选（layouts/floors/creator）仅对当前页数据做内存过滤。
 */
export function useLeadsFilter(initialLeads: Lead[]) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 客户端筛选状态（layouts/floors/creator，目前无 UI 暴露）
  const [filters, setFiltersState] = useState<FilterState>({
    search: "",
    statuses: [],
    district: "",
    creator: "",
    layouts: [],
    floors: [],
  });

  // 服务端筛选状态从 URL 读取
  const searchQuery = searchParams.get("search") || "";
  const statusesParam = searchParams.get("statuses") || "";
  const creatorId = searchParams.get("creator_id") || "";
  const activeTab: LeadTabValue = statusesParam
    ? (statusesParam.split(",")[0] as LeadTabValue)
    : "all";

  /** 更新 URL 参数，过滤条件变化时重置到第 1 页 */
  const updateUrlParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === "" || value === "all") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });
      params.set("page", "1");
      router.push(`/admin/leads?${params.toString()}`);
    },
    [searchParams, router],
  );

  /** 搜索输入防抖更新 URL */
  const debouncedSearchUpdate = useDebouncedCallback((search: string) => {
    updateUrlParams({ search: search || undefined });
  }, 300);

  // 本地输入状态与 URL 解耦：输入框绑定本地状态，保证中文输入法（IME）
  // 的复合过程不会被 URL 驱动的重新渲染打断；URL 仅在停止输入后防抖更新，
  // 用于服务端筛选与分页。
  const [searchInput, setSearchInput] = useState(searchQuery);
  const [prevUrlSearch, setPrevUrlSearch] = useState(searchQuery);

  // 当 URL（外部变化：重置筛选、浏览器导航、深链替换等）与本地上一次记录的
  // URL 值不一致时，把本地输入同步回 URL 值。采用渲染期状态调整（React
  // 推荐写法）而非 effect，避免级联渲染。当存在未提交的防抖更新时跳过，
  // 以免覆盖正在输入的内容。
  if (searchQuery !== prevUrlSearch) {
    setPrevUrlSearch(searchQuery);
    if (!debouncedSearchUpdate.isPending()) {
      setSearchInput(searchQuery);
    }
  }

  const setSearchQuery = useCallback(
    (query: string) => {
      setSearchInput(query);
      debouncedSearchUpdate(query);
    },
    [debouncedSearchUpdate],
  );

  const setActiveTab = useCallback(
    (tabValue: LeadTabValue) => {
      updateUrlParams({ statuses: tabValue === "all" ? undefined : tabValue });
    },
    [updateUrlParams],
  );

  /** 清除创建人筛选（移除 URL 中的 creator_id 参数） */
  const clearCreatorId = useCallback(() => {
    updateUrlParams({ creator_id: undefined });
  }, [updateUrlParams]);

  /** 客户端过滤（仅 layouts/floors/creator，search/statuses/district 已由服务端处理） */
  const filteredLeads = useMemo(() => {
    return initialLeads.filter((lead) => {
      const creatorMatch =
        !filters.creator ||
        lead.creatorName.toLowerCase().includes(filters.creator.toLowerCase());
      const layoutMatch =
        filters.layouts.length === 0 ||
        filters.layouts.includes(getLayoutRooms(lead.layout));
      const floorMatch =
        filters.floors.length === 0 ||
        filters.floors.includes(getFloorCategory(lead.floorInfo));
      return creatorMatch && layoutMatch && floorMatch;
    });
  }, [initialLeads, filters]);

  const resetFilters = useCallback(() => {
    setFiltersState({
      search: "",
      statuses: [],
      district: "",
      creator: "",
      layouts: [],
      floors: [],
    });
    debouncedSearchUpdate.cancel();
    setSearchInput("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("search");
    params.delete("statuses");
    params.delete("district");
    params.delete("creator_id");
    params.set("page", "1");
    router.push(`/admin/leads?${params.toString()}`);
  }, [searchParams, router, debouncedSearchUpdate]);

  /** 变更后刷新（add/edit/delete/audit 等） */
  const refreshLeads = useCallback(() => {
    router.refresh();
  }, [router]);

  return {
    leads: initialLeads,
    filteredLeads,
    filters,
    setFilters: setFiltersState,
    resetFilters,
    refreshLeads,
    activeTab,
    setActiveTab,
    searchQuery: searchInput,
    setSearchQuery,
    creatorId,
    clearCreatorId,
  };
}
