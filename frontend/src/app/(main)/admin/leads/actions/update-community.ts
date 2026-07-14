"use server";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";

export interface UpdateCommunityRequest {
  name?: string;
  district?: string | null;
  business_circle?: string | null;
  avg_price_wan?: number | null;
  total_properties?: number | null;
  is_active?: boolean | null;
}

export interface UpdateCommunityResult {
  success: boolean;
  message?: string;
}

/**
 * 更新小区信息
 * 仅更新请求体中提供的字段（PATCH 语义）
 */
export async function updateCommunityAction(
  id: string,
  data: UpdateCommunityRequest
): Promise<UpdateCommunityResult> {
  try {
    const client = await fetchClient();
    const { error } = await client.PATCH(
      "/api/v1/admin/communities/{community_id}",
      {
        params: { path: { community_id: id } },
        body: data,
      }
    );

    if (error) {
      const errorMsg = (error as { message?: string }).message || "更新小区失败";
      logger.error("Update community error:", error);
      return { success: false, message: errorMsg };
    }

    return { success: true };
  } catch (error) {
    logger.error("Update community error:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
