"use server";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { extractApiData } from "@/lib/api-helpers";
import type { components } from "@/lib/api-types";
import { z } from "zod";
import { CashFlowApiResponse } from "./types";

// 使用生成的 API 类型
type CashFlowRecordCreate = components["schemas"]["CashFlowRecordCreate"];

// 前端创建表单的 Payload(基于生成类型派生,与后端 CashFlowRecordCreate 的差异:
// - counterparty 可选(后端必填,action 中以 ?? "" 兜底)
// - notes 替代 description(前端字段名,action 中映射回 description)
type CashFlowCreatePayload = Omit<
  CashFlowRecordCreate,
  "description" | "related_stage" | "receipt_urls"
> & {
  // counterparty 在 payload 中可空(action 兜底为 "")
  counterparty?: string | null;
  // notes 为前端字段名,转发后端时映射为 description
  notes?: string;
};

// ==========================================
// 1. Zod Schemas (与后端 CashFlowRecordCreate 语义对齐)
// ==========================================

// 后端 CashFlowCategory 枚举(由 gen-api 生成,需与 api-types.d.ts 同步)
const CASH_FLOW_CATEGORIES = [
  "履约保证金",
  "中介佣金",
  "装修费",
  "营销费",
  "其他支出",
  "税费",
  "运营费",
  "收购款",
  "渠道佣金",
  "工程装修费",
  "硬装",
  "软装",
  "定制柜",
  "窗户",
  "墙面",
  "其他装修",
  "营销推广费",
  "运营服务费",
  "跟投本金退还",
  "投资人利润分配",
  "购房本金",
  "房屋税费",
  "名额费",
  "持有成本-月供",
  "其他税费",
  "项目备用金",
  "营销费垫付",
  "财税成本",
  "项目激励",
  "代付佣金",
  "税费及佣金差额",
  "购房款-定金",
  "购房款-首付",
  "卖房佣金",
  "卖房税费",
  "回收保证金",
  "溢价款",
  "服务费",
  "其他收入",
  "售房款",
  "保证金回收",
  "增值服务费",
  "项目跟投款",
  "备用金回收",
  "营销推广费抵扣",
  "业主佣金",
] as const satisfies readonly components["schemas"]["CashFlowCategory"][];

// 前端字段:notes -> 后端字段:description
const cashFlowCreateSchema = z.object({
  type: z.enum(["income", "expense"], {
    error: "现金流类型必须为 income 或 expense",
  }),
  category: z.enum(CASH_FLOW_CATEGORIES, {
    error: "现金流类别不合法",
  }),
  amount: z.union([z.number(), z.string()], {
    error: "金额必须为数字",
  }),
  date: z.string().min(1, "日期不能为空"),
  counterparty: z.string().nullable().optional(),
  counterparty_type: z.enum(["company", "individual"]).nullable().optional(),
  notes: z.string().max(500, "备注最多 500 字").optional(),
});

const projectIdSchema = z.string().min(1, "项目 ID 不能为空");
const recordIdSchema = z.string().min(1, "现金流记录 ID 不能为空");

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
  // 入参校验(与后端 CashFlowRecordCreate 语义对齐)
  const parsed = cashFlowCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "参数不合法",
    };
  }

  const client = await fetchClient();

  // 前端字段映射:notes -> description(后端)
  const { notes, ...rest } = parsed.data;
  const requestBody: CashFlowRecordCreate = {
    ...rest,
    amount: Number(rest.amount),
    counterparty: rest.counterparty ?? "",
    description: notes,
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
  const idParsed = projectIdSchema.safeParse(projectId);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message ?? "参数不合法",
    };
  }

  const recordParsed = recordIdSchema.safeParse(recordId);
  if (!recordParsed.success) {
    return {
      success: false,
      message: recordParsed.error.issues[0]?.message ?? "参数不合法",
    };
  }

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
