"use server";

import { z } from "zod";
import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { safeParseDate } from "@/lib/validators";
import { revalidatePath } from "next/cache";
import { FollowUpMethod, FollowUp } from "../types";
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
});

export async function addFollowUpAction(
  leadId: string,
  method: FollowUpMethod,
  content: string,
): Promise<ActionResult<void>> {
  const parsed = addFollowUpSchema.safeParse({ leadId, method, content });
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

export async function getLeadFollowUpsAction(
  leadId: string,
): Promise<FollowUp[]> {
  const client = await fetchClient();
  const { data, error } = await client.GET(
    "/api/v1/leads/{lead_id}/follow-ups",
    {
      params: { path: { lead_id: leadId } },
    },
  );

  if (error || !data) {
    logger.error("Get follow-ups error:", error);
    return [];
  }

  return data.map((f) => ({
    id: f.id,
    leadId: f.lead_id,
    method: f.method,
    content: f.content,
    followUpTime: safeParseDate(f.followed_at)?.toLocaleString() ?? "-",
    followedAt: f.followed_at,
    createdBy: f.created_by_name || "Unknown",
  }));
}

export async function getLeadPriceHistoryAction(
  leadId: string,
): Promise<import("../types").PriceHistory[]> {
  const client = await fetchClient();
  const { data, error } = await client.GET("/api/v1/leads/{lead_id}/prices", {
    params: { path: { lead_id: leadId } },
  });

  if (error || !data) {
    logger.error("Get price history error:", error);
    return [];
  }

  return data.map((p) => ({
    id: p.id,
    leadId: p.lead_id,
    price: p.price,
    remark: p.remark ?? undefined,
    recordedAt: safeParseDate(p.recorded_at)?.toLocaleString() ?? "-",
    createdByName: p.created_by_name ?? undefined,
  }));
}
