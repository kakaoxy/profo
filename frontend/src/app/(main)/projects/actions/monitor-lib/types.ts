import { components } from "@/lib/api-types";

export type FloorStats = components["schemas"]["FloorStats"];
export type MarketSentimentData = components["schemas"]["MarketSentimentResponse"];
export type CommunityItem = components["schemas"]["CommunityResponse"];
export type TrendData = components["schemas"]["TrendData"];
export type NeighborhoodRadarItem = components["schemas"]["NeighborhoodRadarItem"];
export type NeighborhoodRadarData = components["schemas"]["NeighborhoodRadarResponse"];
export type CompetitorItem = components["schemas"]["CompetitorResponse"];
export type PropertyItem = components["schemas"]["PropertyResponse"];

// Frontend View Models (not directly from API)
export interface BrawlItem {
  id: string;
  community: string;
  status: string; // 'on_sale' | 'sold'
  display_status?: string; // 原本的中文状态 '在售' | '成交' | '挂牌'
  layout: string;
  floor: string;
  area: number;
  total: number;
  unit: number;
  date: string;
  source: string;
  is_current?: boolean;
}

export interface BrawlData {
  items: BrawlItem[];
  counts: {
    on_sale: number;
    sold: number;
  };
}
