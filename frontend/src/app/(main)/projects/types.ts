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

// 保持之前的 NodeData 结构供前端 UI 使用，但数据来源变了
export interface RenovationNodeData {
  status: "pending" | "active" | "completed";
  date?: string | null;
  photos?: RenovationPhoto[];
}

// 销售记录类型
export interface SalesRecord {
  id: string;
  project_id: string;
  // 后端可能是 "offer", 前端有时候叫 "bid", 这里做宽容处理
  record_type: "viewing" | "offer" | "bid" | "negotiation";
  customer_name?: string;
  price?: number; // 出价金额
  record_date: string; // ISO 8601 string
  notes?: string;
  created_at?: string;
}

export interface Project {
  id: string;
  name: string;
  community_name?: string;
  communityName?: string;

  status: string;

  // --- 核心金额字段 (混合命名兼容) ---
  signing_price?: number; //
  signingPrice?: number; // 兼容驼峰引用

  sold_price?: number;
  soldPrice?: number; //

  list_price?: number; //
  listPrice?: number; // 兼容驼峰引用

  net_cash_flow?: number; //
  netCashFlow?: number; // 兼容驼峰引用

  area?: number;

  // --- 人员信息 (Log 显示主要是下划线) ---
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

  // --- 签约相关 ---
  signing_period?: number; //
  signingPeriod?: number; // 兼容驼峰引用

  // [新增] 延期相关
  extensionPeriod?: number; // 延长期 (月)
  extension_period?: number; // 下划线兼容

  extensionRent?: number; // 延期租金 (元/月)
  extension_rent?: number; // 下划线兼容

  signing_materials?: SigningMaterials | null;

  // --- 合同与备注 (这是导致不显示的关键差异) ---
  // Log 明确显示后端返回了驼峰命名：costAssumption, otherAgreements
  costAssumption?: string;
  cost_assumption?: string; // 保留旧定义以防万一

  otherAgreements?: string;
  other_agreements?: string; // 保留旧定义以防万一

  notes?: string;
  remarks?: string;

  // --- 其他 ---
  address?: string;
  tags?: string[] | null; //
  renovation_stage?: string;
  stage_completed_at?: string | null; // 后端返回的最后一次完成时间

  // --- [新增] 装修与销售相关 ---
  renovation_photos?: RenovationPhoto[]; // 装修照片
  sales_records?: SalesRecord[]; // 销售记录

  // --- [新增] 销售团队字段 ---
  channel_manager?: string; // 渠道维护
  presenter?: string; // 房源主讲
  negotiator?: string; // 谈判专家
}
