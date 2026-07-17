"use server";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { z } from "zod";

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

const communityIdSchema = z.string().min(1, "小区 ID 不能为空");

const updateCommunitySchema = z
  .object({
    name: z
      .string()
      .min(1, "小区名称不能为空")
      .max(200, "小区名称最多 200 字符")
      .optional(),
    district: z.string().max(100, "行政区最多 100 字符").nullable().optional(),
    business_circle: z
      .string()
      .max(100, "商圈最多 100 字符")
      .nullable()
      .optional(),
    avg_price_wan: z.number().min(0, "均价不能为负数").nullable().optional(),
    total_properties: z
      .number()
      .int("房源总数必须为整数")
      .min(0, "房源总数不能为负数")
      .nullable()
      .optional(),
    is_active: z.boolean().nullable().optional(),
  })
  .partial();

/**
 * 更新小区信息
 * 仅更新请求体中提供的字段（PATCH 语义）
 */
export async function updateCommunityAction(
  id: string,
  data: UpdateCommunityRequest
): Promise<UpdateCommunityResult> {
  const idParsed = communityIdSchema.safeParse(id);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message ?? "小区参数不合法",
    };
  }

  const parsed = updateCommunitySchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "小区参数不合法",
    };
  }

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
