"use client";

import { useState, useEffect } from "react";
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
  const [searchResults, setSearchResults] = useState<CommunitySearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    let isMounted = true;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const result = await searchCommunitiesAction(searchQuery);
      if (isMounted && result.success && result.data) {
        const existing = new Set(existingIds);
        if (currentCommunityId) existing.add(currentCommunityId);
        setSearchResults(result.data.filter((c) => !existing.has(c.id)));
      }
      if (isMounted) setIsSearching(false);
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [searchQuery, existingIds, currentCommunityId]);

  return {
    searchQuery,
    searchResults,
    isSearching,
    setSearchQuery,
  };
}
