
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
  followedAt?: string; // raw ISO，用于轨迹按时间排序
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

export interface EvalHistory {
  id: string;
  leadId: string;
  evalPrice: number;
  remark?: string;
  evaluatorId: string;
  evaluatorName?: string;
  evaluatedAt: string;
}

export interface Lead {
  id: string;
  communityName: string;
  communityId?: string;  // 关联小区ID
  layout: string;      // e.g., "2室1厅"
  orientation: string; // e.g., "南"
  floorInfo: string;   // e.g., "18/24层"
  area: number;        // in sqm
  totalPrice: number;  // User offer price in 10,000s
  unitPrice: number;   // Calculated or provided

  status: LeadStatus;
  evalPrice?: number;  // Operator's evaluated price
  expectedPrice?: number;  // 业主心理预期价（万）
  evalHistories?: EvalHistory[];  // 评估历史（可选，详情接口返回）
  auditReason?: string;
  auditorId?: string;
  auditTime?: string;
  updatedAt?: string; // raw ISO，audit_time 为空时回退用于排序与显示

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

/**
 * Tab 值类型
 * "all" 表示显示所有状态的线索
 * LeadStatus 表示特定状态的线索
 */
export type LeadTabValue = "all" | LeadStatus;
