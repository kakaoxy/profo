"use server";

import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { FollowUpMethod, FollowUp } from "../types";
import { ActionResult, extractErrorMessage } from "@/lib/action-result";
import type { operations } from "@/lib/api-types";

type FollowUpCreatePayload =
  operations["add_follow_up_api_v1_leads__lead_id__follow_ups_post"]["requestBody"]["content"]["application/json"];

export async function addFollowUpAction(
  leadId: string,
  method: FollowUpMethod,
  content: string,
): Promise<ActionResult<void>> {
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

    revalidatePath("/leads");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("Add follow-up error:", error);
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
    console.error("Get follow-ups error:", error);
    return [];
  }

  return data.map((f) => ({
    id: f.id,
    leadId: f.lead_id,
    method: f.method,
    content: f.content,
    followUpTime: new Date(f.followed_at).toLocaleString(),
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
    console.error("Get price history error:", error);
    return [];
  }

  return data.map((p) => ({
    id: p.id,
    leadId: p.lead_id,
    price: p.price,
    remark: p.remark ?? undefined,
    recordedAt: new Date(p.recorded_at).toLocaleString(),
    createdByName: p.created_by_name ?? undefined,
  }));
}
