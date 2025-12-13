// 附件信息接口（与 create-project 中保持一致）
interface AttachmentInfo {
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

export interface Project {
  id: string;
  name: string;
  community_name?: string;
  status: string;
  
  // 核心金额字段
  signing_price?: number;
  soldPrice?: number; // 注意：后端有时返回驼峰 soldPrice
  sold_price?: number; // 也可能是下划线格式
  list_price?: number;
  net_cash_flow?: number; // 现金流
  area?: number; // 面积

  // 人员信息
  manager?: string;
  owner_name?: string;
  owner_phone?: string;
  owner_id_card?: string; // 业主身份证号

  // 时间字段
  created_at: string;
  updated_at: string;
  signing_date?: string | null;
  planned_handover_date?: string | null; // 计划交房时间
  sold_date?: string | null; // 成交日期
  
  // 签约相关
  signing_period?: number; // 签约周期（月）
  signing_materials?: SigningMaterials | null; // 签约材料/附件
  
  // 合同与备注
  cost_assumption?: string; // 费用承担
  other_agreements?: string; // 其他约定
  notes?: string; // 备注
  remarks?: string; // 备注（另一个字段）
  
  // 其他
  address?: string;
  tags?: string[];
}