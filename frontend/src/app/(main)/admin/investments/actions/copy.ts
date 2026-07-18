"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fetchClient } from "@/lib/api-server";
import { extractApiData } from "@/lib/api-helpers";
import { logger } from "@/lib/logger";
import type {
  ActionResult,
  CopyInvestmentRequest,
  InvestmentResponse,
} from "./types";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/server/require-permission";

// 与后端 CopyInvestmentRequest Pydantic 语义对齐
const investmentIdSchema = z.string().min(1, "投资 ID 不能为空");

const copyInvestmentSchema = z.object({
  target_project_id: z.string().min(1, "目标项目 ID 不能为空"),
});

/**
 * 复制跟投配置到目标项目
 * 调用 POST /api/v1/admin/investments/{id}/copy。返回新创建的跟投记录。
 */
export async function copyInvestment(
  investmentId: string,
  data: CopyInvestmentRequest,
): Promise<ActionResult<InvestmentResponse>> {
  const idParsed = investmentIdSchema.safeParse(investmentId);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message ?? "参数不合法",
    };
  }

  const parsed = copyInvestmentSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "参数不合法",
    };
  }

  const permCheck = await requirePermission(PERMISSION_CODES.INVESTMENT_COPY);
  if (!permCheck.ok) {
    return { success: false, message: permCheck.message };
  }

  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.POST(
      "/api/v1/admin/investments/{investment_id}/copy",
      { params: { path: { investment_id: investmentId } }, body: data },
    );

    if (error) {
      const msg = (error as { message?: string }).message || "复制跟投配置失败";
      return { success: false, message: msg };
    }

    revalidatePath("/admin/investments");
    return {
      success: true,
      data: extractApiData<InvestmentResponse>(resData),
    };
  } catch (e) {
    logger.error("复制跟投配置异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
