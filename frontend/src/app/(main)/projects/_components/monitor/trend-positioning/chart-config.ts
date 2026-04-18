"use client";

import type { TrendData } from "../../../actions/monitor-lib/types";

export interface PriceRange {
  min: number;
  max: number;
}

export function calculatePriceRange(
  data: TrendData[],
  myPricing: number
): PriceRange {
  const allPrices = [
    ...data.map((d) => d.listing_price),
    ...data.map((d) => d.deal_price),
    myPricing > 0 ? myPricing : 0,
  ].filter((p) => p > 0);

  const minPrice =
    allPrices.length > 0
      ? Math.floor((Math.min(...allPrices) * 0.9) / 1000) * 1000
      : 30000;
  const maxPrice =
    allPrices.length > 0
      ? Math.ceil((Math.max(...allPrices) * 1.1) / 1000) * 1000
      : 45000;

  return { min: minPrice, max: maxPrice };
}

export function calculateRiskPercent(
  data: TrendData[],
  myPricing: number
): string {
  const latestDealPrice = data.length > 0 ? data[data.length - 1].deal_price : 0;
  return latestDealPrice > 0 && myPricing > 0
    ? (((myPricing - latestDealPrice) / latestDealPrice) * 100).toFixed(1)
    : "0.0";
}
