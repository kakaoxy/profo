/**
 * 项目卡片类型定义
 */

export type ApiSalesRecord = {
  id: string;
  record_type: string;
  price?: string | null;
  record_date: string;
  customer_name?: string | null;
  notes?: string | null;
};

const VALID_RECORD_TYPES = ["viewing", "offer", "negotiation", "sold"] as const;
export type ValidRecordType = (typeof VALID_RECORD_TYPES)[number];

export function isValidRecordType(type: string): type is ValidRecordType {
  return VALID_RECORD_TYPES.includes(type as ValidRecordType);
}

export interface TransformedSalesRecord {
  id: string;
  project_id: string;
  record_type: ValidRecordType;
  customer_name?: string;
  price?: number;
  record_date: string;
  notes?: string;
}
