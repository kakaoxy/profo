"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { apiPaths, getApiUrl } from "@/lib/config";
import { ActionResult, createSuccessResult, createErrorResult } from "@/lib/action-result";
import { transformCommunitySearchSafe } from "@/lib/api-transforms";
import { cLocale } from "@/lib/i18n/c-locale";
import type { Community } from "@/components/common/community-select";

const createLeadSchema = z.object({
  community_id: z.string().nullable().optional(),
  community_name: z.string().min(1, cLocale.valuationAction.communityRequired),
  district: z.string().nullable().optional(),
  business_area: z.string().nullable().optional(),
  layout: z.string().nullable().optional(),
  area: z.number().nullable().optional(),
  floor_info: z.string().nullable().optional(),
  orientation: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
});

const completePhoneSchema = z.object({
  phone: z.string().min(1, cLocale.valuationAction.phoneRequired).regex(/^1[3-9]\d{9}$/, cLocale.valuationAction.phoneInvalid),
});

export async function searchCCommunitiesAction(query: string): Promise<Community[]> {
  try {
    const response = await fetch(
      getApiUrl(`${apiPaths.cCommunities.search}?q=${encodeURIComponent(query)}`)
    );
    if (!response.ok) return [];
    const data = await response.json();
    const items = data.items ?? data;
    return transformCommunitySearchSafe(items);
  } catch {
    return [];
  }
}

export async function createLeadAction(_: ActionResult<{ id: string }>, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const cookieStore = await cookies();
  const token = cookieStore.get("c_access_token")?.value;
  if (!token) {
    return createErrorResult(cLocale.common.error.loginRequired);
  }

  const raw = {
    community_id: (formData.get("community_id") as string) || null,
    community_name: formData.get("community_name") as string,
    district: (formData.get("district") as string) || null,
    business_area: (formData.get("business_area") as string) || null,
    layout: (formData.get("layout") as string) || null,
    area: formData.get("area") ? parseFloat(formData.get("area") as string) : null,
    floor_info: (formData.get("floor_info") as string) || null,
    orientation: (formData.get("orientation") as string) || null,
    remarks: (formData.get("remarks") as string) || null,
  };

  const parsed = createLeadSchema.safeParse(raw);
  if (!parsed.success) return createErrorResult(parsed.error.issues[0].message);

  try {
    const response = await fetch(getApiUrl(apiPaths.cLeads.create), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(parsed.data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return createErrorResult(errorData.detail || cLocale.valuationAction.submitFailed);
    }
    const data = await response.json();
    redirect(`/leads/${data.id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return createErrorResult(cLocale.common.error.networkRetry);
  }
}

export async function completePhoneAction(_: ActionResult<{ phone: string }>, formData: FormData): Promise<ActionResult<{ phone: string }>> {
  const cookieStore = await cookies();
  const token = cookieStore.get("c_access_token")?.value;
  if (!token) {
    return createErrorResult(cLocale.common.error.loginRequired);
  }

  const raw = { phone: (formData.get("phone") as string) || "" };
  const parsed = completePhoneSchema.safeParse(raw);
  if (!parsed.success) return createErrorResult(parsed.error.issues[0].message);

  try {
    const response = await fetch(getApiUrl(apiPaths.cUsers.phone), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ phone: parsed.data.phone }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return createErrorResult(errorData.detail || cLocale.valuationAction.phoneSubmitFailed);
    }
    const data = await response.json();
    // 重新渲染整个 (c) layout 树，触发服务端重新调用 /public/auth/me 刷新 Context
    revalidatePath("/", "layout");
    return createSuccessResult({ phone: data.phone }, cLocale.valuation.phoneSuccess);
  } catch {
    return createErrorResult(cLocale.common.error.network);
  }
}
