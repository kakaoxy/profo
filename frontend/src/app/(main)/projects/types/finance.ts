// src/app/(main)/projects/types/finance.ts
// 财务相关类型定义

export interface CashFlowSummary {
  total_income: number;
  total_expense: number;
  net_cash_flow: number;
  roi: number;
}

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
