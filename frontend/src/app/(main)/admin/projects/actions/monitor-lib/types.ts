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

/** 竞品肉搏战在售/已售计数. */
export interface BrawlCounts {
  on_sale: number;
  sold: number;
}

/** 后端房源查询参数（已映射为后端语义）. */
export interface BrawlPageParams {
  status: "在售" | "成交" | undefined;
  page: number;
  page_size: number;
  rooms?: string;
  community_name?: string;
  sort_by: string;
  sort_order: "asc" | "desc";
}

/** 单页查询结果. */
export interface BrawlPageResult {
  items: BrawlItem[];
  total: number;
  page: number;
  page_size: number;
}

/** 初始化结果：小区集合 + 计数 + 本项目条目. */
export interface BrawlInitResult {
  communityIds: string[];
  counts: BrawlCounts;
  selfItem: BrawlItem | null;
}
