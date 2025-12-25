
export enum LeadStatus {
  PENDING_ASSESSMENT = 'pending_assessment', // 待评估
  PENDING_VISIT = 'pending_visit',           // 待看房
  REJECTED = 'rejected',                     // 已驳回
  VISITED = 'visited',                       // 已看房
  SIGNED = 'signed',                        // 已签约
}

export type FollowUpMethod = 'phone' | 'wechat' | 'face' | 'visit';

export interface FollowUp {
  id: string;
  leadId: string;
  method: FollowUpMethod;
  content: string;
  followUpTime: string;
  createdBy: string;
}

export interface PriceHistory {
  id: string;
  leadId: string;
  price: number;
  remark?: string;
  recordedAt: string;
  createdByName?: string;
}

export interface Lead {
  id: string;
  communityName: string;
  layout: string;      // e.g., "2室1厅"
  orientation: string; // e.g., "南"
  floorInfo: string;   // e.g., "18/24层"
  area: number;        // in sqm
  totalPrice: number;  // User offer price in 10,000s
  unitPrice: number;   // Calculated or provided
  
  status: LeadStatus;
  evalPrice?: number;  // Operator's evaluated price
  auditReason?: string;
  auditorId?: string;
  auditTime?: string;
  
  images: string[];
  district: string;
  businessArea: string;
  remarks: string;
  creatorName: string;
  lastFollowUpAt?: string;
  createdAt: string;
}

export interface FilterState {
  search: string;
  statuses: LeadStatus[]; // Updated for multi-select
  district: string;       // Updated for fuzzy text
  creator: string;        // New
  layouts: string[];      // New: ['1', '2', '3', '4', '4+']
  floors: string[];       // New: ['低', '中', '高']
}
