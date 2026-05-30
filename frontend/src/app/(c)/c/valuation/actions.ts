"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiPaths, getApiUrl } from "@/lib/config";
import { ActionResult, createErrorResult } from "@/lib/action-result";
import { transformCommunitySearchSafe } from "@/lib/api-transforms";
import type { Community } from "@/components/common/community-select";

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
    return createErrorResult("请先登录");
  }
  const payload = {
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
  try {
    const response = await fetch(getApiUrl(apiPaths.cLeads.create), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return createErrorResult(errorData.detail || "提交失败");
    }
    const data = await response.json();
    redirect(`/c/leads/${data.id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return createErrorResult("网络错误，请稍后重试");
  }
}
