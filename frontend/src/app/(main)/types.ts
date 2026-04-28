export interface ProjectStats {
  viewTotal: number;
  viewTrend: {
    current: number;
    last: number;
    isUp: boolean;
  };
  offerCount: number;
  maxOffer: number;
  lastOffer: number;
}

export interface MarketData {
  onSale: number;
  avgPrice: string;
  volume30d: number;
  priceTrend30d: string;
  isPriceUp: boolean | null;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  location: string;
  specs: string;
  stats: ProjectStats;
  market: MarketData;
}

export interface DashboardLead {
  id: string;
  community: string;
  unitType: string;
  area: string;
  floor: string;
  totalPrice: string;
  unitPrice: string;
  status: string;
  region: string;
  creator: string;
  updatedTime: string;
}

export interface FunnelData {
  total: number;
  evaluating: number;
  visiting: number;
  signed: number;
}
