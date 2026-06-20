"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  getCompetitorsBrawlInitAction,
  getCompetitorsBrawlPageAction,
} from "../../../actions/monitor-lib/brawl";
import type {
  BrawlCounts,
  BrawlItem,
  BrawlPageParams,
} from "../../../actions/monitor-lib/types";
import type { SortConfig } from "./types";

const DEFAULT_PAGE_SIZE = 10;
const DEBOUNCE_MS = 400;

interface UseCompetitorsProps {
  projectId?: string;
  communityId?: string;
}

interface UseCompetitorsReturn {
  // 数据
  counts: BrawlCounts;
  displayItems: BrawlItem[];
  total: number;
  totalPages: number;
  initLoading: boolean;
  pageLoading: boolean;
  error: string | null;
  // 筛选状态
  statusFilters: ("on_sale" | "sold")[];
  layoutFilters: string[];
  searchQuery: string;
  sortConfig: SortConfig;
  // 分页状态
  page: number;
  pageSize: number;
  // 处理函数
  toggleStatus: (status: "on_sale" | "sold") => void;
  toggleLayout: (layout: string) => void;
  setSearch: (value: string) => void;
  handleSort: (key: "total" | "unit") => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
}

/** 将前端状态筛选映射为后端 status 参数. */
function buildStatusParam(
  statusFilters: ("on_sale" | "sold")[],
): "在售" | "成交" | undefined {
  const hasOnSale = statusFilters.includes("on_sale");
  const hasSold = statusFilters.includes("sold");
  if (hasOnSale && hasSold) return undefined; // 两者都选 → 不过滤（含过期）
  if (hasOnSale) return "在售";
  if (hasSold) return "成交";
  return undefined;
}

/** 将前端户型筛选映射为后端 rooms 参数（逗号分隔的室数列表）. */
function buildRoomsParam(layoutFilters: string[]): string | undefined {
  if (layoutFilters.length === 0) return undefined;
  const roomCounts: number[] = [];
  for (const filter of layoutFilters) {
    if (filter === "4室+") {
      // 4室+ 枚举为 4..10，用 IN 查询保留 OR 语义
      roomCounts.push(4, 5, 6, 7, 8, 9, 10);
    } else {
      const count = parseInt(filter, 10);
      if (!Number.isNaN(count)) roomCounts.push(count);
    }
  }
  if (roomCounts.length === 0) return undefined;
  const unique = Array.from(new Set(roomCounts)).sort((a, b) => a - b);
  return unique.join(",");
}

/** 将前端排序配置映射为后端 sort_by/sort_order 参数. */
function buildSortParam(
  sortConfig: SortConfig,
): { sort_by: string; sort_order: "asc" | "desc" } {
  if (sortConfig.key && sortConfig.direction) {
    const sort_by = sortConfig.key === "total" ? "total_price" : "unit_price";
    return { sort_by, sort_order: sortConfig.direction };
  }
  // 默认：按时间线降序（最新在前）
  return { sort_by: "timeline", sort_order: "desc" };
}

