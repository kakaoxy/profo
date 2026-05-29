"use client";

import { useState, useRef, useEffect } from "react";
import { Search } from "lucide-react";
import useSWR from "swr";
import { useDebouncedCallback } from "use-debounce";
import { useMounted } from "@/hooks/use-mounted";

interface Community {
  id: string;
  name: string;
  district: string | null;
  business_circle: string | null;
}

interface CommunitySearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (community: Community) => void;
}

export function CommunitySearchInput({ value, onChange, onSelect }: CommunitySearchInputProps) {
  const mounted = useMounted();
  const [query, setQuery] = useState(value);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const debouncedSetQuery = useDebouncedCallback((val: string) => {
    setQuery(val);
  }, 300);

  const { data } = useSWR<{ items: Community[] }>(
    mounted && query.trim().length >= 1 ? `/api/v1/public/communities/search?q=${encodeURIComponent(query.trim())}` : null,
    (url: string) => fetch(url).then((r) => r.json())
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    debouncedSetQuery(val);
    setShowDropdown(true);
  };

  const handleSelect = (community: Community) => {
    onChange(community.name);
    setQuery(community.name);
    setShowDropdown(false);
    onSelect(community);
  };

  return (
    <div ref={containerRef} className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-c-text-secondary" />
      <input
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={() => setShowDropdown(true)}
        placeholder="请输入小区名称"
        className="w-full h-12 pl-10 pr-4 rounded-lg border border-c-border-subtle bg-white text-sm text-c-text-primary placeholder:text-c-text-secondary focus:outline-none focus:ring-2 focus:ring-c-trust-blue/10 focus:border-c-trust-blue/30 transition-all"
      />
      {showDropdown && data?.items && data.items.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-lg border border-c-border-subtle bg-white shadow-lg max-h-60 overflow-auto">
          {data.items.map((community) => (
            <li
              key={community.id}
              onMouseDown={() => handleSelect(community)}
              className="px-4 py-3 hover:bg-c-surface cursor-pointer border-b border-c-border-subtle last:border-b-0"
            >
              <span className="text-sm font-medium text-c-text-primary">{community.name}</span>
              <span className="ml-2 text-xs text-c-text-secondary">
                {[community.district, community.business_circle].filter(Boolean).join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
