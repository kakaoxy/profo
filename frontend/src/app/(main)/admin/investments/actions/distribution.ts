"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fetchClient } from "@/lib/api-server";
import { extractApiData } from "@/lib/api-helpers";
import { logger } from "@/lib/logger";
import type {
  ActionResult,
  ReturnAdjustmentBatchRequest,
  ReturnAdjustmentItem,
  ReturnAdjustmentResponse,
} from "./types";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/server/require-permission";

// 与后端 ReturnAdjustmentItem Pydantic 语义对齐
// 分配比例合计 = 100% 等业务校验由后端执行
const investmentIdSchema = z.string().min(1, "投资 ID 不能为空");

const returnAdjustmentItemSchema = z.object({
  investor_id: z.string().min(1, "投资方 ID 不能为空"),
  adjusted_distribution_ratio: z.union([z.number(), z.string()]),
  remark: z.string().nullable().optional(),
});

const adjustmentsSchema = z.array(returnAdjustmentItemSchema).min(1, "调整项不能为空");

/**
 * 批量保存分配比例调整
 * 调用 PUT /api/v1/admin/investments/{id}/distribution-adjustments。
 * 校验由后端执行（分配比例合计 = 100%）。
 */
export async function adjustDistribution(
  investmentId: string,
  adjustments: ReturnAdjustmentItem[],
): Promise<ActionResult<ReturnAdjustmentResponse[]>> {
  const idParsed = investmentIdSchema.safeParse(investmentId);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message ?? "参数不合法",
    };
  }

  const parsed = adjustmentsSchema.safeParse(adjustments);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "参数不合法",
    };
  }

  const permCheck = await requirePermission(PERMISSION_CODES.INVESTMENT_WRITE);
  if (!permCheck.ok) {
    return { success: false, message: permCheck.message };
  }

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
