// src/app/(main)/projects/[projectId]/cashflow/types.ts

// ==========================================
// 1. 基础类型与常量
// ==========================================
export type TransactionType = "income" | "expense";

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
  counterparty?: string | null;
  receipt_urls?: string[] | null;
  receipt_url?: string | null; // 兼容字段：receipt_urls 首项
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
  counterparty?: string | null;
  receipt_urls?: string[] | null;
  receipt_url?: string | null; // 兼容字段：receipt_urls 首项
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

// ==========================================
// 4. 数据映射函数
// ==========================================

/**
 * 将后端原始记录映射为前端组件使用的数据结构
 */
export function mapToCashFlowRecord(
  raw: CashFlowRecordRaw,
  projectId: string
): CashFlowRecord {
  const receiptUrls = raw.receipt_urls ?? null;
  return {
    id: raw.id,
    project_id: projectId,
    type: raw.type,
    category: raw.category,
    amount: Number(raw.amount),
    date: raw.date,
    counterparty: raw.counterparty ?? null,
    receipt_urls: receiptUrls,
    receipt_url: receiptUrls && receiptUrls.length > 0 ? receiptUrls[0] : null,
    notes: raw.description,
    created_at: raw.created_at,
  };
}

/**
 * 将后端原始统计数据映射为前端组件使用的数据结构
 */
export function mapToCashFlowStats(raw: CashFlowSummaryRaw): CashFlowStats {
  return {
    total_income: Number(raw.total_income),
    total_expense: Number(raw.total_expense),
    net_cash_flow: Number(raw.net_cash_flow),
    roi: Number(raw.roi ?? 0),
    annualized_return: Number(raw.annualized_return ?? 0),
    holding_days: Number(raw.holding_days ?? 0),
  };
}
