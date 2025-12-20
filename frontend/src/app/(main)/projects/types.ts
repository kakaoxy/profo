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
  costAssumption?: string;
  cost_assumption?: string;

  otherAgreements?: string;
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
