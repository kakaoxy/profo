"use server";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { apiPaths } from "@/lib/config";
import { z } from "zod";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/server/require-permission";

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

export type CreateCommunityResult =
  { success: true; data: CreateCommunityResponse } | { success: false; message: string };

const createCommunitySchema = z.object({
  name: z.string().min(1, "小区名称不能为空").max(200, "小区名称最多 200 字符"),
  district: z.string().max(100, "行政区最多 100 字符").nullable().optional(),
  business_circle: z.string().max(100, "商圈最多 100 字符").nullable().optional(),
});

/**
 * 创建新小区
 * 如果小区已存在，则返回已存在的小区
 */
export async function createCommunityAction(
  data: CreateCommunityRequest,
): Promise<CreateCommunityResult> {
  const parsed = createCommunitySchema.safeParse(data);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "小区参数不合法";
    logger.warn("Create community validation error:", message);
    return { success: false, message };
  }

  const permCheck = await requirePermission(PERMISSION_CODES.LEAD_WRITE);
  if (!permCheck.ok) {
    return { success: false, message: permCheck.message };
  }

  try {
    const client = await fetchClient();
    const { data: result, error } = await client.POST(apiPaths.communities.base, {
      body: data,
    });

    if (error || !result) {
      const message = (error as { message?: string })?.message ?? "创建小区失败，请稍后重试";
      logger.error("Create community error:", error);
      return { success: false, message };
    }

    return {
      success: true,
      data: {
        id: result.id,
        name: result.name,
        district: result.district ?? null,
        business_circle: result.business_circle ?? null,
      },
    };
  } catch (error) {
    logger.error("Create community error:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
