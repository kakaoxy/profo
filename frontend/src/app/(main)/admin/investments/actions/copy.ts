"use server";

import { revalidatePath } from "next/cache";
import { fetchClient } from "@/lib/api-server";
import { extractApiData } from "@/lib/api-helpers";
import { logger } from "@/lib/logger";
import type {
  ActionResult,
  CopyInvestmentRequest,
  InvestmentResponse,
} from "./types";

/**
 * 复制跟投配置到目标项目
 * 调用 POST /api/v1/admin/investments/{id}/copy。返回新创建的跟投记录。
 */
export async function copyInvestment(
  investmentId: string,
  data: CopyInvestmentRequest,
): Promise<ActionResult<InvestmentResponse>> {
  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.POST(
      "/api/v1/admin/investments/{investment_id}/copy",
      { params: { path: { investment_id: investmentId } }, body: data },
    );

    if (error) {
      const msg = (error as { detail?: string }).detail || "复制跟投配置失败";
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
