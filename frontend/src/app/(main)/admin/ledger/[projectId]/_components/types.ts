// src/app/(main)/admin/ledger/[projectId]/_components/types.ts
// 资金账本前端视图类型

import type { components } from "@/lib/api-types";

// ==========================================
// 1. 基础类型与常量
// ==========================================
export type TransactionType = "income" | "expense";

// ==========================================
// 2. 后端 API 类型 (引用 gen-api 生成类型,禁手写后端 DTO)
// ==========================================

// 后端现金流记录响应类型(由 openapi-typescript 生成)
type CashFlowRecordResponse = components["schemas"]["CashFlowRecordResponse"];
// 后端现金流摘要类型
type CashFlowSummary = components["schemas"]["CashFlowSummary"];
// 后端现金流完整响应类型
export type CashFlowApiResponse = components["schemas"]["CashFlowResponse"];

// ==========================================
// 3. 前端视图类型 (Frontend View Models)
// ==========================================

// 前端视图类型:组件(表格/图表)使用的清洗后数据结构
// 与后端 CashFlowRecordResponse 的差异:
// - 使用 notes 字段(映射自后端 description/remark)
// - 不暴露 record_date/remark/operator_id/updated_at/related_stage 等后端字段
export interface CashFlowRecord {
  id: string;
  project_id: string;
  type: TransactionType;
  category: string;
  amount: number;
  date: string;
  counterparty?: string | null;
  receipt_urls?: string[] | null;
  receipt_url?: string | null; // 兼容字段:receipt_urls 首项
  notes?: string;
  created_at: string;
}

// 前端视图类型:顶部 KPI 面板使用的统计数据
// 与后端 CashFlowSummary 字段一致,作为前端视图类型单独定义以保证分层解耦
export interface CashFlowStats {
  total_income: number;
  total_expense: number;
  net_cash_flow: number;
  roi: number;
  annualized_return: number;
  holding_days: number;
}

// ==========================================
// 4. 数据映射函数
// ==========================================

/**
 * 将后端原始记录映射为前端组件使用的数据结构
 */
export function mapToCashFlowRecord(
  raw: CashFlowRecordResponse,
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
    notes: raw.description ?? undefined,
    created_at: raw.created_at,
  };
}

/**
 * 将后端原始统计数据映射为前端组件使用的数据结构
 */
export function mapToCashFlowStats(raw: CashFlowSummary): CashFlowStats {
  return {
    total_income: Number(raw.total_income),
    total_expense: Number(raw.total_expense),
    net_cash_flow: Number(raw.net_cash_flow),
    roi: Number(raw.roi ?? 0),
    annualized_return: Number(raw.annualized_return ?? 0),
    holding_days: Number(raw.holding_days ?? 0),
  };
}
