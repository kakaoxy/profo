// src/app/(main)/projects/types/project.ts
// 项目核心类型定义

import { AttachmentInfo } from "./attachment";
import { RenovationPhoto } from "./renovation";
import { SalesRecord } from "./sales";

export interface ProjectContract {
  id: string;
  project_id: string;
  contract_no?: string;
  signing_price?: number;
  signing_date?: string;
  signing_period?: number;
  extension_period?: number;
  extension_rent?: number;
  cost_assumption?: string;
  planned_handover_date?: string;
  other_agreements?: string;
  signing_materials?: string[];
  contract_status: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectOwner {
  id: string;
  project_id: string;
  owner_name?: string;
  owner_phone?: string;
  owner_id_card?: string;
  relation_type: string;
  owner_info?: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectSale {
  id: string;
  project_id: string;
  listing_date?: string;
  list_price?: number;
  sold_date?: string;
  sold_price?: number;
  channel_manager_id?: string;
  property_agent_id?: string;
  negotiator_id?: string;
  transaction_status: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectFollowUp {
  id: string;
  project_id: string;
  follow_up_type: string;
  content?: string;
  follow_up_at: string;
  follower_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectEvaluation {
  id: string;
  project_id: string;
  evaluation_type: string;
  evaluation_price: number;
  remark?: string;
  evaluator_id?: string;
  evaluation_at: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectInteraction {
  id: string;
  project_id: string;
  record_type: string;
  interaction_target?: string;
  content?: string;
  interaction_at: string;
  operator_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectRenovation {
  id: string;
  project_id: string;
  renovation_company?: string;
  contract_start_date?: string;
  contract_end_date?: string;
  actual_start_date?: string;
  actual_end_date?: string;
  hard_contract_amount?: number;
  payment_node_1?: string;
  payment_ratio_1?: number;
  payment_node_2?: string;
  payment_ratio_2?: number;
  payment_node_3?: string;
  payment_ratio_3?: number;
  payment_node_4?: string;
  payment_ratio_4?: number;
  soft_budget?: number;
  soft_actual_cost?: number;
  soft_detail_attachment?: string;
  design_fee?: number;
  demolition_fee?: number;
  garbage_fee?: number;
  other_extra_fee?: number;
  other_fee_reason?: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  community_name?: string;
  status: string;

  signing_price?: number;
  sold_price?: number;
  list_price?: number;
  listing_price?: number;
  total_investment?: number;
  area?: number;

  layout?: string;
  orientation?: string;

  manager?: string;
  owner_name?: string;
  owner_phone?: string;
  owner_id_card?: string;

  created_at: string;
  updated_at: string;

  signing_date?: string | null;
  planned_handover_date?: string | null;
  sold_date?: string | null;
  sold_at?: string | null;

  renovation_start_date?: string | null;
  listing_date?: string | null;

  contract_no?: string;
  signing_period?: number;
  extension_period?: number;
  extension_rent?: number;
  cost_assumption?: string;
  other_agreements?: string;
  signing_materials?: string[] | { attachments?: AttachmentInfo[] } | null;

  notes?: string;
  remarks?: string;
  address?: string;
  tags?: string[] | null;
  renovation_stage?: string;
  stage_completed_at?: string | null;

  renovation_photos?: RenovationPhoto[];
  sales_records?: SalesRecord[];
  renovationStageDates?: Record<string, string> | null;
  total_income?: number;
  total_expense?: number;
  net_cash_flow?: number;
  roi?: number;

  channel_manager?: string;
  presenter?: string;
  negotiator?: string;
}
