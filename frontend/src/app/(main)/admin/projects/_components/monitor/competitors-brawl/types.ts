"use client";

export interface CompetitorFilters {
  statusFilters: ("on_sale" | "sold")[];
  layoutFilters: string[];
  searchQuery: string;
}

export interface SortConfig {
  key: "total" | "unit" | null;
  direction: "asc" | "desc" | null;
}
