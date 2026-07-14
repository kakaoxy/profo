"use server";

import { revalidatePath } from "next/cache";
import { fetchClient } from "@/lib/api-server";
import { extractApiData } from "@/lib/api-helpers";
import { logger } from "@/lib/logger";
import type {
  ActionResult,
  ReturnAdjustmentBatchRequest,
  ReturnAdjustmentItem,
  ReturnAdjustmentResponse,
} from "./types";

/**
 * 批量保存分配比例调整
 * 调用 PUT /api/v1/admin/investments/{id}/distribution-adjustments。
 * 校验由后端执行（分配比例合计 = 100%）。
 */
export async function adjustDistribution(
  investmentId: string,
  adjustments: ReturnAdjustmentItem[],
): Promise<ActionResult<ReturnAdjustmentResponse[]>> {
  try {
    const client = await fetchClient();
    const body: ReturnAdjustmentBatchRequest = { adjustments };
    const { data: resData, error } = await client.PUT(
      "/api/v1/admin/investments/{investment_id}/distribution-adjustments",
      { params: { path: { investment_id: investmentId } }, body },
    );

    if (error) {
      const msg = (error as { message?: string }).message || "调整分配比例失败";
      return { success: false, message: msg };
    }

    revalidatePath("/admin/investments/[projectId]", "page");
    revalidatePath("/admin/investments");
    return {
      success: true,
      data: extractApiData<ReturnAdjustmentResponse[]>(resData),
    };
  } catch (e) {
    logger.error("调整分配比例异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
