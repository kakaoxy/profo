"use server";

import { getMarketSentimentByCommunityAction as getProjectMarketSentimentByCommunityAction } from "../../projects/actions/monitor-lib/sentiment";

export interface FloorStats {
  type: string;
  dealsCount: number;
  dealAvgPrice: number;
  currentCount: number;
  currentAvgPrice: number;
}

export interface MarketSentiment {
  floorStats: FloorStats[];
  inventoryMonths: number;
  totalListingCount: number;
  totalDealsCount: number;
}

export async function getMarketSentimentAction(
  communityName: string,
): Promise<MarketSentiment | null> {
  const result =
    await getProjectMarketSentimentByCommunityAction(communityName);
  if (!result.success || !result.data) return null;

  const floorStats = (result.data.floor_stats || []).map((s) => ({
    type: s.type,
    dealsCount: s.deals_count || 0,
    dealAvgPrice: s.deal_avg_price || 0,
    currentCount: s.current_count || 0,
    currentAvgPrice: s.current_avg_price || 0,
  }));

  const totalListingCount = floorStats.reduce(
    (sum, s) => sum + s.currentCount,
    0,
  );
  const totalDealsCount = floorStats.reduce(
    (sum, s) => sum + s.dealsCount,
    0,
  );

  return {
    floorStats,
    inventoryMonths: result.data.inventory_months || 0,
    totalListingCount,
    totalDealsCount,
  };
}
