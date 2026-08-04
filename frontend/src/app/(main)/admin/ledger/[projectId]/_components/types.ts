// src/app/(main)/admin/ledger/[projectId]/_components/types.ts
// 资金账本前端视图类型

import type { components } from "@/lib/api-types";

// ==========================================
// 1. 后端 API 类型 (引用 gen-api 生成类型,禁手写后端 DTO)
// ==========================================

// 后端现金流完整响应类型
export type CashFlowApiResponse = components["schemas"]["CashFlowResponse"];

// ==========================================
// 2. 前端视图类型 (Frontend View Models)
// ==========================================

// 前端视图类型:顶部 KPI 面板使用的统计数据
// F1: 直接引用生成类型，避免手写 DTO 与后端 schema 漂移
export type CashFlowStats = components["schemas"]["CashFlowSummary"];
