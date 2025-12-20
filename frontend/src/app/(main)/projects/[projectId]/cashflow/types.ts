// src/app/(main)/projects/[projectId]/cashflow/types.ts

// ==========================================
// 1. 基础类型与常量
// ==========================================
export type TransactionType = "income" | "expense";

export const EXPENSE_CATEGORIES = [
  "履约保证金",
  "中介佣金",
  "装修费",
  "营销费",
  "其他支出",
  "税费",
  "运营费",
] as const;

export const INCOME_CATEGORIES = [
  "回收保证金",
  "溢价款",
  "服务费",
  "其他收入",
  "售房款",
] as const;

// ==========================================
// 2. 前端组件使用的类型 (Frontend Models)
// ==========================================

// 前端组件（表格/图表）使用的清洗后的数据结构
export interface CashFlowRecord {
  id: string;
  project_id: string;
  type: TransactionType;
  category: string;
  amount: number;
  date: string;
  notes?: string;
  created_at: string;
}

// 顶部 KPI 面板使用的统计数据
export interface CashFlowStats {
  total_income: number;
  total_expense: number;
  net_cash_flow: number;
  roi: number;
  annualized_return: number;
  holding_days: number;
}

// ==========================================
// 3. 后端 API 原始类型 (Backend DTOs)
// ==========================================

// [关键修复] 更新字段名以匹配后端 Pydantic Schema
export interface CashFlowRecordRaw {
  id: string;
  project_id: string;
  type: TransactionType; // 后端现在返回 "type"
  category: string;
  amount: number;
  date: string; // 后端现在返回 "date"
  description?: string; // 后端现在返回 "description"
  created_at: string;
}

// 定义后端返回的统计结构
export interface CashFlowSummaryRaw {
  total_income: number;
  total_expense: number;
  net_cash_flow: number;
  roi?: number;
  annualized_return?: number;
  holding_days?: number;
}

// API 完整响应结构
export interface CashFlowApiResponse {
  records: CashFlowRecordRaw[];
  summary: CashFlowSummaryRaw;
}
