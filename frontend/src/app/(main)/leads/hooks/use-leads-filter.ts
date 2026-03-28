"use client";

import { useState, useMemo, useTransition, useRef, useCallback } from "react";
import { useDebouncedCallback } from "use-debounce";
import { Lead, FilterState } from "../types";
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

  const { creator, layouts, floors } = filters;
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchCreator =
        !creator ||
        lead.creatorName.toLowerCase().includes(creator.toLowerCase());
      const matchLayout =
        layouts.length === 0 ||
        layouts.includes(getLayoutRooms(lead.layout));
      const matchFloor =
        floors.length === 0 ||
        floors.includes(getFloorCategory(lead.floorInfo));
      return matchCreator && matchLayout && matchFloor;
    });
  }, [leads, creator, layouts, floors, getLayoutRooms, getFloorCategory]);

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
  };
}
