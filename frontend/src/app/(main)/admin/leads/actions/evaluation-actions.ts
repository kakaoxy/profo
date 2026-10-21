"use server";

import { z } from "zod";
import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { ActionResult, extractErrorMessage } from "@/lib/action-result";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/server/require-permission";
import type { operations } from "@/lib/api-types";
import type { EvalHistory } from "../types";

type LeadEvalHistoryResponse =
  operations["create_evaluation_api_v1_leads__lead_id__evaluations_post"]["responses"][201]["content"]["application/json"];

const createEvaluationSchema = z.object({
  leadId: z.string().min(1, "线索 ID 不能为空"),
  evalPrice: z.number().positive("评估价必须为正数"),
  conditionScore: z
    .number({ message: "请选择房源条件分" })
    .int("房源条件分必须为整数")
    .min(1, "房源条件分最低 1 分")
    .max(5, "房源条件分最高 5 分"),
  expectedSaleDays: z
    .number({ message: "请填写装修后可售天数" })
    .int("可售天数必须为整数")
    .min(1, "可售天数至少 1 天")
    .max(365, "可售天数最多 365 天"),
  remark: z.string().max(500, "备注最多 500 字").optional(),
});

function mapEvalHistoryResponse(resp: LeadEvalHistoryResponse): EvalHistory {
  return {
    id: resp.id,
    leadId: resp.lead_id,
    evalPrice: resp.eval_price,
    conditionScore: resp.condition_score ?? undefined,
    expectedSaleDays: resp.expected_sale_days ?? undefined,
    remark: resp.remark ?? undefined,
    evaluatorId: resp.evaluator_id,
    evaluatorName: resp.evaluator_name ?? undefined,
    evaluatorPhone: resp.evaluator_phone ?? undefined,
    evaluatedAt: resp.evaluated_at,
  };
}

export async function createEvaluationAction(
  leadId: string,
  evalPrice: number,
  conditionScore: number,
  expectedSaleDays: number,
  remark?: string,
): Promise<ActionResult<EvalHistory>> {
  const parsed = createEvaluationSchema.safeParse({
    leadId,
    evalPrice,
    conditionScore,
    expectedSaleDays,
    remark,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "评估参数不合法",
    };
  }

  const permCheck = await requirePermission(PERMISSION_CODES.LEAD_WRITE);
  if (!permCheck.ok) {
    return { success: false, error: permCheck.message };
  }

  try {
    const client = await fetchClient();
    const { data, error } = await client.POST("/api/v1/leads/{lead_id}/evaluations", {
      params: { path: { lead_id: leadId } },
      // 端到端以字符串传输：契约类型为 `number | string`，
      // 后端 Decimal 直接解析字符串避免 IEEE754 float 精度损失
      body: {
        eval_price: String(evalPrice),
        condition_score: conditionScore,
        expected_sale_days: expectedSaleDays,
        remark: remark ?? null,
      },
    });

    if (error || !data) {
      return { success: false, error: extractErrorMessage(error) };
    }

    revalidatePath("/admin/leads");
    return { success: true, data: mapEvalHistoryResponse(data) };
  } catch (error) {
    logger.error("Create evaluation error:", error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function getEvalHistoriesAction(leadId: string): Promise<ActionResult<EvalHistory[]>> {
  const permCheck = await requirePermission(PERMISSION_CODES.LEAD_READ);
  if (!permCheck.ok) {
    return { success: false, error: permCheck.message };
  }

  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/leads/{lead_id}/evaluations", {
      params: { path: { lead_id: leadId } },
    });

    if (error || !data) {
      return { success: false, error: extractErrorMessage(error) };
    }

    return { success: true, data: data.map(mapEvalHistoryResponse) };
  } catch (error) {
    logger.error("Get eval histories error:", error);
    return { success: false, error: extractErrorMessage(error) };
  }
}
