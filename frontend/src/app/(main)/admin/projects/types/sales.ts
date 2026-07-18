// src/app/(main)/projects/types/sales.ts
// 销售相关类型定义

export interface SalesRecordOperator {
  id: string;
  nickname?: string | null;
  avatar?: string | null;
}

export interface SalesRecord {
  id: string;
  project_id: string;
  record_type: "viewing" | "offer" | "negotiation" | "sold";
  customer_name?: string;
  price?: number;
  record_date: string;
  notes?: string;
  created_at?: string;
  operator?: SalesRecordOperator | null;
}
