"use client";

import { useState, useCallback } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "../section-header";
import { FilterBar } from "./filter-bar";
import { CompetitorsTable } from "./competitors-table";
import { CompetitorsCard } from "./competitors-card";
import { useCompetitors, useFilteredItems } from "./use-competitors";
import type { SortConfig } from "./types";

interface CompetitorsBrawlProps {
  projectId?: string;
  communityName?: string;
}

export function CompetitorsBrawl({
  projectId,
  communityName,
}: CompetitorsBrawlProps) {
  const [statusFilters, setStatusFilters] = useState<("on_sale" | "sold")[]>([
    "on_sale",
  ]);
  const [layoutFilters, setLayoutFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: null,
    direction: null,
  });

  const { allItems, counts, loading, error } = useCompetitors({
    projectId,
    communityName,
  });

  const filteredItems = useFilteredItems({
    allItems,
    statusFilters,
    layoutFilters,
    searchQuery,
    sortConfig,
  });

  const toggleFilter = useCallback((status: "on_sale" | "sold") => {
    setStatusFilters((prev) => {
      if (prev.includes(status)) {
        if (prev.length === 1) return prev;
        return prev.filter((s) => s !== status);
      }
      return [...prev, status];
    });
  }, []);

  const toggleLayoutFilter = useCallback((layout: string) => {
    setLayoutFilters((prev) => {
      if (prev.includes(layout)) {
        return prev.filter((l) => l !== layout);
      }
      return [...prev, layout];
    });
  }, []);

  const handleSort = useCallback((key: "total" | "unit") => {
    setSortConfig((current) => {
      if (current.key === key) {
        if (current.direction === "asc") return { key, direction: "desc" };
        if (current.direction === "desc") return { key: null, direction: null };
        return { key, direction: "asc" };
      }
      return { key, direction: "asc" };
    });
  }, []);

  return (
    <section className="mt-8 pb-10">
      <SectionHeader
        index="4"
        title="竞品肉搏战 (明细对比)"
        subtitle="Direct Competitors Brawl"
      />

      <div className="px-6 space-y-4">
        <FilterBar
          statusFilters={statusFilters}
          layoutFilters={layoutFilters}
          searchQuery={searchQuery}
          counts={counts}
          onToggleStatus={toggleFilter}
          onToggleLayout={toggleLayoutFilter}
          onSearchChange={setSearchQuery}
        />

        <Card className="border-slate-100 shadow-sm overflow-x-auto bg-white min-h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-40 text-red-500">
              <AlertCircle className="h-6 w-6 mb-2" />
              <span className="text-sm">{error}</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
              暂无数据
            </div>
          ) : (
            <>
              <CompetitorsCard items={filteredItems} />
              <CompetitorsTable
                items={filteredItems}
                sortConfig={sortConfig}
                onSort={handleSort}
              />
            </>
          )}
        </Card>
      </div>
    </section>
  );
}
