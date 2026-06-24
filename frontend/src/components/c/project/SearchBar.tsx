"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import useSWR from "swr";
import { useDebouncedCallback } from "use-debounce";
import { Search, MapPin, Loader2 } from "lucide-react";
import { useMounted } from "@/hooks/use-mounted";

interface SearchBarProps {
  onSearchChange: (value: string) => void;
}

interface CommunitySuggestion {
  id: string;
  name: string;
  district: string;
  business_circle: string;
}

export function SearchBar({ onSearchChange }: SearchBarProps) {
  const mounted = useMounted();
  const [inputValue, setInputValue] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedSetQuery = useDebouncedCallback((value: string) => {
    setDebouncedQuery(value);
  }, 300);

  const debouncedSearch = useDebouncedCallback((value: string) => {
    onSearchChange(value);
  }, 300);

  const { data: suggestions, isLoading } = useSWR<CommunitySuggestion[]>(
    mounted && debouncedQuery.trim()
      ? `/api/v1/public/communities/search?q=${encodeURIComponent(debouncedQuery.trim())}&limit=5`
      : null
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setInputValue(value);
      debouncedSetQuery(value);
      debouncedSearch(value);
      setIsDropdownOpen(value.trim().length > 0);
    },
    [debouncedSetQuery, debouncedSearch]
  );

  const handleSuggestionClick = useCallback(
    (suggestion: CommunitySuggestion) => {
      setInputValue(suggestion.name);
      setDebouncedQuery("");
      setIsDropdownOpen(false);
      onSearchChange(suggestion.name);
      inputRef.current?.focus();
    },
    [onSearchChange]
  );

  const handleFocus = useCallback(() => {
    if (inputValue.trim().length > 0) {
      setIsDropdownOpen(true);
    }
  }, [inputValue]);

  const showDropdown =
    isDropdownOpen && inputValue.trim().length > 0;

  return (
    <div ref={containerRef} className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-graphite" />
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        placeholder="搜索小区名..."
        onChange={handleChange}
        onFocus={handleFocus}
        className="w-full h-12 pl-10 pr-4 rounded-inputs border border-dove/30 bg-white text-sm text-ink placeholder:text-graphite focus:outline-none focus:ring-2 focus:ring-rust/10 focus:border-rust/30 transition-all"
      />

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 rounded-inputs border border-dove/30 bg-white shadow-steep z-50 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 px-4 py-3 text-sm text-graphite">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>搜索中...</span>
            </div>
          ) : suggestions && suggestions.length > 0 ? (
            <ul>
              {suggestions.map((suggestion) => (
                <li key={suggestion.id}>
                  <button
                    type="button"
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-fog transition-colors"
                  >
                    <MapPin className="h-4 w-4 shrink-0 text-graphite" />
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-ink truncate block">
                        {suggestion.name}
                      </span>
                      <span className="text-xs text-graphite truncate block">
                        {suggestion.district} · {suggestion.business_circle}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-3 text-sm text-graphite text-center">
              未找到相关小区
            </div>
          )}
        </div>
      )}
    </div>
  );
}
