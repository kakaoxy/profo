"use client";

import type { NeighborhoodRadarItem } from "../../../actions/monitor-lib/types";

export function getSpreadStyle(item: NeighborhoodRadarItem): string {
  if (item.is_subject) return "text-muted-foreground";
  if (item.spread_percent > 0) return "text-primary";
  if (item.spread_percent < 0) return "text-rose-500";
  return "text-muted-foreground";
}

export function getSpreadIcon(item: NeighborhoodRadarItem): string {
  if (item.is_subject) return "";
  if (item.spread_percent > 0) return "🔵 ";
  if (item.spread_percent < 0) return "🔴 ";
  return "";
}
