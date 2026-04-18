"use client";

import type { NeighborhoodRadarItem } from "../../../actions/monitor-lib/types";

export function getSpreadStyle(item: NeighborhoodRadarItem): string {
  if (item.is_subject) return "text-slate-400";
  if (item.spread_percent > 0) return "text-blue-500";
  if (item.spread_percent < 0) return "text-rose-500";
  return "text-slate-400";
}

export function getSpreadIcon(item: NeighborhoodRadarItem): string {
  if (item.is_subject) return "";
  if (item.spread_percent > 0) return "🔵 ";
  if (item.spread_percent < 0) return "🔴 ";
  return "";
}
