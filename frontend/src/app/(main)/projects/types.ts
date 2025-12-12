export interface Project {
  id: string;
  name: string;
  community_name?: string;
  status: string;
  
  // 核心金额字段
  signing_price?: number;
  soldPrice?: number; // 注意：后端有时返回驼峰 soldPrice
  list_price?: number;
  net_cash_flow?: number; // 现金流

  // 人员信息
  manager?: string;
  owner_name?: string;
  owner_phone?: string;

  // 时间字段
  created_at: string;
  updated_at: string;
  signing_date?: string | null; // 🔥 修复：添加此字段
  
  // 其他
  address?: string;
}