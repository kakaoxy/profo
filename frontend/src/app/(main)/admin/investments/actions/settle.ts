"use server";

import { revalidatePath } from "next/cache";
import { fetchClient } from "@/lib/api-server";
import { extractApiData } from "@/lib/api-helpers";
import { logger } from "@/lib/logger";
import type {
  ActionResult,
  InvestmentResponse,
  SettlementChangeRequest,
  UnsettleRequest,
} from "./types";

/**
 * 结算跟投记录（unsettled → settled）
 * 调用 POST /api/v1/admin/investments/{id}/settle。
 */
export async function settleInvestment(
  investmentId: string,
  data: SettlementChangeRequest,
): Promise<ActionResult<InvestmentResponse>> {
  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.POST(
      "/api/v1/admin/investments/{investment_id}/settle",
      { params: { path: { investment_id: investmentId } }, body: data },
    );

    if (error) {
      const msg = (error as { detail?: string }).detail || "结算失败";
      return { success: false, message: msg };
    }

    revalidatePath("/admin/investments/[projectId]", "page");
    revalidatePath("/admin/investments");
    return {
      success: true,
      data: extractApiData<InvestmentResponse>(resData),
    };
  } catch (e) {
    logger.error("结算跟投记录异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 反结算跟投记录（settled → unsettled）
 * 调用 POST /api/v1/admin/investments/{id}/unsettle。
 */
export async function unsettleInvestment(
  investmentId: string,
  data: UnsettleRequest,
): Promise<ActionResult<InvestmentResponse>> {
  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.POST(
      "/api/v1/admin/investments/{investment_id}/unsettle",
      { params: { path: { investment_id: investmentId } }, body: data },
    );

    if (error) {
      const msg = (error as { detail?: string }).detail || "反结算失败";
      return { success: false, message: msg };
    }

    revalidatePath("/admin/investments/[projectId]", "page");
    revalidatePath("/admin/investments");
    return {
      success: true,
      data: extractApiData<InvestmentResponse>(resData),
    };
  } catch (e) {
    logger.error("反结算跟投记录异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
