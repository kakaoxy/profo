"use server";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { extractApiData } from "@/lib/api-helpers";
import type { components } from "@/lib/api-types";
import { CashFlowApiResponse } from "./types";

// 使用生成的 API 类型
type CashFlowRecordCreate = components["schemas"]["CashFlowRecordCreate"];

// 前端创建表单的 Payload(基于生成类型派生,与后端 CashFlowRecordCreate 的差异:
// - category 放宽为 string(允许表单自由输入,提交时 cast 为后端枚举)
// - counterparty 可选(后端必填,action 中以 ?? "" 兜底)
// - notes 替代 description(前端字段名)
type CashFlowCreatePayload = Omit<
  CashFlowRecordCreate,
  "category" | "counterparty" | "description" | "related_stage" | "receipt_urls"
> & {
  category: string;
  counterparty?: string | null;
  notes?: string;
};

// ==========================================
// 2. 获取现金流数据
// ==========================================

export async function getProjectCashFlowAction(projectId: string) {
  const client = await fetchClient();

  const { data, error } = await client.GET(
    "/api/v1/projects/{project_id}/cashflow",
    {
      params: { path: { project_id: projectId } },
    },
  );

  if (error) {
    logger.error("获取现金流失败:", error);
    return null;
  }

  const cashFlowData = extractApiData<CashFlowApiResponse>(data);
  return cashFlowData ?? null;
}

// ==========================================
// 3. 创建记录
// ==========================================

export async function createCashFlowRecordAction(
  projectId: string,
  payload: CashFlowCreatePayload,
) {
  const client = await fetchClient();

  // 构造 Request Body，映射前端字段到后端 Schema
  const requestBody: CashFlowRecordCreate = {
    type: payload.type,
    category: payload.category as CashFlowRecordCreate["category"],
    amount: Number(payload.amount),
    date: payload.date,
    counterparty: payload.counterparty ?? "",
    description: payload.notes,
  };

  const { error } = await client.POST(
    "/api/v1/projects/{project_id}/cashflow",
    {
      params: { path: { project_id: projectId } },
      body: requestBody,
    },
  );

  if (error) {
    const errorDetail = (error as { message?: string }).message;
    return { success: false, message: errorDetail || "创建失败" };
  }

  revalidatePath(`/admin/projects/${projectId}/cashflow`);
  return { success: true, message: "记录已添加" };
}

// ==========================================
// 4. 删除记录
// ==========================================

export async function deleteCashFlowRecordAction(
  projectId: string,
  recordId: string,
) {
  const client = await fetchClient();
  const { error } = await client.DELETE(
    "/api/v1/projects/{project_id}/cashflow/{record_id}",
    {
      params: {
        path: { project_id: projectId, record_id: recordId },
      },
    },
  );

  if (error) {
    const errorDetail = (error as { message?: string }).message;
    return { success: false, message: errorDetail || "删除失败" };
  }

  revalidatePath(`/admin/projects/${projectId}/cashflow`);
  return { success: true, message: "删除成功" };
}
