"use client";

import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import type { SortConfig } from "./types";

interface SortIconProps {
  column: "total" | "unit";
  sortConfig: SortConfig;
}

export function SortIcon({ column, sortConfig }: SortIconProps) {
  if (sortConfig.key !== column)
    return <ArrowUpDown className="ml-1 h-3 w-3 text-slate-300" />;
  if (sortConfig.direction === "asc")
    return <ArrowUp className="ml-1 h-3 w-3 text-indigo-600" />;
  return <ArrowDown className="ml-1 h-3 w-3 text-indigo-600" />;
}
