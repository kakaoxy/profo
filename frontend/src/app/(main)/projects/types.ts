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

// [新增] 定义并导出附件操作句柄接口
export interface AttachmentHandlers {
  onPreview: (url: string, fileType: string) => void;
  onDownload: (url: string, filename: string) => void;
  onDelete?: (url: string) => void;
}

export interface Project {
  id: string;
  name: string;
  community_name?: string;
  // 为了兼容可能的驼峰返回 (如社区名称)
  communityName?: string;

  status: string;

  // --- 核心金额字段 (混合命名兼容) ---
  signing_price?: number; // Log 显示是下划线
  signingPrice?: number; // 兼容驼峰引用

  sold_price?: number;
  soldPrice?: number; // Log 显示可能存在

  list_price?: number; // Log 显示是下划线
  listPrice?: number; // 兼容驼峰引用

  net_cash_flow?: number; // Log 显示是下划线
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
  signing_period?: number; // Log 显示是下划线
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
  tags?: string[] | null; // Log 显示 tags 可能是 null
  renovation_stage?: string;
}
