"use server";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { extractApiData } from "@/lib/api-helpers";
import { z } from "zod";

const mergeCommunitiesSchema = z.object({
  primaryId: z.string().min(1, "主小区 ID 不能为空"),
  mergeIds: z.array(z.string().min(1)).min(1, "至少选择 1 个待合并小区"),
});

export interface MergeResult {
  success: boolean;
  message?: string;
  affected_properties?: number;
}

interface ApiError {
  message?: string;
}

export async function mergeCommunitiesAction(
  primaryId: string,
  mergeIds: string[],
): Promise<MergeResult> {
  const parsed = mergeCommunitiesSchema.safeParse({ primaryId, mergeIds });
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "合并参数不合法",
    };
  }

  try {
    const client = await fetchClient();
    const { data, error } = await client.POST(
      "/api/v1/admin/communities/merge",
      {
        body: {
          primary_id: primaryId,
          merge_ids: mergeIds,
        },
      },
    );

    if (error) {
      // 修复：使用类型断言代替 any
      const err = error as ApiError;
      const errorMsg = err.message || "合并请求失败";
      return { success: false, message: errorMsg };
    }

    // 成功后刷新治理页面，让列表更新
    revalidatePath("/admin/properties/governance");

    const resultData = extractApiData<{
      message?: string;
      affected_properties?: number;
    }>(data);

    return {
      success: true,
      message: resultData?.message,
      affected_properties: resultData?.affected_properties,
    };
  } catch (e) {
    logger.error("合并异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
