"use server";

import { z } from "zod";
import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { safeParseDate } from "@/lib/validators";
import { revalidatePath } from "next/cache";
import { FollowUpMethod, FollowUp, FollowUpConclusion } from "../types";
import { ActionResult, extractErrorMessage } from "@/lib/action-result";
import type { operations } from "@/lib/api-types";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/server/require-permission";

type FollowUpCreatePayload =
  operations["add_follow_up_api_v1_leads__lead_id__follow_ups_post"]["requestBody"]["content"]["application/json"];

const addFollowUpSchema = z.object({
  leadId: z.string().min(1, "线索 ID 不能为空"),
  method: z.enum(["phone", "wechat", "face", "visit"], {
    message: "跟进方式不合法",
  }),
  content: z.string().min(1, "跟进内容不能为空").max(500, "跟进内容最多 500 字"),
  // 跟进结论为选填：null 表示「本次未记录」，与后端 FollowUpConclusion 枚举值域对齐
  conclusion: z.enum(["mode_disagree", "price_disagree", "both_disagree"]).nullish(),
});

export async function addFollowUpAction(
  leadId: string,
  method: FollowUpMethod,
  content: string,
  conclusion?: FollowUpConclusion | null,
): Promise<ActionResult<void>> {
  const parsed = addFollowUpSchema.safeParse({ leadId, method, content, conclusion });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "跟进参数不合法",
    };
  }

  const permCheck = await requirePermission(PERMISSION_CODES.LEAD_WRITE);
  if (!permCheck.ok) {
    return { success: false, error: permCheck.message };
  }

  try {
    const client = await fetchClient();

    const payload: FollowUpCreatePayload = {
      method,
      content,
      ...(parsed.data.conclusion ? { conclusion: parsed.data.conclusion } : {}),
    };

    const { error } = await client.POST("/api/v1/leads/{lead_id}/follow-ups", {
      params: { path: { lead_id: leadId } },
      body: payload,
    });

    if (error) {
      return { success: false, error: extractErrorMessage(error) };
    }

    revalidatePath("/admin/leads");
    return { success: true, data: undefined };
  } catch (error) {
    logger.error("Add follow-up error:", error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function getLeadFollowUpsAction(leadId: string): Promise<ActionResult<FollowUp[]>> {
  const permCheck = await requirePermission(PERMISSION_CODES.LEAD_READ);
  if (!permCheck.ok) {
    return { success: false, error: permCheck.message };
  }

  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/leads/{lead_id}/follow-ups", {
      params: { path: { lead_id: leadId } },
    });

    if (error || !data) {
      logger.error("Get follow-ups error:", error);
      return { success: false, error: extractErrorMessage(error) };
    }

    const mapped: FollowUp[] = data.map((f) => ({
      id: f.id,
      leadId: f.lead_id,
      method: f.method,
      content: f.content,
      conclusion: f.conclusion ?? null,
      followUpTime: safeParseDate(f.followed_at)?.toLocaleString() ?? "-",
      followedAt: f.followed_at,
      createdBy: f.created_by_name || "Unknown",
    }));
    return { success: true, data: mapped };
  } catch (error) {
    logger.error("Get follow-ups error:", error);
    return { success: false, error: extractErrorMessage(error) };
  }
}
