"use server";

import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";

// ==========================================
// 1. 手动定义类型 (与后端 Pydantic Schema 保持一致)
// ==========================================

// [关键修复] 更新为 type, date, description 以匹配后端
export interface CashFlowRecordResponse {
  id: string;
  project_id: string;
  type: "income" | "expense"; // 后端字段: type
  category: string;
  amount: number | string;
  date: string; // 后端字段: date
  description?: string; // 后端字段: description
  created_at: string;
}

// 对应后端 CashFlowSummary
export interface CashFlowSummary {
  total_income: number;
  total_expense: number;
  net_cash_flow: number;
  roi?: number;
  annualized_return?: number;
  holding_days?: number;
}

// 对应后端响应结构
interface CashFlowData {
  records: CashFlowRecordResponse[];
  summary: CashFlowSummary;
}

// 前端创建表单的 Payload
interface CashFlowCreatePayload {
  type: "income" | "expense";
  category: string;
  amount: number | string;
  date: string;
  notes?: string;
}

// ==========================================
// 2. 获取现金流数据
// ==========================================

export async function getProjectCashFlowAction(projectId: string) {
  const client = await fetchClient();

  const { data, error } = await client.GET(
    "/api/v1/projects/{project_id}/cashflow",
    {
      params: { path: { project_id: projectId } },
    }
  );

  if (error) {
    console.error("获取现金流失败:", error);
    return null;
  }

  // 安全断言：将返回数据断言为我们在上面定义的新结构
  const safeData = data as unknown as { data: CashFlowData } | CashFlowData;

  if ("data" in safeData && "records" in safeData.data) {
    return safeData.data;
  }
  return safeData as CashFlowData;
}

// ==========================================
// 3. 创建记录
// ==========================================

export async function createCashFlowRecordAction(
  projectId: string,
  payload: CashFlowCreatePayload
) {
  const client = await fetchClient();

  // 构造 Request Body，映射前端字段到后端 Schema
  const requestBody = {
    type: payload.type,
    category: payload.category,
    amount: Number(payload.amount),
    date: payload.date,
    description: payload.notes,
  };

  const { error } = await client.POST(
    "/api/v1/projects/{project_id}/cashflow",
    {
      params: { path: { project_id: projectId } },
      // @ts-expect-error generated types mismatch due to manual schema update
      body: requestBody,
    }
  );

  if (error) {
    const errorDetail = (error as { detail?: string }).detail;
    return { success: false, message: errorDetail || "创建失败" };
  }

  revalidatePath(`/projects/${projectId}/cashflow`);
  return { success: true, message: "记录已添加" };
}

// ==========================================
// 4. 删除记录
// ==========================================

export async function deleteCashFlowRecordAction(
  projectId: string,
  recordId: string
) {
  const client = await fetchClient();
  const { error } = await client.DELETE(
    "/api/v1/projects/{project_id}/cashflow/{record_id}",
    {
      params: {
        path: { project_id: projectId, record_id: recordId },
      },
    }
  );

  if (error) {
    const errorDetail = (error as { detail?: string }).detail;
    return { success: false, message: errorDetail || "删除失败" };
  }

  revalidatePath(`/projects/${projectId}/cashflow`);
  return { success: true, message: "删除成功" };
}
