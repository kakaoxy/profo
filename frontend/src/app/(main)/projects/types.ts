// src/app/(main)/projects/types.ts

// 附件信息接口
export interface AttachmentInfo {
  filename: string;
  url: string;
  category: string;
  fileType: string;
  size?: number;
}

// 签约材料结构
interface SigningMaterials {
  attachments?: AttachmentInfo[];
}

// 定义并导出附件操作句柄接口
export interface AttachmentHandlers {
  onPreview: (url: string, fileType: string) => void;
  onDownload: (url: string, filename: string) => void;
  onDelete?: (url: string) => void;
}

export interface RenovationPhoto {
  id: string;
  project_id: string;
  renovation_id?: string; // 新增：关联装修记录ID
  stage: string; // 对应后端 RenovationStage 枚举
  url: string;
  filename?: string;
  description?: string;
  created_at: string;
}

// 保持之前的 NodeData 结构供前端 UI 使用
export interface RenovationNodeData {
  status: "pending" | "active" | "completed";
  date?: string | null;
  photos?: RenovationPhoto[];
}

// 销售记录类型
export interface SalesRecord {
  id: string;
  project_id: string;
  record_type: "viewing" | "offer" | "negotiation" | "sold";
  customer_name?: string;
  price?: number; // 出价金额
  record_date: string; // ISO 8601 string
  notes?: string;
  created_at?: string;
}

// [新增] 现金流汇总 (用于 HeroMetrics，如果后端将来直接返回 summary 对象)
export interface CashFlowSummary {
  total_income: number;
  total_expense: number;
  net_cash_flow: number;
  roi: number;
}

// ========== 新增规范化表类型定义 ==========

// 合同信息
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

// 业主信息
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

// 销售交易信息
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

// 项目跟进记录
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

// 项目评估记录
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

// 互动过程记录
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

// 财务流水记录
export interface FinanceRecord {
  id: string;
  project_id: string;
  type: "income" | "expense";
  category: string;
  amount: number;
  record_date: string;
  operator_id?: string;
  remark?: string;
  created_at: string;
  updated_at: string;
}

// 项目状态流转日志
export interface ProjectStatusLog {
  id: string;
  project_id: string;
  old_status: string;
  new_status: string;
  trigger_event?: string;
  operator_id?: string;
  operate_at: string;
  remark?: string;
  created_at: string;
  updated_at: string;
}

// 装修信息
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
  communityName?: string;

  status: string;

  // --- 核心金额字段 ---
  signing_price?: number;
  signingPrice?: number;

  sold_price?: number;
  soldPrice?: number;

  list_price?: number;
  listPrice?: number;
  listing_price?: number; // [新增] 兼容 Sold View 组件可能使用的别名

  // [关键修复] 投资总额 (Sold View 强依赖此字段)
  // 目前后端未返回，前端会得到 undefined，组件显示为 0 是安全的
  total_investment?: number;

  area?: number;
  
  // --- 户型与朝向 ---
  layout?: string;
  orientation?: string;

  // --- 人员信息 ---
  manager?: string;
  owner_name?: string;
  ownerName?: string;
  owner_phone?: string;
  ownerPhone?: string;
  owner_id_card?: string;
  ownerIdCard?: string;

  // --- 时间字段 ---
  created_at: string;
  updated_at: string;

  signing_date?: string | null;
  signingDate?: string | null;

  planned_handover_date?: string | null;
  plannedHandoverDate?: string | null;

  sold_date?: string | null;
  soldDate?: string | null;
  sold_at?: string | null;

  // [新增] 关键节点日期 (Sold View 时间轴需要)
  renovation_start_date?: string | null; // 开工日期
  listing_date?: string | null; // 上架日期

  // --- 签约相关 ---
  signing_period?: number;
  signingPeriod?: number;

  extensionPeriod?: number;
  extension_period?: number;

  extensionRent?: number;
  extension_rent?: number;

  signing_materials?: SigningMaterials | null;

  // --- 合同与备注 ---
  cost_assumption?: string;
  other_agreements?: string;
  notes?: string;
  remarks?: string;

  // --- 其他 ---
  address?: string;
  tags?: string[] | null;
  renovation_stage?: string;
  stage_completed_at?: string | null;

  // --- 装修与销售相关 ---
  renovation_photos?: RenovationPhoto[];
  sales_records?: SalesRecord[];

  // 改造阶段完成时间（JSON 格式存储，key 为阶段中文名，value 为 yyyy-MM-dd）
  renovationStageDates?: Record<string, string> | null;
  total_income?: number;
  total_expense?: number;
  net_cash_flow?: number;
  roi?: number;

  // --- 销售团队字段 ---
  channelManager?: string;
  presenter?: string;
  negotiator?: string;
  channel_manager?: string;
}
