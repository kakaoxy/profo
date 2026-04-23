"use server";

import { cookies } from "next/headers";
import { apiPaths, getApiUrl } from "@/lib/config";

export interface CreateCommunityRequest {
  name: string;
  district?: string | null;
  business_circle?: string | null;
}

export interface CreateCommunityResponse {
  id: string;
  name: string;
  district: string | null;
  business_circle: string | null;
}

/**
 * 创建新小区
 * 如果小区已存在，则返回已存在的小区
 */
export async function createCommunityAction(
  data: CreateCommunityRequest
): Promise<CreateCommunityResponse | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("access_token")?.value;

    const response = await fetch(getApiUrl(apiPaths.communities.base), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      console.error("Create community error:", response.statusText);
      return null;
    }

    const result = await response.json();
    return result as CreateCommunityResponse;
  } catch (error) {
    console.error("Create community error:", error);
    return null;
  }
}
