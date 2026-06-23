"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { searchCommunitiesAction } from "../../../actions/monitor-lib/competitors";

interface CommunitySearchItem {
  id: string;
  name: string;
}

interface UseCommunitySearchProps {
  existingIds: string[];
  currentCommunityId: string | null;
}

interface UseCommunitySearchReturn {
  searchQuery: string;
  searchResults: CommunitySearchItem[];
  isSearching: boolean;
  setSearchQuery: (value: string) => void;
}

export function useCommunitySearch({
  existingIds,
  currentCommunityId,
}: UseCommunitySearchProps): UseCommunitySearchReturn {
  const [searchQuery, setSearchQuery] = useState("");
  const [rawResults, setRawResults] = useState<CommunitySearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 使用 useMemo 计算过滤后的结果，避免在 render 中同步 setState
  const searchResults = useMemo(() => {
    if (searchQuery.length < 2) return [];
    const existing = new Set(existingIds);
    if (currentCommunityId) existing.add(currentCommunityId);
    return rawResults.filter((c) => !existing.has(c.id));
  }, [rawResults, searchQuery.length, existingIds, currentCommunityId]);

  useEffect(() => {
    // 搜索词太短时，直接清空结果，不发起请求
    if (searchQuery.length < 2) {
      setRawResults([]);
      return;
    }

    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    let isMounted = true;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const result = await searchCommunitiesAction(searchQuery);
        if (isMounted && result.success && result.data) {
          setRawResults(result.data);
        }
      } finally {
        if (isMounted) setIsSearching(false);
      }
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      abortControllerRef.current?.abort();
    };
  }, [searchQuery]);

  return {
    searchQuery,
    searchResults,
    isSearching,
    setSearchQuery,
  };
}
