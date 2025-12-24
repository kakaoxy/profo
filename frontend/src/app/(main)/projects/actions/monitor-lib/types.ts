export interface FloorStats {
  type: string; // high, mid, low
  deals_count: number;
  deal_avg_price: number;
  current_count: number;
  current_avg_price: number;
}

export interface MarketSentimentData {
  floor_stats: FloorStats[];
  inventory_months: number;
}

export interface CommunityItem {
  id: number;
  name: string;
}

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

export interface TrendData {
  month: string;
  listing_price: number;
  deal_price: number;
  volume: number;
}

export interface NeighborhoodRadarItem {
  community_id: number;
  community_name: string;
  is_subject: boolean;
  listing_count: number;
  listing_beike: number;
  listing_iaij: number;
  listing_avg_price: number;
  deal_count: number;
  deal_beike: number;
  deal_iaij: number;
  deal_avg_price: number;
  spread_percent: number;
  spread_label: string;
}

export interface NeighborhoodRadarData {
  items: NeighborhoodRadarItem[];
}

export interface CompetitorItem {
  community_id: number;
  community_name: string;
  avg_price: number;
  on_sale_count: number;
}
