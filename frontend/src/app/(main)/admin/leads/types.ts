export enum LeadStatus {
  PENDING_ASSESSMENT = "pending_assessment", // 待评估
  PENDING_VISIT = "pending_visit", // 待看房
  REJECTED = "rejected", // 已放弃
  VISITED = "visited", // 已看房
  SIGNED = "signed", // 已签约
  LOST_TO_COMPETITOR = "lost_to_competitor", // 他司已成交
}

export type FollowUpMethod = "phone" | "wechat" | "face" | "visit";

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
  /** 房源条件分 1-5（存量记录为 undefined，UI 渲染「未评分」） */
  conditionScore?: number;
  /** 装修后预计可售天数 1-365（存量记录为 undefined，UI 渲染「周期待补」） */
  expectedSaleDays?: number;
  remark?: string;
  evaluatorId: string;
  evaluatorName?: string;
  /** 评估人手机号（脱敏）；真实号不进列表，拨号走独立端点 */
  evaluatorPhone?: string;
  evaluatedAt: string;
}

export interface Lead {
  id: string;
  communityName: string;
  communityId?: string; // 关联小区ID
  // ===== 楼盘字典四级地址（M3 / FR-18）=====
  buildingId?: number | null;
  roomId?: number | null;
  dictStatus?: "linked" | "manual" | "pending" | "rejected" | null;
  // 字典解析名称（surface-dict-binding-info；pending 时为待审名称）
  buildingNo?: string | null;
  roomNo?: string | null;
  newCommunity?: { name: string } | null;
  newBuilding?: { name: string } | null;
  newRoom?: { name: string } | null;
  layout: string; // e.g., "2室1厅"
  orientation: string; // e.g., "南"
  floorInfo: string; // e.g., "18/24层"
  area: number; // in sqm
  totalPrice: number; // User offer price in 10,000s
  unitPrice: number; // Calculated or provided

  status: LeadStatus;
  evalPrice?: number; // Operator's evaluated price
  conditionScore?: number | null; // 最新评估的房源条件分 1-5（无评估为 null）
  expectedSaleDays?: number | null; // 最新评估的装修后可售天数（无评估为 null）
  expectedPrice?: number; // 业主心理预期价（万）
  evalHistories?: EvalHistory[]; // 评估历史（可选，详情接口返回）
  auditReason?: string;
  auditorId?: string;
  auditTime?: string;
  updatedAt?: string; // raw ISO，audit_time 为空时回退用于排序与显示

  images: string[];
  district: string;
  businessArea: string;
  remarks: string;
  creatorName: string;
  referrerId?: string;
  referrerName?: string;
  lastFollowUpAt?: string;
  createdAt: string;
}

export interface FilterState {
  search: string;
  statuses: LeadStatus[]; // Updated for multi-select
  district: string; // Updated for fuzzy text
  creator: string; // New
  layouts: string[]; // New: ['1', '2', '3', '4', '4+']
  floors: string[]; // New: ['低', '中', '高']
}

/**
 * Tab 值类型
 * "all" 表示显示所有状态的线索
 * LeadStatus 表示特定状态的线索
 */
export type LeadTabValue = "all" | LeadStatus;
