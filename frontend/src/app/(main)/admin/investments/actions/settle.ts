"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fetchClient } from "@/lib/api-server";
import { extractApiData } from "@/lib/api-helpers";
import { logger } from "@/lib/logger";
import type {
  ActionResult,
  InvestmentResponse,
  SettlementChangeRequest,
  UnsettleRequest,
} from "./types";

// 与后端 SettlementChangeRequest / UnsettleRequest Pydantic 语义对齐
const investmentIdSchema = z.string().min(1, "投资 ID 不能为空");

const settlementChangeSchema = z.object({
  settled_note: z.string().nullable().optional(),
  settled_date: z.string().min(1, "结算日期不能为空"),
});

const unsettleSchema = z.object({
  reason: z.string().min(1, "反结算原因不能为空"),
});

/**
 * 结算跟投记录（unsettled → settled）
 * 调用 POST /api/v1/admin/investments/{id}/settle。
 */
export async function settleInvestment(
  investmentId: string,
  data: SettlementChangeRequest,
): Promise<ActionResult<InvestmentResponse>> {
  const idParsed = investmentIdSchema.safeParse(investmentId);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message ?? "参数不合法",
    };
  }

  const parsed = settlementChangeSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "参数不合法",
    };
  }

  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.POST(
      "/api/v1/admin/investments/{investment_id}/settle",
      { params: { path: { investment_id: investmentId } }, body: data },
    );

    if (error) {
      const msg = (error as { message?: string }).message || "结算失败";
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
  const idParsed = investmentIdSchema.safeParse(investmentId);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message ?? "参数不合法",
    };
  }

  const parsed = unsettleSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "参数不合法",
    };
  }

  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.POST(
      "/api/v1/admin/investments/{investment_id}/unsettle",
      { params: { path: { investment_id: investmentId } }, body: data },
    );

    if (error) {
      const msg = (error as { message?: string }).message || "反结算失败";
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
