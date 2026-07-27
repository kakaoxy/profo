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
  remark: z.string().max(500, "备注最多 500 字").optional(),
});

function mapEvalHistoryResponse(resp: LeadEvalHistoryResponse): EvalHistory {
  return {
    id: resp.id,
    leadId: resp.lead_id,
    evalPrice: resp.eval_price,
    remark: resp.remark ?? undefined,
    evaluatorId: resp.evaluator_id,
    evaluatorName: resp.evaluator_name ?? undefined,
    evaluatedAt: resp.evaluated_at,
  };
}

export async function createEvaluationAction(
  leadId: string,
  evalPrice: number,
  remark?: string,
): Promise<ActionResult<EvalHistory>> {
  const parsed = createEvaluationSchema.safeParse({ leadId, evalPrice, remark });
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
    const { data, error } = await client.POST(
      "/api/v1/leads/{lead_id}/evaluations",
      {
        params: { path: { lead_id: leadId } },
        body: { eval_price: evalPrice, remark: remark ?? null },
      },
    );

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

export async function getEvalHistoriesAction(
  leadId: string,
): Promise<ActionResult<EvalHistory[]>> {
  const permCheck = await requirePermission(PERMISSION_CODES.LEAD_READ);
  if (!permCheck.ok) {
    return { success: false, error: permCheck.message };
  }

  try {
    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/leads/{lead_id}/evaluations",
      {
        params: { path: { lead_id: leadId } },
      },
    );

    if (error || !data) {
      return { success: false, error: extractErrorMessage(error) };
    }

    return { success: true, data: data.map(mapEvalHistoryResponse) };
  } catch (error) {
    logger.error("Get eval histories error:", error);
    return { success: false, error: extractErrorMessage(error) };
  }
}