export function useCompetitors({
  projectId,
  communityId,
}: UseCompetitorsProps): UseCompetitorsReturn {
  // 初始化数据
  const [communityIds, setCommunityIds] = useState<string[]>([]);
  const [counts, setCounts] = useState<BrawlCounts>({ on_sale: 0, sold: 0 });
  const [selfItem, setSelfItem] = useState<BrawlItem | null>(null);

  // 分页数据
  const [items, setItems] = useState<BrawlItem[]>([]);
  const [total, setTotal] = useState(0);

  // 筛选状态
  const [statusFilters, setStatusFilters] = useState<("on_sale" | "sold")[]>([
    "on_sale",
  ]);
  const [layoutFilters, setLayoutFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: null,
    direction: null,
  });

  // 分页状态
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // 加载/错误状态
  const [initLoading, setInitLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- 初始化 effect：projectId/communityId 变化时执行一次 ---
  useEffect(() => {
    let cancelled = false;
    async function init(): Promise<void> {
      // 重置所有状态，避免旧数据闪现
      setCommunityIds([]);
      setCounts({ on_sale: 0, sold: 0 });
      setSelfItem(null);
      setStatusFilters(["on_sale"]);
      setLayoutFilters([]);
      setSearchQuery("");
      setDebouncedSearch("");
      setSortConfig({ key: null, direction: null });
      setPage(1);
      setPageSize(DEFAULT_PAGE_SIZE);
      setItems([]);
      setTotal(0);
      setError(null);
      setPageLoading(false);

      if (!projectId && !communityId) {
        setInitLoading(false);
        setError("缺少必要参数");
        return;
      }

      setInitLoading(true);
      const scope = projectId
        ? { projectId }
        : { communityId: communityId! };
      const res = await getCompetitorsBrawlInitAction(scope);
      if (cancelled) return;
      if (res.success) {
        setCommunityIds(res.data.communityIds);
        setCounts(res.data.counts);
        setSelfItem(res.data.selfItem);
      } else {
        setError(res.message);
      }
      setInitLoading(false);
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [projectId, communityId]);

  // --- 搜索防抖 effect ---
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // --- 分页查询 effect：筛选/分页/搜索变化时按需加载 ---
  useEffect(() => {
    let cancelled = false;
    async function fetchPage(): Promise<void> {
      if (communityIds.length === 0) {
        setItems([]);
        setTotal(0);
        setPageLoading(false);
        return;
      }
      setPageLoading(true);
      setError(null);
      const { sort_by, sort_order } = buildSortParam(sortConfig);
      const params: BrawlPageParams = {
        status: buildStatusParam(statusFilters),
        page,
        page_size: pageSize,
        rooms: buildRoomsParam(layoutFilters),
        community_name: debouncedSearch || undefined,
        sort_by,
        sort_order,
      };
      const res = await getCompetitorsBrawlPageAction(communityIds, params);
      if (cancelled) return;
      if (res.success) {
        setItems(res.data.items);
        setTotal(res.data.total);
        // 当前页超出总页数时重置到第1页
        const tp = Math.ceil(res.data.total / pageSize) || 1;
        if (page > tp) {
          setPage(1);
        }
      } else {
        setError(res.message);
        setItems([]);
        setTotal(0);
      }
      setPageLoading(false);
    }
    fetchPage();
    return () => {
      cancelled = true;
    };
  }, [
    communityIds,
    page,
    pageSize,
    statusFilters,
    layoutFilters,
    debouncedSearch,
    sortConfig,
  ]);

  // --- 派生值 ---
  const totalPages = useMemo(
    () => Math.ceil(total / pageSize) || 1,
    [total, pageSize],
  );

  const displayItems = useMemo(() => {
    // 第1页且筛选含在售时，前置"本项目"对照条目
    if (page === 1 && selfItem && statusFilters.includes("on_sale")) {
      return [selfItem, ...items];
    }
    return items;
  }, [page, selfItem, statusFilters, items]);

  // --- 处理函数：筛选变化时同步重置页码 ---
  const toggleStatus = useCallback((status: "on_sale" | "sold") => {
    setStatusFilters((prev) => {
      if (prev.includes(status)) {
        if (prev.length === 1) return prev; // 阻止取消最后一个
        return prev.filter((s) => s !== status);
      }
      return [...prev, status];
    });
    setPage(1);
  }, []);

  const toggleLayout = useCallback((layout: string) => {
    setLayoutFilters((prev) =>
      prev.includes(layout)
        ? prev.filter((l) => l !== layout)
        : [...prev, layout],
    );
    setPage(1);
  }, []);

  const setSearch = useCallback((value: string) => {
    setSearchQuery(value);
    setPage(1);
  }, []);

  const handleSort = useCallback((key: "total" | "unit") => {
    setSortConfig((current) => {
      if (current.key === key) {
        if (current.direction === "asc") return { key, direction: "desc" };
        if (current.direction === "desc")
          return { key: null, direction: null };
        return { key, direction: "asc" };
      }
      return { key, direction: "asc" };
    });
    setPage(1);
  }, []);

  const handleSetPage = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const handleSetPageSize = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
  }, []);

  return {
    counts,
    displayItems,
    total,
    totalPages,
    initLoading,
    pageLoading,
    error,
    statusFilters,
    layoutFilters,
    searchQuery,
    sortConfig,
    page,
    pageSize,
    toggleStatus,
    toggleLayout,
    setSearch,
    handleSort,
    setPage: handleSetPage,
    setPageSize: handleSetPageSize,
  };
}
