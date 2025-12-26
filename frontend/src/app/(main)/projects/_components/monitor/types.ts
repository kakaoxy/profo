export interface FloorStats {
  floor_type: "high" | "medium" | "low";
  count: number;
  average_price: number;
  unit_price: number;
}

export interface MarketSentimentData {
  last_12_months_deal: FloorStats[];
  current_listing: FloorStats[];
  pressure_index: {
    inventory_months: number;
    label: string;
    is_buyer_market: boolean;
  };
}

export interface CompetitorItem {
  id: string;
  community_name: string;
  listing_count: number;
  listing_avg_price: number;
  deal_count: number;
  deal_avg_price: number;
  spread: number; // Price deviation from current project
  is_current_project?: boolean;
}

export interface NeighborhoodRadarData {
  competitors: CompetitorItem[];
}

export interface TrendPoint {
  month: string;
  listing_price: number;
  deal_price: number;
  deal_volume: number;
}

export interface MonitorData {
  projectId: string;
  projectName: string;
  hero: {
    id: string;
    layout: string;
    area: number;
    signing_price: number;
    listing_price: number;
    rent_free_period: {
      total_days: number;
      consumed_days: number;
      remaining_days: number;
      daily_loss: number;
      monthly_loss: number;
    };
  };
  sentiment: MarketSentimentData;
  radar: NeighborhoodRadarData;
  trend: TrendPoint[];
}

export interface ProjectData {
  address: string | null;
  community_name: string | null;
  area: number | null;
  signing_price: number | null;
  list_price: number | null;
  signing_date: string | null;
  signing_period: number | null; // 免租期（天数）
  extensionPeriod: number | null; // 顺延期（月）
  extensionRent: number | null; // 顺延期租金（元/月）
}
